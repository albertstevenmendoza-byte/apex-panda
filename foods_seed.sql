-- =============================================================
-- foods_seed.sql
-- Apex Fitness — Food Library Seed
--
-- 78 foods across three macro classes.
-- All macros are per 100 g — the app calculates using quantity_g / 100.
-- Sources: USDA FoodData Central (SR Legacy, April 2024 release).
-- Kcal values match USDA labels; high-fiber foods (nuts, seeds, leafy
-- vegetables) may differ slightly from strict Atwater (P×4 + C×4 + F×9)
-- because the USDA applies modified Atwater factors for fiber.
--
-- Idempotency:
--   A UNIQUE constraint on (name, created_by) is added so re-running
--   the script safely skips already-present system rows.
--   User-created foods (created_by IS NOT NULL) are unaffected.
-- =============================================================

-- ── Unique constraint for idempotent seeding ─────────────────
-- NULLS NOT DISTINCT treats two NULL created_by values as equal,
-- so two system foods with the same name violate the constraint.
-- Users can still add their own food named "Chicken breast" without conflict.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'foods_name_creator_unique'
  ) THEN
    ALTER TABLE public.foods
      ADD CONSTRAINT foods_name_creator_unique
      UNIQUE NULLS NOT DISTINCT (name, created_by);
  END IF;
END$$;

INSERT INTO public.foods (
  name,
  brand,
  serving_size_g,
  kcal,
  protein_g,
  carbs_g,
  fat_g,
  fiber_g,
  sugar_g,
  macro_class,
  is_whole_food,
  tags,
  created_by
) VALUES

-- =============================================================
-- PROTEINS
-- Classified as protein where protein is the primary fitness use,
-- even when fat contributes more calories (salmon, whole eggs).
-- =============================================================

