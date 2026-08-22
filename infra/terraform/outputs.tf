output "vpc_id" {
  value = module.vpc.vpc_id
}

output "alb_dns_name" {
  value = module.alb.dns_name
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "redis_endpoint" {
  value = module.elasticache.endpoint
}

output "coturn_public_ip" {
  value = module.ec2_coturn.public_ip
}

output "s3_kyc_bucket" {
  value = module.s3.kyc_bucket_name
}

output "s3_assets_bucket" {
  value = module.s3.assets_bucket_name
}
