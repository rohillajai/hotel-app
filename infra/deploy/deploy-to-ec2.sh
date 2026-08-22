#!/bin/bash
set -euo pipefail

###############################################################################
# Deploy Hotel App to EC2 (15.207.160.237)
# Run this from your local machine: ./infra/deploy/deploy-to-ec2.sh
###############################################################################

EC2_IP="15.207.160.237"
EC2_USER="ubuntu"
SSH_KEY="~/.ssh/hotel-app-prod.pem"
REMOTE_DIR="/opt/hotel-app"

echo "=== Deploying Hotel App to ${EC2_IP} ==="

# 1. Sync project files to EC2 (exclude unnecessary files)
echo "--- Syncing files to EC2..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.turbo' \
  --exclude 'coverage' \
  --exclude 'infra/terraform' \
  -e "ssh -i ${SSH_KEY}" \
  ./ ${EC2_USER}@${EC2_IP}:${REMOTE_DIR}/

# 2. SSH in and run docker compose
echo "--- Building and starting services on EC2..."
ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_IP} << 'REMOTE_SCRIPT'
cd /opt/hotel-app

# Copy env file if not exists
if [ ! -f infra/deploy/.env.prod ]; then
  echo "ERROR: infra/deploy/.env.prod not found on EC2!"
  echo "Copy .env.prod.example to .env.prod and fill in real values first."
  exit 1
fi

# Update coturn config with public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "15.207.160.237")
COTURN_SECRET=$(grep COTURN_SECRET infra/deploy/.env.prod | cut -d= -f2)

cat > infra/deploy/coturn/turnserver.prod.conf << TURNCONF
listening-port=3478
listening-ip=0.0.0.0
relay-ip=0.0.0.0
external-ip=${PUBLIC_IP}
min-port=49152
max-port=65535
use-auth-secret
static-auth-secret=${COTURN_SECRET}
realm=turn.epbx.negd.in
fingerprint
no-tcp-relay
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
no-tlsv1
no-tlsv1_1
log-file=stdout
simple-log
TURNCONF

# Build and start
cd infra/deploy
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Wait for postgres to be ready
echo "--- Waiting for PostgreSQL..."
sleep 10

# Run migrations
echo "--- Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T api-server sh -c "
  cd /app && npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
"

# Run seed (only first time — safe to re-run)
echo "--- Running seed..."
docker compose -f docker-compose.prod.yml exec -T api-server sh -c "
  cd /app && node -e \"
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    db.tenant.findFirst().then(t => {
      if (!t) {
        console.log('No tenant found — running seed...');
        require('child_process').execSync('npx ts-node packages/db/prisma/seed.ts', { stdio: 'inherit', cwd: '/app' });
      } else {
        console.log('Tenant exists — skipping seed.');
      }
    }).finally(() => db.\$disconnect());
  \"
" 2>/dev/null || echo "Seed skipped (run manually if needed)"

echo ""
echo "=== Deployment complete ==="
docker compose -f docker-compose.prod.yml ps
REMOTE_SCRIPT

echo ""
echo "=== Done! ==="
echo "API:       https://api.epbx.negd.in/health"
echo "Signaling: https://signal.epbx.negd.in/health"
echo "TURN:      turn.epbx.negd.in:3478"
