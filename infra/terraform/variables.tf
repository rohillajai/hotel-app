variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "project_name" {
  type    = string
  default = "hotel-app"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "db_name" {
  type    = string
  default = "hotelapp"
}

variable "db_username" {
  type    = string
  default = "hotelapp"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "jwt_refresh_secret" {
  type      = string
  sensitive = true
}

variable "coturn_secret" {
  type      = string
  sensitive = true
}

variable "signaling_internal_secret" {
  type      = string
  sensitive = true
}

variable "ec2_key_name" {
  type        = string
  description = "EC2 SSH key pair name"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS on ALB"
  default     = ""
}
