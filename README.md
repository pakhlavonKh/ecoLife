# EcoLife — cottage resort booking platform

Booking platform for a cottage resort: NestJS API + PostgreSQL, public React site (Netlify), admin SPA, mock/Payme/Click deposits, Telegram staff notifications.

Inventory: **Cottage → Room** (capacity = beds). Booking is **per bed** (shared room): several bookings may occupy one room on overlapping dates as long as nightly occupancy ≤ capacity. Price is **per bed per night by category** (lux / standart). Admin can **lock** a room for specific dates (`room_locks`) so no further beds are sold. Overbooking is blocked by row locks + per-night occupancy checks in a transaction.

---

## Stack

| Piece | Tech |
|--------|------|
| API | NestJS, Prisma, PostgreSQL 16 |
| Public site | React + Vite (this repo root) → **Netlify** |
| Admin | React + Vite + Tailwind (`admin/`) → Docker/nginx at `/admin` |
| Payments | Mock (dev), Payme, Click |
| Notifications | Telegram bot (grammY) |

---

## Local development (3 commands)

Prerequisites: **Docker**, **Node.js 20+**.

```bash
cd api
cp .env.example .env
npm install
npm run setup          # docker postgres + migrate + seed
npm run dev            # API on http://localhost:3000
```

Then in other terminals:

```bash
# Public site
cd ..                  # repo root
cp .env.example .env   # optional; leave VITE_API_URL empty for Vite proxy
npm install
npm run dev            # http://localhost:5173

# Admin panel
cd admin
cp .env.example .env   # leave VITE_API_URL empty for proxy
npm install
npm run dev            # http://localhost:5174
```

- Swagger (non-prod): http://localhost:3000/docs  
- Adminer (DB UI): http://localhost:8080  
- Seed admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `api/.env` (default `admin@ecolife.local` / `ChangeMeAdmin123!`)

---

## Tests

```bash
cd api
npm run test:unit      # unit specs (availability, payments, telegram, …)
npm run test:e2e       # bed concurrency gate + happy-path e2e (needs DB up + seeded)
npm run test:gate      # unit + e2e
```

Happy path: create booking → mock pay → `deposit_paid` → confirm → check-in → check-out.
Concurrency gate: parallel bookings for remaining beds — never exceed capacity; overflow → 409.

---

## Public site on Netlify

The marketing/booking frontend stays on **Netlify**. Set build env:

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | Public origin of the VPS API, e.g. `https://your.domain.tld` (no trailing slash) |
| `VITE_PAYMENTS_ENABLED` | Optional mirror of API `PAYMENTS_ENABLED` (default `false`). Prefer API `GET /api/v1/config`. |
| `VITE_PAYMENT_PROVIDERS` | `payme,click` when payments are on (omit `mock` in production) |

Netlify build: `npm run build`, publish directory `dist`.

---

## Production deploy (VPS)

One-command stack: API, Telegram bot worker, Postgres, daily `pg_dump` backups (7 days), admin static nginx, reverse proxy (TLS-ready).

### 1. Prepare host

- Docker Engine + Compose plugin  
- Open ports **80** / **443**  
- Clone this repo on the VPS

### 2. Configure secrets

```bash
cp .env.prod.example .env
# Edit .env — strong POSTGRES_PASSWORD, JWT_*, ADMIN_PASSWORD, URLs, payment & Telegram keys
```

Set URLs consistently:

- `PUBLIC_SITE_URL` = Netlify site URL  
- `ADMIN_PANEL_URL` = `https://your.domain.tld/admin`  
- `PUBLIC_API_URL` = `https://your.domain.tld`

### 3. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Seed inventory (first boot only)

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```

Sanity: 6 cottages, 41 rooms (18 lux / 23 standart). Prices: lux **800 000** / standart **600 000** UZS per bed per night.

### 5. Verify

```bash
curl -s http://your.domain.tld/api/v1/health
# → {"status":"ok","service":"ecolife-api","phase":9}

# Admin UI
open http://your.domain.tld/admin/
```

### 6. TLS (certbot)

```bash
# Obtain cert (replace domain/email)
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d your.domain.tld \
  --email you@example.com --agree-tos --no-eff-email

# Uncomment the HTTPS server block in deploy/nginx/nginx.conf (set server_name + cert paths)
# Optionally enable HTTP→HTTPS redirect in the :80 server
docker compose -f docker-compose.prod.yml up -d nginx

# Auto-renewal profile
docker compose -f docker-compose.prod.yml --profile tls up -d certbot
```

Routes behind nginx:

| Path | Target |
|------|--------|
| `/api/` | API (includes Payme/Click webhooks under `/api/v1/payments/webhooks/…`) |
| `/uploads/` | Category images |
| `/admin/` | Admin SPA |
| `/.well-known/acme-challenge/` | Certbot |

---

## Backup & restore

Backups run daily in the `backup` service (`pg_dump` custom format → volume `ecolife_backups`, keep **7 days**).

List dumps:

```bash
docker compose -f docker-compose.prod.yml exec backup ls -lah /backups
```

Restore (stops writers briefly — schedule a maintenance window):

```bash
# Copy a dump out if needed
docker compose -f docker-compose.prod.yml cp backup:/backups/ecolife_YYYYMMDD_HHMMSS.dump ./

