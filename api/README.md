# EcoLife API (NestJS + Prisma)

Phase 2 backend: auth (JWT + refresh rotation), RBAC, and core inventory CRUD.

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

## Auth

```bash
# Login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ecolife.local","password":"ChangeMeAdmin123!"}'

# Protected (Bearer access token)
curl -s http://localhost:3000/api/v1/admin/categories \
  -H "Authorization: Bearer <accessToken>"
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

## Seed sanity totals

After seed you should see:

- 6 cottages, **41 rooms**
- LUX: 18 rooms / 150 beds
- STANDART: 23 rooms / 65 beds
- Total beds: 215

Price tiers are seeded with placeholder amounts (`1000000.00` UZS) — edit via `PUT /api/v1/admin/price-tiers`.
