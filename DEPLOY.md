# Deployment Guide — Single EC2 + Amplify

**Architecture:** 1x EC2 `t3.medium` (backend + DB + Redis + coturn) + Amplify Hosting (3 frontends)  
**Cost:** ~₹4,000–5,000/month  
**Domain:** `epbx.negd.in`

---

## Prerequisites Checklist

- [x] AWS account with IAM admin user
- [x] Secrets generated (Step 5 done)
- [ ] EC2 key pair created
- [ ] Domain DNS access for `epbx.negd.in`
- [ ] Code pushed to a Git repo (GitHub/CodeCommit)

---

## Step 1: Create IAM User (if not done)

1. AWS Console → IAM → Users → Create user: `hotel-app-admin`
2. Attach policy: `AdministratorAccess`
3. Create access key (CLI use case) → save Access Key ID + Secret

```bash
aws configure
# Region: ap-south-1, Output: json
aws sts get-caller-identity  # verify
```

---

## Step 2: Create EC2 Key Pair

```bash
aws ec2 create-key-pair \
  --key-name hotel-app-prod \
  --region ap-south-1 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/hotel-app-prod.pem

chmod 400 ~/.ssh/hotel-app-prod.pem
```

---

## Step 3: Create S3 Buckets

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

## Step 4: Launch EC2 Instance

```bash
# Find Ubuntu 22.04 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text --region ap-south-1)

echo "AMI: $AMI_ID"

# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name hotel-app-sg \
  --description "Hotel App EC2" \
  --region ap-south-1 \
  --query 'GroupId' --output text)

# Open ports
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0 --region ap-south-1
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region ap-south-1
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0 --region ap-south-1
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol udp --port 3478 --cidr 0.0.0.0/0 --region ap-south-1
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol udp --port 49152-65535 --cidr 0.0.0.0/0 --region ap-south-1

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.medium \
  --key-name hotel-app-prod \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=hotel-app-prod}]' \
  --region ap-south-1 \
  --query 'Instances[0].InstanceId' --output text)

echo "Instance: $INSTANCE_ID"

# Wait for running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region ap-south-1

# Allocate Elastic IP
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --region ap-south-1 --query 'AllocationId' --output text)
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $ALLOC_ID --region ap-south-1 --query 'Addresses[0].PublicIp' --output text)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC_ID --region ap-south-1

echo "Public IP: $PUBLIC_IP"
echo ""
echo ">>> SAVE THIS IP — you need it for DNS records <<<"
```

---

## Step 5: Configure DNS Records

In your DNS manager for `negd.in`, add these records pointing to the Elastic IP from Step 4:

| Type | Name | Value |
|---|---|---|
| A | `api.epbx` | `<ELASTIC_IP>` |
| A | `signal.epbx` | `<ELASTIC_IP>` |
| A | `turn.epbx` | `<ELASTIC_IP>` |

For Amplify frontends (added after Amplify setup in Step 8):
| Type | Name | Value |
|---|---|---|
| CNAME | `guest.epbx` | `<amplify-provided-url>` |
| CNAME | `staff.epbx` | `<amplify-provided-url>` |
| CNAME | `admin.epbx` | `<amplify-provided-url>` |

---

## Step 6: Setup the EC2 Instance

```bash
# SSH into the instance
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<ELASTIC_IP>

# Run the setup script
curl -fsSL https://raw.githubusercontent.com/<your-repo>/main/infra/deploy/setup-ec2.sh | sudo bash

# OR if not on GitHub yet, copy and paste the setup-ec2.sh content and run:
# sudo bash setup-ec2.sh

# Log out and back in (for docker group)
exit
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<ELASTIC_IP>
```

---

## Step 7: Deploy the App on EC2

