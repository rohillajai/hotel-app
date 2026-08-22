###############################################################################
# Hotel App — Phase 1 Infrastructure (AWS ap-south-1)
# Pilot target: ≤5 hotels, 500 concurrent guests, 50 concurrent calls
# Estimated cost: ₹18,000–22,000/month
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — uncomment and configure for team usage
  # backend "s3" {
  #   bucket         = "hotel-app-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "hotel-app"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

###############################################################################
# VPC
###############################################################################
module "vpc" {
  source = "./modules/vpc"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

###############################################################################
# RDS PostgreSQL
###############################################################################
module "rds" {
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
  allowed_sg_ids     = [module.ec2_api.security_group_id, module.ec2_signaling.security_group_id]
}

###############################################################################
# ElastiCache Redis
###############################################################################
module "elasticache" {
  source = "./modules/elasticache"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  allowed_sg_ids     = [module.ec2_api.security_group_id, module.ec2_signaling.security_group_id]
}

###############################################################################
# EC2 — API Server
###############################################################################
module "ec2_api" {
  source = "./modules/ec2"

  name               = "${var.project_name}-api"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_id          = module.vpc.private_subnet_ids[0]
  instance_type      = "t3.small"
  key_name           = var.ec2_key_name
  user_data          = file("${path.module}/scripts/api-server-userdata.sh")
  allow_ingress_from = [module.alb.security_group_id]
  ingress_port       = 3001
}

###############################################################################
# EC2 — Signaling Server
###############################################################################
module "ec2_signaling" {
  source = "./modules/ec2"

  name               = "${var.project_name}-signaling"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_id          = module.vpc.private_subnet_ids[1]
  instance_type      = "t3.small"
  key_name           = var.ec2_key_name
  user_data          = file("${path.module}/scripts/signaling-server-userdata.sh")
  allow_ingress_from = [module.alb.security_group_id]
  ingress_port       = 3002
}

###############################################################################
# EC2 — coturn (public subnet — needs public IP for TURN relay)
###############################################################################
module "ec2_coturn" {
  source = "./modules/ec2"

  name               = "${var.project_name}-coturn"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_id          = module.vpc.public_subnet_ids[0]
  instance_type      = "t3.small"
  key_name           = var.ec2_key_name
  user_data          = file("${path.module}/../coturn/setup.sh")
  associate_public_ip = true
  allow_ingress_from = []
  ingress_port       = 3478
  additional_ingress = [
    { port = 3478, protocol = "udp", cidr = "0.0.0.0/0", description = "STUN/TURN" },
    { port = 443, protocol = "tcp", cidr = "0.0.0.0/0", description = "TLS TURN" },
  ]
  udp_port_range = { from = 49152, to = 65535 }
}

###############################################################################
# ALB — Application Load Balancer
###############################################################################
module "alb" {
  source = "./modules/alb"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  api_target_id     = module.ec2_api.instance_id
  api_port          = 3001
  signaling_target_id = module.ec2_signaling.instance_id
  signaling_port      = 3002
  certificate_arn     = var.acm_certificate_arn
}

###############################################################################
# S3 Buckets
###############################################################################
module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
}

###############################################################################
# Secrets Manager
###############################################################################
module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment
  db_password  = var.db_password
  jwt_secret   = var.jwt_secret
  jwt_refresh_secret = var.jwt_refresh_secret
  coturn_secret      = var.coturn_secret
  signaling_internal_secret = var.signaling_internal_secret
}
