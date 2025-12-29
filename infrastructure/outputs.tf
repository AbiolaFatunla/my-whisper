# Outputs for My Whisper infrastructure

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "lambda_function_name" {
  description = "Lambda function name (for CI/CD deployments)"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

output "audio_bucket_name" {
  description = "S3 bucket name for audio storage"
  value       = aws_s3_bucket.audio.bucket
}

output "audio_bucket_arn" {
  description = "S3 bucket ARN for audio storage"
  value       = aws_s3_bucket.audio.arn
}

output "aws_region" {
  description = "AWS region"
  value       = data.aws_region.current.name
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}
