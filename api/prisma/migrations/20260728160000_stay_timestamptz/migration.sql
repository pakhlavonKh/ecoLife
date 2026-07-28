-- HOURLY.md Phase 1 — stay boundaries become real datetimes.
--
-- DATE -> TIMESTAMPTZ on bookings / booking_rooms / room_locks, and the generated
-- `stay` daterange columns become tstzrange (the room_locks gist exclusion moves with it).
--
-- Existing rows are backfilled with the implicit defaults they were booked under
-- (HOURLY.md §7): check-in 14:00, check-out 12:00 Asia/Tashkent. Those times are
-- hardcoded on purpose — a migration must be reproducible and must not depend on the
-- current CHECK_IN_TIME / CHECK_OUT_TIME env values.
--
-- The cleaning buffer is NOT persisted anywhere: `stay` stays the guest's own interval
-- and the buffer is applied by the availability engine (HOURLY.md §3).

-- Already created by the init migration; required by the tstzrange exclusion below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1) bookings ─────────────────────────────────────────────────────────────────
ALTER TABLE "bookings"
  ALTER COLUMN "check_in" TYPE TIMESTAMPTZ(6)
    USING (("check_in"::timestamp + TIME '14:00') AT TIME ZONE 'Asia/Tashkent'),
  ALTER COLUMN "check_out" TYPE TIMESTAMPTZ(6)
    USING (("check_out"::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Tashkent');

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_check_in_before_out" CHECK ("check_in" < "check_out");

-- ── 2) booking_rooms ────────────────────────────────────────────────────────────
-- The generated column depends on the date columns, so it has to go first.
ALTER TABLE "booking_rooms" DROP COLUMN IF EXISTS "stay";

ALTER TABLE "booking_rooms"
  ALTER COLUMN "check_in" TYPE TIMESTAMPTZ(6)
    USING (("check_in"::timestamp + TIME '14:00') AT TIME ZONE 'Asia/Tashkent'),
  ALTER COLUMN "check_out" TYPE TIMESTAMPTZ(6)
    USING (("check_out"::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Tashkent');

ALTER TABLE "booking_rooms"
  ADD COLUMN "stay" tstzrange
    GENERATED ALWAYS AS (tstzrange("check_in", "check_out", '[)')) STORED;

ALTER TABLE "booking_rooms"
  ADD CONSTRAINT "booking_rooms_check_in_before_out" CHECK ("check_in" < "check_out");

CREATE INDEX "booking_rooms_room_id_stay_idx"
  ON "booking_rooms" USING gist ("room_id", "stay")
  WHERE "is_active";

-- ── 3) room_locks ───────────────────────────────────────────────────────────────
-- Drop the exclusion constraint (and its index) before retyping the columns.
ALTER TABLE "room_locks" DROP CONSTRAINT IF EXISTS "room_locks_no_overlap";
ALTER TABLE "room_locks" DROP CONSTRAINT IF EXISTS "room_locks_check_in_before_out";
ALTER TABLE "room_locks" DROP COLUMN IF EXISTS "stay";

ALTER TABLE "room_locks"
  ALTER COLUMN "check_in" TYPE TIMESTAMPTZ(6)
    USING (("check_in"::timestamp + TIME '14:00') AT TIME ZONE 'Asia/Tashkent'),
  ALTER COLUMN "check_out" TYPE TIMESTAMPTZ(6)
    USING (("check_out"::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Tashkent');

ALTER TABLE "room_locks"
  ADD COLUMN "stay" tstzrange
    GENERATED ALWAYS AS (tstzrange("check_in", "check_out", '[)')) STORED;

ALTER TABLE "room_locks"
  ADD CONSTRAINT "room_locks_check_in_before_out" CHECK ("check_in" < "check_out");

-- Two locks on the same room may still never overlap — now at time resolution.
ALTER TABLE "room_locks"
  ADD CONSTRAINT "room_locks_no_overlap"
  EXCLUDE USING gist (
    "room_id" WITH =,
    "stay" WITH &&
  );
