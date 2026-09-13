# Feature Spec — Unit 8: History overlay + conversation lifecycle

> Derived from `build-spec.md` Unit 8, `architecture.md`'s `app/api/conversations/`
> row and "Ownership"/"One active conversation per user" sections,
> `ui-context.md`'s "History — Radix Dialog" spec, and — now that it exists —
> `context/feature-spec/unit-7c-conversation-persistence.md`, whose "Decisions
> made" section explicitly hands this unit `app/api/conversations/`, the
> History panel, and the "New conversation" control. Reconciled 2026-09-14
> against the real Unit 7a/7b/7c specs (this draft originally guessed at
> Unit 7's shape from `architecture.md` alone; that guess is now replaced
> with 7c's actual `db/queries.ts` functions and types).
>
> **Prerequisite: Unit 7a + 7b + 7c must be implemented and verified first.**
> This unit calls `getOrCreateActiveConversation`, `createConversationWithGreeting`,
> `appendTurnPair`, and `countTurns` from `db/queries.ts` and uses the
> `Turn`/`Conversation` types — all defined in 7a/7c, not here.
>
> **Confirmed by the user (2026-09-14):**
> - The new-conversation opening turn is a **static, hardcoded greeting**
>   (no LLM call) — 7c confirms this (`createConversationWithGreeting`
>   inserts the same literal `"你好！今天想聊什么？"` text, no DeepSeek
>   call). `app/api/conversations/` makes no provider calls and stays out
>   of Unit 9's rate-limiting scope.
> - **The active conversation appears in the history list**, labeled
>   "Current," not hidden.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Add `listConversations`/`getConversationTurns` to `db/queries.ts` (and
**export** 7c's already-written `createConversationWithGreeting` instead of
writing a new creation function), expose them via `GET /api/conversations`,
`GET /api/conversations/[id]`, and `POST /api/conversations`, build a Radix
Dialog `HistoryPanel`, wire the (currently disabled) history icon and a new
"New conversation" button into `components/ConversationScreen.tsx` (the
client component 7c split out of `app/page.tsx`), and disable the input
once the live conversation reaches 25 turns.

## Why this is its own step (`ai-workflow-rules.md` §3.3)

- Touches `db/queries.ts`, two new route files, one new component, and
  `components/ConversationScreen.tsx` — past the "roughly three files"
  threshold in §3.1.
- Reuses a function (`createConversationWithGreeting`) that already
  performs a multi-table transaction (archive + insert + 50-cap prune) —
  changing its visibility and giving it a second caller is exactly the kind
  of change `ai-workflow-rules.md` §3.3 says should land as its own
  reviewed step.
- Every new query must be scoped by `user_id` per `code-standards.md`'s
  "never fetch by `id` alone" rule — worth its own focused review pass.

## Correction to the original draft, now that 7c is real

The original draft invented a `startNewConversation` function that
duplicated the archive-plus-insert-plus-prune transaction. **7c already
wrote that exact transaction** as `createConversationWithGreeting(userId)`
— it even calls out, in its own inline comment, that Unit 8's "New
conversation" action is the second caller that makes the
archive-existing-active step load-bearing rather than defensive. The only
gap: 7c's code sample defines it as a plain (unexported) function. This
unit's first change is a one-line addition to 7c's `db/queries.ts` —
prefix it with `export` — not a reimplementation.

## In scope

### 1. `db/queries.ts` (edit)

- **Export `createConversationWithGreeting`** (add the `export` keyword to
  the function 7c already wrote). No change to its body — same 50-cap
  prune, same archive-previous-active step, same seeded-greeting insert,
  same transaction.
- Two new functions, following 7c's existing conventions exactly (`userId`
  first, always in the `where` clause, using the same `toTurn` mapper 7c
  introduced):

  ```ts
  export async function listConversations(
    userId: string
  ): Promise<ConversationSummary[]> {
    // All conversations for userId (active + archived), newest first,
    // joined to each conversation's earliest turn for the preview text.
  }

  export async function getConversationTurns(
    userId: string,
    conversationId: string
  ): Promise<Turn[] | null> {
    // Turns for conversationId, ordered by createdAt, filtered by BOTH
    // conversationId AND userId in the same query (never fetch by id
    // alone — code-standards.md). Returns null if not found or not owned.
  }
  ```

### 2. `types/index.ts` (edit)

Add one new shared type, built on 7c's `Conversation`:

```ts
export interface ConversationSummary extends Conversation {
  preview: string; // first turn's text_zh; one-line truncation is CSS, not here
}
```

- `ConversationSummary` already carries `status: "active" | "archived"`
  from `Conversation` — no separate `isActive` boolean needed.
  `HistoryPanel` checks `status === "active"` directly.

### 3. `app/api/conversations/route.ts` (new)

- `GET` — `requireUser()` → `listConversations(userId)` → `200 { conversations: ConversationSummary[] }`.
- `POST` — `requireUser()` → `createConversationWithGreeting(userId)` →
  `200 { conversation: Conversation, turns: Turn[] }` — same response
  shape 7c's `getOrCreateActiveConversation` already returns, so the client
  handles both call sites identically.
