'use strict';
// training.js — Apex Fitness training data layer
// Schema: programs > workout_days > workout_exercises; workout_logs > set_logs

window.ApexTraining = (function () {

  if (!window.ApexCore) throw new Error('[ApexTraining] apex-core.js must load first');
  const Core = window.ApexCore;

  // ── Rep schemes ─────────────────────────────────────────────────────────
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


  // ── Split templates ─────────────────────────────────────────────────────
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


  // ── Exercise library ────────────────────────────────────────────────────
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


  // ═══════════════════════════════════════════════════════════════════════
  // PROGRAM BUILDER
  // ═══════════════════════════════════════════════════════════════════════

  const ProgramBuilder = (() => {

    function _selectSplit(experience, preferredSplit) {
      if (preferredSplit && _SPLITS[preferredSplit]) return _SPLITS[preferredSplit];
      return _SPLITS[experience] ?? _SPLITS.intermediate;
    }

    function getSplits() { return _SPLITS; }

    function _getScheme(slot, phase) {
      const key = slot.rep_scheme
        ?? (slot.is_compound ? 'compound' : 'isolation');
      const schemes = _REP_SCHEMES[key] ?? _REP_SCHEMES.compound;
      return schemes[phase] ?? schemes.maintain;
    }

    async function generate({ userId, profile, startDate }) {
      if (!userId || !profile) return { error: new Error('generate() requires userId and profile') };

      const phase      = profile.phase ?? 'maintain';
      const resolvedKey = (profile.preferred_split && _SPLITS[profile.preferred_split])
        ? profile.preferred_split
        : (profile.experience ?? 'intermediate');
      const split = _SPLITS[resolvedKey] ?? _SPLITS.intermediate;

      // Deactivate old programs
      await Core.getClient()
        .from('programs')
        .update({ is_active: false })
        .eq('user_id', userId);

      // Create program
      const { data: prog, error: pErr } = await Core.getClient()
        .from('programs')
        .insert({
          user_id:    userId,
          name:       split.name,
          phase,
          split_key:  resolvedKey,
          start_date: startDate,
          is_active:  true,
        })
        .select('id').single();

      if (pErr) return { error: pErr };

      const allEx   = await ExerciseLibrary.getAll();
      const usedIds = new Set();

      for (const daySpec of split.days) {
        if (!daySpec.slots?.length) continue;  // rest/cardio days — skip

        // Create workout_day
        const { data: wd, error: wdErr } = await Core.getClient()
          .from('workout_days')
          .insert({
            program_id:   prog.id,
            day_of_week:  daySpec.day_of_week,
            label:        daySpec.label,
            workout_type: daySpec.workout_type ?? 'strength',
          })
          .select('id').single();

        if (wdErr || !wd) continue;

        // Pick exercises and build workout_exercises rows
        const rows = [];
        let sortOrder = 0;

        for (const slot of daySpec.slots) {
          const pool   = ExerciseLibrary.filter(allEx, slot.muscles, slot.is_compound);
          const chosen = ExerciseLibrary.pick(pool, slot.count ?? 1, usedIds);

          for (const ex of chosen) {
            usedIds.add(ex.id);
            const scheme = _getScheme(slot, phase);
            rows.push({
              workout_day_id: wd.id,
              exercise_id:    ex.id,
              sets:           scheme.sets,
              reps_min:       scheme.reps_min,
              reps_max:       scheme.reps_max,
              rpe_target:     scheme.rpe,
              rest_seconds:   scheme.rest_seconds,
              sort_order:     sortOrder++,
            });
          }
        }

        if (rows.length) {
          await Core.getClient().from('workout_exercises').insert(rows);
        }
      }

      return { error: null };
    }

    return { generate, getSplits };
  })();

  // ═══════════════════════════════════════════════════════════════════════
  // WEEKLY PLAN
  // Reads the current program state — no week pre-generation.
  // Deload calculated from programs.start_date + programs.deload_every.
  // ═══════════════════════════════════════════════════════════════════════

  const WeeklyPlan = (() => {

    function _weekNumber(startDateIso) {
      const ms = Date.now() - new Date(startDateIso).getTime();
      return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
    }

    function _isDeload(weekNum, deloadEvery) {
      return deloadEvery > 0 && (weekNum + 1) % deloadEvery === 0;
    }

    function _mondayOfCurrentWeek() {
      const d   = new Date();
      const dow = d.getDay();           // 0 = Sun
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0,10);
    }

    function _sundayOfCurrentWeek() {
      const mon = new Date(_mondayOfCurrentWeek());
      mon.setDate(mon.getDate() + 6);
      return mon.toISOString().slice(0,10);
    }

    async function getCurrent() {
      const user = await Core.Auth.getUser();
      if (!user) return { program: null, workouts: [], week: null, error: new Error('Not signed in') };

      // Active program
      const { data: program, error: pErr } = await Core.getClient()
        .from('programs').select('*')
        .eq('user_id', user.id).eq('is_active', true).maybeSingle();

      if (pErr || !program)
        return { program: null, workouts: [], week: null, error: pErr };

      const weekNum  = _weekNumber(program.start_date);
      const isDeload = _isDeload(weekNum, 4);

      // Workout days for this program
      const { data: days } = await Core.getClient()
        .from('workout_days').select('*')
        .eq('program_id', program.id).order('day_of_week');

      // Completed sessions this week
      const { data: logs } = await Core.getClient()
        .from('workout_logs')
        .select('workout_day_id')
        .eq('user_id', user.id)
        .gte('log_date', _mondayOfCurrentWeek())
        .lte('log_date', _sundayOfCurrentWeek());

      const completedIds = new Set((logs ?? []).map(l => l.workout_day_id));

      const workouts = (days ?? []).map(d => ({
        ...d,
        is_completed: completedIds.has(d.id),
      }));

      return {
        program,
        workouts,
        week: { week_number: weekNum + 1, is_deload: isDeload },
        error: null,
      };
    }

    async function getWorkout(workoutDayId) {
      if (!workoutDayId) return { workout: null, error: new Error('No workoutDayId') };

      const { data, error } = await Core.getClient()
        .from('workout_days')
        .select(`
          id, label, workout_type, day_of_week,
          programs!inner(id, phase, start_date),
          workout_exercises(
            id, exercise_id, sets, reps_min, reps_max,
            rpe_target, rest_seconds, sort_order,
            exercises(id, name, muscle_primary, is_compound, equipment, difficulty)
          )
        `)
        .eq('id', workoutDayId)
        .single();

      if (error || !data) return { workout: null, error };

      const prog     = data.programs;
      const weekNum  = Math.max(0, Math.floor(
        (Date.now() - new Date(prog.start_date).getTime()) / (7*24*60*60*1000)));
      const isDeload = _isDeload(weekNum, 4);

      // Sort exercises
      const exercises = (data.workout_exercises ?? []).sort((a,b) => a.sort_order - b.sort_order);

      // Apply deload modifiers if needed
      const plannedSets = isDeload
        ? exercises.map(we => ({ ...we, sets: Math.max(1, Math.round(we.sets * 0.6)), rpe_target: 7 }))
        : exercises;

      return {
        workout: { ...data, planned_sets: plannedSets },
        error: null,
      };
    }

    async function swapExercise(workoutExerciseId, newExerciseId) {
      const { error } = await Core.getClient()
        .from('workout_exercises')
        .update({ exercise_id: newExerciseId })
        .eq('id', workoutExerciseId);
      return { error };
    }

    return { getCurrent, getWorkout, swapExercise };
  })();

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════

  return {
    ExerciseLibrary,
    ProgramBuilder,
    WeeklyPlan,
    // Expose split data for UI
    getSplits: ProgramBuilder.getSplits,
  };

})();

console.log('[ApexTraining] Ready — simplified schema (workout_days / workout_exercises)');
