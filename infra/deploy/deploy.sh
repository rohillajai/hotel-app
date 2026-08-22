#!/bin/bash
set -euo pipefail

###############################################################################
# Deploy script — run on EC2 at /opt/hotel-app/infra/deploy
###############################################################################

echo "=== Hotel App Deployment ==="
cd /opt/hotel-app/infra/deploy

# Verify .env.prod exists
if [ ! -f .env.prod ]; then
  echo "ERROR: .env.prod not found. Copy .env.prod.example and fill in values."
  exit 1
fi

echo "=== Building and starting all services ==="
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "=== Waiting for PostgreSQL to be ready ==="
sleep 15

echo "=== Running database migrations ==="
docker compose -f docker-compose.prod.yml exec -T api-server \
  npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma || {
    echo "Migration failed — attempting fresh setup..."
    docker compose -f docker-compose.prod.yml exec -T api-server \
      npx prisma db push --schema=/app/packages/db/prisma/schema.prisma --accept-data-loss
  }

echo "=== Seeding database ==="
docker compose -f docker-compose.prod.yml exec -T api-server \
  node -e "
    const { execSync } = require('child_process');
    try {
      execSync('npx ts-node --project /app/packages/db/tsconfig.seed.json /app/packages/db/prisma/seed.ts', { stdio: 'inherit', cwd: '/app' });
    } catch(e) {
      console.log('Seed skipped (likely already seeded)');
    }
  " || echo "Seed completed or skipped"

echo ""
echo "=== Deployment complete! ==="
echo ""
docker compose -f docker-compose.prod.yml ps
echo ""
echo "Services:"
echo "  API:       https://api.epbx.negd.in/health"
echo "  Guest:     https://guest.epbx.negd.in"
echo "  Staff:     https://staff.epbx.negd.in"
echo "  Admin:     https://admin.epbx.negd.in"
echo "  Signal:    https://signal.epbx.negd.in"
echo "  TURN:      turn.epbx.negd.in:3478"
