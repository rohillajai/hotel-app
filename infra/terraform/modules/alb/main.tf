variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "api_target_id" { type = string }
variable "api_port" { type = number }
variable "signaling_target_id" { type = string }
variable "signaling_port" { type = number }
variable "certificate_arn" { type = string }

resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP (redirect to HTTPS)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = { Name = "${var.project_name}-alb" }
}

# Target group — API server
resource "aws_lb_target_group" "api" {
  name     = "${var.project_name}-api-tg"
  port     = var.api_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = var.api_target_id
  port             = var.api_port
}

# Target group — Signaling server (WebSocket)
resource "aws_lb_target_group" "signaling" {
  name     = "${var.project_name}-sig-tg"
  port     = var.signaling_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path = "/health"
    port = "traffic-port"
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
}

resource "aws_lb_target_group_attachment" "signaling" {
  target_group_arn = aws_lb_target_group.signaling.arn
  target_id        = var.signaling_target_id
  port             = var.signaling_port
}

# HTTPS listener
resource "aws_lb_listener" "https" {
  count             = var.certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP listener — redirect to HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = var.certificate_arn != "" ? "redirect" : "forward"
    dynamic "redirect" {
      for_each = var.certificate_arn != "" ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
    target_group_arn = var.certificate_arn == "" ? aws_lb_target_group.api.arn : null
  }
}

output "dns_name" { value = aws_lb.main.dns_name }
output "security_group_id" { value = aws_security_group.alb.id }
