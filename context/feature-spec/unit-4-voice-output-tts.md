# Feature Spec — Unit 4: Voice Output (TTS)

> Derived from `build-spec.md` Unit 4. Adds spoken playback to the Unit 1–3
> harness: `reply_zh` is sent to a new `/api/speak` route, Azure Neural TTS
> returns audio bytes, and the browser plays them automatically on send and
> on demand via a replay button. Still no auth, no persistence, no Siri-style
> UI (those are later units).
>
> **Status: IMPLEMENTED**, pending manual browser verification and commit
> (see "In Progress" in `context/progress-tracker.md`). Also note: TTS
> pivoted from Azure Neural TTS to ElevenLabs after this spec was drafted,
> and the rate is applied client-side (0.75x/1x/1.5x via
> `HTMLAudioElement.playbackRate`), not sent to the server — see
> `context/architecture.md`.

## One sentence

After an AI turn is rendered, the client `POST`s `reply_zh` (+ the current
speaking-rate setting) to `/api/speak`, Azure Neural TTS returns audio bytes,
the browser turns them into a transient object URL and autoplays them via
`<audio>`; each AI turn also gets a replay button that re-fetches and re-plays
the same text, and a slow/normal toggle controls the rate of future speech.

**As shipped, not as drafted below:** every `lib/azure-tts.ts` /
`AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` reference in this spec is now
`lib/elevenlabs-tts.ts` / `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` (Azure
AI Speech isn't available in the user's country; Groq was ruled out first —
its TTS models don't support Mandarin). Bigger change: `/api/speak`'s
`SpeakRequest` is `{ text: string }` only — **no `rate` field**.
ElevenLabs' own speed param is hard-limited to 0.7–1.2, too narrow for this
app's range, so the server always synthesizes at natural speed and the
client scales it via `audio.playbackRate` with three values (`0.75 | 1 |
1.5`, `types/index.ts`'s `SpeakingRate`), not the two-value `"slow" |
"normal"` described throughout this spec. See `context/architecture.md`
and `context/progress-tracker.md` for the shipped contract and full pivot
history.

## Why this is its own step (`ai-workflow-rules.md` §3)

- It crosses a new trust boundary: the third and final provider key
  (`AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`) and the third provider route,
  distinct from `transcribe` and `chat` (`architecture.md`'s three-route
  split: "isolates each provider key to a single route").
- It is a binary-response route (audio bytes out, not JSON) layered onto a
  client pipeline that has so far only handled binary *in* (Unit 3) — new
  wiring on the response side: `Content-Type` handling, `Blob`,
  `URL.createObjectURL`, revocation.
- `architecture.md`'s cache table names a dedicated lifecycle for this exact
  data ("TTS object URL ... revoked after playback; recreated on replay")
  that needs its own implementation and verification, not folded into an
  unrelated change.
- Autoplay policy is a real, named technical unknown (`build-spec.md`'s Unit 4
  done criterion: "No audio autoplay-blocked errors (playback is triggered by
  the send gesture)") — worth isolating like Unit 3 isolated the mic
  round-trip.

## In scope

### 1. `lib/azure-tts.ts` (new, server-only)

- The **only** module that reads `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`
  (`architecture.md` folder-ownership + invariant 1).
- Single export:
  ```ts
  export type SpeakingRate = "slow" | "normal";

  export async function synthesizeSpeech(
    text: string,
    rate: SpeakingRate,
  ): Promise<ArrayBuffer>
  ```
- Plain `fetch` POST to Azure's REST TTS endpoint
  (`https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`)
  with header `Ocp-Apim-Subscription-Key: {AZURE_SPEECH_KEY}`, `Content-Type:
  application/ssml+xml`, `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-
  mono-mp3` — no SDK, consistent with Unit 1's `lib/deepseek.ts` and Unit 3's
  `lib/openai.ts` precedent (both resolved "fetch, add the SDK later only if
  it earns its keep").
- Body is SSML built from `text` and `rate`:
  ```ts
  const prosodyRate = rate === "slow" ? "0.75" : "1.0";
  const ssml =
    `<speak version="1.0" xml:lang="zh-CN">` +
    `<voice name="zh-CN-XiaoxiaoNeural">` +
    `<prosody rate="${prosodyRate}">${escapeXml(text)}</prosody>` +
    `</voice></speak>`;
  ```
  `zh-CN-XiaoxiaoNeural` matches `architecture.md`'s stack table example
  voice; `build-spec.md` also names `zh-CN-Yunxi` as an alternative but picks
  no default — one fixed voice is the smallest change that satisfies the unit
  (a voice picker is not named anywhere in scope; see Open Questions #1).
- `escapeXml` is a private 5-character helper (`&`, `<`, `>`, `"`, `'`) —
  `text` is model output and must never be interpolated into SSML/XML
  unescaped (`architecture.md` invariant 7: "model output is inert").
- Returns the raw MP3 bytes as an `ArrayBuffer` (`await res.arrayBuffer()`).
  Does not decode, cache, or persist them (invariant: "no file or blob
  storage exists in this project ... TTS audio is never stored").
- On non-2xx or network failure: `throw` with a message that does **not**
  include the key. The route turns this into a `500`.

### 2. `app/api/speak/validate.ts` (new)

Mirrors `app/api/transcribe/validate.ts` and `app/api/chat/validate.ts` — a
pure, HTTP-free function so the boundary check is unit-testable
(`code-standards.md` §TypeScript: "validate all external input at the
boundary ... reject on mismatch").

```ts
import type { SpeakingRate } from "@/types";

export const MAX_SPEAK_TEXT_LENGTH = 500; // matches the existing text cap, code-standards.md §API Routes

export type SpeakRequest = { text: string; rate: SpeakingRate };

export function parseSpeakRequest(body: unknown): SpeakRequest | null
```

- `body.text` must be a non-empty string, `.trim().length > 0`, and
  `<= MAX_SPEAK_TEXT_LENGTH` after trimming (same 500-char ceiling Unit 1
  already enforces on the chat route's `message`, applied here to keep one
  size rule for "text sent to a provider" — `reply_zh` is always already
  under this length because it came from a capped conversation, but the
  boundary is re-checked here rather than trusted, per
  `code-standards.md`: "validate all external input at the boundary").
- `body.rate` must be exactly `"slow"` or `"normal"` → else `null`.
- Anything else (missing fields, wrong types, extra fields ignored) → `null`.

### 3. `app/api/speak/route.ts` (new, POST only)

Handler order (`code-standards.md` §Next.js route order, minus the two steps
that don't exist until Units 6/9 — same posture Units 1–3 took):

1. **Parse the JSON body.** `await req.json()` in a try/catch → unparseable
   body → `400 { error: "Invalid request body" }`.
2. **Validate.** `parseSpeakRequest(body)` → `null` →
   `400 { error: "Malformed request" }` (same message/shape as `/api/chat`'s
   existing malformed-body branch — `code-standards.md`: "same shape for the
   same condition across all routes").
3. **Call `synthesizeSpeech`.** On throw → `console.error` (no audio bytes,
   no key in the message) → `500 { error: "Upstream unavailable" }` (same
   message Unit 3 uses for its own upstream failure).
4. **Respond** `200` with the raw MP3 bytes as the body,
   `Content-Type: audio/mpeg`. No JSON envelope — this is the one route in
   the app that returns binary, matching `architecture.md`'s
   `app/api/speak/` boundary ("Calling Azure TTS ... returning audio bytes").
   No persistence, no transcript mutation — `app/api/speak/` "must not
   contain" LLM calls, persistence, or transcript logic per
   `architecture.md`'s boundary table.

Failure shape stays `{ error: string }` JSON, consistent with the other two
routes; only the success response differs in kind (binary vs JSON), which is
inherent to what this route does.

### 4. `app/page.tsx` (edit)

Still the Unit 1–3 typed dev harness — TTS is wired into the existing
`send()` pipeline and the existing turn list, not a new screen (Unit 5 does
the real layout and the audio-reactive ring).

- New client-only state: `speakingRate: "slow" | "normal"` (default
  `"normal"`), `playingIndex: number | null` (which turn's audio, if any, is
  currently fetching or playing — drives per-turn replay-button state, e.g.
  disable the button that's active, keep others enabled), `speakError:
  string | null`.
- New ref: `audioRef = useRef<HTMLAudioElement | null>(null)` — one shared
  `<audio>` element reused for every play/replay, matching
  `architecture.md`'s "Audio playback | `HTMLAudioElement`" row (one player,
  not one per turn).
- `async function speak(text: string, index: number)`:
  - Guard: if `playingIndex !== null`, ignore the call (no overlapping
    playback — replaying while something is already playing is out of scope;
    see Open Questions #2 for the alternative of interrupting).
  - `setPlayingIndex(index)`, `setSpeakError(null)`.
  - `POST /api/speak` with `{ text, rate: speakingRate }`.
  - Non-2xx → parse the JSON `{ error }` body the same way `send()` already
    parses chat/transcribe errors, `setSpeakError(msg)`, `setPlayingIndex(null)`,
    return.
  - `200` → `res.blob()` → `URL.createObjectURL(blob)` → if a previous object
    URL exists on `audioRef`, `URL.revokeObjectURL` it first (invariant: "TTS
    object URL ... revoked after playback; recreated on replay" — revoking
    the prior one before creating the next is the same lifecycle applied at
    the point of reuse) → set `audioRef.current.src` to the new URL → `await
    audioRef.current.play()`.
  - `audioRef.current.onended` (registered once, outside `speak`, in a
    `useEffect` on mount): `URL.revokeObjectURL(audioRef.current.src)`,
    `setPlayingIndex(null)` — the actual revoke-after-playback point.
  - `catch` around the `fetch`/`play()` sequence → network error or a
    browser autoplay rejection (`play()` returns a rejected promise if
    blocked) → `setSpeakError("Could not play audio — try again.")`,
    `setPlayingIndex(null)`.
- `send()` (from Unit 1/3) gains one addition at the end of its success path:
  after `setHistory([...nextHistory, data as Turn])`, call
  `void speak(data.reply_zh, nextHistory.length)` (the new turn's index in
  the array being rendered) — this is the "autoplay on send" behavior,
  triggered synchronously inside the same user-gesture-initiated call chain
  (mic release or Send-button click) so the browser's autoplay policy treats
  it as gesture-triggered, not script-initiated (`build-spec.md`'s explicit
  Unit 4 criterion).
- **Replay button**, one per **AI** turn (not user turns — nothing to speak):
  rendered next to the existing correction `<details>`, e.g. a plain
  `<button onClick={() => void speak(turn.text_zh, i)} disabled={playingIndex !== null}>▶</button>`
  — plain button, not yet a Phosphor icon or the minimalist-ui treatment
  (Unit 5 restyles the whole screen, same posture Unit 2's `<select>` and
  Unit 3's mic button both took).
- **Rate toggle**, in the header row next to the existing HSK `<select>`:
  a second `<select>` (or two buttons) bound to `speakingRate`, options
  "Slow" / "Normal" — changes only the rate used for the *next* `speak()`
  call (does not re-synthesize or replay whatever is currently playing).
- Render `speakError` the same way `error` and `micError` already render
  (small red text, its own line) — matches Unit 3's "a mic failure doesn't
  get silently overwritten if a chat error is also present" precedent.
- No `AnalyserNode`, no visual waveform, no autoplay-reactive ring — that
  visual is named for Unit 5. This unit's playback surface is the existing
  turn list plus one replay button and one rate toggle.

### 5. `types/index.ts` (edit)

- `export type SpeakingRate = "slow" | "normal";` — defined once here,
  following the existing direction `HskLevel` already set (`HskLevel` lives
  in `types/index.ts`; `lib/hsk.ts` imports it from `@/types` rather than
  defining it, even though `lib/hsk.ts` is the only module that produces
  values of that type). `lib/azure-tts.ts` and `app/api/speak/validate.ts`
  both import `SpeakingRate` from `@/types` for the same reason.
- No change to `ChatResponse`, `Turn`, or `AiTurn` — TTS reads `text_zh` off
  an already-existing field; it adds no new field to a turn.

### 6. `.env.example` (edit)

Append:
```
# --- Unit 4: Azure Neural TTS (server-only, never NEXT_PUBLIC_) ---
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

## Out of scope (explicitly — do not build now)

- `requireUser()`, Clerk on `/api/speak` (Unit 6 — same deferral
  Units 1–3 already carry for their routes).
- Rate limiting / `usage_log` on this route (Unit 9) — note `build-spec.md`'s
  rate-limiting table only names `transcribe` and `chat` explicitly
  ("Check rate limits before calls to `transcribe` and `chat`" in
  `code-standards.md` §API Routes); whether `/api/speak` also needs a
  per-user limit is flagged for Unit 9, not decided here (see Open
  Questions #3).
- Persisting `speakingRate` anywhere beyond in-memory React state this unit
  — `settings.speaking_rate` (Unit 7) is the DB column named in
  `architecture.md`; no `localStorage` fallback is added for it either
  (unlike `hsk_level`'s Unit 2 precedent) since `build-spec.md` does not ask
  for rate persistence before Unit 7 and `ai-workflow-rules.md` §2.2
  forbids building for a future unit.
- A voice picker (`zh-CN-Xiaoxiao` vs `zh-CN-Yunxi`) — one fixed voice for
  now (see Open Questions #1).
- Interrupting in-flight playback to start a new one (e.g. clicking replay
  on turn 2 while turn 5 is autoplaying) — the guard above simply ignores
  the second request; a "stop current and play new" UX is not named in
  `build-spec.md` for this unit (see Open Questions #2).
- The Siri-style pale-blue audio-reactive ring, `AnalyserNode`, any
  minimalist-ui styling of the replay button or rate toggle (Unit 5) — same
  posture Units 2/3 took toward their own controls.
- Streaming TTS audio (`architecture.md` invariant: "No streaming. ... TTS is
  a single non-streaming request").
- The `microsoft-cognitiveservices-speech-sdk` (or any Azure SDK) — plain
  `fetch`, matching Units 1 and 3's precedent.

## Files touched

| File | Change |
|------|--------|
| `lib/azure-tts.ts` | new — `synthesizeSpeech()` |
| `app/api/speak/validate.ts` | new — `parseSpeakRequest()`, `MAX_SPEAK_TEXT_LENGTH` |
| `app/api/speak/route.ts` | new — POST handler, binary response |
| `app/page.tsx` | edit — `speak()`, replay button per AI turn, rate toggle, autoplay on send, shared `<audio>` ref, `speakError` state |
| `types/index.ts` | edit — `SpeakingRate` |
| `.env.example` | edit — add `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| `test/speak-validate.test.ts` | new |

## API contract

**`POST /api/speak`**

Request: `application/json`
```json
{ "text": "你今天过得怎么样？", "rate": "normal" }
```

Success `200`: body is raw audio bytes, `Content-Type: audio/mpeg`.

Errors: `400 {"error":"Invalid request body"}` (unparseable JSON),
`400 {"error":"Malformed request"}` (missing/empty/oversized `text`, invalid
`rate`), `500 {"error":"Upstream unavailable"}` (Azure unreachable or keys
missing).

## Tests (`test/`)

### `test/speak-validate.test.ts` — `parseSpeakRequest()`

- A valid body (`{ text: "你好", rate: "normal" }`) → returns
  `{ text: "你好", rate: "normal" }`.
- `rate: "slow"` also accepted.
- Missing `text` → `null`. Missing `rate` → `null`.
- `text: ""` or `text: "   "` (whitespace-only) → `null`.
- `text` exactly `MAX_SPEAK_TEXT_LENGTH` chars → accepted; one char over →
  `null` (boundary check, same style as Unit 2's `isValidHskLevel` and
  Unit 3's size-cap boundary tests).
- `rate: "fast"` or `rate: 1` (wrong type/value) → `null`.
- `text: 123` (wrong type) → `null`.

### Manual browser check (record in `progress-tracker.md`)

Send a typed message (or a mic recording, chaining Units 1–4): the AI's reply
appears and its audio plays automatically without a browser autoplay-blocked
error or console warning. Click the replay button on an earlier AI turn and
confirm it plays that turn's Chinese text again. Toggle the rate to "Slow",
trigger a new turn, and confirm the speech is audibly slower than at
"Normal". Click replay on one turn while another is still speaking and
confirm nothing crashes (the second click is a no-op per the guard). Confirm
playback keeps working across many turns without degradation (object URLs
are being revoked, not leaking).

## Done criteria (`build-spec.md` Unit 4 + `ai-workflow-rules.md` §7)

1. AI replies play aloud automatically on send (manual check — mic release
   or Send click).
2. Replay button re-plays any past AI turn (manual check).
3. Slow/normal toggle audibly changes speaking rate (manual check).
4. No audio autoplay-blocked errors — playback is triggered synchronously
   inside the send gesture's call chain, not from an unrelated effect
   (manual check in current Chrome and Safari, matching Unit 3's
   cross-browser posture).
5. `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` are read only in
   `lib/azure-tts.ts`, are not `NEXT_PUBLIC_`, and appear in no response body
   or log.
6. TTS audio is never persisted — no `fs`, no DB import, no module-level
   variable retaining the bytes, anywhere in `lib/azure-tts.ts` or
   `app/api/speak/route.ts` (verified by code inspection, same posture as
   Unit 3's audio-never-persisted check).
7. Every created object URL is revoked (in `onended`, and before creating the
   next one in `speak()`) — verified by code inspection against
   `architecture.md`'s cache-table lifecycle for "TTS object URL".
8. Model output (`reply_zh`) is XML-escaped before entering the SSML payload
   — verified by code inspection of `escapeXml`'s call site in
   `lib/azure-tts.ts` (invariant 7: "model output is inert").
9. `npm run build` and `npm run lint` pass. `strict` stays `true`; no `any`,
   `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
10. `npm test` green, including the new `speak-validate.test.ts`; all prior
    tests still pass.
11. Diff contains only Unit 4 scope — no DB, no auth, no rate limiting, no
    Unit 5 styling, no voice picker.
12. `.env.example` updated (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` added);
    `architecture.md` needs **no changes** — `app/api/speak/`,
    `lib/azure-tts.ts`, the object-URL cache-table row, and the "no
    streaming" / "TTS never stored" invariants are already documented
    exactly as this unit implements them. Confirm at handback (no silent
    drift).
13. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # send/mic → autoplay, replay button, slow/normal toggle, overlapping-replay no-op
grep -R "NEXT_PUBLIC" . --include=*.ts --include=*.tsx || echo "none — expected"
curl -s -w " [%{http_code}]\n" -XPOST localhost:3000/api/speak \
  -H 'content-type: application/json' \
  -d '{"text":"","rate":"normal"}'   # expect 400 (empty text)
curl -s -w " [%{http_code}]\n" -XPOST localhost:3000/api/speak \
  -H 'content-type: application/json' \
  -d '{"text":"你好","rate":"fast"}'   # expect 400 (invalid rate)
git status && git log --oneline -1
```

## Open questions

Resolved (user decision, 2026-09-11):

1. **Voice choice.** Settled on `zh-CN-XiaoxiaoNeural` (matches
   `architecture.md`'s stack-table example), no voice picker in this unit —
   as recommended above.
2. **Overlapping playback.** Settled on the ignore-and-no-op guard (a
   `speak()` call while another is in flight/playing is dropped, not
   interrupted) — as recommended above.

Still open — **deliberately skipped for now, revisit before/at Unit 9**:

3. **Rate limiting scope for `/api/speak`.** `code-standards.md` names
   `transcribe` and `chat` explicitly for the 10/minute-100/day check;
   `/api/speak` is not named. Since autoplay means one `/api/speak` call
   naturally accompanies every `/api/chat` call, and no *new* user action
   summons it independently, the leaning is to bring `/api/speak` under the
   same limiting as `chat` in Unit 9 (one guarded provider call per turn,
   including its trailing TTS call) rather than leaving it unlimited or
   giving it its own separate counter — but this is not decided. Confirm
   with the user before Unit 9 starts, since `code-standards.md`'s wording
   is silent on this route.

## Follow-ups to hand back (do NOT start in Unit 4)

- Unit 5: replace the plain replay button and rate `<select>` with
  minimalist-ui-styled controls (Phosphor icons, design tokens); the
  autoplay-reactive visual ring stays a Unit 5 item regardless (it reacts to
  the *recording* `AnalyserNode`, not playback, per `architecture.md`).
- Unit 6: `requireUser()` on `/api/speak` + an auth rejection test
  for the route (same pattern as the other two AI routes).
- Unit 7: persist `speaking_rate` to the `settings` table; the in-memory-only
  `speakingRate` state added here is replaced, not extended, by that column
  (per `code-standards.md`: "Postgres ... is the single source of truth").
- Unit 9: resolve Open Question #3 and add whatever `usage_log` accounting
  `/api/speak` needs, alongside the size cap this unit already put in place.
