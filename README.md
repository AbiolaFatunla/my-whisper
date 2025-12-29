# My Whisper

A personal voice dictation app with AI-powered transcription that learns from my corrections over time.

<!-- Security & CI Badges -->
[![CI](https://github.com/abiolafatunla/my-whisper/actions/workflows/ci.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/ci.yml)
[![CodeQL](https://github.com/abiolafatunla/my-whisper/actions/workflows/codeql.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/codeql.yml)
[![Trivy Security Scan](https://github.com/abiolafatunla/my-whisper/actions/workflows/trivy.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/trivy.yml)
[![Secrets Detection](https://github.com/abiolafatunla/my-whisper/actions/workflows/secrets-scan.yml/badge.svg)](https://github.com/abiolafatunla/my-whisper/actions/workflows/secrets-scan.yml)

## What This Is

I built this because I wanted a voice transcription tool that actually learns from my corrections. The idea is simple: when I fix a transcription error, the system remembers it. Make the same correction twice, and from the third time onwards it auto-applies. Over time, it becomes personalised to how I speak.

The app uses OpenAI's Whisper API for transcription, Supabase for data persistence, and a straightforward vanilla JavaScript frontend with a glassmorphism design.

## Features

- **Voice Recording** - Real-time waveform visualisation during recording
- **AI Transcription** - Powered by OpenAI Whisper
- **Personalisation** - Learns from corrections and applies them automatically
- **History** - Browse and search past transcriptions
- **Authentication** - Google OAuth via Supabase

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript (Vanilla) |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth) |
| Storage | AWS S3 |
| Transcription | OpenAI Whisper API |

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- OpenAI API key
- Supabase project
- AWS S3 bucket (optional, for audio storage)

### Installation

```bash
git clone https://github.com/abiolafatunla/my-whisper.git
cd my-whisper/app
npm install

# Set up environment variables
cp .env.example .env
# Fill in your API keys in .env

npm start
```

The app runs at `http://localhost:3001`

## Security

I've set up a proper CI/CD pipeline with multiple layers of security scanning. The thing is, if you're building anything that handles user data and API keys, you need to be thorough about this.

| Layer | Tool | Purpose |
|-------|------|---------|
| SAST | CodeQL | Static code analysis |
| Secrets | Gitleaks | Prevents credential leaks |
| Dependencies | Trivy | Identifies vulnerable packages |
| AI Review | Claude Code Action | AI-powered security review |
| Runtime | Harden-Runner | Secures GitHub Actions runners |

### AI/LLM Security

Since this is an AI-powered app, I follow the [OWASP LLM Top 10](https://genai.owasp.org/) guidelines:

- User input is sanitised before being processed by the AI
- API keys are stored as environment variables, never committed
- Rate limiting is in place to prevent abuse
- Transcriptions are protected with Row Level Security

### Reporting Security Issues

If you find a security vulnerability, please email me directly rather than opening a public issue. I'll respond within 48 hours.

## Project Structure

```
my-whisper/
├── app/                    # Main application
│   ├── public/            # Frontend assets
│   ├── server.js          # Express server
│   └── services/          # Backend services
├── planning/              # Project documentation
└── .github/
    ├── workflows/         # CI/CD pipelines
    ├── dependabot.yml     # Auto dependency updates
    └── CODEOWNERS         # Review requirements
```

## Development

```bash
cd app
npm run dev  # Uses nodemon for auto-reload
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for Whisper | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 | Optional |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 | Optional |

## Contributing

If you want to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Open a Pull Request

All PRs go through automated security scanning (CodeQL, Trivy, Gitleaks) and AI-powered code review before merge.

## Licence

ISC

---

Built by Abiola Fatunla
