-- Age-based guest pricing: adults / children / infants with separate category rates.
-- Occupancy beds = adults + children (infants do not take a bed).

-- 1) Category prices
ALTER TABLE "room_categories"
  ADD COLUMN "price_adult" DECIMAL(14, 2),
  ADD COLUMN "price_child" DECIMAL(14, 2),
  ADD COLUMN "price_infant" DECIMAL(14, 2);

UPDATE "room_categories"
SET
  "price_adult" = "price_per_bed_per_night",
  "price_child" = CASE
    WHEN "code" = 'lux' THEN 400000.00
    WHEN "code" = 'standart' THEN 300000.00
    ELSE ROUND("price_per_bed_per_night" / 2, 2)
  END,
  "price_infant" = 0.00;

ALTER TABLE "room_categories"
  ALTER COLUMN "price_adult" SET NOT NULL,
  ALTER COLUMN "price_child" SET NOT NULL,
  ALTER COLUMN "price_infant" SET NOT NULL;

ALTER TABLE "room_categories"
  DROP COLUMN "price_per_bed_per_night";

-- 2) Booking guest breakdown (migrate old beds_total → adults)
ALTER TABLE "bookings"
  ADD COLUMN "adults" INTEGER,
  ADD COLUMN "children" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "infants" INTEGER NOT NULL DEFAULT 0;

UPDATE "bookings"
SET "adults" = "beds_total",
    "children" = 0,
    "infants" = 0;

ALTER TABLE "bookings"
  ALTER COLUMN "adults" SET NOT NULL;

ALTER TABLE "bookings"
  ALTER COLUMN "children" DROP DEFAULT,
  ALTER COLUMN "infants" DROP DEFAULT;
