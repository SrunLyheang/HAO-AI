# Feature Spec — Unit 9: Rate limiting + spend guard

> Derived from `build-spec.md` Unit 9, `architecture.md`'s `usage_log` table
> row, invariant 6, and the "AI and background task model" → "Rate check"
> section, and `project-overview.md` goals 6/7. `build-spec.md`'s own Unit 9
> row and done criteria still name **OpenAI** and **Azure** for the
> provider-billing-cap checklist — stale, per the note at the top of that
> file. Read as **Groq** (STT) and **ElevenLabs** (TTS); **DeepSeek** stays
> prepaid, not dashboard-capped.
>
> **Prerequisite: Unit 8 must be implemented and verified first**, per
> `ai-workflow-rules.md` §1.2's strict build order. `app/api/conversations/`
> and `components/HistoryPanel.tsx` now exist in the repo.
>
> **Already done, out of this unit's scope:** the "Input caps" half of
> Unit 9's original title. `app/api/transcribe/validate.ts` already enforces
> audio ≤ 1 MB server-side (`MAX_AUDIO_BYTES`) and `components/MicButton.tsx`
> enforces the same cap client-side; `app/api/chat/validate.ts` +
> `app/api/chat/route.ts` already enforce text ≤ 500 characters
> (`MAX_MESSAGE_CHARS`) and the 25-turn-per-conversation cap
> (`MAX_TURNS_PER_CONVERSATION`, via `countTurns`). These were built ahead of
> schedule in Units 3/7c. This unit adds only the `usage_log` table and the
> per-user request-rate gate — the one piece of Unit 9 not yet built.
>
> **Confirmed by the user (2026-09-14), resolving a real conflict between
> two source-of-truth documents:**
> - `architecture.md`'s invariant 6 ("a call to DeepSeek, Groq, or
>   ElevenLabs is made only after the rate check passes") and its "Rate
>   check" section ("before calls 1 and 2" — transcribe/chat only,
>   excluding speak) disagreed. **Resolved: all three routes
>   (`transcribe`, `chat`, `speak`) are gated.** Invariant 6 already said
>   this; the "Rate check" section is corrected in this unit (see
>   "Architecture doc correction" below).
> - The limit is **one shared bucket per user across all three routes**,
>   not an independent bucket per route. `architecture.md`'s "for that
>   route class" phrasing is corrected in this unit.
>
> **Revised 2026-09-14 after design review — "check-only" for
> transcribe/speak was a real gap, not just a wording nit:** the original
> draft had `transcribe` and `speak` check the shared count but never
> record a row. Traced through: a signed-in session (or a script calling
> the routes directly — exactly the "cost/billing abuse" threat
> `build-spec.md` names) could hammer `POST /api/speak` or
> `POST /api/transcribe` in a tight loop forever; every call would see the
> same low `chat`-only count and pass, because none of those calls ever
> move the counter. That's an unmetered cost sink on the two paid-per-call
> providers (Groq STT, ElevenLabs TTS) this unit exists to protect, and it
> quietly defeats the whole point of gating those routes at all.
>
> **Resolved: all three routes (`transcribe`, `chat`, `speak`) record a
> `usage_log` row**, and the limits scale up so a real voice turn
> (transcribe+chat+speak = 3 calls) still gets its full 10/minute:
> **`MINUTE_LIMIT = 30`, `DAY_LIMIT = 300`.** A voice turn spends 3 calls
> → 10 voice turns/minute, matching the original goal exactly. A typed
> turn (chat+speak = 2 calls) gets up to 15/minute. Every provider call
> now actually spends budget, closing the loop-forever hole.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Add a `usage_log` table and `lib/ratelimit.ts` (`reserveUsage`,
`cleanupExpiredUsage`), gate `app/api/transcribe`, `app/api/chat`, and
`app/api/speak` behind it (all three reserve atomically, at
`MINUTE_LIMIT = 30` / `DAY_LIMIT = 300` so a 3-call voice turn still gets
10/minute), and hand the user a manual checklist for setting
Groq/ElevenLabs billing caps and confirming the DeepSeek prepaid balance
is low.

