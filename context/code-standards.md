# Code Standards

Implementation rules for hao.AI. These bind all code in the repo. They sit under `architecture.md` (which defines the invariants and folder ownership) and `ai-workflow-rules.md` (which defines how to sequence the work). Where this file repeats an invariant, the invariant still wins.

## General

- Keep each module single-purpose. One file owns one job: a route handler orchestrates, a `lib/` module talks to one provider, a `db/` function runs one query set, a component renders one thing. If a file needs "and" to describe it, split it.
- Fix root causes, not symptoms. Before editing a function, check every caller. Put the guard in the shared function, not in each call site.
- Do not mix concerns in one file. No provider SDK calls inside a React component. No SQL inside a route handler (call `db/queries.ts`). No business rules inside `db/` functions beyond the query itself.
- No speculative code. No abstraction with one implementation, no config for a value that never changes, no "for later" scaffolding. Build what the current build-spec unit needs.
- Prefer deletion over addition. Prefer a built-in platform feature over a dependency. Do not add a dependency for what a few lines can do; if you think one is justified, stop and ask.
- Every non-trivial branch, loop, parser, or security/cost path gets one runnable check that fails if the logic breaks. No test framework setup beyond what the unit needs.
- No `console.log`, commented-out blocks, dead code, or scratch harnesses in a committed change. Dev harnesses are removed once the real UI replaces them.
- Errors are surfaced, never swallowed. Every `catch` either handles the failure meaningfully or rethrows. No empty `catch`. No fallback that hides a broken provider call as an empty success.

## TypeScript

- Strict mode is on and stays on. Do not add `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` to make a change compile. If the types fight you, fix the types.
- Model data with explicit types in `types/`. The shared shapes are `Turn`, `Conversation`, `ChatResponse`, `Settings`. Import them; do not redeclare inline.
- Validate all external input at the boundary before trusting it: request bodies, model output, environment variables. Parse into a known shape (manual checks or a schema) and reject on mismatch — do not cast `unknown` to a type.
- The model's JSON reply (`{ reply_zh, reply_en, correction }`) is external input. Validate it against `ChatResponse` before use. On malformed JSON, retry once, then return 502 and persist nothing.
- No non-null assertions (`!`) on values that can actually be null — narrow with a check. `env.X!` is only acceptable for a variable proven present at startup.
- Server-only modules (`lib/`, `db/`) must never be imported by a client component. Keep provider SDKs and secrets out of any file that could end up in the browser bundle. No `NEXT_PUBLIC_` name ever holds a secret.
- Dates are `Date` in code, `timestamptz` in the DB, ISO 8601 UTC strings on the wire. Do not pass raw DB rows with `Date` objects straight through `Response.json` without serializing.

## Next.js (App Router)

- Default to Server Components. Add `"use client"` only where the browser API or interactivity requires it (recording, audio playback, popover/dialog state, the mic button).
- Keep `"use client"` at the leaves. A client wrapper should not pull large server-side logic into the bundle; pass data in as props from a server parent.
- Route handlers (`app/api/*/route.ts`) do one thing each. The three AI routes stay separate — `transcribe`, `chat`, `speak` — never merged into one handler. `conversations` handles history reads/writes only.
- Every API route handler calls `requireUser()` as its first statement, before reading the body, before any provider or DB call. No exceptions.
- Route order inside a handler: `requireUser()` → parse and validate input → check size caps → check rate limit → provider/DB work → shape and return response.
- Return predictable shapes. Success returns the documented object; failure returns `{ error: string }` with a correct status (400 bad input, 401 unauthenticated, 403 not allowlisted, 429 rate-limited, 502 upstream failure). Same shape for the same condition across all routes.
- No streaming responses. Every route is request/response. No background work kicked off after the response is sent.
- `middleware.ts` is the only place route-level auth gating lives. Do not re-implement session gating per route; do re-check the allowlist per route via `requireUser()`.

## Styling

- Use the design tokens from `app/globals.css` as CSS custom properties. No hardcoded hex, rgb, or px color values in components. If a token is missing, add it to `globals.css`, don't inline the value.
- Follow the minimalist-ui system: canvas `--canvas`, surface `--surface`, border `--border` (always `1px solid`), text `--text`, muted `--muted`, ink `--ink`. Accent pastels are semantic only — recording, correction/above-level, complete — never decoration.
- Border radius is `8px` or `12px` maximum. No `rounded-full` on containers, cards, or primary buttons (the mic button is the one intentional circle).
- No gradients, no glow, no heavy shadows. Hover shadow ceiling is `0 2px 8px rgba(0,0,0,0.04)`.
- Spacing uses the 8px scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64). Content column max-width 640px. Side gutter is set once on one outer wrapper, never as a `padding` shorthand that zeroes the sides.
- Fonts by role: Geist Sans for UI (15px / 1.6), Newsreader serif for the Chinese hero line (30px / 1.25, tracking -0.01em), Geist Mono for pinyin (13px) and meta (12px uppercase). No Inter, Roboto, or Open Sans.
- Icons are Phosphor (`@phosphor-icons/react`), bold weight, consistent size per context. No emoji anywhere — not in markup, text, alt text, or comments.
- Tailwind for layout and spacing utilities; custom properties for the palette and type. Do not pull in a component library — compose Radix primitives (`Popover`, `Dialog`, `Collapsible`) and style them.
- Layout must survive 400px width: no horizontal scroll, flex/grid rows wrap or stack, images and fixed-aspect boxes get `max-width: 100%`.
- Animate only `transform` and `opacity`. The mic ring is driven by an `AnalyserNode`; it is still when idle and pale-blue-reactive only while held.

