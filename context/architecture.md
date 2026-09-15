# hao.AI — Architecture

## Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Hosting / CI | Vercel | Builds on `git push`, serves the app, runs API route handlers as serverless functions, stores environment variables, separates preview and production environments. |
| Framework | Next.js (App Router) | Routing, React Server/Client Components, API route handlers under `app/api/*`, `middleware.ts` for auth gating. |
| Language | TypeScript (strict) | All application and infrastructure code. |
| UI rendering | React (Server + Client Components) | Server Components for the authenticated shell and initial transcript load; Client Components for recording, playback, and interactive controls. |
| Styling | Tailwind CSS + CSS custom properties | Utility styling; design tokens (color, type, spacing) defined once as CSS variables in `app/globals.css`. |
| UI primitives | Radix UI (`Popover`, `Dialog`, `Collapsible`) | Accessible behavior for the HSK picker, history overlay, and per-turn correction disclosure. No component library beyond these primitives. |
| Icons | Phosphor Icons (`@phosphor-icons/react`, bold weight) | All iconography. No other icon set. |
| Authentication | Clerk | Identity, session cookies, sign-in UI, `<UserButton>`, middleware helpers. |
| Database | Neon (serverless Postgres) | The single source of truth for all persistent state. |
| ORM / migrations | Drizzle ORM + `drizzle-kit` | Schema definition, typed queries, SQL migrations under `drizzle/`. |
| Speech-to-text | Groq (`whisper-large-v3-turbo`, OpenAI-compatible endpoint) | Converts a user audio clip to Chinese text. Called only from `app/api/transcribe`. Switched from OpenAI `gpt-4o-transcribe` on 2026-09-11 — OpenAI billing didn't work, a local-Whisper detour didn't fit Vercel serverless, and Azure AI Speech isn't available in the user's country. See progress-tracker.md for the full history. |
| Language model | DeepSeek V4 (OpenAI-compatible HTTP API) | Produces the tutor reply as structured JSON `{ reply_zh, reply_en, correction }`. Called only from `app/api/chat`. |
| Pinyin | `pinyin-pro` | Deterministic conversion of the model's Chinese text to pinyin, server-side. |
| Text-to-speech | ElevenLabs (`eleven_multilingual_v2`) | Converts `reply_zh` to spoken audio at natural speed; the client applies its own playback-rate multiplier (0.75x/1x/1.5x) afterward via `HTMLAudioElement.playbackRate` — ElevenLabs' own speed param is too narrow (hard-limited 0.7-1.2) for that range. Called only from `app/api/speak`. Switched from Azure Neural TTS on 2026-09-11 — Azure AI Speech isn't available in the user's country. Groq was ruled out first: its only TTS models don't support Mandarin at all. |
| Audio capture | Web Audio API + `MediaRecorder` | Press-and-hold recording; `AnalyserNode` drives the mic-button ring animation. |
| Audio playback | `HTMLAudioElement` | Plays TTS audio from a transient object URL. |
| Rate limiting | Postgres `usage_log` table (row-count windows) | Per-user 30/minute and 300/day checks (one shared bucket across all three provider-calling routes) before any provider call. |
| Secrets | Vercel environment variables | All provider keys; server-only, never `NEXT_PUBLIC_*`. |

## System boundaries

