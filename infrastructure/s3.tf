# S3 bucket for audio file storage

resource "aws_s3_bucket" "audio" {
  bucket = var.audio_bucket_name

  tags = {
    Name = "My Whisper Audio Storage"
  }
}

# Enable versioning for data protection
resource "aws_s3_bucket_versioning" "audio" {
  bucket = aws_s3_bucket.audio.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "audio" {
  bucket = aws_s3_bucket.audio.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS configuration for browser uploads via presigned URLs
resource "aws_s3_bucket_cors_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"] # Tighten this in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Lifecycle rule to delete old audio files
resource "aws_s3_bucket_lifecycle_configuration" "audio" {
  count  = var.audio_retention_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.audio.id

  rule {
    id     = "delete-old-audio"
    status = "Enabled"

    filter {
      prefix = "" # Apply to all objects
    }

    expiration {
      days = var.audio_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}
