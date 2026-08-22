#!/bin/bash
set -euo pipefail

# Signaling Server EC2 user-data script
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y curl git

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm@9 pm2

mkdir -p /opt/hotel-app
chown ubuntu:ubuntu /opt/hotel-app

echo "Signaling server EC2 ready — deploy app via CI/CD"
