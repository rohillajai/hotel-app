#!/bin/bash
set -euo pipefail

###############################################################################
# EC2 Server Setup Script
# Run this ONCE after SSH-ing into your new EC2 instance
# Installs Docker, Docker Compose, and prepares the deployment directory
###############################################################################

echo "=== Updating system ==="
sudo apt-get update -y
sudo apt-get upgrade -y

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

echo "=== Installing Docker Compose plugin ==="
sudo apt-get install -y docker-compose-plugin

echo "=== Installing Git ==="
sudo apt-get install -y git

echo "=== Creating app directory ==="
sudo mkdir -p /opt/hotel-app
sudo chown ubuntu:ubuntu /opt/hotel-app

echo "=== Done! ==="
echo ""
echo "IMPORTANT: Log out and log back in for docker group to take effect:"
echo "  exit"
echo "  ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<your-ip>"
echo ""
echo "Then clone your repo and start the app:"
echo "  cd /opt/hotel-app"
echo "  git clone <your-repo-url> ."
echo "  cp infra/deploy/.env.prod.example infra/deploy/.env.prod"
echo "  # Edit .env.prod with real values"
echo "  cd infra/deploy"
echo "  docker compose -f docker-compose.prod.yml up -d"
