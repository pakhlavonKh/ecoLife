-- Snapshot of catalog (matrix) total at booking time.
-- total_amount may later be bargained down; deposit_amount stays fixed.
ALTER TABLE "bookings"
  ADD COLUMN "price_original" DECIMAL(14, 2);

UPDATE "bookings"
SET "price_original" = "total_amount"
WHERE "price_original" IS NULL;

ALTER TABLE "bookings"
  ALTER COLUMN "price_original" SET NOT NULL;
