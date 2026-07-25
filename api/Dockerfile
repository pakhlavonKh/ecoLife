# EcoLife API — multi-stage production image (non-root)
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ openssl libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma/
COPY src ./src/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat wget procps \
  && addgroup -S ecolife \
  && adduser -S ecolife -G ecolife

ENV NODE_ENV=production
ENV PORT=3000

# Production deps + prisma CLI / tsx for migrate & seed
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev \
  && npm install prisma@6.11.1 tsx@4.20.3 --no-save --omit=dev \
  && npx prisma generate \
  && apk del python3 make g++ \
  && rm -rf /root/.npm

COPY --from=build /app/dist ./dist
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
