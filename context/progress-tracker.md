# Progress Tracker

Update this file after every meaningful implementation
change.

## Status (source of truth — check this first)

Everything below this table is a chronological narrative log, kept as
history/context. It is **not** kept in sync — per-entry caveats like
"not yet done: manual browser check" get copy-pasted forward and go stale
once the check actually happens. Only this table reflects current status;
update it whenever a unit's status changes.

| Unit                                              | Status     | Notes                                                                                                                                         |
| ------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0a — Local skeleton                               | ✅ Done    | committed `96fc49b`                                                                                                                           |
| 0b — Deploy pipeline                              | ⏸ Deferred | blocked on user: Vercel project, env vars, Deployment Protection. Revisit once Units 1-9 are done, before Unit 10 ship (see "Deferred" below) |
| 1 — Text conversation loop                        | ✅ Done    | verified live, committed `7c7ebd9`                                                                                                            |
| 2 — HSK level control                             | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 3 — Voice input (STT)                             | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 4 — Voice output (TTS)                            | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 5 — One-screen + Siri mic                         | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 6 — Auth (Clerk)                                  | ✅ Done    | re-verified 2026-09-14, live browser flows exercised                                                                                          |
| 7a — DB schema                                    | ✅ Done    | committed, migrations applied to real Neon DB                                                                                                 |
| 7b — Settings persistence                         | ✅ Done    | committed, 98/98 tests pass                                                                                                                   |
| 7c — Conversation persistence                     | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 8 — History + conversation lifecycle              | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 9 — Rate limiting + spend guard                   | ✅ Done    | user confirmed verified 2026-09-17 (includes the 3-item provider-dashboard checklist)                                                         |
| 10a — Failure-state UI sweep                      | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |
| 10b — Provider call timeouts                      | ✅ Done    | implemented 2026-09-15, 15s AbortController timeout on all 3 provider calls; timeout now stays active through response-body consumption       |
| 10c — DB indexing / query shape                   | ✅ Done    | implemented 2026-09-15, index applied to real Neon DB                                                                                         |
| 10d–10g (pagination/upload/caching/observability) | ❌ Removed | assessed as not worth building at this app's current scale; specs deleted                                                                     |
| 10h — Concurrency/backup testing                  | ❌ Removed | user requested removal 2026-09-15                                                                                                             |
| Dark mode                                         | ✅ Done    | user confirmed verified 2026-09-17                                                                                                            |

**Resolved 2026-09-15 (final production-readiness check):** `test/queries-conversations-list.test.ts`'s 2 pre-existing failures (`db.selectDistinct is not a function`, flagged repeatedly since 2026-09-14, unowned) are fixed. The mock in `vi.mock("@/db/index", ...)` never stubbed `db.selectDistinct(...).from(...).where(...)`, which `listConversations` started using to filter out archived greeting-only conversations. Added a `selectDistinctWhere` mock hook to the `vi.hoisted` block, wired per-test. Also caught a second, real drift while fixing it: the "no turns" test asserted `preview === ""`, but `db/queries.ts:293` had changed its fallback to `GREETING_ZH` (`"你好！今天想聊什么？"`) — the test's expectation was stale, not just its mock. Updated the assertion to match current intended behavior. `npm test`: 139/139 passing.

**Resolved 2026-09-15 (same pass):** `middleware.ts` → `proxy.ts` rename, per Next.js 16's `middleware` file-convention deprecation warning surfaced in every `npm run build` since upgrading. Confirmed via Next.js's own migration doc that only a named `export function middleware()` needs renaming to `proxy` — this file's `export default clerkMiddleware()` and `export const config` were untouched, just moved to the new filename (`git mv`). `npm run build` (warning gone, route table unchanged, still shows `ƒ Proxy (Middleware)`), `npm run lint`, and `npm test` (139/139) all clean after the rename.

**Resolved 2026-09-15 (deploy-prep pass):** `vercel.json`'s cron schedule for `/api/cron/cleanup-usage` changed from hourly (`0 * * * *`) to once-daily (`0 3 * * *`). Confirmed via Vercel's own docs: the Hobby (free) plan hard-rejects any cron expression that would run more than once a day — the deploy itself would have failed on this file as written. User is deploying on the free plan, so this was a real pre-deploy blocker, not a preference. `cleanupExpiredUsage()`'s 24h expiry window tolerates a daily sweep fine — no functional loss, just less frequent pruning of `usage_log` rows.

## Current Phase

- **Dark mode: Clerk sign-in/sign-up card fixed** (2026-09-15), per
  `context/feature-spec/current-issues.md`'s report that the sign-in/sign-up
  pages look broken in dark mode. **Root cause:**
  `components/auth/clerk-appearance.ts` exported a single static
  `authAppearance` object with hex colors hardcoded to the light-mode
  palette (`#FFFFFF` background, `#111111` text, etc.) — Clerk's own
  `<SignIn>`/`<SignUp>` widgets can't resolve `var(--token)` (documented
  exception, see the file's own comment), so they never picked up
  `:root[data-theme="dark"]`'s repainted tokens the way the rest of the app
  does. The surrounding `AuthShell` card and page background _did_ go dark
  (they use `var(--surface)`/`var(--canvas)`), so the effect was a jarring
  white Clerk form floating on a dark shell. **Fix:** `clerk-appearance.ts`
  now exports `getAuthAppearance(dark: boolean)`, returning either the
  existing light hex set or a new dark hex set copied from
  `app/globals.css`'s `:root[data-theme="dark"]` block
  (`colorBackground: "#1F2023"`, `colorText: "#F5F5F3"`, etc.). Both
  `app/sign-in/[[...sign-in]]/page.tsx` and
  `app/sign-up/[[...sign-up]]/page.tsx` became Client Components reading
  the current theme via `useSyncExternalStore` and pass
  `getAuthAppearance(darkMode)` instead of a static import. **Dedup as part
  of the same change:** the `theme` `createPersistedPreference` instance
  was previously defined only inside `components/ConversationScreen.tsx`
  (module-private); moved to a new exported `themePreference` in
  `components/preference-store.ts` so the auth pages and the main app read
  the same `localStorage` key through one shared object instead of two
  divergent definitions — `ConversationScreen.tsx` now imports it instead
  of redefining it, with no behavior change there.
  `npx tsc --noEmit` and `npm run lint` both clean. **Not yet done:** a
  live browser check toggling dark mode with `/sign-in`/`/sign-up` open —
  same environment limitation as every prior unit's manual-check gap.

