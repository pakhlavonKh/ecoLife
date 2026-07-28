# EcoLife API (NestJS + Prisma)

Backend: deposit payments (Mock + Payme/Click), **per-bed shared-room** availability
engine, admin CRM APIs, Telegram staff notifications.

## Booking model (bed-mode)

- Guests book **places (beds)** in a room, not necessarily the whole room.
- Several independent bookings may share one room on overlapping dates if
  `sum(beds_booked) ≤ capacity` on every night of the overlap.
- Price: **`price_per_bed_per_night` × guests × nights** (category only: lux / standart).
  Confirmed seed: lux = **800 000** UZS/bed/night, standart = **600 000**.
- Deposit % of this booking’s total (standart 30% / lux 50%).
- Admin can **close a room entirely** for dates → `room_locks` (no further beds).
- Anti-overbooking: `SELECT … FOR UPDATE` on the room row + per-night occupancy check
  inside a transaction (the old whole-room `EXCLUDE` on `booking_rooms` is gone).

## Prerequisites

- Node.js 20+
- Docker + Docker Compose

## Quick start

```bash
cd api
cp .env.example .env
npm install
npm run setup    # docker up postgres+adminer → migrate → seed
npm run dev      # NestJS on http://localhost:3000
```

- Health: `GET http://localhost:3000/api/v1/health`
- Swagger: http://localhost:3000/docs
- Adminer: http://localhost:8080 (postgres / ecolife / ecolife / ecolife)

## Mock payment (manual)

1. Pick an available room and create a booking (deposit invoice is created server-side):

```bash
# List rooms via availability (example dates) — remaining_beds per room
curl -s "http://localhost:3000/api/v1/availability?check_in=2026-08-01&check_out=2026-08-03&category_code=standart&guests=2"

curl -s -X POST http://localhost:3000/api/v1/bookings \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Ali","lastName":"Karimov","phone":"+998901234567","roomId":"<uuid>","checkIn":"2026-08-01","checkOut":"2026-08-03","guests":2,"provider":"mock"}'
```

2. Response includes `paymentUrl` (e.g. `http://localhost:3000/api/v1/payments/mock/<paymentId>`).

3. Open `paymentUrl` in a browser → click **«Оплатить успешно»**.

4. Verify booking:

```bash
curl -s http://localhost:3000/api/v1/bookings/by-code/<PUBLIC_CODE>
# status=deposit_paid, paymentStatus=deposit_paid, paidAmount=deposit, remainingAmount kept
```

Webhooks (for real providers later):

- Payme JSON-RPC: `POST /api/v1/payments/webhooks/payme`
- Click SHOP-API: `POST /api/v1/payments/webhooks/click`

## Telegram bot (staff notifications)

Domain events → in-process queue with retries → grammY.
Empty `TELEGRAM_BOT_TOKEN` disables the bot; the rest of the API keeps working.

Bed-mode templates include **guests** and **«мест в номере: X/Y занято»**.
Closing a room entirely sends an optional alert: «Номер N закрыт целиком на DD–DD»
(`system.room_locked`). Cleaners never see names / phones / money — only checkout rooms
and the morning digest of today’s departures.

### Get a bot token (BotFather)

1. Open Telegram → search **@BotFather** → `/start`
2. Send `/newbot`, choose a name and username (must end with `bot`)
3. Copy the token into `api/.env` as `TELEGRAM_BOT_TOKEN=...`

### Get your chat ID

1. Start a chat with your bot (press **Start** / send `/start`)
2. Option A: open **@userinfobot** or **@getidsbot** → it replies with your numeric `Id`
3. Option B (API): after messaging the bot,
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → look for `"chat":{"id": ...}`
4. Put it in `.env`: `TELEGRAM_ADMIN_CHAT_IDS=123456789` (comma-separated for several admins)
   — migrated to `telegram_recipients` as role `admin` when the table is empty.

### Local verify

```bash
cd api
# .env must have TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_IDS (or invite codes)
npm run dev
```

1. In Telegram, send `/today` to the bot (cleaners get checkout rooms only).
2. Create a booking → «Новое бронирование» with guests + X/Y beds.
3. Pay deposit → «Оплата получена».
4. Admin «Закрыть номер целиком» → «Номер N закрыт целиком на …».
5. Check-in / check-out / cancel / edit → matching messages.
6. Morning digest at `DIGEST_HOUR` (default 8) Asia/Tashkent.

If Telegram is down, API requests still succeed; failures are logged and retried.

## Tests

```bash
npm run test:unit   # occupancy math, status machine, hold expiry, Payme/Click, Telegram
npm run test:e2e    # bed concurrency gate (20 parallel) + happy-path
npm run test:gate   # both
```

Concurrency gate: room capacity 7 with 2 beds already taken → parallel requests for 5 beds;
total booked never exceeds capacity on any night; overflow → 409.

## Auth

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ecolife.local","password":"ChangeMeAdmin123!"}'
```

Default seed admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run setup` | `db:up` → wait → migrate → seed |
| `npm run db:up` | Start PostgreSQL 16 + Adminer |
| `npm run db:down` | Stop compose stack |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed real inventory (§4.1) |
| `npm run dev` | NestJS watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run test:gate` | Unit + concurrency / happy-path gate |

## Seed sanity totals

After seed you should see:

- 6 cottages, **41 rooms**
- LUX: 18 rooms / 150 beds
- STANDART: 23 rooms / 65 beds
- Total beds: 215

Prices (per bed / night): **lux = 800 000 UZS**, **standart = 600 000 UZS**.
Editable in admin on each category («Цена за место / ночь»).

## Bed-mode deploy notes (prod)

See root `README.md` pre-launch checklist: DB backup → migrate `bed_mode` →
**preview** then apply `prisma/scripts/backfill-room-locks.sql` → confirm prices 800/600.
