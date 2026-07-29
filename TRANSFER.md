# MASTER PROMPT — Transfer / Upgrade / Extend Bookings
> Feature upgrade for the working EcoLife platform. Put in repo root as `TRANSFER.md`.
> Execute ONE phase at a time (§7); stop after each. This touches availability, money,
> cleaning and notifications at once — Phase-3-level care.

## 0. Ground rules
Senior engineer on a LIVE system. Model: per-bed shared apartments, datetime check-in/out,
cleaning buffer (1h per checkout, per released beds, variant "б"), anti-overbooking via
FOR UPDATE + interval-sweep occupancy + room_locks. Rules: migrations for every DB change;
never weaken the concurrency guarantee — every transfer/extend must run through the SAME
availability engine and can NEVER overbook; tests before "done"; keep public design; stop
after each phase; deploy to prod only with DB backup via the second developer.

## 1. Three operations (all confirmed by owner)
1. **Upgrade** — move to a higher class (standart→lux) mid-stay or before arrival; guest pays
   the price DIFFERENCE for the remaining nights.
2. **Transfer (same class)** — move to another room of the same category (didn't like the
   room); no price change, no surcharge.
3. **Extend** — stay longer (more nights) in the same room; pay for the added nights.
All three apply BOTH before check-in and after check-in (mid-stay). Confirmed.

## 2. Data model: "booking moves, stay may split" (confirmed)
- A booking keeps its identity; its `booking_rooms` rows carry the room + datetime interval.
- **Transfer/upgrade splits the stay into segments** on the transfer datetime:
  - Segment A: old room, `[check_in, transfer_ts)` — already-lived part, OLD price.
  - Segment B: new room, `[transfer_ts, check_out)` — NEW room/price.
  - Represent as two active `booking_rooms` rows on the same booking (structure already
    supports multiple rows per booking). `beds_booked` = guests (whole booking moves; partial
    move NOT supported — always the whole party, confirmed).
- **Extend** does not split: it extends `check_out` (and the relevant booking_rooms row) to a
  later datetime, adding nights.
- Money is tracked at booking level (total/deposit/paid/remaining) with a per-segment price
  breakdown for transparency. Store `price_breakdown` (JSONB) or compute from segments.

## 3. Money rules (confirmed)
- **Upgrade**: nights already spent stay at the OLD price; remaining nights (segment B)
  recomputed at the NEW category's per-bed/per-adult/child price. Surcharge = (new remaining
  cost − old remaining cost). This surcharge amount is EDITABLE by admin (negotiable), like
  the existing manual-total override. Already-paid deposit/amount is NOT lost — it carries
  over; guest pays only the surcharge (or its adjusted value).
- **Transfer same class**: no price change, no surcharge; paid amounts untouched.
- **Extend**: added nights cost = per-night price × guests × added nights (respecting age
  pricing), editable (negotiable). Added to total; remaining increases accordingly.
- New `total_amount` = sum of all segments (+ extensions). `remaining = total − paid`.
- All amount changes go to audit_log (who, before → after, operation type).
- Debt-blocks-checkout rule still applies to the final checkout.

## 4. Availability & concurrency (CRITICAL — reuse the engine, never bypass)
- Before ANY transfer/upgrade/extend: run the SAME availability check (FOR UPDATE on target
  room + interval-sweep occupancy + room_locks) for the NEW room/segment/dates, EXCLUDING the
  booking's own current occupancy (a booking must not conflict with itself).
- If the target has no room on the needed dates → operation refused with a clear reason; for
  **extend specifically**, if the same room is taken later by someone else, REFUSE and OFFER
  a transfer to an available room of the same (or chosen) class for the extended dates
  (confirmed requirement: propose transfer when extension is blocked).
- The whole operation is ONE transaction: free old-segment beds (from transfer_ts) + occupy
  new-segment beds, atomically. On conflict → 409, nothing changes.
- Never allow any instant to exceed room capacity — extend the concurrency gate test to cover
  a transfer racing against a new booking for the same target beds.

## 5. Cleaning buffer on transfer (confirmed special case)
- When a guest transfers OUT of a room mid-stay, the vacated beds in the OLD room do NOT get
  the 1h cleaning buffer (unlike a normal checkout) — they become immediately bookable. BUT
  a **cleaning notification IS sent to cleaners** for the old room (номер + освободившиеся
  места). So: transfer-out = "checkout without buffer, with cleaning notice".
- Implement as a distinct internal event `booking.transferred` (not `booking.checked_out`)
  so buffer logic is skipped but the cleaner notification still fires.

## 6. Admin & public
Admin (in the existing booking card — opened from list and from шахматка):
- Actions: **"Перевести/апгрейд"** (pick target category + room + transfer datetime; show
  availability of candidate rooms; show surcharge with editable amount and breakdown
  "прожито N ночей × стар. цена + M ночей × нов. цена") and **"Продлить"** (pick new checkout
  datetime; show added cost, editable; if blocked, offer transfer).
- After operation: card shows the segmented stay (A: room/dates/price, B: room/dates/price),
  updated total/paid/remaining, and history in audit.
- Шахматка reflects both segments (guest appears in room A for its dates, room B after);
  transfer-out shows cleaning notice marker (no buffer tail).
Public site:
- Keep simple for now: transfers/upgrades/extends are ADMIN-driven (guest asks reception).
  Do NOT build guest-facing self-transfer unless asked. If trivial, a guest "request upgrade"
  note could be added later — flag, don't build.

## 7. Phases (one at a time, stop after each)
- **Phase 1 — Schema.** Allow multiple active booking_rooms segments per booking cleanly;
  price_breakdown storage; `booking.transferred` event scaffolding; migration; no behavior
  change beyond schema. Backfill: existing single-room bookings = single segment.
- **Phase 2 — Engine.** Transfer/upgrade (split + atomic free/occupy + money), extend
  (+ offer-transfer-when-blocked), all through the availability engine; transfer-out =
  no-buffer + cleaner notice. Unit tests (split dates, surcharge math old/new price,
  self-exclusion, extend-blocked→offer, no-buffer-on-transfer) + concurrency gate
  (transfer racing a booking). GATE: green.
- **Phase 3 — Admin.** Transfer/upgrade/extend UI in booking card; availability of targets;
  editable surcharge with breakdown; segmented stay display; шахматка segments.
- **Phase 4 — Telegram + polish + deploy.** Notifications: upgrade/transfer/extend events
  with before→after (room, dates, surcharge); cleaner gets transfer-out notice; full test run
  (unit + gate); README; prod checklist (backup → migrate → verify).

## 8. Definition of Done
- Upgrade mid-stay splits the stay; past nights old price, future nights new price; surcharge
  editable; paid amount carried over — proven by tests.
- Same-class transfer moves the room with no surcharge.
- Extend adds nights if room free; if blocked, admin is offered a same-class transfer.
- Every operation goes through the availability engine and can NEVER overbook (concurrency
  gate incl. transfer race).
- Transfer-out sends a cleaner notification but applies NO cleaning buffer.
- All amounts audited; existing bookings unaffected (single-segment backfill).
- All prior tests remain green.
