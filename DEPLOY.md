# Deployment Guide — Hotel App (Single EC2 + Amplify)

**Infrastructure:** 1x EC2 `t3.medium` running all backend services via Docker Compose  
**Frontend:** AWS Amplify Hosting (3 Next.js apps)  
**Domain:** epbx.negd.in  
**Server IP:** 13.207.8.37  
**Estimated cost:** ~₹4,000–5,000/month

---

## Status Checklist

- [x] AWS account created with MFA
- [x] IAM admin user created + `aws configure` done
- [x] S3 buckets created (hotel-app-prod-kyc-docs, hotel-app-prod-app-assets, both private + encrypted)
- [x] EC2 key pair created (hotel-app-prod)
- [x] Security group created (sg-00cd0649d4b0e7712: ports 22, 80, 443, 3478 UDP/TCP, 49152-65535 UDP)
- [x] EC2 instance launched (i-058f75b2e9e630b67, t3.medium, Ubuntu 22.04, 30GB gp3 encrypted)
- [x] Elastic IP attached (13.207.8.37)
- [ ] DNS records pointed to 13.207.8.37
- [ ] SSH into EC2 + Docker installed
- [ ] Code transferred to EC2
- [ ] .env.prod configured with secrets
- [ ] Docker Compose deployed + DB migrated
- [ ] Amplify frontends deployed

---

## What's running where

```
┌─────────────────────────────────────────────────────────────┐
│  EC2 (13.207.8.37) — Docker Compose                         │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌────────────┐  ┌────────────┐ │
│  │PostgreSQL│  │  Redis  │  │ API Server │  │ Signaling  │ │
│  │  :5432   │  │  :6379  │  │   :3001    │  │   :3002    │ │
│  └─────────┘  └─────────┘  └────────────┘  └────────────┘ │
│                                                              │
│  ┌─────────┐  ┌─────────────────────────────────────────┐  │
│  │ coturn  │  │  Caddy (reverse proxy + auto HTTPS)     │  │
│  │:3478 UDP│  │  :80 → :443 → api/signal backends      │  │
│  └─────────┘  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  AWS Amplify (CDN, auto-HTTPS)                               │
│  guest.epbx.negd.in  staff.epbx.negd.in  admin.epbx.negd.in│
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Add DNS Records

Add these records in your DNS management for `epbx.negd.in`:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | api | 13.207.8.37 | 300 |
| A | signal | 13.207.8.37 | 300 |
| A | turn | 13.207.8.37 | 300 |

*(Amplify frontend subdomains — guest, staff, admin — will be configured later in Step 6)*

---

## Step 2: SSH into EC2 and Install Docker

First, make sure you have the SSH key file. If you downloaded it during key pair creation:

```bash
# Ensure correct permissions
chmod 400 ~/.ssh/hotel-app-prod.pem

# SSH in
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@13.207.8.37
```

Once connected, run these commands on the EC2 instance:

```bash
# Update system
sudo apt-get update -y && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow ubuntu user to use docker without sudo
sudo usermod -aG docker ubuntu

# Install git
sudo apt-get install -y git

# Create app directory
sudo mkdir -p /opt/hotel-app
sudo chown ubuntu:ubuntu /opt/hotel-app
```

**Log out and back in** (needed for docker group):
```bash
exit
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@13.207.8.37
```

Verify Docker works:
```bash
docker --version
docker compose version
```

---

## Step 3: Transfer Code to EC2

### Option A — GitHub (recommended for future CI/CD)

From your local machine:
```bash
cd ~/Documents/Hotel_APP
git init
git add -A
git commit -m "Initial commit — Phase 1"
# Create a private repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/Hotel_APP.git
git branch -M main
git push -u origin main
```

Then on EC2:
```bash
cd /opt/hotel-app
git clone https://github.com/YOUR_USERNAME/Hotel_APP.git .
```

### Option B — Direct SCP (quick, no GitHub needed)

From your local machine:
```bash
cd ~/Documents
tar -czf hotel-app.tar.gz --exclude='node_modules' --exclude='.next' --exclude='dist' --exclude='.turbo' Hotel_APP/
scp -i ~/.ssh/hotel-app-prod.pem hotel-app.tar.gz ubuntu@13.207.8.37:/opt/hotel-app/
```

On EC2:
```bash
cd /opt/hotel-app
tar -xzf hotel-app.tar.gz --strip-components=1
rm hotel-app.tar.gz
```

---

## Step 4: Configure Environment Secrets

On the EC2 instance:

```bash
cd /opt/hotel-app/infra/deploy

# Copy the example env file
cp .env.prod.example .env.prod

# Generate all secrets
echo "=== Copy these into .env.prod ==="
echo "POSTGRES_PASSWORD=$(openssl rand -base64 16 | tr -d /+=)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
echo "COTURN_SECRET=$(openssl rand -base64 24)"
echo "SIGNALING_INTERNAL_SECRET=$(openssl rand -base64 32)"
```

Now edit the file:
```bash
nano .env.prod
```

Fill in:
- Paste the generated secrets from above
- `AWS_ACCESS_KEY_ID` = your IAM user access key
- `AWS_SECRET_ACCESS_KEY` = your IAM user secret key
- `DATABASE_URL` = `postgresql://hotelapp:YOUR_POSTGRES_PASSWORD@postgres:5432/hotelapp`
  (use the same POSTGRES_PASSWORD you generated)
