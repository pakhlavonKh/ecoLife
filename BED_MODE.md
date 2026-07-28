# MASTER PROMPT — Switch to Per-Bed (Shared Room) Booking Model
> Major change to the working EcoLife platform. Put in repo root as `BED_MODE.md`.
> Execute ONE phase at a time (§9); stop and wait for confirmation after each.
> This changes the CORE availability engine — treat with the same care as the original Phase 3.

## 0. Role & ground rules

You are a senior engineer changing the booking granularity of a LIVE, deployed system.
The current model is BOOKING_MODE="room" (whole-room, enforced by a Postgres exclusion
constraint on booking_rooms). We are switching to per-bed shared-room booking.

Rules: every DB change via migration; do not lose existing bookings (backfill, §8); the
concurrency guarantee is the highest priority — rewrite it correctly, do not weaken it;
write tests BEFORE claiming done; the public site keeps its design; stop after each phase.
This is not a quick fix — expect schema, engine, tests, admin, public site, and Telegram
templates to all change.

## 1. The new model (CONFIRMED by owner)

- A room has a fixed capacity (beds). Multiple independent bookings (different guests or
  groups) can share ONE room on overlapping dates, as long as, FOR EVERY NIGHT in the
  overlap, the sum of booked guests ≤ room capacity.
- Price is **per guest per night**, by category:
  `booking total = price_per_bed_per_night(category) × guests × nights`.
  Example: standart 600 000/bed/night, 1 guest, 1 night = 600 000.
  NEW PRICES ARE PER BED — the old per-room tier values are now WRONG and must be re-entered.
- Deposit (30% standart / 50% lux) is a % of THIS booking's own total (its own guests).
- A room is a single category (lux or standart); price per bed follows that category.
- Availability is computed PER DAY: for a date range, a room can accept `guests` more if
  `capacity − max_over_days(occupied_beds_on_that_day) ≥ guests`.
