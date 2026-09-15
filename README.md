# hao.AI

A spoken Mandarin Chinese conversation practice app. You speak (or type) to
an AI tutor, get a reply in character at your chosen HSK level (1–6), shown
as Chinese characters, pinyin, and an English translation and spoken aloud —
turn by turn, with a correction of your own Chinese offered after each reply.

Product definition: `context/project-overview.md`. Architecture and invariants:
`context/architecture.md`. Build plan: `context/feature-spec/build-spec.md`.
Current status: `context/progress-tracker.md`.

## Features

- Press-and-hold voice input (or typed text) via the browser's MediaRecorder API
- Speech-to-text, conversation reply, and text-to-speech on every turn
- Deterministic pinyin (not model-generated), HSK-level-constrained vocabulary
- Collapsible correction of the user's Chinese each turn
- Conversation history with auto-generated titles, read-only playback, delete
- Light/dark theme
- Per-user rate limiting, provider call timeouts, and spend caps

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, Turbopack), React, TypeScript |
| Auth | Clerk |
| Database | Postgres (Neon) via Drizzle ORM |
| Speech-to-text | Groq (`whisper-large-v3-turbo`) |
| Conversation + titles | DeepSeek |
| Text-to-speech | ElevenLabs |
| Pinyin | `pinyin-pro` |
| UI | Radix primitives, custom CSS token system, Phosphor icons |
| Deployment | Vercel |
| Tests | Vitest |

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
npm test        # vitest
```

Copy `.env.example` to `.env.local` and fill in your own keys (`.env*` is
git-ignored): DeepSeek, Groq, ElevenLabs, Clerk, a Neon `DATABASE_URL`, and a
`CRON_SECRET` for the usage-cleanup cron route.

## Deploy

Push to `main` → Vercel builds and updates the production URL. A daily Vercel
Cron job (`vercel.json`) prunes expired rate-limit records.