(
  'Chicken breast (cooked)',
  NULL, 100, 165, 31.0, 0.0, 3.6, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Turkey breast (cooked)',
  NULL, 100, 135, 30.0, 0.0, 1.0, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Salmon, Atlantic (raw)',
  NULL, 100, 208, 20.1, 0.0, 12.8, 0.0, 0.0, 'protein', true,
  ARRAY['dairy-free','gluten-free','omega-3'], NULL
),
(
  'Tuna, canned in water',
  NULL, 100, 116, 25.5, 0.0, 1.0, 0.0, 0.0, 'protein', false,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Tilapia (raw)',
  NULL, 100, 96, 20.1, 0.0, 1.7, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Cod (raw)',
  NULL, 100, 82, 17.8, 0.0, 0.7, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Shrimp (cooked)',
  NULL, 100, 99, 23.5, 0.2, 0.3, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Sardines, canned in water',
  NULL, 100, 136, 22.0, 0.0, 5.0, 0.0, 0.0, 'protein', false,
  ARRAY['dairy-free','gluten-free','omega-3'], NULL
),
(
  'Lean beef mince (93%), cooked',
  NULL, 100, 200, 26.0, 0.0, 10.0, 0.0, 0.0, 'protein', true,
  ARRAY['dairy-free','gluten-free'], NULL
),
(
  'Beef sirloin (raw)',
  NULL, 100, 158, 22.0, 0.0, 7.5, 0.0, 0.0, 'protein', true,
  ARRAY['dairy-free','gluten-free'], NULL
),
(
  'Pork tenderloin (raw)',
  NULL, 100, 109, 19.8, 0.0, 2.5, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Whole eggs',
  NULL, 100, 155, 12.6, 1.1, 10.6, 0.0, 0.4, 'protein', true,
  ARRAY['dairy-free','gluten-free','vegetarian'], NULL
),
(
  'Egg whites',
  NULL, 100, 52, 10.9, 0.7, 0.2, 0.0, 0.6, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free','vegetarian'], NULL
),
(
  'Greek yogurt, 0% fat',
  NULL, 100, 59, 10.0, 3.6, 0.4, 0.0, 3.2, 'protein', true,
  ARRAY['lean','gluten-free','vegetarian'], NULL
),
(
  'Cottage cheese, low-fat',
  NULL, 100, 72, 12.5, 2.7, 1.0, 0.0, 2.7, 'protein', true,
  ARRAY['lean','gluten-free','vegetarian'], NULL
),
(
  'Skyr, plain',
  NULL, 100, 63, 11.0, 4.0, 0.2, 0.0, 4.0, 'protein', true,
  ARRAY['lean','gluten-free','vegetarian'], NULL
),
(
  'Firm tofu',
  NULL, 100, 76, 8.1, 1.9, 4.2, 0.3, 0.5, 'protein', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Edamame (cooked)',
  NULL, 100, 121, 11.9, 8.9, 5.2, 5.2, 2.2, 'protein', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Lentils (cooked)',
  NULL, 100, 116, 9.0, 20.1, 0.4, 7.9, 1.8, 'protein', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Chickpeas (cooked)',
  NULL, 100, 164, 8.9, 27.4, 2.6, 7.6, 4.8, 'protein', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Black beans (cooked)',
  NULL, 100, 132, 8.9, 23.7, 0.5, 8.7, 0.3, 'protein', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Tempeh',
  NULL, 100, 193, 18.5, 9.4, 10.8, 4.5, 0.0, 'protein', true,
  ARRAY['dairy-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Bison, ground (raw)',
  NULL, 100, 146, 20.2, 0.0, 7.2, 0.0, 0.0, 'protein', true,
  ARRAY['lean','dairy-free','gluten-free'], NULL
),
(
  'Whey protein isolate',
  NULL, 100, 370, 88.0, 4.0, 1.5, 0.0, 3.5, 'protein', false,
  ARRAY['lean','gluten-free'], NULL
),
(
  'Casein protein',
  NULL, 100, 350, 78.0, 6.0, 2.0, 0.0, 3.0, 'protein', false,
  ARRAY['lean','gluten-free'], NULL
),

-- =============================================================
-- CARBOHYDRATES
-- Starchy staples, grains, fruits, and vegetables where carbs
-- are the dominant caloric contributor.
-- =============================================================

(
  'White rice (cooked)',
  NULL, 100, 130, 2.7, 28.7, 0.3, 0.4, 0.1, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan'], NULL
),
(
  'Brown rice (cooked)',
  NULL, 100, 123, 2.7, 25.6, 1.0, 1.8, 0.3, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','high-fiber'], NULL
),
(
  'Oats, rolled (dry)',
  NULL, 100, 389, 16.9, 66.3, 6.9, 10.6, 1.1, 'carb', true,
  ARRAY['dairy-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Sweet potato (raw)',
  NULL, 100, 86, 1.6, 20.1, 0.1, 3.0, 4.2, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'White potato (raw)',
  NULL, 100, 77, 2.0, 17.5, 0.1, 2.1, 0.8, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Pasta, dry (semolina)',
  NULL, 100, 371, 13.0, 74.7, 1.5, 3.2, 2.7, 'carb', true,
  ARRAY['dairy-free','vegan','vegetarian'], NULL
),
(
  'Whole wheat pasta (dry)',
  NULL, 100, 356, 13.4, 72.2, 1.9, 10.7, 2.5, 'carb', true,
  ARRAY['dairy-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Whole wheat bread',
  NULL, 100, 247, 9.0, 48.5, 3.4, 6.8, 6.1, 'carb', true,
  ARRAY['vegan','vegetarian','high-fiber'], NULL
),
(
  'Sourdough bread',
  NULL, 100, 274, 9.1, 53.4, 1.4, 2.9, 3.2, 'carb', true,
  ARRAY['vegan','vegetarian'], NULL
),
(
  'Quinoa (cooked)',
  NULL, 100, 120, 4.4, 21.3, 1.9, 2.8, 0.9, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Banana',
  NULL, 100, 89, 1.1, 22.8, 0.3, 2.6, 12.2, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Apple',
  NULL, 100, 52, 0.3, 13.8, 0.2, 2.4, 10.4, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Blueberries',
  NULL, 100, 57, 0.7, 14.5, 0.3, 2.4, 9.9, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Orange',
  NULL, 100, 47, 0.9, 11.8, 0.1, 2.4, 9.4, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Mango',
  NULL, 100, 60, 0.8, 15.0, 0.4, 1.6, 13.7, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Dates (Medjool)',
  NULL, 100, 277, 1.8, 74.9, 0.2, 6.7, 63.4, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Strawberries',
  NULL, 100, 32, 0.7, 7.7, 0.3, 2.0, 4.9, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Broccoli (raw)',
  NULL, 100, 34, 2.8, 6.6, 0.4, 2.6, 1.7, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Spinach (raw)',
  NULL, 100, 23, 2.9, 3.6, 0.4, 2.2, 0.4, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Sweet corn (cooked)',
  NULL, 100, 108, 3.3, 25.1, 1.4, 2.7, 4.5, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Rice cakes (plain)',
  NULL, 100, 387, 8.2, 81.5, 2.8, 1.5, 0.2, 'carb', false,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Bagel, plain',
  NULL, 100, 270, 10.0, 53.4, 1.7, 2.1, 5.1, 'carb', false,
  ARRAY['vegan','vegetarian'], NULL
),
(
  'Honey',
  NULL, 100, 304, 0.3, 82.4, 0.0, 0.2, 82.1, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegetarian'], NULL
),
(
  'Pineapple',
  NULL, 100, 50, 0.5, 13.1, 0.1, 1.4, 9.9, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Watermelon',
  NULL, 100, 30, 0.6, 7.6, 0.2, 0.4, 6.2, 'carb', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),

-- =============================================================
-- FATS
-- Foods where fat is the dominant caloric source.
-- Includes nuts, seeds, oils, full-fat dairy, and avocado.
-- =============================================================

(
  'Almonds (raw)',
  NULL, 100, 579, 21.2, 21.6, 49.9, 12.5, 4.4, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Cashews (raw)',
  NULL, 100, 553, 18.2, 30.2, 43.9, 3.3, 5.9, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Walnuts',
  NULL, 100, 654, 15.2, 13.7, 65.2, 6.7, 2.6, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','omega-3','high-fiber'], NULL
),
(
  'Peanut butter (natural)',
  NULL, 100, 588, 25.1, 19.6, 50.0, 5.7, 8.4, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Almond butter',
  NULL, 100, 614, 20.9, 18.8, 55.5, 7.4, 6.6, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Sunflower seeds',
  NULL, 100, 584, 20.8, 20.0, 51.5, 8.6, 2.6, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Pumpkin seeds',
  NULL, 100, 559, 30.2, 10.7, 49.0, 6.0, 1.4, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Chia seeds',
  NULL, 100, 486, 16.5, 42.1, 30.7, 34.4, 0.0, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','omega-3','high-fiber'], NULL
),
(
  'Flaxseeds',
  NULL, 100, 534, 18.3, 28.9, 42.2, 27.3, 1.5, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','omega-3','high-fiber'], NULL
),
(
  'Olive oil (extra virgin)',
  NULL, 100, 884, 0.0, 0.0, 100.0, 0.0, 0.0, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Coconut oil',
  NULL, 100, 862, 0.0, 0.0, 100.0, 0.0, 0.0, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Avocado',
  NULL, 100, 160, 2.0, 8.5, 14.7, 6.7, 0.7, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Cheddar cheese',
  NULL, 100, 403, 24.9, 1.3, 33.1, 0.0, 0.5, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Mozzarella, part-skim',
  NULL, 100, 254, 24.4, 2.2, 15.9, 0.0, 1.0, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Full-fat Greek yogurt',
  NULL, 100, 100, 9.0, 3.6, 5.0, 0.0, 3.2, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Cream cheese',
  NULL, 100, 342, 6.2, 4.1, 34.0, 0.0, 3.2, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Heavy cream',
  NULL, 100, 340, 2.8, 2.8, 36.0, 0.0, 2.8, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Dark chocolate (70-85%)',
  NULL, 100, 598, 7.8, 45.9, 42.6, 10.9, 24.2, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Whole milk',
  NULL, 100, 61, 3.2, 4.8, 3.3, 0.0, 5.1, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Brazil nuts',
  NULL, 100, 659, 14.3, 11.7, 67.1, 7.5, 2.3, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Macadamia nuts',
  NULL, 100, 718, 7.9, 13.8, 75.8, 8.6, 4.6, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Pecans',
  NULL, 100, 691, 9.2, 13.9, 72.0, 9.6, 4.0, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Tahini',
  NULL, 100, 595, 17.0, 21.2, 53.8, 9.3, 0.5, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian','high-fiber'], NULL
),
(
  'Coconut milk (canned)',
  NULL, 100, 197, 2.0, 5.6, 21.3, 0.0, 3.3, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegan','vegetarian'], NULL
),
(
  'Egg yolks',
  NULL, 100, 322, 15.9, 3.6, 26.5, 0.0, 0.5, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegetarian'], NULL
),
(
  'Butter (unsalted)',
  NULL, 100, 717, 0.9, 0.1, 81.1, 0.0, 0.1, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
),
(
  'Ghee',
  NULL, 100, 900, 0.0, 0.0, 99.5, 0.0, 0.0, 'fat', true,
  ARRAY['dairy-free','gluten-free','vegetarian'], NULL
),
(
  'Gouda cheese',
  NULL, 100, 356, 24.9, 2.2, 27.4, 0.0, 2.2, 'fat', true,
  ARRAY['gluten-free','vegetarian'], NULL
)

ON CONFLICT (name, created_by) DO NOTHING;

-- =============================================================
-- Verification query — run after seeding to confirm coverage
-- =============================================================
-- SELECT
--   macro_class,
--   COUNT(*)               AS food_count,
--   ROUND(AVG(protein_g),1) AS avg_protein_g,
--   ROUND(AVG(carbs_g),1)   AS avg_carbs_g,
--   ROUND(AVG(fat_g),1)     AS avg_fat_g
-- FROM public.foods
-- WHERE created_by IS NULL
-- GROUP BY macro_class
-- ORDER BY macro_class;