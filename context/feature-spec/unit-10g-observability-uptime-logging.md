# Feature Spec — Unit 10g: Observability — uptime monitoring and structured error logging

> Part 7 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: DRAFT. Documentation only — no code in this unit has been
> written or should be started from this document alone.**

## One sentence

Decide on and wire up an uptime monitor and give provider call failures a
queryable log line instead of a bare `console.error`.

## Evidence

- Uptime monitoring: **none found.** No health-check route, no Sentry/
  equivalent SDK in `package.json`, no external monitor configuration in
  the repo.
- Error logging: **minimal.** `app/api/chat/route.ts` uses plain
  `console.error("chat: DeepSeek call failed", err)` — readable in Vercel's
  log stream but not structured, not queryable, and not alerting anyone.

## In scope

1. Uptime monitoring is a dashboard/external-service decision, not code —
   per `ai-workflow-rules.md` §5.4, this stops at a checklist for the user
   rather than an implementation. **Which monitor to use is left open** —
   confirmed with the user this doesn't get picked now, since it's blocked
   on `unit-0b-deploy-pipeline.md`'s deploy pipeline existing first:
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

## Out of scope

Any paid observability service, log aggregation pipeline, or alerting
integration — not requested, and `build-spec.md`'s own "Deliberately
skipped" list already excludes "audit logging" at this scale.

## Verification

```
npm run build
npm run lint
npm test
npm run dev   # manual check: trigger a provider failure, confirm log shape
```