- `OTP_BYPASS_ENABLED=true` (for initial testing — set to `false` for real production)

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

---

## Step 5: Deploy Backend

Still on EC2:

```bash
cd /opt/hotel-app/infra/deploy

# Build and start all services (first time takes ~5 minutes)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Watch the build progress
docker compose -f docker-compose.prod.yml logs -f --tail=20
# (Press Ctrl+C to stop watching logs)

# Check all containers are running
docker compose -f docker-compose.prod.yml ps
```

You should see 6 containers: postgres, redis, api-server, signaling-server, coturn, caddy — all "Up".

### Run database migrations:

```bash
docker compose -f docker-compose.prod.yml exec api-server \
  npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma
```

### Seed the database (creates pilot hotel + staff accounts):

```bash
docker compose -f docker-compose.prod.yml exec api-server \
  npx ts-node --project /app/packages/db/tsconfig.seed.json /app/packages/db/prisma/seed.ts
```

### Verify:

```bash
# Direct IP check (works immediately)
curl http://localhost:3001/health

# After DNS propagates (5-15 min)
curl https://api.epbx.negd.in/health
# Expected: {"status":"ok","timestamp":"...","uptime":...}
```

---

## Step 6: Deploy Frontends on AWS Amplify

1. Go to: https://ap-south-1.console.aws.amazon.com/amplify/
2. Click **Create new app**
3. Connect your GitHub repo (or use manual deploy)

**Create 3 apps — one for each frontend:**

### App 1: Guest PWA
- **App name:** hotel-guest
- **Branch:** main
- **Monorepo root:** `apps/guest-pwa`
- **Build settings:** Edit to use the `amplify.yml` already in that directory
- **Environment variables** (add in Amplify console):
  - `NEXT_PUBLIC_API_URL` = `https://api.epbx.negd.in`
  - `NEXT_PUBLIC_SIGNALING_URL` = `https://signal.epbx.negd.in`
- After deploy: **Domain management** → Add domain → `guest.epbx.negd.in`
  - Amplify gives you a CNAME to add to DNS

### App 2: Staff PWA
- **App name:** hotel-staff
- **Monorepo root:** `apps/staff-pwa`
- Same env vars as Guest
- Custom domain: `staff.epbx.negd.in`

### App 3: Admin Web
- **App name:** hotel-admin
- **Monorepo root:** `apps/admin-web`
- Same env vars as Guest
- Custom domain: `admin.epbx.negd.in`

**After Amplify gives you the CNAME targets, add to DNS:**

| Type | Name | Value |
|------|------|-------|
| CNAME | guest.epbx.negd.in | (from Amplify) |
| CNAME | staff.epbx.negd.in | (from Amplify) |
| CNAME | admin.epbx.negd.in | (from Amplify) |

---

## Step 7: Test the Full System

1. **Admin login:** Open `https://admin.epbx.negd.in`
   - Email: `admin@grandpilot.hotel`
   - Password: `Admin@123`
   - You should see the admin dashboard with sidebar

2. **Guest check-in:** Open `https://guest.epbx.negd.in`
   - Click "Check In"
   - Enter any booking ref + name + mobile (E.164 format: +91...)
   - OTP: `123456` (if bypass is enabled)
   - Upload any JPEG/PNG as ID doc
   - You'll land on the pending screen

3. **Admin approves:** In the admin dashboard → Check-Ins
   - Set check-in/out dates and room number → Approve

4. **Guest dashboard:** Guest PWA auto-redirects to dashboard
   - WiFi credentials shown
   - Call buttons active

5. **Calling test:**
   - Open `https://staff.epbx.negd.in`, login as `reception@grandpilot.hotel` / `Staff@123`
   - Open call screen
   - On guest PWA, tap "Reception"
   - Staff should see incoming call from guest's room

---

## Maintenance

```bash
# SSH in
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@13.207.8.37

# View logs
cd /opt/hotel-app/infra/deploy
docker compose -f docker-compose.prod.yml logs -f api-server
docker compose -f docker-compose.prod.yml logs -f caddy

# Restart services
docker compose -f docker-compose.prod.yml restart

# Update deployment (after git push)
cd /opt/hotel-app
git pull origin main
cd infra/deploy
docker compose -f docker-compose.prod.yml up -d --build

# Database backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U hotelapp hotelapp > ~/backup_$(date +%Y%m%d).sql

# Check disk usage
df -h
docker system df
```

---

## Cost Breakdown (monthly)

| Resource | Cost |
|----------|------|
| EC2 t3.medium (on-demand) | ~₹3,000 |
| Elastic IP | Free (attached to running instance) |
| S3 (minimal storage) | ~₹50 |
| Amplify Hosting (3 apps, free tier) | ₹0 |
| Data transfer (low pilot usage) | ~₹200 |
| **Total** | **~₹3,250/month** |

For further savings: buy a 1-year Reserved Instance (saves ~40%).
