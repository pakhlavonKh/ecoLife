# EcoLife admin SPA — build static assets, serve with nginx under /admin/
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty VITE_API_URL → same-origin /api via reverse proxy
ENV VITE_API_URL=
RUN npm run build

FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache wget
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/admin

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/admin/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
