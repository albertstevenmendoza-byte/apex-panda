/**
 * nutrition.js
 * Apex Fitness — Nutrition Module
 *
 * Responsibilities:
 *   1. CONFIG_N        — nutrition-specific constants + default slot templates
 *   2. MealPlanUtils   — pure helpers (no Supabase): slot templates, validation,
 *                        unit conversions, display formatting
 *   3. MacroAccumulator — pure math: sum items, progress bars, remaining budget,
 *                         over-target flags, per-slot budget splitting
 *   4. FoodArchive     — fetch + in-memory cache for the foods table;
 *                        client-side filter by macro class / whole-food / tags;
 *                        fuzzy name + brand search
 *   5. MealPlan        — CRUD for meal_plans (one per user per day);
 *                        getOrCreateToday() seeds slots + targets from profile;
 *                        getWeekSummary() powers the Stats tab
 *   6. MealSlots       — CRUD for meal_slots (breakfast / lunch / etc.)
 *   7. MealItems       — CRUD for meal_items (food dragged into a slot);
 *                        every write returns refreshed running totals
 *   8. DragDrop        — HTML5 drag-drop coordination; pure state functions
 *                        are DOM-free and fully testable; DOM wiring is separate
 *
 * Dependencies (load before this file):
 *   <script src="...supabase.min.js"></script>
 *   <script src="js/apex-core.js"></script>
 *   <script src="js/nutrition.js"></script>
 */

'use strict';

