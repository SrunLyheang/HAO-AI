# Feature Spec — Unit 3: Voice Input (STT)

> Derived from `build-spec.md` Unit 3. Adds a press-and-hold mic to the Unit
> 1/2 harness: record audio in the browser, transcribe it server-side with
> OpenAI `gpt-4o-transcribe`, and feed the resulting Chinese text into the
> existing `/api/chat` loop unchanged. Still no auth, no persistence, no TTS,
> no rate limiting — those are later units.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Press-and-hold a mic button → `MediaRecorder` captures audio → on release,
`POST /api/transcribe` (multipart, size/duration-capped) → OpenAI
`gpt-4o-transcribe` returns Chinese text → that text is sent through the
existing typed-message pipeline (`/api/chat`) exactly as if it had been typed.

## Why this is its own step (`ai-workflow-rules.md` §3)

- It crosses a new trust boundary: the second provider key
  (`OPENAI_API_KEY`) and the second route that spends money and accepts a
  binary payload instead of JSON.
- It is the biggest *technical* unknown named in `build-spec.md`'s build
  order (browser mic round-trip across Chrome + Safari, iOS included) — proven
  now, before Unit 4 layers audio playback on top and Unit 5 restyles the
  button.
- It touches `architecture.md` invariant 4 (audio is never persisted) and
  invariant 6 (no provider call before size/duration caps pass) — both need
  their own verification, not folded into an unrelated change.

## In scope

### 1. `lib/openai.ts` (new, server-only)

- The **only** module that reads `OPENAI_API_KEY`
  (`architecture.md` folder-ownership + invariant 1).
- Single export:
  ```ts
  export async function transcribeAudio(audio: Blob, contentType: string): Promise<string>
  ```
