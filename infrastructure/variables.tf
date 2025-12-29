# Input variables for My Whisper infrastructure

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-west-2"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "abiola-cli"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "my-whisper"
}

# Audio bucket
variable "audio_bucket_name" {
  description = "S3 bucket name for audio storage"
  type        = string
  default     = "abiola-whisper-audio"
}

variable "audio_retention_days" {
  description = "Days to retain audio files before deletion (0 = no expiration)"
  type        = number
  default     = 90
}

# Lambda configuration
variable "lambda_memory" {
  description = "Lambda memory in MB"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

# Application secrets (passed as Lambda env vars)
variable "openai_api_key" {
  description = "OpenAI API key for Whisper transcription"
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
}

variable "supabase_anon_key" {
  description = "Supabase anonymous key"
  type        = string
  sensitive   = true
}
