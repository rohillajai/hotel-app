#!/bin/bash
set -euo pipefail
###############################################################################
# Deploy Script — Run on the EC2 server after git pull
# Builds containers and starts all services
###############################################################################

cd /opt/hotel-app

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Setting up coturn config ==="
# Replace placeholders with actual values from .env.prod
EXTERNAL_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
source infra/deploy/.env.prod

sed "s/EXTERNAL_IP_PLACEHOLDER/${EXTERNAL_IP}/" infra/deploy/coturn/turnserver.prod.conf \
  | sed "s/COTURN_SECRET_PLACEHOLDER/${COTURN_SECRET}/" \
  > /tmp/turnserver.conf
cp /tmp/turnserver.conf infra/deploy/coturn/turnserver.prod.conf

echo "=== Building and starting containers ==="
cd infra/deploy
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo "=== Waiting for PostgreSQL to be ready ==="
sleep 10

echo "=== Running database migrations ==="
docker compose -f docker-compose.prod.yml exec api-server sh -c "
  cd /app/packages/db && npx prisma migrate deploy
"

echo "=== Running seed (if first deploy) ==="
docker compose -f docker-compose.prod.yml exec api-server sh -c "
  cd /app/packages/db && npx ts-node --project tsconfig.seed.json prisma/seed.ts || echo 'Seed already applied or failed (non-fatal)'
"

echo ""
echo "================================================================"
echo " Deployment complete!"
echo ""
echo " Services:"
echo "   API:       https://api.epbx.negd.in"
echo "   Signaling: https://signal.epbx.negd.in"
echo "   TURN:      turn.epbx.negd.in:3478"
echo ""
echo " Check logs:"
echo "   docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo " Check health:"
echo "   curl https://api.epbx.negd.in/health"
echo "================================================================"
