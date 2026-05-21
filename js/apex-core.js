/**
 * apex-core.js
 * Apex Fitness -- Core Module
 *
 * Responsibilities:
 *   1. Supabase client initialization
 *   2. Authentication (sign-up, sign-in, sign-out, session management)
 *   3. Profile management (CRUD + onboarding state)
 *   4. TDEE engine (Mifflin-St Jeor BMR -> PAL -> phase adjustment)
 *   5. Macro calculator (protein-first cascade by phase)
 *   6. Deload checker (scheduled + fatigue-triggered)
 *   7. Progressive overload detector (Epley 1RM + rep-ceiling logic)
 *   8. Global event bus for cross-module communication
 *
 * Usage:
 *   Load via <script src="js/apex-core.js"></script>
 *   Then access window.ApexCore from any other module.
 *
 * Dependencies:
 *   Supabase JS v2 CDN -- load BEFORE this file:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 */

'use strict';

window.ApexCore = (function () {

  // -------------------------------------------------------------------------
  // 1. CONFIGURATION
  // -------------------------------------------------------------------------

  const CONFIG = {
    SUPABASE_URL:     'https://iedeghnykrigeensamcj.supabase.co', // <- replace
    SUPABASE_ANON:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZGVnaG55a3JpZ2VlbnNhbWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzIwMTMsImV4cCI6MjA5NDUwODAxM30.xfSKLPqofpHLSKFieUepFqvbVjHGgGGC6nRn2HvMOz8',                    // <- replace
    APP_NAME:         'Apex Fitness',
    HUB_PAGE:         'hub.html',
    LOGIN_PAGE:       'index.html',

    // Scientific constants
    DELOAD_INTERVAL_WEEKS:      4,      // scheduled deload every N weeks
    DELOAD_VOLUME_MOD:          0.60,   // reduce working sets by 40 %
    DELOAD_INTENSITY_MOD:       0.85,   // reduce load by 15 %
    RPE_FATIGUE_THRESHOLD:      8.8,    // avg RPE over last 7 sessions
    RPE_SESSIONS_MIN:           3,      // min sessions needed to evaluate RPE avg
    OVERLOAD_UPPER_INCREMENT:   2.5,    // kg to add for upper-body lifts
    OVERLOAD_LOWER_INCREMENT:   5.0,    // kg to add for lower-body lifts
    MAX_DEFICIT_KCAL:           750,    // hard floor: TDEE - 750 kcal minimum intake
    LEAN_BULK_SURPLUS:          300,    // kcal above TDEE for lean bulk (intermediate+)
    BEGINNER_BULK_SURPLUS:      500,    // kcal above TDEE for beginners
    CUT_DEFICIT:                500,    // kcal below TDEE for cutting

    // Protein targets (g per kg of body/lean mass)
    PROTEIN_BULK_MAINTAIN:      2.1,    // g/kg -- optimal for anabolism
    PROTEIN_CUT:                2.5,    // g/kg -- muscle-sparing on deficit
    FAT_RATIO:                  0.25,   // 25 % of total kcal from fat (minimum)

    // Lifestyle PAL — reflects daily life activity ONLY, NOT workouts.
    // Workout contribution is calculated separately from the training split.
    PAL: {
      1: 1.20,  // sedentary  — desk job, mostly sitting, minimal walking
      2: 1.35,  // mixed      — some walking / standing throughout the day
      3: 1.55,  // active job — on feet most of the day, manual labour
    },

    // Estimated kcal burned per strength-training session (conservative average)
    KCAL_PER_TRAINING_DAY: 300,

    // Training days per week for each split (used to auto-calculate workout TDEE)
    SPLIT_TRAINING_DAYS: {
      beginner:     3,
      full_body_4:  4,
      intermediate: 4,
      strength:     4,
      ppl_3:        3,
      advanced:     6,
      body_part:    5,
    },
  };

  // -------------------------------------------------------------------------
  // 2. SUPABASE CLIENT
  // -------------------------------------------------------------------------

  let _client = null;

  function _initClient() {
    if (_client) return _client;
    if (!window.supabase) {
      throw new Error('[ApexCore] Supabase JS not loaded. Add the CDN script before apex-core.js.');
    }
    _client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON, {
      auth: {
        autoRefreshToken:  true,
        persistSession:    true,
        detectSessionInUrl: true,
      },
    });
    return _client;
  }

  function getClient() {
    return _initClient();
  }

  // -------------------------------------------------------------------------
  // 3. EVENT BUS
  // Simple pub/sub so nutrition.js, training.js, stats.js can react to
  // profile changes, auth state changes, etc. without tight coupling.
  // -------------------------------------------------------------------------

  const _bus = {};

  const Events = {
    AUTH_SIGNED_IN:       'auth:signed_in',
    AUTH_SIGNED_OUT:      'auth:signed_out',
    PROFILE_UPDATED:      'profile:updated',
    MACROS_RECALCULATED:  'macros:recalculated',
    DELOAD_TRIGGERED:     'deload:triggered',
    OVERLOAD_FLAGGED:     'overload:flagged',
    ERROR:                'core:error',
  };

  function on(event, handler) {
    if (!_bus[event]) _bus[event] = [];
    _bus[event].push(handler);
    // Return unsubscribe function
    return () => {
      _bus[event] = _bus[event].filter(h => h !== handler);
    };
  }

  function emit(event, data) {
    if (!_bus[event]) return;
    _bus[event].forEach(handler => {
      try { handler(data); }
      catch (err) { console.error(`[ApexCore] Event handler error on "${event}":`, err); }
    });
  }

  // -------------------------------------------------------------------------
  // 4. AUTHENTICATION
  // -------------------------------------------------------------------------

  const Auth = {

    /**
     * Returns the current Supabase session, or null.
     */
    async getSession() {
      const { data, error } = await getClient().auth.getSession();
      if (error) { _handleError('Auth.getSession', error); return null; }
      return data.session;
    },

    /**
     * Returns the current user object, or null.
     */
    async getUser() {
      const session = await Auth.getSession();
      return session?.user ?? null;
    },

    /**
     * Sign up a new user with email + password.
     * Creates a profile row via the profiles table after confirmation.
     * @param {string} email
     * @param {string} password
     * @returns {{ user, error }}
     */
    async signUp(email, password) {
      const { data, error } = await getClient().auth.signUp({ email, password });
      if (error) { _handleError('Auth.signUp', error); return { user: null, error }; }
      return { user: data.user, error: null };
    },

    /**
     * Sign in with email + password.
     * Redirects to HUB_PAGE on success.
     * @param {string} email
     * @param {string} password
     * @returns {{ session, error }}
     */
    async signIn(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({ email, password });
      if (error) { _handleError('Auth.signIn', error); return { session: null, error }; }
      emit(Events.AUTH_SIGNED_IN, { user: data.user });
      return { session: data.session, error: null };
    },

    /**
     * Sign in with a magic link (passwordless).
     * @param {string} email
     */
    async signInWithMagicLink(email) {
      const { error } = await getClient().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/${CONFIG.HUB_PAGE}` },
      });
      if (error) { _handleError('Auth.signInWithMagicLink', error); return { error }; }
      return { error: null };
    },

    /**
     * Sign out and redirect to login page.
     */
    async signOut() {
      const { error } = await getClient().auth.signOut();
      if (error) { _handleError('Auth.signOut', error); return; }
      emit(Events.AUTH_SIGNED_OUT, {});
      window.location.href = CONFIG.LOGIN_PAGE;
    },

    /**
     * Call this once on every page that requires authentication.
     * Redirects to login if no session exists.
     * @returns {object|null} user
     */
    async requireAuth() {
      const user = await Auth.getUser();
      if (!user) {
        window.location.href = CONFIG.LOGIN_PAGE;
        return null;
      }
      return user;
    },

    /**
     * Listen to Supabase auth state changes and emit on the internal bus.
     * Call once during app initialization.
     */
    watchSession() {
      getClient().auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN')  emit(Events.AUTH_SIGNED_IN,  { user: session?.user });
        if (event === 'SIGNED_OUT') emit(Events.AUTH_SIGNED_OUT, {});
        if (event === 'TOKEN_REFRESHED') {
          // Silently refreshed -- no UI action needed
        }
      });
    },
  };

  // -------------------------------------------------------------------------
  // 5. TDEE ENGINE
  // Science ref: Mifflin-St Jeor (1990) -- most validated for general population
  // Deviation from Katch-McArdle: requires BF% which most users won't know.
  // We fall back to Katch-McArdle automatically if body_fat_pct is available.
  // -------------------------------------------------------------------------

  const TDEE = {

    /**
     * Calculate age from a date-of-birth string.
     * @param {string} dob -- ISO date e.g. '1992-04-15'
     * @returns {number} age in whole years
     */
    calcAge(dob) {
      if (!dob) return null;
      const today = new Date();
      const birth = new Date(dob);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    },

    /**
     * Mifflin-St Jeor BMR.
     * @param {number} weightKg
     * @param {number} heightCm
     * @param {number} age
     * @param {string} sex -- 'male' | 'female' | 'other'
     * @returns {number} BMR in kcal/day (rounded to nearest integer)
     */
    mifflinBMR(weightKg, heightCm, age, sex) {
      const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
      const offset = (sex === 'male') ? +5 : -161;
      // For 'other': use average of male and female offsets = -78
      const finalOffset = (sex === 'other') ? -78 : offset;
      return Math.round(base + finalOffset);
    },

    /**
     * Katch-McArdle BMR -- more accurate when body fat % is known.
     * Formula: 370 + (21.6 x LBM)
     * @param {number} weightKg
     * @param {number} bodyFatPct -- e.g. 18.5 (percent, not decimal)
     * @returns {number} BMR in kcal/day
     */
    katchBMR(weightKg, bodyFatPct) {
      const lbm = weightKg * (1 - bodyFatPct / 100);
      return Math.round(370 + 21.6 * lbm);
    },

    /**
     * Calculate Lean Body Mass in kg.
     * Returns null if body_fat_pct is not provided.
     * @param {number} weightKg
     * @param {number|null} bodyFatPct
     */
    calcLBM(weightKg, bodyFatPct) {
      if (!bodyFatPct) return null;
      return parseFloat((weightKg * (1 - bodyFatPct / 100)).toFixed(2));
    },

    /**
     * Apply PAL multiplier to get TDEE.
     * @param {number} bmr
     * @param {number} activityLevel -- integer 1-5
     * @returns {number} TDEE in kcal/day
     */
    applyPAL(bmr, activityLevel) {
      const pal = CONFIG.PAL[activityLevel] ?? CONFIG.PAL[3];
      return Math.round(bmr * pal);
    },

    /**
     * Apply phase-specific calorie adjustment to TDEE.
     * @param {number} tdee
     * @param {'bulk'|'cut'|'maintain'} phase
     * @param {'beginner'|'intermediate'|'advanced'} experience
     * @returns {number} adjusted calorie target
     */
    applyPhase(tdee, phase, experience) {
      switch (phase) {
        case 'bulk': {
          const surplus = (experience === 'beginner')
            ? CONFIG.BEGINNER_BULK_SURPLUS
            : CONFIG.LEAN_BULK_SURPLUS;
          return tdee + surplus;
        }
        case 'cut': {
          const target = tdee - CONFIG.CUT_DEFICIT;
          // Hard floor: never drop below TDEE - MAX_DEFICIT
          return Math.max(target, tdee - CONFIG.MAX_DEFICIT_KCAL);
        }
        case 'maintain':
        default:
          return tdee;
      }
    },

    /**
     * Master TDEE calculation.
     * Chooses Katch-McArdle if body_fat_pct is present, else Mifflin-St Jeor.
     * @param {object} profile -- DB profile row
     * @returns {object} { bmr, tdee, calorieTarget, method }
     */
    calculate(profile) {
      const {
        weight_kg, height_cm, date_of_birth, sex,
        body_fat_pct, activity_level, phase, experience, preferred_split,
      } = profile;

      const age = TDEE.calcAge(date_of_birth);
      let bmr, method;

      if (body_fat_pct) {
        bmr    = TDEE.katchBMR(weight_kg, body_fat_pct);
        method = 'Katch-McArdle';
      } else {
        bmr    = TDEE.mifflinBMR(weight_kg, height_cm, age, sex);
        method = 'Mifflin-St Jeor';
      }

      // Step 1 — lifestyle-only TDEE (no workout contribution)
      const lifestylePAL  = CONFIG.PAL[activity_level] ?? CONFIG.PAL[2];
      const lifestyleTDEE = Math.round(bmr * lifestylePAL);

      // Step 2 — training contribution derived from the active split.
      // This removes the guesswork from "activity level" entirely.
      const trainingDays = CONFIG.SPLIT_TRAINING_DAYS[preferred_split]
        ?? (experience === 'advanced' ? 5 : experience === 'beginner' ? 3 : 4);
      const dailyTrainingBump = Math.round(
        (trainingDays * CONFIG.KCAL_PER_TRAINING_DAY) / 7
      );

      const tdee          = lifestyleTDEE + dailyTrainingBump;
      const calorieTarget = TDEE.applyPhase(tdee, phase, experience);

      return { bmr, tdee, lifestyleTDEE, dailyTrainingBump, trainingDays,
               calorieTarget, method };
    },
  };

  // -------------------------------------------------------------------------
  // 6. MACRO CALCULATOR
  // Priority cascade: Protein -> Fat floor -> Carbs fill remaining kcal.
  // This order is scientifically validated -- protein set first preserves
  // muscle, fat floor protects hormonal health, carbs fill the rest.
  // -------------------------------------------------------------------------

  const Macros = {

    /**
     * Calculate macro targets for a profile.
     * @param {object} profile -- DB profile row (needs weight_kg, body_fat_pct, phase, experience)
     * @param {number} calorieTarget -- from TDEE.calculate()
     * @returns {object} { proteinG, carbsG, fatG, calorieTarget }
     */
    calculate(profile, calorieTarget) {
      const { weight_kg, body_fat_pct, phase } = profile;

      // Use LBM if available, else fall back to total bodyweight
      const lbm           = TDEE.calcLBM(weight_kg, body_fat_pct);
      const refMass       = lbm ?? weight_kg;

      // Step 1 -- Protein
      const proteinRate   = (phase === 'cut')
        ? CONFIG.PROTEIN_CUT
        : CONFIG.PROTEIN_BULK_MAINTAIN;
      const proteinG      = Math.round(refMass * proteinRate);
      const proteinKcal   = proteinG * 4;

      // Step 2 -- Fat floor (25 % of total kcal minimum)
      const fatKcal       = Math.round(calorieTarget * CONFIG.FAT_RATIO);
      const fatG          = Math.round(fatKcal / 9);

      // Step 3 -- Carbs fill remaining kcal
      const remainingKcal = calorieTarget - proteinKcal - fatKcal;
      const carbsG        = Math.max(0, Math.round(remainingKcal / 4));

      // Sanity check: if remainingKcal < 0 (very low calorie cut),
      // scale back protein slightly to maintain fat floor.
      if (remainingKcal < 0) {
        const adjustedProteinKcal = calorieTarget - fatKcal;
        const adjustedProteinG    = Math.max(0, Math.round(adjustedProteinKcal / 4));
        return {
          proteinG:      adjustedProteinG,
          carbsG:        0,
          fatG,
          calorieTarget,
          _warning: 'Calorie target very low -- carbs zeroed, protein reduced to maintain fat floor.',
        };
      }

      return { proteinG, carbsG, fatG, calorieTarget };
    },

    /**
     * Compute macros from an array of meal items (for live nutrition tab totals).
     * Each item must have: quantity_g, and its food must have protein_g, carbs_g, fat_g, kcal
     * (all values per 100g in the foods table).
     * @param {Array} items -- array of { quantity_g, food: { protein_g, carbs_g, fat_g, kcal } }
     * @returns {{ proteinG, carbsG, fatG, kcal }}
     */
    sumItems(items) {
      return items.reduce((acc, item) => {
        const ratio      = item.quantity_g / 100;
        acc.proteinG    += item.food.protein_g * ratio;
        acc.carbsG      += item.food.carbs_g   * ratio;
        acc.fatG        += item.food.fat_g      * ratio;
        acc.kcal        += item.food.kcal       * ratio;
        return acc;
      }, { proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 });
    },

    /**
     * Format macro totals for display (rounds to 1 decimal).
     * @param {{ proteinG, carbsG, fatG, kcal }} totals
     * @returns {{ proteinG, carbsG, fatG, kcal }} -- all rounded
     */
    format(totals) {
      return {
        proteinG: Math.round(totals.proteinG * 10) / 10,
        carbsG:   Math.round(totals.carbsG   * 10) / 10,
        fatG:     Math.round(totals.fatG     * 10) / 10,
        kcal:     Math.round(totals.kcal),
      };
    },
  };

  // -------------------------------------------------------------------------
  // 7. PROFILE MANAGEMENT
  // -------------------------------------------------------------------------

  const Profile = {

    /**
     * Fetch the current user's profile row.
     * @returns {object|null}
     */
    async get() {
      const user = await Auth.getUser();
      if (!user) return null;

      const { data, error } = await getClient()
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();   // returns null (no error) when row does not exist

      if (error) { _handleError('Profile.get', error); return null; }
      return data;        // null for new users, profile object otherwise
    },

    /**
     * Create the initial profile row for a new user.
     * Called after Auth.signUp() once the user confirms their email.
     * @param {object} fields -- partial profile data
     * @returns {{ data, error }}
     */
    async create(fields) {
      const user = await Auth.getUser();
      if (!user) return { data: null, error: new Error('Not authenticated') };

      const { data, error } = await getClient()
        .from('profiles')
        .insert({ id: user.id, ...fields })
        .select()
        .single();

      if (error) { _handleError('Profile.create', error); return { data: null, error }; }
      return { data, error: null };
    },

    /**
     * Update profile fields, then recalculate and persist TDEE + macros.
     * Emits PROFILE_UPDATED and MACROS_RECALCULATED on success.
     * @param {object} fields -- any subset of profile columns
     * @returns {{ data, macros, error }}
     */
    async update(fields) {
      const user = await Auth.getUser();
      if (!user) return { data: null, macros: null, error: new Error('Not authenticated') };

      // Merge with existing profile for TDEE recalculation.
      // For brand-new users there is no row yet -- that is fine, upsert creates it.
      const existing = await Profile.get();
      const merged   = { ...existing, ...fields, id: user.id };

      const tdeeResult  = TDEE.calculate(merged);
      const macroResult = Macros.calculate(merged, tdeeResult.calorieTarget);

      const payload = {
        id: user.id,          // required so upsert knows which row to match
        ...fields,
        tdee:             tdeeResult.tdee,
        calorie_target:   macroResult.calorieTarget,
        protein_target_g: macroResult.proteinG,
        carb_target_g:    macroResult.carbsG,
        fat_target_g:     macroResult.fatG,
      };

      const { data, error } = await getClient()
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })  // insert if new, update if exists
        .select()
        .single();

      if (error) { _handleError('Profile.update', error); return { data: null, macros: null, error }; }

      // Bust the cache so getCached() returns fresh data immediately
      Profile.invalidateCache();

      emit(Events.PROFILE_UPDATED,     { profile: data });
      emit(Events.MACROS_RECALCULATED, { ...macroResult, tdee: tdeeResult.tdee });

      return { data, macros: macroResult, error: null };
    },

    /**
     * Mark onboarding as complete and generate the user's first program.
     * @returns {{ error }}
     */
    async completeOnboarding() {
      const { error } = await Profile.update({ onboarding_done: true });
      if (error) return { error };
      // Redirect to hub after a short delay (let emit handlers finish)
      setTimeout(() => { window.location.href = CONFIG.HUB_PAGE; }, 300);
      return { error: null };
    },

    /**
     * Convenience: get cached profile from localStorage if fresh (< 5 min old),
     * else fetch from Supabase and re-cache.
     * Keeps UI snappy on initial load without a round-trip.
     * @returns {object|null}
     */
    async getCached() {
      const CACHE_KEY = 'apex_profile_cache';
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null');
        if (cached && (Date.now() - cached._ts) < CACHE_TTL) {
          return cached.profile;
        }
      } catch (_) { /* corrupt cache -- fall through */ }

      const profile = await Profile.get();
      if (profile) {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ profile, _ts: Date.now() }));
      }
      return profile;
    },

    /**
     * Invalidate the session cache. Call after any update.
     */
    invalidateCache() {
      sessionStorage.removeItem('apex_profile_cache');
    },
  };

  // -------------------------------------------------------------------------
  // 8. DELOAD CHECKER
  // Two trigger types:
  //   A) Scheduled -- every DELOAD_INTERVAL_WEEKS weeks (time-based)
  //   B) Auto -- fatigue signals detected in recent session data
  // -------------------------------------------------------------------------

  const Deload = {

    /**
     * Check whether the current week should be a deload.
     * Call once per week (e.g. on app load / Monday).
     * @param {string} programId -- UUID of the active program
     * @returns {{ shouldDeload, reason, weekData }}
     */
    async check(programId) {
      const result = {
        shouldDeload: false,
        reason:       null,
        weekData:     null,
      };

      // -- A) Scheduled deload check --------------------------------------
      const scheduled = await Deload._checkScheduled(programId);
      if (scheduled.isDeload) {
        result.shouldDeload = true;
        result.reason       = 'scheduled';
        result.weekData     = scheduled.weekData;
        emit(Events.DELOAD_TRIGGERED, { type: 'scheduled', programId });
        return result;
      }

      // -- B) Fatigue-triggered deload check -----------------------------
      const fatigue = await Deload._checkFatigue();
      if (fatigue.triggered) {
        result.shouldDeload = true;
        result.reason       = fatigue.reason;
        emit(Events.DELOAD_TRIGGERED, { type: 'fatigue', reason: fatigue.reason, programId });
        return result;
      }

      return result;
    },

    /**
     * @private
     * Check if the current week in the active program is already flagged as a deload.
     */
    async _checkScheduled(programId) {
      // Get today's week number relative to program start
      const { data: program, error: progErr } = await getClient()
        .from('programs')
        .select('start_date, deload_interval')
        .eq('id', programId)
        .single();

      if (progErr || !program) return { isDeload: false, weekData: null };

      const weekNum = _weeksSinceDate(program.start_date) + 1;
      const interval = program.deload_interval ?? CONFIG.DELOAD_INTERVAL_WEEKS;
      const isScheduled = (weekNum % interval === 0);

      if (!isScheduled) return { isDeload: false, weekData: null };

      // Fetch or create the program_week row for this week
      const { data: weekData } = await getClient()
        .from('program_weeks')
        .select('*')
        .eq('program_id', programId)
        .eq('week_number', weekNum)
        .single();

      return { isDeload: !!weekData?.is_deload, weekData };
    },

    /**
     * @private
     * Evaluate recent session data for three fatigue signals.
     * Signal A: avg RPE > threshold over last N sessions
     * Signal B: body weight spike during a cut (> 0.5 kg in 7 days)
     * Signal C: consecutive sessions with incomplete sets
     */
    async _checkFatigue() {
      const user = await Auth.getUser();
      if (!user) return { triggered: false };

      // Signal A -- RPE average
      const { data: recentLogs } = await getClient()
        .from('workout_logs')
        .select('rpe_overall, log_date')
        .eq('user_id', user.id)
        .not('rpe_overall', 'is', null)
        .order('log_date', { ascending: false })
        .limit(7);

      if (recentLogs && recentLogs.length >= CONFIG.RPE_SESSIONS_MIN) {
        const avgRPE = recentLogs.reduce((s, l) => s + l.rpe_overall, 0) / recentLogs.length;
        if (avgRPE > CONFIG.RPE_FATIGUE_THRESHOLD) {
          return {
            triggered: true,
            reason:    `High fatigue: avg RPE ${avgRPE.toFixed(1)} over last ${recentLogs.length} sessions`,
          };
        }
      }

      // Signal B -- body weight spike on cut
      const profile = await Profile.get();
      if (profile?.phase === 'cut') {
        const { data: weightLogs } = await getClient()
          .from('weight_logs')
          .select('weight_kg, log_date')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false })
          .limit(7);

        if (weightLogs && weightLogs.length >= 2) {
          const newest = weightLogs[0].weight_kg;
          const oldest = weightLogs[weightLogs.length - 1].weight_kg;
          const delta  = newest - oldest;
          if (delta > 0.5) {
            return {
              triggered: true,
              reason:    `Weight spike on cut: +${delta.toFixed(1)} kg in ${weightLogs.length} days (possible water retention/overtraining)`,
            };
          }
        }
      }

      // Signal C -- consecutive incomplete sessions
      // We define "incomplete" as: a workout_log with notes containing 'incomplete'
      // OR fewer set_logs than planned. For simplicity here we check a notes flag --
      // training.js should write 'incomplete' to notes when the user exits early.
      const { data: incompleteLogs } = await getClient()
        .from('workout_logs')
        .select('id, notes, log_date')
        .eq('user_id', user.id)
        .ilike('notes', '%incomplete%')
        .order('log_date', { ascending: false })
        .limit(3);

      if (incompleteLogs && incompleteLogs.length >= 2) {
        return {
          triggered: true,
          reason:    `${incompleteLogs.length} consecutive incomplete sessions -- accumulated fatigue likely`,
        };
      }

      return { triggered: false };
    },

    /**
     * Insert a deload week into program_weeks for the given program.
     * Can be called from training.js when a deload is confirmed.
     * @param {string} programId
     * @param {number} weekNumber
     * @returns {{ data, error }}
     */
    async insertDeloadWeek(programId, weekNumber) {
      const { data, error } = await getClient()
        .from('program_weeks')
        .upsert({
          program_id:    programId,
          week_number:   weekNumber,
          is_deload:     true,
          volume_mod:    CONFIG.DELOAD_VOLUME_MOD,
          intensity_mod: CONFIG.DELOAD_INTENSITY_MOD,
        }, { onConflict: 'program_id,week_number' })
        .select()
        .single();

      if (error) { _handleError('Deload.insertDeloadWeek', error); return { data: null, error }; }
      return { data, error: null };
    },
  };

  // -------------------------------------------------------------------------
  // 9. PROGRESSIVE OVERLOAD DETECTOR
  // Epley formula: estimated_1RM = weight x (1 + reps / 30)
  // Overload flag: user hit reps_max at RPE <= 8.5 -> ready to progress
  // Plateau flag:  user hit reps_max at RPE > 9.0 for 2+ consecutive sessions
  // -------------------------------------------------------------------------

  const Overload = {

    /**
     * Epley estimated 1-Rep Max.
     * @param {number} weightKg
     * @param {number} reps
     * @returns {number} estimated 1RM in kg (rounded to 0.5 kg)
     */
    epley1RM(weightKg, reps) {
      if (reps === 1) return weightKg;
      const raw = weightKg * (1 + reps / 30);
      return Math.round(raw * 2) / 2; // round to nearest 0.5 kg
    },

    /**
     * Determine the appropriate load increment for a given exercise.
     * Upper-body lifts use smaller increments than lower-body.
     * @param {string} muscleGroup -- e.g. 'chest', 'quads', 'hamstrings'
     * @returns {number} kg increment
     */
    increment(muscleGroup) {
      const lowerBody = ['quads', 'hamstrings', 'glutes', 'calves'];
      return lowerBody.includes(muscleGroup)
        ? CONFIG.OVERLOAD_LOWER_INCREMENT
        : CONFIG.OVERLOAD_UPPER_INCREMENT;
    },

    /**
     * Evaluate a single completed set and return an overload recommendation.
     * Call after each set is logged; training.js displays the flag in UI.
     * @param {object} params
     * @param {number} params.weightKg       -- weight used
     * @param {number} params.reps           -- reps completed
     * @param {number} params.rpe            -- RPE for this set
     * @param {number} params.repsMax        -- top of the prescribed rep range
     * @param {string} params.muscleGroup    -- primary muscle group of the exercise
     * @returns {{ flag: 'progress'|'plateau'|null, nextWeightKg, message }}
     */
    evaluate({ weightKg, reps, rpe, repsMax, muscleGroup }) {
      const hitCeiling   = reps >= repsMax;
      const comfortable  = rpe <= 8.5;
      const struggling   = rpe > 9.0;
      const inc          = Overload.increment(muscleGroup);

      if (hitCeiling && comfortable) {
        return {
          flag:         'progress',
          nextWeightKg: weightKg + inc,
          message:      `Ready to progress -- add ${inc} kg next session`,
        };
      }

      if (hitCeiling && struggling) {
        return {
          flag:         'plateau',
          nextWeightKg: weightKg,
          message:      'Ceiling hit but high RPE -- hold weight, check technique',
        };
      }

      return { flag: null, nextWeightKg: weightKg, message: null };
    },

    /**
     * Upsert a PR record into strength_prs after a working set.
     * Computes and stores estimated_1rm using Epley.
     * Only writes if this is a new all-time 1RM for this exercise.
     * @param {string} exerciseId -- UUID
     * @param {number} weightKg
     * @param {number} reps
     * @returns {{ data, isPR, error }}
     */
    async upsertPR(exerciseId, weightKg, reps) {
      const user = await Auth.getUser();
      if (!user) return { data: null, isPR: false, error: new Error('Not authenticated') };

      const estimated1RM = Overload.epley1RM(weightKg, reps);

      // Fetch current best 1RM for this exercise
      const { data: existing } = await getClient()
        .from('strength_prs')
        .select('estimated_1rm')
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId)
        .order('estimated_1rm', { ascending: false })
        .limit(1)
        .single();

      const currentBest = existing?.estimated_1rm ?? 0;
      const isPR        = estimated1RM > currentBest;

      // Always upsert today's entry; only flag as PR if it beats the record
      const today = _isoToday();
      const { data, error } = await getClient()
        .from('strength_prs')
        .upsert({
          user_id:        user.id,
          exercise_id:    exerciseId,
          pr_date:        today,
          weight_kg:      weightKg,
          reps,
          estimated_1rm:  estimated1RM,
        }, { onConflict: 'user_id,exercise_id,pr_date' })
        .select()
        .single();

      if (error) { _handleError('Overload.upsertPR', error); return { data: null, isPR: false, error }; }

      if (isPR) {
        emit(Events.OVERLOAD_FLAGGED, {
          exerciseId,
          estimated1RM,
          previousBest: currentBest,
          delta:        estimated1RM - currentBest,
        });
      }

      return { data, isPR, error: null };
    },

    /**
     * Fetch the progressive overload trend for an exercise -- used in Stats tab charts.
     * Returns chronologically sorted estimated_1rm values.
     * @param {string} exerciseId -- UUID
     * @param {number} [limitWeeks=12] -- how many weeks of history to fetch
     * @returns {Array<{ pr_date, weight_kg, reps, estimated_1rm }>}
     */
    async getTrend(exerciseId, limitWeeks = 12) {
      const user = await Auth.getUser();
      if (!user) return [];

      const since = new Date();
      since.setDate(since.getDate() - limitWeeks * 7);

      const { data, error } = await getClient()
        .from('strength_prs')
        .select('pr_date, weight_kg, reps, estimated_1rm')
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId)
        .gte('pr_date', since.toISOString().slice(0, 10))
        .order('pr_date', { ascending: true });

      if (error) { _handleError('Overload.getTrend', error); return []; }
      return data ?? [];
    },
  };

  // -------------------------------------------------------------------------
  // 10. UTILITY HELPERS
  // -------------------------------------------------------------------------

  /**
   * Return ISO date string for today (YYYY-MM-DD, local time).
   */
  function _isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Calculate whole weeks elapsed since a given ISO date.
   * @param {string} isoDate -- 'YYYY-MM-DD'
   * @returns {number}
   */
  function _weeksSinceDate(isoDate) {
    const start = new Date(isoDate);
    const now   = new Date();
    const diffMs   = now - start;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7);
  }

  /**
   * Centralized error handler.
   * Logs to console and emits on the bus (UI can listen to show a toast).
   * @param {string} source -- module.method label
   * @param {Error|object} error
   */
  function _handleError(source, error) {
    const message = error?.message ?? String(error);
    console.error(`[ApexCore] ${source}:`, error);
    emit(Events.ERROR, { source, message });
  }

  // -------------------------------------------------------------------------
  // 11. INITIALIZATION
  // -------------------------------------------------------------------------

  /**
   * Initialize ApexCore.
   * Call once in hub.html after the Supabase CDN script has loaded.
   * - Starts the auth state watcher
   * - Checks for an existing session
   * @param {object} [overrides] -- optional CONFIG overrides for your deployment
   * @returns {object} the public API
   */
  async function init(overrides = {}) {
    if (overrides.url)  overrides.SUPABASE_URL  = overrides.url;
    if (overrides.anon) overrides.SUPABASE_ANON = overrides.anon;
    Object.assign(CONFIG, overrides);
    _initClient();
    Auth.watchSession();
    const user = await Auth.getUser();
    if (user) emit(Events.AUTH_SIGNED_IN, { user });
    console.log(`[ApexCore] Initialized -- ${CONFIG.APP_NAME}`);
    return PublicAPI;
  }

  // -------------------------------------------------------------------------
  // 12. PUBLIC API
  // -------------------------------------------------------------------------

  const PublicAPI = {
    init,
    getClient,
    Events,
    on,
    emit,
    Auth,
    Profile,
    TDEE,
    Macros,
    Deload,
    Overload,
    CONFIG,
    // Expose helpers for use in other modules
    utils: { isoToday: _isoToday, weeksSinceDate: _weeksSinceDate },
  };

  return PublicAPI;

})();
