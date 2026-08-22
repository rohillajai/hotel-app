#!/bin/bash
###############################################################################
# Hotel App — One-time EC2 server setup script
# Run this ONCE on a fresh Ubuntu 22.04 EC2 instance
#
# Usage: ssh into EC2, then:
#   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/infra/deploy/setup-server.sh | bash
#   OR copy-paste this script and run it
###############################################################################

set -euo pipefail

echo "=== Hotel App Server Setup ==="
echo "This installs Docker, Docker Compose, and prepares the server."
echo ""

export DEBIAN_FRONTEND=noninteractive

# Update system
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Docker
echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Install Git
sudo apt-get install -y git

# Create app directory
sudo mkdir -p /opt/hotel-app
sudo chown ubuntu:ubuntu /opt/hotel-app

# Open firewall ports
echo "=== Note: Ensure your EC2 Security Group allows: ==="
echo "  - TCP 80   (HTTP → redirects to HTTPS)"
echo "  - TCP 443  (HTTPS — Caddy handles certs)"
echo "  - UDP 3478 (STUN/TURN)"
echo "  - UDP 49152-65535 (TURN relay range)"
echo ""

echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Log out and log back in (for Docker group to take effect)"
echo "  2. cd /opt/hotel-app"
echo "  3. Clone your repo or copy files"
echo "  4. cp .env.prod.example .env.prod and fill in secrets"
echo "  5. docker compose -f docker-compose.prod.yml up -d"
echo ""
