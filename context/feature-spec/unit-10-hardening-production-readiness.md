# Feature Spec — Unit 10: Hardening + production readiness

> Derived from a production-readiness audit run against the live codebase on
> 2026-09-15 (checked every claim against actual files, not assumptions —
> see the per-item "Evidence" lines below). Expands `build-spec.md`'s Unit 10
> row ("Error/loading states for every failure path... bundle check for
> leaked secrets, `npm audit`, preview-vs-prod env split, README") into the
> full list the user asked to be checked. That original one-line scope is
> superseded by this document; `build-spec.md`'s Unit 10 row and done
> criteria are updated in the same change to point here.
>
> **Rate limiting, API request limits, and spending caps are explicitly OUT
> of this document.** They are already fully specced in
> `unit-9-rate-limiting-spend-guard.md` (status: DRAFT, not yet
> implemented). Do not re-spec them here — implement Unit 9 first, per
> `build-spec.md`'s build order (`9` before `10`).
>
> **Status: DRAFT. Documentation only — per explicit user instruction, no
> code in this unit has been written or should be started from this
> document alone.** Each sub-unit below needs its own review/approval before
> implementation, same as every other unit in this repo.
>
> **Why this is split into sub-units, not one unit** (`ai-workflow-rules.md`
> §3): the full list touches more than three files across routes, `db/`,
> `lib/`, and `components/`; at least one item (10c) changes the database
> schema; several cross a trust boundary (upload handling, provider calls).
> §3.5 also applies directly: "You cannot write a single sentence describing
> what the step does" — the raw checklist has 18 lines covering seven
> unrelated concerns, so it is broken into 10a–10h below, each with its own
> one-sentence scope, in the same spirit as Units 7a/7b/7c.

## Audit method

Checked against the actual repository state on 2026-09-15 (not memory, not
the spec docs) via direct reads of `db/schema.ts`, `app/api/chat/route.ts`,
`app/api/chat/validate.ts`, `app/api/speak/validate.ts`,
`app/api/transcribe/validate.ts`, and `test/` — plus `context/
progress-tracker.md` for what's already known-pending. Findings below are
marked with the exact file/line evidence found, so a sub-unit can be picked
up without re-auditing.

---

## 10a — Failure-state UI sweep (error/loading/empty states, failed requests)

**One sentence:** every user-facing action that can fail, wait, or return
nothing gets a visible, recoverable state instead of a silent hang or blank
screen.

**Evidence:**
- Error handling: mostly present. `app/api/chat/route.ts` already validates
  input and returns typed JSON errors with correct status codes;
  `components/conversation-client.ts`'s `ClientResult<T>` wraps every fetch
  in an ok/error branch (per `context/progress-tracker.md`'s Unit
  5/architecture-cleanup entry).
- Loading states: partial. Confirmed present for "New conversation"
  (`newConversationPending` → "Starting…" button label, per
  progress-tracker's Unit 8 follow-up entry) and mic recording lifecycle.
  Not confirmed for: sending a chat message, requesting TTS playback,
  loading the History panel's conversation list.
- Empty states: not confirmed anywhere. No explicit "no conversations yet"
  UI found for an empty History panel; no explicit "conversation is empty"
  state distinct from the seeded greeting.
- This is the closest match to `build-spec.md`'s original Unit 10 wording
  ("mic denied, STT fail, timeout, offline") — that original list is folded
  into this sub-unit's scope, not dropped.

**In scope:**
1. Audit every `fetch`/provider call site in `components/` for a loading
   indicator shown while in flight and an error message shown on failure —
   list every gap found before writing any fix (per `ai-workflow-rules.md`
   §4, do not guess, confirm against the actual component tree).
2. Add an explicit empty state to `components/HistoryPanel.tsx` for zero
   past conversations.
3. Confirm mic-permission-denial, STT failure, DeepSeek failure/timeout
   (see 10b below), TTS failure, and offline (`navigator.onLine` or a
   failed-fetch check) each render through the existing `StatusLine`
   pattern — do not invent a second error-display mechanism.

**Out of scope:** any new visual design system for errors — reuse the
existing `StatusLine` component and tokens (`ui-context.md`), per
`ai-workflow-rules.md` §2.5.

---

## 10b — API/provider call timeouts

**One sentence:** every outbound call to DeepSeek, Groq, or ElevenLabs has a
hard timeout so a hung upstream provider cannot hang the request
indefinitely.

**Evidence:** grepped `lib/deepseek.ts`, `lib/groq-stt.ts`,
`lib/elevenlabs-tts.ts` — no `AbortController`, `signal`, or fetch timeout
found in any of the three. A hung provider response currently blocks the
Vercel function for its full execution-time ceiling with no earlier,
user-visible failure.

**In scope:**
- Add an `AbortController`-based timeout to each of the three provider
  wrapper functions (`lib/deepseek.ts`'s `callDeepSeek`, `lib/groq-stt.ts`'s
  transcription call, `lib/elevenlabs-tts.ts`'s synthesis call), each
  surfacing a distinct "upstream timed out" error that the existing
  route-level `catch` blocks already turn into a `500`/`502` JSON response
  (no route-level change needed if the thrown error shape matches what the
  routes already catch — confirm this before touching the routes).
- Pick one timeout value per provider based on realistic p99 latency, not a
  guess — state the chosen value and reasoning when this sub-unit is
  implemented.

**Out of scope:** retry/backoff logic beyond `app/api/chat/route.ts`'s
existing one malformed-JSON retry (unchanged, not a timeout concern).

---

## 10c — Database indexing and query shape

**One sentence:** the `turns` table gets the index its own query patterns
already need, and `listConversations`' per-row extra query is either proven
acceptable at the real cap or fixed.

**Evidence:**
- `db/schema.ts` (read in full): `conversations` has
  `conversations_user_id_idx` and a partial unique index on active status.
  `turns` has **no index at all** beyond its primary key — every query
  filtering by `conversationId` or `userId` (`getConversationTurns`,
  `countTurns`, `appendTurnPair`'s ordering) does a full-table scan once the
  table grows past what fits in a cheap sequential scan.
- `db/queries.ts`'s `listConversations` (per progress-tracker's Unit 8
  entry) runs one `findFirst` per conversation to fetch its preview turn —
  already flagged in that same commit message as "acceptable at the
  existing 50-conversation cap," i.e. a known, previously-accepted N+1,
  not a newly discovered one.

**In scope:**
1. Add a composite index on `turns(conversationId, seq)` (matches the
   existing `asc(turns.seq)` ordering every query already uses, per
   progress-tracker's note on the `seq` column) — schema change, so per
   `ai-workflow-rules.md` §3.4 this lands as its own migration step,
   verified against real Neon before anything else in this sub-unit.
2. Re-confirm the `listConversations` N+1 is still acceptable now that Unit
   8 has shipped and the 50-conversation cap is enforced in code (it is,
   per `countTurns`/cap logic already in `db/queries.ts`) — if still
   acceptable, no code change, just note the re-confirmation in
   `progress-tracker.md`. Do not rewrite it into a single join query
   speculatively; that is scope creep per `ai-workflow-rules.md` §2.2 unless
   the cap is ever raised.

**Out of scope:** any change to `settings`, `conversations`, or existing
turn/conversation-count caps.

---

## 10d — Pagination for conversation history

**One sentence:** `GET /api/conversations` returns a bounded, paged list
instead of relying solely on the 50-conversation retention cap to keep the
response small.

**Evidence:** `app/api/conversations/route.ts`'s `GET` calls
`listConversations(userId)` with no `limit`/`cursor` — it returns every
conversation for the user in one response, capped only by the
50-conversation retention policy deleting the oldest once exceeded.

**Open question to resolve before implementing (`ai-workflow-rules.md`
§4.4):** is the existing 50-conversation hard cap sufficient on its own
(50 rows, each with a short preview string, is not a large payload), or
does the History panel need real pagination? Recommend: **skip real
pagination** — 50 capped rows is small enough that added
cursor/offset complexity would be premature per `ai-workflow-rules.md`
§1.4 ("do not add structure ... the current unit does not require") —
but this is the user's call, not a default to assume silently. State this
recommendation and get an explicit answer before writing any code for this
sub-unit.

**In scope (only if the user confirms pagination is wanted):** cursor-based
paging on `listConversations` and the `GET` route, matching the
`next_cursor` pattern already familiar from other tools in this
environment — no new dependency.

---

## 10e — Upload handling: size caps (confirmed) and compression (assessed)

**One sentence:** confirm the existing audio upload cap is sufficient and
decide, explicitly, whether audio compression is worth adding.

**Evidence:**
- Size cap: **already implemented**, both sides.
  `app/api/transcribe/validate.ts`'s `MAX_AUDIO_BYTES = 1 * 1024 * 1024`
  (1 MB) is enforced server-side (`parseTranscribeForm` rejects over-cap
  files) and `components/MicButton.tsx` imports the same constant for the
  client-side check (per progress-tracker's architecture-cleanup entry
  de-duplicating this exact value). No gap here — listed for completeness
  of the audit, not as a to-do.
- Compression: **not implemented, and likely not worth adding.** The cap is
  already a tight 1 MB and audio is never persisted (`architecture.md`:
  "No audio blobs... TTS regenerated on replay" — this is about the STT
  *upload*, which is short-lived, sent once, then discarded). Adding
  client-side audio compression (e.g. lowering `MediaRecorder`'s bitrate)
  would trade CPU/complexity for bandwidth savings on payloads that are
  already ≤1 MB and one-shot.

**In scope:** none by default — this sub-unit's action is to record the
above assessment in `progress-tracker.md` as a closed finding, not to add
compression code. Revisit only if real usage shows the 1 MB cap being hit
often enough to matter (no evidence of that yet).

---

## 10f — Caching repeated requests

**One sentence:** assess whether any repeated-request caching is missing
beyond what Unit 2's DeepSeek prompt caching already provides.

**Evidence:** `build-spec.md`'s Unit 2 already specifies system-prompt
caching for the HSK word list ("prompt-cached... repeated turns don't
re-bill the full word list"). Every other provider call in this app is
inherently non-repeatable per its own design: each chat turn is a unique
message in a growing conversation (nothing to cache), and TTS audio is
deliberately regenerated on every replay rather than cached/stored
(`architecture.md`'s explicit "no audio blobs" invariant — caching TTS
output would mean persisting audio, which directly conflicts with that
invariant).

**In scope:** none identified. Record this as a closed finding — the one
place caching plausibly applies (the HSK prompt) is already built. Do not
add a caching layer speculatively.

---

## 10g — Observability: uptime monitoring and structured error logging

**One sentence:** decide on and wire up an uptime monitor and give provider
call failures a queryable log line instead of a bare `console.error`.

**Evidence:**
- Uptime monitoring: **none found.** No health-check route, no Sentry/
  equivalent SDK in `package.json`, no external monitor configuration in
  the repo.
- Error logging: **minimal.** `app/api/chat/route.ts` uses plain
  `console.error("chat: DeepSeek call failed", err)` — readable in Vercel's
  log stream but not structured, not queryable, and not alerting anyone.

**In scope:**
1. Uptime monitoring is a dashboard/external-service decision, not code —
   per `ai-workflow-rules.md` §5.4, this stops at a checklist for the user
   rather than an implementation:
   - [ ] Pick an uptime monitor (e.g. a Vercel-native check, or a free-tier
         external pinger) and point it at the deployed root URL, once Unit
         0b's deploy pipeline exists.
2. A minimal error-logging convention: keep `console.error`, but standardize
   the shape across all three provider routes (`{ route, userId, err }` as a
   single structured object, not a free-text prefix string) so Vercel's log
   search can filter by route/user without a full log-drain service. This
   is the "lazy call" version — do not add Sentry/Datadog/a logging SaaS
   unless the user asks for one by name (`ai-workflow-rules.md` §1.6: new
   dependency needs to be asked about explicitly, not assumed).

**Out of scope:** any paid observability service, log aggregation
pipeline, or alerting integration — not requested, and `build-spec.md`'s
own "Deliberately skipped" list already excludes "audit logging" at this
scale.

---

## 10h — Concurrency and backup-restore testing

**One sentence:** add one concurrency test for the write paths that aren't
already covered, and confirm Neon's backup/restore actually works before
relying on it.

**Evidence:**
- Concurrent users: `unit-9-rate-limiting-spend-guard.md`'s own test plan
  already includes a real concurrency case ("two concurrent `reserveUsage`
  calls... only one inserts a row") — but that only covers the rate-limit
  write path, once Unit 9 ships. No concurrency test exists today for
  `appendTurnPair` (two turns written in the same request) or
  `getOrCreateActiveConversation` (two concurrent requests for a user with
  no active conversation yet, racing to create one) — `grep`-checked
  `test/` and found no such case.
- Backup restoration: **no evidence found** of this ever being tested. Neon
  provides point-in-time restore by default on paid plans, but an untested
  restore path is not a working one — this app currently holds
  `conversations`/`turns`/`settings` (and, once Unit 9 ships, `usage_log`)
  as its only durable state.

**In scope:**
1. One new test exercising `getOrCreateActiveConversation`'s concurrent-race
   behavior — does the DB-level unique constraint
   (`conversations_one_active_per_user`, already in `db/schema.ts`) actually
   prevent two simultaneously-created "active" rows for the same user, or
   does the application code need a retry-on-conflict path? Write the test
   first, per `superpowers:test-driven-development`, to find out which is
   true before deciding whether code changes are needed.
2. A manual backup-restore drill against the real Neon project (not a
   code change): trigger a Neon point-in-time restore to a branch, confirm
   data comes back intact, record the result and the steps taken in
   `progress-tracker.md`. This is dashboard/infra verification, not
   application code — per `ai-workflow-rules.md` §5.4, give the user the
   exact steps rather than attempting it from application code.

**Out of scope:** load testing / stress testing beyond the one concurrency
case above — not requested, and this app's usage scale doesn't currently
justify a dedicated load-test harness.

---

## Explicitly out of scope for all of Unit 10

- **Rate limiting, per-route/day request limits, spending caps** — fully
  owned by `unit-9-rate-limiting-spend-guard.md`. Do not duplicate.
- **Duplicate payments** — not applicable. This app has no payment,
  checkout, or billing-charge flow anywhere in scope (`project-overview.md`
  has no monetization feature); flagging this line of the original
  checklist as N/A rather than silently dropping it, per
  `ai-workflow-rules.md` §4.7.
- **Duplicate submission prevention beyond what already exists** — some
  coverage already exists (the "New conversation" button disables itself
  while pending). A full audit of every submit-capable control (send
  button, replay button, mic press) for the same guard is folded into 10a's
  loading-state sweep, not a separate sub-unit — it's the same UI-state
  problem, not a distinct concern.

## Suggested implementation order

10c (schema/index, must land and be verified before anything reads through
it) → 10b (provider timeouts, a trust-boundary change, own reviewed step
per §3.3) → 10a (failure-state UI sweep, depends on 10b's new timeout
errors having somewhere to render) → 10h (tests) → 10d/10e/10f/10g
(assessment-only or checklist items, no strict ordering dependency).

Each sub-unit still needs its own "Status: DRAFT, awaiting approval" review
before implementation starts, matching every other unit in this repo — none
of this has been approved for implementation yet.

## Verification commands (once a sub-unit is approved and implemented)

```
npx drizzle-kit generate   # only for 10c
npx drizzle-kit migrate    # only for 10c — verify against real Neon first
npm run build
npm run lint
npm test
npm run dev   # manual check per sub-unit's own evidence/verification notes
git status && git log --oneline -1
```