- Admin can "lock" a room as whole-room-occupied for SPECIFIC DATES (a group negotiated the
  entire room even though they're fewer than capacity). While locked for those dates, the
  room accepts NO further bookings on the overlapping dates, regardless of free beds.
- Public site guests SEE remaining beds ("осталось 5 из 7 мест") and can book a partial room.

## 2. Pricing changes (per category, NOT per capacity — CONFIRMED)

- Price is **per bed per night, and depends ONLY on category** (lux vs standart). Room
  capacity does NOT affect price. Therefore the old `price_tiers` matrix (category ×
  capacity) is now WRONG structurally — collapse it.
- Move price to `room_categories.price_per_bed_per_night` (one number per category,
  editable in admin). Standart = 600 000, lux = 800 000 (both confirmed, per bed per night).
- Remove/deprecate the `price_tiers` table and its admin matrix editor. Migration: read the
  intended per-category price into room_categories, then drop price_tiers (or keep the table
  empty/unused if dropping is risky mid-migration — but the admin UI must show ONE price
  field per category, not a matrix).
- `booking total = category.price_per_bed_per_night × guests × nights`.
- Admin labels: "Цена за место / ночь" on each category.

## 3. Database changes (migration)

- `bookings`: `beds_total` already exists → now means "guests in THIS booking" (not whole
  room). Keep. total/deposit/remaining recompute per §1.
- `booking_rooms`: currently one active row per (room, stay) with the exclusion constraint.
  CHANGE:
  - Keep `beds_booked` (guests this booking takes in this room).
  - **DROP** the `EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (is_active)`
    constraint — it forbids sharing and must go. Replace the guarantee per §4.
- NEW `room_locks`: id, room_id FK, stay daterange (or check_in/check_out), reason,
  created_by FK users, created_at. Represents "whole room reserved" for those dates.
  Add `EXCLUDE USING gist (room_id WITH =, stay WITH &&)` on room_locks so two locks can't
  overlap, and enforce in app that a lock cannot be created if any beds are already booked
  in the range (and a booking cannot be created if a lock overlaps).
- Optional helper: a per-room-per-day occupancy view/materialization for fast availability
  (or compute on the fly with SQL). Correctness first, optimize later.

## 4. Concurrency & anti-overbooking (CRITICAL — rewrite, do NOT weaken)

The old physical guarantee (exclusion constraint) is gone because sharing is now allowed.
Replace it with a correct transactional check:

1. Booking creation runs in ONE transaction at SERIALIZABLE isolation (or REPEATABLE READ +
   explicit locking). Lock the target room row (`SELECT ... FOR UPDATE` on rooms WHERE
   id = :roomId) so concurrent bookings for the same room serialize.
2. Inside the lock, for the requested date range, compute for EACH night the sum of
   `beds_booked` from active bookings overlapping that night, plus check no `room_lock`
   overlaps. If `max_over_nights(occupied) + requested_guests ≤ capacity` AND no lock →
   insert; else → 409 with a friendly message ("в номере не осталось столько мест на эти
   даты").
3. Room lock creation uses the same lock + check: refuse if any beds already booked in range.
4. Payment holds (pending_payment with expires_at) count as occupying beds until expired,
   same as before; expired holds free their beds.
5. TESTS (gate — must pass before done):
   - Unit: per-day occupancy math; partial-overlap dates (guests 1–5 and 3–7 share a
     7-bed room with 2+? beds — assert correct remaining per night); lock blocks all;
     half-open interval edge (checkout day frees the bed).
   - Concurrency e2e: room capacity 7, one bed already taken by 2 guests; fire 20 parallel
     bookings each requesting the remaining 5 beds → exactly the ones that fit succeed and
     total booked never exceeds 7 on any night; overflow requests get 409; DB shows no night
     over capacity. This is the new non-negotiable gate.

## 5. Availability API changes

- `GET /api/v1/availability?check_in&check_out&category_code&guests`:
  per category, return rooms with `remaining_beds` (min free beds across the requested
  nights) ≥ guests, and `remaining_beds` shown to the guest. Exclude locked rooms.
- Response must expose remaining beds per room for the public site ("осталось X из Y мест").
- Never reveal other guests' identities — only counts.

## 6. Public booking flow changes

- Booking modal: guest picks dates + category + number of guests → sees rooms of that
  category with "осталось X из Y мест" for the chosen dates → picks a room that fits →
  price = price_per_bed × guests × nights, deposit 30/50%, remaining. Confirm → booking.
- A guest booking a partial room does NOT see co-occupants. Keep existing design/tokens.
- 409 handling: "мест на эти даты не осталось" + refresh availability.

## 7. Admin changes

- Manual booking + booking card: guests count drives price (per bed × guests × nights);
  show live recompute. Room selector shows remaining beds per candidate room.
- NEW action "Закрыть номер целиком" on a booking or room for specific dates → creates a
  room_lock (whole room to this group). Show locks in the room and on the шахматка.
- **Шахматка rework**: a room row for a given day can now show MULTIPLE bookings stacked
  (e.g. "2/7", "5/7") and a "full lock" bar. Show occupancy like "4/7 занято". Clicking a
  segment opens that booking. A locked room shows a distinct full-width bar.
- Manual booking still uses the same availability engine (respects beds + locks).
- Occupancy on the dashboard = booked beds / total beds (already bed-based; verify).

## 8. Data migration of existing bookings

- Each existing whole-room booking becomes a per-bed booking whose `beds_booked` = the
  guests it had (or room capacity if guests unknown — inspect data, ask if ambiguous).
- Recompute totals? Existing bookings keep their stored amounts (don't retro-charge).
  Only NEW bookings use per-bed pricing. Document this clearly.
- Since old data assumed whole-room, if any existing booking should stay whole-room,
  create a room_lock for its dates so behavior is unchanged for already-made bookings.
  DEFAULT: convert existing active bookings to locks (safest — preserves their exclusivity).
  Confirm with owner before running on prod.

## 9. Telegram

- Notifications now include guests count and "мест в номере: X/Y занято" where relevant.
- New booking template: show guests, room, beds taken / capacity.
- Room-lock action → optional notification "Номер N закрыт целиком на DD–DD".
- Keep cleaner privacy rules (no names/money) — cleaner still only gets checkout + digest.

## 10. Phases (one at a time, stop after each)

- **Phase 1 — Schema & migration.** Drop the room exclusion constraint, add room_locks +
  its constraint, move pricing to room_categories.price_per_bed_per_night (one price per
  category (standart 600 000, lux 800 000) and remove the price_tiers matrix (§2), backfill existing
  bookings to locks per §8 (on a COPY / staging first, show the plan before touching prod).
  No behavior change yet beyond schema.
- **Phase 2 — Engine & availability.** New per-day availability + booking transaction (§4),
  room-lock enforcement, holds. Unit + concurrency gate tests. GATE: green.
- **Phase 3 — Admin.** Manual/edit booking with per-bed pricing + guests; "закрыть номер"
  action; шахматка rework (stacked occupancy). 
- **Phase 4 — Public site.** Modal + availability showing remaining beds, per-bed price.
- **Phase 5 — Telegram + polish + full deploy.** Templates, re-run all tests
  (test:unit + gate), deploy guide, README update.

## 11. Definition of Done

- Two independent bookings can share a room when beds allow, on partially overlapping dates,
  and NEVER exceed capacity on any night — proven by the concurrency gate test.
- Admin can lock a room whole for specific dates; locked rooms accept no partial bookings.
- Public site shows remaining beds and prices per guest correctly.
- Existing bookings behave unchanged (converted to locks or preserved).
- All prior tests updated and green; no path can overbook a night.









