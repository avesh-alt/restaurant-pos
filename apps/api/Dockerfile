FROM node:22-alpine AS base

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ── Dependencies stage ─────────────────────────────────────────────────
FROM base AS deps

WORKDIR /app

# Copy workspace manifests (no source yet)
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install only production deps for api + its workspace deps
RUN pnpm install --frozen-lockfile --filter @restaurant-pos/api...

# ── Build stage ────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy source for shared + api
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared first, then api
RUN pnpm --filter @restaurant-pos/shared build
RUN pnpm --filter @restaurant-pos/api build

# ── Runtime stage ──────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install prod-only dependencies
RUN pnpm install --frozen-lockfile --prod --filter @restaurant-pos/api...

# Copy built output
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Generate prisma client in runtime image
RUN cd apps/api && npx prisma generate

WORKDIR /app/apps/api

EXPOSE 4000

# Run migrations then start (safe for container restarts — migrate deploy is idempotent)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