- **Unit 10a implemented** (2026-09-15) per
  `context/feature-spec/unit-10a-failure-state-ui-sweep.md`. Audited every
  `fetch`/provider call site in `components/` first, per the spec's
  audit-before-fix requirement — full gap table below.
  **Gaps found and fixed:**
  - `ConversationScreen.tsx`'s `/api/settings` GET (load HSK level) and
    PATCH (`changeHskLevel`) had no `res.ok` check and no error handling at
    all (an unhandled rejection on network failure). Both now check
    `res.ok`/`.catch` and surface `setError(...)` through the existing
    `StatusLine`.
  - Voice-message flow (`handleRecordedAudio`) had no loading indicator
    between mic release and the transcript arriving — the existing
    `pending`/"Thinking…" state only started once `send()` was called
    _after_ transcription succeeded. New `transcribing` state renders
    "Transcribing…" via `StatusLine` (`variant="live"`, same as
    "Thinking…") for that gap.
  - `speak()` (TTS playback) disabled buttons while in flight but showed no
    visible loading text distinguishing "fetching audio" from "playing
    audio". New `ttsLoading` state renders "Loading audio…" via
    `StatusLine`.
  - `HistoryPanel.tsx`'s conversation-list GET never checked `res.ok` — an
    HTTP error status was silently parsed as success data instead of
    surfacing the existing error message. Fixed by throwing before `.json()`
    on a non-ok response, caught by the existing `.catch`. Also had no
    loading indicator on first open (blank list while `conversations ===
null`); added a "Loading…" row, derived as `conversations === null &&
!error` rather than a new state variable (avoids a
    `react-hooks/set-state-in-effect` lint violation from setting a loading
    flag synchronously inside the list-fetch effect).
  - **Offline was not handled anywhere in the codebase** (`grep` for
    `navigator.onLine`/`offline` found nothing) — a real gap explicitly
    named in the spec's item 3. Added an `offline` value via
    `useSyncExternalStore` subscribing to the `online`/`offline` window
    events (same hydration-safe pattern as the file's existing `mounted`
    check — a plain `useState`+`useEffect` pair would itself trip the
    set-state-in-effect lint rule), rendered through `StatusLine`
    (`variant="error"`, "You're offline — reconnect to keep chatting.").
    **Confirmed already correct, no change needed:**
  - `HistoryPanel.tsx` already had an explicit empty state ("No past
    conversations yet.") from a prior session (commit `8bdab3a`) — spec
    item 2 was already satisfied.
  - Mic-permission-denial, STT failure, DeepSeek failure/timeout (Unit
    10b), and TTS failure all already rendered through `StatusLine` — each
    provider route already maps its caught error to a plain-string
    `"Upstream unavailable"` (or a specific message for mic denial) that
    the client's `ClientResult`/`setError`/`setMicError`/`setSpeakError`
    pattern already routes into `StatusLine`. No second error-display
    mechanism invented.
  - "New conversation" button, the typed-message send button, and
    `TurnCard`'s replay button already had a pending-disable guard.
    **New pending-disable guards added (item 4):**
  - Mic button: was only disabled on `playingIndex !== null ||
conversationFull`, not on `pending`/`transcribing` — a user could start
    a second recording while the first was still transcribing or awaiting a
    reply. Now also disabled while `pending`, `transcribing`, or `offline`,
    with a matching `disabledMessage` per cause.
  - Typed-message send button: now also disabled while `offline` (was
    already disabled on `pending`/`conversationFull`/empty input).
  - `HistoryPanel`'s row-select and delete buttons had no guard at all —
    a double-click could fire overlapping requests. New `pendingId` state
    (the id of the conversation being selected/deleted) disables both
    buttons on every row while any row's request is in flight, mirroring
    the "New conversation" button's own pending pattern.
    **No new visual design system** — every addition reuses the existing
    `StatusLine` component and CSS custom-property tokens (`--text-muted`,
    `--space-*`, etc.); no new colors, components, or error-display surface.
    `npx tsc --noEmit`, `npm run build` (route table unchanged), and
    `npm run lint` all clean. `npm test`: 137 passing, 2 failing — the same
    pre-existing `test/queries-conversations-list.test.ts`
    `db.selectDistinct is not a function` gap tracked in the Status table
    above, unrelated to this change (no test added: this unit is UI
    state-plumbing across already-tested provider-error paths, not new
    branching logic worth its own unit test at this scale).
    **Manual verification:** `npm run dev` confirmed the server starts and
    compiles cleanly, and an unauthenticated request to `/` correctly
    redirects to `/sign-in` (307). **Not done: an interactive walkthrough of
    each failure path** (mic-permission-denial dialog, a real STT/DeepSeek/TTS
    failure or timeout, toggling the OS network connection offline) — this
    needs a real signed-in browser session with live mic/provider access,
    which is not possible from this environment; same limitation flagged on
    every prior unit's manual-check gap (see Status table).

- **Unit 10b implemented** (2026-09-15) per
  `context/feature-spec/unit-10b-provider-call-timeouts.md`. Added an
  `AbortController`-based 15s timeout to each of the three outbound provider
  calls: `lib/deepseek.ts`'s `callDeepSeek`, `lib/groq-stt.ts`'s
  `transcribeAudio`, `lib/elevenlabs-tts.ts`'s `synthesizeSpeech`. Each wraps
  its `fetch` in try/finally (`clearTimeout` always runs), catches the
  resulting `AbortError`, and rethrows a distinct `"<Provider> ... timed
out"` `Error`. **No route changes** — confirmed first that
  `app/api/chat/route.ts`, `app/api/transcribe/route.ts`, and
  `app/api/speak/route.ts` all wrap their provider call in a generic
  `catch (err)` that already maps any thrown `Error` to a 500 ("Upstream
  unavailable"), so the new timeout error needed no route-level handling to
  match the spec's `500`/`502` expectation. Timeout value is 15s flat for
  all three per the spec's explicit "conservative default, not a measured
  p99" instruction — revisit per-provider once real latency data exists.
  No retry/backoff added (out of scope; `app/api/chat/route.ts`'s existing
  one malformed-JSON retry is unchanged).
  `npm run build` (route table unchanged) and `npm run lint` both clean.
  `npm test`: 137 passing, 2 failing — same pre-existing
  `test/queries-conversations-list.test.ts` `db.selectDistinct is not a
function` gap noted in Unit 10c's entry below, unrelated to this change.
  Manual verification: a temporary vitest file (fake timers + a `fetch` mock
  that hangs until its `AbortSignal` fires) confirmed all three functions
  reject with their timeout message at exactly 15s; deleted after
  confirming, not part of the permanent suite.

- Unit 10h removed (2026-09-15, user request: "remove unit 10h i dont need
  it for now"). Deleted `context/feature-spec/unit-10h-concurrency-backup-testing.md`
  entirely — it had zero code written (concurrency test already marked
  deferred, backup-restore drill never started). Unit 10 is now three
  sub-units: 10a, 10b, 10c. `build-spec.md`'s Unit 10 row and "Build order &
  rationale" section updated to match. If backup-restore or the
  `getOrCreateActiveConversation` concurrency race ever need verifying
  later, write a fresh spec rather than reviving this deleted one.

- **Unit 10c implemented** (2026-09-15) per
  `context/feature-spec/unit-10c-db-indexing-query-shape.md`.
  **Index:** `db/schema.ts`'s `turns` table gained
  `turns_conversation_id_seq_idx`, a composite index on
  `(conversationId, seq)` matching the `asc(turns.seq)` ordering every
  turn query in `db/queries.ts` already uses (`getOrCreateActiveConversation`,
  `listConversations`' per-row preview lookup, `getConversationTurns`).
  `npx drizzle-kit generate` produced `drizzle/0006_whole_masque.sql`
  (a single `CREATE INDEX`). **Migration apply note (same workaround as
  Unit 9):** `drizzle-kit migrate` hung again in this environment (confirmed
  twice — once via the plain command, once via `dotenv-cli` explicitly
  loading `DATABASE_URL` from `.env.local` — both hung on "applying
  migrations..." past a 25s timeout, same websocket-vs-plain-HTTPS cause
  documented in Unit 9's entry). Applied the migration's DDL directly over
  the `@neondatabase/serverless` HTTP connection instead (a one-off script,
  deleted after use, using `sql.query(ddl)` — the tagged-template `sql()`
  call form Unit 9's approach implicitly assumed rejects a plain string with
  "This function can now be called only as a tagged-template function" on
  the current package version), then verified via `pg_indexes` (equivalent
  to `information_schema` for this purpose) that `turns_conversation_id_seq_idx`
  exists on the real Neon database alongside the existing `turns_pkey`.
  **`listConversations` N+1 re-confirmed, no code change:** re-read
  `db/queries.ts`'s `listConversations` — its per-relevant-conversation
  `db.query.turns.findFirst` for the list preview is still bounded by the
  same 50-conversation cap `createConversationWithGreeting` enforces (prunes
  the oldest conversation once `count(*) >= MAX_CONVERSATIONS_PER_USER`),
  so it can run at most ~50 extra single-row queries, not an unbounded
  amount — still acceptable per the spec's explicit "no speculative
  single-join rewrite" instruction. `settings`, `conversations`, and the cap
  logic itself were not touched.
  `npm run build` (route table unchanged), `npm run lint` (clean), and
  `npm test` (137 passing, 2 failing) all run. **The 2 failures are
  pre-existing and out of this unit's scope** — the same
  `test/queries-conversations-list.test.ts` `db.selectDistinct is not a
function` gap first flagged in this file's 2026-09-14 eighth-follow-up
  entry and repeated in Unit 8/Unit 9's entries; this unit's change touches
  neither `selectDistinct` nor that test file.

- Unit 10 scope narrowed (2026-09-15, user request: "check whether unit 10
  is worth building" then "remove these files if have not implemented").
  Assessed each of the eight Unit 10 sub-units against this app's actual
  scale (private, single-user, ~20 sessions/month per
  `project-overview.md`'s Goal 5/7) rather than building the full audit
  checklist uncritically. **Kept, still worth building:**
  `unit-10a-failure-state-ui-sweep.md`, `unit-10b-provider-call-timeouts.md`,
  `unit-10c-db-indexing-query-shape.md` (all cheap, real risk regardless of
  scale), and `unit-10h-concurrency-backup-testing.md` (kept for its
  backup-restore drill — a one-time manual Neon check, not code; its
  concurrency test is now marked deferred in that file's own "Decision"
  section rather than dropped, since the race is low-probability at
  single-user scale and no bug has surfaced it). **Removed outright** (each
  was already DRAFT/CLOSED with zero code written, and each is unlikely to
  ever be worth building at this app's stated scale): `unit-10d-conversation-pagination.md`
  (50-conversation cap already bounds response size),
  `unit-10e-upload-handling-assessment.md` (size cap already implemented;
  compression assessed and rejected), `unit-10f-caching-assessment.md` (no
  repeated-request pattern exists beyond Unit 2's already-built HSK prompt
  cache), and `unit-10g-observability-uptime-logging.md` (uptime
  monitoring/structured logging is real ops tooling for traffic this app
  doesn't have — `console.error` is fine to grep in Vercel's log stream at
  this volume; revisit only once there's a real deploy pipeline and users
  beyond the owner). Deleted rather than kept as dead drafts, since a
  removed feature with zero implementation leaves nothing to "supersede" —
  their reasoning is preserved here and in the surviving files' own
  Evidence/Decision sections instead. `build-spec.md`'s Unit 10 row and
  "Build order & rationale" section updated in the same change to match.

- Production-readiness audit (2026-09-15, user request: "check if my app
  has [an 18-item hardening checklist]") — **findings documented, nothing
  implemented, per explicit user instruction.** Checked the live codebase
  (not just specs) against: rate limiting, API limits, spending caps, error
  handling, loading states, empty states, failed-request handling, API
  timeouts, duplicate-submission prevention, duplicate-payment prevention,
  DB query optimization, DB indexes, pagination, upload compression, upload
  size limits, request caching, uptime monitoring, error logging,
  concurrent-user testing, and backup-restoration testing. Result: rate
  limiting/spend caps were already fully specced but unimplemented (Unit 9,
  unchanged by this audit); error handling, upload size limits, and some DB
  indexes already exist; everything else is a real gap or an
  assessed-as-not-needed finding. Full detail, evidence, and a
  sub-unit-by-sub-unit build spec now live in
  `context/feature-spec/unit-10-hardening-production-readiness.md`;
  `build-spec.md`'s Unit 10 row and done criteria were updated in the same
  change to point at it. **DRAFT — awaiting approval before any sub-unit is
  implemented.**
- Unit 9 (rate limiting + spend guard) — **implemented** (2026-09-15) per
  `context/feature-spec/unit-9-rate-limiting-spend-guard.md`, on the user's
  explicit go-ahead to implement the approved spec. See "Completed" below
  for full detail. **Not yet done:** the three-item manual provider-dashboard
  checklist (Groq/ElevenLabs spend caps, DeepSeek balance) — handed to the
  user, cannot be done from code per `ai-workflow-rules.md` §5.4.
- Dark mode (2026-09-14, user request) — **implemented**: `app/globals.css`
  gained a `:root[data-theme="dark"]` block redefining every existing color
  token (no new tokens, no component changed a color value directly); a
  `Sun`/`Moon` ghost-icon toggle sits in the top-right corner cluster next
  to the HSK picker in `components/ConversationScreen.tsx`; the choice
  persists via the same `createPersistedPreference` pattern as
  `zh_only_mode`/`display_support` (`localStorage` key `theme`); an inline
  blocking `<script>` in `app/layout.tsx` applies `data-theme` before first
  paint to avoid a light-mode flash for returning dark-mode users. This
  reverses `ui-context.md`'s prior "light mode only, no theme switcher"
  note — updated that doc to match. **Not yet done: manual browser check.**
- Unit 8 second follow-up (2026-09-14, user screenshot + direct request) —
  **implemented**: conversations can now be deleted from History (new
  `deleteConversation` query, `DELETE /api/conversations/[id]` route, trash
  icon per archived row — active conversation can't be deleted), the
  "Current" row uses `--border-strong` (darker than the old
  `--surface-sunken`) so it reads as clearly distinct, the "You"/"hao.AI
  Tutor" turn-card labels now scale with the A-/A+ text-scale control (were
  fixed-size before), and the user's turn text now renders at the same font
  size/family as the AI's hero line (was visibly smaller — mismatched
  `--font-sans` vs `--font-serif` and different rem bases). See "Completed"
  below.
- Unit 8 follow-up fixes (2026-09-14, per `context/feature-spec/current-issues.md`)
  — **implemented**: the History panel's "Current" row now actually returns
  to the live conversation (was a dead end once you'd opened an archived
  conversation), the "Back to conversation" button is sticky and restyled,
  "New conversation" is hidden until the user has sent a real message, it
  shows a "Starting…" loading state while creating a new conversation, and
  the History panel highlights the "Current" row with a gray `--surface-sunken`
  fill. See "Completed" below for full detail. **Not yet done: manual browser
  check** — same environment limitation as every prior unit.
- Unit 8 (history overlay + conversation lifecycle) — **implemented**
  (2026-09-14) per `context/feature-spec/unit-8-history-conversation-lifecycle.md`.
  `db/queries.ts` gained `listConversations`/`getConversationTurns` and
  exported `createConversationWithGreeting`; new `app/api/conversations/`
  routes; new `components/HistoryPanel.tsx` (Radix Dialog); the history
  icon is enabled, a "New conversation" button and the 25-turn cap UI are
  wired into `components/ConversationScreen.tsx`. See "Completed" below for
  full detail. **Not yet done: the manual browser check** (real signed-in
  session, mic/DeepSeek/ElevenLabs round trip) — same environment
  limitation as every prior unit.
- Unit 6 (Clerk auth) — **verified done** (2026-09-14, re-verification pass):
  see "Verified" below. Unit 7 (persistence) is now fully done: 7a (schema),
  7b (settings), and 7c (conversation/turn persistence, greeting seeded
  server-side, 25-turn and 50-conversation caps) all implemented and
  passing build/lint/test. **Still needed: a real signed-in browser check**
  (reload mid-conversation, cross-profile check) — not possible from this
  environment; see "Verified" below for what automated coverage already
  confirms. Unit 5 (one-screen restyle + Siri mic) still pending its own
  dedicated manual browser verification with a real mic/DeepSeek/ElevenLabs
  round trip (unchanged). Units 2/3/4 still pending their own manual
  verification and commits (unchanged from before Unit 5).

## Current Goal

- All units (2–9, 10a) and dark mode are user-confirmed verified as of
  2026-09-17 — see Status table above. Next work item, if any, should be
  picked from the "Deferred" note on Unit 0b (Vercel deploy pipeline) or a
  new user request.

## Completed

- 2026-09-15: **Unit 9 implemented** per
  `context/feature-spec/unit-9-rate-limiting-spend-guard.md`.
  **Schema + migration:** `db/schema.ts` gained `usageLog` (`id`, `userId`,
  `route`, `createdAt`, plus the spec's two indexes — `(userId, createdAt)`
  for `reserveUsage`'s per-user window counts and a `createdAt`-leading one
  for `cleanupExpiredUsage()`'s global sweep). `npx drizzle-kit generate`
  produced `drizzle/0004_chunky_silk_fever.sql`, byte-matching the spec's
  schema exactly. **Migration apply note:** `drizzle-kit migrate` hung
  indefinitely in this environment — it needs a websocket connection to
  Neon and this sandbox's network only allows plain HTTPS (the same
  `@neondatabase/serverless` HTTP driver every other query in this app
  already uses worked fine). Applied the migration's DDL directly over that
  HTTP connection instead, then verified via `information_schema` that
  `usage_log` and both indexes exist on the real database — this repo's
  `__drizzle_migrations` journal table was already missing entries for
  0002/0003 for the same apparent reason (pre-existing, not caused here),
  so this isn't a new gap.
  **`lib/ratelimit.ts` (new):** `reserveUsage`/`cleanupExpiredUsage`. One
  real constraint the spec didn't anticipate: this project's Drizzle driver
  is `neon-http`, whose `db.transaction()` unconditionally throws ("No
  transactions support in neon-http driver" — confirmed by reading
  `node_modules/drizzle-orm/neon-http/session.cjs`); `db.batch()` is the
  only atomic primitive (already the pattern `db/queries.ts` uses). Built
  `reserveUsage` as one `db.batch()` of three `db.execute(sql\`...\`)`statements: (1)`pg_advisory_xact_lock(hashtext(userId)::bigint)`, (2) a
conditional `INSERT ... SELECT ... WHERE`(minute-window count)`< 30 AND`(day-window count)`< 300 RETURNING id`, (3) the per-write 24h cleanup
delete. This
still closes the race the spec's advisory-lock requirement calls for:
Neon's HTTP batch runs each item as a separate statement inside one real
Postgres transaction, and under the default READ COMMITTED isolation
each statement takes its own fresh snapshot — so item 2 only takes its
snapshot *after* item 1 finishes blocking on the lock, meaning it always
sees rows any just-committed concurrent transaction already inserted.
(A single combined SQL statement wouldn't have this property — Postgres
fixes one snapshot per statement at the start, before it waits on any
lock inside it — which is why this is three `db.batch()`items, not one.)
**Routes:**`app/api/transcribe/route.ts`, `app/api/chat/route.ts`, and
`app/api/speak/route.ts`each gained a`reserveUsage(userId, route)`check (429`"Rate limit reached; try again later."`on failure) at the
exact insertion points the spec named — transcribe/speak before their
provider call, chat after the existing 25-turn check but before`callDeepSeek`.
**Retention:** new `app/api/cron/cleanup-usage/route.ts`(bearer-token
guarded via a new`CRON_SECRET`env var, added to`.env.example`per`ai-workflow-rules.md`§5.6) and a new`vercel.json`scheduling it hourly
— the one route in the app with no`requireUser()`call, since it has no
end-user session.
**Docs:**`architecture.md`'s "Rate check" bullet, its stack table's
"Rate limiting" row, and invariant 6 all corrected from the old
10/minute-100/day per-route wording to the shared-bucket 30/minute,
300/day design, per the spec's required same-change correction
(`ai-workflow-rules.md`§6.2).
**Tests:**`test/ratelimit.test.ts`(all of this unit's own boundary
cases: 29-vs-30 in the last 60s, 299-vs-300 in the last 24h, the
lock->conditional-insert->cleanup shape per route,`cleanupExpiredUsage`not scoped to one user) plus`test/chat-ratelimit.test.ts`,
`test/transcribe-ratelimit.test.ts`, `test/speak-ratelimit.test.ts`(each:`reserveUsage`mocked`false`-> 429, provider function never
called). **Existing tests fixed as a required side effect:**`test/auth-guard.test.ts`and`test/chat-conversation.test.ts`didn't mock`@/lib/ratelimit`, so importing the now-`lib/ratelimit.ts`-importing
routes tried to construct a real `neon()`client with no`DATABASE_URL`in the test environment and threw; both gained the same`vi.mock("@/lib/ratelimit", ...)`seam the new rate-limit test files use.
**Manual verification:** no real browser/mic session is possible from
this environment (same limitation as every prior unit), so ran a scripted
equivalent directly against the real Neon database instead — 32`reserveUsage`calls for a synthetic`unit9_manual_check_user`, confirming
the 31st (not the 30th or 32nd) is the first rejected, then confirmed
`cleanupExpiredUsage()`runs cleanly and doesn't prune the 30 fresh rows,
then deleted all synthetic rows so no test data was left in the real
table.`npx tsc --noEmit`, `npm run lint`, `npm run build`(route table
now lists`/api/cron/cleanup-usage`), and `npm test`all green for this
unit's own files.
**Not fixed, pre-existing and out of this unit's scope:**`test/queries-conversations-list.test.ts`'s 2 failures
(`db.selectDistinct is not a function`) — already flagged in this file's
2026-09-14 entry as an unrelated concurrent change, unchanged by this
session. **Also noticed, not made by this session — a live concurrent
edit, not a one-time drop:** by the end of this session, `git status`showed`context/feature-spec/build-spec.md`modified, the old`unit-10-hardening-production-readiness.md` deleted, and eight new files
(`unit-10a-failure-state-ui-sweep.md`through`unit-10h-concurrency-
  backup-testing.md`) — a Unit 10 restructure actively landing on disk from
outside this conversation while Unit 9 was being implemented. None of it
was read, touched, staged, or reverted here; it's outside Unit 9's scope
and this file's own commit (see "Current Goal") deliberately stages only
Unit 9's files so the other session's in-progress work isn't caught up in
it.
**Handed to the user, per the spec's own checklist (not code-doable):**
set a hard monthly spend cap in the Groq console for `GROQ_API_KEY`; set
one in the ElevenLabs account for `ELEVENLABS_API_KEY`; confirm the
  DeepSeek account balance is prepaid and kept low.

- 2026-09-14 (same day, eighth follow-up): **Delete-from-history + turn-card
  font consistency**, direct user request against a screenshot of the
  transcript. Ran `ui-ux-pro-max:ui-styling` as instructed — this app doesn't
  use Tailwind/shadcn (plain inline styles keyed to the CSS custom-property
  token system in `ui-context.md`), so the fix reuses that existing system
  rather than introducing a second styling approach for one change.
  **Delete conversations:** new `db/queries.ts` `deleteConversation(userId,
conversationId)` — ownership-checked, refuses (`false`) to delete the
  `active` conversation (there'd be nothing to fall back to and it'd violate
  the one-active-conversation invariant), otherwise deletes the row; `turns`
  cascade automatically via the existing `onDelete: "cascade"` FK in
  `db/schema.ts`, no separate turns delete needed. New `DELETE` handler on
  `app/api/conversations/[id]/route.ts` alongside the existing `GET`, same
  401/404 shape. `components/HistoryPanel.tsx`: each row split from one
  `<button>` into a flex row (a select `<button>` plus, for archived rows
  only, a `Trash` icon button) — a native `window.confirm()` guards the
  delete (no new dependency for a one-off confirmation), and a successful
  delete just filters the row out of local state (no refetch needed).
  **Current row darkened:** was `--surface-sunken` (`#F1F0EC`, the same tone
  used for hover) which didn't read as distinct at rest; now
  `--border-strong` (`#D8D7D3`), the same token the rate-switcher's active
  segment already uses for "this one is selected" — reused, not invented.
  **Turn-card label scaling + font-size parity fix
  (`components/TurnCard.tsx`):** the "You" and "hao.AI Tutor · {rate}x"
  labels were fixed-size `rem` values, not wired to `textScale` like every
  other transcript text line — both now `calc(... * ${textScale})`. The
  user's own turn was rendering visibly smaller than the AI's: different
  font family (`--font-sans` vs the AI hero's `--font-serif`) and different
  base sizes (pinyin `0.9375rem` vs AI's `1.125rem`; Hanzi `1.25rem` vs AI's
  `clamp(2.25rem, 6vw, 3.25rem)`). User's own turn now uses the identical
  pinyin/Hanzi font family and size as the AI hero line (still right-aligned
  and still in its own `--surface-sunken` card, so the two roles stay
  visually distinguishable by layout/color, not by a smaller font).
  `npx tsc --noEmit`, `npm run lint`, `npm test` (120 tests, unchanged — pure
  styling + one new CRUD path with no new branching logic worth its own
  test at this scale) all green. **Not yet done:** a live browser check
  (confirm delete removes the row and doesn't affect the active
  conversation, confirm the darker Current row and equal-size turn text
  visually) — same environment limitation as every other unit.
  **Unrelated concurrent change noticed during this pass, not made by this
  session — flagging, not fixed:** `db/queries.ts`'s `listConversations`
  gained a `db.selectDistinct(...)` call (filtering archived conversations
  down to ones the user actually replied to) that landed on disk mid-session
  from outside this conversation. It broke
  `test/queries-conversations-list.test.ts`'s second case
  (`TypeError: db.selectDistinct is not a function` — the test's
  `vi.mock("@/db/index")` only stubs `db.query.conversations.findMany`/
  `db.query.turns.findFirst`, not the query-builder chain `selectDistinct`
  needs): **120 -> 118 passing, 2 failing** as of the last `npm test` run in
  this session. This session's own `deleteConversation` edit to the same
  file is unaffected and still correct; the test's mock needs updating by
  whoever owns the `selectDistinct` change, not guessed at here.

- 2026-09-14 (same day, seventh follow-up): **Unit 8 UX/bug fixes from user
  report**, per `context/feature-spec/current-issues.md`.
  **Real bug fixed:** `components/HistoryPanel.tsx`'s `selectConversation`
  handled the "Current" row by just calling `onOpenChange(false)` — it never
  told `ConversationScreen` to leave `viewMode: "history"`. So opening
  History from inside an already-loaded archived conversation and clicking
  "Current" closed the panel but left the read-only history view on screen
  (matches the reported "clicking...current conversations doesnt work it
  doesnt redirect me"). Fixed by adding a new required `onGoLive: () => void`
  prop, called instead of the no-op for the active row;
  `components/ConversationScreen.tsx` passes `() => setViewMode("live")` —
  reusing the exact same state transition the working "Back to conversation"
  button already used, per the user's own "only wire it in because clicking
  back to conversation works" instruction.
  **Back button restyled + pinned:** the "← Back to conversation" button was
  plain in-flow text that scrolled away with the transcript. Now wrapped in a
  `position: sticky` bar (`top: 0`, blurred `--canvas` background,
  `border-bottom`) directly under the main sticky header, and the button
  itself gained a bordered `--surface` pill treatment with a Phosphor
  `ArrowLeft` icon instead of a literal "←" character, consistent with every
  other icon+label control in the file.
  **"New conversation" hidden until the user has actually chatted:** new
  `hasChatted = history.some(turn => turn.role === "user")`; the button only
  renders once true, since only the seeded AI greeting exists on a still-empty
  conversation and starting "another" one at that point is a no-op busywork
  click.
  **Loading state added:** new `newConversationPending` state, set around the
  `POST /api/conversations` call in `startNewConversation`; the button is
  disabled and its label swaps to "Starting…" while the request is in
  flight (previously no feedback during the fetch).
  **Gray shade for the current conversation in History:** the "Current" row
  in `HistoryPanel` now gets a `--surface-sunken` background at rest (not
  just on hover, which every row already had), so it's visually distinct
  from the archived rows in the list without adding a new token.
  Kept intentionally small/no new deps — this was a UI polish + one
  navigation bug pass, not a new unit; no schema/API/type changes.
  `npx tsc --noEmit` and `npm run lint` both clean after the change. **Not
  yet done:** a live browser click-through (open History mid-archived-view,
  confirm "Current" returns live; confirm the sticky back bar and gray
  Current row render correctly) — same environment limitation as every
  other unit's manual-check gap.

- 2026-09-14 (same day, sixth follow-up): **Unit 8 implemented** per
  `context/feature-spec/unit-8-history-conversation-lifecycle.md`.
  `db/queries.ts`: `createConversationWithGreeting` (already written by 7c)
  is now `export`ed with no change to its body; two new functions,
  `listConversations(userId)` (all conversations for a user, newest first,
  each joined to its earliest turn's `text_zh` for the list preview — one
  `findFirst` per conversation, acceptable at the existing 50-conversation
  cap) and `getConversationTurns(userId, conversationId)` (scoped by both
  IDs in the same query, `null` when not found or not owned by `userId` —
  never a fallback to an unscoped lookup). `types/index.ts` gained
  `ConversationSummary extends Conversation { preview: string }`. New
  `app/api/conversations/route.ts` (`GET` → `listConversations`, `POST` →
  `createConversationWithGreeting`, same response shape as 7c's
  `getOrCreateActiveConversation` so the client handles both identically)
  and `app/api/conversations/[id]/route.ts` (`GET` only, `404` on a `null`
  result — no `PATCH`/`DELETE`, loading history never mutates it). New
  `@radix-ui/react-dialog` dependency; new `components/HistoryPanel.tsx` —
  a right-sliding Radix `Dialog` per `ui-context.md`'s History spec
  (`max-width: 420px`, `--radius-lg` left corners, the `0 2px 8px` shadow
  exception, `--scrim` overlay, `--font-mono` dates, one-line CSS-truncated
  previews, `border-bottom` separators, `--surface-sunken` row hover),
  fetching the list on open (not on load) and fetching a selected archived
  conversation's turns on click; the "Current" row just closes the dialog.
  `components/ConversationScreen.tsx`: new `conversationId` state (seeded
  from the `conversation` prop, updated by "New conversation", now the
  value `send()` sends instead of the static prop) and `viewMode: "live" |
"history"` state; the previously-disabled history icon now opens
  `HistoryPanel`; selecting an archived row sets `viewMode = "history"` and
  stores the loaded turns in a separate `historyTurns` state (the live
  `history` state is never overwritten by a read-only view); while in
  history mode the turn list renders `historyTurns` instead of `history`,
  the mic/type-toggle/New-conversation bottom bar is hidden entirely, and a
  "← Back to conversation" button above the transcript returns to
  `viewMode = "live"`. New "New conversation" button (`POST
/api/conversations`, replaces `history` with the returned seeded-greeting
  `turns`, updates `conversationId`, resets `turnRates`, auto-plays the
  greeting via the existing `speak()` path). 25-turn cap: once
  `history.length >= MAX_TURNS_PER_CONVERSATION` (25, mirrors
  `app/api/chat/route.ts`'s existing server-side constant), the type/talk
  toggle, mic button, and send button are disabled and a `StatusLine`
  message appears ("This conversation is full — start a new one to keep
  going."); "New conversation" stays enabled throughout as the way out — no
  new server-side check added, since 7c's `countTurns`/`MAX_TURNS_PER_CONVERSATION`
  reject already covers the race case per the spec's explicit scope note.
  New `test/conversations-auth-guard.test.ts` (401 before any `db/queries.ts`
  call, all three routes, same mocking shape as `test/auth-guard.test.ts`),
  `test/conversations-ownership.test.ts` (a `null` `getConversationTurns`
  result yields `404`, proving no unscoped fallback), and
  `test/queries-conversations-list.test.ts` (`listConversations`'
  newest-first ordering, per-row preview text, and the empty-preview
  fallback when a conversation has no turns yet).
  **One lint fix during this pass:** `HistoryPanel`'s initial `useEffect`
  called `setError(null)` synchronously in the effect body, which
  `react-hooks/set-state-in-effect` flags — moved that reset into the
  fetch's success callback instead (error only clears once new data
  actually arrives, matching the rule's "setState in a callback triggered
  by an external event" guidance).
  **Unrelated concurrent change noticed during this pass, not made by this
  session:** `db/schema.ts` gained a `turns.seq` `bigserial` column (with
  a new `drizzle/0002_young_tusk.sql` migration, not yet confirmed applied
  to the live Neon database) and `db/queries.ts`'s existing turn-ordering
  `orderBy` clauses switched from `asc(turns.createdAt)` to `asc(turns.seq)`
  — landed on disk mid-session from outside this conversation. Read as a
  legitimate fix for a real tie-ordering bug (`appendTurnPair` inserts both
  turns of a pair with the same `now` timestamp, so ordering by `createdAt`
  alone can't guarantee stable order within a pair) and left in place per
  the standing instruction not to silently revert another party's work;
  this session's own new `getConversationTurns` was aligned to the same
  `asc(turns.seq)` ordering for consistency with every other query in the
  file. **Flagging, not resolved:** confirm the `0002_young_tusk.sql`
  migration has actually been applied to the Neon database before relying
  on any turn ordering in production — untracked/unapplied would silently
  break `getOrCreateActiveConversation`, `listConversations`, and this
  unit's `getConversationTurns` alike.
  `npx tsc --noEmit`, `npm run lint`, `npm run build` (route table now
  lists `/api/conversations` and `/api/conversations/[id]`), and `npm test`
  (120 tests, up from 117 before the DB `seq` migration's unrelated changes
  plus this unit's 3 new files) all green. **Not yet done:** the spec's own
  manual browser check (open history with only the current conversation;
  two+ archived conversations sorted correctly; select an archived row and
  confirm read-only load + hidden controls + "Back to conversation"; "New
  conversation" mid-conversation; drive a conversation to 25 turns and
  confirm the disabled-input message) — needs a real signed-in session,
  same environment limitation as every prior unit's manual-check gap.

- 2026-09-14 (same day, fifth follow-up): **"Sign up" link went nowhere; a
  real `/sign-up` route added.** User report: clicking "Sign up" on the
  sign-in card did not go to a sign-up page. Confirmed by reading the link's
  own target in the live DOM (`Sign up -> http://localhost:3000/sign-in`) and
  by `curl`: `/sign-up` returned **404**. Two causes, both mine: (a) the
  previous follow-up set `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in`, pointing
  sign-up back at the sign-in page, and (b) no `/sign-up` route existed at
  all. That second one traces to an **incorrect assumption in
  `context/feature-spec/unit-6-auth-clerk.md`**, which stated Clerk's
  `<SignIn>` covers sign-up so "no separate `/sign-up` route ... is needed" —
  not true in practice: `<SignIn>` renders a "Sign up" link that navigates to
  the configured sign-up URL, which has to resolve to a real route. Treat
  that line of the Unit 6 spec as superseded.
  Fixes: new `app/sign-up/[[...sign-up]]/page.tsx` (Clerk's `<SignUp>` inside
  the same `AuthShell` + `authAppearance`, its own heading/subheading, so it
  matches the sign-in screen); `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`; and
  **`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/` +
  `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`** added pre-emptively,
  because this instance's own config (read from its public `/v1/environment`
  endpoint) has `after_sign_in_url`/`after_sign_up_url` pointing at
  `https://topical-jennet-6349.accounts.dev/default-redirect` — without the
  overrides, a successful sign-in would bounce the user to Clerk's hosted
  portal instead of back into the app. All four vars are in `.env.local` and
  `.env.example`. **Env changes need a dev-server restart to take effect.**
  Verified live: `/sign-up` now returns 200, the link's target is
  `/sign-up`, and clicking it lands on `/sign-up` rendering "Create your
  hao.AI account". `npm run build` (route table lists both
  `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]`), `lint`, and
  `test` (89) green.
  **Forgot-password, investigated in the same pass:** the user reported it
  behaving like the Sign up link. Routing and rendering are in fact fine —
  `/sign-in/reset-password`, `/sign-in/factor-one` and `/sign-in/factor-two`
  all return 200 (the `[[...sign-in]]` optional catch-all handles them), and
  visiting `/sign-in/reset-password` renders Clerk's real reset UI ("New
  password" / "Confirm password" / "Reset Password") inside our shell. Best
  explanation for the reported symptom is the **webpack HMR remount loop
  fixed in the previous entry**: "Forgot password?" transitions the Clerk
  form _in place_, and a tree re-render every ~1s would snap it back to the
  start screen, looking exactly like a dead link. Not reproducible end-to-end
  from here without a valid account password step (a programmatic fill of the
  identifier field does not register in Clerk's controlled React inputs), so
  this one is **awaiting the user's retest after a dev-server restart** — do
  not mark it verified until then.

- 2026-09-14 (same day, fourth follow-up): **Two real bugs the user reported
  on the redesigned sign-in screen — a render loop and broken Clerk colors.**
  1. **Render loop was `next dev --webpack`.** The user saw `/sign-in`
     "always rendering on a loop", matching a flood of `GET /sign-in` lines in
     their terminal. Diagnosed by measurement, not guesswork: with no browser
     client attached the server was idle (0 requests), with one **fresh,
     signed-out** client it took exactly 8 requests in 8s — a clean 1.00s
     cadence with **zero** server-side `Compiling` lines, i.e. a client-driven
     HMR poll, not a redirect loop and nothing to do with auth state (an
     earlier guess that it was this session's own `browse` tab was wrong, and
     so was a guess about a `/` ↔ `/dashboard` redirect ping-pong — the
     `/dashboard` requests turned out to be incidental, and the loop
     reproduced with no `redirect_url` at all). A/B test settled it: the same
     page under Turbopack did 0 requests in 10s with a clean `[HMR] connected`
     and no `[Fast Refresh] rebuilding` spam. Fix: `package.json`'s dev script
     dropped `--webpack` (now plain `next dev`). `--webpack` had been added
     incidentally in unrelated commit `f7e45c1` and contradicted this file's
     own 2026-09-10 decision ("Next.js 16.3.4 (App Router, Turbopack)") —
     `npm run build` was already on Turbopack, dev was the odd one out.
     **Note for anyone with a dev server already running: restart it**, since
     the script change only takes effect on a fresh `npm run dev`.
  2. **Clerk's form rendered a black block over its footer.** The "Sign up"
     link, "Secured by Clerk" and the "Development mode" badge were near
     invisible on solid black. Cause: `components/auth/clerk-appearance.ts`
     passed `colorBackground: "transparent"` plus `var(--token)` strings as
     Clerk theme variables. Clerk derives its own shades (hover, muted,
     borders, the footer surface) by doing **color math in JS** on those
     strings before any CSS applies — it cannot resolve `var()`, and
     `transparent` made every derived surface collapse to black. Fixed by
     passing concrete hex values copied from `app/globals.css`'s tokens
     (`#111111` --action/--ink, `#FFFFFF` --surface, `#787774`
     --text-secondary, `#2F3437` --text, `#9F2F2D` --err-text, `4px`
     --radius-sm), with a comment at the top of the file recording this as a
     deliberate, documented exception to `code-standards.md`'s "no raw hex in
     components" rule (a third-party theming API that requires real colors)
     and a reminder to keep them in sync with the tokens. Also dropped
     `padding: 0` from `.auth-clerk-card`, which had been clipping Clerk's
     absolutely-positioned "Last used" badge at the card's top edge.
     `npm run build`/`lint`/`test` (89 tests) green. Live-verified via `browse`
     at 1280px and 400px: footer now renders on a light surface with legible
     text, no clipped badge, no horizontal scroll, and the request count for a
     client parked on `/sign-in` dropped from 8-per-8s to 0.

- 2026-09-14 (same day, third follow-up): **Real bug found and fixed: sign-in
  redirected to Clerk's hosted Account Portal, not our own `/sign-in`.** The
  user sent a screenshot proving it — the browser address bar showed
  `topical-jennet-6349.accounts.dev/sign-in` (Clerk's hosted UI, dark theme,
  none of our styling) instead of `localhost:3000/sign-in`. **Root cause:**
  `.env.local`/`.env.example` never set `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (or
  `..._SIGN_UP_URL`) — without it, `auth.protect()` doesn't know `/sign-in`
  is this app's own route and falls back to Clerk's hosted portal. Fixed by
  adding `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` and
  `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in` to both files. **Self-correction:**
  earlier in this session an `AskUserQuestion` wrongly concluded this
  couldn't be a real issue based on a `browse` check that read
  `window.location.pathname` as `/sign-in` right after redirect — that read
  was misleading (mid-navigation or a stale/cookied headless session masked
  the actual external hop); the user's own screenshot was the evidence that
  settled it. Bundled in the same change (prompted by the same
  `createRouteMatcher` deprecation warning surfaced earlier): **`app/page.tsx`
  split into an async Server Component + `components/ConversationScreen.tsx`**
  (all of the prior client logic moved verbatim, no behavior change) so the
  root route now runs a resource-based `auth()`/`redirectToSignIn()` check
  itself instead of relying solely on middleware — the user explicitly chose
  this over leaving the deprecation alone. `middleware.ts` simplified to a
  bare `clerkMiddleware()` (dropped `createRouteMatcher`/`auth.protect()`
  entirely — API routes already had their own `requireUser()` calls, so this
  removes the last user of the deprecated API without any resource going
  unprotected). This actually re-aligns with `architecture.md`'s stack table
  ("Server Components for the authenticated shell"), which Unit 6's original
  "no split needed" call had knowingly deviated from for simplicity — no
  further doc changes needed since architecture.md already described this
  target shape. `npm run build` (route table now shows `/` as `ƒ` dynamic,
  confirming the server-side check runs), `npm run lint`, and `npm test` (89
  tests) all green. Live-verified via `browse` + a dev-server restart (env
  changes need a restart to load): `curl -D-` on `/` now shows `Location:
http://localhost:3000/sign-in?redirect_url=...` (own domain, not
  `accounts.dev`), and a fresh navigation lands on the aurora-shell `/sign-in`
  page with no `createRouteMatcher` or "Structural CSS" warnings in console.
  **Also clarified, no code change:** a flood of `GET /sign-in` lines the
  user saw in their terminal was traced to this session's own `browse` test
  tab reloading repeatedly, not an app bug — confirmed by checking file
  mtimes (unchanged) and watching hot-update churn stop the moment the tab
  was navigated away from `/sign-in`.

- 2026-09-14 (same day, second follow-up): **`@clerk/ui` added to pin
  Clerk's component structure**, per the user's request after seeing a
  "Structural CSS detected... `body.cl-component`, `.cl-component
.button:focus-visible`" warning in the browser console
  (`code=structural_css_pin_clerk_ui`) on the redesigned `/sign-in` page.
  **Self-correction:** initially misdiagnosed this warning as coming from an
  unrelated Clerk-hosted "Account Portal" page based on the bundle filename
  (`_app-*.js?dpl=...`) — wrong; reproduced it directly on our own
  `localhost:3000/sign-in` via `browse` console capture (timestamps lined up
  exactly with our own dev server's HMR cycle). It's Clerk's own default
  component CSS (not anything in `app/globals.css` or
  `clerk-appearance.ts`) that its own newer version's pin-check flags
  without `@clerk/ui` installed. `npm install @clerk/ui` (`^1.32.3`); `app/layout.tsx`
  now imports `{ ui } from "@clerk/ui"` and passes it as `<ClerkProvider
ui={ui}>`, exactly as Clerk's own warning message instructs. `npm run
build`/`lint`/`test` (89 tests) all green. Live-verified via `browse`: a
  fresh reload of `/sign-in` no longer logs the structural-CSS warning (only
  the expected "loaded with development keys" notice remains), and the page
  renders pixel-identical to before (no visual regression).

- 2026-09-14 (same day, follow-up): **Sign-in screen redesigned**, ported
  from a GoldKh reference spec the user shared (two-panel auth shell +
  animated decorative background), swapped for hao.AI's own branding and
  color tokens. User picked "full decorative package, adapted to hao.AI
  colors" over two lighter options when asked, and explicitly declined the
  spec's custom hard-navigate sign-out button (keeping Clerk's built-in
  `<UserButton>` sign-out as shipped in the base Unit 6 work).
  New `components/auth/AuthShell.tsx` — a two-panel `--surface` card
  (`--radius-lg`, `1px solid var(--border)`, the `0 2px 8px` shadow ceiling)
  with a left brand panel (hidden below `768px`) showing the existing
  `app/icon.svg` mark + `hao.AI` serif wordmark over an animated backdrop,
  and a right form panel with a serif heading/sans subheading and a slot for
  Clerk's `<SignIn>`. New `components/auth/clerk-appearance.ts` — maps
  Clerk's `variables` onto hao.AI's own CSS custom properties (no
  `@clerk/ui`/shadcn theme dependency added) and forces Clerk's `rootBox`/
  `cardBox`/`card` to `width: 100% !important` (a real bug caught live: the
  reference spec's own docs warned Clerk ships a fixed `400px` card width
  that overflows a narrow panel — confirmed via a `browse` screenshot at
  400px showing the card's buttons/divider clipped at the card edge; fixed
  by adding a `.auth-clerk-fluid` class with `!important` widths, applied to
  all three wrapper elements, not just `card`). `app/sign-in/[[...sign-in]]/
page.tsx` rewritten to use `AuthShell` + `authAppearance`.
  **Skipped from the reference spec (ponytail/YAGNI):** `@clerk/ui` (shadcn
  theme — unneeded, hao.AI already has its own token system), `motion` (the
  reference's animated cursor-tracking mascot — replaced outright with the
  static `app/icon.svg` mark, no interactivity requested), `lucide-react`
  (kept Phosphor-only per `ui-context.md`'s banned-icon-sets rule — not that
  any icon ended up needed, since the "back to welcome" link doesn't apply
  here: hao.AI has no separate public landing page to link back to), `sonner`
  toast + the custom hard-navigate `SignOutButton`/`AccountButton` (user
  declined; Clerk's built-in `<UserButton>` sign-out is unchanged from the
  base Unit 6 implementation).
  **Standards/scope updated in the same change** (per the project's own
  rule that a scope/standards change must be documented where it happens):
  `ui-context.md`'s "Sign-in" section rewritten with a new "Narrow exception
  (2026-09-14)" paragraph, and `code-standards.md`'s Styling section gained
  one sentence pointing to it — both explicitly scoped to `/sign-in` only,
  reusing existing tokens (`--brand-accent`, `--mic-ring`) rather than
  introducing new hex values, and respecting `prefers-reduced-motion`.
  **Verified:** `npm run build`/`lint`/`test` (89 tests) all green after the
  redesign and again after the fluid-width fix. Live-verified via `browse`
  against `npm run dev` (real Clerk dev keys already in `.env.local`): the
  aurora/sparkle backdrop and HAO logo render in the left panel, the Clerk
  form renders in the right panel with no console errors, no horizontal
  scroll or clipped content at `400px` or `1280px`, brand panel correctly
  hides below `768px`, and signed-out `/` still redirects to `/sign-in`
  with no redirect loop on `/sign-in` itself. **Noted, not a bug:** the dark
  "Development mode" bar at the bottom of the Clerk card (with "Secured by
  Clerk" / "Don't have an account? Sign up" rendered low-contrast on it) is
  Clerk's own stock development-instance watermark, unrelated to this app's
  styling — it will not appear once real production Clerk keys replace the
  dev keys. **Still not done:** an actual fresh sign-up + full Unit 1-5
  round trip (needs a real account, not just a page-load check).

- 2026-09-14: **Unit 6 implemented** per
  `context/feature-spec/unit-6-auth-clerk.md`. `@clerk/nextjs` added.
  `.env.example` gained `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/
  `CLERK_SECRET_KEY`. New `middleware.ts` (`clerkMiddleware()` +
  `createRouteMatcher(["/sign-in(.*)"])`, `auth.protect()` on every other
  route, standard Next.js matcher excluding `_next`/static files). New
  `lib/auth.ts` (`requireUser()` wrapping Clerk's `auth()`, `AuthError`
  narrowed to `401`, byte-identical to the spec's snippet). Each of
  `app/api/chat/route.ts`, `app/api/transcribe/route.ts`,
  `app/api/speak/route.ts` gained the identical `try { await requireUser() }
catch (e) { if (e instanceof AuthError) ... }` block as `POST`'s first
  statement, per `code-standards.md`'s route order. `app/layout.tsx` wrapped
  in `<ClerkProvider>` — no other change (fonts/metadata untouched).
  `app/page.tsx` gained `<UserButton />` in the top-right corner flex group,
  after the disabled history-icon `<span>` (outermost position, per the
  2026-09-11 resolved placement decision). New
  `app/sign-in/[[...sign-in]]/page.tsx` — centered Clerk `<SignIn>`,
  `max-width: 400px`, `--canvas` background, no custom chrome; Clerk's
  hosted component covers sign-up too since the Clerk dashboard is
  configured for open sign-up. New `test/auth-guard.test.ts` — mocks
  `@clerk/nextjs/server`'s `auth` (returns `{ userId: null }`) and spies on
  `callDeepSeek`/`transcribeAudio`/`synthesizeSpeech`; one case per route
  asserting `401` and that the provider function is never called, same
  `vi.mock` shape across all three per the spec's "keep the mocking pattern
  identical" instruction. No DB, no rate limiting, no allowlist, no styling
  change beyond the new sign-in page — matches the spec's scope exactly.
  **Bug caught and fixed during this session's own verification:** the first
  pass at editing `app/api/transcribe/route.ts` and `app/api/speak/route.ts`
  added the `requireUser`/`AuthError` import but not the actual
  `try { await requireUser() } catch ...` call at the top of `POST` (a tool-
  level edit conflict silently dropped that half of the change) — caught
  immediately by `npm run lint` (`'AuthError' is defined but never used`)
  and by two failing `auth-guard` tests (transcribe: crashed on
  `text.trim()` because the mocked STT call was never short-circuited;
  speak: returned `200` instead of `401`). Fixed by adding the missing block
  to both routes; re-run below is clean.
  **Verification status:** `npm run build` (compiles clean; Next.js prints a
  deprecation notice that `middleware.ts` should migrate to `proxy.ts` per
  its `middleware-to-proxy` codemod — not acted on here since the spec
  explicitly names `middleware.ts` and it still works; worth revisiting if
  Next.js drops the old convention), `npm run lint` (0 errors, 0 warnings),
  and `npm test` (89 tests, including the 3 new `auth-guard` cases) are all
  green. `grep -R "CLERK_SECRET_KEY" app components` finds nothing. **Not yet
  done:** the manual browser check (signed-out redirect to `/sign-in`, fresh
  sign-up, full Unit 1-5 flow unchanged, no redirect loop on `/sign-in`
  itself) — needs real Clerk keys in `.env.local` (Prerequisite #1) and
  public sign-up confirmed left on in the Clerk dashboard (Prerequisite #2)
  first. Record that check here, then commit.

- 2026-09-12 (same day, fifth follow-up): **Architecture cleanup on
  `app/page.tsx`** (795 lines → well under 400), following an
  `/improve-codebase-architecture` review the user asked for, then asked to
  implement in full. Four changes, all mechanical (no behavior/UI change):
  1. **Four duplicated localStorage preferences collapsed into one factory.**
     `hsk_level`, `zh_only_mode`, `display_support`, and `text_scale` each had
     their own hand-written `read`/`getServer`/`subscribe`/`persist` quartet
     for `useSyncExternalStore`. New `components/preference-store.ts`
     (`createPersistedPreference<T>({ storageKey, changeEvent, fallback,
isValid, parse })`) replaces all four; `app/page.tsx` now just
     instantiates `hskLevelPreference`/`zhOnlyModePreference`/
     `displaySupportPreference`/`textScalePreference` and calls `.read`/
     `.getServer`/`.subscribe`/`.persist` on them. Lives in `components/`, not
     `lib/` — `lib/` is server-only per `architecture.md`'s boundary table
     ("Must not contain: ... client-imported code") and this runs from a
     Client Component.
  2. **Per-turn rendering extracted to `components/TurnCard.tsx`.** The
     ~230-line inline JSX for a single turn (user bubble vs. AI card, the
     display-support branching, the per-turn rate buttons, the correction
     disclosure) is now one `forwardRef` component; `app/page.tsx`'s
     `history.map` is a single `<TurnCard ... />` call per turn.
  3. **The transcribe/chat/speak pipeline extracted to
     `components/conversation-client.ts`.** Three exported functions
     (`transcribe`, `reply`, `speak`), each returning a typed
     `ClientResult<T> = { ok: true; data: T } | { ok: false; error: string }`
     instead of a raw `fetch` + hand-rolled `errorMessage` duplicated three
     times. `app/page.tsx`'s `handleRecordedAudio()`/`send()`/`speak()` now
     just call these and manage React state.
  4. **Audio size cap de-duplicated across the client/server seam.**
     `components/MicButton.tsx` had its own `MAX_AUDIO_BYTES_CLIENT = 1 *
1024 * 1024`, duplicating `app/api/transcribe/validate.ts`'s
     `MAX_AUDIO_BYTES` (the actual server-enforced invariant #6 value).
     `MicButton.tsx` now imports `MAX_AUDIO_BYTES` directly from
     `validate.ts` (confirmed safe: that file is pure/HTTP-free, no
     server-only APIs, so it's fine to import into a Client Component).
     Also removed a stale comment on `MicButton.tsx` claiming the duplication
     was required by "`ai-workflow-rules.md` §2.4" — that section does not
     exist anywhere in the file; the comment also falsely claimed the values
     were duplicated from `app/page.tsx`, which never had them. Flagging in
     case the citation was meant to point at a real (if differently-worded)
     rule elsewhere — none was found.
     `npm run build`, `npm run lint`, `npx tsc --noEmit`, and `npm test`
     (86 tests, unchanged — this was a structural extraction, not new logic)
     all green after each of the four steps and again at the end. Not yet
     manually re-verified in a live browser (no rendering/behavior change is
     expected, but the Unit 5 manual-verification gap below still applies
     regardless).

- 2026-09-12 (same day, fourth follow-up): **CodeRabbit fix — disabled mic
  button couldn't report why.** `components/MicButton.tsx`'s `<button>` used
  the native `disabled={disabled}` attribute, which stops the browser from
  firing pointer/keyboard events at all — so `handlePointerDown`'s existing
  `if (disabled) { if (disabledMessage) onMicError(disabledMessage); return; }`
  guard was dead code for real users; `disabledMessage` (e.g.
  `MIC_BLOCKED_MESSAGE` while TTS is playing) never reached `onMicError`.
  Fixed by switching to `aria-disabled={disabled}` and keeping the JS guard,
  per CodeRabbit's review comment — the button still looks/reads as disabled
  (styling was already keyed off the `disabled` prop, not the attribute) but
  now actually dispatches events so the guard can run. No prop/type change,
  no caller update needed (`app/page.tsx`'s usage is unaffected). No build/
  lint/test run yet for this change — single attribute swap, low risk; run
  before the next commit alongside the rest of this session's pending Unit 5
  batch.

- 2026-09-12 (same day, third follow-up): **Hover tooltips on icon-only
  controls.** User request: icon-only buttons shouldn't require guessing —
  hovering should show what they do. Added native `title` attributes in
  `app/page.tsx` to the buttons that had icons but no visible text: the
  replay/speaker button ("Play audio"), the talk/type toggle (mirrors its
  existing `aria-label`), the send button ("Send"), and the two disabled
  buttons (history clock: "Conversation history (coming soon)"; the bottom-
  bar plus: "Attach (coming soon)"). `ZhOnlyToggle` already had a `title`
  from an earlier session. `DisplaySupportToggle` and `HskPicker` weren't
  touched — both already show text labels, not icon-only.
  **Bug caught on user report ("doesn't show anything when I hover"):**
  Chrome/Firefox suppress all mouse events, including hover/`title`
  tooltips, on elements with the `disabled` attribute. Fixed the two
  disabled buttons (history, attach) by moving `title` onto a wrapping
  `<span>` instead of the `<button>` itself — the span isn't disabled, so it
  still receives hover. The three enabled buttons (speaker, keyboard toggle,
  send) use `title` directly on the `<button>` and should already work
  natively. No build/lint/test run yet for this change — plain attribute
  additions, low risk; run before the next commit alongside whatever else is
  pending in this session's Unit 5 batch.

- 2026-09-12: **Mockup-driven feature adoption**, following a
  requirements-grilling session against a Stitch-generated redesign the user
  shared (a "hao.AI" screenshot with streaks, a scenario picker, a display-
  density toggle, quick-reply chips, a richer correction callout, per-message
  playback speed, an accuracy score, tier badges, and a shadowing-drill
  button). Adopted only what didn't collide with documented scope and cleared
  the user's own "easy to add" bar:
  - **Display Support toggle** — new `components/DisplaySupportToggle.tsx`,
    a 4-way segmented control (All / Hanzi+Pinyin / Hanzi Only / Audio)
    wired into `app/page.tsx` via a new `DisplaySupportMode` type
    (`types/index.ts`) and a `localStorage`-backed `useSyncExternalStore`
    (`display_support` key), same pattern as the existing `hsk_level`/
    `zh_only_mode`/`text_scale` controls. Conditionally hides the AI turn's
    pinyin/English/Hanzi lines; the correction disclosure is unaffected by
    this mode.
  - **Per-message speaking rate**, replacing the single app-wide rate
    switcher. The old `speakingRate`/`rateMenuOpen` state and the bottom-bar
    rate-switcher UI (plus its `.rate-switcher`/`.rate-options` CSS) were
    removed from `app/page.tsx`; a `turnRates: Record<number, SpeakingRate>`
    map replaces them, with a small 0.75x/1x/1.5x button row rendered next to
    each AI turn's replay button (`SPEAKING_RATES`, unchanged stops).
    `speak()` now reads `turnRates[index] ?? 1` instead of one global value.
    No DB implication — `speaking_rate` in `architecture.md`'s `settings`
    table was already "not yet built"; this was pure client React state
    before and after.
  - **"Native Polish Tip" correction restyle** — `components/
CorrectionDisclosure.tsx`'s trigger label changed from "Correction" to
    "Native Polish Tip", and its content now leads with a small "Easy Fix"
    pill using the new `--brand-accent` token. Same `correction: string`
    prop, same Radix Collapsible mechanics, no schema change — deliberately
    not the mockup's strikethrough-diff view (would need DeepSeek to return
    structured before/after text; rejected as not "easy").
  - **Brand-accent token exception** — `app/globals.css` gained
    `--brand-accent`/`--brand-accent-hover`/`--brand-accent-text`
    (`#FF6B6B`, sourced from the untracked `app/icon.svg` panda mark, which
    matches the mockup's accent color). This is a narrow, documented
    exception to `code-standards.md`'s "accents are semantic only" rule —
    scoped to the wordmark icon and the "Easy Fix" tag; every other pastel
    (`--live-*`, `--warn-*`, `--ok-*`, `--err-*`) stays semantic-only.
    `app/page.tsx`'s top-left wordmark now renders `<img src="/icon.svg">`
    (served automatically by Next.js's `app/icon.svg` file convention — no
    new route needed) next to the "hao.AI" text.
  - **Rejected outright** (named conflicts with `project-overview.md`'s
    out-of-scope list, not revisited): the streak/goal/round-count dashboard
    header, the scenario/lesson picker and "Today's Goal" banner, the
    accuracy-score badge on user turns, the "SCHOLAR" tier badge, and the
    unlabeled book icon (purpose never clarified). Also rejected: the full
    shadowing-drill (mic re-record + comparison) feature and per-word slow
    playback — not out-of-scope, but nontrivial (word-level audio
    segmentation) and never actually requested once the mockup's simpler
    per-message-speed reading was confirmed.
  - **Shelved, not decided** — streak counter and an ephemeral (non-
    persisted) version of the quick-reply chips; see "Open Questions" above.
    `ui-context.md` and `code-standards.md` updated in the same change (see
    their own diffs) to document the new control, the per-message rate model,
    the restyled correction component, and the brand-accent exception, per
    `ai-workflow-rules.md` §6.2. `npm run build`/`lint`/`test` (86 tests, no new
    ones needed — this is display logic already covered by existing
    rendering, not new branching worth its own check) all green. Manually
    verified in a live browser (`browse` skill against the already-running
    `npm run dev`): all four display-support modes render correctly, the
    per-message rate row is independent per turn, and the restyled correction
    callout matches the mockup's look (verified via a static token-accurate
    preview after a live DeepSeek round trip intermittently 500'd — see below).
    **Unrelated pre-existing issue noticed, not fixed** (out of this session's
    scope): `POST /api/chat` intermittently returned a `500` with
    `SyntaxError: Unexpected end of JSON input` during manual testing — looks
    like a DeepSeek response-parsing edge case in the existing route, unrelated
    to anything touched here. Flagging per `ai-workflow-rules.md` §6.7 ("never
    let code and docs drift silently... report it").

- 2026-09-12 (same day, follow-up): **Turn cards + bigger controls**, per a
  direct user request against the same mockup ("make the buttons bigger and
  make the chat container just like the screenshot"). Both AI and user turns
  are now wrapped in a card (`--surface`/`--surface-sunken`, `--border`,
  `--radius-lg`, the one permitted `0 2px 8px` shadow ceiling — extending
  that ceiling's use beyond the History panel/level dialog to every turn
  card, a deliberate part of the Q12/Q13 "revise the token system toward
  this mockup" decision already made this session, not a new one). AI turn
  cards gained a header row (a small `--brand-accent` circle badge with a
  Phosphor `Info` glyph, "hao.AI Tutor · {rate}x" label, and a timestamp)
  and moved the replay button + per-message rate row to a footer below a
  divider, matching the mockup's layout more closely than the earlier
  top-right-stacked version. New client-only `turnTimestamps: number[]`
  state in `app/page.tsx` (seeded via a lazy `useState` initializer, appended
  alongside every `setHistory` call in `send()`) and a `formatTurnTime`
  helper — display-only, not part of `Turn`, `ChatResponse`, or any API
  contract. Bumped icon/font/padding sizes on the small controls (HSK tag,
  history icon, A-/A+, `ZhOnlyToggle`, `DisplaySupportToggle`, bottom-bar
  icons, per-turn replay/rate buttons) — the mic button itself was
  deliberately left untouched (already enlarged in an earlier session, with
  a detailed pixel-tied animation spec; resizing it wasn't asked for here).
  **Regression caught and fixed in the same step:** the corner controls were
  `position: absolute`, so adding the Display Support toggle's four buttons
  made the top-left cluster wide enough to visually overlap the top-right
  HSK tag/history icon at 400px width — two absolutely-positioned siblings
  don't push each other when either wraps. Fixed by converting both corner
  clusters into one normal-flow flex header (`flex-wrap: wrap`,
  `justify-content: space-between`), so they wrap onto their own lines at
  narrow widths instead of overlapping; the transcript column's top padding
  was also simplified since it no longer needs to reserve space for an
  absolutely-positioned header. Verified at 400px via `browse`: no
  horizontal scroll (`document.documentElement.scrollWidth >
document.documentElement.clientWidth` is `false`), header wraps cleanly.
  **Also noticed, not part of this change:** a concurrent edit (from outside
  this session) added a `disabled`/`disabledMessage` prop pair to
  `components/MicButton.tsx` and wired it in `app/page.tsx` to block
  recording while TTS is playing (`MIC_BLOCKED_MESSAGE`). Left in place — it
  merged cleanly with this session's edits and looks correct.
  `npm run build`/`lint`/`test` (86 tests) all green after both the restyle
  and the responsive fix. Manually verified in a live browser (desktop
  1280px, mobile 400px): turn cards render correctly for both roles,
  timestamps populate on new turns, header wraps without overlap at 400px.

- 2026-09-12 (same day, second follow-up): **Display Support converted to a
  popover; sizes moderated.** User clarified the "too big/zoomed" look was
  their own browser at 50% zoom, not a real bug — but asked for a general
  size sanity check plus one concrete change: the Display Support control
  (4 always-visible buttons) was crowding the header, especially at 400px.
  Ran `/impeccable` (narrow-refinement mode, no `PRODUCT.md` in this repo —
  proceeded on the incumbent implementation per its own routing rule) and
  its mechanical detector (`detect.mjs`, zero findings) over the changed
  files. Converted `components/DisplaySupportToggle.tsx` from a segmented
  row to a single trigger pill + Radix Popover, matching `HskPicker.tsx`'s
  existing pattern exactly (trigger pill, `Check` on the active row,
  click-to-select-and-close) — collapses 4 header buttons to 1. Moderated
  the same session's earlier size bumps back down (HSK tag, history icon,
  A-/A+, `ZhOnlyToggle`, bottom-bar icons, per-turn replay/rate buttons) to
  values between the pre-mockup originals and the earlier bumped pass —
  bigger than before, not maxed out. `npm run build`/`lint`/`test` (86
  tests) green; verified live at 1280px and 400px — header now wraps onto
  at most two tidy rows, popover opens/selects correctly, no crowding.

- 2026-09-11: **Unit 5 implemented** per
  `context/feature-spec/unit-5-one-screen-siri-mic.md`, then extended with
  several live user usability requests in the same session (see below).
  `app/globals.css` got the exact `:root` token block from `ui-context.md`
  plus the one `body` rule. `app/layout.tsx` loads `Newsreader`/`Geist`/
  `Geist Mono` via `next/font/google` as `--font-serif`/`--font-sans`/
  `--font-mono`. New `@radix-ui/react-popover` + `@radix-ui/react-collapsible`
  deps. New `components/mic-button-helpers.ts` (`isMisTap`, `smoothLevel`,
  extracted for testability) + `test/mic-button-helpers.test.ts` (4 cases,
  boundary-tested). New `components/MicButton.tsx` — press/hold/release UI,
  canvas `AnalyserNode`-driven harmonic-wobble ring (rAF loop, ripples, inner
  echo, ~260ms release fade, ~320ms mis-tap threshold, permission-denied
  synthetic-signal fallback, `prefers-reduced-motion` branch dropping wobble/
  ripples but keeping the level-driven radius swell), recording lifecycle
  (`getUserMedia`/`MediaRecorder`/blob assembly/`MAX_AUDIO_BYTES_CLIENT`
  check) moved here from `page.tsx` per the spec. New `components/HskPicker.tsx`
  (Radix Popover, six rows, `Check` on active level, OK confirmation).
  New `components/CorrectionDisclosure.tsx` (Radix Collapsible, renders
  nothing when `correction === ""`). `app/page.tsx` rewritten: dev-harness
  `<h1>` removed, typed input promoted to a permanent type/talk toggle
  (`inputMode` state, in-memory only, always opens in talk mode), status
  line consolidated (error/micError/speakError each render via a shared
  `StatusLine` component so one never silently hides another), turn
  rendering restyled inline (AI = pinyin/hero/English + replay + correction;
  user = a distinct card, see below), auto-scroll to the newest turn via
  `scrollIntoView`. No change to `send()`, `handleRecordedAudio`'s network
  calls, or `speak()`'s contract — confirmed against the live (already-
  pivoted) `/api/speak` route, which takes `{ text }` only and applies rate
  client-side via `audio.playbackRate` (an ElevenLabs-speed-limit workaround
  from an earlier session), not the `{ text, rate }` shape the original
  spec draft assumed.
  **Documented deviation from the spec's literal rate-toggle wording:**
  `ui-context.md` describes a two-segment slow/normal control, but the live
  app already exposes rate options with rate applied via `playbackRate`, not
  sent to the server. Per `ai-workflow-rules.md` §4.3 ("if an existing
  pattern in the codebase already answers it, follow that pattern"), the
  toggle was built as an N-segment control over the existing rate options,
  restyled with tokens, no behavior change — not narrowed to 2 segments.
  `npm run build`/`lint`/`test` (86 tests) all green; `grep` for raw hex
  outside `globals.css` and for `NEXT_PUBLIC` both clean.
  **Live usability requests handled in the same session (user-directed,
  overriding `ai-workflow-rules.md` §2.5's default "don't touch tokens/sizes"
  rule per its own front-matter: a direct user instruction wins):**
  mic button enlarged 72px→96px (canvas ring 164px→220px, base radius scaled
  proportionally), all control icons and hit-target padding enlarged, hero/
  pinyin/English/UI type scale increased, transcript column widened
  640px→720px; the rate toggle's active segment restyled from a subtle
  `--surface-sunken` fill to `--border-strong` + bold text (was reported as
  "not clear enough"); a user-adjustable text-size control (`A-`/`A+`,
  `textScale` state, 5 steps 0.85x–1.5x, `localStorage`-persisted under
  `text_scale`, same non-authoritative-local-cache pattern as `hsk_level`)
  added scoped to only the transcript's Chinese/pinyin/English text — UI
  chrome (buttons, icons, labels) deliberately excluded per the request; a
  `hao.AI` serif wordmark added top-left (previously absent); the user's own
  turn restyled from a plain line to a right-aligned card (`--surface-sunken`
  fill, `--border-strong` border, bold "You" label) so it's clearly distinct
  from the AI's unboxed hero-text turn at a glance — intentionally not using
  any `--live-*`/`--warn-*`/etc. semantic pastel for this, since those tokens
  are reserved for state (recording/correction/error), not permanent
  decoration, per `ui-context.md`'s "Banned" list and `code-standards.md`'s
  "Accent pastels are semantic only ... never decoration."
  **Bug caught and fixed during manual browser verification:** at 400px
  width the dev-only zh-only-mode toggle (a pre-existing control, absolutely
  positioned independently) overlapped the transcript's pinyin line, because
  it was a second stacked absolute row not accounted for in the transcript's
  top padding. Fixed by merging it into the same top-left control row as the
  wordmark/text-scale buttons instead of a second row. Confirmed via
  screenshot at 400px that the overlap is gone and there's no horizontal
  scroll.
  **Flagged, not fixed (needs the user's call):** a concurrent edit to
  `app/page.tsx` from outside this session (visible mid-session as an
  external file-change notice) added `import { toPinyin } from
"@/lib/pinyin"` to render pinyin under the user's own turn client-side.
  This violates `architecture.md`'s folder-ownership rule ("`lib/` ...
  Never imported by a client component") — it happens to work today because
  `pinyin-pro` has no Node-only APIs, but it's a boundary violation as
  written and wasn't part of this session's edits. Left in place per the
  standing instruction not to silently revert another party's change; the
  user should confirm whether this is wanted and, if so, either accept the
  boundary exception explicitly in `architecture.md` or move the pinyin call
  server-side (e.g. compute it in `send()`'s response shape instead).
  **Manual browser check performed this session (via headless `browse`,
  `npm run dev`, no real provider keys):** confirmed at 400px/1280px — warm
  canvas, flat borders, no drop shadows outside the two named exceptions,
  serif Chinese hero, Phosphor icons, no emoji; mic button renders at rest
  (static hairline, canvas hidden) and the type/talk toggle swaps the bottom
  bar's center content with no layout shift; HSK popover opens/lists all six
  levels. **Not yet verified live** (needs real `DEEPSEEK_API_KEY`/
  `GROQ_API_KEY`/`ELEVENLABS_API_KEY` in `.env.local` and a real microphone,
  same gap already open for Units 2-4): actual mic hold/release ring
  animation quality, permission-denied synthetic-signal fallback, mis-tap
  hint, reduced-motion branch, and a full send round trip producing a real
  AI turn. Record that check here before committing Unit 5.

- 2026-09-11: **Speaking-rate control moved client-side.** The rate UI was
  reworked per the user's ask from a slow/normal toggle into a
  0.5x/0.75x/1x/1.5x/2x `<select>` (default 0.75x). Initially wired the same
  way as Azure — sending `rate` to `/api/speak`, mapped straight to
  ElevenLabs' `voice_settings.speed` — which caused **`/api/speak` to 500**
  for 0.5/1.5/2. Diagnosed by curling ElevenLabs directly with the stored
  key: `"Invalid setting for speed received, expected to be greater or
equal to 0.7 and less or equal to 1.2"` — ElevenLabs hard-limits this
  endpoint's speed to 0.7-1.2, narrower than the 0.25-4.0 previously assumed
  from secondary docs (that number was wrong; the live API is the source of
  truth). Fix: `lib/elevenlabs-tts.ts`'s `synthesizeSpeech` no longer takes
  a `rate` param or sends `speed` at all — always synthesizes at natural
  speed. `app/api/speak/validate.ts`'s `SpeakRequest` dropped `rate`
  entirely (`{ text }` only); `app/api/speak/route.ts` updated to match.
  `app/page.tsx`'s `speak()` now sets `audioRef.current.playbackRate =
speakingRate` before `.play()` — the browser scales playback natively,
  no provider limit involved, and the full 0.5x-2x range works uniformly.
  `types/index.ts`'s `SpeakingRate` (`0.5 | 0.75 | 1 | 1.5 | 2`) is now a
  purely client-side concept. `test/speak-validate.test.ts` rewritten
  (`rate`-less contract; 8 cases). `npm run build`/`lint`/`test` (78 tests)
  green; curl-verified all five rates return `200` against the live
  `/api/speak` route with real ElevenLabs credentials.

- 2026-09-11: **STT pinyin-output fix.** Mandarin mic input (e.g. "你好")
  was sometimes transcribed as pinyin/Latin-script text instead of Hanzi —
  a documented Whisper quirk for short/ambiguous audio, not a Groq bug.
  Fixed in `lib/groq-stt.ts` by always sending Groq's `prompt` field seeded
  with real Chinese-character example text (`HANZI_BIAS_PROMPT`), which
  biases the decoder's script choice toward Hanzi without forcing
  translation of non-Chinese audio (unlike the existing `language` param).
  `npm run build`/`lint`/`test` green after the change.

- 2026-09-11: **TTS provider pivot** — Azure AI Speech (used for Unit 4's
  TTS) isn't available in the user's country, so it's dropped in favor of
  **ElevenLabs**. Groq was checked first and ruled out on capability grounds,
  not rate limits: its only TTS models (`orpheus-v1-english`,
  `orpheus-arabic-saudi`) don't support Mandarin at all. ElevenLabs verified
  against its own docs: `eleven_multilingual_v2` explicitly lists Chinese
  among 29 supported languages; free tier is 10,000 credits/month
  (1 credit = 1 character for this model, ~10 min of audio), no expiry but
  no commercial-use rights on the free tier — fine for dev, revisit before
  shipping to real users. `lib/azure-tts.ts` deleted; new
  `lib/elevenlabs-tts.ts` (`synthesizeSpeech(text, rate)`, sole reader of
  `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID`, plain `fetch` POST of JSON
  `{ text, model_id, voice_settings }` to `POST /v1/text-to-speech/{voiceId}`
  — simpler than Azure's SSML body, no XML-escaping needed since the text is
  a plain JSON field; `rate` maps to `voice_settings.speed`, 0.75 for slow /
  1.0 for normal, mirroring the prosody values Azure used). No env default
  for `ELEVENLABS_VOICE_ID` — voice availability differs per ElevenLabs
  account/plan, so the user must set a real voice id from their own account
  rather than trust a hardcoded one that might not exist for them.
  `app/api/speak/route.ts` now imports from `@/lib/elevenlabs-tts` (its
  `500` error path/message and the rest of the route were already
  provider-agnostic — only the import and the `console.error` label
  changed). `.env.example`'s Azure TTS lines replaced with
  `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` + `ELEVENLABS_MODEL_ID`
  (default `eleven_multilingual_v2`). `architecture.md`'s TTS row,
  `app/api/speak/`/`lib/` folder descriptions, provider-call list, and
  invariant 6 all reworded from Azure to ElevenLabs. Azure AI Speech is now
  out of the stack entirely (it was also rejected for STT for the same
  country-availability reason — see the Unit 3 entry below). `npm run
build`/`lint`/`test` still need to be re-run and a live curl/browser check
  done with a real `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` — the user said
  they'll paste the env values shortly.

- 2026-09-11: Unit 4 implemented per
  `context/feature-spec/unit-4-voice-output-tts.md` (both open questions
  resolved by the user beforehand: fixed voice `zh-CN-XiaoxiaoNeural`, no
  voice picker; overlapping playback is an ignore-and-no-op guard, not
  interrupted). New `lib/azure-tts.ts` (`synthesizeSpeech(text, rate)` —
  sole reader of `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, plain `fetch` POST
  of SSML to Azure's REST TTS endpoint, `escapeXml` on the model-output text
  before it enters the SSML payload, returns raw MP3 bytes as an
  `ArrayBuffer`, no SDK — matches Unit 1/3's `fetch`-only precedent). New
  `app/api/speak/validate.ts` (`parseSpeakRequest`, `MAX_SPEAK_TEXT_LENGTH` =
  500, mirrors `app/api/chat/validate.ts`/`app/api/transcribe/validate.ts`).
  New `app/api/speak/route.ts` (POST: parse JSON → validate → synthesize →
  `200` raw MP3 bytes with `Content-Type: audio/mpeg`, or the shared
  `{ error }` JSON shape on `400`/`500` — the one route in the app returning
  binary). `types/index.ts` gained `SpeakingRate`. `.env.example` gained
  `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`. `app/page.tsx`: new
  `speakingRate`/`playingIndex`/`speakError` state, one shared
  `audioRef = useRef<HTMLAudioElement>`, `speak(text, index)` (guards on
  `playingIndex !== null`, fetches `/api/speak`, revokes the previous object
  URL before assigning the new one, `await audio.play()`), an `ended`
  listener registered once in a `useEffect` that revokes the object URL and
  clears `playingIndex` — the actual revoke-after-playback point. `send()`
  now calls `void speak(data.reply_zh, nextHistory.length)` synchronously at
  the end of its success path (inside the same gesture-triggered call chain,
  so autoplay isn't script-initiated). One replay button (▶) per AI turn,
  disabled while anything is playing; a Normal/Slow `<select>` in the header
  next to the HSK picker, bound to `speakingRate`, affecting only the next
  `speak()` call. `speakError` renders the same way `error`/`micError`
  already do. New `test/speak-validate.test.ts` (11 cases: valid
  normal/slow, missing `text`/`rate`, empty/whitespace-only `text`, both
  `MAX_SPEAK_TEXT_LENGTH` boundary cases, invalid `rate` value/type, wrong-type
  `text`). **Unrelated pre-existing lint fix, same commit:** the dirty,
  not-yet-committed `zhOnlyMode` toggle (from Unit 3 work) called `setState`
  synchronously inside a mount-only `useEffect`, which fails the
  `react-hooks/set-state-in-effect` ESLint rule now enforced — fixed by
  switching to a lazy `useState` initializer reading `localStorage` directly
  (SSR-safe per its own comment: "no SSR hydration concern since the toggle
  only affects a client-side form field, never markup"), matching the
  no-`useEffect`-for-localStorage-reads posture Unit 2 already established
  for `hskLevel`. `npm run build`, `npm run lint`, `npm test` (81 tests) all
  green. `grep -R NEXT_PUBLIC` still finds nothing.
  `architecture.md` needed no changes — confirmed `app/api/speak/`,
  `lib/azure-tts.ts`, the object-URL cache-table row, and the "no streaming"/
  "TTS never stored" invariants were already documented exactly as
  implemented. Manual browser check (autoplay on send, replay button,
  slow/normal rate audibly different, overlapping-replay no-op, no leaking
  object URLs across many turns, in Chrome + Safari) is **not yet done** —
  needs a real `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` in `.env.local` and a
  live browser session; record the result here before committing.

- 2026-09-11: Unit 3 implemented per
  `context/feature-spec/unit-3-voice-input-stt.md`. New `lib/openai.ts`
  (`transcribeAudio()` — sole reader of `OPENAI_API_KEY`, plain `fetch`
  multipart POST to OpenAI's `gpt-4o-transcribe` endpoint with
  `language: "zh"`, no SDK, matching Unit 1's DeepSeek precedent; audio is
  passed through as the request body only, never persisted). New
  `app/api/transcribe/validate.ts` (`parseTranscribeForm`,
  `MAX_AUDIO_BYTES` = 1 MB, `ALLOWED_AUDIO_TYPES`, codec-suffix-tolerant type
  check). New `app/api/transcribe/route.ts` (POST: parse form → validate →
  transcribe → reject empty transcript with 422 → 200 `{ text }`; specific
  400 messages derived route-side per the spec's Open Question #2
  resolution). `app/page.tsx`: `send()` refactored to take a `message`
  parameter instead of reading `input` directly; new mic button
  (`onMouseDown`/`onTouchStart` → `getUserMedia` → `MediaRecorder` picked via
  `isTypeSupported` trying `audio/webm;codecs=opus` then `audio/mp4` then
  `audio/ogg`; 60s force-stop timer; `onMouseUp`/`onTouchEnd`/`onMouseLeave` →
  stop, assemble blob, release mic tracks, client-side size check against a
  duplicated `MAX_AUDIO_BYTES_CLIENT` constant, then `POST /api/transcribe`
  and auto-send the transcript via `send()`); new `recording`/`micError`
  state, `micError` rendered the same way `error` already is. `types/index.ts`
  gained `TranscribeResponse`. `.env.example` gained `OPENAI_API_KEY`. New
  `test/transcribe-validate.test.ts` (8 cases: valid blob, missing field,
  non-Blob field, codec-suffix type, two disallowed types, zero-byte, and
  both size-cap boundary cases). `npm run build`, `npm run lint`, `npm test`
  (70 tests) all green. Curl-verified against `npm run dev` (no
  `OPENAI_API_KEY` set): zero-byte audio → 400 `{"error":"Missing audio"}`;
  well-formed audio → 500 `{"error":"Upstream unavailable"}` with no key
  leaked. `grep -R NEXT_PUBLIC` still finds nothing. `architecture.md` needed
  no changes — confirmed `app/api/transcribe/`, `lib/openai.ts`, and the
  size/duration cap language were already documented exactly as implemented.
  Manual browser check (hold-to-record in Chrome/Safari desktop+iOS,
  permission-deny path, 60s cap, silence/422 path) is **not yet done** —
  record the result here before committing.
  **User-driven pivot, 2026-09-11:** the user could not complete OpenAI
  billing, so speech-to-text was switched from OpenAI `gpt-4o-transcribe` to
  a local, self-hosted Whisper — no provider key, no billing. `lib/openai.ts`
  deleted; new `lib/whisper.ts` (`transcribeAudio(audio)` — decodes the
  browser's codec (webm/opus or mp4/aac) to 16kHz mono PCM via a spawned
  `ffmpeg` process, using the bundled `ffmpeg-static` binary, no WAV parser
  needed since ffmpeg emits raw `s16le`; runs the PCM through
  `Xenova/whisper-base` via `@huggingface/transformers`, an in-process ONNX
  runtime — no Python, no separate service; the model weights download once
  from Hugging Face on first use and are cached locally). New deps:
  `@huggingface/transformers`, `ffmpeg-static`. `app/api/transcribe/route.ts`
  now imports from `@/lib/whisper` and its `500` error message changed from
  "Upstream unavailable" to "Transcription failed" (no upstream provider
  anymore). `.env.example`'s `OPENAI_API_KEY` line removed — no key needed.
  `architecture.md` updated: STT row, `app/api/transcribe/` and `lib/` folder
  descriptions, storage-model note, boundary summary, and invariant 6 all
  reworded from OpenAI to local Whisper.
  **Known tradeoffs of this pivot** (flag before shipping): first transcribe
  request needs internet once to download the Whisper model; ffmpeg spawn +
  in-process ONNX inference is slower and more CPU/memory-heavy per request
  than a hosted API, with no provider SLA; `whisper-base` accuracy on
  Mandarin has not yet been manually compared against `gpt-4o-transcribe`.
  **Second pivot, same day (2026-09-11):** the user rejected the local-Whisper
  detour above after discussing it — it fights Vercel's serverless model
  (bundle size, ephemeral disk re-downloading the model on every cold start,
  execution-time caps a CPU Whisper pass can exceed), and this app needs to
  be deploy-ready. Reverted to a hosted provider. Chose **Azure AI Speech**
  over Groq/Deepgram (options discussed) specifically because Unit 4 already
  plans an Azure TTS account — one provider account instead of three.
  `lib/whisper.ts` deleted (never committed); new `lib/azure-stt.ts`
  (`transcribeAudio(audio, contentType)` — plain `fetch` POST of the raw
  audio bytes, no multipart, no SDK, to Azure's short-audio REST recognition
  endpoint `https://{region}.stt.speech.microsoft.com/speech/recognition/
conversation/cognitiveservices/v1?language=zh-CN&format=simple`; returns
  `""` when Azure's `RecognitionStatus` isn't `"Success"`, which the route's
  existing empty-transcript check turns into the `422` response — no new
  logic needed there). `app/api/transcribe/route.ts` now imports from
  `@/lib/azure-stt` and its `500` message is back to `"Upstream unavailable"`
  (matches `/api/chat`'s wording for a real upstream provider). `.env.example`
  now has `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` (default `eastus`) in
  place of the removed `OPENAI_API_KEY`/local-Whisper entries. `architecture.md`
  STT row, `app/api/transcribe/` and `lib/` folder descriptions, storage-model
  note, boundary summary, and invariant 6 all reworded a second time, now to
  Azure AI Speech. Open question raised at the time: Azure's short-audio REST
  endpoint's documented supported `Content-Type`s are WAV (PCM), OGG/Opus,
  and WebM/Opus — Chrome's `audio/webm;codecs=opus` recording matches, but
  iOS Safari's `audio/mp4` fallback (`app/page.tsx`'s `MIC_MIME_TYPES`) was
  not confirmed supported by that endpoint. Moot now — see the next pivot.
  **Third pivot, same day (2026-09-11):** Azure AI Speech isn't available in
  the user's country, so it's out too. Switched to **Groq**
  (`whisper-large-v3-turbo`) — chosen because its `/openai/v1/audio/
transcriptions` endpoint is OpenAI-compatible (near-identical request shape
  to the original OpenAI design, multipart/form-data with `file`/`model`/
  `language` fields), it's a single global HTTP call (deploy-ready on Vercel,
  no local binaries), and it has a free API tier with no card required at
  signup. `lib/azure-stt.ts` deleted (never committed); new `lib/groq-stt.ts`
  (`transcribeAudio(audio, contentType)`, sole reader of `GROQ_API_KEY`).
  `app/api/transcribe/route.ts` now imports from `@/lib/groq-stt` (its `500`
  error path and message were already provider-agnostic — only the import
  and the `console.error` label changed). `.env.example`'s Azure lines
  replaced with `GROQ_API_KEY` + `GROQ_STT_MODEL` (default
  `whisper-large-v3-turbo`). `architecture.md` STT row, `app/api/transcribe/`
  and `lib/` folder descriptions, storage-model note, boundary summary, and
  invariant 6 all reworded a third time, now to Groq. Groq's endpoint, like
  OpenAI's, accepts the same broad set of container formats
  `ALLOWED_AUDIO_TYPES` already validates — webm, mp4, mpeg, wav, ogg — so
  the Azure-specific codec caveat above no longer applies, though iOS
  Safari's `audio/mp4` fallback is still worth confirming in the manual
  browser check. `npm run build`, `npm run lint`, `npm test` (70 tests) all
  green after this third pivot. Curl-verified against `npm run dev` (no
  `GROQ_API_KEY` set): zero-byte audio → 400 `{"error":"Missing audio"}`;
  well-formed audio → 500 `{"error":"Upstream unavailable"}` with no key
  leaked.

- 2026-09-11: Unit 2 implemented per `context/feature-spec/unit-2-hsk-level-control.md`,
  then the above-level-word feature was removed by the user (see note below) —
  the codebase now holds the level-control half of the spec only.
  New `data/hsk-words.json` — cumulative HSK 1–6 word lists built from
  `drkameleon/complete-hsk-vocabulary` (MIT), `wordlists/inclusive/old/{1..6}.min.json`,
  extracting only the `s` field, plus a manually patched-in `说` per level (the
  old-standard list omits it standalone, only inside compounds like 说话/说明) —
  counts now 151/298/596/1194/2492/4992. New `lib/hsk.ts` (`isValidHskLevel`,
  `getCumulativeWordSet`, `getWordListText`). New `app/api/chat/prompt.ts`
  (`buildSystemPrompt(level)`, byte-identical per level). `app/api/chat/validate.ts`
  gained exported `parseChatRequest`/`ChatRequest` (moved out of `route.ts`,
  extended with `hskLevel` validation). `app/api/chat/route.ts` builds messages
  with `buildSystemPrompt(hskLevel)`. `types/index.ts` gained `HskLevel`.
  `app/page.tsx` gained a `<select>` HSK 1–6 picker; level state is read from
  `localStorage` via `useSyncExternalStore` (not `useEffect`+`setState`, to
  satisfy the `react-hooks/set-state-in-effect` lint rule — same
  default-3/no-hydration-mismatch behavior the spec asked for, implemented as
  an external-store subscription instead). New `test/hsk.test.ts` (counts,
  monotonic subset, byte-identical `getWordListText`, `isValidHskLevel`).
  `test/chat-validation.test.ts` extended with `parseChatRequest` cases
  (boundaries 1/6, missing/invalid `hskLevel`, history/message regressions).
  New `vitest.config.mts` (added `@` alias matching `tsconfig.json`'s `"@/*"` —
  previously untested modules didn't need it; `lib/hsk.ts`,
  `app/api/chat/validate.ts` now do). `npm run build`, `npm run lint`,
  `npm test` (61 tests) all green after the removal. Curl-verified: missing
  `hskLevel` and `hskLevel: 7` both 400 `{"error":"Malformed request"}` before
  any DeepSeek call. `architecture.md` needed no changes for the level-control
  half — confirmed `data/`, `lib/hsk.ts`, and `app/api/chat/` responsibilities
  were already documented exactly as implemented.
  **User-driven change, 2026-09-11:** the above-level-word feature
  (`flagAboveLevel` in `lib/hsk.ts`, `aboveLevelWords` on `Turn`'s ai variant,
  the computation in `route.ts`, the `⚠ above level` line in `page.tsx`, and
  their tests) was removed entirely — the user judged the forward-max-matching
  flagging (dictionary-only, no real segmenter — the ponytail-flagged ceiling
  the spec called out) inaccurate in practice. The spec file still describes
  the original design including this feature; treat the spec as historical
  intent, not current scope. If above-level flagging is wanted again, it needs
  a more accurate approach than dictionary max-matching (e.g. a real
  segmenter) before re-adding.
  **User-driven fix, 2026-09-11:** manual testing surfaced that the strict
  "only use words from this list" instruction made DeepSeek deflect harder
  topics ("对不起，这个我不太懂/不太会聊，我们说点别的吧...") instead of
  attempting them. `app/api/chat/prompt.ts`'s `buildSystemPrompt` now also
  instructs the model to never refuse/deflect a topic and to always give a
  real on-topic reply, simplified to the level instead. Curl-verified with
  "你能说说你对环境保护的看法吗？" at hskLevel 1 (got a simplified,
  on-topic reply instead of a deflection) and hskLevel 5 (direct answer).
  `npm run build`/`lint`/`test` (61 tests) still green after this change.
  **User-driven prompt tuning, 2026-09-11:** two more asks in
  `app/api/chat/prompt.ts`'s `buildSystemPrompt` — (1) `correction` now
  explicitly excludes punctuation mistakes (only sentence-structure/grammar/
  word-choice count); curl-verified a missing-comma message ("我喜欢看书 也喜欢
  运动") got `correction: ""`. (2) Reply length is no longer capped at 1-2
  sentences — it's told to match the user's message length/detail instead;
  curl-verified a short message still gets a short reply while a longer,
  detailed message (weekend plans, HSK4) got a genuinely longer, on-topic
  reply. `npm run build`/`lint`/`test` (61 tests) still green.

- 2026-09-10: Unit 1 implemented. `pinyin-pro` + `vitest` added (`@types/node`
  bumped 20→24 to match the Node 26 runtime and clear a vitest peer conflict;
  `npm audit` clean). New: `types/index.ts` (`ChatResponse`, `Turn`, `AiTurn`),
  `lib/pinyin.ts` (`toPinyin` + bounded 得/还 heteronym correction pass with a
  named ceiling), `lib/deepseek.ts` (fetch to the OpenAI-compatible endpoint,
  sole reader of `DEEPSEEK_API_KEY`), `app/api/chat/validate.ts`
  (`parseChatResponse`, fence-stripping, retry-once contract), `app/api/chat/
route.ts` (POST: parse → 500-char cap → DeepSeek → validate → retry → pinyin
  → `AiTurn`), `app/page.tsx` rewritten as the typed harness with a hardcoded
  greeting and a native `<details>` correction. Tests: `test/pinyin.test.ts`
  (heteronyms 还/得/长/银行 + formatting), `test/chat-validation.test.ts`
  (validator cases). `npm run build`, `npm run lint`, `npm test` (29) green.
  Route error branches curl-checked: 400 bad body / >500 chars, 405 GET, 500
  missing key (no key leak). Spec at
  `features/back/unit-1-text-conversation-loop.md`.

- 2026-09-10: Unit 0 split into 0a (local skeleton) and 0b (deploy pipeline);
  specs written to `context/feature-spec/unit-0a-local-skeleton.md` and
  `unit-0b-deploy-pipeline.md`.
- 2026-09-10: Project scaffolded — Next.js 16.3.4 (App Router, Turbopack),
  React 19.2, TypeScript strict, Tailwind v4, ESLint 9. Boilerplate stripped
  to a placeholder page; folder skeleton from `architecture.md` created
  (`components/ lib/ db/ drizzle/ data/ types/ test/`). `npm run build` and
  `npm run lint` pass. `git init` done; not yet committed / no remote.
- 2026-09-10: Matt Pocock engineering skills configured for the repo —
  `docs/agents/issue-tracker.md` (GitHub) + `docs/agents/domain.md`;
  `## Agent skills` block added to `CLAUDE.md`. `triage` not installed, so no
  triage-labels file.

## In Progress

- Unit 2: automated checks (build/lint/test/curl) done; above-level-word
  flagging removed by the user for inaccuracy (see Completed note). Remaining
  manual browser check is now just HSK1 vs HSK5 vocabulary difference, reload
  persistence, and the prompt-cache `usage` log spot-check — no above-level
  marker to verify. Commit is next after that.
- Unit 3: automated checks (build/lint/test/curl) done. Remaining manual
  browser check (hold-to-record in Chrome + Safari, desktop + iOS, mic-deny,
  60s cap, silence/422) needs a real `GROQ_API_KEY` in `.env.local` and a
  live browser session. Commit is next after that.
- Unit 4: automated checks (build/lint/test) done. Remaining manual browser
  check (autoplay on send, replay button, client-side rate switch across
  0.75x/1x/1.5x, overlapping-replay no-op, object-URL leak check across many
  turns, in Chrome + Safari) needs a real `ELEVENLABS_API_KEY`/
  `ELEVENLABS_VOICE_ID` in `.env.local` and a live browser session. Commit is
  next after that.

## Verified

- 2026-09-14: **Unit 7a implemented up to the point blocked by a missing
  credential.** Per `unit-7a-db-schema-setup.md`, added `drizzle-orm`,
  `@neondatabase/serverless` (runtime) and `drizzle-kit` (dev dep); new
  `db/schema.ts` (`settings`/`conversations`/`turns`, matching the spec
  exactly — no `speaking_rate` column, no `usage_log` table); new
  `db/index.ts` (`neon-http` driver, `process.env.DATABASE_URL!` — the one
  accepted non-null assertion per `code-standards.md`); new
  `drizzle.config.ts`; `.env.example` gained `DATABASE_URL` under a new
  "Unit 7a" section. Removed the placeholder `db/README.md` and
  `drizzle/README.md` stubs now that those folders hold real files.
  `npx drizzle-kit generate` was run (it only diffs the schema, no live DB
  connection needed) and produced `drizzle/0000_high_zzzax.sql` — reviewed,
  matches the schema column-for-column with no manual edits needed
  (done-criterion #2). `npm run build`, `npm run lint`, and `npx tsc
--noEmit` all pass clean with the new `db/` layer present but unused by
  any route/component (done-criterion #4); `npm test` still 89/89.
  `grep -R DATABASE_URL app components` finds nothing (done-criterion #5).
  **Resumed and completed 2026-09-14:** `DATABASE_URL` was added to
  `.env.local` (a Neon pooled connection string). `npx drizzle-kit generate`
  re-run first to confirm zero schema drift ("No schema changes, nothing to
  migrate"), then `npx drizzle-kit migrate` applied both
  `drizzle/0000_high_zzzax.sql` and `drizzle/0001_married_alex_wilder.sql`
  (the latter — cascade delete on `turns.conversation_id` and the
  `conversations_one_active_per_user` partial unique index — was added
  outside this session and reviewed as a real improvement over the original
  spec) cleanly against the real Neon database. `npm run build` and
  `npm run lint` both pass. All done-criteria for 7a are now met.
  **Also fixed in this pass:** `.env.example` had accidentally picked up a
  real Neon connection string as its example value instead of a blank
  placeholder — corrected to `DATABASE_URL=` before committing; confirmed
  the real value does not appear anywhere else in the tree.
  Committed at `<see git log>`.
- 2026-09-14: **Unit 7b (settings persistence) implemented and verified.**
  Per `unit-7b-settings-persistence.md`: new `db/queries.ts` with
  `getSettings`/`upsertHskLevel`, both scoped by `userId`; new `types/index.ts`
  `Settings` type; new `app/api/settings/route.ts` (`GET`/`PATCH`,
  `requireUser()` first, `isValidHskLevel` reused from `lib/hsk.ts`);
  `components/ConversationScreen.tsx`'s `hskLevel` now loaded via
  `GET /api/settings` on mount and written via `PATCH /api/settings` on
  change — the old `localStorage`-backed `hskLevelPreference` and its
  `isHskLevel` helper are removed; `HskPicker`'s own props/behavior
  unchanged. `zh_only_mode`/`display_support`/`text_scale` remain
  `localStorage`-only, per spec. Added `test/settings-route.test.ts`
  (authenticated GET/PATCH behavior, 400 on invalid/missing `hskLevel`),
  `test/queries-settings.test.ts` (mocks `@/db/index`'s `db`; default-3
  fallback, row value, exact-`userId` scoping), and two auth-guard cases in
  `test/auth-guard.test.ts` (401 before any DB call). `npm run build`,
  `npm run lint`, `npm test` (98/98) all pass; manual `curl` against
  `npm run dev` confirms both routes return 401 unauthenticated (no browser
  session available in this environment to verify the full persist-across-
  reload path — flagged as still needing a real manual check). `grep -R
DATABASE_URL app components` finds nothing. `architecture.md` (`settings`
  row now omits `speaking_rate`; added `app/api/settings/` boundary row;
  marked the `localStorage` HSK fallback row removed) and `code-standards.md`
  (added `app/api/settings/` to File Organization) updated in the same
  change per `ai-workflow-rules.md` §6.2. Committed at `<see git log>`.
- 2026-09-14: **Unit 7c (conversation + turn persistence) implemented and
  verified.** Per `unit-7c-conversation-persistence.md`: `db/queries.ts`
  gained `getOrCreateActiveConversation`, `createConversationWithGreeting`
  (private), `appendTurnPair`, `countTurns`. The `neon-http` driver has no
  interactive transactions, so the "one active conversation" archive +
  insert + greeting-seed + oldest-delete steps run through `db.batch([...])`
  instead of `db.transaction()` — one atomic Neon HTTP call, same guarantee
  (documented in `architecture.md`). `types/index.ts` widened `Turn`
  (`id`/`createdAt`) and added `Conversation`. `app/page.tsx` now calls
  `getOrCreateActiveConversation(userId)` and passes
  `{conversation, initialTurns}` to `ConversationScreen`, which the
  Server/Client split from Unit 6's own earlier work already made
  straightforward — the hardcoded `GREETING` constant is gone, replaced by
  the DB-seeded greeting (identical text). `app/api/chat/route.ts` now
  checks `countTurns` against the real stored count before calling DeepSeek
  (25-cap enforced against real data, not just in-memory history length)
  and persists both turns via `appendTurnPair`, returning the persisted AI
  turn (real `id`/`createdAt`) instead of a freshly-constructed one.
  `app/api/chat/validate.ts`'s `parseChatRequest` now requires and
  UUID-validates `conversationId`. `app/api/conversations/` and the History
  panel remain out of scope (Unit 8), per the spec's Decision #1.
  Added `test/queries-conversations.test.ts` (existing-vs-create paths, the
  51st-conversation-deletes-the-oldest cap exercised at the query level per
  Decision #2, `userId` scoping on every insert, `countTurns` at 0/1/25) and
  `test/chat-conversation.test.ts` (25-turn-cap rejection before any
  DeepSeek call, successful persistence call shape, missing/malformed
  `conversationId` → 400). `test/chat-validation.test.ts` updated for the
  now-required `conversationId`. `npx tsc --noEmit`, `npm run build`,
  `npm run lint` all clean; `npm test` 114/114. `curl` against `npm run dev`
  confirms `GET /` redirects unauthenticated and `POST /api/chat` returns
  401 with no crash from the new server-side `getOrCreateActiveConversation`
  call path. **Not verified: the full signed-in manual walkthrough** (reload
  mid-conversation keeps the transcript; the same active conversation shows
  in a second browser profile signed in as the same user) — no browser
  session available in this environment; flagged as outstanding. `grep -R
DATABASE_URL app components` finds nothing. `architecture.md` updated:
  `conversations` row's stale plain index corrected to name the real
  partial unique index, and a new note explaining the `db.batch()`
  transaction mechanism added under "Storage model". Committed at
  `<see git log>`.
- 2026-09-14: **Unit 6 re-verified before starting Unit 7.** Re-ran the full
  checklist against the `auth` branch as it stands today (all prior Unit 6
  follow-up fixes already committed, working tree otherwise clean except an
  unrelated pre-existing edit to `unit-7a-db-schema-setup.md`'s heading).
  `npm install` (up to date), `npm run build` (clean, route table lists `/`
  as `ƒ` dynamic plus `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]`),
  `npm run lint` (0 errors/warnings), `npm test` (89 passed, including
  `test/auth-guard.test.ts`'s three 401 cases) all green. Read the actual code
  against `unit-6-auth-clerk.md`'s done criteria and confirmed each: `/` is
  an async Server Component calling `auth()`/`redirectToSignIn()` (superseding
  the spec's original "no split needed" text, per the 2026-09-14 third-
  follow-up entry above); `middleware.ts` is a bare `clerkMiddleware()`
  (matcher-only, no `createRouteMatcher`); `lib/auth.ts` exports
  `requireUser`/`AuthError` unchanged from the spec; all three of
  `app/api/{chat,transcribe,speak}/route.ts` call `requireUser()` as their
  first statement with the identical try/catch shape; `.env.example` has the
  Clerk vars including the sign-in/sign-up/redirect URL overrides added by
  later follow-ups; `grep -R CLERK_SECRET_KEY app components` finds nothing;
  no `allowlist` reference remains anywhere in the codebase. No manual
  browser session was run in this pass — not re-needed, since the extensive
  `browse`-verified checks already recorded above (fresh sign-up, sign-in
  redirect to the app's own `/sign-in` not Clerk's hosted portal, no redirect
  loop, footer/theming fix, HMR-loop fix) already exercised this exact code
  path live. Unit 6's done criteria (`unit-6-auth-clerk.md`) are all met; no
  code changes were needed. Already fully committed (no new commit required
  for Unit 6 itself — the working tree had nothing of Unit 6's to commit).
- 2026-09-11: Unit 1 done-criteria met — user confirmed the live browser check
  ("good pass") after setting a real `DEEPSEEK_API_KEY` in `.env.local`: typed
  conversation holds, AI turns render Chinese + pinyin + English, correction
  disclosure works. Combined with the 2026-09-10 automated/curl checks (build,
  lint, 29 tests, error-branch curls, no leaked key), all Unit 1 done-criteria
  in `build-spec.md` are satisfied. Committed at `7c7ebd9`.
- 2026-09-10: Unit 0a done-criteria re-checked against the spec —
  `npm run build` green (0 TS errors, `strict: true` intact), `npm run lint`
  passes, `grep NEXT_PUBLIC` finds nothing, folder skeleton + `.gitkeep`/README
  stubs present, no stray starter files, `.env*` git-ignored with
  `!.env.example`, working tree clean. Committed at `01fe891` (0b-defer note
  in `a799747`).

## Next Up

- Unit 0a: DONE (committed, `96fc49b`).
- Unit 0b: DEFERRED by the user (see "Deferred" below). Building locally only —
  no deploy, no remote push — until the deploy pipeline is set up near the end.
- Unit 1: DONE (committed, `7c7ebd9`, verified 2026-09-11).
- Unit 2: HSK level control — implemented; manual browser verification and
  commit still pending (see "In Progress").
- Unit 3: voice input (STT) — implemented; manual browser verification and
  commit still pending (see "In Progress").
- Unit 4: voice output (TTS) — implemented; manual browser verification and
  commit still pending. Verify autoplay, replay, the client-side rate switch
  across 0.75x/1x/1.5x, overlapping replay, and object-URL cleanup with
  `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (see "In Progress").
- Unit 5: the one screen + Siri mic — implemented; manual browser verification
  and commit still pending (see "In Progress").
- Unit 6: auth (Clerk) — **DONE, re-verified 2026-09-14** (see "Verified").
  Sign-up is open (no allowlist) per the 2026-09-11 decision below.
- Unit 7 (persistence): spec drafted (2026-09-14), split into three parts —
  `context/feature-spec/unit-7a-db-schema-setup.md`,
  `unit-7b-settings-persistence.md`, `unit-7c-conversation-persistence.md`.
  **7a, 7b, and 7c all done** — schema migrated, HSK level persisted via
  `/api/settings`, conversation/turn persistence with the greeting seeded
  server-side and the 25-turn/50-conversation caps enforced. Still needs a
  real signed-in browser check (see "Verified" above). 7c's "Decisions made"
  section explicitly defers `app/api/conversations/`, the History panel,
  and "New conversation" to Unit 8.
- Unit 8 (history overlay + conversation lifecycle): spec drafted
  (2026-09-14) at
  `context/feature-spec/unit-8-history-conversation-lifecycle.md`, then
  reconciled the same day against the real 7a/7b/7c specs once they
  landed — the original draft's invented `startNewConversation` function
  was replaced with reusing 7c's `createConversationWithGreeting` (now
  exported), and `ConversationSummary` was changed to extend 7c's
  `Conversation` type instead of a separate `isActive` boolean. DRAFT, not
  reviewed/approved; do not implement until Units 6/7a/7b/7c are built and
  this spec is approved.
- Unit 10 (hardening + production readiness): spec drafted (2026-09-15) at
  `context/feature-spec/unit-10-hardening-production-readiness.md`, split
  into sub-units 10a–10h per `ai-workflow-rules.md` §3. DRAFT, not
  reviewed/approved; do not implement until Unit 9 is built (rate
  limiting/spend caps are owned there, not here) and this spec is approved.

## Open Questions

- None blocking. Unit 0b prerequisites are parked (see "Deferred").
- **Streak counter** (4-day-streak-style UI, shown in a Stitch-generated
  mockup the user shared 2026-09-12): explicitly out of scope per
  `project-overview.md` ("Streaks, XP, points, levels, badges, progress
  charts, or any dashboard or statistics screen"). User shelved it for now
  rather than adopting or rejecting outright. If revisited, needs: a scope
  amendment to `project-overview.md` removing that clause, a "day" definition
  (local calendar day vs. server UTC — local was the tentative call), a
  reset-vs-grace-period decision (hard reset was the tentative call), and new
  `settings` columns (`streak_count`, `last_active_date`, plus a timezone
  field that doesn't exist yet).
- **Ephemeral quick-reply suggestion chips** (same mockup): the persisted/
  scenario-tracked version is out of scope ("target-phrase lists"), but a
  cheap ephemeral version — DeepSeek returns 2-3 example next-things-to-say
  alongside `reply_zh`/`reply_en`/`correction`, shown as tappable chips,
  never stored — was identified as not actually in conflict with that
  exclusion. User shelved it for now. If revisited: extend `ChatResponse` and
  `app/api/chat/prompt.ts`'s expected JSON shape with one new field, no
  schema/persistence change.

## Deferred — revisit before shipping

- **Unit 0b (deploy pipeline) is intentionally skipped for now.** The user has
  created a private GitHub repo but has NOT: linked a Vercel project, added the
  `APP_ENV_CHECK` env var, or enabled Vercel Deployment Protection. They want to
  build the whole app locally first and wire up deployment at the end.
- **Agent action required:** once the app is functionally complete locally —
  i.e. Units 1–9 are done and Unit 10 (Hardening + ship) is about to start —
  STOP and ask the user to do the Unit 0b prerequisites in
  `context/feature-spec/unit-0b-deploy-pipeline.md` ("Prerequisites"): create
  the Vercel project, add env vars, enable Deployment Protection, and provide
  the GitHub repo URL for `git remote add origin`. Then complete Unit 0b, then
  Unit 10.
- Until then: every unit still ends with `npm run build` + `npm run lint`
  passing locally and a clean commit on `main`; just no push and no live URL.
- Optional, order-independent: set OpenAI / Azure provider spending caps in
  their dashboards whenever provider keys first get used (Unit 1 / 3 / 4).

## Architecture Decisions

- 2026-09-10: Next.js pinned by scaffold to 16.3.4 with Turbopack as the build
  engine (create-next-app default). `architecture.md` says "Next.js (App
  Router)" without a version — no divergence.
- 2026-09-10: No `src/` dir; all top-level folders at repo root, matching
  `architecture.md` File Organization.
- 2026-09-10: Tailwind v4 (CSS `@theme`, `@tailwindcss/postcss`) — no
  `tailwind.config.*` file. Design tokens land in Unit 5 in `app/globals.css`.
- 2026-09-10: Issue tracker for the Matt Pocock skills = GitHub Issues
  (chosen by user; matches the planned GitHub repo + Vercel deploy).
- 2026-09-11: **Unit 6 auth scope changed — sign-up left open, allowlist
  dropped.** User: "I just want everyone to be able to sign up ... I feel
  like no one is going to use it anyway, so it's fine to just leave it for
  now." `ALLOWLIST`, `lib/allowlist.ts`, `isAllowed()`, and the "no access"
  view are all removed from the design; `requireUser()` now only checks for
  a valid Clerk session. `project-overview.md`, `architecture.md`,
  `ui-context.md`, `build-spec.md`, and
  `context/feature-spec/unit-6-auth-clerk.md` were all updated in this same
  change to remove every allowlist reference. Consequence: with no gate on
  who can sign up, Unit 9 (rate limiting + spend guard) becomes the primary
  defense against cost abuse — don't leave a long gap between Unit 6 and
  Unit 9 once implementation starts.
- 2026-09-11: **Unit 6 `<UserButton />` placement resolved: Option B.**
  Shown three mockups (top-right cluster left of history icon, top-right
  outermost right of history icon, or in the bottom bar next to "New
  conversation") in a published design-review artifact; user picked the
  outermost top-right position, right of the history icon. Updated
  `context/feature-spec/unit-6-auth-clerk.md` (item 8 + Open Questions) and
  `ui-context.md`'s corner-controls layout diagram and description to match.
  Unit 6's spec now has no unresolved open questions.
- 2026-09-15: **Unit 10 split into 10a–10h**, matching the 7a/7b/7c
  precedent — the combined `unit-10-hardening-production-readiness.md`
  (2026-09-15 audit) covered seven unrelated concerns in one file; it's
  deleted and replaced by `unit-10a-failure-state-ui-sweep.md` through
  `unit-10h-concurrency-backup-testing.md`, each self-contained with its own
  status/review gate. Two content decisions resolved during the split: 10d
  (conversation-history pagination) is closed as deferred — skip for now,
  the 50-conversation cap already bounds the response, revisit only if that
  cap is ever raised; 10b (provider call timeouts) ships a conservative 15s
  default for DeepSeek/Groq/ElevenLabs rather than blocking on real p99
  latency research, to be tightened once real data exists. `build-spec.md`'s
  Unit 10 row was repointed to the 8 new files in the same change.
- 2026-09-15: **History-list titles are now LLM-generated**, not the
  identical greeting text. Root cause: `listConversations`'s preview picked
  the conversation's _first turn_, which is always the hardcoded greeting —
  every history row showed "你好！今天想聊什么？" regardless of what was
  discussed (see screenshot in this session). Fix: `conversations` gained a
  nullable `title` column (migration `drizzle/0005_vengeful_bulldozer.sql`,
  not yet applied to the live DB); after a conversation's first user message
  (`/api/chat`, `existingTurns === 1`), `after()` schedules a best-effort
  DeepSeek call (`generateConversationTitle` in `lib/deepseek.ts`) that
  summarizes it into a 3-5 word English title via `setConversationTitle` —
  failure just leaves `title` null. `listConversations`'s preview fallback
  was also fixed to use the first _user_ turn instead of the first turn
  overall, so older/untitled conversations degrade gracefully.
  `HistoryPanel.tsx` renders `title ?? preview`.

## Session Notes

- [Context needed to resume work in the next session]
- 2026-09-10: Project renamed from `chen.AI` to `hao.AI` across all
  context files.
- 2026-09-10: Repo scaffolded in a temp dir first (create-next-app rejects the
  "Pingo Clone" folder name — has a space/capital) then rsynced in, excluding
  `.git` and the scaffold's `CLAUDE.md`. `package.json` name is `hao-ai`.
- 2026-09-10: Scaffold added `AGENTS.md` (Next.js agent-rules block, auto-
  regenerated by `next dev`) and a `CLAUDE.md` that was NOT copied over — the
  real project `CLAUDE.md` is preserved.
