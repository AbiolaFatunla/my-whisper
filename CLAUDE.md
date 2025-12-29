# CLAUDE.md - Project Instructions

## Project Overview

You are building **My Whisper** — a personal voice dictation app with AI-powered transcription and personalization (learning from corrections).

## Key Documents

| Document | Purpose |
|----------|---------|
| `planning/UNIFIED_SPEC.md` | **THE SPEC** — Complete specification of what to build |
| `planning/PRD.md` | Original PRD (reference only, UNIFIED_SPEC supersedes) |
| `progress.txt` | **YOUR TRACKING FILE** — Update this as you work |
| `voice-recording-app-main/` | **EXISTING CODE** — Working app to reference and adapt |

## Available MCP Servers

### Supabase MCP
You have direct access to the Supabase project via MCP. Use it to:
- **Create database tables** — Run the SQL from UNIFIED_SPEC.md Section 4.2
- **Apply RLS policies** — Run the RLS SQL from UNIFIED_SPEC.md Section 4.2
- Query and verify data is being saved correctly
- Debug authentication issues

**IMPORTANT: At the start of Phase 1**, use the Supabase MCP to create the `transcripts` and `corrections` tables and apply RLS policies. The SQL is in `planning/UNIFIED_SPEC.md` Section 4.2.

---

## Critical Instructions

### 1. Read the Spec First
Before writing any code, read `planning/UNIFIED_SPEC.md` completely. It contains:
- What already exists (voice-recording-app-main)
- What needs to be added (personalization, history, auth)
- Data models, API endpoints, architecture
- Implementation phases

### 2. Create New Files in `/app`
- DO NOT modify files in `voice-recording-app-main/`
- CREATE new files in the `app/` folder
- You can reference and adapt code from voice-recording-app-main
- The goal is a fresh, clean implementation that incorporates the existing functionality

### 3. Use progress.txt
- Update `progress.txt` after completing each phase or major task
- This file persists across context windows
- Read it at the start of each session to know where you left off
- Format: checkboxes for tasks, notes for context

### 4. External Services

The following should already be configured:

| Service | Environment Variable |
|---------|---------------------|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| AWS S3 | Credentials in CSV file (same as voice-recording-app) |

### 5. Implementation Order

Follow the phases in UNIFIED_SPEC.md Section 8:

1. **Phase 1: Database Integration** — Set up Supabase, create tables
2. **Phase 2: History View** — Transcript persistence and history UI
3. **Phase 3: Editable Transcripts** — Edit and save functionality
4. **Phase 4: Personalization Engine** — Diff algorithm, corrections
5. **Phase 5: Authentication** — Google OAuth via Supabase
6. **Phase 6: Polish** — Error handling, UX improvements

### 6. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript (vanilla, like existing app) |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth) |
| Storage | AWS S3 (for audio files) |
| Transcription | OpenAI Whisper API |

### 7. What to Preserve from Existing App

- Recording UI (waveform, pulsing button)
- Glassmorphism design style
- Dark/light theme support
- Upload progress indicators
- Copy/download transcription features
- AI-generated titles (optional)

### 8. What to Add

- Supabase client integration
- User authentication (Google OAuth)
- Transcript persistence to database
- History page
- Editable transcript view
- Personalization system (corrections)
- Row Level Security for data isolation

## Running the App

```bash
cd app
npm install
npm start
```

Server runs on http://localhost:3001

## Testing

After each phase, manually test:
1. Can I record and transcribe? (Phase 1)
2. Do transcripts persist after refresh? (Phase 1-2)
3. Can I see history? (Phase 2)
4. Can I edit and save? (Phase 3)
5. Do corrections auto-apply? (Phase 4)
6. Can I sign in with Google? (Phase 5)

## Authorship & Voice

### Git Commits & Attribution
- **NEVER** use Anthropic or Claude attribution in commits
- **NEVER** include "Co-Authored-By: Claude" or similar
- Always use **Abiola Fatunla** as the author
- Keep commit messages clean and professional

### Writing Style
- For non-code content (documentation, commit messages, README, etc.), use the `abiolas-voice` skill
- Write in first person where appropriate
- Match the tone and style defined in the voice skill

---

## Notes

- Keep the existing app's look and feel
- User may change color scheme later — keep styles modular
- Prioritize working code over perfection
- Commit logical chunks of work
