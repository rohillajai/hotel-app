#!/bin/bash
set -euo pipefail

###############################################################################
# deploy.sh — Run this on the EC2 instance to deploy/update the app
# Usage: cd /opt/hotel-app && ./deploy.sh
###############################################################################

REPO_URL="https://github.com/YOUR_USERNAME/Hotel_APP.git"  # UPDATE THIS
BRANCH="main"
APP_DIR="/opt/hotel-app"

echo "=== Deploying Hotel App ==="
echo "Time: $(date)"

# Pull latest code
if [ -d "$APP_DIR/repo" ]; then
  echo "=== Pulling latest changes ==="
  cd "$APP_DIR/repo"
  git pull origin "$BRANCH"
else
  echo "=== Cloning repository ==="
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR/repo"
  cd "$APP_DIR/repo"
fi

# Copy env file if not exists
if [ ! -f "infra/deploy/.env.prod" ]; then
  echo "ERROR: infra/deploy/.env.prod not found!"
  echo "Copy .env.prod.example to .env.prod and fill in your secrets first."
  exit 1
fi

# Build and start
echo "=== Building and starting services ==="
cd infra/deploy
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Run database migrations
echo "=== Running database migrations ==="
docker compose -f docker-compose.prod.yml exec api-server \
  node -e "
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma', {
      stdio: 'inherit',
      env: { ...process.env }
    });
  "

# Run seed (only first time — safe to re-run)
echo "=== Seeding database ==="
docker compose -f docker-compose.prod.yml exec api-server \
  node -e "
    const { execSync } = require('child_process');
    try {
      execSync('npx ts-node --project /app/packages/db/tsconfig.seed.json /app/packages/db/prisma/seed.ts', {
        stdio: 'inherit',
        env: { ...process.env }
      });
    } catch(e) { console.log('Seed may have already run — skipping'); }
  "

echo ""
echo "=== Deployment complete ==="
echo "Services running:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "API:       https://api.epbx.negd.in"
echo "Signaling: https://signal.epbx.negd.in"
echo "TURN:      turn:15.207.160.237:3478"