- Plain `fetch` `multipart/form-data` POST to
  `https://api.openai.com/v1/audio/transcriptions` with
  `model: "gpt-4o-transcribe"` — no SDK, consistent with Unit 1's
  `lib/deepseek.ts` choice (Open Questions #1 there was resolved as "fetch,
  add the SDK later only if `transcribe` wants it too"; it doesn't).
- Returns the transcript string (`json.text`). Does **not** validate
  emptiness — that is the route's job at the boundary
  (`code-standards.md` §API Routes).
- On non-2xx or network failure: `throw` with a message that does **not**
  include the key. The route turns this into a `500`.
- Audio is passed straight through as the streamed request body of this one
  call and is never written to disk, a variable that outlives the request, or
  any store (invariant 4).

### 2. `app/api/transcribe/validate.ts` (new)

Mirrors `app/api/chat/validate.ts` — a pure, HTTP-free function so the
boundary check is unit-testable (`code-standards.md` §TypeScript: "validate
all external input at the boundary ... reject on mismatch").

```ts
export const MAX_AUDIO_BYTES = 1 * 1024 * 1024; // 1 MB, architecture.md invariant 6
export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
] as const;

export type ParsedAudio = { file: Blob; contentType: string };

export function parseTranscribeForm(form: FormData): ParsedAudio | null
```

- `form.get("audio")` must be a `Blob`/`File` (not a string) → else `null`.
- `file.type` must start with one of `ALLOWED_AUDIO_TYPES` (allow a
  `;codecs=...` suffix, e.g. `audio/webm;codecs=opus`) → else `null`.
- `file.size` must be `> 0` and `<= MAX_AUDIO_BYTES` → else `null`.
- Duration is **not** measured server-side (would require decoding the
  audio — a real dependency for one cheap check). `code-standards.md` §API
  Routes is explicit that duration is "checked client-side and re-checked
  server-side by content length" — size is the server-side proxy; the client
  enforces the 60s wall-clock cap directly (see `app/page.tsx` below).

### 3. `app/api/transcribe/route.ts` (new, POST only)

Handler order (`code-standards.md` §Next.js route order, minus the two steps
that don't exist until Units 6/9 — same posture Unit 1 and 2 took):

1. **Parse the multipart body.** `await req.formData()` in a try/catch →
   non-multipart or unparseable body → `400 { error: "Invalid form data" }`.
2. **Validate + cap.** `parseTranscribeForm(form)` → `null` → `400`
   with a specific message (`"Missing audio"` / `"Unsupported audio type"` /
   `"Audio too large"`), chosen inside `route.ts` from which check failed so
   the client can show something useful (validate.ts itself just returns
   `null`, matching the `parseChatRequest` precedent of a single boundary
   function feeding route-level error branching — see Open Questions #2 for
   the alternative of a discriminated-error return).
3. **Call `transcribeAudio`.** On throw → `console.error` (no audio bytes,
   no key in the message) → `500 { error: "Upstream unavailable" }`.
4. **Reject an empty transcript.** `text.trim().length === 0` →
   `422 { error: "Could not understand audio" }` (silence / noise-only
   clips) — new status code for this route, documented in the contract below.
5. **Respond** `200` with `{ text }`. No persistence, no pinyin, no chat call
   — `app/api/transcribe/` "must not contain" LLM calls or TTS calls per
   `architecture.md`'s boundary table; the client makes the follow-up
   `/api/chat` call itself, same as it already does for typed input.

Failure shape stays `{ error: string }`, consistent with `/api/chat`.

### 4. `app/page.tsx` (edit)

Still the Unit 1/2 typed dev harness — the mic is an additional input path
into the same `send()` pipeline, not a new screen (Unit 5 does the real
layout and the Siri-style ring).

- Refactor `send()` to accept the outgoing text as a parameter
  (`send(message: string)`) instead of reading `input` directly, so both the
  textarea button and the mic path can call it. The textarea's Send button
  passes `input`; recording passes the transcript. Behavior for the typed
  path is otherwise unchanged.
- New client-only recording state: `recording: boolean`,
  `micError: string | null`.
- **Mic button** (plain, next to the existing Send button — not the Unit 5
  circle):
  - `onMouseDown`/`onTouchStart` → request `getUserMedia({ audio: true })`.
    - Permission denied / no device → `setMicError("Microphone access
      denied — check your browser settings.")`, no recording starts. Button
      stays enabled for a retry (done-criterion: "a message, not a dead
      button").
    - Granted → pick a supported `mimeType` via
      `MediaRecorder.isTypeSupported()` (try `audio/webm;codecs=opus` first,
      then `audio/mp4` — covers Chrome/desktop-Safari and iOS Safari
      respectively), start `MediaRecorder`, collect chunks in a ref, start a
      60s `setTimeout` that force-stops if the user holds past the cap.
  - `onMouseUp`/`onTouchEnd`/`onMouseLeave` → stop the recorder and the
    timer; on `stop`, assemble the `Blob`, stop all media stream tracks
    (release the mic indicator), then:
    - `blob.size > MAX_AUDIO_BYTES_CLIENT` (same `1 * 1024 * 1024` constant,
      duplicated client-side — no shared import between a server `lib/` file
      and a client component per `code-standards.md` §TypeScript) → reject
      without uploading, `setMicError("Recording too large — try a shorter
      clip.")`.
    - Otherwise `POST /api/transcribe` with a `FormData` containing `audio`
      (the blob, whose `.type` already carries the codec) → on `200`, call
      `send(text)` (auto-send, matching `build-spec.md`: "release → your
      words appear as your turn ... and the AI responds" — no review step);
      on non-2xx, surface the `error` field via the existing `error` state
      (reuses the typed-path error UI, no new error surface).
  - No recording ever exceeds 60s wall-clock (client-enforced timer) — this
    is the *duration* half of the cap; the server's 1 MB check is the *size*
    half (see `validate.ts` above for why duration isn't re-derived
    server-side).
- Render `micError` the same way `error` already renders (small red text) —
  a dedicated line so a mic failure doesn't get silently overwritten if a
  chat error is also present, but visually identical.
- No waveform, no audio-reactive ring, no `AnalyserNode` — that visual is
  named for Unit 5 (`build-spec.md` Unit 5, `architecture.md`'s
  "`AnalyserNode` drives the mic-button ring animation"). This unit is a
  plain button that is either idle, recording (simple text/style change,
  e.g. label flips to "Recording…"), or showing `micError`.

### 5. `types/index.ts` (edit)

- `export type TranscribeResponse = { text: string };` — the
  `/api/transcribe` success shape, mirroring how `ChatResponse` already
  types the chat route's payload.

### 6. `.env.example` (edit)

Append:
```
# --- Unit 3: OpenAI gpt-4o-transcribe (server-only, never NEXT_PUBLIC_) ---
OPENAI_API_KEY=
```

## Out of scope (explicitly — do not build now)

- `requireUser()`, Clerk on `/api/transcribe` (Unit 6 — same
  deferral Units 1/2 already carry for `/api/chat`).
- Rate limiting / `usage_log` on this route (Unit 9).
- Any persistence of the transcript, the turn, or the audio itself (Unit 7
  for turns; audio is never persisted, ever — invariant 4).
- TTS / `/api/speak` / audio playback of the AI's reply (Unit 4).
- The Siri-style pale-blue audio-reactive ring, `AnalyserNode`, idle/held
  visual states, minimalist-ui styling (Unit 5). This unit's button is
  functional, not polished — same posture Unit 2's `<select>` took toward
  the eventual Radix `Popover`.
- A review/edit step between transcript and send — `build-spec.md` names
  auto-send on release; a "confirm before sending" UX is not in scope unless
  reviewed and added later.
- Server-side audio duration measurement / decoding library — deliberately
  out per the `validate.ts` note above.
- The `openai` SDK — plain `fetch`, matching Unit 1's DeepSeek precedent.

## Files touched

| File | Change |
|------|--------|
| `lib/openai.ts` | new — `transcribeAudio()` |
| `app/api/transcribe/validate.ts` | new — `parseTranscribeForm()`, size/type constants |
| `app/api/transcribe/route.ts` | new — POST handler |
| `app/page.tsx` | edit — mic button, `send()` refactored to take a message param, `micError` state |
| `types/index.ts` | edit — `TranscribeResponse` |
| `.env.example` | edit — add `OPENAI_API_KEY` |
| `test/transcribe-validate.test.ts` | new |

## API contract

**`POST /api/transcribe`**

Request: `multipart/form-data` with one field, `audio` (a `Blob`/`File`,
`Content-Type` one of `ALLOWED_AUDIO_TYPES`, ≤ 1 MB).

Success `200`:
```json
{ "text": "我今天很累" }
```

Errors: `400 {"error":"..."}` (missing/unparseable form, wrong audio type,
oversized audio), `422 {"error":"Could not understand audio"}` (empty
transcript), `500 {"error":"Upstream unavailable"}` (OpenAI unreachable or
key missing).

## Tests (`test/`)

### `test/transcribe-validate.test.ts` — `parseTranscribeForm()`

- A `FormData` with a valid `audio/webm` blob under the size cap → returns
  `{ file, contentType }`.
- Missing `audio` field → `null`.
- `audio` field present but a plain string (not a `Blob`) → `null`.
- `audio/webm;codecs=opus` (codec suffix present) → still accepted (subset
  match, not exact string equality).
- Disallowed type, e.g. `video/mp4` or `text/plain` → `null`.
- Zero-byte blob → `null`.
- Blob one byte over `MAX_AUDIO_BYTES` → `null`; exactly at the cap →
  accepted (boundary check, same style as Unit 2's `isValidHskLevel`
  boundary tests).

### Manual browser check (record in `progress-tracker.md`)

Hold the mic, speak a short Chinese sentence, release: the transcribed text
appears as your turn within ~3s and the AI responds, in both **current
Chrome** and **Safari** (desktop **and** iOS — `build-spec.md`'s explicit
cross-browser done-criterion). Deny the mic permission once and confirm
`micError` shows a readable message and the button remains usable afterward
(no dead button). Hold past 60s and confirm the client force-stops instead of
recording indefinitely. Speak into a muted/disconnected mic (or trim a
recording to silence) and confirm the `422` path shows a message, not a
crash.

## Done criteria (`build-spec.md` Unit 3 + `ai-workflow-rules.md` §7)

1. Hold mic, speak a Chinese sentence, release → the words appear as your
   turn within ~3s and the AI responds (manual check).
2. Works in current Chrome and Safari, desktop and iOS (manual check —
   `MediaRecorder.isTypeSupported` branch covers the two codec families).
3. Audio over 60s is never uploaded (client-enforced timer); audio over 1 MB
   is rejected client-side before upload and, independently, server-side by
   `parseTranscribeForm` if it ever arrives (`test/transcribe-validate.test.ts`
   + manual check).
4. Mic-permission denial shows a message (`micError`), not a dead button
   (manual check).
5. `OPENAI_API_KEY` is read only in `lib/openai.ts`, is not `NEXT_PUBLIC_`,
   and appears in no response body or log.
6. No recorded audio is ever written to disk, a DB, or any store — it exists
   only as the request body streamed to OpenAI inside one request (invariant
   4; verified by code inspection — no `fs`, no DB import, no module-level
   variable retaining the blob, anywhere in `lib/openai.ts` or
   `app/api/transcribe/route.ts`).
7. `npm run build` and `npm run lint` pass. `strict` stays `true`; no `any`,
   `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
8. `npm test` green, including the new `transcribe-validate.test.ts`; all
   prior tests still pass.
9. Diff contains only Unit 3 scope — no DB, no auth, no TTS, no Unit 5
   styling, no rate limiting.
10. `.env.example` updated (`OPENAI_API_KEY` added); `architecture.md` needs
    **no changes** — `app/api/transcribe/`, `lib/openai.ts`, and the
    size/duration cap language are already documented exactly as this unit
    implements them. Confirm at handback (no silent drift).
11. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # hold-to-record in Chrome + Safari (desktop + iOS), permission-deny path, 60s cap, silence path
grep -R "NEXT_PUBLIC" . --include=*.ts --include=*.tsx || echo "none — expected"
curl -s -w " [%{http_code}]\n" -XPOST localhost:3000/api/transcribe \
  -F "audio=@/dev/null;type=audio/webm"   # expect 400 (zero-byte)
git status && git log --oneline -1
```

## Open questions (decide before implementation)

1. **iOS Safari `MediaRecorder` support.** iOS Safari has historically
   shipped `MediaRecorder` only from Safari 14.3+ with `audio/mp4` as the
   reliable `mimeType` (no `audio/webm`). Recommendation: feature-detect with
   `MediaRecorder.isTypeSupported()` and fall back through
   `["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"]`, taking the first
   supported one; if **none** are supported, disable the mic button and show
   a static "voice input isn't supported in this browser" message instead of
   attempting to record (typed input still works). Confirm the target Safari
   version during manual testing.
2. **`parseTranscribeForm` error granularity.** Spec has it return a single
   `null` and let `route.ts` re-derive which check failed for the message.
   Alternative: return a discriminated union
   (`{ ok: true; file; contentType } | { ok: false; reason: "..." }`) so the
   message lives in one place. Recommendation: keep the `null` form for
   consistency with `parseChatRequest`'s existing precedent in this repo;
   revisit only if the route-side re-derivation gets awkward.
3. **`gpt-4o-transcribe` language hint.** OpenAI's transcription endpoint
   accepts an optional `language` parameter (ISO-639-1). Recommendation: pass
   `language: "zh"` — the app is Chinese-only, and it very likely improves
   accuracy and latency versus auto-detection. Confirm this is exposed the
   same way on `gpt-4o-transcribe` as on `whisper-1` before implementing.

## Follow-ups to hand back (do NOT start in Unit 3)

- Unit 4: `reply_zh` → `/api/speak` → Azure Neural TTS → autoplay on the send
  gesture that this unit's `send()` now also triggers from the mic path.
- Unit 5: replace the plain mic button with the charcoal Siri-style circle,
  `AnalyserNode`-driven pale-blue audio-reactive ring while held, still at
  idle; move this harness behind a dev flag.
- Unit 6: `requireUser()` on `/api/transcribe` + an auth rejection
  test for the route (same pattern as the other two AI routes).
- Unit 9: `usage_log` insert + per-minute/per-day rate check before the
  OpenAI call on this route; the size cap added here stays.
