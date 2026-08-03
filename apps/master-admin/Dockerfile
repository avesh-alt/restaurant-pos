FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/master-admin/package.json ./apps/master-admin/

RUN pnpm install --frozen-lockfile --filter @restaurant-pos/master-admin

COPY apps/master-admin/ ./apps/master-admin/

# Inject API URL at build time (pass as --build-arg)
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm --filter @restaurant-pos/master-admin build

# ── Serve with nginx ───────────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/apps/master-admin/dist /usr/share/nginx/html

# nginx config: serve index.html for all routes (SPA fallback)
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  gzip on;\n\
  gzip_types text/plain text/css application/javascript application/json;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
