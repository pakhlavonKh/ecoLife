# MASTER PROMPT — Cottage Resort Booking Platform
> How to use: put this file in the repo root as `AGENTS.md` (or into `.cursor/rules/`).
> Then tell the agent: "Read AGENTS.md and start Phase 0". Execute ONE phase at a time.

---

## 0. Role & ground rules

You are a senior full-stack engineer. Work strictly phase by phase (§12). After finishing a phase:
list what was created/changed, explain how to run and verify it, then **STOP and wait for my
confirmation** before starting the next phase. Never skip ahead, never bundle phases.

Rules:
- Production-quality, fully typed, modular code. Clean architecture: controller → service → repository. No business logic in controllers or React components.
- Do NOT redesign the existing public frontend. Keep its current look & feel; add only what functionality requires.
- Every DB change goes through a migration. Never edit an already-applied migration.
- Unit tests are mandatory for the availability engine and booking service (highest-risk code), including a concurrency test.
- All secrets/config via environment variables; ship a complete `.env.example`. Never hardcode tokens, keys, chat IDs.
- If something is ambiguous, check §14 (Open questions / config). If still unclear — ask me. Do not invent business rules.

## 1. Context

There is an existing resort website with a finished frontend. The task: turn it into a working
booking platform by adding a backend API, database, availability/booking engine with online
prepayment (deposit), an admin panel (mini-CRM) and a Telegram bot that notifies administrators.

## 2. CRITICAL data-model correction (differs from the old spec)

The current site displays **4 room categories. The real inventory has only TWO: `LUX` and
`STANDART`.** Remove the extra two categories from the public site.