# Restore into postgres
docker compose -f docker-compose.prod.yml stop api bot
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U ecolife -d ecolife --clean --if-exists < ecolife_YYYYMMDD_HHMMSS.dump
docker compose -f docker-compose.prod.yml start api bot
```

Or restore from inside the backup container (file already on the volume):

```bash
docker compose -f docker-compose.prod.yml exec backup \
  pg_restore -h postgres -U ecolife -d ecolife --clean --if-exists \
  /backups/ecolife_YYYYMMDD_HHMMSS.dump
```

---

## Rotating secrets

| Secret | How |
|--------|-----|
| **JWT_ACCESS_SECRET / JWT_REFRESH_SECRET** | Generate new values in `.env` → `docker compose -f docker-compose.prod.yml up -d api` (users must log in again; refresh tokens invalidated) |
| **TELEGRAM_BOT_TOKEN** | Revoke via [@BotFather](https://t.me/BotFather) → `/revoke` → put new token in `.env` → recreate `api` + `bot` |
| **ADMIN_PASSWORD** | Change in admin DB: re-seed is destructive. Prefer: update hash via a one-off script or create a new admin user in DB / future admin UI. For emergency: set `ADMIN_PASSWORD` and re-run seed only on empty users table, or `UPDATE users SET password_hash=…`. Simplest ops path: change password in `.env` and run a small node one-liner with argon2 against the running api container |
| **POSTGRES_PASSWORD** | Update `.env` + alter role in Postgres + recreate api/bot/backup with new `DATABASE_URL` |
| **Payme / Click keys** | Rotate at provider dashboard → update `.env` → recreate `api` |

Example: rotate admin password with argon2 inside the API container:

```bash
docker compose -f docker-compose.prod.yml exec api node -e "
const argon2=require('argon2');
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
argon2.hash(process.env.ADMIN_PASSWORD,{type:argon2.argon2id}).then(h=>
  p.user.update({where:{email:process.env.ADMIN_EMAIL},data:{passwordHash:h}})
).then(()=>p.\$disconnect());
"
```

---

## Pre-launch checklist

### Bed-mode cutover (existing production DB)

- [ ] **Backup DB** first (`pg_dump` / backup service volume)  
- [ ] Deploy code + **apply Prisma migrations** (incl. `bed_mode_schema` + `notification_room_locked`) on the server  
- [ ] **Preview** lock backfill: run the commented `SELECT` in `api/prisma/scripts/backfill-room-locks.sql` — confirm with owner  
- [ ] **Apply** backfill INSERT (preserves whole-room exclusivity for pre-bed-mode bookings)  
- [ ] **Confirm prices** on categories: lux **800 000** / standart **600 000** UZS per bed/night (re-enter if old tier values were different)  
- [ ] Smoke-test: shared-room booking, room lock, public «осталось X из Y», Telegram new-booking + lock alerts  

### General

- [ ] Set real **Payme** (`PAYME_MERCHANT_ID`, `PAYME_KEY`) and **Click** (`CLICK_MERCHANT_ID`, `CLICK_SERVICE_ID`, `CLICK_SECRET_KEY`) credentials  
- [ ] Set `PAYMENT_PROVIDERS=payme,click` (no `mock` in production)  
- [ ] Flip `PAYMENTS_ENABLED=true` (API) when ready — until then public bookings are operator pre-requests (`online_request`)  
- [ ] Configure Netlify `VITE_API_URL` + `VITE_PAYMENT_PROVIDERS`  
- [ ] **Revoke** any Telegram bot token that was ever committed or shared; put a fresh token in prod `.env`  
- [ ] Change **ADMIN_PASSWORD** from the seed default  
- [ ] Strong unique `JWT_*` and `POSTGRES_PASSWORD`  
- [ ] Confirm `PUBLIC_SITE_URL` / `ADMIN_PANEL_URL` / `PUBLIC_API_URL` match real HTTPS origins  
- [ ] TLS certificates installed; webhook URLs registered at Payme/Click  
- [ ] `npm run test:gate` green against a seeded DB  

---

## Project layout

```
├── api/                 NestJS API, Prisma, e2e tests
├── admin/               Admin SPA (Vite)
├── src/                 Public site (Vite) → Netlify
├── deploy/
│   ├── nginx/           Reverse proxy config (TLS-ready)
│   └── backup/          Daily pg_dump worker
├── docker-compose.prod.yml
├── .env.prod.example
├── AGENTS.md            Original product master prompt
└── BED_MODE.md          Per-bed shared-room change prompt
```

---

## License

UNLICENSED — private project.
