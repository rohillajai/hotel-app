#!/bin/bash
set -euo pipefail

# API Server EC2 user-data script
# Installs Node.js 20, pm2, and starts the NestJS API server

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y curl git

# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# pnpm
npm install -g pnpm@9

# pm2 for process management
npm install -g pm2

# Create app directory
mkdir -p /opt/hotel-app
chown ubuntu:ubuntu /opt/hotel-app

echo "API server EC2 ready — deploy app via CI/CD"
