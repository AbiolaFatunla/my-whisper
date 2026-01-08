# My Whisper - Portfolio Analysis

A comprehensive technical analysis for portfolio presentation, CV writing, and professional evaluation.

---

## 1. Executive Summary

**Project:** My Whisper
**Type:** AI-Powered Voice Transcription Platform with Adaptive Learning
**Role:** Sole Developer (Full-Stack, Infrastructure, AI Integration)
**Status:** Production (Live at mywhisper.live)

**One-liner:** Built a serverless voice transcription platform that learns from user corrections, integrating multiple AI models with a custom phrase-matching algorithm.

---

## 2. Project Timeline

| Milestone | Date | Description |
|-----------|------|-------------|
| Project Start | 29 Dec 2025 | Initial commit, core architecture |
| Infrastructure Complete | 30 Dec 2025 | Terraform IaC, Lambda deployment, CI/CD pipeline |
| History & Playback | 30 Dec 2025 | Transcript persistence, audio playback, share functionality |
| Personalisation Engine | 31 Dec 2025 | LCS-based diff algorithm, correction learning |
| Authentication | 31 Dec 2025 | Google OAuth, anonymous user isolation |
| AI Business Analyst Feature | 1-4 Jan 2026 | Voice-driven requirements gathering tool |
| Admin Dashboard | 4 Jan 2026 | Session management, access code system |
| Latest Update | 5 Jan 2026 | Dependency updates, UI polish |

**Development Duration:** 8 days (rapid prototyping to production)
**Total Commits:** 50
**Primary Author Commits:** 47 (94%)

---

## 3. Technical Architecture

### Platform Architecture

```
                                PRODUCTION ENVIRONMENT
    ┌─────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │   ┌──────────────┐                    ┌──────────────────────────┐  │
    │   │   VERCEL     │                    │   AWS (eu-west-2)        │  │
    │   │   CDN        │ ────── /api/* ───> │                          │  │
    │   │              │                    │  ┌────────────────────┐  │  │
    │   │  Static      │                    │  │   API Gateway      │  │  │
    │   │  Assets      │                    │  │   (HTTP API)       │  │  │
    │   │  (7 pages)   │                    │  └─────────┬──────────┘  │  │
    │   └──────────────┘                    │            │             │  │
    │                                       │            ▼             │  │
    │                                       │  ┌────────────────────┐  │  │
    │                                       │  │   Lambda           │  │  │
    │                                       │  │   (Node.js 20)     │  │  │
    │                                       │  │   23 endpoints     │  │  │
    │                                       │  └─────────┬──────────┘  │  │
    │                                       │            │             │  │
    │                                       │            ▼             │  │
    │                                       │  ┌────────────────────┐  │  │
    │                                       │  │   S3 Bucket        │  │  │
    │                                       │  │   (Private)        │  │  │
    │                                       │  │   90-day lifecycle │  │  │
    │                                       │  └────────────────────┘  │  │
    │                                       └──────────────────────────┘  │
    │                                                                      │
    │   ┌──────────────────────────────────────────────────────────────┐  │
    │   │                    EXTERNAL SERVICES                          │  │
    │   │                                                               │  │
    │   │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │  │
    │   │   │   Supabase   │    │   OpenAI     │    │   OpenAI     │   │  │
    │   │   │   PostgreSQL │    │   Whisper    │    │   GPT-4o     │   │  │
    │   │   │   + Auth     │    │   (STT)      │    │   (LLM)      │   │  │
    │   │   │   + RLS      │    │              │    │              │   │  │
    │   │   └──────────────┘    └──────────────┘    └──────────────┘   │  │
    │   └──────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────┘
```

