# Build Spec — Pingo (Chinese) Clone, MVP

## What it is

A single-purpose web app: open it, the AI has already greeted you in Chinese,
press-and-hold the mic to talk back. It replies in spoken Chinese at your chosen
HSK level, shown as **Chinese + pinyin + English**, with a collapsible correction
on what you said. Turn-based (tap to talk), matching how Pingo actually works.

No scenarios in the MVP. One screen. Sign in once, then you're in.

## MVP scope (settled)

### Experience
- Sign in once (Clerk, allowlist — you + a friend or two, no public signup).
- Land directly on the single conversation screen; AI greeting already present.
- Large press-and-hold mic button, center. Charcoal at rest, still. While held,
  a soft pale-blue audio-reactive ring/waveform responds to voice volume — fluid
  but quiet, `transform`/`opacity` only, no glow, no color cycling.
- Corner controls: `HSK 3` tag → compact level picker (1–6); History icon →
  overlay of past transcripts; speaking-rate toggle (slow/normal); "New
  conversation".
- Transcript reads like a centered document: Chinese as editorial-serif hero
  (~28–32px), pinyin above in muted gray, English below smaller, correction in a
  collapsed pale-yellow inset.

### Per-turn pipeline (all keys server-side)
1. Browser MediaRecorder → **OpenAI `gpt-4o-transcribe`** (STT)
2. **DeepSeek V4** → structured JSON `{reply_zh, reply_en, correction}`; full
   conversation transcript resent each turn, no summarization; system prompt =
   "friendly Chinese tutor, short replies, restrict to HSK N vocab" + bundled
   cumulative HSK 1–6 word list (`drkameleon/complete-hsk-vocabulary`),
   prompt-cached; out-of-list words get a "⚠ above level" marker
3. **`pinyin-pro`** library converts `reply_zh` → pinyin (deterministic, not LLM)
4. **Azure Neural TTS** (`zh-CN-Xiaoxiao` / `zh-CN-Yunxi`), adjustable rate →
   audio played via `<audio>`

### Stack
- **Next.js on Vercel** — frontend + API routes as the secrets proxy, `git push`
  deploy, free tier
- **Neon** Postgres + **Drizzle** ORM — text only: user settings (HSK level),
  conversation transcripts. No audio blobs (TTS regenerated on replay).
- **Clerk** auth
- Web Audio API + `<audio>`, no voice libraries
- minimalist-ui aesthetic: warm off-white canvas (`#F7F6F3`), cards `#FFFFFF`,
  flat `1px solid #EAEAEA`, radius 8–12px, no drop shadows, Phosphor icons (bold
  weight), no emoji, muted-pastel semantic accents only (pale-green complete,
  pale-yellow "above level" / correction, pale-blue active recording)

### Cost
~$0.50–2/month at personal usage. Only real cost is OpenAI STT (~$0.006/min);
Azure TTS within free tier; DeepSeek negligible.

---

## Buildable units

| #  | Unit | What's in it |
|----|------|--------------|
| 0  | **Skeleton + deploy pipeline** | Next.js app, one page, Vercel project, env-var plumbing, `git push` → live URL. Vercel Deployment Protection on so the dev URL isn't open while auth doesn't exist yet. |
| 1  | **Text conversation loop** (dev harness) | Typed input → `/api/chat` → DeepSeek → structured JSON `{reply_zh, reply_en, correction}` → transcript renders Chinese + pinyin (`pinyin-pro`) + English + collapsible correction. HSK hardcoded. Kept behind a dev flag afterwards. |
| 2  | **HSK level control** | Bundle HSK 1–6 lists, inject cumulative list per level into system prompt with prompt caching, corner picker, "⚠ above level" word marker, selection persisted (localStorage for now). |
| 3  | **Voice input (STT)** | Press-and-hold mic → MediaRecorder → `/api/transcribe` → OpenAI `gpt-4o-transcribe` → feeds the Unit 1 loop. Size/duration caps. |
| 4  | **Voice output (TTS)** | `reply_zh` → `/api/speak` → Azure Neural → `<audio>` autoplay on send gesture, per-turn replay button, slow/normal rate toggle. |
| 5  | **The one screen + Siri mic** | minimalist-ui layout, document-style transcript, charcoal mic circle, pale-blue audio-reactive ring while recording (AnalyserNode → transform/opacity), still at idle, responsive to 400px. |
| 6  | **Auth (Clerk)** | Clerk added, middleware protects all pages + API routes, public signup disabled, email allowlist, server-side `userId ∈ ALLOWLIST` check on every route. Remove Vercel Deployment Protection. |
| 7  | **Persistence (Neon + Drizzle)** | Schema: `settings`, `conversations`, `turns`. Save each turn, reload on open, greeting seeded server-side, HSK setting moves localStorage → DB, retention cap (~50 convos/user). |
| 8  | **History overlay + conversation lifecycle** | History icon → panel of past sessions (date in mono) → tap to open read-only. "New conversation" button. ~25-turn cap forces a new conversation. |
| 9  | **Rate limiting + spend guard** | `usage_log` table, per-minute (10) + per-day (100) count checks before provider calls → clean 429 state. Input caps enforced (audio ≤60s / ≤1MB, text ≤~500 chars). Provider billing caps set in OpenAI/Azure dashboards (checklist). |
| 10 | **Hardening + ship** | Error/loading states for every failure path (mic denied, STT fail, timeout, offline), bundle check for leaked secrets, `npm audit`, preview-vs-prod env split, README. |