- No other methods. Same `{ error: string }` shape on failure as every
  other route.

### 4. `app/api/conversations/[id]/route.ts` (new)

- `GET` only — `requireUser()` → `getConversationTurns(userId, params.id)`.
  `null` → `404 { error: "Not found" }`. Otherwise `200 { turns: Turn[] }`.
- Read-only: no `PATCH`/`DELETE`. Loading a past conversation never mutates
  it (matches `project-overview.md` step 18: "Tapping one loads that
  transcript read-only").

### 5. `components/HistoryPanel.tsx` (new)

Radix `Dialog`, per `ui-context.md`'s "History — Radix Dialog" section:

- Full-height panel sliding from the right, `max-width: 420px` (full width
  below 480px), `--surface` background, `--radius-lg` on the left corners,
  `0 2px 8px` shadow ceiling, `--scrim` overlay.
- Header: "History" label, Phosphor `X` close button top-right.
- Body: fetches `GET /api/conversations` on open (not on every app load —
  the disabled history icon becomes enabled and lazy-loads its content only
  when clicked). One row per conversation: date in `--text-meta`/
  `--font-mono`, `preview` truncated to one line via CSS, separated by
  `border-bottom: 1px solid var(--border)`, hover
  `background: var(--surface-sunken)`. The row where `status === "active"`
  (at most one) renders a small "Current" label instead of just a date, and
  sorts first regardless of `createdAt` order among the rest.
- Empty state: centered `--text-muted` "No past conversations yet." — in
  practice unreachable once Unit 7 lands (`getOrCreateActiveConversation`
  always keeps one `active` conversation), but kept as the defensive render
  for an empty list.
- Selecting the **"Current"** row just closes the dialog — it's already
  the live view, nothing to fetch or switch into.
- Selecting any other (archived) row calls `GET /api/conversations/[id]`,
  closes the dialog, and hands the loaded turns up via an `onSelect`
  callback — the panel itself holds no conversation-rendering logic beyond
  the list and this fetch-on-select.

### 6. `components/ConversationScreen.tsx` (edit)

Unit 7c moved today's `app/page.tsx` client body here, taking initial
`conversation`/`turns` as props from the new Server Component
`app/page.tsx`. This unit's UI wiring lands in that client component, not
`app/page.tsx` itself:

- Add `conversationId` state, seeded from the `conversation` prop 7c
  already passes in, and pass it as the `conversationId` field 7c's
  `app/api/chat/route.ts` now requires on every `send()` call.
- Add a `viewMode: "live" | "history"` state (default `"live"`).
- History icon (disabled since Unit 5's Open Questions #1) becomes enabled;
  clicking it opens `HistoryPanel`.
- `HistoryPanel`'s `onSelect(turns)` sets `viewMode = "history"` and stores
  the loaded turns separately from the live `history` state — the live
  conversation's in-memory state is never overwritten by a read-only view.
- While `viewMode === "history"`: render the same turn-list UI
  (`TurnCard`) against the loaded read-only turns, hide the mic button,
  type/talk toggle, and "New conversation" button, and show one "Back to
  conversation" action (per `project-overview.md` step 18) that sets
  `viewMode = "live"` and discards the loaded turns.
- "New conversation" button (new in this unit): calls
  `POST /api/conversations`, replaces live `history` with the returned
  `turns` (the seeded greeting) and updates `conversationId` to the
  returned `conversation.id`, resets any per-turn client state keyed by
  turn index (`turnRates`, `turnTimestamps`), and auto-plays the new
  greeting's audio the same way a normal AI turn does.
- **25-turn cap (client-side UI only — the server-side reject against the
  real stored count is 7c's `countTurns`/`app/api/chat/route.ts` check):**
  once `history.length >= 25`, disable the mic button and the type/talk
  input and show a message ("This conversation is full — start a new one
  to keep going.") in the same `StatusLine` slot used for other inline
  messages, with "New conversation" remaining enabled as the way out. If
  the server ever rejects a turn as full (race: two tabs, stale client
  count), `send()`'s existing generic-error path already surfaces that —
  no special-cased message is added here.

## Out of scope (explicitly — do not build now)

- The server-side hard reject of a 26th `turns` insert and the
  `conversationId` requirement on `/api/chat` — both already specified and
  built in 7c. This unit only adds the client-side disabled-input
  experience once the cap is reached.
- Re-implementing the archive/insert/prune transaction — reuse 7c's
  `createConversationWithGreeting`, per the correction above.
- Editing, deleting, exporting, searching, or renaming past conversations —
  history is list-and-view only, per `project-overview.md`'s scope.
- Pagination or infinite scroll on the history list — the 50-conversation
  retention cap (7c) already bounds the list size; render it as one flat
  list.
- Any change to `settings`, rate limiting, or provider calls.
- Any styling/token change beyond what `ui-context.md` already specifies
  for the History dialog.

## Files touched

| File | Change |
|------|--------|
| `db/queries.ts` | edit — export `createConversationWithGreeting`; add `listConversations`, `getConversationTurns` |
| `types/index.ts` | edit — add `ConversationSummary extends Conversation` |
| `app/api/conversations/route.ts` | new — `GET` (list), `POST` (new conversation, via `createConversationWithGreeting`) |
| `app/api/conversations/[id]/route.ts` | new — `GET` (load one, read-only) |
| `components/HistoryPanel.tsx` | new — Radix Dialog, list + fetch-on-select |
| `components/ConversationScreen.tsx` | edit — `conversationId`/`viewMode` state, history icon wiring, "New conversation" button, 25-turn cap UI |

## Tests (`test/`)

### `test/conversations-auth-guard.test.ts` (new)

Same pattern as `test/auth-guard.test.ts` (Unit 6): mock `@clerk/nextjs/server`'s
`auth` to return `{ userId: null }` for each of `GET /api/conversations`,
`POST /api/conversations`, `GET /api/conversations/[id]` and assert `401`
with no `db/queries.ts` function called.

### `test/conversations-ownership.test.ts` (new)

Mock `db/queries.ts`'s `getConversationTurns` to return `null` (simulating
a conversation owned by a different user) and assert the route returns
`404`, not the turns of any other mocked data — proves the route never
falls back to an unscoped lookup.

### `test/queries-conversations-list.test.ts` (new, extends 7c's `test/queries-conversations.test.ts` seam)

Against the same mocked-Drizzle pattern 7c's own tests use:

- `listConversations` returns both the `active` and all `archived`
  conversations for a user, newest first, each with the correct preview
  text from its earliest turn.
- Calling the exported `createConversationWithGreeting` a second time for a
  user who already has one active conversation archives the old one — this
  is 7c's existing pruning/archiving test, now also exercised as this
  unit's actual "New conversation" call path rather than only a defensive
  invariant.

### Manual browser check (record in `progress-tracker.md`)

Open history with only the current (brand-new) conversation: it appears
labeled "Current," nothing else. Have two or more archived conversations:
list shows Current first, then the rest newest first, dates in monospace,
one-line previews, no overlap at 400px. Select an archived row: transcript
loads read-only, mic/input/"New conversation" are hidden, "Back to
conversation" returns to the live, still-intact conversation. Tap "New
conversation" mid-conversation: current conversation disappears from the
live view, a fresh greeting turn appears and plays audio, `conversationId`
updates so the next `send()` targets the new conversation, and the old
conversation now shows up in history (no longer "Current"). Manually drive
a conversation to 25 turns (or temporarily lower the constant for the
check): confirm the input disables with the message and "New conversation"
still works.

## Done criteria (`build-spec.md` Unit 8)

1. "History panel lists past conversations by date, newest first; tapping
   one opens it read-only." — verified manually.
2. "'New conversation' archives the current conversation and seeds a fresh
   greeting." — verified manually; confirmed via the archived conversation
   appearing in the next history-panel load, no longer marked "Current."
3. "At 25 turns the input is disabled with a 'start a new conversation'
   prompt." — verified manually.
4. Every new query in `db/queries.ts` takes `userId` and scopes by it; no
   query fetches by `id` alone (`test/conversations-ownership.test.ts`).
5. All three new/changed routes reject an unauthenticated request before
   any DB call (`test/conversations-auth-guard.test.ts`).
6. `npm run build` and `npm run lint` pass; `strict` stays `true`; no `any`,
   `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
7. `npm test` green, including the new suites and every prior test file
   (7a/7b/7c's included) unchanged.
8. Diff contains only Unit 8 scope: no schema change, no rate limiting, no
   provider-call change, no styling beyond the already-specified History
   dialog, and no reimplementation of `createConversationWithGreeting`'s
   transaction.
9. `architecture.md`'s `app/api/conversations/` row and `ui-context.md`'s
   History section already describe this unit's target state — confirmed
   still accurate, not edited, at handback.
10. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm run build
npm run lint
npm test
npm run dev   # manual check: history list, read-only load, new conversation, 25-turn cap
git status && git log --oneline -1
```

## Open questions

None — reconciled against the real 7a/7b/7c specs (2026-09-14). If 7c's
implementation ends up differing from its own spec in a way that changes
`createConversationWithGreeting`'s signature or `Turn`/`Conversation`'s
shape, re-check this unit's `db/queries.ts` additions and
`ConversationSummary` against whatever actually shipped before starting.

## Follow-ups to hand back (do NOT start in Unit 8)

- Unit 9: `usage_log` rate limiting applies to `app/api/chat` and
  `app/api/transcribe` per `architecture.md` — `app/api/conversations/`
  makes no provider calls and is not in scope for rate limiting.
- Unit 10: history panel needs a loading state and a failed-fetch error
  state (empty-list vs. request-failed are currently the same "nothing
  rendered" gap) — covered by Unit 10's "every failure path" sweep, not
  this unit.
