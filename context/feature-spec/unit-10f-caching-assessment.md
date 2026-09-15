# Feature Spec — Unit 10f: Caching repeated requests

> Part 6 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: CLOSED — assessment-only finding, no code change. Record this
> in `progress-tracker.md` when picked up; nothing else to implement.**

## One sentence

Assess whether any repeated-request caching is missing beyond what Unit 2's
DeepSeek prompt caching already provides.

## Evidence

`build-spec.md`'s Unit 2 already specifies system-prompt caching for the HSK
word list ("prompt-cached... repeated turns don't re-bill the full word
list"). Every other provider call in this app is inherently non-repeatable
per its own design: each chat turn is a unique message in a growing
conversation (nothing to cache), and TTS audio is deliberately regenerated
on every replay rather than cached/stored (`architecture.md`'s explicit "no
audio blobs" invariant — caching TTS output would mean persisting audio,
which directly conflicts with that invariant).

## In scope

None identified. Record this as a closed finding — the one place caching
plausibly applies (the HSK prompt) is already built. Do not add a caching
layer speculatively.

## Out of scope

Any new caching layer, absent a repeated-request pattern that doesn't
already have one.

## Verification

Not applicable — no code change.
