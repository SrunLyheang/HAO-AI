# Feature Spec — Unit 5: The One Screen + Siri Mic

> Derived from `build-spec.md` Unit 5. Restyles the Unit 1–4 dev harness into
> the real minimalist-ui screen described in full in `ui-context.md`: warm
> canvas, flat borders, serif Chinese hero, the audio-reactive mic ring. Pure
> presentation — no new data, no new routes, no auth, no persistence. Assumes
> Unit 4 (TTS: `speak()`, replay button, rate state, shared `<audio>` ref) is
> already merged, since this unit restyles those controls rather than adding
> them.
>
> **Status: IMPLEMENTED**, pending manual browser verification and commit
> (see "In Progress" in `context/progress-tracker.md`).

## One sentence

`app/page.tsx` is rebuilt to the `ui-context.md` layout (corner HSK popover,
centered document-style transcript, fixed blurred bottom bar) using new
`components/` primitives for the mic button, HSK picker, and correction
disclosure; `app/globals.css` gets the full design-token `:root` block and
self-hosted fonts; the mic button gains the canvas-drawn, `AnalyserNode`-
driven waveform ring — no pipeline, provider, or state-shape changes.

## Why this is its own step (`ai-workflow-rules.md` §3)

- Touches far more than three files (`globals.css`, `layout.tsx`, `page.tsx`,
  and at least three new `components/` files) — rule §3.1 alone forces a
  split from whatever unit precedes it.
- It is the unit `architecture.md`'s folder table already names for this
  work: `components/` "owns" "transcript, turn, correction disclosure, mic
  button, HSK picker, history panel, rate toggle, error/loading states" but
  today holds nothing — every one of those currently lives inline in
  `app/page.tsx` (Units 1–4's stated posture: "not yet the minimalist-ui
  styling ... Unit 5 restyles the whole screen"). Moving them out is exactly
  this unit's job, not a speculative refactor (`ai-workflow-rules.md` §2.3
  exception: "unless the unit cannot be completed without it").
- `ui-context.md`'s mic-ring section describes a stateful, per-frame
  `requestAnimationFrame` animation reading a live `AnalyserNode` — a new,
  self-contained technical unknown (60fps canvas animation + Web Audio) that
  deserves isolation the same way Unit 3 isolated the mic *recording* round
  trip and Unit 4 isolated audio *playback*.
- `build-spec.md`'s Unit 5 done criterion ("Mic ring animates smoothly with
  voice volume at 60fps and is completely still when idle") is a performance
  claim that needs its own manual verification pass, not folded into an
  unrelated change.

## In scope

### 1. `app/globals.css` (edit)

Replace the placeholder comment with the token block from `ui-context.md`
verbatim — no invented values, per `ui-context.md`'s opening rule ("must not
invent a hex value, a radius, a font, or a component pattern — it reads this
file and uses the token"):

- The full `:root { ... }` block (surfaces, borders, text, interactive/mic,
  semantic pastels, fonts, radii, spacing) exactly as listed in
  `ui-context.md`'s "`:root` block" section.
- `body { background: var(--canvas); color: var(--text); font-family:
  var(--font-sans); }` as the one global rule outside `:root`.
- `prefers-reduced-motion: reduce` handling is component-local (mic ring,
  turn-append fade, dialog slide), not a global CSS override — each
  component's own motion honors it per `ui-context.md`'s "Motion" section.
- No `tailwind.config.*` — Tailwind v4's CSS-based config means utility
  classes (`flex`, `gap-*`, `p-*`) continue to work alongside the custom
  properties; components reference tokens via `var(--token)` in inline
  `style` or small `@layer components` rules, never a raw hex (banned list,
  `ui-context.md` §Banned).

### 2. `app/layout.tsx` (edit)

