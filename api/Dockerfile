# EcoLife API — multi-stage production image (non-root)
# syntax=docker/dockerfile:1

# ── Stage 1: install ALL deps + generate Prisma client ──────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# Build tools needed only for native addons (argon2, etc.)
RUN apk add --no-cache python3 make g++ openssl libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma/
# Cache mount: packages are downloaded once and reused on every subsequent build.
RUN --mount=type=cache,target=/root/.npm \
  npm ci --prefer-offline
RUN npx prisma generate

# ── Stage 2: compile TypeScript ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma/
COPY src ./src/
RUN npm run build

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat wget procps \
  && addgroup -S ecolife \
  && adduser -S ecolife -G ecolife

ENV NODE_ENV=production
ENV PORT=3000

# Reuse the full node_modules from deps (includes prisma, tsx, etc.).
# No second npm install needed — saves 5–10 minutes per build.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json package-lock.json ./
COPY prisma ./prisma/

COPY --from=build /app/dist ./dist
COPY assets ./assets
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/uploads/categories \
  && chown -R ecolife:ecolife /app

USER ecolife
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["api"]
