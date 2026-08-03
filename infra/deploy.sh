#!/usr/bin/env bash
# deploy.sh — Run on your VPS after cloning the repo.
# Usage: bash infra/deploy.sh yourdomain.com your@email.com
set -euo pipefail

DOMAIN="${1:-yourdomain.com}"
EMAIL="${2:-you@example.com}"
API_DOMAIN="api.${DOMAIN}"
ADMIN_DOMAIN="admin.${DOMAIN}"

echo "==> Deploying Restaurant POS"
echo "    API:   https://${API_DOMAIN}"
echo "    Admin: https://${ADMIN_DOMAIN}"
echo ""

# ── 1. Prerequisites ───────────────────────────────────────────────────────────
command -v docker  >/dev/null || { echo "Install Docker first: https://docs.docker.com/engine/install/"; exit 1; }
command -v openssl >/dev/null || apt-get install -y openssl

# ── 2. Create .env from example if not present ────────────────────────────────
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  # Generate random secrets
  JWT=$(openssl rand -hex 64)
  REFRESH=$(openssl rand -hex 64)
  PG_PASS=$(openssl rand -hex 24)
  sed -i "s/CHANGE_ME_STRONG_PASSWORD/${PG_PASS}/" .env
  sed -i "s/CHANGE_ME_64_CHAR_HEX$/${JWT}/" .env
  sed -i "s/CHANGE_ME_64_CHAR_HEX_DIFFERENT/${REFRESH}/" .env
  sed -i "s/yourdomain.com/${DOMAIN}/g" .env
  echo "  .env created with random secrets — review it before proceeding"
fi

# ── 3. Patch nginx conf with actual domains ────────────────────────────────────
sed -i "s/api\.yourdomain\.com/${API_DOMAIN}/g"   nginx/conf.d/api.conf
sed -i "s/admin\.yourdomain\.com/${ADMIN_DOMAIN}/g" nginx/conf.d/master-admin.conf

# ── 4. Start nginx first (needed for certbot HTTP-01 challenge) ───────────────
echo "==> Starting nginx (HTTP only for SSL challenge)..."
# Temporarily comment out SSL blocks so nginx starts before certs exist
sed -i 's/^\( *listen 443 ssl\)/#\1/' nginx/conf.d/api.conf nginx/conf.d/master-admin.conf
sed -i 's/^\( *ssl_\)/#\1/' nginx/conf.d/api.conf nginx/conf.d/master-admin.conf

docker compose up -d nginx

# ── 5. Obtain SSL certificates ────────────────────────────────────────────────
echo "==> Obtaining SSL certificates..."
docker compose run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --non-interactive --agree-tos \
  --email "${EMAIL}" \
  -d "${API_DOMAIN}" -d "${ADMIN_DOMAIN}"

# Restore SSL config
sed -i 's/^#\( *listen 443 ssl\)/\1/' nginx/conf.d/api.conf nginx/conf.d/master-admin.conf
sed -i 's/^#\( *ssl_\)/\1/' nginx/conf.d/api.conf nginx/conf.d/master-admin.conf

# ── 6. Start everything ───────────────────────────────────────────────────────
echo "==> Starting all services..."
docker compose up -d --build

echo ""
echo "✓ Deployed!"
echo "  API:         https://${API_DOMAIN}"
echo "  Master Admin: https://${ADMIN_DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Run: docker compose exec api npx prisma db seed"
echo "     (to load initial data)"
echo "  2. Build Electron apps pointing to https://${API_DOMAIN}"
echo "     VITE_API_URL=https://${API_DOMAIN} pnpm --filter @restaurant-pos/web electron:build:win"
echo "     VITE_API_URL=https://${API_DOMAIN} pnpm --filter @restaurant-pos/kds electron:build:win"
