# Feature Spec — Unit 10a: Failure-state UI sweep

> Part 1 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3 (the original combined Unit 10 doc covered seven
> unrelated concerns across 18 checklist lines — too broad for one unit, same
> reasoning as Units 7a/7b/7c). Derived from a production-readiness audit run
> against the live codebase on 2026-09-15 (every claim checked against actual
> files, not assumptions).
>
> **Status: DRAFT. Documentation only — no code in this unit has been
> written or should be started from this document alone.**

## One sentence

Every user-facing action that can fail, wait, or return nothing gets a
visible, recoverable state instead of a silent hang or blank screen.

## Evidence

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
- Duplicate-submission prevention: some coverage already exists (the "New
  conversation" button disables itself while pending). A full audit of every
  submit-capable control for the same guard was flagged in the original
  combined doc as folded into this sub-unit rather than a separate one — made
  explicit below so it isn't lost in the split.

## In scope

1. Audit every `fetch`/provider call site in `components/` for a loading
   indicator shown while in flight and an error message shown on failure —
   list every gap found before writing any fix (per `ai-workflow-rules.md`
   §4, do not guess, confirm against the actual component tree).
2. Add an explicit empty state to `components/HistoryPanel.tsx` for zero
   past conversations.
3. Confirm mic-permission-denial, STT failure, DeepSeek failure/timeout
   (see `unit-10b-provider-call-timeouts.md`), TTS failure, and offline
   (`navigator.onLine` or a failed-fetch check) each render through the
   existing `StatusLine` pattern — do not invent a second error-display
   mechanism.
4. Audit every submit-capable control (send button, replay button, mic
   press) for a pending-disable guard, matching the pattern already used by
   the "New conversation" button — this is a duplicate-submission-prevention
   sweep, not a separate unit, since it's the same UI-state problem as items
   1–3.

## Out of scope

Any new visual design system for errors — reuse the existing `StatusLine`
component and tokens (`ui-context.md`), per `ai-workflow-rules.md` §2.5.

## Suggested order

Depends on `unit-10b-provider-call-timeouts.md` landing first — 10b's new
timeout errors need somewhere to render, and this sweep is where that gets
confirmed (see item 3 above).

## Verification

```
npm run build
npm run lint
npm test
npm run dev   # manual check: trigger each failure path listed above
```
