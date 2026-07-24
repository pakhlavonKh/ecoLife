# EcoLife API (NestJS + Prisma)

Phase 1 backend for the cottage resort booking platform.

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

Health check: `GET http://localhost:3000/api/v1/health`

Adminer (DB UI): http://localhost:8080  
- System: PostgreSQL  
- Server: `postgres`  
- User / Password / Database: `ecolife` / `ecolife` / `ecolife`

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

Price tiers are seeded with placeholder amounts (`1000000.00` UZS) — edit via admin later.
