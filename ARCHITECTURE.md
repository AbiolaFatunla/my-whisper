# My Whisper - Architecture

This document describes how the different parts of the system fit together. It's the reference for understanding what lives where and how data flows through the app.

---

## Overview

The app is split across multiple platforms, each handling what it does best:

| Platform | What It Does |
|----------|--------------|
| **Vercel** | Hosts the frontend (static files) |
| **AWS Lambda** | Runs the API (serverless functions) |
| **AWS API Gateway** | Routes HTTP requests to Lambda |
| **AWS S3** | Stores audio recordings |
| **Supabase** | Database + Authentication |
| **OpenAI** | Whisper transcription + GPT for titles |

---

## AI & Intelligence

The app uses a combination of AI services and algorithms:

| Feature | Technology | How It Works |
|---------|------------|--------------|
| **Transcription** | OpenAI Whisper (whisper-1) | Converts audio to text with high accuracy |
| **Title Generation** | OpenAI GPT-4o-mini | Summarises transcript into a 1-4 word title |
| **Personalisation** | LCS diff algorithm | Learns from user corrections over time |

### Learns From Your Edits

The app learns from your corrections through a feedback loop. When you fix an error, the system remembers it. Make the same correction twice, and it auto-applies from then on. Over time, it builds a personal correction dictionary and anticipates the corrections you'd make.

**How it works:**

1. **Extraction**: When you save an edited transcript, the system computes a diff using the Longest Common Subsequence (LCS) algorithm to identify phrase-level changes
2. **Storage**: Each correction is stored with a count that increments on repeat occurrences
3. **Application**: Corrections with count >= 2 are automatically applied to future transcriptions
4. **Confidence**: The count threshold prevents one-off typos from becoming permanent corrections

This approach means the system genuinely improves for each user's specific vocabulary and speech patterns, without any cloud-based ML training.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL                                   │
│                                                                  │
│  Frontend (public/)                                              │
│  - index.html, history.html, login.html                         │
│  - styles.css                                                    │
│  - app.js, recorder.js, uploader.js, player.js                  │
│  - supabase-client.js (auth + direct DB queries)                │
│                                                                  │
│  Calls API via fetch() to Lambda endpoint                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS (Terraform-managed)                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  API Gateway (HTTP API)                                  │    │
│  │  https://{api-id}.execute-api.eu-west-2.amazonaws.com   │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Lambda: my-whisper-api                                  │    │
│  │                                                          │    │
│  │  Routes:                                                 │    │
│  │  - GET  /api/health                                      │    │
│  │  - POST /api/get-upload-url                              │    │
│  │  - POST /api/move-to-shared                              │    │
│  │  - POST /api/transcribe                                  │    │
│  │  - GET  /api/transcripts                                 │    │
│  │  - GET  /api/transcripts/:id                             │    │
│  │  - PUT  /api/transcripts/:id                             │    │
│  │  - DELETE /api/transcripts/:id                           │    │
│  │  - GET  /api/audio-proxy                                 │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  S3: abiola-whisper-audio                                │    │
│  │                                                          │    │
│  │  - uploads/   (temporary, pre-transcription)             │    │
│  │  - shared/    (permanent, post-transcription)            │    │
│  │  - 90-day lifecycle policy                               │    │
│  │  - Versioning enabled                                    │    │
│  │  - Server-side encryption                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Region: eu-west-2 (London)                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                  │
│                                                                  │
│  PostgreSQL Database:                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  auth.users (managed by Supabase)                        │    │
│  │  - id, email, created_at, metadata                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  transcripts                                             │    │
│  │  - id, user_id, raw_text, personalized_text, final_text │    │
│  │  - audio_url, duration_seconds, title                    │    │
│  │  - created_at, updated_at                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  corrections                                             │    │
│  │  - id, user_id, original_token, corrected_token         │    │
│  │  - count, first_seen_at, last_seen_at, disabled         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Auth:                                                           │
│  - Google OAuth provider                                         │
│  - JWT tokens for session management                             │
│                                                                  │
│  Security:                                                       │
│  - Row Level Security (RLS) on all tables                        │
│  - Users can only access their own data                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         OPENAI                                   │
│                                                                  │
│  - Whisper API (whisper-1) for transcription                     │
│  - GPT (gpt-4o-mini) for title generation                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Recording and Transcription

```
1. User clicks record
   │
   ▼
2. Browser captures audio via MediaRecorder API
   │
   ▼
3. Frontend requests presigned URL from Lambda
   POST /api/get-upload-url
   │
   ▼
4. Frontend uploads audio directly to S3
   PUT to presigned URL
   │
   ▼
5. Frontend requests transcription
   POST /api/transcribe { fileUrl }
   │
   ▼
6. Lambda downloads audio from S3
   │
   ▼
7. Lambda sends to OpenAI Whisper
   │
   ▼
8. Lambda applies learned corrections (from Supabase)
   │
   ▼
9. Lambda saves transcript to Supabase
   │
   ▼
10. Lambda returns transcript to frontend
```

