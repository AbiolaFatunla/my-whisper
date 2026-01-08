# CLAUDE.md - Project Instructions

---

## ⛔ MANDATORY RULES — DO NOT SKIP

These rules are **non-negotiable** and must be followed without exception. Violating these rules is a critical failure.

### RULE 1: Always Use `progress.txt`

```
🚨 CRITICAL: You MUST read and update progress.txt
```

**AT THE START of every session:**
- [ ] Read `progress.txt` FIRST before doing anything else
- [ ] Understand what was completed and what's pending

**DURING work:**
- [ ] Update `progress.txt` after EVERY notable task completion
- [ ] Do NOT batch updates — write immediately after each task

**FORMAT:**
- Use checkboxes: `- [x]` for done, `- [ ]` for pending
- Keep entries SHORT (1 line per item)
- Include dates for major milestones

**WHY:** This file persists across context windows. Without it, work gets repeated or lost.

---

### RULE 2: Always Use My Voice for Non-Code Content

```
🚨 CRITICAL: You MUST use the `abiolas-voice` skill for ALL non-code writing
```

**APPLIES TO:**
- README files
- Documentation (*.md files)
- Commit messages
- PR descriptions
- Comments to users
- Any prose that represents me

**HOW:**
1. Before writing non-code content, invoke the `abiolas-voice` skill
2. Apply the voice/tone/style from that skill
3. Write in first person where appropriate

**DOES NOT APPLY TO:**
- Code files (*.js, *.css, *.html, etc.)
- Configuration files (*.yml, *.json, etc.)
- Inline code comments (these should be technical)

**WHY:** This is my project and my public presence. All writing must sound like me, not like a generic AI.

---

### RULE 3: Never Use Claude/Anthropic Attribution

```
🚨 CRITICAL: NEVER attribute work to Claude or Anthropic
```

- **NEVER** include "Co-Authored-By: Claude" in commits
- **NEVER** include AI attribution footers
- **ALWAYS** use **Abiola Fatunla** as the author
- Keep commit messages clean and professional

---

### RULE 4: No AI Punctuation Patterns

```
🚨 CRITICAL: Avoid punctuation that screams "AI wrote this"
```

**NEVER USE:**
- Em-dashes (—) - use commas or regular dashes (-) instead
- Semicolons where a full stop or comma would do
- Excessive colons before every list

**USE INSTEAD:**
- Commas for natural pauses
- Regular dashes (-) if separation is needed
- Full stops to keep sentences short

**WHY:** Em-dashes are a dead giveaway for AI text. Keep punctuation simple and human.

---

## Project Overview

You are building **My Whisper** — a personal voice dictation app with AI-powered transcription and personalization (learning from corrections).

## Key Documents

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | **DEPLOYMENT ARCHITECTURE** — How the system is deployed (Vercel + Lambda + Supabase) |
| `planning/UNIFIED_SPEC.md` | **THE SPEC** — Complete specification of what to build |
| `progress.txt` | **YOUR TRACKING FILE** — Update this as you work |
| `voice-recording-app-main/` | **EXISTING CODE** — Working app to reference and adapt |

## Available MCP Servers

### Supabase MCP
You have direct access to the Supabase project via MCP. Use it to:
- Query and verify data is being saved correctly
- Run SQL for schema changes or debugging
- Check RLS policies and authentication issues

### Chrome DevTools MCP
You have access to Chrome DevTools for testing the app. Use it to:
- Test locally at localhost:3001
- Test the deployed version on Vercel
- Take snapshots to see page structure
- Click elements, fill forms, test interactions
- Check console logs and network requests

**TIP:** If Chrome DevTools MCP fails with "browser already running", you may need to kill the existing Chrome process first. Look for the Chrome process using the DevTools profile and kill it before retrying.

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
⚠️ **See MANDATORY RULE 1 above** — this is non-negotiable.

Summary: Read at session start, update after every task, keep entries short.

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

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | HTML, CSS, JavaScript (vanilla) | Deployed to Vercel |
| API | AWS Lambda (Node.js 20) | Native handlers, no Express |
| Database | Supabase (PostgreSQL) | With RLS policies |
| Auth | Supabase Auth (Google OAuth) | Phase 5 |
| Storage | AWS S3 | Private bucket, SDK access |
| Transcription | OpenAI Whisper API | |
| IaC | Terraform | AWS resources |
| Local Dev | Express server | app/server.js |

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

## Notes

- Keep the existing app's look and feel
- User may change color scheme later - keep styles modular
- Prioritize working code over perfection
- Commit logical chunks of work

---

## Code Patterns

### Shared Components (Keep in Sync)

The following components are duplicated across `index.html` and `history.html`. If you modify one, update the other:

- **Player Modal** - Audio player with transcript display
- **Delete Modal** - Confirmation dialog for deleting recordings

Look for `<!-- SYNC: keep in sync with ... -->` comments in the HTML files.
