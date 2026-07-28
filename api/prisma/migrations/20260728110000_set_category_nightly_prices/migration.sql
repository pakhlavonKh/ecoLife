-- Set real per-night prices by category:
-- lux = 800_000 UZS, standart = 600_000 UZS (all capacities).
UPDATE "price_tiers" AS pt
SET "price_per_night" = 800000.00
FROM "room_categories" AS rc
WHERE pt."category_id" = rc."id"
  AND rc."code" = 'lux';

UPDATE "price_tiers" AS pt
SET "price_per_night" = 600000.00
FROM "room_categories" AS rc
WHERE pt."category_id" = rc."id"
  AND rc."code" = 'standart';

-- Clear rare per-room overrides so category prices apply everywhere.
UPDATE "rooms"
SET "price_override" = NULL
WHERE "price_override" IS NOT NULL;
