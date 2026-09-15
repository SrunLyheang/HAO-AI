# Feature Spec — Unit 10e: Upload handling — size caps (confirmed) and compression (assessed)

> Part 5 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: CLOSED — assessment-only finding, no code change. Record this
> in `progress-tracker.md` when picked up; nothing else to implement.**

## One sentence

Confirm the existing audio upload cap is sufficient and decide, explicitly,
whether audio compression is worth adding.

## Evidence

- Size cap: **already implemented**, both sides. `app/api/transcribe/
  validate.ts`'s `MAX_AUDIO_BYTES = 1 * 1024 * 1024` (1 MB) is enforced
  server-side (`parseTranscribeForm` rejects over-cap files) and
  `components/MicButton.tsx` imports the same constant for the client-side
  check (per progress-tracker's architecture-cleanup entry de-duplicating
  this exact value). No gap here — listed for completeness of the audit,
  not as a to-do.
- Compression: **not implemented, and likely not worth adding.** The cap is
  already a tight 1 MB and audio is never persisted (`architecture.md`:
  "No audio blobs... TTS regenerated on replay" — this is about the STT
  *upload*, which is short-lived, sent once, then discarded). Adding
  client-side audio compression (e.g. lowering `MediaRecorder`'s bitrate)
  would trade CPU/complexity for bandwidth savings on payloads that are
  already ≤1 MB and one-shot.

## In scope

None by default — this sub-unit's action is to record the above assessment
in `progress-tracker.md` as a closed finding, not to add compression code.
Revisit only if real usage shows the 1 MB cap being hit often enough to
matter (no evidence of that yet).

## Out of scope

Any compression implementation, absent evidence the cap is a real problem.

## Verification

Not applicable — no code change.
