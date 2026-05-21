/**
 * training.js
 * Apex Fitness — Training Module
 *
 * Responsibilities:
 *   1. CONFIG_T        — training-specific constants
 *   2. Split templates — week structure by experience level (pure data)
 *   3. Rep schemes     — sets/reps/RPE/rest lookup table (pure data)
 *   4. ExerciseLibrary — fetch + in-memory cache with filtering
 *   5. ProgramBuilder  — pure split/volume logic + Supabase program writes
 *   6. WeeklyPlan      — fetch and shape current-week data for the Training tab
 *   7. WorkoutSession  — in-memory active workout state machine + set logging
 *   8. CardioEngine    — cardio prescription (pure) + session logging
 *   9. ProgressionEngine — forward-apply overload flags to next week's planned sets
 *  10. SessionTimer    — DOM-free stopwatch
 *
 * Dependencies (must be loaded before this file):
 *   <script src="...supabase..."></script>
 *   <script src="js/apex-core.js"></script>
 *   <script src="js/training.js"></script>
 *
 * Usage:
 *   const plan = await ApexTraining.WeeklyPlan.getCurrent();
 *   const session = await ApexTraining.WorkoutSession.start(workoutId);
 */

'use strict';

window.ApexTraining = (function () {

  // Guard: apex-core must be present
  if (!window.ApexCore) {
    throw new Error('[ApexTraining] apex-core.js must be loaded before training.js');
  }
  const Core = window.ApexCore;

  // ─────────────────────────────────────────────────────────────────────────
  // 1. TRAINING-SPECIFIC CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  const CONFIG_T = {
    PROGRAM_WEEKS_DEFAULT:  12,   // total program length if not specified
    DELOAD_INTERVAL:         4,   // inherit from Core but keep local copy
    CACHE_TTL_MS:       300_000,  // 5 min — exercise library cache TTL

    // Weekly set volume targets per muscle group (working sets, not warm-ups)
    VOLUME_TARGETS: {
      beginner:     { min: 10, max: 12 },
      intermediate: { min: 14, max: 16 },
      advanced:     { min: 16, max: 22 },
    },

    // Cardio prescriptions by phase (sessions per week, duration in minutes)
    CARDIO: {
      bulk: {
        liss: { sessions: 2, durationMin: 25, zone: 'Zone 2', notes: 'Steady state, conversational pace' },
        hiit: { sessions: 0 },
      },
      cut: {
        liss: { sessions: 3, durationMin: 40, zone: 'Zone 2', notes: 'Low-intensity steady state' },
        hiit: { sessions: 1, durationMin: 20, zone: 'Max effort', notes: '30s on / 90s off × 8 rounds' },
      },
      maintain: {
        liss: { sessions: 2, durationMin: 30, zone: 'Zone 2', notes: 'General aerobic health' },
        hiit: { sessions: 1, durationMin: 20, zone: 'Max effort', notes: '30s on / 90s off × 8 rounds' },
      },
    },

    // Incomplete session flag — written to workout_logs.notes so Deload._checkFatigue picks it up
    INCOMPLETE_FLAG: 'incomplete',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SPLIT TEMPLATES  (pure data — no Supabase)
  //
  // Each template defines the weekly day structure.
  // `muscles` drives exercise selection from the library.
  // `is_compound_focus` tells _buildSetSpec whether to weight toward compounds.
  // day_of_week: 0=Mon … 6=Sun
  // ─────────────────────────────────────────────────────────────────────────

  const _SPLITS = {

    // ── Beginner: 3-day full-body ─────────────────────────────────────────
    beginner: {
      name: 'Full-body 3×/week',
      training_days_per_week: 3,
      days: [
        {
          day_of_week: 0, label: 'Full body A', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'],    is_compound: true,  count: 1 },
            { muscles: ['chest'],             is_compound: true,  count: 1 },
            { muscles: ['back'],              is_compound: true,  count: 1 },
            { muscles: ['shoulders'],         is_compound: false, count: 1 },
            { muscles: ['core'],              is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 1, label: 'Rest / walk', workout_type: 'cardio', slots: [] },
        {
          day_of_week: 2, label: 'Full body B', workout_type: 'strength',
          slots: [
            { muscles: ['hamstrings','glutes'], is_compound: true,  count: 1 },
            { muscles: ['back'],               is_compound: true,  count: 1 },
            { muscles: ['chest'],              is_compound: false, count: 1 },
            { muscles: ['biceps'],             is_compound: false, count: 1 },
            { muscles: ['triceps'],            is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 3, label: 'Rest / walk', workout_type: 'cardio', slots: [] },
        {
          day_of_week: 4, label: 'Full body C', workout_type: 'strength',
          slots: [
            { muscles: ['quads','hamstrings'], is_compound: true,  count: 1 },
            { muscles: ['shoulders'],          is_compound: true,  count: 1 },
            { muscles: ['back'],               is_compound: false, count: 1 },
            { muscles: ['chest'],              is_compound: false, count: 1 },
            { muscles: ['core'],               is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 5, label: 'Rest',       workout_type: null,      slots: [] },
        { day_of_week: 6, label: 'Rest',       workout_type: null,      slots: [] },
      ],
    },

    // ── Intermediate: 4-day upper/lower ──────────────────────────────────
    intermediate: {
      name: 'Upper/lower 4×/week',
      training_days_per_week: 4,
      days: [
        {
          day_of_week: 0, label: 'Upper A', workout_type: 'strength',
          slots: [
            { muscles: ['chest'],     is_compound: true,  count: 1 },
            { muscles: ['back'],      is_compound: true,  count: 1 },
            { muscles: ['shoulders'], is_compound: true,  count: 1 },
            { muscles: ['biceps'],    is_compound: false, count: 1 },
            { muscles: ['triceps'],   is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 1, label: 'Lower A', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'],    is_compound: true,  count: 1 },
            { muscles: ['hamstrings'],        is_compound: true,  count: 1 },
            { muscles: ['quads'],             is_compound: false, count: 1 },
            { muscles: ['hamstrings'],        is_compound: false, count: 1 },
            { muscles: ['calves'],            is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 2, label: 'Rest / LISS', workout_type: 'cardio', slots: [] },
        {
          day_of_week: 3, label: 'Upper B', workout_type: 'strength',
          slots: [
            { muscles: ['back'],      is_compound: true,  count: 1 },
            { muscles: ['chest'],     is_compound: false, count: 1 },
            { muscles: ['shoulders'], is_compound: false, count: 1 },
            { muscles: ['triceps'],   is_compound: false, count: 1 },
            { muscles: ['biceps'],    is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 4, label: 'Lower B', workout_type: 'strength',
          slots: [
            { muscles: ['hamstrings','glutes'], is_compound: true,  count: 1 },
            { muscles: ['quads'],              is_compound: true,  count: 1 },
            { muscles: ['glutes'],             is_compound: false, count: 1 },
            { muscles: ['hamstrings'],         is_compound: false, count: 1 },
            { muscles: ['calves'],             is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 5, label: 'LISS cardio', workout_type: 'cardio', slots: [] },
        { day_of_week: 6, label: 'Rest',         workout_type: null,    slots: [] },
      ],
    },

    // ── Full-body 4×/week ────────────────────────────────────────────────
    full_body_4: {
      name: 'Full-body 4×/week',
      science: '4× weekly frequency maximises protein synthesis events without exceeding recovery. '
             + 'Optimal for intermediate lifters on 4-day schedules (Schoenfeld, 2016).',
      training_days_per_week: 4,
      days: [
        {
          day_of_week: 0, label: 'Full body A', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'],    is_compound: true,  count: 1 },
            { muscles: ['chest'],             is_compound: true,  count: 1 },
            { muscles: ['back'],              is_compound: true,  count: 1 },
            { muscles: ['shoulders'],         is_compound: false, count: 1 },
            { muscles: ['core'],              is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 1, label: 'Full body B', workout_type: 'strength',
          slots: [
            { muscles: ['hamstrings','glutes'], is_compound: true,  count: 1 },
            { muscles: ['back'],               is_compound: true,  count: 1 },
            { muscles: ['chest'],              is_compound: false, count: 1 },
            { muscles: ['biceps'],             is_compound: false, count: 1 },
            { muscles: ['triceps'],            is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 2, label: 'Rest / walk', workout_type: 'cardio', slots: [] },
        {
          day_of_week: 3, label: 'Full body C', workout_type: 'strength',
          slots: [
            { muscles: ['quads','hamstrings'], is_compound: true,  count: 1 },
            { muscles: ['shoulders'],          is_compound: true,  count: 1 },
            { muscles: ['back'],               is_compound: false, count: 1 },
            { muscles: ['chest'],              is_compound: false, count: 1 },
            { muscles: ['core'],               is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 4, label: 'Full body D', workout_type: 'strength',
          slots: [
            { muscles: ['glutes','hamstrings'], is_compound: true,  count: 1 },
            { muscles: ['chest'],               is_compound: true,  count: 1 },
            { muscles: ['back'],                is_compound: true,  count: 1 },
            { muscles: ['triceps'],             is_compound: false, count: 1 },
            { muscles: ['calves'],              is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 5, label: 'Rest', workout_type: null, slots: [] },
        { day_of_week: 6, label: 'Rest', workout_type: null, slots: [] },
      ],
    },

    // ── Strength / Powerbuilding 4×/week ──────────────────────────────────
    strength: {
      name: 'Strength 4×/week',
      science: 'Low-rep (3-5), high-intensity (85-95% 1RM) loading drives myofibrillar hypertrophy '
             + 'and CNS adaptation. Basis: Zatsiorsky & Kraemer maximal effort method.',
      training_days_per_week: 4,
      days: [
        {
          day_of_week: 0, label: 'Squat + Push', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'],  is_compound: true,  count: 1, rep_scheme: 'strength' },
            { muscles: ['chest'],           is_compound: true,  count: 1, rep_scheme: 'strength' },
            { muscles: ['quads'],           is_compound: false, count: 1 },
            { muscles: ['triceps'],         is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 1, label: 'Hinge + Pull', workout_type: 'strength',
          slots: [
            { muscles: ['hamstrings','back'], is_compound: true, count: 1, rep_scheme: 'strength' },
            { muscles: ['back'],              is_compound: true, count: 1, rep_scheme: 'strength' },
            { muscles: ['hamstrings'],        is_compound: false, count: 1 },
            { muscles: ['biceps'],            is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 2, label: 'Rest / LISS', workout_type: 'cardio', slots: [] },
        {
          day_of_week: 3, label: 'Bench + Row', workout_type: 'strength',
          slots: [
            { muscles: ['chest'],  is_compound: true,  count: 1, rep_scheme: 'strength' },
            { muscles: ['back'],   is_compound: true,  count: 1, rep_scheme: 'strength' },
            { muscles: ['chest'],  is_compound: false, count: 1 },
            { muscles: ['triceps'],is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 4, label: 'Press + Squat', workout_type: 'strength',
          slots: [
            { muscles: ['shoulders'],          is_compound: true, count: 1, rep_scheme: 'strength' },
            { muscles: ['quads','hamstrings'], is_compound: true, count: 1, rep_scheme: 'strength' },
            { muscles: ['shoulders'],          is_compound: false, count: 1 },
            { muscles: ['biceps'],             is_compound: false, count: 1 },
          ],
        },
        { day_of_week: 5, label: 'Rest', workout_type: null, slots: [] },
        { day_of_week: 6, label: 'Rest', workout_type: null, slots: [] },
      ],
    },

    // ── Push/Pull/Legs 3×/week ────────────────────────────────────────────
    ppl_3: {
      name: 'Push / Pull / Legs 3×/week',
      science: 'Volume-equated once-per-week frequency produces comparable hypertrophy to higher '
             + 'frequencies when weekly sets are matched (Ralston et al., 2017).',
      training_days_per_week: 3,
      days: [
        {
          day_of_week: 0, label: 'Push', workout_type: 'strength',
          slots: [
            { muscles: ['chest'],     is_compound: true,  count: 1 },
            { muscles: ['shoulders'], is_compound: true,  count: 1 },
            { muscles: ['chest'],     is_compound: false, count: 1 },
            { muscles: ['shoulders'], is_compound: false, count: 1 },
            { muscles: ['triceps'],   is_compound: false, count: 2 },
          ],
        },
        { day_of_week: 1, label: 'Rest', workout_type: null, slots: [] },
        {
          day_of_week: 2, label: 'Pull', workout_type: 'strength',
          slots: [
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: false, count: 1 },
            { muscles: ['biceps'], is_compound: false, count: 2 },
          ],
        },
        { day_of_week: 3, label: 'Rest', workout_type: null, slots: [] },
        {
          day_of_week: 4, label: 'Legs', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'], is_compound: true,  count: 1 },
            { muscles: ['hamstrings'],     is_compound: true,  count: 1 },
            { muscles: ['quads'],          is_compound: false, count: 1 },
            { muscles: ['hamstrings'],     is_compound: false, count: 1 },
            { muscles: ['calves'],         is_compound: false, count: 2 },
          ],
        },
        { day_of_week: 5, label: 'Rest', workout_type: null, slots: [] },
        { day_of_week: 6, label: 'Rest', workout_type: null, slots: [] },
      ],
    },

    // ── Body Part / Bro Split 5×/week ─────────────────────────────────────
    body_part: {
      name: 'Body Part Split 5×/week',
      science: 'High intra-session volume per muscle. When weekly volume is equated, '
             + 'once-per-week frequency produces similar hypertrophy (Schoenfeld et al., 2016).',
      training_days_per_week: 5,
      days: [
        {
          day_of_week: 0, label: 'Chest', workout_type: 'strength',
          slots: [
            { muscles: ['chest'],   is_compound: true,  count: 1 },
            { muscles: ['chest'],   is_compound: true,  count: 1 },
            { muscles: ['chest'],   is_compound: false, count: 1 },
            { muscles: ['chest'],   is_compound: false, count: 1 },
            { muscles: ['triceps'], is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 1, label: 'Back', workout_type: 'strength',
          slots: [
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: false, count: 1 },
            { muscles: ['back'],   is_compound: false, count: 1 },
            { muscles: ['biceps'], is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 2, label: 'Shoulders', workout_type: 'strength',
          slots: [
            { muscles: ['shoulders'], is_compound: true,  count: 1 },
            { muscles: ['shoulders'], is_compound: false, count: 1 },
            { muscles: ['shoulders'], is_compound: false, count: 1 },
            { muscles: ['triceps'],   is_compound: false, count: 1 },
            { muscles: ['core'],      is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 3, label: 'Arms', workout_type: 'strength',
          slots: [
            { muscles: ['biceps'],  is_compound: false, count: 2 },
            { muscles: ['triceps'], is_compound: false, count: 2 },
            { muscles: ['core'],    is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 4, label: 'Legs', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'], is_compound: true,  count: 1 },
            { muscles: ['hamstrings'],     is_compound: true,  count: 1 },
            { muscles: ['quads'],          is_compound: false, count: 1 },
            { muscles: ['hamstrings'],     is_compound: false, count: 1 },
            { muscles: ['calves'],         is_compound: false, count: 2 },
          ],
        },
        { day_of_week: 5, label: 'Rest', workout_type: null, slots: [] },
        { day_of_week: 6, label: 'Rest', workout_type: null, slots: [] },
      ],
    },

    // ── Advanced: 6-day push/pull/legs ────────────────────────────────────
    advanced: {
      name: 'Push/pull/legs 6×/week',
      training_days_per_week: 6,
      days: [
        {
          day_of_week: 0, label: 'Push A', workout_type: 'strength',
          slots: [
            { muscles: ['chest'],     is_compound: true,  count: 1 },
            { muscles: ['shoulders'], is_compound: true,  count: 1 },
            { muscles: ['chest'],     is_compound: false, count: 1 },
            { muscles: ['shoulders'], is_compound: false, count: 1 },
            { muscles: ['triceps'],   is_compound: false, count: 2 },
          ],
        },
        {
          day_of_week: 1, label: 'Pull A', workout_type: 'strength',
          slots: [
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: false, count: 1 },
            { muscles: ['biceps'], is_compound: false, count: 2 },
          ],
        },
        {
          day_of_week: 2, label: 'Legs A', workout_type: 'strength',
          slots: [
            { muscles: ['quads','glutes'],    is_compound: true,  count: 1 },
            { muscles: ['hamstrings'],        is_compound: true,  count: 1 },
            { muscles: ['quads'],             is_compound: false, count: 1 },
            { muscles: ['hamstrings'],        is_compound: false, count: 1 },
            { muscles: ['calves'],            is_compound: false, count: 2 },
          ],
        },
        { day_of_week: 3, label: 'Rest / LISS', workout_type: 'cardio', slots: [] },
        {
          day_of_week: 4, label: 'Push B', workout_type: 'strength',
          slots: [
            { muscles: ['chest'],     is_compound: true,  count: 1 },
            { muscles: ['shoulders'], is_compound: false, count: 1 },
            { muscles: ['chest'],     is_compound: false, count: 1 },
            { muscles: ['triceps'],   is_compound: false, count: 2 },
            { muscles: ['core'],      is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 5, label: 'Pull B', workout_type: 'strength',
          slots: [
            { muscles: ['back'],   is_compound: true,  count: 1 },
            { muscles: ['back'],   is_compound: false, count: 1 },
            { muscles: ['back'],   is_compound: false, count: 1 },
            { muscles: ['biceps'], is_compound: false, count: 1 },
          ],
        },
        {
          day_of_week: 6, label: 'Legs B', workout_type: 'strength',
          slots: [
            { muscles: ['hamstrings','glutes'], is_compound: true,  count: 1 },
            { muscles: ['quads'],              is_compound: true,  count: 1 },
            { muscles: ['glutes'],             is_compound: false, count: 1 },
            { muscles: ['calves'],             is_compound: false, count: 2 },
            { muscles: ['core'],               is_compound: false, count: 1 },
          ],
        },
      ],
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. REP SCHEME LOOKUP  (pure data)
  //
  // Keyed by [isCompound][phase]
  // Each scheme is used by _buildSetSpec() to fill planned_sets rows.
  // rest_seconds is the prescribed inter-set rest period.
  // ─────────────────────────────────────────────────────────────────────────

  const _REP_SCHEMES = {
    // Heavy compounds — strength / powerbuilding focus (3-5 rep range)
    strength: {
      bulk:     { sets: 5, reps_min: 3, reps_max: 5, rpe: 8.5, rest_seconds: 300 },
      cut:      { sets: 4, reps_min: 3, reps_max: 5, rpe: 8.0, rest_seconds: 240 },
      maintain: { sets: 4, reps_min: 4, reps_max: 6, rpe: 8.0, rest_seconds: 300 },
    },
    // Compound movements — hypertrophy rep range
    compound: {
      bulk:     { sets: 4, reps_min: 6,  reps_max: 8,  rpe: 8.0, rest_seconds: 180 },
      cut:      { sets: 4, reps_min: 6,  reps_max: 8,  rpe: 8.5, rest_seconds: 150 },
      maintain: { sets: 4, reps_min: 6,  reps_max: 10, rpe: 7.5, rest_seconds: 180 },
    },
    // Isolation / accessory movements — lighter, shorter rest
    isolation: {
      bulk:     { sets: 3, reps_min: 10, reps_max: 15, rpe: 8.0, rest_seconds: 90  },
      cut:      { sets: 3, reps_min: 12, reps_max: 20, rpe: 8.5, rest_seconds: 60  },
      maintain: { sets: 3, reps_min: 10, reps_max: 15, rpe: 7.5, rest_seconds: 90  },
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4. EXERCISE LIBRARY
  // ─────────────────────────────────────────────────────────────────────────

  const ExerciseLibrary = (() => {
    let _cache = null;
    let _cacheTime = 0;

    /**
     * Fetch all exercises from Supabase with in-memory cache.
     * @returns {Array} exercises array
     */
    async function getAll() {
      if (_cache && (Date.now() - _cacheTime) < CONFIG_T.CACHE_TTL_MS) {
        return _cache;
      }
      const { data, error } = await Core.getClient()
        .from('exercises')
        .select('*')
        .order('name');

      if (error) {
        console.error('[ApexTraining] ExerciseLibrary.getAll:', error);
        return _cache ?? []; // return stale cache on error rather than empty
      }
      _cache = data ?? [];
      _cacheTime = Date.now();
      return _cache;
    }

    /**
     * Filter exercises by muscle group(s) and compound flag.
     * Returns exercises that match ANY of the provided muscle groups.
     * @param {string[]} muscles     — e.g. ['chest', 'triceps']
     * @param {boolean}  isCompound  — true = compounds only
     * @param {string}   [equipment] — optional equipment filter
     * @returns {Array}
     */
    function filter(allExercises, muscles, isCompound, equipment = null) {
      return allExercises.filter(ex => {
        const muscleMatch = muscles.some(m =>
          ex.muscle_primary === m ||
          (ex.muscles_secondary && ex.muscles_secondary.includes(m))
        );
        const compoundMatch = ex.is_compound === isCompound;
        const equipmentMatch = !equipment || ex.equipment === equipment;
        return muscleMatch && compoundMatch && equipmentMatch;
      });
    }

    /**
     * Pick N exercises from a filtered list, preferring variety
     * (avoids repeating the same exercise across slots in one workout).
     * @param {Array}    pool        — filtered exercises
     * @param {number}   n           — how many to pick
     * @param {Set}      usedIds     — already-chosen exercise IDs this workout
     * @returns {Array}
     */
    function pick(pool, n, usedIds = new Set()) {
      const fresh   = pool.filter(ex => !usedIds.has(ex.id));
      const source  = fresh.length >= n ? fresh : pool; // fallback to full pool if too small
      // Shuffle deterministically using sort — good enough for program generation
      const shuffled = [...source].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    }

    /**
     * Invalidate the cache. Call after seeding new exercises.
     */
    function invalidate() {
      _cache = null;
      _cacheTime = 0;
    }

    return { getAll, filter, pick, invalidate };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 5. PROGRAM BUILDER
  //
  // Pure helpers (testable) + one async generate() that writes to Supabase.
  // ─────────────────────────────────────────────────────────────────────────

  const ProgramBuilder = (() => {

    // ── Pure helpers ───────────────────────────────────────────────────────

    /**
     * Choose a split template based on experience level.
     * @param {'beginner'|'intermediate'|'advanced'} experience
     * @returns {object} split template from _SPLITS
     */
    function _selectSplit(experience, preferredSplit) {
      if (preferredSplit && _SPLITS[preferredSplit]) return _SPLITS[preferredSplit];
      return _SPLITS[experience] ?? _SPLITS.intermediate;
    }

    // Return all split options with metadata for the UI
    function getSplits() { return _SPLITS; }

    /**
     * Build an array of week descriptor objects for a full program.
     * Deload weeks are inserted every `interval` weeks.
     * @param {number} totalWeeks
     * @param {number} interval   — deload every N weeks
     * @returns {Array<{ weekNumber, isDeload, volumeMod, intensityMod }>}
     */
    function _buildWeekFlags(totalWeeks, interval) {
      const weeks = [];
      for (let w = 1; w <= totalWeeks; w++) {
        const isDeload = (w % interval === 0);
        weeks.push({
          weekNumber:   w,
          isDeload,
          volumeMod:    isDeload ? Core.CONFIG.DELOAD_VOLUME_MOD    : 1.0,
          intensityMod: isDeload ? Core.CONFIG.DELOAD_INTENSITY_MOD : 1.0,
        });
      }
      return weeks;
    }

    /**
     * Build a planned_set specification for one exercise slot.
     * Returns the row shape expected by the planned_sets table.
     * @param {object}  exercise    — DB exercise row
     * @param {boolean} isCompound  — compound or isolation scheme
     * @param {string}  phase       — 'bulk' | 'cut' | 'maintain'
     * @param {number}  sortOrder
     * @param {string}  [plannedWorkoutId] — filled in during generate()
     * @returns {object}
     */
    function _buildSetSpec(exercise, isCompound, phase, sortOrder, plannedWorkoutId = null, repScheme = null) {
      const schemeKey = repScheme ?? (isCompound ? 'compound' : 'isolation');
      const scheme    = (_REP_SCHEMES[schemeKey] ?? _REP_SCHEMES.compound)[phase]
                     ?? _REP_SCHEMES.compound.maintain;
      return {
        planned_workout_id: plannedWorkoutId,
        exercise_id:        exercise.id,
        sets:               scheme.sets,
        reps_min:           scheme.reps_min,
        reps_max:           scheme.reps_max,
        rpe_target:         scheme.rpe,
        rest_seconds:       scheme.rest_seconds,
        sort_order:         sortOrder,
        notes:              null,
      };
    }

    /**
     * Apply deload modifiers to an array of planned_set specs.
     * Reduces sets by volume_mod and records intensity_mod in notes for training.js to use.
     * @param {Array}  specs       — planned_sets rows
     * @param {number} volumeMod   — e.g. 0.60
     * @param {number} intensityMod — e.g. 0.85
     * @returns {Array} modified copies (originals untouched)
     */
    function _applyDeloadMods(specs, volumeMod, intensityMod) {
      return specs.map(spec => ({
        ...spec,
        sets:  Math.max(1, Math.floor(spec.sets * volumeMod)),
        notes: `Deload week — use ${Math.round(intensityMod * 100)}% of working weight`,
      }));
    }

    // ── Async generate() — the full Supabase write sequence ───────────────

    /**
     * Generate a complete program for the current user and write it to Supabase.
     * Deactivates any existing active program first.
     *
     * Sequence:
     *   1. Fetch profile + exercise library
     *   2. Deactivate old programs
     *   3. Insert programs row → get program_id
     *   4. For each week → insert program_weeks row → get week_id
     *   5. For each day in split → insert planned_workouts row → get workout_id
     *   6. For each slot in day → pick exercises → insert planned_sets rows
     *
     * @param {object} [options]
     * @param {number} [options.totalWeeks]    — defaults to CONFIG_T.PROGRAM_WEEKS_DEFAULT
     * @param {number} [options.deloadInterval] — defaults to Core.CONFIG.DELOAD_INTERVAL_WEEKS
     * @returns {{ programId, error }}
     */
    async function generate(options = {}) {
      const totalWeeks    = options.totalWeeks    ?? CONFIG_T.PROGRAM_WEEKS_DEFAULT;
      const deloadInterval = options.deloadInterval ?? Core.CONFIG.DELOAD_INTERVAL_WEEKS;

      // 1. Get profile
      const profile = await Core.Profile.get();
      if (!profile) return { programId: null, error: new Error('Profile not found') };

      const { experience, phase } = profile;
      const user = await Core.Auth.getUser();

      // 2. Deactivate existing active programs
      await Core.getClient()
        .from('programs')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true);

      // 3. Insert program
      const today = Core.utils.isoToday();
      const { data: program, error: pErr } = await Core.getClient()
        .from('programs')
        .insert({
          user_id:          user.id,
          name:             `${phase.charAt(0).toUpperCase() + phase.slice(1)} — ${_selectSplit(experience).name}`,
          phase,
          start_date:       today,
          total_weeks:      totalWeeks,
          deload_interval:  deloadInterval,
          is_active:        true,
        })
        .select('id')
        .single();

      if (pErr) return { programId: null, error: pErr };
      const programId = program.id;

      // 4. Pre-fetch exercise library once
      const allExercises = await ExerciseLibrary.getAll();
      const split        = _selectSplit(experience, profile.preferred_split);
      const weekFlags    = _buildWeekFlags(totalWeeks, deloadInterval);

      // 5. Build each week
      for (const wf of weekFlags) {
        const { data: week, error: wErr } = await Core.getClient()
          .from('program_weeks')
          .insert({
            program_id:    programId,
            week_number:   wf.weekNumber,
            is_deload:     wf.isDeload,
            volume_mod:    wf.volumeMod,
            intensity_mod: wf.intensityMod,
          })
          .select('id')
          .single();

        if (wErr) { console.error('[ApexTraining] Week insert failed:', wErr); continue; }
        const weekId = week.id;

        // 6. Build each day
        for (const dayTemplate of split.days) {
          // Skip pure rest days (no workout_type)
          if (!dayTemplate.workout_type || dayTemplate.workout_type === null) continue;

          const { data: workout, error: woErr } = await Core.getClient()
            .from('planned_workouts')
            .insert({
              program_week_id: weekId,
              day_of_week:     dayTemplate.day_of_week,
              workout_type:    dayTemplate.workout_type,
              label:           dayTemplate.label,
              sort_order:      dayTemplate.day_of_week,
            })
            .select('id')
            .single();

          if (woErr) { console.error('[ApexTraining] Workout insert failed:', woErr); continue; }
          const workoutId = workout.id;

          // 7. For cardio days, no planned_sets — handled by CardioEngine
          if (dayTemplate.workout_type === 'cardio') continue;

          // 8. Build planned sets for strength days
          const usedIds  = new Set();
          const setSpecs = [];
          let   sortOrder = 0;

          for (const slot of dayTemplate.slots) {
            const pool = ExerciseLibrary.filter(
              allExercises,
              slot.muscles,
              slot.is_compound
            );
            const chosen = ExerciseLibrary.pick(pool, slot.count, usedIds);

            for (const ex of chosen) {
              usedIds.add(ex.id);
              let spec = _buildSetSpec(ex, slot.is_compound, phase, sortOrder, workoutId, slot.rep_scheme ?? null);
              if (wf.isDeload) {
                spec = _applyDeloadMods([spec], wf.volumeMod, wf.intensityMod)[0];
              }
              setSpecs.push(spec);
              sortOrder++;
            }
          }

          if (setSpecs.length > 0) {
            const { error: sErr } = await Core.getClient()
              .from('planned_sets')
              .insert(setSpecs);
            if (sErr) console.error('[ApexTraining] Planned sets insert failed:', sErr);
          }
        }
      }

      console.log(`[ApexTraining] Program generated — ID: ${programId} (${totalWeeks} weeks, ${experience})`);
      return { programId, error: null };
    }

    return { generate, getSplits, _selectSplit, _buildWeekFlags, _buildSetSpec, _applyDeloadMods };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 6. WEEKLY PLAN
  // Shapes Supabase data into what the Training tab needs to render.
  // ─────────────────────────────────────────────────────────────────────────

  const WeeklyPlan = (() => {

    /**
     * Fetch the active program's current week + all its workouts.
     * Returns structured data ready for the Training tab to render.
     * @returns {{ week, workouts, program, error }}
     */
    async function getCurrent() {
      const user = await Core.Auth.getUser();
      if (!user) return { week: null, workouts: [], program: null, error: new Error('Not authenticated') };

      // Get active program
      const { data: program, error: pErr } = await Core.getClient()
        .from('programs')
        .select('id, name, phase, start_date, total_weeks, deload_interval')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (pErr || !program) return { week: null, workouts: [], program: null, error: pErr };

      // Determine current week number
      const currentWeekNum = Core.utils.weeksSinceDate(program.start_date) + 1;
      const clampedWeekNum = Math.min(currentWeekNum, program.total_weeks);

      // Get the program_week row
      const { data: week, error: wErr } = await Core.getClient()
        .from('program_weeks')
        .select('id, week_number, is_deload, volume_mod, intensity_mod')
        .eq('program_id', program.id)
        .eq('week_number', clampedWeekNum)
        .single();

      if (wErr || !week) return { week: null, workouts: [], program, error: wErr };

      // Get all workouts for this week with their planned sets + exercises
      const { data: workouts, error: woErr } = await Core.getClient()
        .from('planned_workouts')
        .select(`
          id,
          day_of_week,
          label,
          workout_type,
          planned_sets (
            id,
            exercise_id,
            sets,
            reps_min,
            reps_max,
            rpe_target,
            rest_seconds,
            sort_order,
            notes,
            exercises (
              id,
              name,
              muscle_primary,
              muscles_secondary,
              equipment,
              is_compound
            )
          )
        `)
        .eq('program_week_id', week.id)
        .order('day_of_week');

      if (woErr) return { week, workouts: [], program, error: woErr };

      // Attach completion status from workout_logs for this week's date range
      const weekStart = _weekStartDate(program.start_date, clampedWeekNum);
      const weekEnd   = _weekEndDate(weekStart);

      const { data: logs } = await Core.getClient()
        .from('workout_logs')
        .select('planned_workout_id, log_date')
        .eq('user_id', user.id)
        .gte('log_date', weekStart)
        .lte('log_date', weekEnd);

      const completedSet = new Set((logs ?? []).map(l => l.planned_workout_id));

      const shaped = (workouts ?? []).map(wo => ({
        ...wo,
        is_completed:    completedSet.has(wo.id),
        set_count:       wo.planned_sets?.length ?? 0,
        planned_sets:    (wo.planned_sets ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }));

      return { week, workouts: shaped, program, error: null };
    }

    /**
     * Fetch a single planned_workout with all planned_sets and exercises.
     * Used when the user taps a day cell to view the detailed workout.
     * @param {string} plannedWorkoutId — UUID
     * @returns {{ workout, error }}
     */
    async function getWorkout(plannedWorkoutId) {
      const { data, error } = await Core.getClient()
        .from('planned_workouts')
        .select(`
          id,
          day_of_week,
          label,
          workout_type,
          program_weeks ( is_deload, volume_mod, intensity_mod, programs ( phase ) ),
          planned_sets (
            id,
            exercise_id,
            sets,
            reps_min,
            reps_max,
            rpe_target,
            rest_seconds,
            sort_order,
            notes,
            exercises (
              id,
              name,
              slug,
              muscle_primary,
              muscles_secondary,
              equipment,
              is_compound,
              difficulty,
              instructions,
              video_url
            )
          )
        `)
        .eq('id', plannedWorkoutId)
        .single();

      if (error) return { workout: null, error };

      // Sort sets by sort_order
      if (data.planned_sets) {
        data.planned_sets.sort((a, b) => a.sort_order - b.sort_order);
      }

      return { workout: data, error: null };
    }

    /**
     * Swap one exercise in a planned workout (user-requested substitution).
     * Replaces the exercise_id and recalculates the set spec.
     * @param {string} plannedSetId   — UUID of the planned_set to swap
     * @param {string} newExerciseId  — UUID of the replacement exercise
     * @returns {{ error }}
     */
    async function swapExercise(plannedSetId, newExerciseId) {
      const profile = await Core.Profile.get();

      const { data: newEx } = await Core.getClient()
        .from('exercises')
        .select('is_compound')
        .eq('id', newExerciseId)
        .single();

      const schemeKey = newEx?.is_compound ? 'compound' : 'isolation';
      const scheme    = _REP_SCHEMES[schemeKey][profile?.phase ?? 'maintain'];

      const { error } = await Core.getClient()
        .from('planned_sets')
        .update({
          exercise_id:  newExerciseId,
          sets:         scheme.sets,
          reps_min:     scheme.reps_min,
          reps_max:     scheme.reps_max,
          rpe_target:   scheme.rpe,
          rest_seconds: scheme.rest_seconds,
        })
        .eq('id', plannedSetId);

      return { error };
    }

    // ── Private helpers ────────────────────────────────────────────────────

    function _weekStartDate(programStartIso, weekNumber) {
      const start = new Date(programStartIso);
      start.setDate(start.getDate() + (weekNumber - 1) * 7);
      return start.toISOString().slice(0, 10);
    }

    function _weekEndDate(weekStartIso) {
      const end = new Date(weekStartIso);
      end.setDate(end.getDate() + 6);
      return end.toISOString().slice(0, 10);
    }

    return { getCurrent, getWorkout, swapExercise };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 7. WORKOUT SESSION  (state machine)
  //
  // States: idle → active → completed | abandoned
  //
  // In-memory. Nothing is persisted until completeSession() or abandon().
  // The UI calls logSet() after each set; the state tracks completion.
  // ─────────────────────────────────────────────────────────────────────────

  const WorkoutSession = (() => {

    const _STATES = Object.freeze({
      IDLE:      'idle',
      ACTIVE:    'active',
      COMPLETE:  'completed',
      ABANDONED: 'abandoned',
    });

    let _state = {
      status:            _STATES.IDLE,
      plannedWorkoutId:  null,
      workoutLogId:      null,
      plannedSets:       [],      // full planned_sets list for this workout
      setLogs:           [],      // accumulated set log entries (not yet persisted)
      skipped:           new Set(), // planned_set IDs the user skipped
      timer:             null,
      startedAt:         null,
    };

    /**
     * Begin a workout session.
     * Fetches the planned workout, initialises state, starts the timer.
     * @param {string} plannedWorkoutId — UUID
     * @returns {{ session: object, error }}
     */
    async function start(plannedWorkoutId) {
      if (_state.status === _STATES.ACTIVE) {
        return { session: null, error: new Error('A session is already active — complete or abandon it first') };
      }

      const { workout, error } = await WeeklyPlan.getWorkout(plannedWorkoutId);
      if (error || !workout) return { session: null, error: error ?? new Error('Workout not found') };

      _state = {
        status:           _STATES.ACTIVE,
        plannedWorkoutId,
        workoutLogId:     null,   // set on completeSession()
        plannedSets:      workout.planned_sets ?? [],
        setLogs:          [],
        skipped:          new Set(),
        timer:            SessionTimer.create(),
        startedAt:        new Date(),
      };

      SessionTimer.start(_state.timer);

      // Persist to localStorage immediately as crash protection
      _persistToStorage();

      console.log(`[ApexTraining] Session started — ${workout.label}`);
      return { session: _snapshot(), error: null };
    }

    /**
     * Log one completed set within the active session.
     * Validates input, appends to in-memory setLogs, evaluates overload.
     * @param {object} params
     * @param {string} params.plannedSetId  — UUID of the planned_set being logged
     * @param {string} params.exerciseId    — UUID
     * @param {number} params.setNumber     — 1-indexed set number
     * @param {number} params.weightKg
     * @param {number} params.reps
     * @param {number} params.rpe           — 6.0–10.0
     * @param {boolean} [params.isWarmup]   — warm-up sets are logged but excluded from overload eval
     * @returns {{ log, overload, isPR, error }}
     */
    async function logSet({ plannedSetId, exerciseId, setNumber, weightKg, reps, rpe, isWarmup = false }) {
      if (_state.status !== _STATES.ACTIVE) {
        return { log: null, overload: null, isPR: false, error: new Error('No active session') };
      }

      // Validate
      const validationError = _validateSetLog({ weightKg, reps, rpe, setNumber });
      if (validationError) return { log: null, overload: null, isPR: false, error: validationError };

      // Keep in memory (persisted to DB in completeSession batch)
      const logEntry = {
        planned_set_id: plannedSetId,   // local-only, not a DB column
        exercise_id:    exerciseId,
        set_number:     setNumber,
        weight_kg:      weightKg,
        reps,
        rpe,
        is_warmup:      isWarmup,
        logged_at:      new Date().toISOString(),
      };
      _state.setLogs.push(logEntry);

      // Update localStorage after every set — crash protection
      _persistToStorage();

      // Overload evaluation (only for working sets)
      let overloadResult = { flag: null, nextWeightKg: weightKg, message: null };
      let isPR = false;

      if (!isWarmup) {
        // Find the planned set to get reps_max and muscle group
        const planned       = _state.plannedSets.find(s => s.id === plannedSetId);
        const repsMax       = planned?.reps_max ?? reps;
        const muscleGroup   = planned?.exercises?.muscle_primary ?? 'chest';

        overloadResult = Core.Overload.evaluate({ weightKg, reps, rpe, repsMax, muscleGroup });

        // Upsert PR
        const prResult = await Core.Overload.upsertPR(exerciseId, weightKg, reps);
        isPR = prResult.isPR;
      }

      return { log: logEntry, overload: overloadResult, isPR, error: null };
    }

    /**
     * Mark a planned set as skipped (user chose to skip an exercise).
     * @param {string} plannedSetId — UUID
     */
    function skipSet(plannedSetId) {
      if (_state.status !== _STATES.ACTIVE) return;
      _state.skipped.add(plannedSetId);
    }

    /**
     * Complete the session: write workout_log + all set_logs to Supabase,
     * then run deload check and progression engine.
     * @param {object} [meta]
     * @param {number} [meta.rpeOverall]  — user's overall session RPE
     * @param {string} [meta.notes]
     * @returns {{ workoutLogId, deloadCheck, error }}
     */
    async function completeSession(meta = {}) {
      if (_state.status !== _STATES.ACTIVE) {
        return { workoutLogId: null, deloadCheck: null, error: new Error('No active session') };
      }

      SessionTimer.stop(_state.timer);
      const durationMin = Math.round(SessionTimer.elapsedSeconds(_state.timer) / 60);
      const user        = await Core.Auth.getUser();

      // Write workout_log header (INSERT — RLS policy always exists)
      const { data: workoutLog, error: wlErr } = await Core.getClient()
        .from('workout_logs')
        .insert({
          user_id:            user.id,
          planned_workout_id: _state.plannedWorkoutId,
          log_date:           Core.utils.isoToday(),
          duration_min:       durationMin,
          rpe_overall:        meta.rpeOverall ?? null,
          notes:              meta.notes ?? null,
        })
        .select('id')
        .single();

      if (wlErr) return { workoutLogId: null, deloadCheck: null, error: wlErr };
      const workoutLogId = workoutLog.id;

      // Batch-insert set_logs
      if (_state.setLogs.length > 0) {
        const rows = _state.setLogs.map(({ planned_set_id: _, logged_at: __, ...row }) => ({
          ...row, workout_log_id: workoutLogId,
        }));
        const { error: slErr } = await Core.getClient().from('set_logs').insert(rows);
        if (slErr) console.error('[ApexTraining] set_logs insert failed:', slErr);
      }

      // Clear localStorage crash backup
      try { localStorage.removeItem('apex_active_session'); } catch(e) {}

      // Deload check
      const { data: program } = await Core.getClient()
        .from('programs').select('id')
        .eq('user_id', user.id).eq('is_active', true).single();

      let deloadCheck = null;
      if (program) {
        deloadCheck = await Core.Deload.check(program.id);
        if (deloadCheck.shouldDeload) {
          console.warn('[ApexTraining] Deload triggered:', deloadCheck.reason);
          Core.emit(Core.Events.DELOAD_TRIGGERED, deloadCheck);
        }
        await ProgressionEngine.applyPending(program.id);
      }

      _state.status      = _STATES.COMPLETE;
      _state.workoutLogId = workoutLogId;

      console.log(`[ApexTraining] Session completed — ${durationMin} min, ${_state.setLogs.length} sets logged`);
      return { workoutLogId, deloadCheck, error: null };
    }

    /**
     * Abandon a session without saving set_logs.
     * Writes a workout_log with the 'incomplete' flag so fatigue detection can see it.
     * @param {string} [reason] — optional user-facing reason
     * @returns {{ error }}
     */
    async function abandon(reason = '') {
      if (_state.status !== _STATES.ACTIVE) return { error: null };

      SessionTimer.stop(_state.timer);
      const durationMin = Math.round(SessionTimer.elapsedSeconds(_state.timer) / 60);
      const user        = await Core.Auth.getUser();

      // Delete the in-progress workout_log (and its set_logs via cascade)
      // so abandoned sessions don't pollute stats
      const { error } = await Core.getClient()
        .from('workout_logs')
        .delete()
        .eq('id', _state.workoutLogId);

      _state.status = _STATES.ABANDONED;
      return { error };
    }

    /**
     * Log a past workout without set-by-set detail (backlog).
     * Looks up the planned workout for the given date automatically.
     * @param {object} params
     * @param {string} params.date         — ISO date string e.g. '2025-05-19'
     * @param {number} [params.durationMin]
     * @param {number} [params.rpeOverall]
     * @param {string} [params.notes]
     * @returns {{ workoutLogId, label, error }}
     */
    async function backlog({ date, durationMin = 0, rpeOverall = null, notes = null }) {
      const user = await Core.Auth.getUser();
      if (!user) return { workoutLogId: null, label: null, error: new Error('Not signed in') };

      // Find active program
      const { data: program } = await Core.getClient()
        .from('programs').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();

      let plannedWorkoutId = null;
      let label = null;

      if (program) {
        // Find the program week containing the selected date
        const { data: week } = await Core.getClient()
          .from('program_weeks').select('id')
          .lte('start_date', date).gte('end_date', date)
          .eq('program_id', program.id).maybeSingle();

        if (week) {
          const dayOfWeek = (() => {
            const d = new Date(date + 'T12:00:00').getDay(); // JS: 0=Sun…6=Sat
            return d === 0 ? 6 : d - 1; // convert to Mon=0…Sun=6
          })();
          const { data: pw } = await Core.getClient()
            .from('planned_workouts').select('id, label')
            .eq('program_week_id', week.id).eq('day_of_week', dayOfWeek).maybeSingle();

          if (pw) { plannedWorkoutId = pw.id; label = pw.label; }
        }
      }

      // Build insert — omit planned_workout_id for rest days to avoid NOT NULL errors
      const insertRow = {
        user_id:      user.id,
        log_date:     date,
        duration_min: durationMin,
        rpe_overall:  rpeOverall,
        notes:        notes ? `[Backlog] ${notes}` : '[Backlog]',
      };
      if (plannedWorkoutId) insertRow.planned_workout_id = plannedWorkoutId;

      const { data, error } = await Core.getClient()
        .from('workout_logs')
        .insert(insertRow)
        .select('id').single();

      return { workoutLogId: data?.id ?? null, label, error: error ?? null };
    }

    /**
     * Return a read-only snapshot of the current session state.
     * Safe to pass to UI renderers.
     */
    function getState() {
      return _snapshot();
    }

    // ── Private helpers ────────────────────────────────────────────────────

    function _snapshot() {
      const elapsed = _state.timer ? SessionTimer.elapsedSeconds(_state.timer) : 0;
      const completedIds = new Set(_state.setLogs.map(l => l.planned_set_id));

      return {
        status:           _state.status,
        plannedWorkoutId: _state.plannedWorkoutId,
        elapsedSeconds:   elapsed,
        totalPlannedSets: _state.plannedSets.length,
        completedSets:    _state.setLogs.filter(l => !l.is_warmup).length,
        skippedSets:      _state.skipped.size,
        setLogs:          [..._state.setLogs],
        plannedSets: _state.plannedSets.map(ps => ({
          ...ps,
          is_completed: completedIds.has(ps.id),
          is_skipped:   _state.skipped.has(ps.id),
        })),
      };
    }

    /**
     * Validate a set log entry before accepting it.
     * @returns {Error|null}
     */
    function _validateSetLog({ weightKg, reps, rpe, setNumber }) {
      if (typeof weightKg !== 'number' || weightKg < 0) {
        return new Error('weightKg must be a non-negative number');
      }
      if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
        return new Error('reps must be an integer between 1 and 100');
      }
      if (typeof rpe !== 'number' || rpe < 6 || rpe > 10) {
        return new Error('rpe must be a number between 6 and 10');
      }
      if (!Number.isInteger(setNumber) || setNumber < 1) {
        return new Error('setNumber must be a positive integer');
      }
      return null;
    }

    // ── Crash protection ──────────────────────────────────────
    function _persistToStorage() {
      try {
        if (_state.status !== _STATES.ACTIVE) return;
        localStorage.setItem('apex_active_session', JSON.stringify({
          plannedWorkoutId: _state.plannedWorkoutId,
          sets:             _state.setLogs,
          startedAt:        _state.startedAt instanceof Date
                              ? _state.startedAt.toISOString()
                              : _state.startedAt,
        }));
      } catch(e) { /* storage unavailable */ }
    }

    return {
      start,
      logSet,
      skipSet,
      completeSession,
      abandon,
      backlog,
      getState,
      STATES: _STATES,
      // Expose for testing only
      _validateSetLog,
    };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 8. CARDIO ENGINE
  // ─────────────────────────────────────────────────────────────────────────

  const CardioEngine = (() => {

    /**
     * Return a cardio prescription object for the current phase and week type.
     * Pure function — no Supabase dependency.
     * @param {'bulk'|'cut'|'maintain'} phase
     * @param {boolean}                  isDeload
     * @returns {object} { liss, hiit, weeklyKcalEstimate, notes }
     */
    function prescribe(phase, isDeload) {
      const base = CONFIG_T.CARDIO[phase] ?? CONFIG_T.CARDIO.maintain;

      if (isDeload) {
        // Deload: LISS only, one session, no HIIT
        return {
          liss: { sessions: 1, durationMin: 20, zone: 'Zone 2', notes: 'Deload — one easy LISS session only' },
          hiit: { sessions: 0 },
          weeklyKcalEstimate: 200,
          notes: 'Active recovery week — keep it easy',
        };
      }

      // Estimate weekly cardio kcal (rough: 7 kcal/min LISS, 10 kcal/min HIIT)
      const lissKcal = (base.liss.sessions * base.liss.durationMin * 7);
      const hiitKcal = (base.hiit.sessions ?? 0) * ((base.hiit.durationMin ?? 0) * 10);

      return {
        liss:               base.liss,
        hiit:               base.hiit,
        weeklyKcalEstimate: lissKcal + hiitKcal,
        notes:              _cardioCapNote(phase),
      };
    }

    /**
     * Log a completed cardio session to Supabase.
     * @param {object} params
     * @param {string} params.modality      — 'LISS' | 'HIIT' | 'incline walk' etc.
     * @param {number} params.durationMin
     * @param {string} [params.intensity]   — 'Zone 2', 'Max effort' etc.
     * @param {number} [params.kcalBurned]
     * @param {string} [params.notes]
     * @param {string} [params.programWeekId]
     * @returns {{ data, error }}
     */
    async function log({ modality, durationMin, intensity, kcalBurned, notes, programWeekId }) {
      const user = await Core.Auth.getUser();
      if (!user) return { data: null, error: new Error('Not authenticated') };

      const { data, error } = await Core.getClient()
        .from('cardio_sessions')
        .insert({
          user_id:         user.id,
          program_week_id: programWeekId ?? null,
          session_date:    Core.utils.isoToday(),
          modality,
          duration_min:    durationMin,
          intensity:       intensity ?? null,
          kcal_burned:     kcalBurned ?? null,
          notes:           notes ?? null,
        })
        .select()
        .single();

      return { data, error };
    }

    function _cardioCapNote(phase) {
      const notes = {
        bulk:     'Keep cardio kcal low — protect the surplus',
        cut:      'Total cardio deficit capped at ~750 kcal/week from TDEE',
        maintain: 'Cardio for health, not for aggressive fat loss',
      };
      return notes[phase] ?? '';
    }

    return { prescribe, log };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 9. PROGRESSION ENGINE
  //
  // After each completed session, checks which exercises hit their overload
  // threshold (from strength_prs + set_logs) and bumps planned_sets weights
  // in the next week's copy of the same workout.
  // ─────────────────────────────────────────────────────────────────────────

  const ProgressionEngine = (() => {

    /**
     * Apply pending progressive overload flags to next week's planned sets.
     * Reads recent set_logs, identifies exercises where the user hit reps_max
     * at RPE ≤ 8.5, and updates the planned weight note for next week.
     *
     * Note: The schema stores planned load in notes (as a target weight) because
     * planned_sets doesn't have a weight_kg column — actual load is determined at
     * session time from the user's previous set_logs. This writes a structured
     * note that WorkoutSession.start() reads to pre-populate weight inputs.
     *
     * @param {string} programId — UUID of the active program
     * @returns {{ flaggedCount, error }}
     */
    async function applyPending(programId) {
      const user = await Core.Auth.getUser();
      if (!user) return { flaggedCount: 0, error: new Error('Not authenticated') };

      // Get all exercises logged in the last 7 days with their planned set context
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const { data: recentSets, error: rsErr } = await Core.getClient()
        .from('set_logs')
        .select(`
          exercise_id,
          weight_kg,
          reps,
          rpe,
          workout_logs ( log_date, planned_workout_id ),
          exercises ( muscle_primary, is_compound )
        `)
        .eq('workout_logs.user_id', user.id)
        .gte('workout_logs.log_date', since.toISOString().slice(0, 10))
        .eq('is_warmup', false)
        .order('workout_logs(log_date)', { ascending: false });

      if (rsErr) return { flaggedCount: 0, error: rsErr };

      // Group by exercise, find best set per exercise
      const exerciseMap = new Map();
      for (const s of (recentSets ?? [])) {
        const existing = exerciseMap.get(s.exercise_id);
        if (!existing || s.weight_kg > existing.weight_kg) {
          exerciseMap.set(s.exercise_id, s);
        }
      }

      // Get next week's planned sets for this program
      const currentWeekNum = await _currentWeekNumber(programId);
      const nextWeekNum    = currentWeekNum + 1;

      const { data: nextWeek } = await Core.getClient()
        .from('program_weeks')
        .select('id, is_deload, intensity_mod')
        .eq('program_id', programId)
        .eq('week_number', nextWeekNum)
        .single();

      if (!nextWeek) return { flaggedCount: 0, error: null }; // end of program

      const { data: nextPlannedSets } = await Core.getClient()
        .from('planned_sets')
        .select('id, exercise_id, reps_max, notes, planned_workouts ( program_week_id )')
        .eq('planned_workouts.program_week_id', nextWeek.id);

      if (!nextPlannedSets?.length) return { flaggedCount: 0, error: null };

      // For each next-week planned set, check if we have an overload flag
      let flaggedCount = 0;
      const updates = [];

      for (const ps of nextPlannedSets) {
        const lastSet = exerciseMap.get(ps.exercise_id);
        if (!lastSet) continue;

        const evaluation = Core.Overload.evaluate({
          weightKg:    lastSet.weight_kg,
          reps:        lastSet.reps,
          rpe:         lastSet.rpe,
          repsMax:     ps.reps_max,
          muscleGroup: lastSet.exercises?.muscle_primary ?? 'chest',
        });

        if (evaluation.flag === 'progress') {
          // Apply deload modifier to the suggested weight if next week is a deload
          const nextWeight = nextWeek.is_deload
            ? +(evaluation.nextWeightKg * nextWeek.intensity_mod).toFixed(2)
            : evaluation.nextWeightKg;

          updates.push({
            id:    ps.id,
            notes: `Target: ${nextWeight} kg — ${evaluation.message}`,
          });
          flaggedCount++;
        }
      }

      // Batch update notes
      if (updates.length > 0) {
        for (const u of updates) {
          await Core.getClient()
            .from('planned_sets')
            .update({ notes: u.notes })
            .eq('id', u.id);
        }
      }

      console.log(`[ApexTraining] ProgressionEngine — ${flaggedCount} sets flagged for progression`);
      return { flaggedCount, error: null };
    }

    async function _currentWeekNumber(programId) {
      const { data: program } = await Core.getClient()
        .from('programs')
        .select('start_date')
        .eq('id', programId)
        .single();
      return program ? Core.utils.weeksSinceDate(program.start_date) + 1 : 1;
    }

    return { applyPending };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 10. SESSION TIMER
  //
  // Lightweight, DOM-free stopwatch.
  // Uses performance.now() for sub-millisecond precision.
  // Survives page visibility changes (tracks cumulative elapsed time).
  // ─────────────────────────────────────────────────────────────────────────

  const SessionTimer = (() => {

    /**
     * Create a new timer object (doesn't start automatically).
     * @returns {object} timer handle
     */
    function create() {
      return { _started: null, _accumulated: 0, _running: false };
    }

    /** Start or resume the timer. */
    function start(timer) {
      if (timer._running) return;
      timer._started = performance.now();
      timer._running = true;
    }

    /** Pause the timer, accumulating elapsed time. */
    function stop(timer) {
      if (!timer._running) return;
      timer._accumulated += performance.now() - timer._started;
      timer._started = null;
      timer._running = false;
    }

    /** Reset to zero (does not stop if running). */
    function reset(timer) {
      timer._accumulated = 0;
      if (timer._running) timer._started = performance.now();
    }

    /**
     * Total elapsed time in whole seconds.
     * @param {object} timer
     * @returns {number}
     */
    function elapsedSeconds(timer) {
      const live = timer._running ? (performance.now() - timer._started) : 0;
      return Math.floor((timer._accumulated + live) / 1000);
    }

    /**
     * Format elapsed time as MM:SS or HH:MM:SS.
     * @param {object} timer
     * @returns {string}
     */
    function format(timer) {
      const total   = elapsedSeconds(timer);
      const hours   = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;

      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');

      return hours > 0
        ? `${String(hours).padStart(2, '0')}:${mm}:${ss}`
        : `${mm}:${ss}`;
    }

    return { create, start, stop, reset, elapsedSeconds, format };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 11. PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  return {
    ExerciseLibrary,
    ProgramBuilder,
    WeeklyPlan,
    WorkoutSession,
    CardioEngine,
    ProgressionEngine,
    SessionTimer,
    // Expose pure data for testing and UI rendering
    SPLITS:      _SPLITS,
    REP_SCHEMES: _REP_SCHEMES,
    CONFIG_T,
  };

})();
