# Deployment Guide — Hotel App (Single EC2, All-in-One)

## Infrastructure Status

| Resource | Status | Details |
|---|---|---|
| AWS Account | ✅ | IAM user configured |
| S3 KYC Bucket | ✅ | `hotel-app-prod-kyc-docs` (private) |
| S3 Assets Bucket | ✅ | `hotel-app-prod-app-assets` (private) |
| EC2 Instance | ✅ | `i-058f75b2e9e630b67` (t3.medium, Ubuntu 22.04) |
| Elastic IP | ✅ | **15.207.160.237** |
| Security Group | ✅ | `sg-00cd0649d4b0e7712` (SSH/HTTP/HTTPS/TURN) |
| Key Pair | ✅ | `hotel-app-prod` |
| Domain | ✅ | `epbx.negd.in` |
| HTTPS | ✅ | Auto via Caddy + Let's Encrypt |

---

## DNS Records — Add These NOW

In your DNS management for `negd.in`, add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `api.epbx` | `15.207.160.237` | 300 |
| A | `signal.epbx` | `15.207.160.237` | 300 |
| A | `turn.epbx` | `15.207.160.237` | 300 |
| A | `guest.epbx` | `15.207.160.237` | 300 |
| A | `staff.epbx` | `15.207.160.237` | 300 |
| A | `admin.epbx` | `15.207.160.237` | 300 |0 |

---

## Step 3: SSH into EC2 and Install Docker

```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
```

Run on the server:

```bash
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

**Log out and back in** for docker group:
```bash
exit
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
docker --version   # verify
```

---

## Step 4: Push Code to GitHub and Clone on EC2

On your Mac (locally):
```bash
cd /Users/jai/Documents/Hotel_APP
git init
git add -A
git commit -m "Phase 1 complete"
gh repo create hotel-app --private --source=. --push
```

On the EC2 server:
```bash
sudo mkdir -p /opt/hotel-app && sudo chown ubuntu:ubuntu /opt/hotel-app
git clone https://github.com/<your-username>/hotel-app.git /opt/hotel-app
cd /opt/hotel-app/infra/deploy
```

---

## Step 5: Create .env.prod

```bash
cd /opt/hotel-app/infra/deploy
cp .env.prod.example .env.prod
nano .env.prod
```

Generate secrets (run these one by one, paste output into .env.prod):
```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 16 | tr -d /+=)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
echo "COTURN_SECRET=$(openssl rand -base64 24)"
echo "SIGNALING_INTERNAL_SECRET=$(openssl rand -base64 32)"
```

Your `.env.prod` should look like:
```
POSTGRES_DB=hotelapp
POSTGRES_USER=hotelapp
POSTGRES_PASSWORD=<generated>

NODE_ENV=production
JWT_SECRET=<generated>
JWT_REFRESH_SECRET=<generated>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<your IAM key>
AWS_SECRET_ACCESS_KEY=<your IAM secret>

S3_KYC_BUCKET=hotel-app-prod-kyc-docs
S3_ASSETS_BUCKET=hotel-app-prod-app-assets
S3_SIGNED_URL_EXPIRES_SECONDS=900

OTP_BYPASS_ENABLED=true
COTURN_HOST=turn.epbx.negd.in
COTURN_PORT=3478
COTURN_SECRET=<generated>
COTURN_REALM=turn.epbx.negd.in
TURN_CREDENTIAL_TTL_SECONDS=3600

SIGNALING_SERVER_URL=https://signal.epbx.negd.in
SIGNALING_INTERNAL_SECRET=<generated>

CORS_ORIGINS=https://guest.epbx.negd.in,https://staff.epbx.negd.in,https://admin.epbx.negd.in

THROTTLE_TTL_SECONDS=60
THROTTLE_LIMIT=100
```

Note: `OTP_BYPASS_ENABLED=true` for initial testing (OTP is always `123456`). Set to `false` for real SMS delivery later.

---

## Step 6: Deploy

```bash
cd /opt/hotel-app/infra/deploy
chmod +x deploy.sh
./deploy.sh
```

First build will take 5-10 minutes (downloading base images + compiling).

---

## Step 7: Verify

```bash
# All containers running?
docker compose -f docker-compose.prod.yml ps

# Health check
curl http://localhost:3001/health

# After DNS propagates (may take up to 30 min):
curl https://api.epbx.negd.in/health
```

---

## Final URLs

| Service | URL |
|---|---|
| Guest PWA | https://guest.epbx.negd.in |
| Staff PWA | https://staff.epbx.negd.in |
| Admin Dashboard | https://admin.epbx.negd.in |
| API Server | https://api.epbx.negd.in |
| Signaling | https://signal.epbx.negd.in |
| TURN Server | turn.epbx.negd.in:3478 |

---

## Login Credentials (from seed)

| Role | Email | Password |
|---|---|---|
| Admin | admin@grandpilot.hotel | Admin@123 |
| Reception | reception@grandpilot.hotel | Staff@123 |
| Housekeeping | housekeeping@grandpilot.hotel | Staff@123 |
| Room Service | roomservice@grandpilot.hotel | Staff@123 |
| Guest OTP | any mobile number | 123456 |

---

## Estimated Monthly Cost

| Resource | Cost |
|---|---|
| EC2 t3.medium (on-demand) | ~₹3,200 |
| Elastic IP (attached) | ₹0 |
| S3 (minimal) | ~₹50 |
| Data transfer | ~₹200 |
| **Total** | **~₹3,500/month** |

---

## Redeploy After Code Changes

On the EC2 server:
```bash
cd /opt/hotel-app
git pull origin main
cd infra/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

## View Logs

```bash
cd /opt/hotel-app/infra/deploy
docker compose -f docker-compose.prod.yml logs -f api-server
docker compose -f docker-compose.prod.yml logs -f signaling-server
docker compose -f docker-compose.prod.yml logs -f caddy
```

## Database Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U hotelapp hotelapp > backup_$(date +%Y%m%d).sql
```
