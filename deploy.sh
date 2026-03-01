#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────
VPS_HOST="your-vps-hostname-or-ip"
VPS_USER="zettelweb"
REMOTE_DIR="/opt/zettelweb"
PM2_APP_NAME="zettelweb"
# ─────────────────────────────────────────────────────────────

echo "==> Building..."
npm run build

echo "==> Syncing to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  ./ "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "==> Installing production dependencies on remote..."
ssh "${VPS_USER}@${VPS_HOST}" "cd ${REMOTE_DIR} && npm ci --omit=dev"

echo "==> Restarting PM2..."
ssh "${VPS_USER}@${VPS_HOST}" "cd ${REMOTE_DIR} && pm2 startOrRestart ecosystem.config.cjs --update-env"

echo "==> Deploy complete!"