### Tech Stack Table

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | HTML5/CSS3/JavaScript | ES2022 | Vanilla JS, no framework overhead |
| **Design** | Glassmorphism | - | Frosted glass aesthetic, dark/light themes |
| **Backend** | AWS Lambda | Node.js 20 | Serverless API, 23 endpoints |
| **API Gateway** | AWS HTTP API | v2 | CORS, routing, HTTPS |
| **Database** | Supabase PostgreSQL | - | 4 tables with RLS |
| **Storage** | AWS S3 | - | Private bucket, versioned, encrypted |
| **Auth** | Supabase Auth | - | Google OAuth + anonymous users |
| **AI - STT** | OpenAI Whisper | whisper-1 | Speech-to-text transcription |
| **AI - LLM** | OpenAI GPT | gpt-4o-mini | Title generation, BA conversations |
| **IaC** | Terraform | - | AWS resource provisioning |
| **CI/CD** | GitHub Actions | - | 6 workflows (build, deploy, security) |
| **Security** | CodeQL, Trivy, Gitleaks | - | SAST, dependency scanning, secrets detection |

### Key Dependencies

| Package | Purpose |
|---------|---------|
| @aws-sdk/client-s3 | S3 operations (upload, download, presigned URLs) |
| @aws-sdk/s3-request-presigner | Secure client-side uploads |
| @supabase/supabase-js | Database operations, authentication |
| openai | Whisper transcription, GPT interactions |
| express | Local development server |
| express-rate-limit | API protection |

---

## 4. Quantifiable Metrics

### Codebase Statistics

| Metric | Count |
|--------|-------|
| **Total Source Files** | 30 |
| **Lines of Code (JS)** | 8,857 |
| **Lines of CSS** | 2,428 |
| **Lines of Terraform** | 398 |
| **HTML Pages** | 7 |
| **Frontend JS Modules** | 10 |
| **Backend Service Files** | 2 |
| **Lambda Handler** | 1 (consolidated) |

### API Endpoints

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Core Transcription** | 4 | Upload, transcribe, proxy, health |
| **Transcript Management** | 4 | List, get, update, delete |
| **Share System** | 2 | Public share page, share data |
| **BA Feature** | 8 | Validate, session, chat, generate |
| **Admin Dashboard** | 5 | Access codes, sessions management |
| **Total** | **23** | |

### Database Schema

| Table | Columns | Purpose |
|-------|---------|---------|
| `transcripts` | 10 | User recordings and transcriptions |
| `corrections` | 8 | Learned phrase corrections |
| `ba_sessions` | 12 | AI BA conversation sessions |
| `ba_access_codes` | 6 | Client access management |

### Infrastructure

| Resource | Configuration |
|----------|---------------|
| Lambda | 512MB RAM, 90s timeout |
| S3 | Versioned, SSE, 90-day lifecycle |
| API Gateway | HTTP API v2, CORS enabled |
| CloudWatch | 14-day log retention |
| Terraform Files | 8 resource definitions |

### CI/CD Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| ci.yml | Push/PR | Build, lint, smoke test |
| deploy.yml | Push to main | Lambda deployment |
| codeql.yml | Weekly + push | Static code analysis |
| trivy.yml | Daily + push | Dependency/IaC scanning |
| secrets-scan.yml | Push | Gitleaks secrets detection |
| dependabot.yml | Weekly | Automated dependency updates |

---

## 5. Feature Domains

### Voice Transcription Platform

| Feature | Technical Implementation |
|---------|-------------------------|
| Browser Recording | MediaRecorder API with waveform visualisation |
| Cloud Upload | S3 presigned URLs for secure direct upload |
| AI Transcription | OpenAI Whisper API integration |
| AI Title Generation | GPT-4o-mini for smart naming |
| Recording Limit | 15-minute max with auto-stop |

### Personalisation Engine

| Feature | Technical Implementation |
|---------|-------------------------|
| Correction Learning | LCS-based phrase extraction algorithm |
| Auto-application | Corrections apply after threshold (count >= 2) |
| Word-boundary Matching | Regex-based replacement with boundaries |
| User Isolation | Per-user correction dictionaries |

### History & Playback

| Feature | Technical Implementation |
|---------|-------------------------|
| Transcript Persistence | Supabase with RLS policies |
| Audio Playback | S3 proxy endpoint for CORS compliance |
| Desktop Layout | Side-by-side recording + history |
| Share System | Public endpoint with OG tags for social |

### Authentication System

