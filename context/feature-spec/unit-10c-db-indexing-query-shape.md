# Feature Spec — Unit 10c: Database indexing and query shape

> Part 3 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: DRAFT. Documentation only — no code in this unit has been
> written or should be started from this document alone.**

## One sentence

The `turns` table gets the index its own query patterns already need, and
`listConversations`' per-row extra query is either proven acceptable at the
real cap or fixed.

## Evidence

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

## In scope

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

## Out of scope

Any change to `settings`, `conversations`, or existing turn/conversation-
count caps.

## Suggested order

Land first, before any other Unit 10 sub-unit — it's a schema change, and
per `ai-workflow-rules.md` §3.4 that must land and be verified before
anything else in Unit 10 reads through it.

## Verification

```
npx drizzle-kit generate
npx drizzle-kit migrate    # verify against real Neon first
npm run build
npm run lint
npm test
```
