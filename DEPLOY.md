# Deployment Guide — Single EC2 + Amplify
## Hotel App — epbx.negd.in

**Architecture:**
- 1x EC2 `t3.medium` (ap-south-1) — runs API, Signaling, PostgreSQL, Redis, coturn, Caddy
- AWS Amplify Hosting — 3 Next.js PWAs (guest, staff, admin)
- Caddy — auto HTTPS via Let's Encrypt (no ACM needed)
- Estimated cost: ~₹4,000–5,000/month

**Prerequisites completed:**
- [x] AWS account with IAM admin user
- [x] `aws configure` done locally
- [x] Domain: epbx.negd.in

---

## Step 1: Create EC2 Key Pair

Run on your local machine:

```bash
aws ec2 create-key-pair \
  --key-name hotel-app-prod \
  --region ap-south-1 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/hotel-app-prod.pem

chmod 400 ~/.ssh/hotel-app-prod.pem
```

---

## Step 2: Launch EC2 Instance

Go to AWS Console → EC2 → Launch Instance (ap-south-1):

| Setting | Value |
|---|---|
| Name | `hotel-app-server` |
| AMI | Ubuntu Server 22.04 LTS (64-bit ARM or x86) |
| Instance type | `t3.medium` (2 vCPU, 4 GB RAM) |
| Key pair | `hotel-app-prod` (created in Step 1) |
| VPC | Default VPC |
| Auto-assign public IP | **Enable** |
| Storage | 30 GB gp3 |

**Security Group — create new with these rules:**

| Type | Port | Source | Description |
|---|---|---|---|
| SSH | 22 | My IP | SSH access |
| HTTP | 80 | 0.0.0.0/0 | Caddy (redirect to HTTPS) |
| HTTPS | 443 | 0.0.0.0/0 | Caddy + API + Signaling |
| Custom UDP | 3478 | 0.0.0.0/0 | STUN/TURN |
| Custom TCP | 3478 | 0.0.0.0/0 | STUN/TURN TCP |
| Custom UDP | 49152-65535 | 0.0.0.0/0 | TURN relay range |

Click **Launch Instance**.

---

## Step 3: Allocate Elastic IP

The server needs a fixed IP (for DNS and TURN):

1. EC2 → Elastic IPs → **Allocate Elastic IP address**
2. Select the new EIP → **Actions** → **Associate Elastic IP address**
3. Select your `hotel-app-server` instance → Associate

**Note the Elastic IP** — you'll need it for DNS.

---

## Step 4: Create S3 Buckets

```bash
aws s3 mb s3://hotel-app-prod-kyc-docs --region ap-south-1
aws s3 mb s3://hotel-app-prod-app-assets --region ap-south-1

# Block all public access
aws s3api put-public-access-block --bucket hotel-app-prod-kyc-docs \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-public-access-block --bucket hotel-app-prod-app-assets \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## Step 5: Set Up DNS Records

In your DNS management for `epbx.negd.in`, add these records pointing to the **Elastic IP** from Step 3:

| Record Type | Name | Value |
|---|---|---|
| A | `api.epbx.negd.in` | `<Elastic IP>` |
| A | `signal.epbx.negd.in` | `<Elastic IP>` |
| A | `turn.epbx.negd.in` | `<Elastic IP>` |

(Amplify subdomains — `guest.`, `staff.`, `admin.` — will be configured in Step 9)

Wait for DNS propagation (check with `nslookup api.epbx.negd.in`).

---

## Step 6: SSH into EC2 and Run Setup

```bash
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<Elastic IP>
```

Once connected:

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/rohillajai/hotel-app/main/infra/deploy/setup-ec2.sh | bash
```

**Log out and log back in** (for docker group permissions):

```bash
exit
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<Elastic IP>
```

Verify docker works:
```bash
docker --version
docker compose version
```

---

## Step 7: Clone Repo and Configure Secrets

```bash
cd /opt/hotel-app
git clone https://github.com/rohillajai/hotel-app.git repo
cd repo/infra/deploy

# Create the environment file
cp .env.prod.example .env.prod
nano .env.prod
```

**Fill in `.env.prod` with real values:**

