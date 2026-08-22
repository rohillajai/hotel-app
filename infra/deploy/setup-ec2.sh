#!/bin/bash
set -euo pipefail

###############################################################################
# EC2 Setup Script — Run this once on a fresh Ubuntu 22.04 t3.medium instance
# in ap-south-1 with an Elastic IP attached.
#
# Prerequisites:
#   - EC2 instance with Ubuntu 22.04 AMI
#   - Elastic IP associated
#   - Security group allows: 80, 443, 3478/udp, 49152-65535/udp
#   - At least 20GB EBS volume
###############################################################################

echo "=== Hotel App EC2 Setup ==="

export DEBIAN_FRONTEND=noninteractive

# ── System updates ────────────────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y

# ── Install Docker ────────────────────────────────────────────────────────────
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# ── Install Git ───────────────────────────────────────────────────────────────
apt-get install -y git

# ── Create app directory ──────────────────────────────────────────────────────
mkdir -p /opt/hotel-app
chown ubuntu:ubuntu /opt/hotel-app

# ── Open firewall (if ufw is enabled) ────────────────────────────────────────
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw allow 3478/udp 2>/dev/null || true
ufw allow 49152:65535/udp 2>/dev/null || true

# ── Increase file limits for coturn ──────────────────────────────────────────
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65535
* hard nofile 65535
EOF

echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. su - ubuntu"
echo "  2. cd /opt/hotel-app"
echo "  3. git clone <your-repo> ."
echo "  4. cp infra/deploy/.env.prod.example infra/deploy/.env.prod"
echo "  5. Edit .env.prod with your secrets"
echo "  6. Update coturn/turnserver.prod.conf with your coturn_secret and external-ip"
echo "  7. docker compose -f infra/deploy/docker-compose.prod.yml up -d"
echo ""