## API Routes

- Parse and validate the request body before any logic runs. Reject unknown or malformed input with 400 and `{ error }`.
- Enforce auth and allowlist before any mutation or provider call: `requireUser()` first, always.
- Enforce input caps server-side even when the client also checks: transcribed/user text ≤ 500 characters; reject longer with 400. Audio size and duration (≤ 1 MB, ≤ 60s) are checked client-side and re-checked server-side by content length.
- Check rate limits before calls to `transcribe` and `chat`: per-user 10 turns/minute and 100 turns/day via row counts in `usage_log`. On limit, return 429 and make no provider call. On pass, insert one `usage_log` row.
- Scope every DB read and write by `user_id`. Load a conversation by `conversation_id` AND `user_id`. Never fetch by `id` alone. This is enforced by `db/queries.ts` requiring `userId` on every function — do not add a query that skips it.
- Provider API keys are read from `process.env` inside `lib/` modules only. Keys never appear in a response body, a log line, an error message, or a client-visible header.
- Enforce the conversation lifecycle caps in the handler/transaction: reject the 26th turn in a conversation; on a new conversation, archive the previous active one in the same transaction; on the 51st conversation for a user, delete the oldest in the same transaction. One active conversation per user.
- Never persist user audio. It is forwarded to the transcription API and discarded. No table, column, disk path, or object store holds a recording.
- Pinyin is always computed server-side with `pinyin-pro`. Never store or display model-supplied pinyin.
- The DeepSeek system-prompt prefix (persona + rules + HSK list) is assembled in a fixed byte order and is byte-identical for every turn within a conversation, so provider prompt caching applies. Do not interpolate per-turn values into the prefix.
- Model output is inert data. Never pass it to `dangerouslySetInnerHTML`, `eval`, a shell, a SQL string, or a filesystem path. Render as text.

## Data and Storage

- Postgres (Neon) is the single source of truth. `localStorage` and React state are non-authoritative caches; on any disagreement, the database wins.
- The four tables are `settings`, `conversations`, `turns`, `usage_log`, exactly as specified in `architecture.md`. Do not add tables or columns without updating `architecture.md` in the same change.
- Schema changes go through Drizzle + `drizzle-kit` migrations. Never hand-edit an already-applied migration; add a new one. Migration and the schema change land as one step, verified to apply cleanly, before any feature that uses them.
- All rows carry a non-null `user_id`. `usage_log` is append-only with an opportunistic 24-hour cleanup; do not read it for anything except the rate-limit window counts.
- No file or blob storage exists in this project. Generated TTS audio is regenerated from text on replay and its object URL is revoked after play. There is no "large content goes to blob storage" path here because there is no large stored content.
- The only client-side persistence is `localStorage` `hsk_level` as a pre-database fallback (added in the HSK unit, removed once `settings` persistence lands). It is never authoritative.
- Provider-side prompt cache (DeepSeek) is the only cache that matters for cost; preserve the byte-stable prefix that enables it. Do not add an app-level response cache.

## File Organization

- `app/` — routes, pages, layouts. Server Components by default. The single conversation screen plus the Clerk sign-in route; no other user-facing routes.
- `app/api/transcribe/` — the only caller of the OpenAI STT client.
- `app/api/chat/` — the only caller of the DeepSeek client; also runs pinyin generation, above-level flagging, turn persistence, and the 25-turn cap.
- `app/api/speak/` — the only caller of the Azure TTS client.
- `app/api/conversations/` — history list, single-conversation load, new-conversation creation, archive. No provider calls.
- `components/` — presentational and interactive UI. No secrets, no provider SDKs, no direct DB access. Server data arrives as props.
- `lib/` — server-only modules, one concern each: `deepseek.ts`, `openai.ts`, `azure-tts.ts`, `pinyin.ts`, `hsk.ts`, `ratelimit.ts`, `allowlist.ts`, `auth.ts`. Never imported by a client component.
- `db/` — `schema.ts` (Drizzle tables), `index.ts` (client), `queries.ts` (every function takes `userId` and scopes by it).
- `drizzle/` — generated migration files. Append only.
- `data/` — static bundled HSK 1–6 word list JSON, read-only at runtime. Source: `drkameleon/complete-hsk-vocabulary`.
- `types/` — shared TypeScript types: `Turn`, `Conversation`, `ChatResponse`, `Settings`.
- `middleware.ts` — Clerk session gating for all routes except static assets and `/sign-in`.
- `test/` — per-route tests, including the auth/allowlist rejection test each API route must have.