| Folder | Owns | Must not contain |
|--------|------|------------------|
| `app/` (pages) | Route structure, the conversation screen (`app/page.tsx`), the Clerk sign-in route (`app/sign-in/[[...sign-in]]/page.tsx`), server-side initial data loading. | Provider SDK calls, raw SQL, business rules. |
| `app/api/transcribe/` | Receiving an audio clip, enforcing audio size/duration caps server-side, calling Groq STT, returning transcript text. | LLM calls, TTS calls, persistence. |
| `app/api/chat/` | Building the system prompt, calling DeepSeek, parsing/validating its JSON, generating pinyin via `lib/pinyin`, persisting the turn pair, enforcing the 25-turn cap. (Above-level-word flagging was implemented then removed for inaccuracy — see progress-tracker.md.) | Audio handling, TTS calls. |
| `app/api/speak/` | Calling ElevenLabs TTS with the given text, returning audio bytes. No `rate` field — speaking rate is applied client-side via `HTMLAudioElement.playbackRate`. | LLM calls, persistence, transcript logic. |
| `app/api/settings/` | Reading and writing the user's HSK level setting. No provider calls. | LLM calls, TTS calls, transcript/turn logic. |
| `app/api/conversations/` | Listing conversations, loading one transcript, creating a new conversation (with seeded opening turn), archiving the current one, pruning past 50. | Provider calls. |
| `components/` | All React UI (transcript, turn, correction disclosure, mic button, HSK picker, history panel, rate toggle, error/loading states). Client Components only where interactivity requires it. | Any secret, any direct provider call, any DB access. |
| `lib/` | Server-only modules: `deepseek.ts`, `groq-stt.ts`, `elevenlabs-tts.ts`, `pinyin.ts`, `hsk.ts` (loads and slices the word lists), `ratelimit.ts`, `auth.ts` (wraps Clerk's `auth()`). Each provider module is the only place its key is read. | React components, JSX, client-imported code. |
| `db/` | `schema.ts` (Drizzle table definitions), `index.ts` (Neon client), `queries.ts` (every query function, each requiring `userId`). | Provider calls, request/response handling. |
| `drizzle/` | Generated SQL migrations. | Hand-edited schema logic. |
| `data/` | Static bundled HSK 1–6 word lists as JSON (from `drkameleon/complete-hsk-vocabulary`). Read-only at runtime. | Anything user-specific or mutable. |
| `types/` | Shared TypeScript types (`Turn`, `Conversation`, `ChatResponse`, `Settings`). | Runtime logic. |
| `middleware.ts` | Clerk route protection: everything requires a session except static assets and `/sign-in`. | Business logic. |
| `test/` | Automated tests, including one per API route asserting rejection of unauthenticated requests. | — |

## Storage model

### Database (Neon Postgres) — the only source of truth

| Table | Columns | Notes |
|-------|---------|-------|
| `settings` | `user_id` (PK, text, Clerk ID), `hsk_level` (int 1–6), `updated_at` (timestamptz) | One row per user. Built in Unit 7a/7b. No `speaking_rate` column — the per-message rate control (`turnRates` client-only React state) replaced the single app-wide rate toggle before this table was built, so there is no per-user rate to persist. |
| `conversations` | `id` (PK, uuid), `user_id` (text, not null), `status` (`'active' \| 'archived'`), `created_at` (timestamptz) | Partial unique index `conversations_one_active_per_user` on `user_id` where `status = 'active'` — enforces invariant 12 at the DB level, not just by caller discipline. |
| `turns` | `id` (PK, uuid), `conversation_id` (fk, not null), `user_id` (text, not null), `role` (`'user' \| 'ai'`), `text_zh` (text), `pinyin` (text, null for user turns until transcribed), `text_en` (text, null for user turns), `correction` (text, nullable), `correction_pinyin` (text, nullable), `created_at` (timestamptz) | Ordered by `created_at`. Max 25 per conversation. No `above_level_words` column — that feature was removed before shipping (see progress-tracker.md). |
| `usage_log` | `id` (PK, uuid), `user_id` (text, not null, indexed), `route` (text), `created_at` (timestamptz, indexed) | Append-only. Rows older than 24h may be deleted by an opportunistic cleanup on write. |

Dates are stored as `timestamptz` and serialized to the client as ISO 8601 UTC strings.

The `neon-http` driver (see "Provider inventory") has no interactive
(`BEGIN`/`COMMIT`-across-round-trips) transactions — every write below that
must be atomic ("in the same transaction", invariants 9/10/12) runs through
Drizzle's `db.batch([...])`, which Neon executes as one atomic HTTP call.

### File / blob storage — none

There is no object store. User audio recordings are never written anywhere; they exist only as an in-flight request body streamed to Groq. TTS audio is never stored; it is regenerated from `text_zh` via `app/api/speak` on every play and replay.

### Cache

| Cache | Location | Contents | Lifetime |
|-------|----------|----------|----------|
| Prompt cache | DeepSeek (provider-side, automatic) | The stable system-prompt prefix containing the HSK word list | Managed by DeepSeek; the app guarantees a byte-identical prefix so hits occur. |
| Transcript state | Browser memory (React state) | The current conversation's turns | Page lifetime; authoritative copy is in Postgres. |
| TTS object URL | Browser memory (`URL.createObjectURL`) | One AI turn's audio | Revoked after playback; recreated on replay. |
| HSK setting fallback | ~~`localStorage`~~ | Removed at Unit 7b — `hsk_level` is now read/written through `/api/settings`, backed by Postgres. | — |

## Auth and access model

### Authentication

- Clerk owns identity. Sign-in/sign-up is Clerk's hosted component at `/sign-in` (email or Google). Public sign-up is left **open** in the Clerk dashboard — anyone can create an account; there is no allowlist.
- `middleware.ts` runs Clerk middleware and requires a valid session for every path except static assets and `/sign-in`. Unauthenticated requests to pages are redirected to sign-in; to API routes, they receive `401`.
- Session state is Clerk's `HttpOnly` / `Secure` / `SameSite` cookies. The app stores no session data itself.

### Authorization

- `lib/auth.ts` exports `requireUser()` which calls Clerk's `auth()` and throws a `401` response if there is no session. It returns the Clerk `userId` for callers that need to scope data by it.
- Every API route handler calls `requireUser()` as its first statement, before reading the body, touching the database, or calling a provider.
- No allowlist check exists anywhere — any authenticated user may use the app. Cost exposure from open sign-up is bounded by the per-user rate limits (Unit 9) and provider billing caps, not by gating who can sign up.

### Ownership

- `user_id` (the Clerk ID) is a non-null column on `settings`, `conversations`, `turns`, and `usage_log`.
- Every function in `db/queries.ts` takes `userId` as a required parameter and includes `eq(table.user_id, userId)` in its `where` clause. There is no query function that fetches a row by `id` alone.
- Loading a conversation transcript filters by both `conversation_id` and `user_id`; a mismatch returns empty, not another user's data.

## AI and background task model

- **No background jobs, queues, cron, or workers.** Every unit of work completes synchronously within one API request/response.
- **Client-orchestrated pipeline.** For one conversational turn the browser makes three sequential calls, updating the UI between each:
  1. `POST /api/transcribe` — audio in, Chinese text out (Groq Whisper).
  2. `POST /api/chat` — transcript in; DeepSeek reply parsed to `{ reply_zh, reply_en, correction }`, pinyin generated (including `correctionPinyin`), turn pair persisted; structured turn out.
  3. `POST /api/speak` — `reply_zh` in, audio bytes out (ElevenLabs); rate is applied client-side, not sent to the route.
- **Why three routes, not one.** Keeps each serverless function small and within timeout, lets the transcript update incrementally, and isolates each provider key to a single route.
- **Structured output.** `app/api/chat` requests JSON from DeepSeek and validates the parsed object against the `ChatResponse` type. On malformed JSON it retries once; a second failure returns a `502` and no turn is persisted.
- **No streaming.** Replies are delivered whole. TTS is a single non-streaming request.
- **System prompt assembly.** `lib/hsk.ts` returns the cumulative word list for the selected level. `app/api/chat` composes the prompt as a fixed prefix (persona + rules + word list) followed by the per-conversation transcript, so the prefix is byte-identical across turns and DeepSeek prompt caching applies.
- **Rate check.** Before calls 1, 2, and 3 (transcribe, chat, speak), the route makes no provider call until `lib/ratelimit.ts` confirms the user has fewer than 30 `usage_log` rows in the last minute and 300 in the last day, counted across all routes combined (one shared bucket per user, not per route). All three routes record a row on pass, one row per provider call. The limits are set to 3x the turn-level target (10/minute, 100/day) so that a voice turn — transcribe + chat + speak, three calls — still allows the full 10 voice turns per minute; a typed turn (chat + speak, two calls) allows up to 15 per minute.

## Invariants

1. **No secret leaves the server.** Provider API keys are read only inside `lib/` server modules and `app/api/*` handlers. No secret is prefixed `NEXT_PUBLIC_`, imported into a Client Component, or included in any response body or client-visible log.
2. **Every API route authenticates first.** Each handler under `app/api/*` calls `requireUser()` (Clerk `auth()`) as its first statement, before reading the request body, querying the database, or calling any provider. A route without this check must not merge.
3. **Every database access is scoped by `user_id`.** No function in `db/queries.ts` accepts a row `id` without also requiring the owning `user_id` in the same `where` clause. Cross-user reads are impossible by construction, not by convention.
4. **User audio is never persisted.** Recorded audio is not written to the database, disk, Vercel storage, or any third-party store. It exists only as the streamed body of a single request to the transcription API and is discarded when that request completes.
5. **Pinyin is always computed, never model-supplied.** Pinyin displayed to the user is produced by `pinyin-pro` from the model's Chinese text. The model is never asked for pinyin and any pinyin in model output is ignored.
6. **No provider call before limits pass.** A call to DeepSeek, Groq, or ElevenLabs is made only after the request has cleared the per-user rate check (30/minute, 300/day, shared across all three routes) and the input-size caps (audio ≤ 60 s and ≤ 1 MB; text ≤ 500 characters).
7. **Model output is inert.** Model-generated text is never passed to `dangerouslySetInnerHTML`, `eval`, a shell command, a SQL string, or a filesystem path. It is only rendered as escaped text and stored as parameterized values.
8. **The system-prompt prefix is stable within a conversation.** The persona, rules, and HSK word list are assembled in a fixed order and are byte-identical across every turn of a conversation, so DeepSeek prompt caching is not defeated.
9. **Conversation length is bounded.** A conversation never holds more than 25 turns; the server rejects the request that would create the 26th and instructs the client to start a new conversation.
10. **Conversation count is bounded per user.** At most 50 conversations persist per user; creating the 51st deletes the oldest for that user in the same transaction.
11. **Postgres is the only source of truth.** Any state that must survive a page reload lives in Neon. `localStorage` and in-memory state hold only non-authoritative UI conveniences and are always reconciled from the database on load.
12. **One active conversation per user.** At any time a user has at most one `conversations` row with `status = 'active'`; starting a new conversation archives the previous one in the same transaction.