The real structure (from the owner's inventory sheet): the resort consists of **cottages**;
each cottage contains **rooms**; each room has a fixed **capacity (beds / "kishi")** and belongs
to a **category** (lux | standart).

Hierarchy: `Cottage → Room (number, capacity, category)`.

Availability MUST be tracked per physical room and date range — not as an abstract per-category
bed pool. Category-level availability shown to guests is an aggregation over its rooms.

## 3. Tech stack (CONFIRMED by the owner)

- Backend: Node.js 20+, NestJS, TypeScript, Prisma ORM
- Database: PostgreSQL 16 (REQUIRED — we rely on range types and exclusion constraints)
- Admin panel: React + Vite + Tailwind (separate SPA) consuming the REST API
- Public site: keep the existing frontend; wire it to the API (fetch/axios)
- Telegram bot: grammY (runs as a worker inside the API service or a separate process)
- Auth: JWT (short-lived access + refresh rotation), argon2id password hashing
- Validation: class-validator (DTOs) or zod; global exception filter; pino structured logging
- Infra: **Docker for everything** (Docker is already installed on the host).
  Dev: `docker-compose.dev.yml` — PostgreSQL 16 + Adminer (DB UI); the app runs via `npm run dev`
  against the containerized DB (hot reload stays fast).
  Production: `docker-compose.prod.yml` — api, admin (static build served by nginx), bot worker,
  postgres (named volume for data), nginx reverse proxy; healthchecks + restart policies.
  Nothing is ever installed on the host except Docker and Node.js. Prisma migrations via `prisma migrate`.

## 4. Database schema

Minimum entities (Prisma models; snake_case in DB):

- `users` — admins: id, email UNIQUE, password_hash, name, role (`admin` | `manager`), is_active, timestamps
- `customers` — guests: id, first_name, last_name, phone (indexed, normalized to E.164), notes, timestamps
- `cottages` — id, name, sort_order, is_active
- `room_categories` — id, code UNIQUE (`lux` | `standart`), name, description, deposit_percent (CONFIRMED: **lux = 50, standart = 30**; still editable in admin), images (string[]), is_active
- `price_tiers` — id, category_id FK, capacity int, price_per_night (decimal, UZS), UNIQUE(category_id, capacity). **Pricing is defined per (category × room capacity)** and MUST be editable in the admin panel. Price resolution for a room: `rooms.price_override` if set → matching price_tier (category + capacity) → room cannot be booked until a price exists (validation error, surfaced in admin).
- `rooms` — id, cottage_id FK, number UNIQUE (string), capacity int, category_id FK, price_override (nullable decimal — rare per-room exception overriding the tier price), is_active
- `bookings` — id, public_code (short human code, e.g. `BK-3F7A`), customer_id FK, check_in DATE, check_out DATE, beds_total int, total_amount, deposit_amount, paid_amount, remaining_amount, payment_status (`unpaid` | `deposit_paid` | `paid_full` | `refunded`), status (`pending_payment` | `deposit_paid` | `confirmed` | `checked_in` | `checked_out` | `cancelled`), source (`online` | `manual`), notes, expires_at (nullable — payment hold), created_by (nullable FK users), timestamps
- `booking_rooms` — id, booking_id FK (ON DELETE CASCADE), room_id FK (RESTRICT), beds_booked int, check_in, check_out, is_active bool (denormalized: true while parent booking occupies inventory), stay daterange (generated / maintained in the same transaction)
- `payments` — id, booking_id FK, provider (`payme` | `click` | `cash` | `mock`), provider_txn_id UNIQUE per provider, amount, currency (`UZS`), status (`created` | `pending` | `succeeded` | `failed` | `refunded`), raw payload JSONB, timestamps
- `audit_log` — id, actor_type (`admin` | `system` | `customer`), actor_id, entity, entity_id, action, diff JSONB (before/after), created_at

Referential integrity everywhere; no orphan bookings/payments. Money as `decimal(14,2)`, never float.

### 4.1 Seed data — REAL inventory (seed exactly this, do not invent rooms)

Categories (CONFIRMED):
- `lux` — name "Люкс", **deposit_percent = 50**
- `standart` — name "Стандарт", **deposit_percent = 30**

Price tiers to seed (one row per category × capacity found in inventory; amounts in UZS,
placeholders ⚠️ must be replaced with real prices before go-live — editable in admin anyway):

| Category | Capacity | price_per_night |
|----------|----------|-----------------|
| lux      | 4        | ⚠️PLACEHOLDER   |
| lux      | 7        | ⚠️PLACEHOLDER   |
| lux      | 9        | ⚠️PLACEHOLDER   |
| lux      | 10       | ⚠️PLACEHOLDER   |
| lux      | 12       | ⚠️PLACEHOLDER   |
| standart | 2        | ⚠️PLACEHOLDER   |
| standart | 7        | ⚠️PLACEHOLDER   |
| standart | 9        | ⚠️PLACEHOLDER   |

| Cottage            | Room | Capacity (beds) | Category |
|--------------------|------|-----------------|----------|
| Seshanba kottej    | 201  | 7  | lux      |
| Seshanba kottej    | 202  | 7  | lux      |
| Seshanba kottej    | 203  | 7  | lux      |
| Seshanba kottej    | 204  | 7  | lux      |
| Seshanba kottej    | 205  | 7  | standart |
| Chorshanba kottej  | 301  | 10 | lux      |
| Chorshanba kottej  | 302  | 12 | lux      |
| Chorshanba kottej  | 303  | 10 | lux      |
| Chorshanba kottej  | 304  | 12 | lux      |
| Chorshanba kottej  | 305  | 9  | standart |
| Chorshanba kottej  | 306  | 9  | standart |
| Payshanba kottej   | 401  | 2  | standart |
| Payshanba kottej   | 402  | 2  | standart |
| Payshanba kottej   | 403  | 2  | standart |
| Payshanba kottej   | 404  | 2  | standart |
| Payshanba kottej   | 405  | 2  | standart |
| Payshanba kottej   | 406  | 2  | standart |
| Payshanba kottej   | 407  | 2  | standart |
| Payshanba kottej   | 408  | 2  | standart |
| Juma kottej        | 501  | 9  | lux      |
| Juma kottej        | 502  | 10 | lux      |
| Juma kottej        | 503  | 9  | lux      |
| Juma kottej        | 504  | 10 | lux      |
| Juma kottej        | 505  | 9  | lux      |
| Juma kottej        | 506  | 9  | lux      |
| Shanba kottej      | 601  | 4  | lux      |
| Shanba kottej      | 602  | 2  | standart |
| Shanba kottej      | 603  | 7  | lux      |
| Shanba kottej      | 604  | 4  | lux      |
| Shanba kottej      | 605  | 7  | lux      |
| Shanba kottej      | 606  | 2  | standart |
| Yakshanba kottej   | 701  | 2  | standart |
| Yakshanba kottej   | 702  | 2  | standart |
| Yakshanba kottej   | 703  | 2  | standart |
| Yakshanba kottej   | 704  | 2  | standart |
| Yakshanba kottej   | 705  | 2  | standart |
| Yakshanba kottej   | 706  | 2  | standart |
| Yakshanba kottej   | 707  | 2  | standart |
| Yakshanba kottej   | 708  | 2  | standart |
| Yakshanba kottej   | 709  | 2  | standart |
| Yakshanba kottej   | 710  | 2  | standart |

Sanity totals (verify after seeding): 6 cottages, **41 rooms**.
LUX: 18 rooms / 150 beds. STANDART: 23 rooms / 65 beds. Total beds: 215.
Also seed one admin user from env (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## 5. Availability engine & anti-overbooking (the most critical part)

Definitions:
- Stay interval is half-open: `[check_in, check_out)`. A guest checking out on the 10th does NOT
  conflict with a guest checking in on the 10th.
- A booking OCCUPIES inventory while `status ∈ {pending_payment (not expired), deposit_paid, confirmed, checked_in}`.
  `cancelled`, `checked_out` and expired `pending_payment` do NOT occupy inventory.

### 5.1 Booking granularity — BOOKING_MODE = "room" (CONFIRMED)
Guests and admins book **entire rooms only**. `beds_booked = room.capacity`. Two active bookings
can never share a room on overlapping dates. Do NOT implement partial / bed-level room sharing.
A single booking MAY include several rooms (group booking) — each as a `booking_rooms` row.

### 5.2 Correctness guarantees (implement ALL layers)
1. **DB-level (MODE "room")**: enable `btree_gist`; on `booking_rooms` add
   `EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (is_active)`.
   Keep `is_active` in sync with the parent booking status inside the same transaction.
   This makes double-booking physically impossible regardless of application bugs.
2. **Application-level**: booking creation/edit runs in ONE transaction:
   `SELECT ... FOR UPDATE` on the candidate room rows → recompute availability → insert/update →
   commit. On serialization/exclusion violation return **HTTP 409** with a friendly
   "this room was just booked, please pick another room/dates" message.
3. **Payment hold**: online bookings are created as `pending_payment` with
   `expires_at = now() + HOLD_MINUTES (default 30)`. A scheduled worker (cron every minute)
   cancels expired holds and flips `is_active = false`, freeing inventory. Availability queries
   must ignore expired holds even before the worker runs.
4. **Room selection**: the guest picks dates + category + number of guests; the API returns
   available rooms of that category with `capacity >= guests` (best-fit first, to minimize
   fragmentation) and the guest confirms a specific room. Admin can reassign rooms later.

### 5.3 Availability API
- `GET /api/v1/availability?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD`
  → per category: `available_beds`, `available_rooms[] {number, capacity}` (rooms list only in admin scope).
- Validation: check_in < check_out, not in the past, max stay length from config.

### 5.4 Tests (Phase 3 gate — must pass)
- Unit: overlap math, half-open interval edge (checkout day == checkin day is OK), hold expiry.
- Concurrency: fire 20 parallel booking requests for the last available room/beds → exactly one
  succeeds, the rest get 409, DB contains no overlap. This test is non-negotiable.

## 6. Public booking flow

- Booking page shows the **2 categories** with photos, description, price, deposit %, and — after
  the guest picks dates — live availability per category.
- "Book Now" opens a modal (whole-room flow): first name, last name, phone (mask +998…),
  category (pre-filled), dates, number of guests → the modal shows available rooms of the
  category that fit (capacity + price/night), guest selects a room → auto-calculated:
  total = nights × room price, required deposit (30%/50% by category), remaining balance.
- Confirm → `POST /api/v1/bookings` → server recalculates ALL money server-side (never trust the
  client), creates `pending_payment` booking + payment invoice → returns payment URL → redirect.
- After provider webhook confirms payment: `payment_status = deposit_paid`,
  `status = deposit_paid`, remaining balance stored, confirmation shown on the success page
  (booking public_code) and Telegram notification sent.
- Public endpoints are rate-limited and require no auth.

## 7. Payments (deposit-only prepayment)

- Guests pay ONLY the deposit online: `deposit = round(total * category.deposit_percent / 100)`.
- Implement a `PaymentProvider` interface: `createInvoice(booking) → {url, invoiceId}`,
  `handleWebhook(req) → normalized event`, `verifySignature(req)`.
- Adapters (CONFIRMED): `MockProvider` (dev: internal page with "Pay success / Pay fail" buttons)
  + **BOTH real providers**: **Payme** (Merchant API, JSON-RPC) and **Click** (SHOP-API).
  On checkout the guest chooses Payme or Click. Build Mock first, then Payme, then Click —
  all behind the same `PaymentProvider` interface.
- Webhooks must be **idempotent** (dedupe by provider_txn_id), signature-verified, and logged to
  `payments.payload`. Currency: UZS.
- Admin can also record offline payments (`cash`) — e.g. remaining balance on arrival → when
  `paid_amount == total_amount`, `payment_status = paid_full`.

## 8. Admin panel (mini-CRM), behind auth

Sections:
1. **Dashboard**: today's arrivals, today's departures, active guests (checked-in),
   upcoming bookings, total bookings, occupancy % (occupied beds / total beds for today),
   revenue (paid amounts, period filter), pending payments.
2. **Bookings**: table with search (name/phone/code) + filters (status, payment status, category,
   cottage, date range); booking card with full edit: guest info, phone, dates, category, room(s),
   beds, amounts, payment status; actions: confirm, cancel, check-in, check-out,
   "mark payment received"; manual booking creation (no online payment, still occupies inventory,
   respects the same availability engine). Every field from the spec: id/public_code, name,
   surname, phone, category, beds, check-in/out, deposit, remaining, payment status, status,
   notes, created/updated timestamps.
3. **Calendar ("шахматка")**: grid rooms × days with booking bars; quick create/move. (Phase 6,
   can ship after the table view.)
4. **Customers**: list, search by phone/name, customer card with booking & payment history, edit info.
5. **Rooms & categories**: edit category name/description/deposit %/images (upload),
   enable/disable category; **price matrix editor** — a grid category × capacity where admin
   edits `price_tiers.price_per_night` (changes apply to NEW bookings only, existing bookings
   keep their stored amounts); per-room `price_override`; edit rooms (capacity, category,
   active), cottages.
6. **Audit log**: filterable list of all changes (who, what, when, before → after).

Status transition guard (server-side): pending_payment → deposit_paid → confirmed → checked_in →
checked_out; cancellation allowed from any state except checked_out; illegal transitions → 422.

## 9. Telegram bot (admin notifications)

- grammY; config: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS` (comma-separated).
- Send messages on domain events (emit events from services, never call Telegram from controllers):
  - **New booking**: guest name, phone, category, cottage/room(s), beds, check-in, check-out,
    total, deposit paid/required, source (online/manual), public_code.
  - **Payment received** (webhook or manual mark).
  - **Check-in** / **Check-out**.
  - **Booking edited**: what changed (dates/category/beds/payment/status) with old → new values.
  - **Cancelled** (incl. auto-expired holds).
- Messages in Russian, HTML parse mode, resilient: Telegram failure must never fail the API request
  (queue + retry, log errors).
- Nice-to-have command: `/today` → arrivals & departures list.

## 10. Security

- JWT access (15 min) + refresh rotation; argon2id hashes; RBAC guards (`admin`, `manager`).
- All `/api/v1/admin/**` routes protected; strict DTO validation (whitelist, forbidNonWhitelisted).
- Rate limiting (e.g. @nestjs/throttler): tight on auth & public booking endpoints.
- helmet, strict CORS (env whitelist), no stack traces in prod responses, uniform error format.
- Webhook signature verification; secrets only via env; SQL only via ORM/parameters.
- Audit log on every mutation of bookings/payments/customers/categories/rooms.

## 11. Environment (.env.example must include)

DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
HOLD_MINUTES=30, PAYMENT_PROVIDERS=mock,payme,click (enabled list),
PAYME_MERCHANT_ID / PAYME_KEY, CLICK_MERCHANT_ID / CLICK_SERVICE_ID / CLICK_SECRET_KEY,
TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_IDS, PUBLIC_SITE_URL, ADMIN_PANEL_URL, PORT.

## 12. Implementation phases (execute one at a time, wait for my OK)

- **Phase 0 — Audit.** Read the existing frontend code. Output `AUDIT.md`: stack, structure, where
  the 4 categories are rendered, integration plan (how the booking page/modal plugs in), risks.
  No code changes yet.
- **Phase 1 — Infra & DB (Docker).** `docker-compose.dev.yml`: PostgreSQL 16 (named volume,
  healthcheck) + Adminer; NestJS skeleton connected via `DATABASE_URL`; Prisma schema (§4);
  migrations incl. `CREATE EXTENSION btree_gist` + the exclusion constraint; seed script with
  the REAL inventory (§4.1); npm scripts: `db:up` (compose up -d), `db:migrate`, `db:seed`,
  `dev`, `build`. One-command bootstrap: `npm run setup` = db:up → migrate → seed.
  Verify sanity totals after seeding.
- **Phase 2 — Auth & core CRUD.** Auth (login/refresh/logout), users, categories, cottages, rooms
  endpoints; RBAC; validation; global error filter; pino logging; Swagger at /docs.
- **Phase 3 — Availability & booking engine.** §5 in full: availability endpoint, booking create
  (transaction + locks + constraint), auto room assignment, hold expiry worker, status machine,
  unit + concurrency tests. GATE: concurrency test green.
- **Phase 4 — Payments.** Provider interface, Mock provider end-to-end, then real adapter (§14),
  idempotent webhooks, payment records, statuses.
- **Phase 5 — Public site integration.** Reduce to 2 categories, booking page + modal per §6,
  date picker, live availability, payment redirect, success/fail pages. Keep existing design.
- **Phase 6 — Admin panel.** §8: dashboard → bookings CRM + manual booking → customers →
  rooms/categories → шахматка → audit log view.
- **Phase 7 — Telegram bot.** §9 events + /today.
- **Phase 8 — Hardening.** Rate limits, helmet/CORS, audit-log coverage check, security pass.
- **Phase 9 — Delivery (Docker).** E2E happy-path test (book → pay → check-in → check-out);
  `docker-compose.prod.yml`: api (multi-stage Dockerfile, non-root user), admin static build
  served by nginx, bot worker, postgres with named volume + automated `pg_dump` backup service,
  nginx reverse proxy (routes: public site, /api, /admin, Payme/Click webhooks, TLS-ready);
  healthchecks, restart: unless-stopped, `.env`-driven config; README: local run + one-command
  VPS deploy (`docker compose -f docker-compose.prod.yml up -d`), final review.

## 13. Definition of Done

- Impossible to overbook (proved by the concurrency test + DB constraint).
- Guest can: see 2 categories → pick dates → see real availability → book → pay deposit → get confirmation.
- Admin can do everything in §8; every change is audited and (where relevant) pushed to Telegram.
- Manual bookings affect availability exactly like online ones.
- Fresh machine setup works from README alone: `npm install` → `npm run setup`
  (docker compose up postgres → migrate → seed) → `npm run dev` → working system with the real
  41-room inventory. Production: `docker compose -f docker-compose.prod.yml up -d` on a VPS.
- README + .env.example complete; no secrets in git.

## 14. Open questions / configuration

CONFIRMED:
1. **BOOKING_MODE = "room"** — guests book whole rooms; no bed-level sharing.
2. **Payment providers = Payme + Click** (guest chooses at checkout), Mock for dev.
3. **Stack = NestJS + Prisma + PostgreSQL**, everything runs in Docker (§3).
4. **Deposits**: standart = **30%**, lux = **50%** (stored on category, editable in admin).
5. **Pricing = per (category × capacity) tier matrix**, editable in admin (§4, `price_tiers`).
6. **Room 406 exists**: Payshanba kottej, 2 kishi, standart (included in seed).

STILL OPEN — fill in when known (⚠️):
7. **Real prices** for the 8 tiers in §4.1 (until then seed placeholders; admin can set them,
   but rooms without a resolved price must be non-bookable). → ⚠️
8. **Existing frontend stack** (plain HTML / React / Next / other) → Phase 0 audit will detect,
   but confirm if known.
9. Public site languages (ru / uz / both); currency = UZS assumed. → ⚠️
10. Min/max stay length; check-in/check-out times (default 14:00 / 12:00). → ⚠️
11. Payme & Click merchant credentials (needed only at Phase 4; Mock works without them). → ⚠️
