# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Unit 3 (voice input / STT) — implemented, pending manual browser
  verification (Chrome + Safari, desktop + iOS). Unit 2 (HSK level control)
  still pending its own manual browser verification and commit.

## Current Goal

- Unit 3: press-and-hold mic button records audio client-side, uploads to
  `POST /api/transcribe`, Groq Whisper returns Chinese text, fed into the
  existing `send()` pipeline exactly as typed input.

## Completed

- 2026-09-11: Unit 3 implemented per
  `context/feature-spec/unit-3-voice-input-stt.md`. New `lib/openai.ts`
  (`transcribeAudio()` — sole reader of `OPENAI_API_KEY`, plain `fetch`
  multipart POST to OpenAI's `gpt-4o-transcribe` endpoint with
  `language: "zh"`, no SDK, matching Unit 1's DeepSeek precedent; audio is
  passed through as the request body only, never persisted). New
  `app/api/transcribe/validate.ts` (`parseTranscribeForm`,
  `MAX_AUDIO_BYTES` = 1 MB, `ALLOWED_AUDIO_TYPES`, codec-suffix-tolerant type
  check). New `app/api/transcribe/route.ts` (POST: parse form → validate →
  transcribe → reject empty transcript with 422 → 200 `{ text }`; specific
  400 messages derived route-side per the spec's Open Question #2
  resolution). `app/page.tsx`: `send()` refactored to take a `message`
  parameter instead of reading `input` directly; new mic button
  (`onMouseDown`/`onTouchStart` → `getUserMedia` → `MediaRecorder` picked via
  `isTypeSupported` trying `audio/webm;codecs=opus` then `audio/mp4` then
  `audio/ogg`; 60s force-stop timer; `onMouseUp`/`onTouchEnd`/`onMouseLeave` →
  stop, assemble blob, release mic tracks, client-side size check against a
  duplicated `MAX_AUDIO_BYTES_CLIENT` constant, then `POST /api/transcribe`
  and auto-send the transcript via `send()`); new `recording`/`micError`
  state, `micError` rendered the same way `error` already is. `types/index.ts`
  gained `TranscribeResponse`. `.env.example` gained `OPENAI_API_KEY`. New
  `test/transcribe-validate.test.ts` (8 cases: valid blob, missing field,
  non-Blob field, codec-suffix type, two disallowed types, zero-byte, and
  both size-cap boundary cases). `npm run build`, `npm run lint`, `npm test`
  (70 tests) all green. Curl-verified against `npm run dev` (no
  `OPENAI_API_KEY` set): zero-byte audio → 400 `{"error":"Missing audio"}`;
  well-formed audio → 500 `{"error":"Upstream unavailable"}` with no key
  leaked. `grep -R NEXT_PUBLIC` still finds nothing. `architecture.md` needed
  no changes — confirmed `app/api/transcribe/`, `lib/openai.ts`, and the
  size/duration cap language were already documented exactly as implemented.
  Manual browser check (hold-to-record in Chrome/Safari desktop+iOS,
  permission-deny path, 60s cap, silence/422 path) is **not yet done** —
  record the result here before committing.
  **User-driven pivot, 2026-09-11:** the user could not complete OpenAI
  billing, so speech-to-text was switched from OpenAI `gpt-4o-transcribe` to
  a local, self-hosted Whisper — no provider key, no billing. `lib/openai.ts`
  deleted; new `lib/whisper.ts` (`transcribeAudio(audio)` — decodes the
  browser's codec (webm/opus or mp4/aac) to 16kHz mono PCM via a spawned
  `ffmpeg` process, using the bundled `ffmpeg-static` binary, no WAV parser
  needed since ffmpeg emits raw `s16le`; runs the PCM through
  `Xenova/whisper-base` via `@huggingface/transformers`, an in-process ONNX
  runtime — no Python, no separate service; the model weights download once
  from Hugging Face on first use and are cached locally). New deps:
  `@huggingface/transformers`, `ffmpeg-static`. `app/api/transcribe/route.ts`
  now imports from `@/lib/whisper` and its `500` error message changed from
  "Upstream unavailable" to "Transcription failed" (no upstream provider
  anymore). `.env.example`'s `OPENAI_API_KEY` line removed — no key needed.
  `architecture.md` updated: STT row, `app/api/transcribe/` and `lib/` folder
  descriptions, storage-model note, boundary summary, and invariant 6 all
  reworded from OpenAI to local Whisper.
  **Known tradeoffs of this pivot** (flag before shipping): first transcribe
  request needs internet once to download the Whisper model; ffmpeg spawn +
  in-process ONNX inference is slower and more CPU/memory-heavy per request
  than a hosted API, with no provider SLA; `whisper-base` accuracy on
  Mandarin has not yet been manually compared against `gpt-4o-transcribe`.
  **Second pivot, same day (2026-09-11):** the user rejected the local-Whisper
  detour above after discussing it — it fights Vercel's serverless model
  (bundle size, ephemeral disk re-downloading the model on every cold start,
  execution-time caps a CPU Whisper pass can exceed), and this app needs to
  be deploy-ready. Reverted to a hosted provider. Chose **Azure AI Speech**
  over Groq/Deepgram (options discussed) specifically because Unit 4 already
  plans an Azure TTS account — one provider account instead of three.
  `lib/whisper.ts` deleted (never committed); new `lib/azure-stt.ts`
  (`transcribeAudio(audio, contentType)` — plain `fetch` POST of the raw
  audio bytes, no multipart, no SDK, to Azure's short-audio REST recognition
  endpoint `https://{region}.stt.speech.microsoft.com/speech/recognition/
  conversation/cognitiveservices/v1?language=zh-CN&format=simple`; returns
  `""` when Azure's `RecognitionStatus` isn't `"Success"`, which the route's
  existing empty-transcript check turns into the `422` response — no new
  logic needed there). `app/api/transcribe/route.ts` now imports from
  `@/lib/azure-stt` and its `500` message is back to `"Upstream unavailable"`
  (matches `/api/chat`'s wording for a real upstream provider). `.env.example`
  now has `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` (default `eastus`) in
  place of the removed `OPENAI_API_KEY`/local-Whisper entries. `architecture.md`
  STT row, `app/api/transcribe/` and `lib/` folder descriptions, storage-model
  note, boundary summary, and invariant 6 all reworded a second time, now to
  Azure AI Speech. Open question raised at the time: Azure's short-audio REST
  endpoint's documented supported `Content-Type`s are WAV (PCM), OGG/Opus,
  and WebM/Opus — Chrome's `audio/webm;codecs=opus` recording matches, but
  iOS Safari's `audio/mp4` fallback (`app/page.tsx`'s `MIC_MIME_TYPES`) was
  not confirmed supported by that endpoint. Moot now — see the next pivot.
  **Third pivot, same day (2026-09-11):** Azure AI Speech isn't available in
  the user's country, so it's out too. Switched to **Groq**
  (`whisper-large-v3-turbo`) — chosen because its `/openai/v1/audio/
  transcriptions` endpoint is OpenAI-compatible (near-identical request shape
  to the original OpenAI design, multipart/form-data with `file`/`model`/
  `language` fields), it's a single global HTTP call (deploy-ready on Vercel,
  no local binaries), and it has a free API tier with no card required at
  signup. `lib/azure-stt.ts` deleted (never committed); new `lib/groq-stt.ts`
  (`transcribeAudio(audio, contentType)`, sole reader of `GROQ_API_KEY`).
  `app/api/transcribe/route.ts` now imports from `@/lib/groq-stt` (its `500`
  error path and message were already provider-agnostic — only the import
  and the `console.error` label changed). `.env.example`'s Azure lines
  replaced with `GROQ_API_KEY` + `GROQ_STT_MODEL` (default
  `whisper-large-v3-turbo`). `architecture.md` STT row, `app/api/transcribe/`
  and `lib/` folder descriptions, storage-model note, boundary summary, and
  invariant 6 all reworded a third time, now to Groq. Groq's endpoint, like
  OpenAI's, accepts the same broad set of container formats
  `ALLOWED_AUDIO_TYPES` already validates — webm, mp4, mpeg, wav, ogg — so
  the Azure-specific codec caveat above no longer applies, though iOS
  Safari's `audio/mp4` fallback is still worth confirming in the manual
  browser check. `npm run build`, `npm run lint`, `npm test` (70 tests) all
  green after this third pivot. Curl-verified against `npm run dev` (no
  `GROQ_API_KEY` set): zero-byte audio → 400 `{"error":"Missing audio"}`;
  well-formed audio → 500 `{"error":"Upstream unavailable"}` with no key
  leaked.