- Load `Newsreader` and `Geist`/`Geist Mono` via `next/font/google`
  (`next/font` self-hosts at build time regardless of package name —
  `ui-context.md`: "self-hosted, `display: swap`. No CDN font links"),
  exposing each as a CSS variable (`--font-serif`, `--font-sans`,
  `--font-mono` — matching the names `globals.css`'s `:root` block already
  declares as fallback stacks, so the loaded font becomes the first entry in
  each `var()` stack rather than a second, conflicting declaration).
- Apply the variable classes to `<html>` or `<body>`. `lang="en"` and the
  existing `metadata` export are unchanged.

### 3. `components/MicButton.tsx` (new, Client Component)

Owns rendering and animation only — no `fetch`, no provider call
(`architecture.md`: `components/` "must not contain ... any direct provider
call"). The recording lifecycle (`getUserMedia`, `MediaRecorder`, upload)
stays in `app/page.tsx`, which passes callbacks down.

```ts
type MicButtonProps = {
  onRecordingComplete: (blob: Blob) => void;
  onMicError: (message: string) => void;
  disabled?: boolean; // true at the 25-turn cap (Unit 9) — inert prop for now
};
```

- Renders the `72px` circle (`--action` background, `Microphone` Phosphor
  icon, `fill` weight, `--text-inverse`) plus the `164px` backing `<canvas>`
  behind it, sized to `devicePixelRatio` (capped at 2), exactly as
  `ui-context.md`'s "Mic button and ring — Structure" specifies.
- At rest: the static `::before` hairline ring, canvas `opacity: 0`. No rAF
  loop running.
- On `pointerdown` (mouse + touch unified via Pointer Events, replacing the
  current separate `onPointerDown`/`onTouchStart` — Unit 3 already used
  Pointer Events, so this is a style/animation addition to existing wiring,
  not a new input model): press micro-animation (button `scale(1.04)`, glyph
  `scale(.9)`, hairline expands + fades), canvas fades to `opacity: 1`, one
  acknowledgement ripple, then `getUserMedia` + `AnalyserNode(fftSize: 512)`
  exactly as Unit 3 already does in `app/page.tsx`'s `startRecording` — moved
  here, with the addition named in `ui-context.md`: on permission denial,
  call `onMicError(...)` (same message Unit 3 already uses) **and** fall
  back to a synthetic signal so the ring still animates rather than going
  dead. This fallback is new in this unit — Unit 3 only had the error state.
- While held: the rAF loop draws the harmonic-wobble blob + ripples + inner
  echo described in `ui-context.md`, reading `getByteTimeDomainData` →
  smoothed RMS `level`. Below ~320ms hold, on release treat as a mis-tap: no
  `onRecordingComplete` call, show the "Hold longer to talk" hint locally for
  ~1.4s instead.
- On release (long-enough hold): stop the loop with the ~260ms inward-collapse
  fade described in `ui-context.md`, stop the `MediaStream`, assemble the
  blob exactly as Unit 3's `handleRecordedAudio` already does up to (but not
  including) the `fetch("/api/transcribe")` call, apply the existing
  `MAX_AUDIO_BYTES_CLIENT` check, and call `onRecordingComplete(blob)` — the
  parent (`page.tsx`) keeps the upload/transcribe/send pipeline.
- `prefers-reduced-motion: reduce`: skip the harmonic wobble and ripples;
  keep the level-driven radius swell (functional feedback, per
  `ui-context.md`).
- Hint text below the button (`--text-meta`, `--text-muted`): "Hold to talk"
  / "Listening…" / "Hold longer to talk", per state.
