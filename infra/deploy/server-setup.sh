#!/bin/bash
set -euo pipefail
###############################################################################
# EC2 Server Setup Script — Run once after SSH-ing into the new EC2 instance
# Ubuntu 22.04 LTS, t3.medium, ap-south-1
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

echo "=== Adding ubuntu user to docker group ==="
sudo usermod -aG docker ubuntu

echo "=== Installing Git ==="
sudo apt-get install -y git

echo "=== Opening firewall ports ==="
# HTTP, HTTPS, STUN/TURN, TURN relay range
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
sudo ufw --force enable

echo "=== Creating app directory ==="
sudo mkdir -p /opt/hotel-app
sudo chown ubuntu:ubuntu /opt/hotel-app

echo ""
echo "================================================================"
echo " Server setup complete!"
echo " Log out and log back in for docker group to take effect:"
echo "   exit"
echo "   ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<YOUR-IP>"
echo ""
echo " Then clone your repo:"
echo "   cd /opt/hotel-app"
echo "   git clone <YOUR-REPO-URL> ."
echo "================================================================"
