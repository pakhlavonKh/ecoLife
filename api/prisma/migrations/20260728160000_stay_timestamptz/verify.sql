-- Dry-run harness for migration.sql: applies it, prints the result, then ROLLS BACK.
-- Nothing is committed. Run with:
--   psql -v ON_ERROR_STOP=1 -f verify.sql
BEGIN;

\i /tmp/mig.sql

\echo '== column types after migration =='
SELECT table_name, column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('bookings', 'booking_rooms', 'room_locks')
  AND column_name IN ('check_in', 'check_out', 'stay')
ORDER BY table_name, column_name;

\echo '== constraints after migration =='
SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname IN ('bookings', 'booking_rooms', 'room_locks')
  AND c.contype IN ('x', 'c')
ORDER BY t.relname, c.conname;

\echo '== backfilled bookings (Asia/Tashkent wall clock) =='
SELECT public_code,
       to_char(check_in  AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS check_in_local,
       to_char(check_out AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS check_out_local
FROM bookings
ORDER BY check_in
LIMIT 10;

\echo '== backfilled booking_rooms + generated tstzrange =='
SELECT beds_booked,
       to_char(check_in  AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS check_in_local,
       to_char(check_out AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS check_out_local,
       stay
FROM booking_rooms
ORDER BY check_in
LIMIT 10;

\echo '== room_locks exclusion still rejects an overlap at time resolution =='
SAVEPOINT probe;
INSERT INTO room_locks (id, room_id, check_in, check_out, reason)
SELECT gen_random_uuid(), id, '2031-09-01 14:00+05', '2031-09-03 12:00+05', 'probe A'
FROM rooms ORDER BY number LIMIT 1;
INSERT INTO room_locks (id, room_id, check_in, check_out, reason)
SELECT gen_random_uuid(), id, '2031-09-03 12:00+05', '2031-09-05 12:00+05', 'probe B (adjacent, must pass)'
FROM rooms ORDER BY number LIMIT 1;
\echo '-- adjacent locks accepted (half-open); now an overlapping one must fail:'
\set ON_ERROR_STOP 0
INSERT INTO room_locks (id, room_id, check_in, check_out, reason)
SELECT gen_random_uuid(), id, '2031-09-02 10:00+05', '2031-09-04 12:00+05', 'probe C (overlap, must fail)'
FROM rooms ORDER BY number LIMIT 1;
\set ON_ERROR_STOP 1
ROLLBACK TO SAVEPOINT probe;

ROLLBACK;

\echo '== rolled back: database unchanged =='
