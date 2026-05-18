/**
 * stats.js
 * Apex Fitness — Stats & Tracking Module
 *
 * Responsibilities:
 *   1. CONFIG_S        — constants: moving-average window, kcal-per-kg, chart palette
 *   2. WeightStats     — body weight log + trend analysis
 *   3. StrengthStats   — 1RM trend + PR summary across all tracked exercises
 *   4. CalorieBalance  — daily surplus/deficit from logged kcal vs TDEE
 *   5. TrainingStats   — session history, weekly volume, training streak
 *   6. BodyComposition — FFMI, lean-mass change, bulk-rate assessment (all pure)
 *   7. Dashboard       — single parallel fetch that assembles the full Stats tab
 *   8. ChartHelpers    — pure Chart.js dataset shapers (no DOM, fully testable)
 *
 * All section headers marked PURE are fully testable without Supabase or DOM.
 *
 * Dependencies (load before this file):
 *   <script src="...supabase.min.js"></script>
 *   <script src="js/apex-core.js"></script>
 *   <script src="js/nutrition.js"></script>  ← for MealPlan.getWeekSummary
 *   <script src="js/stats.js"></script>
 */

'use strict';

window.ApexStats = (function () {

  if (!window.ApexCore) {
    throw new Error('[ApexStats] apex-core.js must be loaded before stats.js');
  }
  const Core = window.ApexCore;

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CONFIG_S
  // ─────────────────────────────────────────────────────────────────────────

  const CONFIG_S = {
    MOVING_AVG_WINDOW:   7,      // days — smooths daily weight noise
    KCAL_PER_KG:      7700,      // theoretical kcal = 1 kg body mass change
    HISTORY_DAYS:       90,      // default lookback for history fetches
    STREAK_GAP_DAYS:     1,      // max gap (rest day) before streak resets
    MIN_LOGS_FOR_TREND:  3,      // minimum weight entries before showing trend line

    // Natural upper bounds for body-composition alerts
    FFMI_NATURAL_LIMIT:     25,  // Normalised FFMI — widely cited drug-free ceiling
    BULK_RATE_MAX_KG_MONTH:  1,  // > 1 kg/month on a bulk → likely excess fat gain

    // Chart.js colour tokens — consistent across all charts in the tab
    COLORS: {
      weight:       '#1D9E75',   // teal accent
      movingAvg:    '#0F6E56',   // darker teal
      strength:     '#378ADD',   // blue
      surplus:      '#1D9E75',   // green-teal for positive balance
      deficit:      '#E24B4A',   // red for negative balance
      protein:      '#1D9E75',
      carbs:        '#378ADD',
      fat:          '#BA7517',
      volume:       '#7F77DD',   // purple for set volume
      cardio:       '#D85A30',   // coral for cardio minutes
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2. WEIGHT STATS
  // ─────────────────────────────────────────────────────────────────────────

  const WeightStats = {

    // ── Supabase operations ──────────────────────────────────────────────

    /**
     * Log today's body weight.
     * Upserts on (user_id, log_date) so logging twice in a day updates the entry.
     * @param {number} weightKg
     * @param {string} [notes]
     * @returns {{ data, error }}
     */
    async log(weightKg, notes = null) {
      const user = await Core.Auth.getUser();
      if (!user) return { data: null, error: new Error('Not authenticated') };

      if (typeof weightKg !== 'number' || weightKg <= 0 || weightKg > 500) {
        return { data: null, error: new Error('weightKg must be a positive number ≤ 500') };
      }

      const { data, error } = await Core.getClient()
        .from('weight_logs')
        .upsert(
          { user_id: user.id, log_date: Core.utils.isoToday(), weight_kg: weightKg, notes },
          { onConflict: 'user_id,log_date' }
        )
        .select()
        .single();

      return { data, error };
    },

    /**
     * Fetch weight log history, most-recent first.
     * @param {number} [days=90]
     * @returns {Array<{ log_date, weight_kg, notes }>}
     */
    async getHistory(days = CONFIG_S.HISTORY_DAYS) {
      const user = await Core.Auth.getUser();
      if (!user) return [];

      const since = _daysAgoIso(days);
      const { data, error } = await Core.getClient()
        .from('weight_logs')
        .select('log_date, weight_kg, notes')
        .eq('user_id', user.id)
        .gte('log_date', since)
        .order('log_date', { ascending: true }); // ascending for chart rendering

      if (error) { console.error('[ApexStats] WeightStats.getHistory:', error); return []; }
      return data ?? [];
    },

    /**
     * Return the single most recent weight log entry.
     * @returns {{ log_date, weight_kg, notes }|null}
     */
    async getLatest() {
      const user = await Core.Auth.getUser();
      if (!user) return null;

      const { data } = await Core.getClient()
        .from('weight_logs')
        .select('log_date, weight_kg, notes')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false })
        .limit(1)
        .single();

      return data ?? null;
    },

    // ── PURE analytics ───────────────────────────────────────────────────

    /**
     * Compute a centred N-day simple moving average over an array of values.
     * Uses a trailing window (not centred) for real-time data — the last N
     * values average into each point. Points with fewer than N predecessors
     * use however many are available (expanding window at the start).
     *
     * @param {number[]} values   — ordered oldest → newest
     * @param {number}   window   — number of periods
     * @returns {number[]}         — same length as input, rounded to 2dp
     */
    movingAverage(values, window = CONFIG_S.MOVING_AVG_WINDOW) {
      if (!values || values.length === 0) return [];
      return values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - window + 1), i + 1);
        const avg   = slice.reduce((s, v) => s + v, 0) / slice.length;
        return Math.round(avg * 100) / 100;
      });
    },

    /**
     * Group daily weight logs by ISO week and compute the mean weight per week.
     * Returns entries sorted oldest → newest.
     *
     * @param {Array<{ log_date: string, weight_kg: number }>} logs
     * @returns {Array<{ week: string, avgKg: number, entries: number }>}
     */
    weeklyAverages(logs) {
      if (!logs || logs.length === 0) return [];

      const byWeek = new Map();
      for (const entry of logs) {
        const week = _isoWeek(entry.log_date);
        if (!byWeek.has(week)) byWeek.set(week, []);
        byWeek.get(week).push(entry.weight_kg);
      }

      return Array.from(byWeek.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, weights]) => ({
          week,
          avgKg:   Math.round((weights.reduce((s, w) => s + w, 0) / weights.length) * 100) / 100,
          entries: weights.length,
        }));
    },

    /**
     * Derive trend metrics from a set of weight logs.
     * Returns null fields when there is insufficient data.
     *
     * @param {Array<{ log_date: string, weight_kg: number }>} logs — oldest → newest
     * @returns {{
     *   firstKg, latestKg, totalChangeKg, totalChangePct,
     *   weeklyRateKg,
     *   movingAvg: number[],
     *   weeklyAverages: Array,
     *   hasEnoughData: boolean,
     *   direction: 'up'|'down'|'stable'
     * }}
     */
    trends(logs) {
      const empty = {
        firstKg: null, latestKg: null, totalChangeKg: null, totalChangePct: null,
        weeklyRateKg: null, movingAvg: [], weeklyAverages: [], hasEnoughData: false,
        direction: 'stable',
      };
      if (!logs || logs.length < 2) return { ...empty, hasEnoughData: false };

      const firstKg  = logs[0].weight_kg;
      const latestKg = logs[logs.length - 1].weight_kg;
      const totalChangeKg  = Math.round((latestKg - firstKg) * 100) / 100;
      const totalChangePct = Math.round((totalChangeKg / firstKg) * 1000) / 10; // 1dp %

      // Rate: total change / weeks elapsed
      const daysDiff  = _daysBetween(logs[0].log_date, logs[logs.length - 1].log_date);
      const weeksDiff = Math.max(1, daysDiff / 7);
      const weeklyRateKg = Math.round((totalChangeKg / weeksDiff) * 100) / 100;

      const values    = logs.map(l => l.weight_kg);
      const movingAvg = WeightStats.movingAverage(values, CONFIG_S.MOVING_AVG_WINDOW);
      const weekly    = WeightStats.weeklyAverages(logs);

      const ABS_STABLE_THRESHOLD = 0.1; // kg/week — below this = stable
      const direction =
        Math.abs(weeklyRateKg) < ABS_STABLE_THRESHOLD ? 'stable' :
        weeklyRateKg > 0 ? 'up' : 'down';

      return {
        firstKg,
        latestKg,
        totalChangeKg,
        totalChangePct,
        weeklyRateKg,
        movingAvg,
        weeklyAverages: weekly,
        hasEnoughData:  logs.length >= CONFIG_S.MIN_LOGS_FOR_TREND,
        direction,
      };
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. STRENGTH STATS
  // ─────────────────────────────────────────────────────────────────────────

  const StrengthStats = {

    // ── Supabase operations ──────────────────────────────────────────────

    /**
     * Fetch all tracked exercises for this user, with their first and best 1RM.
     * Used to render the PR summary table in the Stats tab.
     * @returns {Array<{ exerciseId, name, firstKg, bestKg, latestKg, deltaKg, prDate }>}
     */
    async getPRSummary() {
      const user = await Core.Auth.getUser();
      if (!user) return [];

      const { data, error } = await Core.getClient()
        .from('strength_prs')
        .select(`
          exercise_id,
          pr_date,
          estimated_1rm,
          weight_kg,
          reps,
          exercises ( name, muscle_primary )
        `)
        .eq('user_id', user.id)
        .order('pr_date', { ascending: true });

      if (error) { console.error('[ApexStats] StrengthStats.getPRSummary:', error); return []; }

      // Group by exercise, compute first / best / latest
      const byExercise = new Map();
      for (const row of (data ?? [])) {
        const id = row.exercise_id;
        if (!byExercise.has(id)) {
          byExercise.set(id, {
            exerciseId: id,
            name:       row.exercises?.name ?? 'Unknown',
            muscle:     row.exercises?.muscle_primary ?? null,
            entries:    [],
          });
        }
        byExercise.get(id).entries.push(row);
      }

      return Array.from(byExercise.values()).map(ex => {
        const trend = StrengthStats.deltaFromFirst(ex.entries.map(e => ({
          date:         e.pr_date,
          estimated1rm: e.estimated_1rm,
        })));
        return { exerciseId: ex.exerciseId, name: ex.name, muscle: ex.muscle, ...trend };
      });
    },

    /**
     * Fetch the 1RM trend for one exercise — delegates to Core.Overload.getTrend.
     * Convenience wrapper so Stats tab doesn't need to import Core directly.
     * @param {string} exerciseId
     * @param {number} [limitWeeks=12]
     * @returns {Array<{ pr_date, estimated_1rm }>}
     */
    async getExerciseTrend(exerciseId, limitWeeks = 12) {
      return Core.Overload.getTrend(exerciseId, limitWeeks);
    },

    // ── PURE analytics ───────────────────────────────────────────────────

    /**
     * Compute delta metrics from a chronological 1RM trend array.
     * @param {Array<{ date: string, estimated1rm: number }>} trend
     * @returns {{ firstKg, latestKg, bestKg, deltaKg, deltaPct, prDate }}
     */
    deltaFromFirst(trend) {
      if (!trend || trend.length === 0) {
        return { firstKg: null, latestKg: null, bestKg: null, deltaKg: null, deltaPct: null, prDate: null };
      }
      const first  = trend[0].estimated1rm;
      const latest = trend[trend.length - 1].estimated1rm;
      const best   = Math.max(...trend.map(t => t.estimated1rm));
      const prEntry = trend.find(t => t.estimated1rm === best);
      const deltaKg  = Math.round((latest - first) * 100) / 100;
      const deltaPct = first > 0 ? Math.round((deltaKg / first) * 1000) / 10 : null;
      return {
        firstKg:  first,
        latestKg: latest,
        bestKg:   best,
        deltaKg,
        deltaPct,
        prDate:   prEntry?.date ?? null,
      };
    },

    /**
     * Return the top N exercises by absolute 1RM gain (kg).
     * Useful for the "biggest improvements" summary card.
     * @param {Array} summary — output of getPRSummary()
     * @param {number} [n=5]
     * @returns {Array} sorted descending by deltaKg
     */
    topMovers(summary, n = 5) {
      return [...summary]
        .filter(ex => ex.deltaKg !== null)
        .sort((a, b) => (b.deltaKg ?? 0) - (a.deltaKg ?? 0))
        .slice(0, n);
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4. CALORIE BALANCE
  // ─────────────────────────────────────────────────────────────────────────

  const CalorieBalance = {

    // ── Supabase operations ──────────────────────────────────────────────

    /**
     * Build a daily calorie balance array by joining:
     *   - Logged kcal per day (meal_plans via ApexNutrition.MealPlan.getWeekSummary)
     *   - The user's TDEE target from their profile
     *
     * Days without a meal_plan entry are excluded (honest gap vs. zero-intake assumption).
     *
     * @param {number} [days=30]
     * @returns {Array<{ date, eaten, tdee, balance, target }>}
     *   balance = eaten - tdee  (positive = surplus, negative = deficit)
     */
    async getDailyBalance(days = 30) {
      const [profile, weekData] = await Promise.all([
        Core.Profile.getCached(),
        // ApexNutrition may not be loaded in all contexts — guard with window check
        window.ApexNutrition
          ? window.ApexNutrition.MealPlan.getWeekSummary(days)
          : [],
      ]);

      const tdee   = profile?.tdee            ?? 0;
      const target = profile?.calorie_target  ?? tdee;

      return weekData.map(day => ({
        date:    day.date,
        eaten:   day.kcal,
        tdee,
        target,
        balance: Math.round(day.kcal - tdee),
      }));
    },

    /**
     * Aggregate daily balance entries into ISO-week buckets.
     * @param {Array<{ date, eaten, tdee, balance }>} dailyEntries
     * @returns {Array<{ week, avgBalance, totalEaten, totalTdee, days }>}
     */
    getWeeklyBalance(dailyEntries) {
      if (!dailyEntries || dailyEntries.length === 0) return [];

      const byWeek = new Map();
      for (const entry of dailyEntries) {
        const week = _isoWeek(entry.date);
        if (!byWeek.has(week)) byWeek.set(week, []);
        byWeek.get(week).push(entry);
      }

      return Array.from(byWeek.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, entries]) => {
          const totalBalance = entries.reduce((s, e) => s + e.balance, 0);
          return {
            week,
            avgBalance:  Math.round(totalBalance / entries.length),
            totalEaten:  Math.round(entries.reduce((s, e) => s + e.eaten, 0)),
            totalTdee:   Math.round(entries.reduce((s, e) => s + e.tdee, 0)),
            days:        entries.length,
          };
        });
    },

    // ── PURE analytics ───────────────────────────────────────────────────

    /**
     * Summarise an array of daily balance entries.
     * @param {Array<{ balance, eaten, tdee, target }>} entries
     * @returns {{
     *   avgDailyBalance,   — mean kcal surplus (+) or deficit (-)
     *   avgEaten,
     *   adherencePct,      — days within ±200 kcal of target / total days
     *   surplusDays,
     *   deficitDays,
     *   projectedKgPerWeek — theoretical body mass change
     * }}
     */
    summary(entries) {
      const empty = {
        avgDailyBalance: 0, avgEaten: 0, adherencePct: 0,
        surplusDays: 0, deficitDays: 0, projectedKgPerWeek: 0,
      };
      if (!entries || entries.length === 0) return empty;

      const n              = entries.length;
      const totalBalance   = entries.reduce((s, e) => s + e.balance, 0);
      const totalEaten     = entries.reduce((s, e) => s + e.eaten,   0);
      const avgDailyBalance = Math.round(totalBalance / n);
      const avgEaten        = Math.round(totalEaten   / n);

      const ADHERENCE_WINDOW = 200; // kcal either side of target
      const onTarget = entries.filter(e =>
        Math.abs(e.eaten - (e.target ?? e.tdee)) <= ADHERENCE_WINDOW
      ).length;
      const adherencePct   = Math.round((onTarget / n) * 100);
      const surplusDays    = entries.filter(e => e.balance > 0).length;
      const deficitDays    = entries.filter(e => e.balance < 0).length;
      const projectedKgPerWeek = CalorieBalance.projectedWeightChange(avgDailyBalance, 7);

      return { avgDailyBalance, avgEaten, adherencePct, surplusDays, deficitDays, projectedKgPerWeek };
    },

    /**
     * Theoretical body mass change from a sustained average daily kcal balance.
     * Based on the 7700 kcal ≈ 1 kg model (Atwater, widely used in practice).
     * Positive result = expected gain, negative = expected loss.
     *
     * @param {number} avgDailyKcal — mean daily surplus (+) or deficit (-)
     * @param {number} days         — projection window
     * @returns {number} kg — rounded to 2dp
     */
    projectedWeightChange(avgDailyKcal, days) {
      const totalKcal  = avgDailyKcal * days;
      const kg         = totalKcal / CONFIG_S.KCAL_PER_KG;
      return Math.round(kg * 100) / 100;
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 5. TRAINING STATS
  // ─────────────────────────────────────────────────────────────────────────

  const TrainingStats = {

    // ── Supabase operations ──────────────────────────────────────────────

    /**
     * Fetch completed workout session history.
     * Excludes abandoned sessions (notes contain 'incomplete').
     * @param {number} [days=90]
     * @returns {Array<{ log_date, duration_min, rpe_overall, planned_workout_id }>}
     */
    async getSessionHistory(days = CONFIG_S.HISTORY_DAYS) {
      const user = await Core.Auth.getUser();
      if (!user) return [];

      const { data, error } = await Core.getClient()
        .from('workout_logs')
        .select('log_date, duration_min, rpe_overall, planned_workout_id, notes')
        .eq('user_id', user.id)
        .gte('log_date', _daysAgoIso(days))
        .not('notes', 'ilike', '%incomplete%')
        .order('log_date', { ascending: true });

      if (error) { console.error('[ApexStats] TrainingStats.getSessionHistory:', error); return []; }
      return data ?? [];
    },

    /**
     * Fetch working sets grouped by week for the volume bar chart.
     * Returns total sets per muscle group per ISO week.
     * @param {number} [days=90]
     * @returns {Array<{ week, muscle, sets }>}
     */
    async getWeeklyVolume(days = CONFIG_S.HISTORY_DAYS) {
      const user = await Core.Auth.getUser();
      if (!user) return [];

      const { data, error } = await Core.getClient()
        .from('set_logs')
        .select(`
          workout_logs!inner ( log_date, user_id ),
          exercises ( muscle_primary )
        `)
        .eq('workout_logs.user_id', user.id)
        .gte('workout_logs.log_date', _daysAgoIso(days))
        .eq('is_warmup', false);

      if (error) { console.error('[ApexStats] TrainingStats.getWeeklyVolume:', error); return []; }

      return TrainingStats.weeklyVolumeSummary(data ?? []);
    },

    /**
     * Fetch cardio session history.
     * @param {number} [days=90]
     * @returns {Array<{ session_date, modality, duration_min, kcal_burned }>}
     */
    async getCardioHistory(days = CONFIG_S.HISTORY_DAYS) {
      const user = await Core.Auth.getUser();
      if (!user) return [];

      const { data, error } = await Core.getClient()
        .from('cardio_sessions')
        .select('session_date, modality, duration_min, kcal_burned, intensity')
        .eq('user_id', user.id)
        .gte('session_date', _daysAgoIso(days))
        .order('session_date', { ascending: true });

      if (error) { console.error('[ApexStats] TrainingStats.getCardioHistory:', error); return []; }
      return data ?? [];
    },

    // ── PURE analytics ───────────────────────────────────────────────────

    /**
     * Compute the current training streak (consecutive days with a completed session).
     * A single rest day does NOT break the streak (STREAK_GAP_DAYS = 1).
     * Counting works backwards from the most recent session.
     *
     * @param {Array<{ log_date: string }>} sessions — ordered oldest → newest
     * @returns {number} streak length in calendar days (from first to last session date)
     */
    streak(sessions) {
      if (!sessions || sessions.length === 0) return 0;

      // Deduplicate dates (multiple sessions on same day count as one)
      const dates = [...new Set(sessions.map(s => s.log_date))].sort().reverse();

      let streakCount = 1;
      for (let i = 1; i < dates.length; i++) {
        const gap = _daysBetween(dates[i], dates[i - 1]);
        if (gap <= CONFIG_S.STREAK_GAP_DAYS + 1) {
          streakCount++;
        } else {
          break; // gap too large — streak ended
        }
      }
      return streakCount;
    },

    /**
     * Aggregate raw set_log rows (with joined workout_logs + exercises) into
     * a weekly volume summary suitable for a stacked bar chart.
     *
     * @param {Array} rawSetLogs — rows from getWeeklyVolume() query
     * @returns {Array<{ week: string, [muscle]: number }>}
     *   One object per week; muscle groups are dynamic keys with set counts as values.
     */
    weeklyVolumeSummary(rawSetLogs) {
      if (!rawSetLogs || rawSetLogs.length === 0) return [];

      const byWeek = new Map();
      for (const row of rawSetLogs) {
        const date   = row.workout_logs?.log_date;
        const muscle = row.exercises?.muscle_primary ?? 'unknown';
        if (!date) continue;

        const week = _isoWeek(date);
        if (!byWeek.has(week)) byWeek.set(week, { week });
        const entry = byWeek.get(week);
        entry[muscle] = (entry[muscle] ?? 0) + 1;
      }

      return Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 6. BODY COMPOSITION  (PURE — no Supabase)
  // ─────────────────────────────────────────────────────────────────────────

  const BodyComposition = {

    /**
     * Fat-Free Mass Index (FFMI).
     * FFMI = lean mass (kg) / height (m)²
     * Standard scale: < 18 = below avg, 18–20 = average, 20–22 = good,
     *                 22–23 = excellent, 23–25 = elite natural, > 25 = suspicious.
     *
     * @param {number} weightKg
     * @param {number} heightCm
     * @param {number} bodyFatPct — e.g. 15.0 (percent, not decimal)
     * @returns {number} FFMI rounded to 2dp, or null if inputs invalid
     */
    ffmi(weightKg, heightCm, bodyFatPct) {
      if (!_validPositive(weightKg) || !_validPositive(heightCm) ||
          bodyFatPct === null || bodyFatPct === undefined ||
          bodyFatPct < 0 || bodyFatPct >= 100) return null;

      const heightM = heightCm / 100;
      const leanMass = weightKg * (1 - bodyFatPct / 100);
      return Math.round((leanMass / (heightM ** 2)) * 100) / 100;
    },

    /**
     * Normalised FFMI — adjusts for height so athletes of different heights
     * are compared fairly. Reference height = 1.80 m.
     * nFFMI = FFMI + (6.1 × (1.80 − height_m))
     * Source: Kouri et al. (1995).
     *
     * @param {number} weightKg
     * @param {number} heightCm
     * @param {number} bodyFatPct
     * @returns {number|null}
     */
    normalizedFfmi(weightKg, heightCm, bodyFatPct) {
      const base = BodyComposition.ffmi(weightKg, heightCm, bodyFatPct);
      if (base === null) return null;
      const heightM    = heightCm / 100;
      const adjustment = 6.1 * (1.80 - heightM);
      return Math.round((base + adjustment) * 100) / 100;
    },

    /**
     * Estimate change in lean body mass between two time points.
     * Requires body fat percentage at both points — without it, returns null.
     *
     * @param {number} w1  — start weight (kg)
     * @param {number} w2  — end weight (kg)
     * @param {number} bf1 — start body fat %
     * @param {number} bf2 — end body fat %
     * @returns {{ leanMassChangeKg, fatMassChangeKg, totalChangeKg }|null}
     */
    leanMassChange(w1, w2, bf1, bf2) {
      if (!_validPositive(w1) || !_validPositive(w2) ||
          !_validBF(bf1) || !_validBF(bf2)) return null;

      const lean1 = w1 * (1 - bf1 / 100);
      const lean2 = w2 * (1 - bf2 / 100);
      const fat1  = w1 - lean1;
      const fat2  = w2 - lean2;

      return {
        leanMassChangeKg: Math.round((lean2 - lean1) * 100) / 100,
        fatMassChangeKg:  Math.round((fat2  - fat1)  * 100) / 100,
        totalChangeKg:    Math.round((w2    - w1)    * 100) / 100,
      };
    },

    /**
     * Assess whether body weight is increasing at a rate consistent with a
     * lean bulk (primarily muscle gain, not fat accumulation).
     *
     * Uses the first and last weight_log entries over the provided interval.
     * Rate > BULK_RATE_MAX_KG_MONTH suggests excess fat gain.
     *
     * @param {Array<{ log_date: string, weight_kg: number }>} logs — oldest → newest
     * @param {number} [intervalDays] — defaults to date range of logs
     * @returns {{
     *   rateKgPerMonth,
     *   assessment: 'optimal'|'too_fast'|'too_slow'|'insufficient_data'
     * }}
     */
    muscleBuildingRate(logs, intervalDays = null) {
      if (!logs || logs.length < 2) {
        return { rateKgPerMonth: null, assessment: 'insufficient_data' };
      }
      const first  = logs[0];
      const last   = logs[logs.length - 1];
      const days   = intervalDays ?? _daysBetween(first.log_date, last.log_date);
      if (days < 7) return { rateKgPerMonth: null, assessment: 'insufficient_data' };

      const totalChange    = last.weight_kg - first.weight_kg;
      const rateKgPerMonth = Math.round((totalChange / days) * 30.44 * 100) / 100;

      const assessment =
        rateKgPerMonth > CONFIG_S.BULK_RATE_MAX_KG_MONTH ? 'too_fast' :
        rateKgPerMonth < 0                                ? 'too_slow' :
                                                            'optimal';

      return { rateKgPerMonth, assessment };
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7. DASHBOARD
  // Single parallel fetch — returns everything the Stats tab needs to render.
  // Callers await this once on tab activation; all sub-calls run in parallel.
  // ─────────────────────────────────────────────────────────────────────────

  const Dashboard = {

    /**
     * Fetch and assemble the full Stats tab payload in one shot.
     * Uses Promise.all for maximum parallelism — ~1 round-trip cost.
     *
     * @param {number} [days=90]
     * @returns {{
     *   profile,
     *   weight: { logs, latest, trends },
     *   strength: { summary, topMovers },
     *   balance: { daily, weekly, summary },
     *   training: { sessions, streak, cardio },
     *   error
     * }}
     */
    async getSummary(days = CONFIG_S.HISTORY_DAYS) {
      try {
        const [
          profile,
          weightLogs,
          weightLatest,
          prSummary,
          sessionHistory,
          cardioHistory,
          dailyBalance,
        ] = await Promise.all([
          Core.Profile.getCached(),
          WeightStats.getHistory(days),
          WeightStats.getLatest(),
          StrengthStats.getPRSummary(),
          TrainingStats.getSessionHistory(days),
          TrainingStats.getCardioHistory(days),
          CalorieBalance.getDailyBalance(days),
        ]);

        // Weekly volume needs session history first (it re-uses the fetch pattern)
        const weeklyVolume = await TrainingStats.getWeeklyVolume(days);

        // Derive analytics from raw data
        const weightTrends    = WeightStats.trends(weightLogs);
        const strengthMovers  = StrengthStats.topMovers(prSummary, 5);
        const weeklyBalance   = CalorieBalance.getWeeklyBalance(dailyBalance);
        const balanceSummary  = CalorieBalance.summary(dailyBalance);
        const trainingStreak  = TrainingStats.streak(sessionHistory);

        return {
          profile,
          weight: {
            logs:   weightLogs,
            latest: weightLatest,
            trends: weightTrends,
          },
          strength: {
            summary:   prSummary,
            topMovers: strengthMovers,
          },
          balance: {
            daily:   dailyBalance,
            weekly:  weeklyBalance,
            summary: balanceSummary,
          },
          training: {
            sessions:      sessionHistory,
            streak:        trainingStreak,
            weeklyVolume,
            cardio:        cardioHistory,
          },
          error: null,
        };
      } catch (err) {
        console.error('[ApexStats] Dashboard.getSummary:', err);
        return { profile: null, weight: null, strength: null, balance: null, training: null, error: err };
      }
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 8. CHART HELPERS  (PURE — no Supabase, no DOM)
  //
  // All functions return plain objects compatible with Chart.js v3/v4.
  // The caller passes these directly to `new Chart(ctx, { data: ... })`.
  // Colors default to CONFIG_S.COLORS but can be overridden per call.
  // ─────────────────────────────────────────────────────────────────────────

  const ChartHelpers = {

    /**
     * Build a Chart.js `data` object for the body weight trend chart.
     * Produces two datasets: raw daily weights + N-day moving average.
     *
     * @param {Array<{ log_date: string, weight_kg: number }>} logs
     * @param {number} [window=7]
     * @returns {{ labels: string[], datasets: object[] }}
     */
    weightTrendDataset(logs, window = CONFIG_S.MOVING_AVG_WINDOW) {
      if (!logs || logs.length === 0) return { labels: [], datasets: [] };

      const labels     = logs.map(l => l.log_date);
      const KG_TO_LBS  = 2.20462;
      const rawValues  = logs.map(l => Math.round(l.weight_kg * KG_TO_LBS * 10) / 10);
      const maValues   = WeightStats.movingAverage(rawValues, window);

      return {
        labels,
        datasets: [
          {
            label:           'Body weight (lbs)',
            data:            rawValues,
            borderColor:     CONFIG_S.COLORS.weight,
            backgroundColor: CONFIG_S.COLORS.weight + '22', // 13% opacity fill
            borderWidth:     1.5,
            pointRadius:     2,
            tension:         0.3,
            fill:            false,
          },
          {
            label:       `${window}-day average`,
            data:        maValues,
            borderColor: CONFIG_S.COLORS.movingAvg,
            borderWidth: 2.5,
            pointRadius: 0,
            tension:     0.4,
            fill:        false,
          },
        ],
      };
    },

    /**
     * Build a Chart.js `data` object for a single exercise's 1RM trend.
     * @param {Array<{ pr_date: string, estimated_1rm: number }>} trend
     * @param {string} label   — exercise name
     * @param {string} [color] — defaults to CONFIG_S.COLORS.strength
     * @returns {{ labels: string[], datasets: object[] }}
     */
    strengthDataset(trend, label, color = CONFIG_S.COLORS.strength) {
      if (!trend || trend.length === 0) return { labels: [], datasets: [] };

      return {
        labels: trend.map(t => t.pr_date),
        datasets: [{
          label,
          data:            trend.map(t => t.estimated_1rm),
          borderColor:     color,
          backgroundColor: color + '22',
          borderWidth:     2,
          pointRadius:     3,
          tension:         0.3,
          fill:            false,
        }],
      };
    },

    /**
     * Build a Chart.js `data` object for the calorie balance bar chart.
     * Bars are coloured by sign: surplus = teal, deficit = red.
     *
     * @param {Array<{ date: string, balance: number }>} entries
     * @returns {{ labels: string[], datasets: object[] }}
     */
    calorieBalanceDataset(entries) {
      if (!entries || entries.length === 0) return { labels: [], datasets: [] };

      const colors = entries.map(e =>
        e.balance >= 0 ? CONFIG_S.COLORS.surplus : CONFIG_S.COLORS.deficit
      );

      return {
        labels: entries.map(e => e.date),
        datasets: [{
          label:           'Daily balance (kcal)',
          data:            entries.map(e => e.balance),
          backgroundColor: colors,
          borderRadius:    3,
          borderWidth:     0,
        }],
      };
    },

    /**
     * Build a Chart.js `data` object for the weekly training volume bar chart.
     * Produces one dataset per muscle group (stacked bar).
     *
     * @param {Array<{ week: string, [muscle]: number }>} weeklyData
     *        — output of TrainingStats.weeklyVolumeSummary()
     * @returns {{ labels: string[], datasets: object[] }}
     */
    weeklyVolumeDataset(weeklyData) {
      if (!weeklyData || weeklyData.length === 0) return { labels: [], datasets: [] };

      const labels  = weeklyData.map(w => w.week);
      const muscles = [...new Set(
        weeklyData.flatMap(w => Object.keys(w).filter(k => k !== 'week'))
      )].sort();

      const MUSCLE_COLORS = {
        chest:       '#378ADD', back:        '#1D9E75', shoulders: '#D85A30',
        quads:       '#7F77DD', hamstrings:  '#BA7517', glutes:    '#D4537E',
        biceps:      '#5DCAA5', triceps:     '#F09595', calves:    '#B4B2A9',
        core:        '#EF9F27', full_body:   '#534AB7', unknown:   '#888780',
      };

      return {
        labels,
        datasets: muscles.map(muscle => ({
          label:           _capitalise(muscle),
          data:            weeklyData.map(w => w[muscle] ?? 0),
          backgroundColor: MUSCLE_COLORS[muscle] ?? '#888780',
          stack:           'volume',
          borderRadius:    2,
          borderWidth:     0,
        })),
      };
    },

    /**
     * Build a Chart.js `data` object for macro adherence over a week.
     * Grouped bar chart: protein / carbs / fat — each group is one day.
     * Bar height = % of target hit (capped at 100 for display).
     *
     * @param {Array<{ date, proteinG, carbsG, fatG, proteinTarget, kcalTarget }>} weekSummary
     *        — output of ApexNutrition.MealPlan.getWeekSummary()
     * @param {{ proteinG, carbsG, fatG }} targets — daily macro targets from profile
     * @returns {{ labels: string[], datasets: object[] }}
     */
    macroAdherenceDataset(weekSummary, targets) {
      if (!weekSummary || weekSummary.length === 0) return { labels: [], datasets: [] };

      const pct = (val, max) => (max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0);

      return {
        labels: weekSummary.map(d => d.date),
        datasets: [
          {
            label:           'Protein %',
            data:            weekSummary.map(d => pct(d.proteinG, targets.proteinG)),
            backgroundColor: CONFIG_S.COLORS.protein,
            borderRadius:    3,
            borderWidth:     0,
          },
          {
            label:           'Carbs %',
            data:            weekSummary.map(d => pct(d.carbsG, targets.carbsG)),
            backgroundColor: CONFIG_S.COLORS.carbs,
            borderRadius:    3,
            borderWidth:     0,
          },
          {
            label:           'Fat %',
            data:            weekSummary.map(d => pct(d.fatG, targets.fatG)),
            backgroundColor: CONFIG_S.COLORS.fat,
            borderRadius:    3,
            borderWidth:     0,
          },
        ],
      };
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  /** ISO date string N days ago. */
  function _daysAgoIso(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /**
   * ISO 8601 week string: 'YYYY-Www' e.g. '2025-W03'.
   * Used as a stable Map key for weekly groupings.
   * @param {string} isoDate — 'YYYY-MM-DD'
   * @returns {string}
   */
  function _isoWeek(isoDate) {
    const date   = new Date(isoDate + 'T00:00:00');
    const day    = date.getUTCDay() || 7;           // Mon=1 … Sun=7
    date.setUTCDate(date.getUTCDate() + 4 - day);   // nearest Thursday
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum   = Math.ceil(((date - yearStart) / 86_400_000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /**
   * Number of whole calendar days between two ISO date strings.
   * Always returns a non-negative integer (start ≤ end assumed).
   */
  function _daysBetween(isoStart, isoEnd) {
    const msPerDay = 86_400_000;
    const start    = new Date(isoStart + 'T00:00:00');
    const end      = new Date(isoEnd   + 'T00:00:00');
    return Math.max(0, Math.round((end - start) / msPerDay));
  }

  function _validPositive(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0; }
  function _validBF(pct)     { return typeof pct === 'number' && pct >= 0 && pct < 100; }
  function _capitalise(s)    { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  return {
    CONFIG_S,
    WeightStats,
    StrengthStats,
    CalorieBalance,
    TrainingStats,
    BodyComposition,
    Dashboard,
    ChartHelpers,
    // Expose private utils for testing
    _utils: { isoWeek: _isoWeek, daysBetween: _daysBetween, daysAgoIso: _daysAgoIso },
  };

})();
