# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Unit 5 (one-screen restyle + Siri mic) — implemented, pending manual
  browser verification with a real mic/DeepSeek/ElevenLabs round trip.
  Units 2/3/4 still pending their own manual verification and commits
  (unchanged from before Unit 5).

## Current Goal

- Unit 5: `app/page.tsx` rebuilt to `ui-context.md`'s layout (corner HSK
  popover + disabled history icon, centered transcript, fixed blurred
  bottom bar, type/talk toggle) using new `components/MicButton.tsx`,
  `components/HskPicker.tsx`, `components/CorrectionDisclosure.tsx`; full
  design-token `:root` block in `app/globals.css`; self-hosted fonts in
  `app/layout.tsx`.

## Completed

- 2026-09-12 (same day, fifth follow-up): **Architecture cleanup on
  `app/page.tsx`** (795 lines → well under 400), following an
  `/improve-codebase-architecture` review the user asked for, then asked to
  implement in full. Four changes, all mechanical (no behavior/UI change):
  1. **Four duplicated localStorage preferences collapsed into one factory.**
     `hsk_level`, `zh_only_mode`, `display_support`, and `text_scale` each had
     their own hand-written `read`/`getServer`/`subscribe`/`persist` quartet
     for `useSyncExternalStore`. New `components/preference-store.ts`
     (`createPersistedPreference<T>({ storageKey, changeEvent, fallback,
     isValid, parse })`) replaces all four; `app/page.tsx` now just
     instantiates `hskLevelPreference`/`zhOnlyModePreference`/
     `displaySupportPreference`/`textScalePreference` and calls `.read`/
     `.getServer`/`.subscribe`/`.persist` on them. Lives in `components/`, not
     `lib/` — `lib/` is server-only per `architecture.md`'s boundary table
     ("Must not contain: ... client-imported code") and this runs from a
     Client Component.
  2. **Per-turn rendering extracted to `components/TurnCard.tsx`.** The
     ~230-line inline JSX for a single turn (user bubble vs. AI card, the
     display-support branching, the per-turn rate buttons, the correction
     disclosure) is now one `forwardRef` component; `app/page.tsx`'s
     `history.map` is a single `<TurnCard ... />` call per turn.
  3. **The transcribe/chat/speak pipeline extracted to
     `components/conversation-client.ts`.** Three exported functions
     (`transcribe`, `reply`, `speak`), each returning a typed
     `ClientResult<T> = { ok: true; data: T } | { ok: false; error: string }`
     instead of a raw `fetch` + hand-rolled `errorMessage` duplicated three
     times. `app/page.tsx`'s `handleRecordedAudio()`/`send()`/`speak()` now
     just call these and manage React state.
  4. **Audio size cap de-duplicated across the client/server seam.**
     `components/MicButton.tsx` had its own `MAX_AUDIO_BYTES_CLIENT = 1 *
     1024 * 1024`, duplicating `app/api/transcribe/validate.ts`'s
     `MAX_AUDIO_BYTES` (the actual server-enforced invariant #6 value).
     `MicButton.tsx` now imports `MAX_AUDIO_BYTES` directly from
     `validate.ts` (confirmed safe: that file is pure/HTTP-free, no
     server-only APIs, so it's fine to import into a Client Component).
     Also removed a stale comment on `MicButton.tsx` claiming the duplication
     was required by "`ai-workflow-rules.md` §2.4" — that section does not
     exist anywhere in the file; the comment also falsely claimed the values
     were duplicated from `app/page.tsx`, which never had them. Flagging in
     case the citation was meant to point at a real (if differently-worded)
     rule elsewhere — none was found.
  `npm run build`, `npm run lint`, `npx tsc --noEmit`, and `npm test`
  (86 tests, unchanged — this was a structural extraction, not new logic)
  all green after each of the four steps and again at the end. Not yet
  manually re-verified in a live browser (no rendering/behavior change is
  expected, but the Unit 5 manual-verification gap below still applies
  regardless).

- 2026-09-12 (same day, fourth follow-up): **CodeRabbit fix — disabled mic
  button couldn't report why.** `components/MicButton.tsx`'s `<button>` used
  the native `disabled={disabled}` attribute, which stops the browser from
  firing pointer/keyboard events at all — so `handlePointerDown`'s existing
  `if (disabled) { if (disabledMessage) onMicError(disabledMessage); return; }`
  guard was dead code for real users; `disabledMessage` (e.g.
  `MIC_BLOCKED_MESSAGE` while TTS is playing) never reached `onMicError`.
  Fixed by switching to `aria-disabled={disabled}` and keeping the JS guard,
  per CodeRabbit's review comment — the button still looks/reads as disabled
  (styling was already keyed off the `disabled` prop, not the attribute) but
  now actually dispatches events so the guard can run. No prop/type change,
  no caller update needed (`app/page.tsx`'s usage is unaffected). No build/
  lint/test run yet for this change — single attribute swap, low risk; run
  before the next commit alongside the rest of this session's pending Unit 5
  batch.

- 2026-09-12 (same day, third follow-up): **Hover tooltips on icon-only
  controls.** User request: icon-only buttons shouldn't require guessing —
  hovering should show what they do. Added native `title` attributes in
  `app/page.tsx` to the buttons that had icons but no visible text: the
  replay/speaker button ("Play audio"), the talk/type toggle (mirrors its
  existing `aria-label`), the send button ("Send"), and the two disabled
  buttons (history clock: "Conversation history (coming soon)"; the bottom-
  bar plus: "Attach (coming soon)"). `ZhOnlyToggle` already had a `title`
  from an earlier session. `DisplaySupportToggle` and `HskPicker` weren't
  touched — both already show text labels, not icon-only.
  **Bug caught on user report ("doesn't show anything when I hover"):**
  Chrome/Firefox suppress all mouse events, including hover/`title`
  tooltips, on elements with the `disabled` attribute. Fixed the two
  disabled buttons (history, attach) by moving `title` onto a wrapping
  `<span>` instead of the `<button>` itself — the span isn't disabled, so it
  still receives hover. The three enabled buttons (speaker, keyboard toggle,
  send) use `title` directly on the `<button>` and should already work
  natively. No build/lint/test run yet for this change — plain attribute
  additions, low risk; run before the next commit alongside whatever else is
  pending in this session's Unit 5 batch.

- 2026-09-12: **Mockup-driven feature adoption**, following a
  requirements-grilling session against a Stitch-generated redesign the user
  shared (a "hao.AI" screenshot with streaks, a scenario picker, a display-
  density toggle, quick-reply chips, a richer correction callout, per-message
  playback speed, an accuracy score, tier badges, and a shadowing-drill
  button). Adopted only what didn't collide with documented scope and cleared
  the user's own "easy to add" bar:
  - **Display Support toggle** — new `components/DisplaySupportToggle.tsx`,
    a 4-way segmented control (All / Hanzi+Pinyin / Hanzi Only / Audio)
    wired into `app/page.tsx` via a new `DisplaySupportMode` type
    (`types/index.ts`) and a `localStorage`-backed `useSyncExternalStore`
    (`display_support` key), same pattern as the existing `hsk_level`/
    `zh_only_mode`/`text_scale` controls. Conditionally hides the AI turn's
    pinyin/English/Hanzi lines; the correction disclosure is unaffected by
    this mode.
  - **Per-message speaking rate**, replacing the single app-wide rate
    switcher. The old `speakingRate`/`rateMenuOpen` state and the bottom-bar
    rate-switcher UI (plus its `.rate-switcher`/`.rate-options` CSS) were
    removed from `app/page.tsx`; a `turnRates: Record<number, SpeakingRate>`
    map replaces them, with a small 0.75x/1x/1.5x button row rendered next to
    each AI turn's replay button (`SPEAKING_RATES`, unchanged stops).
    `speak()` now reads `turnRates[index] ?? 1` instead of one global value.
    No DB implication — `speaking_rate` in `architecture.md`'s `settings`
    table was already "not yet built"; this was pure client React state
    before and after.
  - **"Native Polish Tip" correction restyle** — `components/
    CorrectionDisclosure.tsx`'s trigger label changed from "Correction" to
    "Native Polish Tip", and its content now leads with a small "Easy Fix"
    pill using the new `--brand-accent` token. Same `correction: string`
    prop, same Radix Collapsible mechanics, no schema change — deliberately
    not the mockup's strikethrough-diff view (would need DeepSeek to return
    structured before/after text; rejected as not "easy").
  - **Brand-accent token exception** — `app/globals.css` gained
    `--brand-accent`/`--brand-accent-hover`/`--brand-accent-text`
    (`#FF6B6B`, sourced from the untracked `app/icon.svg` panda mark, which
    matches the mockup's accent color). This is a narrow, documented
    exception to `code-standards.md`'s "accents are semantic only" rule —
    scoped to the wordmark icon and the "Easy Fix" tag; every other pastel
    (`--live-*`, `--warn-*`, `--ok-*`, `--err-*`) stays semantic-only.
    `app/page.tsx`'s top-left wordmark now renders `<img src="/icon.svg">`
    (served automatically by Next.js's `app/icon.svg` file convention — no
    new route needed) next to the "hao.AI" text.
  - **Rejected outright** (named conflicts with `project-overview.md`'s
    out-of-scope list, not revisited): the streak/goal/round-count dashboard
    header, the scenario/lesson picker and "Today's Goal" banner, the
    accuracy-score badge on user turns, the "SCHOLAR" tier badge, and the
    unlabeled book icon (purpose never clarified). Also rejected: the full
    shadowing-drill (mic re-record + comparison) feature and per-word slow
    playback — not out-of-scope, but nontrivial (word-level audio
    segmentation) and never actually requested once the mockup's simpler
    per-message-speed reading was confirmed.
  - **Shelved, not decided** — streak counter and an ephemeral (non-
    persisted) version of the quick-reply chips; see "Open Questions" above.
  `ui-context.md` and `code-standards.md` updated in the same change (see
  their own diffs) to document the new control, the per-message rate model,
  the restyled correction component, and the brand-accent exception, per
  `ai-workflow-rules.md` §6.2. `npm run build`/`lint`/`test` (86 tests, no new
  ones needed — this is display logic already covered by existing
  rendering, not new branching worth its own check) all green. Manually
  verified in a live browser (`browse` skill against the already-running
  `npm run dev`): all four display-support modes render correctly, the
  per-message rate row is independent per turn, and the restyled correction
  callout matches the mockup's look (verified via a static token-accurate
  preview after a live DeepSeek round trip intermittently 500'd — see below).
  **Unrelated pre-existing issue noticed, not fixed** (out of this session's
  scope): `POST /api/chat` intermittently returned a `500` with
  `SyntaxError: Unexpected end of JSON input` during manual testing — looks
  like a DeepSeek response-parsing edge case in the existing route, unrelated
  to anything touched here. Flagging per `ai-workflow-rules.md` §6.7 ("never
  let code and docs drift silently... report it").

- 2026-09-12 (same day, follow-up): **Turn cards + bigger controls**, per a
  direct user request against the same mockup ("make the buttons bigger and
  make the chat container just like the screenshot"). Both AI and user turns
  are now wrapped in a card (`--surface`/`--surface-sunken`, `--border`,
  `--radius-lg`, the one permitted `0 2px 8px` shadow ceiling — extending
  that ceiling's use beyond the History panel/level dialog to every turn
  card, a deliberate part of the Q12/Q13 "revise the token system toward
  this mockup" decision already made this session, not a new one). AI turn
  cards gained a header row (a small `--brand-accent` circle badge with a
  Phosphor `Info` glyph, "hao.AI Tutor · {rate}x" label, and a timestamp)
  and moved the replay button + per-message rate row to a footer below a
  divider, matching the mockup's layout more closely than the earlier
  top-right-stacked version. New client-only `turnTimestamps: number[]`
  state in `app/page.tsx` (seeded via a lazy `useState` initializer, appended
  alongside every `setHistory` call in `send()`) and a `formatTurnTime`
  helper — display-only, not part of `Turn`, `ChatResponse`, or any API
  contract. Bumped icon/font/padding sizes on the small controls (HSK tag,
  history icon, A-/A+, `ZhOnlyToggle`, `DisplaySupportToggle`, bottom-bar
  icons, per-turn replay/rate buttons) — the mic button itself was
  deliberately left untouched (already enlarged in an earlier session, with
  a detailed pixel-tied animation spec; resizing it wasn't asked for here).
  **Regression caught and fixed in the same step:** the corner controls were
  `position: absolute`, so adding the Display Support toggle's four buttons
  made the top-left cluster wide enough to visually overlap the top-right
  HSK tag/history icon at 400px width — two absolutely-positioned siblings
  don't push each other when either wraps. Fixed by converting both corner
  clusters into one normal-flow flex header (`flex-wrap: wrap`,
  `justify-content: space-between`), so they wrap onto their own lines at
  narrow widths instead of overlapping; the transcript column's top padding
  was also simplified since it no longer needs to reserve space for an
  absolutely-positioned header. Verified at 400px via `browse`: no
  horizontal scroll (`document.documentElement.scrollWidth >
  document.documentElement.clientWidth` is `false`), header wraps cleanly.
  **Also noticed, not part of this change:** a concurrent edit (from outside
  this session) added a `disabled`/`disabledMessage` prop pair to
  `components/MicButton.tsx` and wired it in `app/page.tsx` to block
  recording while TTS is playing (`MIC_BLOCKED_MESSAGE`). Left in place — it
  merged cleanly with this session's edits and looks correct.
  `npm run build`/`lint`/`test` (86 tests) all green after both the restyle
  and the responsive fix. Manually verified in a live browser (desktop
  1280px, mobile 400px): turn cards render correctly for both roles,
  timestamps populate on new turns, header wraps without overlap at 400px.

- 2026-09-12 (same day, second follow-up): **Display Support converted to a
  popover; sizes moderated.** User clarified the "too big/zoomed" look was
  their own browser at 50% zoom, not a real bug — but asked for a general
  size sanity check plus one concrete change: the Display Support control
  (4 always-visible buttons) was crowding the header, especially at 400px.
  Ran `/impeccable` (narrow-refinement mode, no `PRODUCT.md` in this repo —
  proceeded on the incumbent implementation per its own routing rule) and
  its mechanical detector (`detect.mjs`, zero findings) over the changed
  files. Converted `components/DisplaySupportToggle.tsx` from a segmented
  row to a single trigger pill + Radix Popover, matching `HskPicker.tsx`'s
  existing pattern exactly (trigger pill, `Check` on the active row,
  click-to-select-and-close) — collapses 4 header buttons to 1. Moderated
  the same session's earlier size bumps back down (HSK tag, history icon,
  A-/A+, `ZhOnlyToggle`, bottom-bar icons, per-turn replay/rate buttons) to
  values between the pre-mockup originals and the earlier bumped pass —
  bigger than before, not maxed out. `npm run build`/`lint`/`test` (86
  tests) green; verified live at 1280px and 400px — header now wraps onto
  at most two tidy rows, popover opens/selects correctly, no crowding.

- 2026-09-11: **Unit 5 implemented** per
  `context/feature-spec/unit-5-one-screen-siri-mic.md`, then extended with
  several live user usability requests in the same session (see below).
  `app/globals.css` got the exact `:root` token block from `ui-context.md`
  plus the one `body` rule. `app/layout.tsx` loads `Newsreader`/`Geist`/
  `Geist Mono` via `next/font/google` as `--font-serif`/`--font-sans`/
  `--font-mono`. New `@radix-ui/react-popover` + `@radix-ui/react-collapsible`
  deps. New `components/mic-button-helpers.ts` (`isMisTap`, `smoothLevel`,
  extracted for testability) + `test/mic-button-helpers.test.ts` (4 cases,
  boundary-tested). New `components/MicButton.tsx` — press/hold/release UI,
  canvas `AnalyserNode`-driven harmonic-wobble ring (rAF loop, ripples, inner
  echo, ~260ms release fade, ~320ms mis-tap threshold, permission-denied
  synthetic-signal fallback, `prefers-reduced-motion` branch dropping wobble/
  ripples but keeping the level-driven radius swell), recording lifecycle
  (`getUserMedia`/`MediaRecorder`/blob assembly/`MAX_AUDIO_BYTES_CLIENT`
  check) moved here from `page.tsx` per the spec. New `components/HskPicker.tsx`
  (Radix Popover, six rows, `Check` on active level, OK confirmation).
  New `components/CorrectionDisclosure.tsx` (Radix Collapsible, renders
  nothing when `correction === ""`). `app/page.tsx` rewritten: dev-harness
  `<h1>` removed, typed input promoted to a permanent type/talk toggle
  (`inputMode` state, in-memory only, always opens in talk mode), status
  line consolidated (error/micError/speakError each render via a shared
  `StatusLine` component so one never silently hides another), turn
  rendering restyled inline (AI = pinyin/hero/English + replay + correction;
  user = a distinct card, see below), auto-scroll to the newest turn via
  `scrollIntoView`. No change to `send()`, `handleRecordedAudio`'s network
  calls, or `speak()`'s contract — confirmed against the live (already-
  pivoted) `/api/speak` route, which takes `{ text }` only and applies rate
  client-side via `audio.playbackRate` (an ElevenLabs-speed-limit workaround
  from an earlier session), not the `{ text, rate }` shape the original
  spec draft assumed.
  **Documented deviation from the spec's literal rate-toggle wording:**
  `ui-context.md` describes a two-segment slow/normal control, but the live
  app already exposes rate options with rate applied via `playbackRate`, not
  sent to the server. Per `ai-workflow-rules.md` §4.3 ("if an existing
  pattern in the codebase already answers it, follow that pattern"), the
  toggle was built as an N-segment control over the existing rate options,
  restyled with tokens, no behavior change — not narrowed to 2 segments.
  `npm run build`/`lint`/`test` (86 tests) all green; `grep` for raw hex
  outside `globals.css` and for `NEXT_PUBLIC` both clean.
  **Live usability requests handled in the same session (user-directed,
  overriding `ai-workflow-rules.md` §2.5's default "don't touch tokens/sizes"
  rule per its own front-matter: a direct user instruction wins):**
  mic button enlarged 72px→96px (canvas ring 164px→220px, base radius scaled
  proportionally), all control icons and hit-target padding enlarged, hero/
  pinyin/English/UI type scale increased, transcript column widened
  640px→720px; the rate toggle's active segment restyled from a subtle
  `--surface-sunken` fill to `--border-strong` + bold text (was reported as
  "not clear enough"); a user-adjustable text-size control (`A-`/`A+`,
  `textScale` state, 5 steps 0.85x–1.5x, `localStorage`-persisted under
  `text_scale`, same non-authoritative-local-cache pattern as `hsk_level`)
  added scoped to only the transcript's Chinese/pinyin/English text — UI
  chrome (buttons, icons, labels) deliberately excluded per the request; a
  `hao.AI` serif wordmark added top-left (previously absent); the user's own
  turn restyled from a plain line to a right-aligned card (`--surface-sunken`
  fill, `--border-strong` border, bold "You" label) so it's clearly distinct
  from the AI's unboxed hero-text turn at a glance — intentionally not using
  any `--live-*`/`--warn-*`/etc. semantic pastel for this, since those tokens
  are reserved for state (recording/correction/error), not permanent
  decoration, per `ui-context.md`'s "Banned" list and `code-standards.md`'s
  "Accent pastels are semantic only ... never decoration."
  **Bug caught and fixed during manual browser verification:** at 400px
  width the dev-only zh-only-mode toggle (a pre-existing control, absolutely
  positioned independently) overlapped the transcript's pinyin line, because
  it was a second stacked absolute row not accounted for in the transcript's
  top padding. Fixed by merging it into the same top-left control row as the
  wordmark/text-scale buttons instead of a second row. Confirmed via
  screenshot at 400px that the overlap is gone and there's no horizontal
  scroll.
  **Flagged, not fixed (needs the user's call):** a concurrent edit to
  `app/page.tsx` from outside this session (visible mid-session as an
  external file-change notice) added `import { toPinyin } from
"@/lib/pinyin"` to render pinyin under the user's own turn client-side.
  This violates `architecture.md`'s folder-ownership rule ("`lib/` ...
  Never imported by a client component") — it happens to work today because
  `pinyin-pro` has no Node-only APIs, but it's a boundary violation as
  written and wasn't part of this session's edits. Left in place per the
  standing instruction not to silently revert another party's change; the
  user should confirm whether this is wanted and, if so, either accept the
  boundary exception explicitly in `architecture.md` or move the pinyin call
  server-side (e.g. compute it in `send()`'s response shape instead).
  **Manual browser check performed this session (via headless `browse`,
  `npm run dev`, no real provider keys):** confirmed at 400px/1280px — warm
  canvas, flat borders, no drop shadows outside the two named exceptions,
  serif Chinese hero, Phosphor icons, no emoji; mic button renders at rest
  (static hairline, canvas hidden) and the type/talk toggle swaps the bottom
  bar's center content with no layout shift; HSK popover opens/lists all six
  levels. **Not yet verified live** (needs real `DEEPSEEK_API_KEY`/
  `GROQ_API_KEY`/`ELEVENLABS_API_KEY` in `.env.local` and a real microphone,
  same gap already open for Units 2-4): actual mic hold/release ring
  animation quality, permission-denied synthetic-signal fallback, mis-tap
  hint, reduced-motion branch, and a full send round trip producing a real
  AI turn. Record that check here before committing Unit 5.

- 2026-09-11: **Speaking-rate control moved client-side.** The rate UI was
  reworked per the user's ask from a slow/normal toggle into a
  0.5x/0.75x/1x/1.5x/2x `<select>` (default 0.75x). Initially wired the same
  way as Azure — sending `rate` to `/api/speak`, mapped straight to
  ElevenLabs' `voice_settings.speed` — which caused **`/api/speak` to 500**
  for 0.5/1.5/2. Diagnosed by curling ElevenLabs directly with the stored
  key: `"Invalid setting for speed received, expected to be greater or
equal to 0.7 and less or equal to 1.2"` — ElevenLabs hard-limits this
  endpoint's speed to 0.7-1.2, narrower than the 0.25-4.0 previously assumed
  from secondary docs (that number was wrong; the live API is the source of
  truth). Fix: `lib/elevenlabs-tts.ts`'s `synthesizeSpeech` no longer takes
  a `rate` param or sends `speed` at all — always synthesizes at natural
  speed. `app/api/speak/validate.ts`'s `SpeakRequest` dropped `rate`
  entirely (`{ text }` only); `app/api/speak/route.ts` updated to match.
  `app/page.tsx`'s `speak()` now sets `audioRef.current.playbackRate =
speakingRate` before `.play()` — the browser scales playback natively,
  no provider limit involved, and the full 0.5x-2x range works uniformly.
  `types/index.ts`'s `SpeakingRate` (`0.5 | 0.75 | 1 | 1.5 | 2`) is now a
  purely client-side concept. `test/speak-validate.test.ts` rewritten
  (`rate`-less contract; 8 cases). `npm run build`/`lint`/`test` (78 tests)
  green; curl-verified all five rates return `200` against the live
  `/api/speak` route with real ElevenLabs credentials.

- 2026-09-11: **STT pinyin-output fix.** Mandarin mic input (e.g. "你好")
  was sometimes transcribed as pinyin/Latin-script text instead of Hanzi —
  a documented Whisper quirk for short/ambiguous audio, not a Groq bug.
  Fixed in `lib/groq-stt.ts` by always sending Groq's `prompt` field seeded
  with real Chinese-character example text (`HANZI_BIAS_PROMPT`), which
  biases the decoder's script choice toward Hanzi without forcing
  translation of non-Chinese audio (unlike the existing `language` param).
  `npm run build`/`lint`/`test` green after the change.

- 2026-09-11: **TTS provider pivot** — Azure AI Speech (used for Unit 4's
  TTS) isn't available in the user's country, so it's dropped in favor of
  **ElevenLabs**. Groq was checked first and ruled out on capability grounds,
  not rate limits: its only TTS models (`orpheus-v1-english`,
  `orpheus-arabic-saudi`) don't support Mandarin at all. ElevenLabs verified
  against its own docs: `eleven_multilingual_v2` explicitly lists Chinese
  among 29 supported languages; free tier is 10,000 credits/month
  (1 credit = 1 character for this model, ~10 min of audio), no expiry but
  no commercial-use rights on the free tier — fine for dev, revisit before
  shipping to real users. `lib/azure-tts.ts` deleted; new
  `lib/elevenlabs-tts.ts` (`synthesizeSpeech(text, rate)`, sole reader of
  `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID`, plain `fetch` POST of JSON
  `{ text, model_id, voice_settings }` to `POST /v1/text-to-speech/{voiceId}`
  — simpler than Azure's SSML body, no XML-escaping needed since the text is
  a plain JSON field; `rate` maps to `voice_settings.speed`, 0.75 for slow /
  1.0 for normal, mirroring the prosody values Azure used). No env default
  for `ELEVENLABS_VOICE_ID` — voice availability differs per ElevenLabs
  account/plan, so the user must set a real voice id from their own account
  rather than trust a hardcoded one that might not exist for them.
  `app/api/speak/route.ts` now imports from `@/lib/elevenlabs-tts` (its
  `500` error path/message and the rest of the route were already
  provider-agnostic — only the import and the `console.error` label
  changed). `.env.example`'s Azure TTS lines replaced with
  `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` + `ELEVENLABS_MODEL_ID`
  (default `eleven_multilingual_v2`). `architecture.md`'s TTS row,
  `app/api/speak/`/`lib/` folder descriptions, provider-call list, and
  invariant 6 all reworded from Azure to ElevenLabs. Azure AI Speech is now
  out of the stack entirely (it was also rejected for STT for the same
  country-availability reason — see the Unit 3 entry below). `npm run
build`/`lint`/`test` still need to be re-run and a live curl/browser check
  done with a real `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` — the user said
  they'll paste the env values shortly.

- 2026-09-11: Unit 4 implemented per
  `context/feature-spec/unit-4-voice-output-tts.md` (both open questions
  resolved by the user beforehand: fixed voice `zh-CN-XiaoxiaoNeural`, no
  voice picker; overlapping playback is an ignore-and-no-op guard, not
  interrupted). New `lib/azure-tts.ts` (`synthesizeSpeech(text, rate)` —
  sole reader of `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, plain `fetch` POST
  of SSML to Azure's REST TTS endpoint, `escapeXml` on the model-output text
  before it enters the SSML payload, returns raw MP3 bytes as an
  `ArrayBuffer`, no SDK — matches Unit 1/3's `fetch`-only precedent). New
  `app/api/speak/validate.ts` (`parseSpeakRequest`, `MAX_SPEAK_TEXT_LENGTH` =
  500, mirrors `app/api/chat/validate.ts`/`app/api/transcribe/validate.ts`).
  New `app/api/speak/route.ts` (POST: parse JSON → validate → synthesize →
  `200` raw MP3 bytes with `Content-Type: audio/mpeg`, or the shared
  `{ error }` JSON shape on `400`/`500` — the one route in the app returning
  binary). `types/index.ts` gained `SpeakingRate`. `.env.example` gained
  `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`. `app/page.tsx`: new
  `speakingRate`/`playingIndex`/`speakError` state, one shared
  `audioRef = useRef<HTMLAudioElement>`, `speak(text, index)` (guards on
  `playingIndex !== null`, fetches `/api/speak`, revokes the previous object
  URL before assigning the new one, `await audio.play()`), an `ended`
  listener registered once in a `useEffect` that revokes the object URL and
  clears `playingIndex` — the actual revoke-after-playback point. `send()`
  now calls `void speak(data.reply_zh, nextHistory.length)` synchronously at
  the end of its success path (inside the same gesture-triggered call chain,
  so autoplay isn't script-initiated). One replay button (▶) per AI turn,
  disabled while anything is playing; a Normal/Slow `<select>` in the header
  next to the HSK picker, bound to `speakingRate`, affecting only the next
  `speak()` call. `speakError` renders the same way `error`/`micError`
  already do. New `test/speak-validate.test.ts` (11 cases: valid
  normal/slow, missing `text`/`rate`, empty/whitespace-only `text`, both
  `MAX_SPEAK_TEXT_LENGTH` boundary cases, invalid `rate` value/type, wrong-type
  `text`). **Unrelated pre-existing lint fix, same commit:** the dirty,
  not-yet-committed `zhOnlyMode` toggle (from Unit 3 work) called `setState`
  synchronously inside a mount-only `useEffect`, which fails the
  `react-hooks/set-state-in-effect` ESLint rule now enforced — fixed by
  switching to a lazy `useState` initializer reading `localStorage` directly
  (SSR-safe per its own comment: "no SSR hydration concern since the toggle
  only affects a client-side form field, never markup"), matching the
  no-`useEffect`-for-localStorage-reads posture Unit 2 already established
  for `hskLevel`. `npm run build`, `npm run lint`, `npm test` (81 tests) all
  green. `grep -R NEXT_PUBLIC` still finds nothing.
  `architecture.md` needed no changes — confirmed `app/api/speak/`,
  `lib/azure-tts.ts`, the object-URL cache-table row, and the "no streaming"/
  "TTS never stored" invariants were already documented exactly as
  implemented. Manual browser check (autoplay on send, replay button,
  slow/normal rate audibly different, overlapping-replay no-op, no leaking
  object URLs across many turns, in Chrome + Safari) is **not yet done** —
  needs a real `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` in `.env.local` and a
  live browser session; record the result here before committing.

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
  60s cap, silence/422) needs a real `GROQ_API_KEY` in `.env.local` and a
  live browser session. Commit is next after that.
- Unit 4: automated checks (build/lint/test) done. Remaining manual browser
  check (autoplay on send, replay button, client-side rate switch across
  0.75x/1x/1.5x, overlapping-replay no-op, object-URL leak check across many
  turns, in Chrome + Safari) needs a real `ELEVENLABS_API_KEY`/
  `ELEVENLABS_VOICE_ID` in `.env.local` and a live browser session. Commit is
  next after that.

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
- Unit 4: voice output (TTS) — implemented; manual browser verification and
  commit still pending. Verify autoplay, replay, the client-side rate switch
  across 0.75x/1x/1.5x, overlapping replay, and object-URL cleanup with
  `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (see "In Progress").
- Unit 5: the one screen + Siri mic — implemented; manual browser verification
  and commit still pending (see "In Progress").
- Unit 6: auth (Clerk) — spec drafted at
  `context/feature-spec/unit-6-auth-clerk.md`, not yet implemented. Sign-up
  is open (no allowlist) per the 2026-09-11 decision below. Its one open
  question (`<UserButton />` placement) is now resolved (see below) — the
  spec has no remaining open questions blocking implementation.

## Open Questions

- None blocking. Unit 0b prerequisites are parked (see "Deferred").
- **Streak counter** (4-day-streak-style UI, shown in a Stitch-generated
  mockup the user shared 2026-09-12): explicitly out of scope per
  `project-overview.md` ("Streaks, XP, points, levels, badges, progress
  charts, or any dashboard or statistics screen"). User shelved it for now
  rather than adopting or rejecting outright. If revisited, needs: a scope
  amendment to `project-overview.md` removing that clause, a "day" definition
  (local calendar day vs. server UTC — local was the tentative call), a
  reset-vs-grace-period decision (hard reset was the tentative call), and new
  `settings` columns (`streak_count`, `last_active_date`, plus a timezone
  field that doesn't exist yet).
- **Ephemeral quick-reply suggestion chips** (same mockup): the persisted/
  scenario-tracked version is out of scope ("target-phrase lists"), but a
  cheap ephemeral version — DeepSeek returns 2-3 example next-things-to-say
  alongside `reply_zh`/`reply_en`/`correction`, shown as tappable chips,
  never stored — was identified as not actually in conflict with that
  exclusion. User shelved it for now. If revisited: extend `ChatResponse` and
  `app/api/chat/prompt.ts`'s expected JSON shape with one new field, no
  schema/persistence change.

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
- 2026-09-11: **Unit 6 auth scope changed — sign-up left open, allowlist
  dropped.** User: "I just want everyone to be able to sign up ... I feel
  like no one is going to use it anyway, so it's fine to just leave it for
  now." `ALLOWLIST`, `lib/allowlist.ts`, `isAllowed()`, and the "no access"
  view are all removed from the design; `requireUser()` now only checks for
  a valid Clerk session. `project-overview.md`, `architecture.md`,
  `ui-context.md`, `build-spec.md`, and
  `context/feature-spec/unit-6-auth-clerk.md` were all updated in this same
  change to remove every allowlist reference. Consequence: with no gate on
  who can sign up, Unit 9 (rate limiting + spend guard) becomes the primary
  defense against cost abuse — don't leave a long gap between Unit 6 and
  Unit 9 once implementation starts.
- 2026-09-11: **Unit 6 `<UserButton />` placement resolved: Option B.**
  Shown three mockups (top-right cluster left of history icon, top-right
  outermost right of history icon, or in the bottom bar next to "New
  conversation") in a published design-review artifact; user picked the
  outermost top-right position, right of the history icon. Updated
  `context/feature-spec/unit-6-auth-clerk.md` (item 8 + Open Questions) and
  `ui-context.md`'s corner-controls layout diagram and description to match.
  Unit 6's spec now has no unresolved open questions.

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
