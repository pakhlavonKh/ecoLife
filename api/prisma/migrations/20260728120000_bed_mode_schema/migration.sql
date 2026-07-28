-- Phase 1 (BED_MODE): per-bed schema DDL only.
-- Does NOT insert room_locks backfill — that runs separately after owner OK.

-- 1) Drop whole-room anti-overlap (sharing beds is now allowed)
ALTER TABLE "booking_rooms" DROP CONSTRAINT IF EXISTS "booking_rooms_no_overlap";

-- 2) Price per bed per night on category (category-only, not capacity)
ALTER TABLE "room_categories"
  ADD COLUMN "price_per_bed_per_night" DECIMAL(14,2);

UPDATE "room_categories"
SET "price_per_bed_per_night" = 800000.00
WHERE "code" = 'lux';

UPDATE "room_categories"
SET "price_per_bed_per_night" = 600000.00
WHERE "code" = 'standart';

-- Fallback for any unexpected category rows: take min tier price
UPDATE "room_categories" AS rc
SET "price_per_bed_per_night" = sub.min_price
FROM (
  SELECT "category_id", MIN("price_per_night") AS min_price
  FROM "price_tiers"
  GROUP BY "category_id"
) AS sub
WHERE rc."id" = sub."category_id"
  AND rc."price_per_bed_per_night" IS NULL;

ALTER TABLE "room_categories"
  ALTER COLUMN "price_per_bed_per_night" SET NOT NULL;

-- 3) Drop capacity×category price matrix
DROP TABLE IF EXISTS "price_tiers";

-- 4) Drop per-room price override (price is category-only)
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "price_override";

-- 5) Whole-room locks for specific date ranges
CREATE TABLE "room_locks" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "booking_id" UUID,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "stay" daterange GENERATED ALWAYS AS (daterange("check_in", "check_out", '[)')) STORED,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_locks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_locks_check_in_before_out" CHECK ("check_in" < "check_out")
);

ALTER TABLE "room_locks"
  ADD CONSTRAINT "room_locks_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "room_locks"
  ADD CONSTRAINT "room_locks_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "room_locks"
  ADD CONSTRAINT "room_locks_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Two locks on the same room may never overlap
ALTER TABLE "room_locks"
  ADD CONSTRAINT "room_locks_no_overlap"
  EXCLUDE USING gist (
    "room_id" WITH =,
    "stay" WITH &&
  );

CREATE INDEX "room_locks_room_id_check_in_check_out_idx"
  ON "room_locks"("room_id", "check_in", "check_out");

CREATE INDEX "room_locks_booking_id_idx"
  ON "room_locks"("booking_id");
