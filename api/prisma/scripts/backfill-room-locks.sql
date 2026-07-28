-- Phase 1 / bed-mode: convert active whole-room bookings → room_locks.
-- Existing booking amounts / beds_booked are NOT changed.
--
-- ─── STEP 1: PREVIEW (always run first on prod) ─────────────────────────────
-- SELECT b.public_code, r.number, br.check_in, br.check_out, br.beds_booked, r.capacity
-- FROM booking_rooms br
-- JOIN bookings b ON b.id = br.booking_id
-- JOIN rooms r ON r.id = br.room_id
-- WHERE br.is_active = true
--   AND b.status IN ('pending_payment', 'deposit_paid', 'confirmed', 'checked_in')
--   AND (b.status <> 'pending_payment' OR b.expires_at IS NULL OR b.expires_at > CURRENT_TIMESTAMP)
--   AND NOT EXISTS (SELECT 1 FROM room_locks rl WHERE rl.booking_id = b.id);
--
-- DO NOT run the INSERT until the owner confirms the preview.
-- Local expected (example): BK-3273 (305), BK-619C (205).
--
-- Apply after confirmation:
--   docker exec -i ecolife-postgres-dev psql -U ecolife -d ecolife < api/prisma/scripts/backfill-room-locks.sql
-- Prod:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U ecolife -d ecolife < api/prisma/scripts/backfill-room-locks.sql

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
