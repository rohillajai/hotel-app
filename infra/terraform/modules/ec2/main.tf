variable "name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
variable "instance_type" { type = string }
variable "key_name" { type = string }
variable "user_data" { type = string }
variable "allow_ingress_from" { type = list(string) }
variable "ingress_port" { type = number }
variable "associate_public_ip" { type = bool; default = false }
variable "additional_ingress" {
  type = list(object({ port = number, protocol = string, cidr = string, description = string }))
  default = []
}
variable "udp_port_range" {
  type    = object({ from = number, to = number })
  default = null
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_security_group" "main" {
  name_prefix = "${var.name}-"
  vpc_id      = var.vpc_id

  # Ingress from ALB or specified SGs
  dynamic "ingress" {
    for_each = length(var.allow_ingress_from) > 0 ? [1] : []
    content {
      from_port       = var.ingress_port
      to_port         = var.ingress_port
      protocol        = "tcp"
      security_groups = var.allow_ingress_from
    }
  }

  # Additional custom ingress rules (e.g., coturn UDP)
  dynamic "ingress" {
    for_each = var.additional_ingress
    content {
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = ingress.value.protocol
      cidr_blocks = [ingress.value.cidr]
      description = ingress.value.description
    }
  }

  # UDP port range (coturn relay)
  dynamic "ingress" {
    for_each = var.udp_port_range != null ? [1] : []
    content {
      from_port   = var.udp_port_range.from
      to_port     = var.udp_port_range.to
      protocol    = "udp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "TURN relay UDP range"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-sg" }
}

resource "aws_instance" "main" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = var.key_name
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.main.id]
  associate_public_ip_address = var.associate_public_ip
  user_data                   = var.user_data

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = var.name }
}

# Elastic IP for coturn
resource "aws_eip" "main" {
  count    = var.associate_public_ip ? 1 : 0
  instance = aws_instance.main.id
  domain   = "vpc"
  tags     = { Name = "${var.name}-eip" }
}

output "instance_id" { value = aws_instance.main.id }
output "private_ip" { value = aws_instance.main.private_ip }
output "public_ip" { value = var.associate_public_ip ? aws_eip.main[0].public_ip : null }
output "security_group_id" { value = aws_security_group.main.id }
