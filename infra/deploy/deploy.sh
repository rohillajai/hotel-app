#!/bin/bash
set -euo pipefail
###############################################################################
# Deploy Script — run from /opt/hotel-app/infra/deploy/
# Builds and restarts all backend services
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Hotel App Deploy ==="
echo "Project root: $PROJECT_ROOT"
echo "Deploy dir: $SCRIPT_DIR"

# ─── Validate .env.prod exists ────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env.prod" ]; then
  echo "ERROR: $SCRIPT_DIR/.env.prod not found!"
  echo "Copy .env.prod.example to .env.prod and fill in real values."
  exit 1
fi

# ─── Update coturn config with real secret from .env ──────────────────────────
source "$SCRIPT_DIR/.env.prod"
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "127.0.0.1")
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "127.0.0.1")

sed -i "s|static-auth-secret=PLACEHOLDER_REPLACED_BY_SETUP|static-auth-secret=${COTURN_SECRET}|" "$SCRIPT_DIR/coturn/turnserver.prod.conf"
# Add external-ip if not already present
if ! grep -q "external-ip=" "$SCRIPT_DIR/coturn/turnserver.prod.conf"; then
  echo "external-ip=${PUBLIC_IP}/${PRIVATE_IP}" >> "$SCRIPT_DIR/coturn/turnserver.prod.conf"
fi

# ─── Pull latest code ─────────────────────────────────────────────────────────
cd "$PROJECT_ROOT"
echo "Pulling latest code..."
git pull origin main 2>/dev/null || echo "Not a git repo or no remote — using local files"

# ─── Build and start ──────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"
echo "Building Docker images..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== Deploy Complete ==="
echo "Services:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "API:       https://api.epbx.negd.in"
echo "Signaling: https://signal.epbx.negd.in"
echo "TURN:      turn.epbx.negd.in:3478"
echo ""
echo "Logs: docker compose -f docker-compose.prod.yml logs -f"