| Feature | Technical Implementation |
|---------|-------------------------|
| Google OAuth | Supabase Auth provider |
| Anonymous Users | Browser UUID with localStorage |
| Data Isolation | Row Level Security policies |
| Trial Limit | 2 recordings for anonymous users |

### AI Business Analyst Tool

| Feature | Technical Implementation |
|---------|-------------------------|
| Voice Conversations | Whisper + GPT-4o-mini chat |
| Coverage Tracking | 6 section progress indicators |
| Document Generation | Structured markdown output |
| Admin Dashboard | Session management, access codes |

---

## 6. Database Architecture

### Schema Design

```sql
-- Core transcription data
transcripts (
  id TEXT PRIMARY KEY,           -- tr_[uuid]
  user_id UUID NOT NULL,         -- Links to auth.users
  raw_text TEXT NOT NULL,        -- Original Whisper output
  personalized_text TEXT,        -- After corrections applied
  final_text TEXT,               -- After user edits
  audio_url TEXT,                -- S3 path
  duration_seconds INTEGER,
  title TEXT,                    -- AI-generated
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Personalisation learning
corrections (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  original_token TEXT NOT NULL,  -- What Whisper said
  corrected_token TEXT NOT NULL, -- What user changed it to
  count INTEGER DEFAULT 1,       -- Times seen
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  disabled BOOLEAN DEFAULT FALSE
)

-- BA feature tables
ba_sessions (...)                -- Conversation sessions
ba_access_codes (...)            -- Client access control
```

### Security Model

| Policy | Implementation |
|--------|----------------|
| User Isolation | `auth.uid() = user_id` on all tables |
| Anonymous Access | Lambda handles auth header extraction |
| Public Share | Specific endpoint bypasses RLS |
| Admin Access | Email allowlist for BA admin |

---

## 7. Development Methodology

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Serverless (Lambda) | Pay-per-use, auto-scaling, no idle costs |
| Private S3 | Security over convenience, SDK access |
| Vanilla JS | No framework overhead, fast load times |
| Terraform IaC | Reproducible, version-controlled infrastructure |
| Split Architecture | Frontend CDN + API Lambda = optimal performance |

### Patterns Used

| Pattern | Application |
|---------|-------------|
| Presigned URLs | Secure client-side S3 uploads |
| Audio Proxy | CORS-compliant playback from private bucket |
| JWT Extraction | Auth header parsing for user identification |
| LCS Diff | Longest Common Subsequence for correction extraction |
| Event-driven | Native Lambda handler (no Express wrapper) |

### Quality Assurance

| Practice | Implementation |
|----------|----------------|
| Static Analysis | CodeQL weekly + on push |
| Dependency Scanning | Trivy for CVE detection |
| Secrets Detection | Gitleaks pre-commit protection |
| Automated Updates | Dependabot for dependency freshness |
| OWASP LLM | Input sanitisation, rate limiting |

---

## 8. Technical Challenges & Solutions

### Challenge 1: Private S3 Audio Playback

**Problem:** Browser audio player can't access private S3 objects due to CORS and authentication.

**Solution:** Created `/api/audio-proxy` endpoint that streams audio through Lambda using AWS SDK. The proxy fetches from S3 server-side and pipes the response to the client with appropriate CORS headers.

**Impact:** Maintains security (no public bucket) while enabling seamless audio playback.

---

### Challenge 2: Correction Extraction Algorithm

**Problem:** Simple word-diff produces too many false positives. Need to identify meaningful corrections, not just typos.

**Solution:** Implemented LCS (Longest Common Subsequence) algorithm to find stable anchor points in text, then extracted changes between anchors. Added word-boundary matching to prevent partial word replacements.

**Impact:** Corrections only apply when the exact phrase appears, preventing "lot" in "parking lot" from being replaced when "lot" was corrected elsewhere.

---

### Challenge 3: Authentication Race Condition

**Problem:** On page load, `loadHistory()` was executing before `init()` completed, causing auth headers to be missing.

**Solution:** Created `bootstrap()` function that properly awaits `init()` before any data fetching. Ensured auth state is fully resolved before dependent operations.

**Impact:** Cross-device history now loads correctly on first visit.

---

