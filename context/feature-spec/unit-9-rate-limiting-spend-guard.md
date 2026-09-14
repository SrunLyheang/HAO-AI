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
> `ai-workflow-rules.md` §1.2's strict build order. As of this draft, Unit 8
> is **not yet implemented** — no `app/api/conversations/`, no
> `HistoryPanel.tsx` exist in the repo. This spec can be reviewed now, but
> do not start the code until Unit 8's done criteria are met.
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

Add a `usage_log` table and `lib/ratelimit.ts` (`isRateLimited`,
`recordUsage`), gate `app/api/transcribe`, `app/api/chat`, and
`app/api/speak` behind it (all three check and record, at
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
  (t) => [index("usage_log_user_created_idx").on(t.userId, t.createdAt)],
);
```

- `route` is a plain `text` column, not a Drizzle enum — matches
  `architecture.md`'s literal column type. Holds `"transcribe"`, `"chat"`,
  or `"speak"`, one row per provider call, so it also gives free per-route
  auditing without a separate mechanism.
- One composite index on `(userId, createdAt)`, since every query filters
  by both — satisfies architecture.md's "indexed" note on both columns
  without two separate indexes.

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

// Counts usage_log rows for userId in the last 60s and last 24h
// (combined across all routes — one shared bucket). Returns true if
// either window is already at its limit. Called by all three routes
// (transcribe, chat, speak) before their provider call.
export async function isRateLimited(userId: string): Promise<boolean>;

// Inserts one usage_log row (route: one of "transcribe" | "chat" | "speak")
// and, in the same db.batch() call, deletes any of the user's rows older
// than 24h (the "opportunistic cleanup on write" architecture.md
// describes — no cron, table stays small under the caps' own math).
// Called by all three routes, after isRateLimited() returns false and
// before that route's own provider call.
export async function recordUsage(userId: string, route: "transcribe" | "chat" | "speak"): Promise<void>;
```

- Sliding windows (row `createdAt >= now - 60s` / `now - 24h`), not
  fixed-calendar buckets — matches architecture.md's "row-count windows"
  description and the existing `getOrCreateActiveConversation`/
  `createConversationWithGreeting` precedent of doing a plain read-then-act
  rather than a locking transaction.
- **Accepted race window:** two concurrent requests can both read a count
  just under the limit and both pass, landing one row over the stated cap
  in the rare case. No additional locking or transaction is added for
  this — same tolerance already accepted in `db/queries.ts`'s own comment
  on `createConversationWithGreeting` ("can at worst skip pruning one
  extra row on a rare concurrent double-create"). Low-stakes: a single-user
  race can cost at most one extra provider call.

### 4. `app/api/transcribe/route.ts` (edit)

Insert a check-and-record after `parseTranscribeForm` succeeds and before
`transcribeAudio`:

```ts
if (await isRateLimited(userId)) {
  return NextResponse.json({ error: "Slow down — try again in a moment." }, { status: 429 });
}
await recordUsage(userId, "transcribe");
```

### 5. `app/api/chat/route.ts` (edit)

Insert the check-and-record immediately before the `callDeepSeek` call
(after the existing `existingTurns`/`countTurns` 25-cap check, which stays
exactly where it is — smallest diff, and it means a request rejected as
"Conversation is full" never spends a rate-limit slot; that path is
unreachable through the real UI once Unit 8 ships, since the client
already disables input at 25 turns):

```ts
if (await isRateLimited(userId)) {
  return NextResponse.json({ error: "Slow down — try again in a moment." }, { status: 429 });
}
await recordUsage(userId, "chat");
```

The row is recorded **before** the DeepSeek call, not after a successful
reply — so a client retry-storm, a DeepSeek timeout, or the existing
malformed-JSON retry all still spend the slot they reserved. This matches
architecture.md's "on pass it records a row" ordering and is the
intentional defense against a flaky/abusive client hammering a failing
call for free.

### 6. `app/api/speak/route.ts` (edit)

Insert a check-and-record after `parseSpeakRequest` succeeds and before
`synthesizeSpeech`:

```ts
if (await isRateLimited(userId)) {
  return NextResponse.json({ error: "Slow down — try again in a moment." }, { status: 429 });
}
await recordUsage(userId, "speak");
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
  above — but `isRateLimited`'s count query never filters by it.)
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
| `lib/ratelimit.ts` | new — `isRateLimited`, `recordUsage` |
| `app/api/transcribe/route.ts` | edit — check + record, before `transcribeAudio` |
| `app/api/chat/route.ts` | edit — check + record, before `callDeepSeek` |
| `app/api/speak/route.ts` | edit — check + record, before `synthesizeSpeech` |
| `architecture.md` | edit — correct the "Rate check" section per above |

## Tests (`test/`)

### `test/ratelimit.test.ts` (new)

Mock the Drizzle `db` calls `lib/ratelimit.ts` makes (same mocking seam as
`test/queries-conversations.test.ts`). Boundary-exact per this unit's own
done criteria:

- 29 rows in the last 60s → `isRateLimited` returns `false`.
- 30 rows in the last 60s → `isRateLimited` returns `true` (the 31st call
  in a minute is blocked).
- 299 rows in the last 24h (and under the minute limit) → `false`.
- 300 rows in the last 24h → `true` (the 301st call in a day is blocked).
- A count made only of rows older than 24h → treated as 0 for both
  windows (proves the window filter, not just a raw row count).
- `recordUsage(userId, "speak")` issues one insert (`route: "speak"`) and
  one delete (`createdAt` older than 24h) in a single `db.batch()` call;
  same shape asserted for `"transcribe"` and `"chat"`.

### `test/chat-ratelimit.test.ts` (new)

Mock `lib/ratelimit.ts`'s `isRateLimited` to return `true` and assert
`POST /api/chat` returns `429` with no call to `callDeepSeek`, no call to
`appendTurnPair`, and no call to `recordUsage`. Mirrors the existing
`auth-guard`/`conversations-ownership` test shape (mock the boundary,
assert nothing downstream ran).

### `test/transcribe-ratelimit.test.ts` (new)

Same pattern: `isRateLimited` mocked `true` → `429`, `transcribeAudio`
and `recordUsage` never called.

### `test/speak-ratelimit.test.ts` (new)

Same pattern: `isRateLimited` mocked `true` → `429`, `synthesizeSpeech`
and `recordUsage` never called.

### Manual check (record in `progress-tracker.md`)

Temporarily lower `MINUTE_LIMIT` (e.g. to 2) in a local run, send several
turns in quick succession: the request that exceeds the limit gets a
`429` and the existing error `StatusLine` renders the "slow down" message
with no DeepSeek/Groq/ElevenLabs call made (confirm via provider dashboard
usage or added temporary logging, then remove it). Confirm a normal-paced
conversation (well under 10/minute) is never affected.

## Done criteria (`build-spec.md` Unit 9, provider names corrected)

1. "The 11th voice turn in a minute (transcribe+chat+speak, 3 calls
   each), or the 16th typed turn (chat+speak, 2 calls each), → a clean
   'slow down' state, no provider call made" — i.e. the 31st provider
   call in a minute or the 301st in a day is blocked. Verified by
   `test/ratelimit.test.ts`'s boundary cases and the manual check.
2. Every one of `transcribe`, `chat`, `speak` refuses to call its provider
   when `isRateLimited` is true (`test/*-ratelimit.test.ts`).
3. All three routes write a `usage_log` row on pass, tagged with their own
   `route` value (confirmed by code review and `test/ratelimit.test.ts`'s
   `recordUsage` assertions for all three route values).
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
