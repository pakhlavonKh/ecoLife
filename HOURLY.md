# MASTER PROMPT — Datetime Check-in/out + Cleaning Buffer
> Feature upgrade for the working EcoLife platform (room-share / bed-mode is live).
> Put in repo root as `HOURLY.md`. Execute ONE phase at a time (§8); stop after each.
> This changes the availability engine's time resolution — treat with Phase-3-level care.

## 0. Role & ground rules

You are a senior engineer upgrading a LIVE, deployed booking system. Current model:
per-bed shared-room bookings, availability computed per DAY (check_in/check_out are DATE),
anti-overbooking via SERIALIZABLE-ish transaction + FOR UPDATE on room + per-night occupancy
sum + room_locks. We now add real DATETIME check-in/out and a cleaning buffer.

Rules: every DB change via migration; do NOT weaken the concurrency guarantee — extend it to
time resolution; write tests BEFORE claiming done; do not lose existing bookings (backfill,
§7); public site keeps its design; stop after each phase; deploy to prod only with a DB
backup and via the second developer. This is the most time-sensitive engine change yet.

## 1. Confirmed behavior (owner decisions — do not reinterpret)

- **Model = Variant 1**: still night-based pricing (price = per bed × guests × nights), but
  check-in and check-out now carry a real TIME, editable in admin, visible to the guest.
- **Registration is 24/7**: guests can check in/out at any hour.
- **Cleaning buffer = 1 hour** (config `CLEANING_BUFFER_MINUTES=60`) applied AFTER EVERY
  checkout — not only when the room fully empties.
- **Buffer scope = Variant "б" (per released beds, NOT the whole room)**: when a booking
  checks out, ONLY the beds it occupied are blocked for the buffer window; other guests still
  in the room are unaffected and other occupied beds stay occupied. After
  `checkout_time + 60min`, those released beds become bookable again.
- **Intraday conflicts MUST be caught**: if booking A occupies beds until 5th 12:00, booking B
  requesting those beds starting 5th 10:00 is a CONFLICT (overlaps A) → 409. B starting 5th
  13:00 (after 12:00 + 60min cleaning) is OK.
- **Time is per booking**: one booking (even for 5 guests) has ONE check-in and ONE check-out
  time shared by all its guests. Separate bookings sharing a room each have their own times.
- Nights count = number of calendar nights spanned (for pricing) — clarify edge cases in §5.

## 2. Core concept: bed-time occupancy

Availability is no longer "beds per night" but "beds over a continuous time interval, per
room, with a cleaning tail after each booking". Reframe:

- Each active booking occupies `beds_booked` beds in a room over the half-open interval
  `[check_in_ts, check_out_ts)`.
- After check_out_ts, those same beds remain UNAVAILABLE for an extra
  `CLEANING_BUFFER_MINUTES` — model this as an "effective occupied interval"
  `[check_in_ts, check_out_ts + buffer)` FOR AVAILABILITY CHECKS. (The guest's stay is
  `[check_in_ts, check_out_ts)`; the buffer only affects when the NEXT booking may start.)
- A room accepts `guests` new beds over a requested interval iff, at every instant of that
  interval, `sum(overlapping active beds, using effective intervals) + guests ≤ capacity`,
  AND no overlapping room_lock.
- Because beds are fungible within a room (no assigned bed numbers), correctness = the max
  concurrent effective-bed-usage over the requested interval must leave room for `guests`.
  Implement via a sweep over interval endpoints (event points), not per-night buckets.

## 3. Database changes (migration)

- `bookings.check_in` / `check_out`: DATE → **TIMESTAMPTZ** (store in Asia/Tashkent-aware UTC).
  Add `check_in_time` default 14:00 and `check_out_time` default 12:00 semantics via the
  timestamp; admin edits full datetime. Migration must convert existing DATE values to
  timestamps using default times (check_in date @14:00, check_out date @12:00 local).
- `booking_rooms.check_in` / `check_out`: same DATE → TIMESTAMPTZ conversion; `stay` becomes
  a `tstzrange` (was daterange). The room_locks exclusion constraint (whole-room) also moves
  to tstzrange.
- Add `CLEANING_BUFFER_MINUTES` to config/env (default 60), NOT to DB (global setting). If
  owner may vary it per category later, note it but keep global for now.
- Keep an "effective interval" concept in queries: `[check_in, check_out + interval 'X min')`.
  Do not persist the buffer as data; compute it in availability logic so changing the config
  reprices future availability without data migration.

## 4. Concurrency & availability engine (CRITICAL — extend, do not weaken)

1. Booking create/update transaction: `SELECT ... FOR UPDATE` on the room row (serializes
   same-room bookings), then compute the max concurrent effective-bed-usage over the requested
   `[check_in_ts, check_out_ts)` from active bookings' effective intervals
   `[ci, co + buffer)` plus room_locks; if `maxConcurrent + guests ≤ capacity` and no lock →
   insert, else → 409 "на эти дату и время в номере не осталось мест".