window.ApexNutrition = (function () {

  if (!window.ApexCore) {
    throw new Error('[ApexNutrition] apex-core.js must be loaded before nutrition.js');
  }
  const Core = window.ApexCore;

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CONFIG_N
  // ─────────────────────────────────────────────────────────────────────────

  const CONFIG_N = {
    FOOD_CACHE_TTL_MS:  600_000,   // 10 min — food archive cache lifetime
    MAX_QUANTITY_G:     5_000,     // hard ceiling on a single food entry (5 kg)
    MIN_QUANTITY_G:     1,         // minimum meaningful quantity
    WEEK_SUMMARY_DAYS:  7,         // days of history for weekly macro averages

    // Calorie coefficients (Atwater)
    KCAL_PER_G: { protein: 4, carb: 4, fat: 9 },

    // Default meal slot templates, keyed by phase.
    // Bulk gets more slots (calorie surplus needs more feeding windows).
    // Cut gets fewer, structured around training.
    DEFAULT_SLOTS: {
      bulk: [
        { label: 'Breakfast',          target_time: '07:00', sort_order: 0 },
        { label: 'Mid-morning snack',  target_time: '10:00', sort_order: 1 },
        { label: 'Lunch',              target_time: '13:00', sort_order: 2 },
        { label: 'Pre-workout',        target_time: '16:00', sort_order: 3 },
        { label: 'Post-workout',       target_time: '18:30', sort_order: 4 },
        { label: 'Dinner',             target_time: '20:00', sort_order: 5 },
        { label: 'Evening snack',      target_time: '21:30', sort_order: 6 },
      ],
      cut: [
        { label: 'Breakfast',          target_time: '07:00', sort_order: 0 },
        { label: 'Lunch',              target_time: '13:00', sort_order: 1 },
        { label: 'Pre-workout',        target_time: '16:00', sort_order: 2 },
        { label: 'Post-workout shake', target_time: '18:30', sort_order: 3 },
        { label: 'Dinner',             target_time: '20:00', sort_order: 4 },
      ],
      maintain: [
        { label: 'Breakfast',          target_time: '07:00', sort_order: 0 },
        { label: 'Lunch',              target_time: '13:00', sort_order: 1 },
        { label: 'Pre-workout',        target_time: '16:30', sort_order: 2 },
        { label: 'Dinner',             target_time: '19:30', sort_order: 3 },
        { label: 'Evening snack',      target_time: '21:00', sort_order: 4 },
      ],
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2. MEAL PLAN UTILS  (pure — no Supabase, fully testable)
  // ─────────────────────────────────────────────────────────────────────────

  const MealPlanUtils = {

    /**
     * Return the default slot template for a given phase.
     * Returns a deep copy so callers can mutate freely.
     * Falls back to 'maintain' for unknown phases.
     * @param {'bulk'|'cut'|'maintain'} phase
     * @returns {Array<{ label, target_time, sort_order }>}
     */
    defaultSlots(phase) {
      const template = CONFIG_N.DEFAULT_SLOTS[phase] ?? CONFIG_N.DEFAULT_SLOTS.maintain;
      return template.map(s => ({ ...s }));
    },

    /**
     * Validate a food quantity in grams.
     * @param {*} g — raw user input
     * @returns {string|null} error message, or null if valid
     */
    validateQuantity(g) {
      const n = Number(g);
      if (!Number.isFinite(n))               return 'Quantity must be a number';
      if (n < CONFIG_N.MIN_QUANTITY_G)       return `Quantity must be at least ${CONFIG_N.MIN_QUANTITY_G} g`;
      if (n > CONFIG_N.MAX_QUANTITY_G)       return `Quantity cannot exceed ${CONFIG_N.MAX_QUANTITY_G} g`;
      return null;
    },

    /**
     * Calculate total kcal from macro grams using Atwater coefficients.
     * @param {{ proteinG, carbsG, fatG }} macros
     * @returns {number} kcal (rounded to nearest integer)
     */
    kcalFromMacros({ proteinG, carbsG, fatG }) {
      const { protein, carb, fat } = CONFIG_N.KCAL_PER_G;
      return Math.round((proteinG * protein) + (carbsG * carb) + (fatG * fat));
    },

    /**
     * Round a macro value for display.
     * @param {number} value
     * @param {number} [decimals=1]
     * @returns {number}
     */
    formatMacro(value, decimals = 1) {
      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    },

    /**
     * Scale a food's per-100g macros to an arbitrary quantity.
     * @param {object} food       — DB foods row (protein_g, carbs_g, fat_g, kcal per 100g)
     * @param {number} quantityG  — actual quantity in grams
     * @returns {{ proteinG, carbsG, fatG, kcal }}
     */
    scaleMacros(food, quantityG) {
      const ratio = quantityG / 100;
      return {
        proteinG: food.protein_g * ratio,
        carbsG:   food.carbs_g   * ratio,
        fatG:     food.fat_g     * ratio,
        kcal:     food.kcal      * ratio,
      };
    },

    /**
     * Build an ISO date string N days offset from today.
     * offset = 0 → today, offset = -1 → yesterday, offset = -6 → 6 days ago
     * @param {number} offset
     * @returns {string} YYYY-MM-DD
     */
    dateOffset(offset) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. MACRO ACCUMULATOR  (pure — no Supabase, fully testable)
  //
  // All functions are stateless. The UI calls these after every MealItems
  // write to recompute bar fills and remaining-budget labels.
  // ─────────────────────────────────────────────────────────────────────────

  const MacroAccumulator = {

    /**
     * Sum macros across an array of meal items.
     * Each item must carry its food object (via Supabase select join).
     * Delegates to Core.Macros.sumItems then rounds via Core.Macros.format.
     *
     * @param {Array<{ quantity_g: number, foods: object }>} items
     *        — items from the meal_items table with foods joined
     * @returns {{ proteinG, carbsG, fatG, kcal }}
     */
    fromItems(items) {
      if (!items || items.length === 0) {
        return { proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 };
      }
      // Normalise: Supabase join returns `foods` (singular) not `food`
      const normalised = items.map(item => ({
        quantity_g: item.quantity_g,
        food: item.foods ?? item.food,
      }));
      return Core.Macros.format(Core.Macros.sumItems(normalised));
    },

    /**
     * Compute fill percentages for each macro progress bar.
     * Values are capped at 100 (over-target shown at full bar, flagged separately).
     *
     * @param {{ proteinG, carbsG, fatG, kcal }} current — fromItems() result
     * @param {{ proteinG, carbsG, fatG, kcal }} target  — from profile
     * @returns {{ proteinPct, carbsPct, fatPct, kcalPct }} — 0–100
     */
    progress(current, target) {
      function pct(val, max) {
        if (!max || max <= 0) return 0;
        return Math.min(100, Math.round((val / max) * 100));
      }
      return {
        proteinPct: pct(current.proteinG, target.proteinG),
        carbsPct:   pct(current.carbsG,   target.carbsG),
        fatPct:     pct(current.fatG,      target.fatG),
        kcalPct:    pct(current.kcal,      target.kcal),
      };
    },

    /**
     * Compute grams/kcal remaining to reach targets.
     * Negative values mean the target has been exceeded.
     *
     * @param {{ proteinG, carbsG, fatG, kcal }} current
     * @param {{ proteinG, carbsG, fatG, kcal }} target
     * @returns {{ proteinG, carbsG, fatG, kcal }} — can be negative
     */
    remaining(current, target) {
      return {
        proteinG: MealPlanUtils.formatMacro(target.proteinG - current.proteinG),
        carbsG:   MealPlanUtils.formatMacro(target.carbsG   - current.carbsG),
        fatG:     MealPlanUtils.formatMacro(target.fatG     - current.fatG),
        kcal:     Math.round(target.kcal - current.kcal),
      };
    },

    /**
     * Return per-macro boolean flags indicating whether the target was exceeded.
     *
     * @param {{ proteinG, carbsG, fatG, kcal }} current
     * @param {{ proteinG, carbsG, fatG, kcal }} target
     * @returns {{ protein, carbs, fat, kcal }} — true = over target
     */
    isOverTarget(current, target) {
      return {
        protein: current.proteinG > target.proteinG,
        carbs:   current.carbsG   > target.carbsG,
        fat:     current.fatG     > target.fatG,
        kcal:    current.kcal     > target.kcal,
      };
    },

    /**
     * Distribute the remaining macro budget evenly across a number of
     * unfilled slots. Used to show per-slot macro targets in the UI
     * (e.g. "you still need 80 g protein across 2 remaining meals").
     *
     * @param {{ proteinG, carbsG, fatG, kcal }} targets   — daily totals
     * @param {{ proteinG, carbsG, fatG, kcal }} eaten     — consumed so far
     * @param {number} remainingSlots — slots that have no items yet
     * @returns {{ proteinG, carbsG, fatG, kcal }} — per-slot suggestion
     */
    budgetSplit(targets, eaten, remainingSlots) {
      if (!remainingSlots || remainingSlots <= 0) {
        return { proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 };
      }
      const rem = MacroAccumulator.remaining(eaten, targets);
      return {
        proteinG: MealPlanUtils.formatMacro(Math.max(0, rem.proteinG) / remainingSlots),
        carbsG:   MealPlanUtils.formatMacro(Math.max(0, rem.carbsG)   / remainingSlots),
        fatG:     MealPlanUtils.formatMacro(Math.max(0, rem.fatG)     / remainingSlots),
        kcal:     Math.round(Math.max(0, rem.kcal) / remainingSlots),
      };
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4. FOOD ARCHIVE  (fetch + in-memory cache + pure client-side filter/search)
  // ─────────────────────────────────────────────────────────────────────────

  const FoodArchive = (() => {
    let _cache     = null;
    let _cacheTime = 0;

    /**
     * Fetch all foods from Supabase with in-memory cache.
     * Returns stale cache on error rather than empty (graceful degradation).
     * @returns {Array} foods
     */
    async function getAll() {
      if (_cache && (Date.now() - _cacheTime) < CONFIG_N.FOOD_CACHE_TTL_MS) {
        return _cache;
      }
      const { data, error } = await Core.getClient()
        .from('foods')
        .select('*')
        .order('name');

      if (error) {
        console.error('[ApexNutrition] FoodArchive.getAll:', error);
        return _cache ?? [];
      }
      _cache     = data ?? [];
      _cacheTime = Date.now();
      return _cache;
    }

    /**
     * Filter a foods array by macro class, whole-food flag, or tags.
     * All filters are optional and combinable (AND logic).
     * Pure — operates on the passed array, not the cache.
     *
     * @param {Array}  foods
     * @param {object} filters
     * @param {string} [filters.macroClass]  — 'protein' | 'carb' | 'fat'
     * @param {boolean}[filters.isWholeFood] — true = whole foods only
     * @param {string} [filters.tag]         — single tag to match
     * @returns {Array}
     */
    function filter(foods, { macroClass, isWholeFood, tag } = {}) {
      return foods.filter(f => {
        if (macroClass  !== undefined && f.macro_class   !== macroClass)   return false;
        if (isWholeFood !== undefined && f.is_whole_food !== isWholeFood)   return false;
        if (tag         !== undefined) {
          if (!Array.isArray(f.tags) || !f.tags.includes(tag))             return false;
        }
        return true;
      });
    }

    /**
     * Case-insensitive substring search across name and brand.
     * Pure — operates on the passed array.
     *
     * @param {Array}  foods
     * @param {string} query — raw user input
     * @returns {Array} matched foods, sorted: name-starts-with first, then contains
     */
    function search(foods, query) {
      const q = (query ?? '').trim().toLowerCase();
      if (!q) return foods;

      const startsWith = [];
      const contains   = [];

      for (const f of foods) {
        const name  = (f.name  ?? '').toLowerCase();
        const brand = (f.brand ?? '').toLowerCase();
        const matchName  = name.includes(q);
        const matchBrand = brand.includes(q);
        if (!matchName && !matchBrand) continue;
        if (name.startsWith(q) || brand.startsWith(q)) startsWith.push(f);
        else                                            contains.push(f);
      }
      return [...startsWith, ...contains];
    }

    /**
     * Get a single food from the cache by ID.
     * Returns null if not found or cache is empty.
     * @param {string} id — UUID
     * @returns {object|null}
     */
    function getById(id) {
      return (_cache ?? []).find(f => f.id === id) ?? null;
    }

    /** Invalidate the cache (call after inserting a custom food). */
    function invalidate() {
      _cache     = null;
      _cacheTime = 0;
    }

    return { getAll, filter, search, getById, invalidate };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 5. MEAL PLAN  (one row per user per day)
  // ─────────────────────────────────────────────────────────────────────────

  const MealPlan = {

    /**
     * The main entry point called on Nutrition tab load.
     * Returns today's plan if it exists; creates one seeded from profile
     * targets and default slots if it doesn't.
     *
     * @returns {{ plan, slots, totals, error }}
     */
    async getOrCreateToday() {
      const today = Core.utils.isoToday();
      const user  = await Core.Auth.getUser();
      if (!user) return { plan: null, slots: [], totals: null, error: new Error('Not authenticated') };

      // Try to fetch existing plan
      let { data: plan, error: fetchErr } = await Core.getClient()
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_date', today)
        .single();

      // PGRST116 = no rows — expected on first visit of the day, not an error
      if (fetchErr && fetchErr.code !== 'PGRST116') {
        return { plan: null, slots: [], totals: null, error: fetchErr };
      }

      if (!plan) {
        // Create a new plan seeded from the user's current profile targets
        const profile = await Core.Profile.getCached();
        const phase   = profile?.phase ?? 'maintain';

        const { data: newPlan, error: createErr } = await Core.getClient()
          .from('meal_plans')
          .insert({
            user_id:        user.id,
            plan_date:      today,
            kcal_target:    profile?.calorie_target   ?? null,
            protein_target: profile?.protein_target_g ?? null,
            carb_target:    profile?.carb_target_g    ?? null,
            fat_target:     profile?.fat_target_g     ?? null,
          })
          .select()
          .single();

        if (createErr) return { plan: null, slots: [], totals: null, error: createErr };
        plan = newPlan;

        // Seed default meal slots for this phase
        const slotTemplates = MealPlanUtils.defaultSlots(phase);
        await Core.getClient()
          .from('meal_slots')
          .insert(slotTemplates.map(s => ({ ...s, meal_plan_id: plan.id })));
      }

      // Fetch slots with their items and joined food data
      const { slots, error: slotsErr } = await MealSlots.getSlots(plan.id);
      if (slotsErr) return { plan, slots: [], totals: null, error: slotsErr };

      // Compute running totals across all slots
      const allItems = slots.flatMap(s => s.meal_items ?? []);
      const totals   = MacroAccumulator.fromItems(allItems);

      return { plan, slots, totals, error: null };
    },

    /**
     * Fetch a plan for any given date (used for history viewing in Stats tab).
     * Returns null plan if no entry exists for that date.
     * @param {string} date — 'YYYY-MM-DD'
     * @returns {{ plan, error }}
     */
    async get(date) {
      const user = await Core.Auth.getUser();
      if (!user) return { plan: null, error: new Error('Not authenticated') };

      const { data: plan, error } = await Core.getClient()
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_date', date)
        .single();

      if (error && error.code === 'PGRST116') return { plan: null, error: null };
      return { plan: plan ?? null, error: error ?? null };
    },

    /**
     * Fetch a plan with all slots, items, and food data fully joined.
     * The shape returned matches what MacroAccumulator.fromItems() expects.
     * @param {string} date — 'YYYY-MM-DD'
     * @returns {{ plan, slots, totals, error }}
     */
    async getWithItems(date) {
      const user = await Core.Auth.getUser();
      if (!user) return { plan: null, slots: [], totals: null, error: new Error('Not authenticated') };

      const { data: plan, error: pErr } = await Core.getClient()
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_date', date)
        .single();

      if (pErr) {
        if (pErr.code === 'PGRST116') return { plan: null, slots: [], totals: null, error: null };
        return { plan: null, slots: [], totals: null, error: pErr };
      }

      const { slots, error: sErr } = await MealSlots.getSlots(plan.id);
      if (sErr) return { plan, slots: [], totals: null, error: sErr };

      const allItems = slots.flatMap(s => s.meal_items ?? []);
      const totals   = MacroAccumulator.fromItems(allItems);

      return { plan, slots, totals, error: null };
    },

    /**
     * Fetch macro actuals for the last N days for Stats tab chart rendering.
     * Returns one entry per day that has a meal_plan row; days with no plan
     * are omitted (user didn't log).
     *
     * @param {number} [days=7]
     * @returns {Array<{ date, proteinG, carbsG, fatG, kcal, proteinTarget, kcalTarget }>}
     */
    async getWeekSummary(days = CONFIG_N.WEEK_SUMMARY_DAYS) {
      const user = await Core.Auth.getUser();
      if (!user) return [];

      const since = MealPlanUtils.dateOffset(-(days - 1));

      const { data: plans, error } = await Core.getClient()
        .from('meal_plans')
        .select(`
          id,
          plan_date,
          kcal_target,
          protein_target,
          meal_slots (
            meal_items (
              quantity_g,
              foods ( protein_g, carbs_g, fat_g, kcal )
            )
          )
        `)
        .eq('user_id', user.id)
        .gte('plan_date', since)
        .order('plan_date');

      if (error) { console.error('[ApexNutrition] MealPlan.getWeekSummary:', error); return []; }

      return (plans ?? []).map(plan => {
        const allItems = (plan.meal_slots ?? []).flatMap(s => s.meal_items ?? []);
        const totals   = MacroAccumulator.fromItems(allItems);
        return {
          date:           plan.plan_date,
          proteinG:       totals.proteinG,
          carbsG:         totals.carbsG,
          fatG:           totals.fatG,
          kcal:           totals.kcal,
          proteinTarget:  plan.protein_target,
          kcalTarget:     plan.kcal_target,
        };
      });
    },

    /**
     * Update a meal plan's target macros (e.g. after a profile phase change).
     * @param {string} planId
     * @param {object} fields — any subset of { kcal_target, protein_target, carb_target, fat_target }
     * @returns {{ data, error }}
     */
    async update(planId, fields) {
      const { data, error } = await Core.getClient()
        .from('meal_plans')
        .update(fields)
        .eq('id', planId)
        .select()
        .single();

      return { data, error };
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 6. MEAL SLOTS
  // ─────────────────────────────────────────────────────────────────────────

  const MealSlots = {

    /**
     * Fetch all slots for a plan, fully joined with items and food data.
     * Items within each slot are sorted by sort_order.
     * @param {string} mealPlanId
     * @returns {{ slots, error }}
     */
    async getSlots(mealPlanId) {
      const { data, error } = await Core.getClient()
        .from('meal_slots')
        .select(`
          id,
          label,
          target_time,
          sort_order,
          meal_items (
            id,
            quantity_g,
            sort_order,
            foods (
              id,
              name,
              brand,
              serving_size_g,
              kcal,
              protein_g,
              carbs_g,
              fat_g,
              fiber_g,
              macro_class
            )
          )
        `)
        .eq('meal_plan_id', mealPlanId)
        .order('sort_order');

      if (error) return { slots: [], error };

      // Sort items within each slot by sort_order
      const slots = (data ?? []).map(slot => ({
        ...slot,
        meal_items: (slot.meal_items ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }));

      return { slots, error: null };
    },

    /**
     * Add a new custom slot to a meal plan.
     * @param {string} mealPlanId
     * @param {string} label      — e.g. 'Post-cardio shake'
     * @param {string} [targetTime] — 'HH:MM'
     * @returns {{ data, error }}
     */
    async addSlot(mealPlanId, label, targetTime = null) {
      // Place new slot at the end
      const { count } = await Core.getClient()
        .from('meal_slots')
        .select('id', { count: 'exact', head: true })
        .eq('meal_plan_id', mealPlanId);

      const { data, error } = await Core.getClient()
        .from('meal_slots')
        .insert({
          meal_plan_id: mealPlanId,
          label,
          target_time:  targetTime,
          sort_order:   count ?? 99,
        })
        .select()
        .single();

      return { data, error };
    },

    /**
     * Remove a slot (meal_items cascade via FK on delete cascade in schema).
     * @param {string} slotId
     * @returns {{ error }}
     */
    async removeSlot(slotId) {
      const { error } = await Core.getClient()
        .from('meal_slots')
        .delete()
        .eq('id', slotId);

      return { error };
    },

    /**
     * Update sort_order for a slot (drag-to-reorder slots).
     * @param {string} slotId
     * @param {number} newOrder
     * @returns {{ error }}
     */
    async reorder(slotId, newOrder) {
      const { error } = await Core.getClient()
        .from('meal_slots')
        .update({ sort_order: newOrder })
        .eq('id', slotId);

      return { error };
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7. MEAL ITEMS
  //
  // Every mutating operation (add / remove / update) returns refreshed
  // running totals so the UI can re-render macro bars without a separate call.
  // ─────────────────────────────────────────────────────────────────────────

  const MealItems = {

    /**
     * Add a food to a meal slot.
     * Called when the user drops a food card from the archive into a slot.
     *
     * @param {string} slotId     — UUID of the target meal_slot
     * @param {string} foodId     — UUID of the food being added
     * @param {number} quantityG  — grams
     * @returns {{ item, totals, error }}
     */
    async add(slotId, foodId, quantityG) {
      const validationErr = MealPlanUtils.validateQuantity(quantityG);
      if (validationErr) return { item: null, totals: null, error: new Error(validationErr) };

      const { data: item, error: insertErr } = await Core.getClient()
        .from('meal_items')
        .insert({
          meal_slot_id: slotId,
          food_id:      foodId,
          quantity_g:   quantityG,
          sort_order:   0,
        })
        .select(`
          id,
          quantity_g,
          sort_order,
          foods ( id, name, kcal, protein_g, carbs_g, fat_g, macro_class )
        `)
        .single();

      if (insertErr) return { item: null, totals: null, error: insertErr };

      // Totals are recalculated by the caller when the diary reloads;
      // skip the extra round-trips here.
      return { item, totals: null, error: null };
    },

    /**
     * Remove a food item from a slot.
     * @param {string} itemId    — UUID of the meal_item to delete
     * @param {string} slotId    — needed to trace back to meal_plan for totals refresh
     * @returns {{ totals, error }}
     */
    async remove(itemId, slotId) {
      const { error } = await Core.getClient()
        .from('meal_items')
        .delete()
        .eq('id', itemId);

      if (error) return { totals: null, error };

      const mealPlanId = await MealItems._mealPlanIdFromSlot(slotId);
      const totals     = await MealItems._fetchTotals(mealPlanId);

      return { totals, error: null };
    },

    /**
     * Update the quantity of an existing meal item.
     * Called when user edits the gram field inline in a slot.
     *
     * @param {string} itemId
     * @param {number} quantityG
     * @param {string} slotId — for totals refresh
     * @returns {{ totals, error }}
     */
    async updateQuantity(itemId, quantityG, slotId) {
      const validationErr = MealPlanUtils.validateQuantity(quantityG);
      if (validationErr) return { totals: null, error: new Error(validationErr) };

      const { error } = await Core.getClient()
        .from('meal_items')
        .update({ quantity_g: quantityG })
        .eq('id', itemId);

      if (error) return { totals: null, error };

      const mealPlanId = await MealItems._mealPlanIdFromSlot(slotId);
      const totals     = await MealItems._fetchTotals(mealPlanId);

      return { totals, error: null };
    },

    /**
     * Move a meal item from one slot to another (drag between slots).
     * Updates the meal_slot_id foreign key and resets sort_order.
     *
     * @param {string} itemId
     * @param {string} newSlotId
     * @param {string} originalSlotId — for meal_plan_id lookup
     * @returns {{ totals, error }}
     */
    async moveToSlot(itemId, newSlotId, originalSlotId) {
      const { count } = await Core.getClient()
        .from('meal_items')
        .select('id', { count: 'exact', head: true })
        .eq('meal_slot_id', newSlotId);

      const { error } = await Core.getClient()
        .from('meal_items')
        .update({ meal_slot_id: newSlotId, sort_order: count ?? 0 })
        .eq('id', itemId);

      if (error) return { totals: null, error };

      const mealPlanId = await MealItems._mealPlanIdFromSlot(originalSlotId);
      const totals     = await MealItems._fetchTotals(mealPlanId);

      return { totals, error: null };
    },

    /**
     * Recompute running macro totals for an entire day's meal plan.
     * Fetches all items across all slots and runs MacroAccumulator.fromItems.
     * @param {string} mealPlanId
     * @returns {{ proteinG, carbsG, fatG, kcal }}
     */
    async _fetchTotals(mealPlanId) {
      if (!mealPlanId) return { proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 };

      const { data } = await Core.getClient()
        .from('meal_items')
        .select(`
          quantity_g,
          meal_slots!inner ( meal_plan_id ),
          foods ( protein_g, carbs_g, fat_g, kcal )
        `)
        .eq('meal_slots.meal_plan_id', mealPlanId);

      return MacroAccumulator.fromItems(data ?? []);
    },

    /**
     * Resolve a meal_plan_id from a meal_slot_id.
     * Cached per-slot in a local WeakMap to avoid repeated round-trips.
     * @param {string} slotId
     * @returns {string|null} mealPlanId
     */
    _slotPlanCache: new Map(),

    async _mealPlanIdFromSlot(slotId) {
      if (MealItems._slotPlanCache.has(slotId)) {
        return MealItems._slotPlanCache.get(slotId);
      }
      const { data } = await Core.getClient()
        .from('meal_slots')
        .select('meal_plan_id')
        .eq('id', slotId)
        .single();

      const planId = data?.meal_plan_id ?? null;
      if (planId) MealItems._slotPlanCache.set(slotId, planId);
      return planId;
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 8. DRAG DROP
  //
  // Architecture:
  //   - Pure state functions (setDragging, getDragging, etc.) are testable
  //     without a DOM and contain no HTML5 API references.
  //   - DOM wiring functions (initArchiveCard, initSlot, initSlotItem) attach
  //     HTML5 drag event listeners and call the state functions + MealItems.
  //   - The UI layer never needs to know which food is being dragged —
  //     it just calls initSlot() with a callback and DragDrop handles the rest.
  // ─────────────────────────────────────────────────────────────────────────

  const DragDrop = (() => {

    // Internal drag state — pure, no DOM
    let _dragging = null;

    /**
     * Set the item currently being dragged.
     * @param {{ type: 'archive'|'slot', foodId: string, itemId?: string, slotId?: string, foodName: string }} data
     */
    function setDragging(data) {
      _dragging = data ? { ...data } : null;
    }

    /** Return the current drag payload, or null. */
    function getDragging() {
      return _dragging ? { ..._dragging } : null;
    }

    /** Clear drag state (call on dragend or drop). */
    function clearDragging() {
      _dragging = null;
    }

    /** Whether a drag is in progress. */
    function isDragging() {
      return _dragging !== null;
    }

    /**
     * Whether the current drag payload originated from the archive panel
     * (as opposed to an existing slot item being moved).
     */
    function isDraggingFromArchive() {
      return _dragging?.type === 'archive';
    }

    // ── DOM wiring ───────────────────────────────────────────────────────

    /**
     * Attach HTML5 dragstart to a food card in the archive panel.
     * @param {HTMLElement} el   — the food card element
     * @param {object}      food — DB foods row
     */
    function initArchiveCard(el, food) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', e => {
        setDragging({ type: 'archive', foodId: food.id, foodName: food.name });
        e.dataTransfer.effectAllowed = 'copy';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        clearDragging();
        el.classList.remove('dragging');
      });
    }

    /**
     * Attach HTML5 dragover / dragleave / drop to a meal slot container.
     * On drop: calls MealItems.add or MealItems.moveToSlot depending on drag source,
     * then fires onDropCb with the updated totals so the UI can re-render.
     *
     * @param {HTMLElement} el        — the slot drop zone element
     * @param {string}      slotId    — UUID
     * @param {number}      [defaultQuantityG=100] — quantity used when dropping from archive
     * @param {Function}    onDropCb  — called with ({ totals, item?, error })
     */
    function initSlot(el, slotId, onDropCb, defaultQuantityG = 100) {
      el.addEventListener('dragover', e => {
        if (!isDragging()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isDraggingFromArchive() ? 'copy' : 'move';
        el.classList.add('drag-over');
      });

      el.addEventListener('dragleave', e => {
        // Only remove class when leaving the slot entirely (not entering a child)
        if (!el.contains(e.relatedTarget)) {
          el.classList.remove('drag-over');
        }
      });

      el.addEventListener('drop', async e => {
        e.preventDefault();
        el.classList.remove('drag-over');

        const payload = getDragging();
        clearDragging();
        if (!payload) return;

        if (payload.type === 'archive') {
          // New food from archive → add with default quantity
          const result = await MealItems.add(slotId, payload.foodId, defaultQuantityG);
          onDropCb({ ...result, foodName: payload.foodName });
        } else if (payload.type === 'slot' && payload.slotId !== slotId) {
          // Existing item being moved between slots
          const result = await MealItems.moveToSlot(payload.itemId, slotId, payload.slotId);
          onDropCb({ ...result });
        }
        // If type === 'slot' and same slotId, it's a drop onto itself — ignore
      });
    }

    /**
     * Attach HTML5 dragstart/dragend to an existing meal item within a slot.
     * Enables drag-between-slots for items already in the plan.
     *
     * @param {HTMLElement} el   — the meal item element
     * @param {object}      item — meal_items row with { id, meal_slot_id, foods }
     */
    function initSlotItem(el, item) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', e => {
        setDragging({
          type:    'slot',
          itemId:  item.id,
          slotId:  item.meal_slot_id,
          foodId:  item.foods?.id,
          foodName: item.foods?.name ?? 'Food item',
        });
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        clearDragging();
        el.classList.remove('dragging');
      });
    }

    return {
      // Pure state — testable without DOM
      setDragging,
      getDragging,
      clearDragging,
      isDragging,
      isDraggingFromArchive,
      // DOM wiring
      initArchiveCard,
      initSlot,
      initSlotItem,
    };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // 9. PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  return {
    CONFIG_N,
    MealPlanUtils,
    MacroAccumulator,
    FoodArchive,
    MealPlan,
    MealSlots,
    MealItems,
    DragDrop,
  };

})();