### Saving Edits (Learning)

```
1. User edits transcript and clicks Save
   │
   ▼
2. Frontend sends update to Lambda
   PUT /api/transcripts/:id { finalText }
   │
   ▼
3. Lambda computes diff between raw_text and finalText
   │
   ▼
4. Lambda extracts phrase-level corrections (LCS algorithm)
   │
   ▼
5. Lambda upserts corrections to Supabase
   (increment count if exists)
   │
   ▼
6. Lambda updates transcript with finalText
   │
   ▼
7. Future transcriptions auto-apply corrections
   where count >= 2
```

---

## Authentication

The app supports both anonymous and authenticated users, with complete data isolation between them.

### How It Works

```
Anonymous User:
┌─────────────────────────────────────────────────────────────┐
│  Browser generates UUID on first visit                       │
│  └── Stored in localStorage                                  │
│  └── Sent as X-Anonymous-ID header on every API call        │
│  └── Backend filters all queries by this user_id            │
└─────────────────────────────────────────────────────────────┘

Authenticated User:
┌─────────────────────────────────────────────────────────────┐
│  User clicks "Sign in" → redirects to Google OAuth          │
│  └── Supabase handles OAuth flow                             │
│  └── Returns JWT with user's Supabase ID                     │
│  └── Sent as Authorization: Bearer <token> header           │
│  └── Backend extracts user_id from JWT payload              │
└─────────────────────────────────────────────────────────────┘
```

### Data Isolation

All database queries filter by `user_id`:

```javascript
// Backend extracts user ID from headers
const userId = getUserIdFromHeaders(headers);

// All queries are scoped to this user
await supabase.from('transcripts').select('*').eq('user_id', userId);
```

This means:
- Different browsers see different recordings (even without sign-in)
- Signing in ties recordings to your Google account
- No way for users to access each other's data

---

## Local Development

For local development, `server.js` runs everything together:

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL (npm start)                             │
│                                                                  │
│  Express Server (localhost:3001)                                 │
│  ├── Static files (public/)                                      │
│  └── API routes (/api/*)                                         │
│                                                                  │
│  Same code, different deployment target                          │
└─────────────────────────────────────────────────────────────────┘
```

This is intentional. The Express server handles both static files and API routes locally, but in production they're deployed separately.

---

## Infrastructure as Code

All AWS resources are managed with Terraform:

```
infrastructure/
├── main.tf              # Provider config, S3 backend
├── variables.tf         # Input variables
├── s3.tf                # Audio bucket
├── iam.tf               # Lambda execution role
├── lambda.tf            # Lambda function
├── api_gateway.tf       # HTTP API
├── cloudwatch.tf        # Log groups
├── outputs.tf           # Exported values
└── terraform.tfvars     # Secrets (not committed)
```

State is stored in S3: `abiola-terraform-state` bucket.

---

## Environment Variables

### Lambda (set via Terraform)

| Variable | Description |
|----------|-------------|
| `AUDIO_BUCKET` | S3 bucket name |
| `OPENAI_API_KEY` | OpenAI API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NODE_ENV` | Environment (prod) |

### Local Development (app/.env)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `AWS_ACCESS_KEY_ID` | AWS credentials (for S3) |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials (for S3) |
| `S3_BUCKET_NAME` | S3 bucket name |
| `AWS_REGION` | AWS region |

### Vercel (when deployed)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Lambda API Gateway URL |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

---

## Deployment

### Lambda (API)

GitHub Actions workflow deploys on push to `main`:

1. Install dependencies (production only)
2. Zip the package
3. Update Lambda function code via AWS CLI

### Vercel (Frontend)

Connect the repo to Vercel and set the root directory to `app/public`. Vercel handles the rest.

---

## Security Considerations

- **S3**: Private bucket, presigned URLs for uploads, CORS configured
- **Lambda**: Execution role with minimal permissions
- **Supabase**: RLS policies enforce user data isolation
- **API Gateway**: CORS configured, HTTPS only
- **Secrets**: Never committed, stored in GitHub Secrets or Terraform vars

---

## Cost Estimate

| Service | Monthly Cost |
|---------|--------------|
| OpenAI Whisper | ~$0.50-1.00 (based on usage) |
| AWS Lambda | Free tier (1M requests) |
| AWS S3 | ~$0.05 (few GB) |
| AWS API Gateway | Free tier (1M requests) |
| Supabase | Free tier |
| Vercel | Free tier |

**Total: ~$0.50-1.50/month**

---

## Future Considerations

- **Custom domain**: Add to API Gateway and Vercel
- **CDN**: CloudFront in front of S3 for audio playback
- **Monitoring**: CloudWatch dashboards, alerts
- **Backup**: Supabase automated backups

---

*Last updated: December 2025*