## Why this is its own step (`ai-workflow-rules.md` §3)

- Changes the database schema (`usage_log`) — §3.4 requires the migration
  land and be verified as its own step before the feature that uses it.
- Touches five files (`db/schema.ts`, one new `lib/` module, three route
  handlers) — past the "roughly three files" threshold in §3.1.
- Crosses a trust boundary (a cost-control gate in front of every provider
  call) — §3.3 requires the guard and its test to land as its own reviewed
  step.

## Architecture doc correction (lands in this same change, per `ai-workflow-rules.md` §6.2)

`architecture.md`'s "AI and background task model" → "Rate check" bullet
currently reads:

> Before calls 1 and 2, the route makes no provider call until
> `lib/ratelimit.ts` confirms the user is under 10 rows in `usage_log` in
> the last minute and 100 in the last day for that route class; on pass it
> records a `usage_log` row.

Replace with:

> Before calls 1, 2, and 3 (transcribe, chat, speak), the route makes no
> provider call until `lib/ratelimit.ts` confirms the user has fewer than
> 30 `usage_log` rows in the last minute and 300 in the last day, counted
> across all routes combined (one shared bucket per user, not per route).
> All three routes record a row on pass, one row per provider call. The
> limits are set to 3x the turn-level target (10/minute, 100/day) so that
> a voice turn — transcribe + chat + speak, three calls — still allows
> the full 10 voice turns per minute; a typed turn (chat + speak, two
> calls) allows up to 15 per minute.

## In scope

### 1. `db/schema.ts` (edit)

Add the `usage_log` table exactly as `architecture.md`'s storage-model
table already specifies:

```ts
export const usageLog = pgTable(
  "usage_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    route: text("route").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("usage_log_user_created_idx").on(t.userId, t.createdAt),
    index("usage_log_created_idx").on(t.createdAt),
  ],
);
```

- `route` is a plain `text` column, not a Drizzle enum — matches
  `architecture.md`'s literal column type. Holds `"transcribe"`, `"chat"`,
  or `"speak"`, one row per provider call, so it also gives free per-route
  auditing without a separate mechanism.
- Composite index on `(userId, createdAt)` for the per-user window counts
  `reserveUsage` runs on every call. A second, `createdAt`-leading index
  backs `cleanupExpiredUsage()`'s global sweep (`DELETE ... WHERE
  created_at < now() - 24h`, no `userId` filter) — the composite index
  can't serve that query since `createdAt` isn't its leading column.

### 2. Migration (new, generated)

Run `drizzle-kit generate` for the schema change above, then apply it.
Verify it applies cleanly against the real Neon database (per
`ai-workflow-rules.md` §3.4) **before** writing any code that uses the
table. No hand-edited SQL.

### 3. `lib/ratelimit.ts` (new)

Sole module that reads/writes `usage_log`. Two exports:

```ts
const MINUTE_LIMIT = 30;
const DAY_LIMIT = 300;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Atomically checks the caller's shared bucket against MINUTE_LIMIT/
// DAY_LIMIT and, if under both, inserts a usage_log row (route: one of
// "transcribe" | "chat" | "speak") for this call — the check and the
// insert happen as one serialized/conditional database action, so two
// concurrent requests cannot both observe "under the limit" and both
// insert. Returns true if the reservation succeeded (caller proceeds to
// its provider call); false if either window was already at its limit
// (caller returns 429, no row written). Called by all three routes
// (transcribe, chat, speak) in place of their provider call's
// check-then-call.
export async function reserveUsage(userId: string, route: "transcribe" | "chat" | "speak"): Promise<boolean>;

