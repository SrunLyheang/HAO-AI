# Feature Spec — Unit 10b: API/provider call timeouts

> Part 2 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: DRAFT. Documentation only — no code in this unit has been
> written or should be started from this document alone.**

## One sentence

Every outbound call to DeepSeek, Groq, or ElevenLabs has a hard timeout so a
hung upstream provider cannot hang the request indefinitely.

## Evidence

Grepped `lib/deepseek.ts`, `lib/groq-stt.ts`, `lib/elevenlabs-tts.ts` — no
`AbortController`, `signal`, or fetch timeout found in any of the three. A
hung provider response currently blocks the Vercel function for its full
execution-time ceiling with no earlier, user-visible failure.

## In scope

- Add an `AbortController`-based timeout to each of the three provider
  wrapper functions (`lib/deepseek.ts`'s `callDeepSeek`, `lib/groq-stt.ts`'s
  transcription call, `lib/elevenlabs-tts.ts`'s synthesis call), each
  surfacing a distinct "upstream timed out" error that the existing
  route-level `catch` blocks already turn into a `500`/`502` JSON response
  (no route-level change needed if the thrown error shape matches what the
  routes already catch — confirm this before touching the routes).
- **Timeout value: start at 15 seconds for all three providers.** This is a
  conservative default, not a measured p99 — no real latency data exists yet
  for any of the three. Ship this default so the fix isn't blocked on a
  separate research task; revisit and tighten per-provider once real usage
  produces latency data (note the actual observed p99 here when that
  happens, rather than guessing again).

## Out of scope

Retry/backoff logic beyond `app/api/chat/route.ts`'s existing one
malformed-JSON retry (unchanged, not a timeout concern).

## Suggested order

Land before `unit-10a-failure-state-ui-sweep.md` — 10a's failure-state sweep
needs this sub-unit's new timeout errors to already exist so it has
something to confirm renders correctly.

## Verification

```
npm run build
npm run lint
npm test
npm run dev   # manual check: simulate a slow/hung provider response
```
