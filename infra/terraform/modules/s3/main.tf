variable "project_name" { type = string }
variable "environment" { type = string }

resource "aws_s3_bucket" "kyc" {
  bucket = "${var.project_name}-${var.environment}-kyc-docs"
  tags   = { Name = "${var.project_name}-kyc-docs", Purpose = "KYC_DOCUMENT" }
}

resource "aws_s3_bucket_versioning" "kyc" {
  bucket = aws_s3_bucket.kyc.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "kyc" {
  bucket = aws_s3_bucket.kyc.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_public_access_block" "kyc" {
  bucket                  = aws_s3_bucket.kyc.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-${var.environment}-app-assets"
  tags   = { Name = "${var.project_name}-app-assets" }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "kyc_bucket_name" { value = aws_s3_bucket.kyc.id }
output "assets_bucket_name" { value = aws_s3_bucket.assets.id }
