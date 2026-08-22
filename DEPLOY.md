# Deployment Guide — Single EC2 + Amplify (Option A)

**Domain:** epbx.negd.in  
**EC2 IP:** 15.207.160.237  
**Cost:** ~₹3,500–5,000/month  

---

## Current Status

- [x] AWS account created
- [x] SSL certificate (ACM) — issued
- [x] EC2 instance launched (15.207.160.237)
- [ ] DNS records pointed
- [ ] EC2 server setup (Docker installed)
- [ ] App deployed on EC2
- [ ] Amplify connected for frontends
- [ ] Database migrated and seeded

---

## Step 1: DNS Records

Go to your DNS management for `epbx.negd.in` and add these **A records**:

| Record Type | Name | Value | TTL |
|---|---|---|---|
| A | api.epbx.negd.in | 15.207.160.237 | 300 |
| A | signal.epbx.negd.in | 15.207.160.237 | 300 |
| A | turn.epbx.negd.in | 15.207.160.237 | 300 |

For Amplify frontends (we'll add these later after Amplify setup):
| Record Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | guest.epbx.negd.in | (Amplify provides this) | 300 |
| CNAME | staff.epbx.negd.in | (Amplify provides this) | 300 |
| CNAME | admin.epbx.negd.in | (Amplify provides this) | 300 |

**Do this now.** DNS propagation takes 5–30 minutes. We need `api.epbx.negd.in` and `signal.epbx.negd.in` resolving before Caddy can get Let's Encrypt certs.

---

## Step 2: EC2 Security Group

In AWS Console → EC2 → Instances → select your instance → Security tab → click the Security Group → Edit inbound rules.

Add these rules:

| Type | Port Range | Source | Description |
|---|---|---|---|
| SSH | 22 | My IP | SSH access |
| HTTP | 80 | 0.0.0.0/0 | Caddy HTTP (redirect + ACME) |
| HTTPS | 443 | 0.0.0.0/0 | Caddy HTTPS (API + Signaling) |
| Custom UDP | 3478 | 0.0.0.0/0 | STUN/TURN |
| Custom UDP | 49152-65535 | 0.0.0.0/0 | TURN relay range |

---

## Step 3: SSH into EC2 and Install Docker

```bash
# From your Mac terminal:
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
```

Once connected, run this on the EC2:

```bash
# Update system
sudo apt-get update -y && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Install Git
sudo apt-get install -y git

# Log out and back in for docker group to take effect
exit
```

SSH back in:
```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
docker --version  # should show Docker 27+
```

---

## Step 4: Clone the Repository on EC2

```bash
# Create a GitHub Personal Access Token (classic) with 'repo' scope:
# https://github.com/settings/tokens/new

cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/Hotel_APP.git hotel-app
cd hotel-app
```

If repo is private, use:
```bash
git clone https://YOUR_TOKEN@github.com/YOUR_USERNAME/Hotel_APP.git hotel-app
```

---

## Step 5: Deploy

```bash
cd /home/ubuntu/hotel-app/infra/deploy

# The .env.prod file is already configured.
# Verify it:
cat .env.prod | head -5

# Start all services
docker compose -f docker-compose.prod.yml up -d --build
```

This will:
1. Build the API server Docker image (~2-3 min first time)
2. Build the Signaling server image (~1-2 min)
3. Start PostgreSQL, Redis, API, Signaling, coturn, and Caddy

**Check logs:**
```bash
docker compose -f docker-compose.prod.yml logs -f
```

Wait until you see:
- `api-server` logs: `Listening on port 3001`
- `signaling-server` logs: `Listening on port 3002`
- `caddy` logs: `certificate obtained successfully` (for api.epbx.negd.in)

---

## Step 6: Run Database Migration & Seed

```bash
# Run migration inside the api-server container
docker compose -f docker-compose.prod.yml exec api-server \
  npx prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma

# Seed the database (creates pilot hotel + staff users)
docker compose -f docker-compose.prod.yml exec api-server \
  node -e "
    const { execSync } = require('child_process');
    execSync('cd /app/packages/db && npx ts-node --project tsconfig.seed.json prisma/seed.ts', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL } });
  "
```

---

## Step 7: Verify Backend is Working

From your Mac:
```bash
# Health check
curl https://api.epbx.negd.in/health

# Should return: {"status":"ok","timestamp":"...","uptime":...}
```

If this works, your backend is live.

---

## Step 8: Amplify Setup for Frontends

1. Go to AWS Console → **AWS Amplify** (ap-south-1 region)
2. Click **New app** → **Host web app**
3. Connect your GitHub repository
4. For each app, create a separate Amplify app:

### Guest PWA:
- App name: `hotel-guest`
- Branch: `main`
- App root: `apps/guest-pwa`
- Build settings: use the `amplify.yml` in that folder
- Environment variables:
  - `NEXT_PUBLIC_API_URL` = `https://api.epbx.negd.in`
  - `NEXT_PUBLIC_SIGNALING_URL` = `https://signal.epbx.negd.in`
- Custom domain: `guest.epbx.negd.in`

### Staff PWA:
- App name: `hotel-staff`
- Branch: `main`
- App root: `apps/staff-pwa`
- Same env vars as above
- Custom domain: `staff.epbx.negd.in`

### Admin Web:
- App name: `hotel-admin`
- Branch: `main`
- App root: `apps/admin-web`
- Same env vars as above
- Custom domain: `admin.epbx.negd.in`

After each Amplify app is created with a custom domain, it will give you a CNAME record to add to DNS. Add those records.

---

## Step 9: Test End-to-End

1. Open `https://admin.epbx.negd.in`
2. Login with `admin@grandpilot.hotel` / `Admin@123`
3. Open `https://guest.epbx.negd.in`
4. Start check-in flow with OTP `123456`

---

## Useful Commands (on EC2)

```bash
cd /home/ubuntu/hotel-app/infra/deploy

# View logs
docker compose -f docker-compose.prod.yml logs -f api-server
docker compose -f docker-compose.prod.yml logs -f signaling-server

# Restart a service
docker compose -f docker-compose.prod.yml restart api-server

# Pull latest code and redeploy
cd /home/ubuntu/hotel-app
git pull
cd infra/deploy
docker compose -f docker-compose.prod.yml up -d --build

# Database shell
docker compose -f docker-compose.prod.yml exec postgres psql -U hotelapp -d hotelapp

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop and delete data (DESTRUCTIVE)
docker compose -f docker-compose.prod.yml down -v
```

---

## Architecture (what's running)

```
Internet → Caddy (:80/:443) → api-server (:3001)
                             → signaling-server (:3002)
         → coturn (UDP :3478 + :49152-65535) — direct host network

Internal: api-server → postgres (:5432)
          api-server → redis (:6379)
          signaling  → redis (:6379)
          signaling  → api-server (internal HTTP for grant checks)
```

---

## Security Notes

- `.env.prod` contains real secrets — never commit to git
- OTP_BYPASS_ENABLED=true is set for dev/testing — set to `false` before going live with real guests
- Rotate all secrets (JWT, DB password, COTURN) before production launch
- Enable AWS SNS for real OTP delivery when going live
