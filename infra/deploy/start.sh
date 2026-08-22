#!/bin/bash
set -euo pipefail

###############################################################################
# Start the Hotel App production stack
# Run from the repo root: ./infra/deploy/start.sh
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "=== Configuring coturn with server's public IP ==="
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || curl -s ifconfig.me)
PRIVATE_IP=$(hostname -I | awk '{print $1}')
COTURN_SECRET=$(grep COTURN_SECRET infra/deploy/.env.prod | cut -d'=' -f2)

# Generate coturn config with actual IPs
cat > infra/deploy/coturn/turnserver.prod.conf << CONF
listening-port=3478
listening-ip=0.0.0.0
relay-ip=${PRIVATE_IP}
external-ip=${PUBLIC_IP}/${PRIVATE_IP}
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
CONF

echo "  Public IP: ${PUBLIC_IP}"
echo "  Private IP: ${PRIVATE_IP}"

echo "=== Building and starting containers ==="
docker compose -f infra/deploy/docker-compose.prod.yml --env-file infra/deploy/.env.prod up -d --build

echo "=== Waiting for services to be healthy ==="
sleep 10

echo "=== Running database migrations ==="
docker compose -f infra/deploy/docker-compose.prod.yml exec api-server node -e "
const { execSync } = require('child_process');
execSync('npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma', { stdio: 'inherit', cwd: '/app' });
"

echo "=== Seeding database ==="
docker compose -f infra/deploy/docker-compose.prod.yml exec api-server node -e "
const { execSync } = require('child_process');
try {
  execSync('npx ts-node --project packages/db/tsconfig.seed.json packages/db/prisma/seed.ts', { stdio: 'inherit', cwd: '/app' });
} catch(e) { console.log('Seed may have already run — skipping'); }
"

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Services running:"
echo "  API:       https://api.epbx.negd.in"
echo "  Signaling: https://signal.epbx.negd.in"
echo "  TURN:      turn.epbx.negd.in:3478"
echo ""
echo "Check status: docker compose -f infra/deploy/docker-compose.prod.yml ps"
echo "View logs:    docker compose -f infra/deploy/docker-compose.prod.yml logs -f"
