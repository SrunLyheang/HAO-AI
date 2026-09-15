# Feature Spec — Unit 10h: Concurrency and backup-restore testing

> Part 8 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: DRAFT. Documentation only — no code in this unit has been
> written or should be started from this document alone.**

## One sentence

Confirm Neon's backup/restore actually works before relying on it. The
concurrency test below is deferred (see "Decision").

## Decision (resolved 2026-09-15)

**Concurrency test deferred, not dropped.** At current single-user scale
the `getOrCreateActiveConversation` race is low-probability and no bug
report has surfaced it — not worth the test/retry-logic cost right now.
Revisit if a second concurrent-request source appears (e.g. multiple
devices/tabs for the same user) or a real race is ever observed. The
backup-restore drill below is unaffected by this and should still happen —
it's a one-time manual check, not code, and data loss is irreversible
regardless of scale.

## Evidence

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

## In scope

1. A manual backup-restore drill against the real Neon project (not a
   code change): trigger a Neon point-in-time restore to a branch, confirm
   data comes back intact, record the result and the steps taken in
   `progress-tracker.md`. This is dashboard/infra verification, not
   application code — per `ai-workflow-rules.md` §5.4, give the user the
   exact steps rather than attempting it from application code.

## Deferred — revisit if a real race shows up

- A concurrency test for `getOrCreateActiveConversation` (two simultaneous
  calls for a user with no active conversation yet, racing to create one —
  `grep`-checked `test/` and found no such case) and, if it fails, retry-on-
  conflict handling in that function. Not built now per the Decision above.

## Out of scope

Load testing / stress testing beyond the deferred concurrency case above —
not requested, and this app's usage scale doesn't currently justify a
dedicated load-test harness.

## Suggested order

Land after `unit-10c-db-indexing-query-shape.md` (10c), `unit-10b-provider-
call-timeouts.md` (10b), and `unit-10a-failure-state-ui-sweep.md` (10a) —
this sub-unit tests write paths those earlier sub-units may touch.

## Verification

```
npm run build
npm run lint
npm test
git status && git log --oneline -1
```