```bash
# On the EC2 instance:
cd /opt/hotel-app

# Clone your repo (push your code to GitHub first)
git clone https://github.com/<your-username>/Hotel_APP.git .

# Create production env file
cp infra/deploy/.env.prod.example infra/deploy/.env.prod
nano infra/deploy/.env.prod
# Fill in ALL secrets from Step 5 of the previous guide

# Update coturn config with your secrets and IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
sed -i "s|REPLACE_WITH_COTURN_SECRET|<your_coturn_secret>|" infra/deploy/coturn/turnserver.prod.conf
sed -i "s|# external-ip=.*|external-ip=${PUBLIC_IP}/${PRIVATE_IP}|" infra/deploy/coturn/turnserver.prod.conf

# Start everything
docker compose -f infra/deploy/docker-compose.prod.yml up -d --build

# Check status
docker compose -f infra/deploy/docker-compose.prod.yml ps

# View logs
docker compose -f infra/deploy/docker-compose.prod.yml logs -f api-server
```

After ~2 minutes, verify:
```bash
curl https://api.epbx.negd.in/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## Step 8: Deploy Frontends to Amplify

In the AWS Console:

### 8.1 — Guest PWA
1. Go to **AWS Amplify** (ap-south-1)
2. Click **New app** → **Host web app**
3. Connect your GitHub repo
4. **App settings:**
   - App name: `hotel-guest`
   - Branch: `main`
   - Build settings: **Monorepo** → App root: `apps/guest-pwa`
5. **Environment variables:**
   - `NEXT_PUBLIC_API_URL` = `https://api.epbx.negd.in`
   - `NEXT_PUBLIC_SIGNALING_URL` = `https://signal.epbx.negd.in`
6. Deploy → wait for build to complete
7. **Domain management** → Add domain → `epbx.negd.in` → subdomain `guest`
8. Amplify provides a CNAME — add it to your DNS

### 8.2 — Staff PWA
Repeat the above with:
- App name: `hotel-staff`
- App root: `apps/staff-pwa`
- Same env vars
- Subdomain: `staff`

### 8.3 — Admin Web
Repeat with:
- App name: `hotel-admin`
- App root: `apps/admin-web`
- Same env vars
- Subdomain: `admin`

---

## Step 9: Seed the Database

```bash
# On the EC2 instance:
cd /opt/hotel-app

# Run seed inside the api-server container
docker compose -f infra/deploy/docker-compose.prod.yml exec api-server \
  sh -c "cd packages/db && npx prisma db seed"
```

---

## Step 10: Verify Everything

| URL | Expected |
|---|---|
| `https://api.epbx.negd.in/health` | `{"status":"ok"}` |
| `https://guest.epbx.negd.in` | Guest PWA landing page |
| `https://staff.epbx.negd.in` | Staff login page |
| `https://admin.epbx.negd.in` | Admin login page |

**Test login:**
- Admin: `admin@grandpilot.hotel` / `Admin@123`
- Staff: `reception@grandpilot.hotel` / `Staff@123`

---

## Maintenance Commands

```bash
# SSH to server
ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@<ELASTIC_IP>
cd /opt/hotel-app

# Pull latest code and redeploy
git pull
docker compose -f infra/deploy/docker-compose.prod.yml up -d --build

# View logs
docker compose -f infra/deploy/docker-compose.prod.yml logs -f

# Restart a specific service
docker compose -f infra/deploy/docker-compose.prod.yml restart api-server

# Database backup
docker compose -f infra/deploy/docker-compose.prod.yml exec postgres \
  pg_dump -U hotelapp hotelapp > backup_$(date +%Y%m%d).sql

# Run migrations after schema changes
docker compose -f infra/deploy/docker-compose.prod.yml exec api-server \
  sh -c "cd packages/db && npx prisma migrate deploy"
```

---

## Cost Breakdown

| Resource | Monthly Cost (ap-south-1) |
|---|---|
| EC2 t3.medium (on-demand) | ~₹2,800 |
| Elastic IP | ₹0 (attached to running instance) |
| EBS 30GB gp3 | ~₹250 |
| S3 (minimal usage) | ~₹50 |
| Amplify Hosting (3 apps) | ~₹0–500 (free tier covers pilot) |
| Data transfer | ~₹200–500 |
| **Total** | **~₹3,500–4,500/month** |

Save more: use a **t3.medium Reserved Instance (1yr)** → ~₹1,800/month instead of ₹2,800.