- Reads the `--mic-ring` stroke color once via `getComputedStyle` on mount,
  not per frame (`ui-context.md`'s Performance note).

### 4. `components/HskPicker.tsx` (new, Client Component)

- Wraps `@radix-ui/react-popover` (new dependency — already named in
  `architecture.md`'s stack table and `ui-context.md`'s "Component
  conventions"; not a new addition this unit invents).
- Props: `level: HskLevel`, `onChange: (level: HskLevel) => void` — the
  existing `hskLevel` / `persistHskLevel` state and `localStorage` wiring
  from Unit 2 stay in `page.tsx`; this component is purely the trigger pill
  + popover content styled per `ui-context.md`'s "HSK level picker" section
  (six rows, `Check` icon on the active row, row hover, closes + shows a
  brief OK confirmation on select).
- Replaces the current plain `<select>` one-for-one; no behavior change to
  what is stored or when.

### 5. `components/CorrectionDisclosure.tsx` (new, Client Component)

- Wraps `@radix-ui/react-collapsible` per `ui-context.md`'s "Correction"
  section (left-aligned trigger, `CaretRight`/`CaretDown` rotation,
  `--surface-inset` content body).
- Props: `correction: string` — renders nothing (no trigger) when `""`,
  matching the existing `turn.correction !== ""` guard already in
  `page.tsx`.
- Replaces the current `<details>`/`<summary>` one-for-one.

### 6. `app/page.tsx` (edit — restyle + compose, no new state)

- Layout rebuilt to `ui-context.md`'s "Conversation screen" structure:
  - **Corner controls**: `--space-4` from top/right, `<HskPicker>` then the
    history icon button (`ClockCounterClockwise`, ghost style) — see Open
    Questions #1 for what the history button does in this unit.
  - **Transcript column**: `max-width: 640px`, centered, `--space-4` side
    gutter, `--space-16` bottom padding, auto-scroll to newest turn on
    append (`scrollIntoView({ behavior: "smooth", block: "end" })`) via a
    ref on the last turn, replacing no existing scroll behavior (none
    exists yet).
  - **Turn rendering**: kept inline in `page.tsx` (not split into its own
    component) — it is a straightforward per-turn `map` over already-typed
    `Turn` data with no independent state or animation of its own, so a
    dedicated `components/Turn.tsx` would be a wrapper with one caller and
    no behavior (`ai-workflow-rules.md` §2.2: don't build structure the unit
    doesn't require). AI turn = pinyin (`--text-pinyin`, `--font-mono`,
    `--text-secondary`) above the Chinese hero (`--text-hero`,
    `--font-serif`, `--ink`) above the English line (`--text-english`,
    `--text`), plus `<CorrectionDisclosure>` and the existing Unit 4 replay
    button (now a ghost `SpeakerHigh` icon button per `ui-context.md`,
    styled but not behaviorally changed). User turn = one `--font-sans` line
    in `--text`, labelled "You" (`--text-label`).
  - New turn fade-in: `opacity`/`translateY(8px)` settle, `300ms`,
    `cubic-bezier(0.16, 1, 0.3, 1)`, per `ui-context.md`'s Motion table.
  - **Fixed bottom bar**: `position: fixed`, blurred `--surface` via
    `backdrop-filter: blur(8px)` over `color-mix(in srgb, var(--surface) 80%,
    transparent)`, `border-top: 1px solid var(--border)`. Left: the existing
    Unit 4 rate toggle, restyled as the two-segment control `ui-context.md`
    describes (replacing its current plain `<select>`/buttons, no behavior
    change). Center: `<MicButton>`. Right: "New conversation" — see Open
    Questions #2.
  - **Status line** (error / mic error / OK / live): consolidated into the
    single region `ui-context.md`'s "Error and status states" describes
    (`--err-bg`/`--err-text` etc.), replacing the current two separate plain
    red `<p>` lines for `error` and `micError` — same underlying state
    variables, restyled and merged into one rendering path so a mic failure
    still doesn't get silently overwritten by a chat error (existing Unit 3
    precedent, preserved).
- No change to `send()`, `handleRecordedAudio`'s network calls, `speak()`
  (Unit 4), or any state's *meaning* — `history`, `hskLevel`, `pending`,
  `error`, `micError`, `speakingRate`, `playingIndex`, `speakError` all keep
  their existing types and update logic. `startRecording`/`stopRecording`
  move into `<MicButton>` per item 3 above; `page.tsx` keeps
  `handleRecordedAudio` (now invoked via `onRecordingComplete`) and
  `mediaRecorderRef`/`chunksRef`/`stopTimerRef` move with them.
- The `<h1>` dev-harness label ("hao.AI — typed harness (Unit 1)") is
  removed. The typed input itself is **kept and promoted to a permanent,
  user-facing feature** — the type/talk toggle described in
  `ui-context.md`'s new "Type/talk toggle" section, per the user's decision
  to reverse `build-spec.md` Unit 1's original "dev flag" framing (both
  `project-overview.md` and `build-spec.md` were updated in the same change
  as this spec to reflect that reversal — no divergence between the docs
  and this unit's scope).

### 7. Type/talk toggle (new user-facing control, not a dev flag)

- New client state: `inputMode: "talk" | "type"` (default `"talk"`,
  in-memory only — `ui-context.md`: "No mode persists across reloads").
- Left end of the bottom bar: a ghost icon button (`Keyboard` when in talk
  mode, `Microphone` when in typed mode) that flips `inputMode`.
- In talk mode: renders `<MicButton>` as described in item 3.
- In typed mode: renders a single-line text input bound to the existing
  `input` state plus a ghost `PaperPlaneTilt` send button calling
  `send(input)` — this is the Unit 1 `<textarea>`/"Send" pair, restyled to
  `ui-context.md`'s token set and narrowed to one line to fit the bar (the
  existing `Enter`-to-send / `Shift+Enter`-newline handling on a
  single-line `<input>` simplifies to plain `Enter`-to-send, no
  `isComposing`/`shiftKey` branch needed since there's no newline case on a
  single-line field).
