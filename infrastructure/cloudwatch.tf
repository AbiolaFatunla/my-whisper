# CloudWatch Log Groups for Lambda and API Gateway

# Lambda logs
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-api"
  retention_in_days = 14

  tags = {
    Name = "My Whisper Lambda Logs"
  }
}

# API Gateway logs
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/api-gateway/${var.project_name}"
  retention_in_days = 14

  tags = {
    Name = "My Whisper API Gateway Logs"
  }
}
