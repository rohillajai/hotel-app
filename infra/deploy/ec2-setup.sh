#!/bin/bash
set -euo pipefail

###############################################################################
# Run this ONCE after SSH-ing into the EC2 instance
# Installs Docker, Docker Compose, and clones the repo
###############################################################################

echo "=== Updating system ==="
sudo apt-get update -y && sudo apt-get upgrade -y

echo "=== Installing Docker ==="
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add ubuntu user to docker group (no sudo needed for docker commands)
sudo usermod -aG docker ubuntu

echo "=== Installing Git ==="
sudo apt-get install -y git

echo "=== Setup complete ==="
echo "Log out and back in for docker group to take effect:"
echo "  exit"
echo "  ssh -i <key> ubuntu@15.207.160.237"
echo ""
echo "Then clone your repo and deploy:"
echo "  git clone <your-repo-url> hotel-app"
echo "  cd hotel-app/infra/deploy"
echo "  cp .env.prod.example .env.prod"
echo "  nano .env.prod    # fill in secrets"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