---

## Build order & rationale

**0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**

- **0 first, always** — deploy pipeline before features so integration problems
  surface early.
- **1–2 before voice** — the brain (HSK-constrained output quality, structured
  JSON, pinyin correctness) is the biggest *quality* unknown. Prove it with the
  cheapest harness (typed input) before adding voice complexity on top. The typed
  harness stays as a dev tool behind a flag.
- **3–4 next** — the browser mic round-trip and audio playback are the biggest
  *technical* unknowns. Layer them onto a loop that already works.
- **5** — once the pipeline is real, make it feel right.
- **6 before 9** — rate limiting is per-user, so auth has to exist first. Vercel
  Deployment Protection covers the open-URL gap until here.
- **7 before 8** — history needs stored conversations.
- **9 then 10** — limits, then polish and lock down.

If nervous about API spend during dev: set the provider billing caps (the Unit 9
checklist part) on day one regardless of order — it's dashboard clicks, not code.

---

## Done criteria

**0 — Skeleton + deploy pipeline**
Pushing to `main` produces a live URL. Env vars readable server-side, absent from
the client bundle. Dev URL requires the Vercel protection password.

**1 — Text conversation loop**
In the browser you hold a typed Chinese conversation. Every AI turn shows correct
Chinese, correct pinyin (spot-check tricky heteronyms: 还 / 得 / 长 / 银行),
English, and a correction line that expands/collapses. Malformed model output is
caught, not rendered as a crash.

**2 — HSK level control**
Setting HSK 1 vs HSK 5 visibly changes vocabulary difficulty in replies. Picker
choice survives reload. Words outside the selected level's list render with the
marker. Repeated turns don't re-bill the full word list (prompt cache hit
confirmed in DeepSeek usage).

**3 — Voice input (STT)**
Hold mic, speak a Chinese sentence, release → your words appear as your turn
within ~3s and the AI responds. Works in current Chrome and Safari (desktop +
iOS). Audio over 60s or 1 MB is rejected client-side before upload. Mic-permission
denial shows a message, not a dead button.

**4 — Voice output (TTS)**
AI replies play aloud automatically on send. Replay button re-plays any past AI
turn. Slow/normal toggle audibly changes speaking rate. No audio autoplay-blocked
errors (playback is triggered by the send gesture).

**5 — The one screen + Siri mic**
Screen matches the minimalist-ui direction (warm canvas, flat 1px borders, no
shadows, serif Chinese hero, Phosphor icons, no emoji). Mic ring animates
smoothly with voice volume at 60fps and is completely still when idle. Layout
holds from 400px to desktop with a ≥16px gutter, no horizontal scroll.

**6 — Auth (Clerk)**
Signed-out users see only the sign-in screen. A Clerk user whose ID isn't in the
allowlist gets rejected by every API route (verified by test). You sign in and
use the app normally. Public sign-up is off in the Clerk dashboard.

**7 — Persistence (Neon + Drizzle)**
Refresh mid-conversation → transcript is still there. HSK setting set on one
device shows on another. Creating a 51st conversation prunes the oldest. Every DB
query is filtered by `userId` (verified: user A's ID cannot fetch user B's
transcript).

**8 — History overlay + conversation lifecycle**
History panel lists past conversations by date, newest first; tapping one opens it
read-only. "New conversation" archives the current one and seeds a fresh greeting.
At 25 turns the input is disabled with a "start a new conversation" prompt.

