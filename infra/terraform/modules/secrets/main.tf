variable "project_name" { type = string }
variable "environment" { type = string }
variable "db_password" { type = string }
variable "jwt_secret" { type = string }
variable "jwt_refresh_secret" { type = string }
variable "coturn_secret" { type = string }
variable "signaling_internal_secret" { type = string }

resource "aws_secretsmanager_secret" "db" {
  name = "${var.project_name}/${var.environment}/db-password"
  tags = { Name = "DB Password" }
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = var.db_password
}

resource "aws_secretsmanager_secret" "jwt" {
  name = "${var.project_name}/${var.environment}/jwt-secrets"
  tags = { Name = "JWT Secrets" }
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id = aws_secretsmanager_secret.jwt.id
  secret_string = jsonencode({
    jwt_secret         = var.jwt_secret
    jwt_refresh_secret = var.jwt_refresh_secret
  })
}

resource "aws_secretsmanager_secret" "coturn" {
  name = "${var.project_name}/${var.environment}/coturn-secret"
  tags = { Name = "COTURN Secret" }
}

resource "aws_secretsmanager_secret_version" "coturn" {
  secret_id     = aws_secretsmanager_secret.coturn.id
  secret_string = var.coturn_secret
}

resource "aws_secretsmanager_secret" "signaling" {
  name = "${var.project_name}/${var.environment}/signaling-secret"
  tags = { Name = "Signaling Internal Secret" }
}

resource "aws_secretsmanager_secret_version" "signaling" {
  secret_id     = aws_secretsmanager_secret.signaling.id
  secret_string = var.signaling_internal_secret
}
