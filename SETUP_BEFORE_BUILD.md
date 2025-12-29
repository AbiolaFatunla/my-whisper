# Setup Before Build

Complete these steps before starting Claude in dangerously-skip-permissions mode.

## What You Need to Supply

### 1. Get Supabase Credentials

1. Go to [supabase.com](https://supabase.com) → Your project (already created: `vjimmmnexookthrdxrkz`)
2. Go to **Project Settings > API**
3. Copy these two values:

| Value | Where to Find |
|-------|---------------|
| `SUPABASE_URL` | Project URL (e.g., `https://vjimmmnexookthrdxrkz.supabase.co`) |
| `SUPABASE_ANON_KEY` | `anon` `public` key |

### 2. Get OpenAI API Key

You should already have this. If not:
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new key

### 3. Create the .env File

```bash
cd "/Users/abiolafatunla/Documents/Projects/my whisper/app"
cp .env.example .env
```

Then edit `app/.env` and fill in:

```env
SUPABASE_URL=https://vjimmmnexookthrdxrkz.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
OPENAI_API_KEY=sk-your-key-here
```

### 4. AWS Credentials

Already exist in `voice-recording-app-main/voice-recording-api-user_accessKeys.csv`. Claude will use this.

---

## What Claude Will Do

| Task | Who Does It |
|------|-------------|
| Create database tables | Claude (via Supabase MCP) |
| Apply RLS policies | Claude (via Supabase MCP) |
| Build the app | Claude |
| Configure Google OAuth | **You** (in Phase 5, when ready to test auth) |

---

## Google OAuth (Deferred to Phase 5)

You don't need to set this up now. When you're ready to test authentication:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create OAuth credentials (Web application)
3. Add redirect URI: `https://vjimmmnexookthrdxrkz.supabase.co/auth/v1/callback`
4. In Supabase: **Authentication > Providers > Google** — paste Client ID and Secret

The app will be built and ready; auth just won't work until you do this.

---

## Checklist

- [ ] `app/.env` file created with:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `OPENAI_API_KEY`

That's it. Everything else, Claude handles.

---

## Start the Build

```bash
cd "/Users/abiolafatunla/Documents/Projects/my whisper"
claude --dangerously-skip-permissions
```

Then tell Claude:
> Read CLAUDE.md and progress.txt, then start building Phase 1.
