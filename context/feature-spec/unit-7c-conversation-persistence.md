# Feature Spec — Unit 7c: Conversation + Turn Persistence

> Part 3 of 3 for `build-spec.md` Unit 7 ("Persistence"). Depends on 7a
> (schema) and 7b (establishes the `db/queries.ts` file and its test
> pattern) and on Unit 6 (`requireUser()`). Implements the bulk of Unit 7's
> stated scope: "Save each turn, reload on open, greeting seeded
> server-side, ... retention cap (~50 convos/user)."
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Add conversation/turn functions to `db/queries.ts`, convert `app/page.tsx`
to load the active conversation server-side (Server Component), persist
each turn pair from `app/api/chat/route.ts`, and enforce the 25-turn and
50-conversation caps.

## Why this is its own step

- `ai-workflow-rules.md` §3.1: touches `db/queries.ts` (more functions),
  `app/page.tsx` (a structural change — Client Component becomes a Server
  Component wrapper around a client child), `app/api/chat/route.ts`, and
  `types/index.ts` — four files with real logic, past the split threshold
  even on its own.
- §3.4: this is the step that actually exercises the schema 7a defined and
  the query pattern 7b established.

## Decisions made in the grilling session that produced this spec (2026-09-14)

1. **`app/api/conversations/` is deferred to Unit 8.** `architecture.md`
   assigns "listing, loading one transcript, creating a new conversation,
   archiving, pruning" to that route, but Unit 7's own scope (per
   `build-spec.md`) is "reload on open" — the *current* conversation, on
   *your own* page load — which `code-standards.md`'s "Default to Server
   Components" rule covers without an HTTP round trip. Unit 8 is the unit
   that adds the History panel, which needs to fetch *other* past
   conversations client-side — that is when `app/api/conversations/`
   earns its place. This unit therefore has no route by that name; the
   equivalent logic lives directly in `db/queries.ts`, called from a
   Server Component.
2. **The 50-conversation retention cap is built and tested here, even
   though nothing yet triggers a second conversation via the UI.**
   `build-spec.md`'s own Unit 7 done criteria states "Creating a 51st
   conversation prunes the oldest" — this is Unit 7's requirement, not a
   speculative build-ahead for Unit 8. It is verified by a `db/queries.ts`
   unit test that calls the creation function 51 times, not by a live UI
   flow (Unit 8 adds the "New conversation" button that would exercise
   this in the browser).
