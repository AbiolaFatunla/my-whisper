# My Whisper

A personal voice dictation app with AI-powered transcription that learns from my corrections over time.

<!-- Security & CI Badges -->
[![CI](https://github.com/abiolafatunla/my-whisper/actions/workflows/ci.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/ci.yml)
[![CodeQL](https://github.com/abiolafatunla/my-whisper/actions/workflows/codeql.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/codeql.yml)
[![Trivy Security Scan](https://github.com/abiolafatunla/my-whisper/actions/workflows/trivy.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/trivy.yml)
[![Secrets Detection](https://github.com/abiolafatunla/my-whisper/actions/workflows/secrets-scan.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/secrets-scan.yml)
![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)

> **Portfolio Project** - This code is shared for evaluation purposes only (job applications, interviews, professional assessment). Not open source. See [LICENSE](LICENSE) for terms.

## What This Is

I built this because I wanted a voice transcription tool that actually learns from my corrections. The idea is simple: when I fix a transcription error, the system remembers it. Make the same correction twice, and from the third time onwards it auto-applies. Over time, it becomes personalised to how I speak.

The app uses OpenAI's Whisper API for transcription, Supabase for data persistence, and a vanilla JavaScript frontend with a glassmorphism design.

## Architecture

The app runs on a serverless architecture split across multiple platforms:

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Vercel | Static site hosting |
| API | AWS Lambda + API Gateway | Serverless backend |
| Database | Supabase (PostgreSQL) | Transcripts, corrections, auth |
| Storage | AWS S3 | Audio file storage |
| Transcription | OpenAI Whisper | Speech-to-text |
| IaC | Terraform | AWS resource management |

For the full technical breakdown, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Features

**Currently Working:**
- Voice recording with real-time waveform visualisation
- AI transcription via OpenAI Whisper
- Transcripts saved to database
- AI-generated titles for recordings

**In Development:**
- History view (browse past recordings)
- Editable transcripts
- Personalisation (learn from corrections)
- Google OAuth authentication

## Project Structure

```
my-whisper/
├── app/                    # Local development (Express server)
│   ├── public/            # Frontend assets (deployed to Vercel)
│   ├── server.js          # Local dev server
│   └── services/          # Backend services
├── lambda/                 # Production API (AWS Lambda)
│   └── index.js           # Native Lambda handler
├── infrastructure/         # Terraform IaC
│   └── *.tf               # AWS resource definitions
└── .github/workflows/     # CI/CD pipelines
```

## Local Development

```bash
cd app
npm install
cp .env.example .env
# Fill in your API keys
npm start
```

The local server runs at `http://localhost:3001` and serves both the frontend and API.

## Deployment

**Frontend:** Vercel (auto-deploys from `app/public/`)

**API:** AWS Lambda via GitHub Actions (triggers on changes to `lambda/`)

**Infrastructure:** Terraform (manual apply from `infrastructure/`)

## Security

I've set up a proper CI/CD pipeline with multiple layers of security scanning. If you're building anything that handles user data and API keys, you need to be thorough about this.

| Layer | Tool | Purpose |
|-------|------|---------|
| SAST | CodeQL | Static code analysis |
| Secrets | Gitleaks | Prevents credential leaks |
| Dependencies | Trivy | Vulnerability scanning |
| SBOM | Trivy | CycloneDX software bill of materials |

For a detailed analysis of security findings, see [SECURITY_ANALYSIS.md](SECURITY_ANALYSIS.md).

### AI/LLM Security

Since this is an AI-powered app, I follow the [OWASP LLM Top 10](https://genai.owasp.org/) guidelines:

- User input is sanitised before being processed by the AI
- API keys are stored as environment variables, never committed
- Rate limiting is in place to prevent abuse
- Transcriptions are protected with Row Level Security

## Environment Variables

**Local Development (app/.env):**

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for Whisper |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 |

**Production:** Environment variables are set via Terraform (Lambda) and Vercel dashboard.

## Licence

(C) 2025 Abiola Fatunla. All rights reserved.

This repository is shared for evaluation purposes only. Copying, modification, distribution, or use of this code is not permitted without explicit written permission. See [LICENSE](LICENSE) for full terms.

---

Built by Abiola Fatunla
