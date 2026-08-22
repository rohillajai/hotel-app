#!/bin/bash
###############################################################################
# Generate production secrets and create .env.prod
# Run this ONCE on your local machine, then scp the .env.prod to the EC2
###############################################################################

DB_PASS=$(openssl rand -base64 16 | tr -d '/+=')
JWT_SEC=$(openssl rand -base64 32)
JWT_REF=$(openssl rand -base64 32)
COTURN_SEC=$(openssl rand -base64 24)
SIG_SEC=$(openssl rand -base64 32)

cat > .env.prod << EOF
# Generated on $(date)
# DO NOT COMMIT THIS FILE

# Database
POSTGRES_DB=hotelapp
POSTGRES_USER=hotelapp
POSTGRES_PASSWORD=${DB_PASS}

# App
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://hotelapp:${DB_PASS}@postgres:5432/hotelapp
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=${JWT_SEC}
JWT_REFRESH_SECRET=${JWT_REF}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=FILL_IN_YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=FILL_IN_YOUR_SECRET_KEY

# S3 (buckets will be created manually)
S3_KYC_BUCKET=hotel-app-prod-kyc-docs
S3_ASSETS_BUCKET=hotel-app-prod-app-assets
S3_SIGNED_URL_EXPIRES_SECONDS=900

# SNS (leave empty for now — OTP bypass ON for initial testing)
SNS_OTP_TOPIC_ARN=
OTP_BYPASS_ENABLED=true
OTP_BYPASS_CODE=123456

# coturn
COTURN_HOST=turn.epbx.negd.in
COTURN_PORT=3478
COTURN_SECRET=${COTURN_SEC}
COTURN_REALM=turn.epbx.negd.in
TURN_CREDENTIAL_TTL_SECONDS=3600

# Signaling
SIGNALING_SERVER_URL=https://signal.epbx.negd.in
SIGNALING_INTERNAL_SECRET=${SIG_SEC}

# CORS
CORS_ORIGINS=https://guest.epbx.negd.in,https://staff.epbx.negd.in,https://admin.epbx.negd.in

# Rate limiting
THROTTLE_TTL_SECONDS=60
THROTTLE_LIMIT=100
EOF

echo ""
echo "✅ .env.prod generated at: $(pwd)/.env.prod"
echo ""
echo "⚠️  IMPORTANT: Edit .env.prod and fill in:"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo ""
echo "Then copy to your EC2:"
echo "   scp -i ~/.ssh/hotel-app-prod.pem .env.prod ubuntu@<ELASTIC_IP>:/opt/hotel-app/infra/deploy/.env.prod"