- Both modes call the same `send()` — no change to that function or to
  `handleRecordedAudio`; this control only changes which input widget is
  visible.
- Crossfade transition between modes (`opacity`, `160ms`), no layout shift,
  per `ui-context.md`.

### 8. Responsive behavior

- Holds `400px` → desktop, `--space-4` (16px) minimum side gutter, no
  horizontal scroll at any width — verified manually at 400px, 480px, and
  desktop widths per `ui-context.md`'s "Responsive" section.
- Below `480px`: "New conversation" collapses to its icon-only form, hero
  text sits at the low end of its `clamp()`.

## Out of scope (explicitly — do not build now)

- Any new data, route, or pipeline step. This unit is styling and animation
  only over the Units 1–4 pipeline.
- `requireUser()`, Clerk, sign-in screen, "no access" view (Unit 6).
- A working history panel (list of past conversations, tap-to-open) — no
  conversation persistence exists yet (Unit 7/8). The history icon renders
  disabled per the user's decision (see "Resolved" below).
- A working "new conversation" action (archive + reseed) — same dependency
  on Unit 7/8 persistence. The button renders disabled, same decision.
- The 25-turn cap's disabled state logic — `disabled` is accepted as a prop
  on `<MicButton>` for forward compatibility with Unit 9 but is never passed
  `true` by anything in this unit (no cap-counting exists yet).
- Rate limiting, `usage_log`, spend guards (Unit 9).
- Persisting `inputMode` across reloads — per `ui-context.md`, the screen
  always opens in talk mode; no `localStorage`/DB entry for it.
- Changing any design token, color, spacing step, or component pattern
  beyond copying `ui-context.md` verbatim (`ai-workflow-rules.md` §2.5).
