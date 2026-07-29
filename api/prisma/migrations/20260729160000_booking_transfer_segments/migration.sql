-- TRANSFER.md Phase 1a: multi-segment booking_rooms + price_breakdown + enum value.
-- No runtime behavior change; backfill existing bookings as a single segment.
-- Notification-rule rows for booking.transferred land in the next migration
-- (new enum values must be committed before use).

-- 1) Segment columns on booking_rooms
ALTER TABLE "booking_rooms"
  ADD COLUMN "segment_index" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "amount" DECIMAL(14, 2);

CREATE INDEX "booking_rooms_booking_id_segment_index_idx"
  ON "booking_rooms"("booking_id", "segment_index");

-- 2) Per-booking price breakdown (JSONB)
ALTER TABLE "bookings"
  ADD COLUMN "price_breakdown" JSONB;

-- 3) Backfill: each existing booking_rooms row is segment 0 with amount = parent total
UPDATE "booking_rooms" AS br
SET
  "segment_index" = 0,
  "amount" = b."total_amount"
FROM "bookings" AS b
WHERE br."booking_id" = b."id";

UPDATE "bookings" AS b
SET "price_breakdown" = jsonb_build_object(
  'version', 1,
  'segments', (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'segmentIndex', br."segment_index",
          'bookingRoomId', br."id",
          'roomId', br."room_id",
          'checkIn', to_jsonb(br."check_in"),
          'checkOut', to_jsonb(br."check_out"),
          'bedsBooked', br."beds_booked",
          'amount', to_char(COALESCE(br."amount", b."total_amount"), 'FM9999999999990.00'),
          'isActive', br."is_active"
        )
        ORDER BY br."segment_index", br."check_in"
      ),
      '[]'::jsonb
    )
    FROM "booking_rooms" AS br
    WHERE br."booking_id" = b."id"
  ),
  'total', to_char(b."total_amount", 'FM9999999999990.00')
);

-- 4) Domain / Telegram event enum (scaffold only — not emitted yet)
ALTER TYPE "notification_event" ADD VALUE IF NOT EXISTS 'booking.transferred';