3. **The greeting text is carried over unchanged.** `app/page.tsx`
   currently hardcodes one greeting (`"你好！今天想聊什么？"`) regardless
   of HSK level, with a comment already anticipating this move ("Unit 7
   seeds the greeting server-side instead"). This unit moves that exact
   string server-side; it does not add per-level greeting variation, which
   was never requested and is not in any source document.

## In scope

### 1. `db/queries.ts` (edit — add to the file 7b started)

```ts
export async function getOrCreateActiveConversation(
  userId: string
): Promise<{ conversation: Conversation; turns: Turn[] }> {
  const existing = await db.query.conversations.findFirst({
    where: and(eq(conversations.userId, userId), eq(conversations.status, "active")),
  });
  if (existing) {
    const rows = await db.query.turns.findMany({
      where: eq(turns.conversationId, existing.id),
      orderBy: asc(turns.createdAt),
    });
    return { conversation: existing, turns: rows.map(toTurn) };
  }
  return createConversationWithGreeting(userId);
}

async function createConversationWithGreeting(userId: string) {
  // In one transaction: enforce the 50-conversation cap (delete the oldest
  // for this user if count >= 50), archive any existing active row for this
  // user (should not exist in practice yet — Unit 8 is what could leave one
  // active across a "new conversation" action — but this makes the
  // invariant hold by construction, not by caller discipline), insert the
  // new active conversation, insert the seeded greeting turn.
}

export async function appendTurnPair(
  userId: string,
  conversationId: string,
  userTurn: { text_zh: string },
  aiTurn: { text_zh: string; pinyin: string; text_en: string; correction: string; correctionPinyin: string }
): Promise<void> {
  // Reject if the conversation already has 25 turns (the 26th-turn
  // rejection lives in the route per code-standards.md; this function just
  // inserts — the route checks the count first via a query on this table).
}

export async function countTurns(userId: string, conversationId: string): Promise<number> {
  // Used by the route to enforce the 25-turn cap before calling appendTurnPair.
}
```

- Every function takes `userId` and includes it in every `where` clause —
  no function fetches a conversation or turn by `id` alone, per
  `architecture.md` invariant 3 and `code-standards.md`'s explicit
  "Never fetch by `id` alone."
- `createConversationWithGreeting`, the 50-cap deletion, and the
  archive-previous-active step all run in one DB transaction, per
  `code-standards.md`: "on the 51st conversation for a user, delete the
  oldest in the same transaction" / "on a new conversation, archive the
  previous active one in the same transaction."
- `toTurn` is a small mapper from the DB row shape (`snake_case` columns,
  `Date` objects) to the `Turn` type (see `types/index.ts` changes below) —
  the one place `Date` → ISO string serialization happens, per
  `code-standards.md`'s date-handling rule.

### 2. `types/index.ts` (edit)

Widen `Turn` and add `Conversation`, matching the comment already in the
file ("Unit 7 adds persistence fields (id, created_at, conversation_id)"):

```ts
export type Turn =
  | { id: string; role: "user"; text_zh: string; createdAt: string }
  | {
      id: string;
      role: "ai";
      text_zh: string;
      pinyin: string;
      text_en: string;
      correction: string;
      correctionPinyin: string;
      createdAt: string;
    };

export type Conversation = { id: string; status: "active" | "archived"; createdAt: string };
```

- `createdAt` is an ISO 8601 UTC string on the wire, per
  `code-standards.md`'s "Dates are `Date` in code, `timestamptz` in the
  DB, ISO 8601 UTC strings on the wire."
- This is a breaking-ish widen of `Turn` (adds required fields) — every
  existing caller that constructs a `Turn` literal (the hardcoded
  `GREETING` in `app/page.tsx`, any test fixtures) needs the new fields.
  Since the greeting itself moves server-side in this same unit, the
  client-side `GREETING` constant is deleted, not updated — see below.

### 3. `app/page.tsx` (edit — structural)

- Per `code-standards.md`: "Default to Server Components... `use client`
  only where the browser API or interactivity requires it," and "Keep
  `use client` at the leaves... pass data in as props from a server
  parent." Split into:
  - `app/page.tsx` — becomes a Server Component (`async function Page()`),
    calls `requireUser()` (already true post-Unit-6 via middleware, but
    the route/page-level call is what makes `userId` available here) then
    `getOrCreateActiveConversation(userId)`, passes `{conversation, turns}`
    as props to a new client child.
  - `components/ConversationScreen.tsx` (new) — the existing `"use client"`
    body of today's `app/page.tsx` (all the recording/playback/UI-state
    logic), now taking initial `conversation`/`turns` as props instead of
    seeding `history` from the hardcoded `GREETING` constant.
- The hardcoded `GREETING` constant is deleted from `app/page.tsx` — the
  comment above it ("Unit 7 seeds the greeting server-side instead")
  already names this unit as the one that removes it. The exact same
  Chinese/pinyin/English text moves into
  `createConversationWithGreeting`'s insert.
- No other behavior changes: `send()`, `handleRecordedAudio()`, `speak()`,
  and every existing preference (`zh_only_mode`, `display_support`,
  `text_scale`) are unaffected — this unit's split follows
  `ai-workflow-rules.md` §3.3's "cannot be completed without it" bar for
  the one refactor it does require (Server/Client split), and does not
  extend beyond it.

### 4. `app/api/chat/route.ts` (edit)

- After DeepSeek's reply is validated and pinyin is generated (existing
  logic, unchanged), before returning the response:
  1. Call `countTurns(userId, conversationId)` — if already 25, return the
     existing "conversation full" error shape instead of calling
     `appendTurnPair` (`architecture.md` invariant 9 / `build-spec.md`
     Unit 7's neighbor, the 25-turn cap, already exists as a design but
     this is the first unit to actually enforce it against real stored
     turns rather than in-memory history length).
  2. Call `appendTurnPair(userId, conversationId, ...)` to persist both the
     user's turn and the AI's turn.
- The request body gains `conversationId` (the client already has it from
  the initial server-side load). `app/api/chat/validate.ts`'s
  `parseChatRequest` is extended to require and validate it as a UUID
  string.
- No change to the DeepSeek call itself, the retry-once logic, or the
  500-char cap — those are unchanged from Units 1/2.

## Out of scope (explicitly — do not build now)

- `app/api/conversations/` (listing, explicit "new conversation" creation,
  archiving via a button, read-only opening of a past conversation) — all
  Unit 8, per Decision #1 above.
- The History panel UI — Unit 8.
- Rate limiting (`usage_log`) — Unit 9.
- Any change to `app/api/transcribe/route.ts` or `app/api/speak/route.ts` —
  neither persists anything.