Generate secrets (run this locally or on the server):
```bash
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
echo "COTURN_SECRET=$(openssl rand -base64 24)"
echo "SIGNALING_INTERNAL_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 16 | tr -d /+=)"
```

Paste those into `.env.prod`. Also set:
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` — your IAM user credentials
- `OTP_BYPASS_ENABLED=true` (keep this for initial testing; set to `false` later)

---

## Step 8: Deploy!

```bash
cd /opt/hotel-app/repo
chmod +x infra/deploy/deploy.sh
./infra/deploy/deploy.sh
```

This will:
1. Build Docker images for API and Signaling servers
2. Start PostgreSQL, Redis, API, Signaling, coturn, and Caddy
3. Caddy auto-provisions Let's Encrypt certificates for `api.epbx.negd.in` and `signal.epbx.negd.in`
4. Run database migrations
5. Seed the pilot hotel data

**Verify:**
```bash
curl https://api.epbx.negd.in/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## Step 9: Set Up Amplify Hosting (3 Frontends)

Go to AWS Console → AWS Amplify → **Create new app**:

### Guest PWA (guest.epbx.negd.in)

1. Source: GitHub → select `rohillajai/hotel-app` → branch `main`
2. App name: `hotel-app-guest`
3. Build settings → Edit:
   - App root: `apps/guest-pwa`
   - Build command: `cd ../.. && npm i -g pnpm@9 && pnpm install && pnpm --filter @hotel-app/config build && pnpm --filter @hotel-app/core build && pnpm --filter @hotel-app/guest-pwa build`
   - Output directory: `apps/guest-pwa/.next`
4. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://api.epbx.negd.in`
   - `NEXT_PUBLIC_SIGNALING_URL` = `https://signal.epbx.negd.in`
5. Deploy → wait for build
6. Domain management → Add domain → `epbx.negd.in` → subdomain `guest`

### Staff PWA (staff.epbx.negd.in)

Same as above but:
- App name: `hotel-app-staff`
- App root: `apps/staff-pwa`
- Build command: `...pnpm --filter @hotel-app/staff-pwa build`
- Output: `apps/staff-pwa/.next`
- Subdomain: `staff`

### Admin Web (admin.epbx.negd.in)

Same as above but:
- App name: `hotel-app-admin`
- App root: `apps/admin-web`
- Build command: `...pnpm --filter @hotel-app/admin-web build`
- Output: `apps/admin-web/.next`
- Subdomain: `admin`

---

## Step 10: Verify Everything Works

1. **Health check:** `curl https://api.epbx.negd.in/health`
2. **Guest PWA:** Open `https://guest.epbx.negd.in` — should show "Welcome to Hotel Guest"
3. **Admin login:** Open `https://admin.epbx.negd.in` → login with `admin@grandpilot.hotel` / `Admin@123`
4. **Staff login:** Open `https://staff.epbx.negd.in` → login with `reception@grandpilot.hotel` / `Staff@123`
5. **Test OTP flow:** On guest PWA, enter any mobile number → use `123456` as OTP

---

## Useful Commands (on the EC2 server)

```bash
cd /opt/hotel-app/repo

# View all containers
docker compose -f infra/deploy/docker-compose.prod.yml ps

# View logs (all services)
docker compose -f infra/deploy/docker-compose.prod.yml logs -f

# View logs (specific service)
docker compose -f infra/deploy/docker-compose.prod.yml logs -f api-server

# Restart everything
docker compose -f infra/deploy/docker-compose.prod.yml restart

# Pull latest code and redeploy
cd /opt/hotel-app/repo && git pull && ./infra/deploy/deploy.sh

# Enter PostgreSQL shell
docker compose -f infra/deploy/docker-compose.prod.yml exec postgres psql -U hotelapp -d hotelapp

# Check Caddy certificates
docker compose -f infra/deploy/docker-compose.prod.yml exec caddy caddy list-modules
```

---

## Security Checklist (post-deploy)

- [ ] Change `OTP_BYPASS_ENABLED` to `false` before going live
- [ ] Restrict SSH security group to your office IP only
- [ ] Set up CloudWatch agent for log aggregation
- [ ] Enable RDS automated backups (if migrating to RDS later)
- [ ] Rotate all secrets quarterly
- [ ] Set up AWS Budget alerts (e.g., alert at ₹5,000)