- 2026-09-11: Unit 2 implemented per `context/feature-spec/unit-2-hsk-level-control.md`,
  then the above-level-word feature was removed by the user (see note below) —
  the codebase now holds the level-control half of the spec only.
  New `data/hsk-words.json` — cumulative HSK 1–6 word lists built from
  `drkameleon/complete-hsk-vocabulary` (MIT), `wordlists/inclusive/old/{1..6}.min.json`,
  extracting only the `s` field, plus a manually patched-in `说` per level (the
  old-standard list omits it standalone, only inside compounds like 说话/说明) —
  counts now 151/298/596/1194/2492/4992. New `lib/hsk.ts` (`isValidHskLevel`,
  `getCumulativeWordSet`, `getWordListText`). New `app/api/chat/prompt.ts`
  (`buildSystemPrompt(level)`, byte-identical per level). `app/api/chat/validate.ts`
  gained exported `parseChatRequest`/`ChatRequest` (moved out of `route.ts`,
  extended with `hskLevel` validation). `app/api/chat/route.ts` builds messages
  with `buildSystemPrompt(hskLevel)`. `types/index.ts` gained `HskLevel`.
  `app/page.tsx` gained a `<select>` HSK 1–6 picker; level state is read from
  `localStorage` via `useSyncExternalStore` (not `useEffect`+`setState`, to
  satisfy the `react-hooks/set-state-in-effect` lint rule — same
  default-3/no-hydration-mismatch behavior the spec asked for, implemented as
  an external-store subscription instead). New `test/hsk.test.ts` (counts,
  monotonic subset, byte-identical `getWordListText`, `isValidHskLevel`).
  `test/chat-validation.test.ts` extended with `parseChatRequest` cases
  (boundaries 1/6, missing/invalid `hskLevel`, history/message regressions).
  New `vitest.config.mts` (added `@` alias matching `tsconfig.json`'s `"@/*"` —
  previously untested modules didn't need it; `lib/hsk.ts`,
  `app/api/chat/validate.ts` now do). `npm run build`, `npm run lint`,
  `npm test` (61 tests) all green after the removal. Curl-verified: missing
  `hskLevel` and `hskLevel: 7` both 400 `{"error":"Malformed request"}` before
  any DeepSeek call. `architecture.md` needed no changes for the level-control
  half — confirmed `data/`, `lib/hsk.ts`, and `app/api/chat/` responsibilities
  were already documented exactly as implemented.
  **User-driven change, 2026-09-11:** the above-level-word feature
  (`flagAboveLevel` in `lib/hsk.ts`, `aboveLevelWords` on `Turn`'s ai variant,
  the computation in `route.ts`, the `⚠ above level` line in `page.tsx`, and
  their tests) was removed entirely — the user judged the forward-max-matching
  flagging (dictionary-only, no real segmenter — the ponytail-flagged ceiling
  the spec called out) inaccurate in practice. The spec file still describes
  the original design including this feature; treat the spec as historical
  intent, not current scope. If above-level flagging is wanted again, it needs
  a more accurate approach than dictionary max-matching (e.g. a real
  segmenter) before re-adding.
  **User-driven fix, 2026-09-11:** manual testing surfaced that the strict
  "only use words from this list" instruction made DeepSeek deflect harder
  topics ("对不起，这个我不太懂/不太会聊，我们说点别的吧...") instead of
  attempting them. `app/api/chat/prompt.ts`'s `buildSystemPrompt` now also
  instructs the model to never refuse/deflect a topic and to always give a
  real on-topic reply, simplified to the level instead. Curl-verified with
  "你能说说你对环境保护的看法吗？" at hskLevel 1 (got a simplified,
  on-topic reply instead of a deflection) and hskLevel 5 (direct answer).
  `npm run build`/`lint`/`test` (61 tests) still green after this change.
  **User-driven prompt tuning, 2026-09-11:** two more asks in
  `app/api/chat/prompt.ts`'s `buildSystemPrompt` — (1) `correction` now
  explicitly excludes punctuation mistakes (only sentence-structure/grammar/
  word-choice count); curl-verified a missing-comma message ("我喜欢看书 也喜欢
  运动") got `correction: ""`. (2) Reply length is no longer capped at 1-2
  sentences — it's told to match the user's message length/detail instead;
  curl-verified a short message still gets a short reply while a longer,
  detailed message (weekend plans, HSK4) got a genuinely longer, on-topic
  reply. `npm run build`/`lint`/`test` (61 tests) still green.

- 2026-09-10: Unit 1 implemented. `pinyin-pro` + `vitest` added (`@types/node`
  bumped 20→24 to match the Node 26 runtime and clear a vitest peer conflict;
  `npm audit` clean). New: `types/index.ts` (`ChatResponse`, `Turn`, `AiTurn`),
  `lib/pinyin.ts` (`toPinyin` + bounded 得/还 heteronym correction pass with a
  named ceiling), `lib/deepseek.ts` (fetch to the OpenAI-compatible endpoint,
  sole reader of `DEEPSEEK_API_KEY`), `app/api/chat/validate.ts`
  (`parseChatResponse`, fence-stripping, retry-once contract), `app/api/chat/
  route.ts` (POST: parse → 500-char cap → DeepSeek → validate → retry → pinyin
  → `AiTurn`), `app/page.tsx` rewritten as the typed harness with a hardcoded
  greeting and a native `<details>` correction. Tests: `test/pinyin.test.ts`
  (heteronyms 还/得/长/银行 + formatting), `test/chat-validation.test.ts`
  (validator cases). `npm run build`, `npm run lint`, `npm test` (29) green.
  Route error branches curl-checked: 400 bad body / >500 chars, 405 GET, 500
  missing key (no key leak). Spec at
  `features/back/unit-1-text-conversation-loop.md`.

- 2026-09-10: Unit 0 split into 0a (local skeleton) and 0b (deploy pipeline);
  specs written to `context/feature-spec/unit-0a-local-skeleton.md` and
  `unit-0b-deploy-pipeline.md`.
- 2026-09-10: Project scaffolded — Next.js 16.3.4 (App Router, Turbopack),
  React 19.2, TypeScript strict, Tailwind v4, ESLint 9. Boilerplate stripped
  to a placeholder page; folder skeleton from `architecture.md` created
  (`components/ lib/ db/ drizzle/ data/ types/ test/`). `npm run build` and
  `npm run lint` pass. `git init` done; not yet committed / no remote.
- 2026-09-10: Matt Pocock engineering skills configured for the repo —
  `docs/agents/issue-tracker.md` (GitHub) + `docs/agents/domain.md`;
  `## Agent skills` block added to `CLAUDE.md`. `triage` not installed, so no
  triage-labels file.

## In Progress

- Unit 2: automated checks (build/lint/test/curl) done; above-level-word
  flagging removed by the user for inaccuracy (see Completed note). Remaining
  manual browser check is now just HSK1 vs HSK5 vocabulary difference, reload
  persistence, and the prompt-cache `usage` log spot-check — no above-level
  marker to verify. Commit is next after that.
- Unit 3: automated checks (build/lint/test/curl) done. Remaining manual
  browser check (hold-to-record in Chrome + Safari, desktop + iOS, mic-deny,
  60s cap, silence/422) needs a real `OPENAI_API_KEY` in `.env.local` and a
  live browser session. Commit is next after that.

## Verified

- 2026-09-11: Unit 1 done-criteria met — user confirmed the live browser check
  ("good pass") after setting a real `DEEPSEEK_API_KEY` in `.env.local`: typed
  conversation holds, AI turns render Chinese + pinyin + English, correction
  disclosure works. Combined with the 2026-09-10 automated/curl checks (build,
  lint, 29 tests, error-branch curls, no leaked key), all Unit 1 done-criteria
  in `build-spec.md` are satisfied. Committed at `7c7ebd9`.
- 2026-09-10: Unit 0a done-criteria re-checked against the spec —
  `npm run build` green (0 TS errors, `strict: true` intact), `npm run lint`
  passes, `grep NEXT_PUBLIC` finds nothing, folder skeleton + `.gitkeep`/README
  stubs present, no stray starter files, `.env*` git-ignored with
  `!.env.example`, working tree clean. Committed at `01fe891` (0b-defer note
  in `a799747`).

## Next Up

- Unit 0a: DONE (committed, `96fc49b`).
- Unit 0b: DEFERRED by the user (see "Deferred" below). Building locally only —
  no deploy, no remote push — until the deploy pipeline is set up near the end.
- Unit 1: DONE (committed, `7c7ebd9`, verified 2026-09-11).
- Unit 2: HSK level control — implemented; manual browser verification and
  commit still pending (see "In Progress").
- Unit 3: voice input (STT) — implemented; manual browser verification and
  commit still pending (see "In Progress").

## Open Questions

- None blocking. Unit 0b prerequisites are parked (see "Deferred").

## Deferred — revisit before shipping

- **Unit 0b (deploy pipeline) is intentionally skipped for now.** The user has
  created a private GitHub repo but has NOT: linked a Vercel project, added the
  `APP_ENV_CHECK` env var, or enabled Vercel Deployment Protection. They want to
  build the whole app locally first and wire up deployment at the end.
- **Agent action required:** once the app is functionally complete locally —
  i.e. Units 1–9 are done and Unit 10 (Hardening + ship) is about to start —
  STOP and ask the user to do the Unit 0b prerequisites in
  `context/feature-spec/unit-0b-deploy-pipeline.md` ("Prerequisites"): create
  the Vercel project, add env vars, enable Deployment Protection, and provide
  the GitHub repo URL for `git remote add origin`. Then complete Unit 0b, then
  Unit 10.
- Until then: every unit still ends with `npm run build` + `npm run lint`
  passing locally and a clean commit on `main`; just no push and no live URL.
- Optional, order-independent: set OpenAI / Azure provider spending caps in
  their dashboards whenever provider keys first get used (Unit 1 / 3 / 4).

## Architecture Decisions

- 2026-09-10: Next.js pinned by scaffold to 16.3.4 with Turbopack as the build
  engine (create-next-app default). `architecture.md` says "Next.js (App
  Router)" without a version — no divergence.
- 2026-09-10: No `src/` dir; all top-level folders at repo root, matching
  `architecture.md` File Organization.
- 2026-09-10: Tailwind v4 (CSS `@theme`, `@tailwindcss/postcss`) — no
  `tailwind.config.*` file. Design tokens land in Unit 5 in `app/globals.css`.
- 2026-09-10: Issue tracker for the Matt Pocock skills = GitHub Issues
  (chosen by user; matches the planned GitHub repo + Vercel deploy).

## Session Notes

- [Context needed to resume work in the next session]
- 2026-09-10: Project renamed from `chen.AI` to `hao.AI` across all
  context files.
- 2026-09-10: Repo scaffolded in a temp dir first (create-next-app rejects the
  "Pingo Clone" folder name — has a space/capital) then rsynced in, excluding
  `.git` and the scaffold's `CLAUDE.md`. `package.json` name is `hao-ai`.
- 2026-09-10: Scaffold added `AGENTS.md` (Next.js agent-rules block, auto-
  regenerated by `next dev`) and a `CLAUDE.md` that was NOT copied over — the
  real project `CLAUDE.md` is preserved.
