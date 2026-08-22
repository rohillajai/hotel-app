#!/bin/bash
set -euo pipefail

###############################################################################
# Launch EC2 instance for Hotel App
# Run from your local machine: bash infra/deploy/launch-ec2.sh
###############################################################################

REGION="ap-south-1"
SG_ID="sg-0dff283adffde4f02"
KEY_NAME="hotel-app-prod"
INSTANCE_TYPE="t3.medium"
AMI_ID="" # Will be auto-detected below

echo "=== Step 1: Adding security group rules ==="
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $REGION 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $REGION 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $REGION 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol udp --port 3478 --cidr 0.0.0.0/0 --region $REGION 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3478 --cidr 0.0.0.0/0 --region $REGION 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id $SG_ID --ip-permissions IpProtocol=udp,FromPort=49152,ToPort=65535,IpRanges='[{CidrIp=0.0.0.0/0}]' --region $REGION 2>/dev/null || true
echo "  Security group rules: done"

echo "=== Step 2: Finding Ubuntu 22.04 AMI ==="
AMI_ID=$(aws ec2 describe-images \
  --region $REGION \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" "Name=state,Values=available" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)
echo "  AMI: $AMI_ID"

echo "=== Step 3: Launching EC2 instance ==="
INSTANCE_ID=$(aws ec2 run-instances \
  --region $REGION \
  --image-id $AMI_ID \
  --instance-type $INSTANCE_TYPE \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=hotel-app-server}]" \
  --query 'Instances[0].InstanceId' \
  --output text)
echo "  Instance ID: $INSTANCE_ID"

echo "=== Step 4: Waiting for instance to be running ==="
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION
echo "  Instance is running"

echo "=== Step 5: Allocating Elastic IP ==="
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --region $REGION --query 'AllocationId' --output text)
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $ALLOC_ID --region $REGION --query 'Addresses[0].PublicIp' --output text)
echo "  Elastic IP: $PUBLIC_IP"

echo "=== Step 6: Associating Elastic IP ==="
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC_ID --region $REGION
echo "  Associated"

echo "=== Step 7: Creating S3 buckets ==="
aws s3 mb s3://hotel-app-prod-kyc-docs --region $REGION 2>/dev/null || true
aws s3 mb s3://hotel-app-prod-app-assets --region $REGION 2>/dev/null || true
# Block public access
aws s3api put-public-access-block --bucket hotel-app-prod-kyc-docs --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true --region $REGION
aws s3api put-public-access-block --bucket hotel-app-prod-app-assets --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true --region $REGION
echo "  S3 buckets created (private)"

echo ""
echo "==========================================="
echo "  DEPLOYMENT COMPLETE"
echo "==========================================="
echo ""
echo "  Instance ID : $INSTANCE_ID"
echo "  Public IP   : $PUBLIC_IP"
echo "  Key file    : ~/.ssh/hotel-app-prod.pem"
echo ""
echo "  DNS records to add for epbx.negd.in:"
echo "    api.epbx.negd.in    → A record → $PUBLIC_IP"
echo "    signal.epbx.negd.in → A record → $PUBLIC_IP"
echo "    turn.epbx.negd.in   → A record → $PUBLIC_IP"
echo ""
echo "  Wait ~2 minutes, then SSH in:"
echo "    ssh -i ~/.ssh/hotel-app-prod.pem ubuntu@$PUBLIC_IP"
echo ""
echo "  Then run the setup script on the server (see DEPLOY.md Step 4)"
echo "==========================================="
