# Lambda function for My Whisper API

# Placeholder zip for initial deployment
# Real code deployed via GitHub Actions
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Placeholder' });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  memory_size = var.lambda_memory
  timeout     = var.lambda_timeout

  environment {
    variables = {
      NODE_ENV          = var.environment
      AUDIO_BUCKET      = aws_s3_bucket.audio.bucket
      OPENAI_API_KEY    = var.openai_api_key
      SUPABASE_URL      = var.supabase_url
      SUPABASE_ANON_KEY = var.supabase_anon_key
    }
  }

  tags = {
    Name = "My Whisper API"
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