2. The overlap test is now TIME-based, not day-based. Two bookings on the same calendar day
   do NOT auto-conflict; they conflict only if their intervals (with buffer) actually overlap.
3. Room-lock creation: same lock + time-based check.
4. Payment holds still occupy beds (effective interval incl. buffer) until expired.
5. TESTS (gate — must pass before done):
   - Unit: interval-sweep occupancy; buffer applied per released beds (Variant б: A checks
     out freeing 2 beds at 12:00, B can take those 2 beds at 13:00 not 12:30; a 3rd guest C
     still living is unaffected); intraday conflict (B at 10:00 vs A until 12:00 → conflict);
     back-to-back with exact buffer edge (checkout 12:00 + 60min → next allowed at exactly
     13:00, half-open so 13:00 is free); midnight-crossing stays; DST/timezone sanity for
     Asia/Tashkent (UZT has no DST, but assert times don't drift).
   - Concurrency e2e: room cap 7 with some beds occupied over a time window; 20 parallel
     bookings for overlapping time ranges → total effective concurrent beds never exceeds 7
     at any instant; overflow → 409; DB shows no instant over capacity.

## 5. Pricing / nights edge cases (confirm behavior, default as stated)

- Nights = count of calendar nights between check_in date and check_out date (date part),
  regardless of times. E.g. check_in 5th 20:00 → check_out 6th 10:00 = 1 night.
- Same-day check_in and check_out (e.g. 5th 09:00 → 5th 20:00) = ⚠️ ambiguous in a night
  model. DEFAULT: minimum 1 night charged. FLAG this to owner — if day-use (hourly, no
  overnight) must be free/cheaper, that's a separate pricing rule; do not build it unasked.
- Deposit/remaining unchanged (% of total). Debt-blocks-checkout rule stays as shipped.

## 6. Public site & admin

Public:
- Booking modal: date + TIME pickers for check-in/out (defaults 14:00 / 12:00, 24h allowed).
- Availability call passes datetimes; results show rooms with enough beds for that time
  window; if the requested time conflicts, show the earliest time the beds free up (incl.
  cleaning) or suggest alternatives. Keep existing design/tokens; ru/uz/en synced.
- Guest sees only counts and available-from times, never co-occupant identities.

Admin:
- Manual booking + booking card: editable check-in/out datetime; live availability re-check on
  change; show cleaning buffer implication ("номер/места заняты до HH:MM из-за уборки").
- Changing times re-validates against the engine (no overlap allowed) → 409 with clear text.
- **Шахматка**: switch from day columns to a time-aware view. Minimum: keep day columns but
  show time in the segment tooltip/label (e.g. "205 · 2/7 · 14:00–12:00"). Better (optional,
  can be a follow-up): an hour-resolution timeline. Cleaning buffer shown as a short hatched
  tail after each segment. Do the minimum first, flag the timeline as optional.
- Дашборд arrivals/departures now can sort by time; "today's arrivals/departures" respect
  time.

## 7. Data migration of existing bookings (§0 safety)

- Convert existing DATE bookings: check_in @ 14:00 local, check_out @ 12:00 local (the current
  implicit defaults). room_locks likewise. Show a preview on staging/local before prod.
- Existing bookings keep amounts. No re-pricing.
- On prod: backup DB first, run migration, verify a sample booking's times, then done.

## 8. Phases (one at a time, stop after each)

- **Phase 1 — Schema & migration.** DATE→TIMESTAMPTZ for bookings + booking_rooms + locks;
  tstzrange; config CLEANING_BUFFER_MINUTES; backfill existing to default times (preview
  first). App still compiles/runs; no engine behavior change yet beyond types.
- **Phase 2 — Engine.** Time-based interval-sweep availability + booking transaction + buffer
  (Variant б) + room-lock time checks + holds. Unit + concurrency gate tests (§4.5).
  GATE: green.
- **Phase 3 — Admin.** Datetime editing, live re-check, buffer display, шахматка time labels,
  dashboard time-aware arrivals/departures.
- **Phase 4 — Public site.** Time pickers, time-aware availability, "available from HH:MM",
  ru/uz/en. Keep design.
- **Phase 5 — Polish + deploy.** Telegram templates include times; full test run
  (test:unit + test:gate); README update; prod deploy checklist (backup → migrate → verify).

## 9. Definition of Done

- Beds free up exactly `check_out_time + 60min`; a booking cannot start before the beds it
  needs are free-and-cleaned — proven by unit tests (Variant б, per released beds).
- Intraday conflicts are caught; two bookings same day only conflict if times overlap.
- No instant can exceed room capacity — proven by the time-based concurrency gate.
- Times editable in admin, visible to guests, shown on шахматка; changing times re-validates.
- Existing bookings migrated to default times, behavior preserved.
- All prior tests updated and green.
