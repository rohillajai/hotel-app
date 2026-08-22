#!/bin/bash
set -euo pipefail

###############################################################################
# coturn EC2 setup script — runs as user-data on first boot
# Ubuntu 22.04, ap-south-1
###############################################################################

export DEBIAN_FRONTEND=noninteractive

echo "=== Installing coturn ==="
apt-get update -y
apt-get install -y coturn certbot

# Enable coturn service
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Fetch secrets from AWS Secrets Manager (requires IAM role with secretsmanager:GetSecretValue)
apt-get install -y awscli jq
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
SECRET_ARN=$(aws secretsmanager list-secrets --region "$REGION" --query "SecretList[?Name=='hotel-app/production/coturn-secret'].ARN" --output text)
COTURN_SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$REGION" --query SecretString --output text)

# Get public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)

echo "=== Writing turnserver.conf ==="
cat > /etc/turnserver.conf << CONF
# coturn production config — Hotel App

listening-port=3478
tls-listening-port=443

listening-ip=${PRIVATE_IP}
relay-ip=${PRIVATE_IP}
external-ip=${PUBLIC_IP}/${PRIVATE_IP}

min-port=49152
max-port=65535

# HMAC time-limited credentials (RFC 5766)
use-auth-secret
static-auth-secret=${COTURN_SECRET}

realm=turn.hotelapp.in

# Security
fingerprint
no-tcp-relay
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255

# TLS — Let's Encrypt cert (run certbot separately)
# cert=/etc/letsencrypt/live/turn.hotelapp.in/fullchain.pem
# pkey=/etc/letsencrypt/live/turn.hotelapp.in/privkey.pem

no-tlsv1
no-tlsv1_1

# Logging
log-file=/var/log/turnserver.log
simple-log

# Performance
proc-quota-per-user=0
total-quota=0
CONF

echo "=== Starting coturn ==="
systemctl restart coturn
systemctl enable coturn

echo "=== coturn setup complete ==="
echo "Public IP: ${PUBLIC_IP}"
echo "STUN/TURN port: 3478"
echo "Relay range: 49152-65535"
