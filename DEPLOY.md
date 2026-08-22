# Deployment Guide — Option A (Single EC2 + Amplify)

**Instance:** `i-0e5efbfff6727d24b` | `15.207.160.237` | ap-south-1  
**Domain:** `epbx.negd.in`  
**Cost:** ~₹4,000–5,000/month

---

## Architecture

```
                    ┌── guest.epbx.negd.in ──► Amplify (Guest PWA)
Internet ──────────┼── staff.epbx.negd.in ──► Amplify (Staff PWA)
                    ├── admin.epbx.negd.in ──► Amplify (Admin Web)
                    │
                    ├── api.epbx.negd.in ────► EC2:443 (Caddy → API :3001)
                    ├── signal.epbx.negd.in ─► EC2:443 (Caddy → Signaling :3002)
                    └── turn.epbx.negd.in ───► EC2:3478 (coturn direct)

EC2 (t3.medium) runs:
  Docker Compose → [PostgreSQL, Redis, API Server, Signaling, coturn, Caddy]
```

---

## Pre-requisites (already done)

- [x] AWS account with IAM admin user
- [x] EC2 instance running (15.207.160.237)
- [x] SSL — handled by Caddy (auto Let's Encrypt), no ACM needed for EC2

---

## Step 1: DNS Records

Add these records in your DNS management for `epbx.negd.in`:

| Type | Name | Value |
|------|------|-------|
| A | api.epbx.negd.in | 15.207.160.237 |
| A | signal.epbx.negd.in | 15.207.160.237 |
| A | turn.epbx.negd.in | 15.207.160.237 |

(Amplify domains are added later — Amplify gives you CNAME values)

**Do this now** — DNS propagation takes 5-30 minutes. Caddy needs the DNS pointing to the EC2 before it can issue certs.

---

## Step 2: Open Ports on EC2 Security Group

Go to EC2 Console → Instance → Security tab → Security Group → Edit Inbound Rules:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP only | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP (Caddy redirect → HTTPS) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (Caddy → API + Signaling) |
| 3478 | UDP | 0.0.0.0/0 | STUN/TURN |
| 3478 | TCP | 0.0.0.0/0 | TURN TCP |
| 49152-65535 | UDP | 0.0.0.0/0 | TURN relay range |

---

## Step 3: SSH into EC2 and setup

```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
```

Once in, run:

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/infra/deploy/setup-ec2.sh | bash
```

Or paste it manually:

```bash
sudo apt-get update -y && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git

# Allow ubuntu user to run docker
sudo usermod -aG docker ubuntu

# Create app dir
sudo mkdir -p /opt/hotel-app && sudo chown ubuntu:ubuntu /opt/hotel-app
```

**Log out and back in** (for docker group to apply):
```bash
exit
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
```

Verify docker works:
```bash
docker --version
docker compose version
```

---

## Step 4: Clone your repo

```bash
cd /opt/hotel-app
git clone https://github.com/YOUR_USERNAME/Hotel_APP.git .
```

(Or if not on GitHub yet, scp the entire project:)
```bash
# FROM YOUR MAC (not on EC2):
scp -i ~/.ssh/hotel-app-prod.pem -r /Users/jai/Documents/Hotel_APP/* ubuntu@15.207.160.237:/opt/hotel-app/
```

---

## Step 5: Create production .env file

On the EC2:

```bash
cd /opt/hotel-app/infra/deploy
cp .env.prod.example .env.prod
nano .env.prod   # or vim
```

Generate secrets (run on EC2):
```bash
echo "DB Password: $(openssl rand -base64 16 | tr -d /+=)"
echo "JWT Secret: $(openssl rand -base64 32)"
echo "JWT Refresh: $(openssl rand -base64 32)"
echo "Coturn Secret: $(openssl rand -base64 24)"
echo "Signaling Secret: $(openssl rand -base64 32)"
```

Fill in `.env.prod` with the generated values. Important:
- `POSTGRES_PASSWORD` and the password in `DATABASE_URL` must match
- `OTP_BYPASS_ENABLED=false` (production!)
- `CORS_ORIGINS=https://guest.epbx.negd.in,https://staff.epbx.negd.in,https://admin.epbx.negd.in`
- For now, skip S3/SNS if not ready (leave `AWS_ACCESS_KEY_ID` empty — document upload and real OTP won't work but the rest will)

Also update the coturn secret:
```bash
cd /opt/hotel-app/infra/deploy/coturn
sed -i "s/COTURN_SECRET_PLACEHOLDER/$(grep COTURN_SECRET ../.env.prod | cut -d= -f2)/" turnserver.prod.conf
```

---

## Step 6: Build and start everything

```bash
cd /opt/hotel-app/infra/deploy

# Build and start all containers
docker compose -f docker-compose.prod.yml up -d --build
```

This takes 3-5 minutes on first run (downloading images + building Node apps).

Check status:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api-server
```

All containers should show `running` or `healthy`.

---

## Step 7: Run database migrations and seed

```bash
# Exec into the API server container and run migrations
docker compose -f docker-compose.prod.yml exec api-server sh -c "
  cd /app/packages/db && \
  npx prisma migrate deploy && \
  npx ts-node --project tsconfig.seed.json prisma/seed.ts
"
```

---

## Step 8: Verify backend is working

```bash
# Test API health (from EC2 or your Mac)
curl https://api.epbx.negd.in/health

# Should return: {"status":"ok","timestamp":"...","uptime":...}
```

If DNS hasn't propagated yet, test with IP directly:
```bash
curl http://15.207.160.237:3001/health
```

---

## Step 9: Deploy frontends to Amplify

Go to AWS Console → **AWS Amplify** (ap-south-1):

### For each of the 3 apps (guest, staff, admin):

1. Click **New app** → **Host web app**
2. Connect to your Git provider (GitHub/CodeCommit)
3. Select your repo and branch (`main`)
4. **Build settings** — edit the build spec:

**Guest PWA:**
- App name: `hotel-guest`
- Root directory: `/` (monorepo root)
- Build commands:
  ```yaml
  version: 1
  frontend:
    phases:
      preBuild:
        commands:
          - npm install -g pnpm@9
          - pnpm install --frozen-lockfile
          - pnpm --filter @hotel-app/config build
          - pnpm --filter @hotel-app/core build
      build:
        commands:
          - pnpm --filter @hotel-app/guest-pwa build
    artifacts:
      baseDirectory: apps/guest-pwa/.next
      files:
        - '**/*'
    cache:
      paths:
        - node_modules/**/*
        - apps/guest-pwa/.next/cache/**/*
  ```

5. **Environment variables** in Amplify Console:
   - `NEXT_PUBLIC_API_URL` = `https://api.epbx.negd.in`
   - `NEXT_PUBLIC_SIGNALING_URL` = `https://signal.epbx.negd.in`

6. **Custom domain** (after first deploy):
   - Amplify → App → Domain management → Add domain
   - `guest.epbx.negd.in` → Amplify provides CNAME records → add to your DNS

Repeat for **staff** (`staff.epbx.negd.in`) and **admin** (`admin.epbx.negd.in`), changing the filter to `@hotel-app/staff-pwa` and `@hotel-app/admin-web`.

---

## Step 10: Create S3 buckets (optional — for KYC upload)

```bash
aws s3 mb s3://hotel-app-kyc-docs --region ap-south-1
aws s3 mb s3://hotel-app-assets --region ap-south-1

# Block all public access
aws s3api put-public-access-block --bucket hotel-app-kyc-docs \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-public-access-block --bucket hotel-app-assets \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## Verify Everything Works

| Test | Command / URL |
|------|---------------|
| API health | `curl https://api.epbx.negd.in/health` |
| Guest PWA | Open `https://guest.epbx.negd.in` |
| Staff PWA | Open `https://staff.epbx.negd.in` |
| Admin login | Open `https://admin.epbx.negd.in` → `admin@grandpilot.hotel` / `Admin@123` |
| TURN test | `turnutils_uclient -T -u test -w test 15.207.160.237` |

---

## Updating the app (after code changes)

```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@15.207.160.237
cd /opt/hotel-app
git pull
cd infra/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Amplify frontends auto-deploy on git push to `main`.

---

## Estimated Monthly Cost

| Resource | Cost |
|----------|------|
| EC2 t3.medium (on-demand) | ~₹3,200 |
| Elastic IP (if instance is running) | ₹0 |
| Data transfer (1 GB) | ~₹100 |
| Amplify Hosting (3 apps, low traffic) | ~₹0–500 |
| S3 (minimal storage) | ~₹50 |
| **Total** | **~₹3,500–4,000/month** |

Save more: Use a Reserved Instance (1-year) for ~40% discount.
