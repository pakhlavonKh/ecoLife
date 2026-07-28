-- Phase 1 backfill: convert active whole-room bookings → room_locks.
-- DO NOT run until owner confirms the preview SELECT.
-- Local expected: BK-3273 (305), BK-619C (205).
-- Existing booking amounts / beds_booked are NOT changed.
--
-- Apply manually:
--   docker exec -i ecolife-postgres-dev psql -U ecolife -d ecolife < api/prisma/scripts/backfill-room-locks.sql

INSERT INTO "room_locks" (
  "id",
  "room_id",
  "booking_id",
  "check_in",
  "check_out",
  "reason",
  "created_by",
  "created_at"
)
SELECT
  gen_random_uuid(),
  br."room_id",
  b."id",
  br."check_in",
  br."check_out",
  'backfill: preserve whole-room exclusivity for pre-bed-mode booking '
    || b."public_code",
  b."created_by",
  CURRENT_TIMESTAMP
FROM "booking_rooms" br
JOIN "bookings" b ON b."id" = br."booking_id"
WHERE br."is_active" = true
  AND b."status" IN ('pending_payment', 'deposit_paid', 'confirmed', 'checked_in')
  AND (
    b."status" <> 'pending_payment'
    OR b."expires_at" IS NULL
    OR b."expires_at" > CURRENT_TIMESTAMP
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "room_locks" rl
    WHERE rl."booking_id" = b."id"
  );
