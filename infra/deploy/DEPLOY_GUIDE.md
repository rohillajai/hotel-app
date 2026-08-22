# Deployment Guide — Single EC2 + Amplify (Pilot)

**Estimated cost:** ₹4,000–5,000/month  
**Architecture:** 1x EC2 t3.medium (backend + DB + Redis + coturn) + Amplify Hosting (3 frontends)  
**Domain:** epbx.negd.in

---

## Prerequisites

- AWS account with root or admin IAM access
- Domain `epbx.negd.in` with DNS control
- Git repo pushed to GitHub (for Amplify)

---

## Part 1: AWS Account Setup (one-time)

### 1.1 Create IAM User

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Users → Create user → `hotel-app-admin`
3. Attach policy: `AdministratorAccess`
4. Create access key (CLI) → save Access Key ID + Secret

### 1.2 Install & Configure AWS CLI (on your Mac)

```bash
brew install awscli
aws configure
# Region: ap-south-1
# Output: json
```

### 1.3 Create S3 Buckets

```bash
aws s3 mb s3://hotel-app-prod-kyc-docs --region ap-south-1
aws s3 mb s3://hotel-app-prod-app-assets --region ap-south-1

# Block all public access
aws s3api put-public-access-block --bucket hotel-app-prod-kyc-docs \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api put-public-access-block --bucket hotel-app-prod-app-assets \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 1.4 Create EC2 Key Pair

```bash
aws ec2 create-key-pair --key-name hotel-app-prod --region ap-south-1 \
  --query 'KeyMaterial' --output text > ~/.ssh/hotel-app-prod.pem
chmod 400 ~/.ssh/hotel-app-prod.pem
```

---

## Part 2: Launch EC2 Instance

### 2.1 Launch via Console (easier for first time)

1. Go to [EC2 Console](https://ap-south-1.console.aws.amazon.com/ec2/) (ap-south-1)
2. Launch Instance:
   - **Name:** hotel-app-server
   - **AMI:** Ubuntu 22.04 LTS (64-bit x86)
   - **Instance type:** t3.medium
   - **Key pair:** hotel-app-prod
   - **Network settings:**
     - Create new security group
     - Allow SSH (port 22) from your IP
     - Allow HTTP (port 80) from anywhere
     - Allow HTTPS (port 443) from anywhere
     - Allow Custom UDP 3478 from anywhere
     - Allow Custom UDP 49152-65535 from anywhere
   - **Storage:** 30 GB gp3
3. Launch

### 2.2 Allocate Elastic IP

1. EC2 Console → Elastic IPs → Allocate
2. Associate with your new instance
3. Note the Elastic IP address: `_______________`

---

## Part 3: DNS Records

Add these records in your DNS manager for `epbx.negd.in`:

| Type | Name | Value |
|------|------|-------|
| A | api.epbx.negd.in | `<Elastic IP>` |
| A | signal.epbx.negd.in | `<Elastic IP>` |
| A | turn.epbx.negd.in | `<Elastic IP>` |
| CNAME | guest.epbx.negd.in | `<Amplify domain — set later>` |
| CNAME | staff.epbx.negd.in | `<Amplify domain — set later>` |
| CNAME | admin.epbx.negd.in | `<Amplify domain — set later>` |

Wait for DNS propagation (5–30 min). Verify:
```bash
dig api.epbx.negd.in +short
# Should return your Elastic IP
```

---

## Part 4: Server Setup

### 4.1 SSH into the EC2

```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<Elastic-IP>
```

### 4.2 Run Setup Script

```bash
# On the EC2:
git clone https://github.com/YOUR_ORG/Hotel_APP.git /opt/hotel-app
cd /opt/hotel-app/infra/deploy
sudo chmod +x setup-ec2.sh
sudo ./setup-ec2.sh

# Log out and back in for docker group
exit
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<Elastic-IP>
```

### 4.3 Configure Environment

```bash
cd /opt/hotel-app/infra/deploy
cp .env.prod.example .env.prod
nano .env.prod
# Fill in ALL the CHANGE_ME values with real secrets
# Generate secrets with: openssl rand -base64 32
```

### 4.4 Deploy

```bash
cd /opt/hotel-app/infra/deploy
chmod +x deploy.sh
./deploy.sh
```

### 4.5 Seed the Database (first deploy only)

```bash
docker compose -f docker-compose.prod.yml exec api-server sh -c \
  "cd /app/packages/db && npx prisma db seed"
```

### 4.6 Verify

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Test API
curl https://api.epbx.negd.in/health

# Check logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## Part 5: Amplify Hosting (Frontends)

### 5.1 Push Code to GitHub

```bash
# On your Mac:
cd /Users/jai/Documents/Hotel_APP
git init
git add .
git commit -m "Initial commit — Phase 1 complete"
git remote add origin https://github.com/YOUR_ORG/Hotel_APP.git
git push -u origin main
```

### 5.2 Create Amplify Apps (in AWS Console)

For each of the 3 apps, go to [Amplify Console](https://ap-south-1.console.aws.amazon.com/amplify/):

**App 1: Guest PWA**
1. New app → Host web app → GitHub → select repo
2. App name: `hotel-guest`
3. Branch: `main`
4. Build settings: monorepo → set App root to `apps/guest-pwa`
5. Build command: `cd ../.. && npm install -g pnpm@9 && pnpm install && pnpm --filter @hotel-app/config build && pnpm --filter @hotel-app/core build && pnpm --filter @hotel-app/guest-pwa build`
6. Output directory: `apps/guest-pwa/.next`
7. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://api.epbx.negd.in`
   - `NEXT_PUBLIC_SIGNALING_URL` = `https://signal.epbx.negd.in`
8. Deploy
9. Domain management → Add domain → `guest.epbx.negd.in`

**App 2: Staff PWA** (same steps, change to `apps/staff-pwa`, domain: `staff.epbx.negd.in`)

**App 3: Admin Web** (same steps, change to `apps/admin-web`, domain: `admin.epbx.negd.in`)

---

## Part 6: Final Verification

| Check | URL | Expected |
|-------|-----|----------|
| API Health | https://api.epbx.negd.in/health | `{"status":"ok"}` |
| Guest PWA | https://guest.epbx.negd.in | Check-In page |
| Staff PWA | https://staff.epbx.negd.in | Login page |
| Admin Web | https://admin.epbx.negd.in | Login page |
| Admin Login | admin@grandpilot.hotel / Admin@123 | Dashboard |

---

## Updating the App

After code changes:
```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<Elastic-IP>
cd /opt/hotel-app/infra/deploy
./deploy.sh
```

Amplify frontends auto-deploy on push to `main`.

---

## Troubleshooting

```bash
# View logs
docker compose -f docker-compose.prod.yml logs api-server
docker compose -f docker-compose.prod.yml logs signaling-server
docker compose -f docker-compose.prod.yml logs caddy
docker compose -f docker-compose.prod.yml logs coturn

# Restart a service
docker compose -f docker-compose.prod.yml restart api-server

# Full restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# DB access
docker compose -f docker-compose.prod.yml exec postgres psql -U hotelapp
```