- A `components/Turn.tsx` split (see item 6's rationale above) or any other
  component `architecture.md` names that this unit's scope doesn't actually
  require yet (e.g. a standalone `components/RateToggle.tsx` — the existing
  two-segment control is simple enough to stay inline in `page.tsx` next to
  the bottom bar it lives in, same reasoning as the turn-rendering decision).
- Dark mode, theme switching — `ui-context.md`: "Light mode only."

## Files touched

| File | Change |
|------|--------|
| `app/globals.css` | edit — full `:root` token block, `body` base rule |
| `app/layout.tsx` | edit — `next/font` for Newsreader/Geist/Geist Mono as CSS variables |
| `components/MicButton.tsx` | new — press/hold/release UI, canvas ring animation, `AnalyserNode` |
| `components/HskPicker.tsx` | new — Radix Popover HSK trigger + level list |
| `components/CorrectionDisclosure.tsx` | new — Radix Collapsible wrapper |
| `app/page.tsx` | edit — layout rebuild, status-line consolidation, type/talk toggle (`inputMode` state), disabled history icon and "New conversation" button, wires the three new components |
| `package.json` | edit — add `@radix-ui/react-popover`, `@radix-ui/react-collapsible`, `@phosphor-icons/react` (all already named in `architecture.md`'s stack table; none are new decisions) |

No test file is added for this unit — see "Tests" below for why.

## Tests (`test/`)

This unit adds no new pure/testable logic (`code-standards.md`'s validator
pattern applies to request-parsing functions; there is no new one here). The
smoothed-RMS-to-radius math in `<MicButton>` is visual/animation code, not a
money, security, or parsing path, so `ai-workflow-rules.md` §7.10's "trivial
one-liners do not need one" bar does not strictly require a unit test either
— but it is non-trivial branching logic (mis-tap threshold, reduced-motion
branch, permission-denied fallback), so it gets one runnable check:

### `test/mic-button-helpers.test.ts` (new)

Extract the two pure decision points from `<MicButton>` into small exported
helpers so they're testable without a DOM/canvas:

- `isMisTap(holdMs: number): boolean` — `true` under ~320ms, `false` at/above
  it (boundary case tested both sides, matching Unit 2/3/4's boundary-test
  style).
- `smoothLevel(current: number, target: number): number` — the `level +=
  (target - level) * 0.28` step; test that it moves toward `target` and never
  overshoots past it in one call.

Everything else (canvas drawing, `AnalyserNode` wiring, CSS transitions) is
verified manually only, same posture `ui-context.md`'s animation
descriptions imply and Unit 3/4 already took for their own non-parsing
browser behavior.

### Manual browser check (record in `progress-tracker.md`)

Load the app in current Chrome and Safari at 400px, 480px, and desktop
widths — confirm no horizontal scroll and a ≥16px gutter at each. Confirm
the screen matches `ui-context.md`: warm canvas, white turn area, flat 1px
borders, no drop shadows outside the two named exceptions, serif Chinese
hero, Phosphor icons (not the current emoji mic glyph), no emoji anywhere.
Hold the mic button and confirm the ring is a smooth, non-jittery
harmonic-wobble blob that visibly tracks speaking volume (louder → larger
wobble) and is perfectly still (no canvas draw) when idle. Release under
320ms and confirm the "Hold longer to talk" hint appears with no turn sent.
Deny microphone permission and confirm the ring still animates via the
synthetic-signal fallback instead of a dead button. Enable
`prefers-reduced-motion` in OS settings and confirm the blob stays circular
with no ripples, while the ring still visibly swells with the level. Confirm
the HSK popover, correction disclosure, and (if Unit 4 is merged) the replay
button and rate toggle all still function exactly as before, only restyled.
Tap the type/talk toggle, confirm the mic circle swaps for the text
input/send row with no layout shift, send a typed message and confirm it
produces a turn identical in shape to a transcribed one; toggle back to talk
mode and confirm the mic still works. Confirm the history icon and "New
conversation" button render visibly disabled and do nothing when clicked.

## Done criteria (`build-spec.md` Unit 5 + `ai-workflow-rules.md` §7)

1. Screen matches the minimalist-ui direction: warm canvas, flat 1px
   borders, no shadows (outside the two named exceptions), serif Chinese
   hero, Phosphor icons, no emoji anywhere in markup or copy (manual check
   + spot-check of `app/` and `components/` for emoji/icon-set drift).
2. Mic ring animates smoothly with voice volume and is completely still when
   idle (manual check, both with a real mic and the permission-denied
   fallback).
3. Layout holds from 400px to desktop with a ≥16px side gutter and no
   horizontal scroll at any width (manual check at 400px/480px/desktop).
4. `isMisTap`/`smoothLevel` unit tests pass; `npm test` green including all
   prior tests.
5. `npm run build` and `npm run lint` pass. `strict` stays `true`; no `any`,
   `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
6. No secret, provider call, or `fetch` inside any file under `components/`
   (verified by code inspection against `architecture.md`'s folder-ownership
   rule for `components/`).
7. No raw hex color anywhere in `app/` or `components/` outside
   `globals.css`'s `:root` block (verified by grepping those two folders for
   hex literals, matching `ui-context.md`'s "No raw hex values in
   components" rule).
8. Diff contains only Unit 5 scope — no new routes, no DB, no auth, no rate
   limiting, no history/new-conversation *behavior* (both render disabled,
   per the resolved Open Questions #1/#2).
9. Type/talk toggle switches the bottom bar between `<MicButton>` and the
   typed input/send row with no layout shift; a typed message sent while in
   typed mode produces an identical turn shape to a transcribed voice
   message (manual check).
10. `.env.example` unchanged (no new provider); `architecture.md` needs no
    changes — the `components/` folder-ownership row already names exactly
    what this unit fills in. `project-overview.md`, `build-spec.md`, and
    `ui-context.md` were already updated for the type/talk toggle in the
    same change as this spec — confirm no further drift at handback.
11. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # visual check at 400px/480px/desktop, mic hold/release, reduced-motion, permission-denied
grep -R "NEXT_PUBLIC" . --include=*.ts --include=*.tsx || echo "none — expected"
grep -RE "#[0-9A-Fa-f]{3,6}" app components --include=*.tsx --include=*.ts || echo "none — expected"
git status && git log --oneline -1
```

## Open questions

Resolved (user decision, 2026-09-11):

1. **History icon in this unit.** `ui-context.md`'s layout diagram places a
   history icon button in the top-right corner, but the history *panel*
   (list of past conversations) needs persistence that doesn't exist until
   Unit 7/8. Settled: render the icon button now, disabled
   (`--text-disabled`, `cursor: not-allowed`, no click handler), so the
   final layout position is correct without faking functionality. Unit 8
   removes `disabled` and wires the Radix `Dialog`.
2. **"New conversation" button in this unit.** Same dependency — archiving
   the current conversation and seeding a fresh greeting is Unit 7/8 work.
   Settled: same pattern as #1 — render disabled.
3. **Typed input's future.** Originally framed as a dev-only harness behind
   a flag (`build-spec.md` Unit 1's original wording). Settled: it becomes a
   permanent, user-facing type/talk toggle instead (item 7 above) —
   `project-overview.md`, `build-spec.md`, and `ui-context.md` were all
   updated in the same change as this spec to remove the "dev flag" framing
   and document the toggle as a real feature. No dev-flag mechanism is
   needed or built.

## Follow-ups to hand back (do NOT start in Unit 5)

- Unit 6: no styling follow-up expected — the sign-in/sign-up screen is
  Clerk's hosted `<SignIn>` per `ui-context.md`, centered on `--canvas`, no
  custom chrome. Sign-up is open (no allowlist), so there is no "no access"
  view to build — the status-line pattern from this unit isn't needed for
  auth.
- Unit 7/8: remove `disabled` from the history icon and "New conversation"
  button and wire them to real data; build the Radix `Dialog` history panel
  body per `ui-context.md`'s "History" section.
- Unit 9: pass `disabled={true}` to `<MicButton>` at the 25-turn cap (the
  prop already exists per this unit's scope, just unused until then); the
  status-line "Live" state (pulsing dot) is available but not yet wired to
  a rate-limited "slow down" response.
