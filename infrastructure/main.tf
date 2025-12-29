# Terraform configuration for My Whisper infrastructure
# Provisions: S3 (audio storage), Lambda, API Gateway, IAM, CloudWatch

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket       = "abiola-terraform-state"
    key          = "my-whisper/terraform.tfstate"
    region       = "eu-west-2"
    profile      = "abiola-cli"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "my-whisper"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