// Deletes usage_log rows older than 24h. Runs opportunistically inside
// reserveUsage's own transaction on every call (keeps the per-write
// cleanup architecture.md describes — no separate query on the hot
// path), and is also invoked on a scheduled job (see "Retention" below)
// so a user who stops calling the routes doesn't leave stale rows
// sitting past the 24h window indefinitely.
export async function cleanupExpiredUsage(): Promise<void>;
```

- Sliding windows (row `createdAt >= now - 60s` / `now - 24h`), not
  fixed-calendar buckets — matches architecture.md's "row-count windows"
  description.
- **No accepted race window:** unlike a plain read-then-act check,
  `reserveUsage` serializes concurrent reservations for the same user with
  a Postgres advisory lock (`pg_advisory_xact_lock(hashtext(userId))`,
  held for the transaction) before counting and inserting — not a
  conditional `INSERT ... SELECT` count subquery or `SELECT ... FOR
  UPDATE`, since both of those lock/gate against existing `usage_log`
  rows and do nothing for a user who has none yet (a first-ever call, or
  one right after `cleanupExpiredUsage()` clears their rows), leaving the
  count-then-insert race open exactly when it matters. The advisory lock
  is keyed to the user regardless of whether any row exists, so two
  concurrent requests for the same user always serialize; requests from
  different users never contend.

### Retention

Per-write cleanup (deleting the calling user's own rows older than 24h)
happens inside `reserveUsage`'s transaction, same as before. That alone
only prunes a user's rows when *that user* makes another request, so a
user who stops calling the routes leaves their rows past the 24h window
until they return. To bound total table growth for inactive users too,
a scheduled job (a cron-triggered route, or a Neon-scheduled query — see
`ai-workflow-rules.md` §5.4 for how a scheduled job is set up) runs
`cleanupExpiredUsage()` periodically (e.g. hourly) to delete `usage_log`
rows older than 24h **for all users**, not just the one making the next
request.

### 4. `app/api/transcribe/route.ts` (edit)

Insert a reservation after `parseTranscribeForm` succeeds and before
`transcribeAudio`:

```ts
if (!(await reserveUsage(userId, "transcribe"))) {
  return NextResponse.json({ error: "Rate limit reached; try again later." }, { status: 429 });
}
```

### 5. `app/api/chat/route.ts` (edit)

Insert the reservation immediately before the `callDeepSeek` call
(after the existing `existingTurns`/`countTurns` 25-cap check, which stays
exactly where it is — smallest diff, and it means a request rejected as
"Conversation is full" never spends a rate-limit slot; that path is
unreachable through the real UI once Unit 8 ships, since the client
already disables input at 25 turns):

```ts
if (!(await reserveUsage(userId, "chat"))) {
  return NextResponse.json({ error: "Rate limit reached; try again later." }, { status: 429 });
}
```

The row is reserved **before** the DeepSeek call, not after a successful
reply — so a client retry-storm, a DeepSeek timeout, or the existing
malformed-JSON retry all still spend the slot they reserved. This matches
architecture.md's "on pass it records a row" ordering and is the
intentional defense against a flaky/abusive client hammering a failing
call for free.

### 6. `app/api/speak/route.ts` (edit)

Insert a reservation after `parseSpeakRequest` succeeds and before
`synthesizeSpeech`:

```ts
if (!(await reserveUsage(userId, "speak"))) {
  return NextResponse.json({ error: "Rate limit reached; try again later." }, { status: 429 });
}
```

Recording here (not just checking) is what closes the loop-forever hole:
without it, someone could hammer the per-turn replay button — or call
this route directly, bypassing the UI entirely — forever, since no chat
call would ever run to move the counter. Recording means every hit spends
real budget, so the shared bucket actually bounds this route's cost too.

### 7. Manual checklist — provider billing caps (documentation only, no code)

Per `ai-workflow-rules.md` §5.4 ("dashboard config — stop and give the
user exact steps"), this unit hands back a checklist rather than touching
any dashboard:

- [ ] Set a hard monthly usage/spend cap in the **Groq** console for the
      API key in `GROQ_API_KEY`.
- [ ] Set a hard monthly usage/spend cap in the **ElevenLabs** account for
      the API key in `ELEVENLABS_API_KEY`.
- [ ] Confirm the **DeepSeek** account balance is prepaid and kept low
      (no dashboard cap exists for DeepSeek — the prepaid balance itself
      is the ceiling, per `architecture.md`).

## Out of scope (explicitly — do not build now)

- Audio/text/turn/conversation-count caps — already implemented in Units
  3/7c, per the note at the top of this spec. This unit adds no new
  client-side or server-side size validation.
- Any change to `db/queries.ts`, `settings`, `conversations`, or `turns`.
- Per-route independent buckets — rejected explicitly (see "Confirmed by
  the user" above); do not build a `route`-filtered count. (The `route`
  column is still recorded on every row for auditing — see schema note
  above — but `reserveUsage`'s count query never filters by it.)
- Any UI beyond the existing generic error string. `429`'s `{ error }`
  message renders through the same `error`/`speakError` state slots
  `components/ConversationScreen.tsx` already has (lines rendering
  `StatusLine variant="error"` from `result.error`) — no new component, no
  new state field, no dedicated "rate limited" visual treatment beyond
  what the existing error `StatusLine` already provides.
- Redis/Upstash or any external rate-limit service — `build-spec.md`
  explicitly calls the Neon-only approach "the lazy call; add Upstash only
  if the per-minute query cost ever shows up." Not revisited here.
- Actually setting the provider dashboard caps — listed as a checklist for
  the user, per `ai-workflow-rules.md` §5.4; not something this unit's
  code can do.

## Files touched

| File | Change |
|------|--------|
| `db/schema.ts` | edit — add `usageLog` table + composite index |
| `drizzle/000X_*.sql` | new — generated migration, applied and verified |
| `lib/ratelimit.ts` | new — `reserveUsage`, `cleanupExpiredUsage` |
| `app/api/transcribe/route.ts` | edit — reserve, before `transcribeAudio` |
| `app/api/chat/route.ts` | edit — reserve, before `callDeepSeek` |
| `app/api/speak/route.ts` | edit — reserve, before `synthesizeSpeech` |
| A scheduled job (cron route or Neon-scheduled query) | new — calls `cleanupExpiredUsage()` periodically for all users |
| `architecture.md` | edit — correct the "Rate check" section per above |

## Tests (`test/`)

### `test/ratelimit.test.ts` (new)

Mock the Drizzle `db` calls `lib/ratelimit.ts` makes (same mocking seam as
`test/queries-conversations.test.ts`). Boundary-exact per this unit's own
done criteria:

- 29 rows in the last 60s → `reserveUsage` returns `true` and writes a row.
- 30 rows in the last 60s → `reserveUsage` returns `false` and writes no
  row (the 31st call in a minute is blocked).
- 299 rows in the last 24h (and under the minute limit) → `true`.
- 300 rows in the last 24h → `false` (the 301st call in a day is blocked).
- A count made only of rows older than 24h → treated as 0 for both
  windows (proves the window filter, not just a raw row count).
- Two concurrent `reserveUsage` calls at 29 rows in the last 60s both
  resolve, but only one inserts a row and returns `true`; the other sees
  30 and returns `false` — proves the check-and-insert is atomic, not a
  read-then-act race.
- `reserveUsage(userId, "speak")` issues one conditional insert
  (`route: "speak"`) and, within the same transaction/batch, one delete
  (`createdAt` older than 24h); same shape asserted for `"transcribe"`
  and `"chat"`.
- `cleanupExpiredUsage()` deletes rows older than 24h across multiple
  users, not just one caller's `userId`.

### `test/chat-ratelimit.test.ts` (new)

Mock `lib/ratelimit.ts`'s `reserveUsage` to return `false` and assert
`POST /api/chat` returns `429` with no call to `callDeepSeek` and no call
to `appendTurnPair`. Mirrors the existing `auth-guard`/
`conversations-ownership` test shape (mock the boundary, assert nothing
downstream ran).

### `test/transcribe-ratelimit.test.ts` (new)

Same pattern: `reserveUsage` mocked `false` → `429`, `transcribeAudio`
never called.

### `test/speak-ratelimit.test.ts` (new)

Same pattern: `reserveUsage` mocked `false` → `429`, `synthesizeSpeech`
never called.

### Manual check (record in `progress-tracker.md`)

Temporarily lower `MINUTE_LIMIT` (e.g. to 2) in a local run, send several
turns in quick succession: the request that exceeds the limit gets a
`429` and the existing error `StatusLine` renders the "rate limit
reached" message with no DeepSeek/Groq/ElevenLabs call made (confirm via
provider dashboard usage or added temporary logging, then remove it).
Confirm a normal-paced conversation (well under 10/minute) is never
affected.

## Done criteria (`build-spec.md` Unit 9, provider names corrected)

1. "The 11th voice turn in a minute (transcribe+chat+speak, 3 calls
   each), or the 16th typed turn (chat+speak, 2 calls each), → a clean
   'slow down' state, no provider call made" — i.e. the 31st provider
   call in a minute or the 301st in a day is blocked. Verified by
   `test/ratelimit.test.ts`'s boundary cases and the manual check.
2. Every one of `transcribe`, `chat`, `speak` refuses to call its provider
   when `reserveUsage` returns `false` (`test/*-ratelimit.test.ts`).
3. All three routes write a `usage_log` row on a successful reservation,
   tagged with their own `route` value (confirmed by code review and
   `test/ratelimit.test.ts`'s `reserveUsage` assertions for all three
   route values), and no row is written on a failed reservation.
4. "Groq and ElevenLabs each have a confirmed hard spending cap; DeepSeek
   balance is low and prepaid." — the checklist above is handed to the
   user; this unit's code is not done pending their dashboard action, but
   the code-side done criteria (1-3, 5-9) do not depend on it.
5. `npm run build` and `npm run lint` pass; `strict` stays `true`; no
   `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
6. `npm test` green, including the four new suites and every prior test
   file unchanged.
7. The `usage_log` migration applies cleanly against the real Neon
   database, verified before the feature code that depends on it was
   written (`ai-workflow-rules.md` §3.4).
8. Diff contains only Unit 9 scope: no change to `settings`,
   `conversations`, `turns`, or any existing size/turn/conversation-count
   cap; no Redis/Upstash dependency added.
9. `architecture.md`'s "Rate check" section matches what the code now
   does (corrected in this same change, per above).
10. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npx drizzle-kit generate
npx drizzle-kit migrate   # or the project's existing apply command — verify against real Neon
npm run build
npm run lint
npm test
npm run dev   # manual check: lower the limit temporarily, confirm 429 + no provider call
git status && git log --oneline -1
```

## Open questions

None — the one real conflict (which routes are gated, shared-vs-per-route
bucket, who records) was resolved with the user before this draft was
written (see "Confirmed by the user" above).

## Follow-ups to hand back (do NOT start in Unit 9)

- Unit 10: a `usage_log`-specific loading/error UI (distinct from the
  generic error string used here) is not built — Unit 10's "every failure
  path shows a recoverable UI state" sweep should confirm the existing
  generic error `StatusLine` is judged sufficient for the rate-limited
  case, or design something more specific.
- Roadmap (`build-spec.md`'s "Deferred to post-MVP"): if the per-minute
  rate-limit query ever shows up as a real cost/latency line item, revisit
  Upstash/Redis instead of the Neon-only row-count approach — explicitly
  not needed now.
