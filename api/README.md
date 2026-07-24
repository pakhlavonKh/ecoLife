# EcoLife API (NestJS + Prisma)

Phase 4 backend: deposit payments (Mock end-to-end + Payme/Click adapters), availability engine, whole-room bookings.

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

## Phase 4 — Mock payment (manual)

1. Pick an available room and create a booking (deposit invoice is created server-side):

```bash
# List rooms via availability (example dates)
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

## Tests

```bash
npm run test:unit   # overlap, status machine, hold expiry, Payme/Click signature + idempotency
npm run test:e2e    # 20 parallel POST /bookings → 1 success + 19×409
npm run test:gate   # both
```

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
| `npm run test:gate` | Unit + concurrency gate |

## Seed sanity totals

After seed you should see:

- 6 cottages, **41 rooms**
- LUX: 18 rooms / 150 beds
- STANDART: 23 rooms / 65 beds
- Total beds: 215

Price tiers are seeded with placeholder amounts (`1000000.00` UZS) — edit via `PUT /api/v1/admin/price-tiers`.
