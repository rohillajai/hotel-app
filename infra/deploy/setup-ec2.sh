#!/bin/bash
set -euo pipefail

###############################################################################
# EC2 initial setup script — run once after SSH'ing into the instance
# Instance: t3.medium, Ubuntu 22.04, ap-south-1
# IP: 15.207.160.237
###############################################################################

echo "=== Updating system ==="
sudo apt-get update -y && sudo apt-get upgrade -y

echo "=== Installing Docker ==="
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Adding user to docker group ==="
sudo usermod -aG docker ubuntu
newgrp docker 2>/dev/null || true

echo "=== Installing Git ==="
sudo apt-get install -y git

echo "=== Creating app directory ==="
sudo mkdir -p /opt/hotel-app
sudo chown ubuntu:ubuntu /opt/hotel-app

echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Log out and back in (for docker group to take effect)"
echo "  2. Clone your repo to /opt/hotel-app"
echo "  3. Copy .env.prod to /opt/hotel-app/infra/deploy/.env.prod"
echo "  4. Run: cd /opt/hotel-app/infra/deploy && docker compose -f docker-compose.prod.yml up -d"