### Challenge 4: Social Share OG Tags

**Problem:** Share links showed generic metadata in WhatsApp/Twitter previews instead of actual recording title.

**Solution:** Created `/api/share-page/:id` endpoint that returns HTML with dynamic OG tags. Social crawlers receive proper metadata, then JavaScript redirects users to the full share page.

**Impact:** Shared recordings display correct title and transcript snippet in social media previews.

---

## 9. Portfolio-Ready Descriptions

### One-liner (LinkedIn Headline)

> Built an AI voice transcription platform with adaptive learning, integrating OpenAI Whisper with a custom phrase-matching algorithm that learns from user corrections.

---

### Short (CV Bullet Point)

> Designed and deployed a serverless voice transcription platform using AWS Lambda, S3, and Supabase. Integrated OpenAI Whisper for speech-to-text with a custom LCS-based correction algorithm that learns from user edits. Built with Terraform IaC, GitHub Actions CI/CD, and comprehensive security scanning.

---

### Medium (Portfolio Card)

**My Whisper** is a voice transcription platform I built to solve a personal problem: transcription tools don't learn from corrections. Every time Whisper mishears "cafe" as "Jeff", I'd fix it manually. Why can't the system remember?

So I built one that does.

**Key Technical Highlights:**
- Serverless architecture: Vercel CDN + AWS Lambda + Supabase PostgreSQL
- AI integration: OpenAI Whisper (STT) + GPT-4o-mini (title generation, conversational AI)
- Custom personalisation: LCS-based diff algorithm extracts corrections from edits
- Full CI/CD: GitHub Actions with CodeQL, Trivy, Gitleaks security scanning
- Infrastructure as Code: Terraform managing all AWS resources

**Numbers:** 23 API endpoints, 4 database tables, 8,857 lines of JavaScript, 8 days from concept to production.

---

### Long (Full Project Page)

**My Whisper** started with a simple frustration. I use voice transcription constantly for note-taking, but every tool I tried made the same mistakes. Whisper would mishear words specific to how I speak, and I'd correct them repeatedly. Why wasn't the system learning?

So I built a transcription platform that actually adapts to the user. When you correct a transcription error, the system remembers. Make the same correction twice, and from then on it auto-applies. Over time, the platform builds a personalised dictionary of your speech patterns.

The technical implementation involved some interesting problems. The correction extraction uses a Longest Common Subsequence algorithm to find stable anchor points in the text, identifying meaningful changes rather than random edits. Word-boundary matching ensures corrections only apply to exact phrase matches, preventing unwanted replacements.

The architecture is fully serverless. The frontend is vanilla JavaScript served from Vercel's CDN. No framework overhead, just fast static files. API calls route through AWS API Gateway to Lambda functions running Node.js 20. Audio files go to a private S3 bucket with presigned URLs for secure uploads. Supabase handles the database (PostgreSQL) and authentication (Google OAuth), with Row Level Security ensuring users only see their own data.

I built the entire infrastructure with Terraform, so it's version-controlled and reproducible. The CI/CD pipeline runs on GitHub Actions with comprehensive security scanning: CodeQL for static analysis, Trivy for dependency vulnerabilities, and Gitleaks for secrets detection. Dependabot keeps dependencies fresh.

Beyond the core transcription feature, I added an AI Business Analyst tool. It's a voice-driven interface for gathering software requirements. You have a conversation about what you want to build, and it generates structured documentation covering vision, users, features, business rules, data models, and priorities. This feature uses GPT-4o-mini for the conversational AI and includes an admin dashboard for managing client sessions.

The platform went from initial commit to production in 8 days. It's live, I use it daily, and it genuinely improves the more I use it.

---

## 10. Cost Profile

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| OpenAI Whisper | ~$0.50-1.00 | Based on usage |
| AWS Lambda | $0.00 | Free tier |
| AWS S3 | ~$0.05 | Few GB storage |
| AWS API Gateway | $0.00 | Free tier |
| Supabase | $0.00 | Free tier |
| Vercel | $0.00 | Free tier |
| **Total** | **~$0.50-1.50** | |

---

*Analysis generated: January 2026*
