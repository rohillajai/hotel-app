variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" { type = string }
variable "allowed_sg_ids" { type = list(string) }

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "${var.project_name}-db-subnet" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  vpc_id      = var.vpc_id
  description = "Allow PostgreSQL from app servers only"

  dynamic "ingress" {
    for_each = var.allowed_sg_ids
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

resource "aws_db_instance" "main" {
  identifier             = "${var.project_name}-${var.environment}"
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  storage_type           = "gp3"
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = false # Enable for production
  publicly_accessible    = false
  skip_final_snapshot    = true
  storage_encrypted      = true
  backup_retention_period = 7

  tags = { Name = "${var.project_name}-rds" }
}

output "endpoint" { value = aws_db_instance.main.endpoint }
output "security_group_id" { value = aws_security_group.rds.id }