- Per-level greeting variation — never requested, not in scope (Decision #3).

## Files touched

| File | Change |
|------|--------|
| `db/queries.ts` | edit — `getOrCreateActiveConversation`, `createConversationWithGreeting`, `appendTurnPair`, `countTurns` |
| `types/index.ts` | edit — widen `Turn`, add `Conversation` |
| `app/page.tsx` | edit — becomes a Server Component, loads via `getOrCreateActiveConversation` |
| `components/ConversationScreen.tsx` | new — today's `app/page.tsx` client body, moved, taking initial data as props |
| `app/api/chat/route.ts` | edit — `conversationId` in request, persists the turn pair, enforces the 25-turn cap against stored count |
| `app/api/chat/validate.ts` | edit — `conversationId` added to `parseChatRequest` |

## Tests (`test/`)

### `test/queries-conversations.test.ts` (new)

Mocked Drizzle client (same pattern as 7b's `queries-settings.test.ts`):

- `getOrCreateActiveConversation` creates a new conversation + seeded
  greeting turn when none exists for the user; returns the existing one
  (with its turns, in order) when an active one already exists.
- Calling the creation path 51 times for the same mocked user results in
  the 51st call deleting the oldest conversation — this is the test that
  satisfies `build-spec.md`'s "Creating a 51st conversation prunes the
  oldest" done criterion (per Decision #2, exercised at the query level).
- `appendTurnPair` is called with the given `userId` on every insert — no
  path constructs a query without it.
- `countTurns` returns the correct count for a conversation with 0, 1, and
  25 turns.

### `test/chat-conversation.test.ts` (extends the existing chat route tests)

- A request with a `conversationId` for a conversation already at 25 turns
  is rejected before `appendTurnPair` is called (mock it and assert
  `not.toHaveBeenCalled()`).
- A valid request calls `appendTurnPair` with both the user's and the AI's
  turn data after a successful DeepSeek round trip.
- Malformed/missing `conversationId` returns `400` before any DeepSeek
  call — matches the existing "parse and validate before provider work"
  pattern from `app/api/chat/validate.ts`.

### Manual browser check (record in `progress-tracker.md`)

Refresh mid-conversation: confirm the full transcript (not just the
greeting) reloads in order. Sign in as the same user in a second browser
profile: confirm the same active conversation and its turns appear there
too (not a separate one). Confirm the greeting text matches exactly what
was previously hardcoded client-side.

## Done criteria (`build-spec.md` Unit 7, the parts this file completes)

1. "Refresh mid-conversation → transcript is still there." — verified
   manually (see above).
2. "Creating a 51st conversation prunes the oldest." — verified by
   `test/queries-conversations.test.ts`'s 51-call case.
3. "Every DB query is filtered by `userId` (verified: user A's ID cannot
   fetch user B's transcript)." — verified at the query-builder level by
   every new test asserting the mocked call includes the given `userId`;
   the SQL-level guarantee is `architecture.md` invariant 3
   (non-null `user_id` FK + mandatory `where` clause), unchanged by this
   unit, not re-derived here.
4. `npm run build` and `npm run lint` pass. No new `any`, `@ts-ignore`, or
   `eslint-disable`.
5. `npm test` green, including both new test files and every prior test
   file (updated only where `Turn`'s widened shape requires a fixture
   update — no behavior-affecting change to any existing test).
6. Diff contains only 7c scope: no `app/api/conversations/` route, no
   History UI, no rate limiting.
7. `architecture.md`'s storage model and invariants now match the code
   exactly for conversation/turn persistence — confirmed at handback.
8. Clean commit on `main`, no push.

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # manual check: reload mid-conversation, cross-browser-profile check, greeting text match
git status && git log --oneline -1
```

## Open questions

None — the two structural decisions this unit needed (deferring
`app/api/conversations/` to Unit 8, and building the 50-cap now despite no
UI trigger yet) were both resolved in the grilling session that produced
this spec (2026-09-14); see "Decisions made" above.

## Follow-ups to hand back (do NOT start in 7c)

- Unit 8: `app/api/conversations/route.ts` (list, explicit new-conversation
  creation with archive-previous, read-only load of a past conversation),
  the History panel component, and wiring the existing (currently disabled)
  history icon and "New conversation" control to it.
- Unit 9: `usage_log` table and rate limiting — now more urgent than ever
  once real persistence makes the app fully usable end-to-end (echoing
  Unit 6's own follow-up note about not leaving a long gap before Unit 9).