**9 — Rate limiting + spend guard**
11 turns in a minute, or 101 in a day → a clean "slow down" state, no provider
call made. Oversized/overlong audio and >500-char text are rejected server-side
with a clear error. OpenAI and Azure each have a confirmed hard spending cap;
DeepSeek balance is low and prepaid.

**10 — Hardening + ship**
Every failure path (mic denied, STT failure, DeepSeek timeout, TTS failure,
offline, rate-limited) shows a recoverable UI state, never a blank screen or
unhandled rejection. `npm audit` clean of high/critical. Production and preview
use separate env values. You use the deployed app for a week without a code
change.

---

## Security & rate-limiting notes (feeds Units 6 & 9)

**Threat model:** app is behind Clerk auth with a 2–3 person allowlist. Not
public. Real risks: (1) cost/billing abuse, (2) leaked API keys, (3) unbounded
inputs, (4) one authed user reading another's data. Everything else is hygiene.

**Cost abuse — defense in depth, outermost first**
- Provider billing caps (work even if code is broken): OpenAI hard usage limit,
  Azure budget + spending cap, DeepSeek prepaid balance is the ceiling. ~$10/mo
  each. Set day one.
- Clerk: disable public sign-up, use the built-in email allowlist, then re-check
  server-side (`userId ∈ ALLOWLIST` env var) on every API route.
- Per-user rate limit on the conversation route.
- Input caps: audio ≤ 60s and ≤ 1 MB (reject before it hits OpenAI); transcribed
  text ≤ ~500 chars; cap turns per conversation at ~25 (the "resend full
  transcript, no summarization" choice makes per-turn token cost grow with
  history — cap it).

**API key handling**
- All three keys are server-only env vars in Vercel. Never `NEXT_PUBLIC_*`, never
  in a response body, never in client logs.
- Every provider call goes through a Next.js API route.
- Separate Vercel preview vs production env values (or give preview no keys).
- `.env` in `.gitignore`.

**Per-user data isolation**
- Every Neon query filtered by `userId` (Clerk `sub`) as a mandatory WHERE.
- `userId` NOT NULL FK on every table; no "get by id" without ownership check.
- Retention cap (~50 conversations/user).

**Injection / XSS**
- Prompt injection: low stakes — model has no tools, no DB access. Worst case it
  breaks character. Keep system prompt firm; don't feed model output anywhere
  privileged.
- XSS: React escapes by default. Never `dangerouslySetInnerHTML` the
  Chinese/pinyin/correction fields.
- Audio upload: validate `content-type`, enforce size cap, stream straight to
  OpenAI, never persist raw audio.

**Hygiene**
- Clerk middleware protects all routes + pages by default (allowlist `/` and
  static assets only).
- API routes are POST, same-origin; Clerk session cookies are
  `HttpOnly`/`Secure`/`SameSite` — CSRF covered; optionally check `Origin`.
- Don't log full transcripts or audio to Vercel logs. Log userId + route + token
  count only.
- Keep dependency list tiny (drizzle, pinyin-pro, clerk sdk, provider SDKs).
- `npm audit` / Dependabot on the repo.

**Rate limiting — concrete design**

| Layer | Mechanism | Limit |
|-------|-----------|-------|
| Provider billing caps | OpenAI / Azure dashboard, DeepSeek prepaid balance | ~$10/mo each |
| Per-user request limit | row-count in Neon `usage_log` (sliding window), or `@upstash/ratelimit` + Upstash Redis | 10 turns / minute |
| Per-user daily cap | count `usage_log` rows in last 24h before allowing | 100 turns / day |

Vercel functions are stateless, so an in-memory counter resets on cold start —
the counter must live in Neon (or Upstash). Neon-only is the lazy call; add
Upstash only if the per-minute query cost ever shows up.

**Deliberately skipped:** WAF/DDoS beyond Vercel's built-in, CAPTCHA, secrets
manager, audit logging, intrusion detection, pen testing, extra at-rest
encryption beyond Neon's default.

---

## Deferred to post-MVP (roadmap, not cut)

Ordered scenarios + target phrases + completion tracking → pronunciation / tone
scoring → cross-session memory → SRS / flashcards → streaks / stats / dashboards →
public multi-user signup → audio storage → native app → offline → handwriting
practice → typed-input mode as a first-class feature.
