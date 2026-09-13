# UI Context

The visual language for hao.AI. Every color, size, and component
decision the coding agent needs is in this file. The agent must not
invent a hex value, a radius, a font, or a component pattern — it
reads this file and uses the token.

hao.AI is one screen. Light mode only. No dark theme, no theme
switcher, no user-configurable appearance.

## Aesthetic

Premium utilitarian minimalism. The transcript reads like a centered
document: an editorial serif Chinese line as the hero, monospace
pinyin above it in gray, an English translation below. Warm off-white
canvas, white cards, flat 1px borders, no drop shadows. Color is a
scarce resource used only for semantic state (recording, correction,
success, error). Phosphor icons, bold weight. No emoji anywhere.

### Banned

- No `Inter`, `Roboto`, `Open Sans`.
- No thin-line icon sets (Lucide, Feather, Heroicons). Phosphor only.
- No `shadow-md` / `shadow-lg` / `shadow-xl`, no custom shadow above
  `0 2px 8px rgba(0,0,0,0.04)`.
- No gradients, neon, glassmorphism (a subtle backdrop blur on the
  fixed bottom bar is the only exception).
- No `border-radius: 9999px` on cards or the primary button. Pills
  are allowed only on the mic button and on tags/badges.
- No emoji in code, markup, copy, headings, or alt text.
- No raw hex values in components — use the CSS custom property.
- No AI copy clichés ("Elevate", "Seamless", "Unleash", "Next-Gen").

## Color tokens

### Surfaces and structure

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#F7F6F3` | App background, the one screen |
| `--surface` | `#FFFFFF` | Turn cards, popover, history panel, bottom bar |
| `--surface-inset` | `#FBF3DB` | Correction disclosure body |
| `--surface-sunken` | `#F1F0EC` | `<kbd>` chips, disabled field background |
| `--scrim` | `rgba(17,17,17,0.32)` | Dimmer behind the history / level dialog |

### Borders

| Token | Hex | Use |
|---|---|---|
| `--border` | `#EAEAEA` | Every card, divider, input — the `1px solid` rule |
| `--border-strong` | `#D8D7D3` | Hover border on interactive cards, popover edge |
| `--focus-ring` | `#1F6C9F` | 2px focus outline on keyboard focus |

### Text

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#111111` | Chinese hero line, primary UI text (never `#000`) |
| `--text` | `#2F3437` | English translation, body copy |
| `--text-secondary` | `#787774` | Pinyin line, section labels |
| `--text-muted` | `#9B9A96` | Timestamps, counts, placeholder, hold-to-talk hint |
| `--text-inverse` | `#FFFFFF` | Text on `--ink` (mic button, primary button) |
| `--text-disabled` | `#B8B7B3` | Disabled control label |

### Interactive and mic

| Token | Hex | Use |
|---|---|---|
| `--action` | `#111111` | Primary button background, mic button at rest |
| `--action-hover` | `#333333` | Primary button / mic hover |
| `--mic-ring` | `#8FC7E8` | Voice-reactive ring stroke while holding |
| `--mic-ring-track` | `#E1F3FE` | Faint ring baseline when held, before signal |

### Semantic pastels (background + text pairs)

| State | `--*-bg` | `--*-text` | Use |
|---|---|---|---|
| Live (recording / AI active) | `--live-bg` `#E1F3FE` | `--live-text` `#1F6C9F` | Recording indicator, "thinking" dot, active-turn tick |
| Warn (correction) | `--warn-bg` `#FBF3DB` | `--warn-text` `#956400` | Correction inset (the above-HSK word marker also used this token, before it was removed) |
| OK (success) | `--ok-bg` `#EDF3EC` | `--ok-text` `#346538` | Level saved, sent confirmation |
| Error | `--err-bg` `#FDEBEC` | `--err-text` `#9F2F2D` | Mic denied, STT/TTS/DeepSeek failure, rate-limited, clip too long |

There is no separate "AI accent". AI turns are the hero content and
stay monochrome (serif, `--ink`). Pale-blue (`--live-*`) is the one
signal that the mic or the AI is active right now.

### Brand accent (narrow exception, added 2026-09-12)

| Token | Hex | Use |
|---|---|---|
| `--brand-accent` | `#FF6B6B` | Sourced from `app/icon.svg`'s panda mark. Decorative use is restricted to: the wordmark icon (top-left), and the "Easy Fix" tag inside the Native Polish Tip callout. |
| `--brand-accent-hover` | `#E85A5A` | Hover state, if `--brand-accent` is ever used on an interactive element. |
| `--brand-accent-text` | `#FFFFFF` | Text/icon color on top of `--brand-accent`. |

This is the one deliberate exception to "color is a scarce resource used
only for semantic state." It does not replace or loosen that rule
elsewhere — every semantic pastel above stays reserved for its state.
Do not spread `--brand-accent` to new elements (mic button, primary
buttons, etc.) without a fresh, explicit decision; it was scoped
narrowly on purpose.

## `:root` block

Define once in `app/globals.css`. Nothing else declares a color.

```css
:root {
  --canvas:#F7F6F3; --surface:#FFFFFF; --surface-inset:#FBF3DB;
  --surface-sunken:#F1F0EC; --scrim:rgba(17,17,17,.32);
  --border:#EAEAEA; --border-strong:#D8D7D3; --focus-ring:#1F6C9F;
  --ink:#111111; --text:#2F3437; --text-secondary:#787774;
  --text-muted:#9B9A96; --text-inverse:#FFFFFF; --text-disabled:#B8B7B3;
  --action:#111111; --action-hover:#333333;
  --mic-ring:#8FC7E8; --mic-ring-track:#E1F3FE;
  --live-bg:#E1F3FE; --live-text:#1F6C9F;
  --warn-bg:#FBF3DB; --warn-text:#956400;
  --ok-bg:#EDF3EC; --ok-text:#346538;
  --err-bg:#FDEBEC; --err-text:#9F2F2D;
  --font-serif:'Newsreader','Instrument Serif','Noto Serif SC',Georgia,serif;
  --font-sans:'Geist Sans','SF Pro Text','Helvetica Neue',system-ui,sans-serif;
  --font-mono:'Geist Mono','SF Mono','JetBrains Mono',ui-monospace,monospace;
  --brand-accent:#FF6B6B; --brand-accent-hover:#E85A5A; --brand-accent-text:#FFFFFF;
  --radius-sm:4px; --radius-md:8px; --radius-lg:12px; --radius-full:9999px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px;
}
```

## Typography

| Token | Stack | Weight / tracking / leading |
|---|---|---|
| `--font-serif` | `'Newsreader', 'Instrument Serif', 'Noto Serif SC', Georgia, serif` | 400; `letter-spacing: -0.02em`; `line-height: 1.15`. Chinese hero line only. `'Noto Serif SC'` guarantees Hanzi render in a serif. |
| `--font-sans` | `'Geist Sans', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif` | 400 / 500; `line-height: 1.6`. All UI, plus the English translation. |
| `--font-mono` | `'Geist Mono', 'SF Mono', 'JetBrains Mono', ui-monospace, monospace` | 400; `line-height: 1.5`. Pinyin, timestamps, counters. |

Load `Newsreader` and `Geist` / `Geist Mono` via `next/font`
(self-hosted, `display: swap`). No CDN font links.

### Type scale (root = 16px)

| Token | Size | Line | Applied to |
|---|---|---|---|
| `--text-hero` | `clamp(1.625rem, 4vw, 2rem)` | 1.15 | AI Chinese line |
| `--text-pinyin` | `0.9375rem` (15px) | 1.5 | Pinyin above the hero — `--font-mono`, `--text-secondary` |
| `--text-english` | `1rem` (16px) | 1.6 | English below the hero — `--text` |
| `--text-ui` | `0.9375rem` (15px) | 1.5 | Buttons, popover items, level picker |
| `--text-label` | `0.8125rem` (13px) | 1.4 | "You" / turn labels, section headers |
| `--text-meta` | `0.75rem` (12px) | 1.4 | Dates, turn counter — `--font-mono`, `--text-muted` |
| `--text-tag` | `0.6875rem` (11px) | 1 | HSK tag — uppercase, `letter-spacing: 0.05em` (the above-level chip also used this size, before it was removed) |

Body text is never `#000000`. The user's own transcribed turn uses
`--font-sans` at `--text-english` size in `--text` (it is not a hero).

## Border radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `4px` | Buttons, `<kbd>`, input, focus outline |
| `--radius-md` | `8px` | Turn cards, correction inset, popover |
| `--radius-lg` | `12px` | History panel, dialog container |
| `--radius-full` | `9999px` | Mic button, HSK tag — nothing else (the above-level chip also used this, before it was removed) |

## Spacing scale

Use only these steps (`--space-1` … `--space-16`, the 4px grid in the
`:root` block). Section rhythm on the one screen: `--space-8` between
turns, `--space-6` card padding, `--space-4` page side gutter (never
below `--space-4`).

## Elevation

No shadows on cards, buttons, popovers, or the mic button. Depth
comes from `1px solid var(--border)` and the `--canvas` / `--surface`
contrast. Two permitted exceptions:

- History panel and level dialog: `box-shadow: 0 2px 8px rgba(0,0,0,0.04)`.
- Fixed bottom bar: `backdrop-filter: blur(8px)` over
  `color-mix(in srgb, var(--surface) 80%, transparent)`, plus a
  `border-top: 1px solid var(--border)`.

## Component conventions

Radix primitives only (`@radix-ui/react-popover`,
`@radix-ui/react-dialog`, `@radix-ui/react-collapsible`). No component
library. Style every primitive with the tokens above.

### HSK level picker — Radix Popover

- Trigger: the HSK tag in the top-right corner. Pill
  (`--radius-full`), `--text-tag`, border `1px solid var(--border)`,
  label like `HSK 3`.
- Content: `--surface`, `1px solid var(--border-strong)`,
  `--radius-md`, `--space-2` padding, `sideOffset={8}`, aligned to
  the trigger's end. No shadow.
- Six rows, levels 1–6, `--text-ui`. The active level shows a
  Phosphor `Check` (bold) in `--live-text`. Row hover:
  `background: var(--surface-sunken)`.
- Selecting a level closes the popover, writes the setting, and shows
  a brief OK confirmation on the tag.

### History — Radix Dialog

- Full-height panel sliding from the right, `max-width: 420px`
  (full width below 480px). `--surface`, `--radius-lg` on the left
  corners, the `0 2px 8px` shadow, `--scrim` overlay behind.
- Header: title `History` at `--text-label`, a Phosphor `X` (bold)
  close button top-right.
- List: one row per past conversation, newest first, separated by
  `border-bottom: 1px solid var(--border)` — no boxes. Each row:
  date in `--text-meta` (`--font-mono`), then the first line of that
  conversation's opening turn in `--text` truncated to one line.
- Row hover: `background: var(--surface-sunken)`. Selecting a row
  loads that transcript read-only and closes the dialog.
- Empty state: centered `--text-muted` line, "No past conversations
  yet."

### Correction ("Native Polish Tip") — Radix Collapsible

- Sits under the user's turn. Collapsed by default.
- Trigger: a left-aligned button, `--text-label`, `--text-secondary`,
  with a Phosphor `CaretRight` (bold) that rotates to `CaretDown`
  when open. Label "Native Polish Tip" (renamed 2026-09-12, restyled
  from a mockup — same underlying mechanism, still driven by the single
  model-returned `correction` string, no diff/strikethrough view).
- Content: `--surface-inset` background, `--warn-text` text,
  `--radius-md`, `--space-3` padding, `--space-2` top margin. Leads with
  a small pill tag reading "Easy Fix" — `--brand-accent` background,
  `--brand-accent-text`, `--radius-full`, `--text-tag`-scale, uppercase.
- If the model returns no correction for a turn, render no trigger.

### Buttons

- Primary ("New conversation", sign-in CTA): `background: var(--action)`,
  `color: var(--text-inverse)`, `--radius-sm`, `--space-2` / `--space-4`
  padding, `--text-ui`, no shadow. Hover: `background: var(--action-hover)`.
  Active: `transform: scale(0.98)`.
- Ghost (icon buttons — history, close, replay, rate toggle):
  transparent background, `--ink` icon, `--space-2` hit padding,
  `--radius-sm`. Hover: `background: var(--surface-sunken)`.
- Disabled: `--text-disabled`, `cursor: not-allowed`, no hover.
- Focus (any button): `outline: 2px solid var(--focus-ring);
  outline-offset: 2px`.

### Mic button and ring

The mic button is the one deliberately expressive element in the UI.
Everywhere else, motion is near-invisible; here it is the point.
Still and quiet at rest, an audio-reactive waveform while held. Never
a glow, never color cycling, never rotation — the only hue is
`--mic-ring` on the `--canvas` / bottom-bar ground.

**Structure.** A `72px` circle, `--radius-full`,
`background: var(--action)`, a Phosphor `Microphone` (fill) glyph in
`--text-inverse` at `z-index: 2`. Centered in the fixed bottom bar,
shadowless. Directly behind it, at `z-index: 1`, a `164px` square
`<canvas>` (`inset: -46px`, `pointer-events: none`,
`aria-hidden="true"`) that draws the ring. Size the canvas backing
store to `164 * devicePixelRatio` (capped at 2) and `ctx.scale(dpr,
dpr)` so the stroke stays crisp.

**At rest.** No canvas drawing. A single static hairline ring via
`.mic::before` — `inset: -9px`, `1px solid var(--mic-ring-track)`,
`opacity: .6`. Structural, not animated. The canvas layer is
`opacity: 0`.

**On press (`pointerdown` / Space / Enter).**

- Button springs to `transform: scale(1.04)`
  (`.18s cubic-bezier(.16,1,.3,1)`); the glyph eases to `scale(.9)`;
  the `::before` hairline expands to `scale(1.15)` and fades to
  `opacity: 0`.
- The canvas layer transitions to `opacity: 1` over `.2s`.
- One acknowledgement ripple is emitted immediately.
- Request the microphone (`getUserMedia({ audio: true })`) and wire
  an `AnalyserNode` (`fftSize: 512`). If permission is denied, fall
  back to a synthetic signal (layered sines plus occasional random
  peaks) so the ring still animates — the prototype and any offline
  demo must not show a dead button.

**While held — the waveform.** One `requestAnimationFrame` loop,
drawing per frame into the cleared canvas:

- **Signal.** Read `getByteTimeDomainData`, compute RMS, scale to a
  `0–1` `level`. Smooth it toward the new sample by `level += (target
  - level) * 0.28` so it tracks the voice without jitter.
- **Blob.** A closed path of ~84 points around the circle. Each
  point's radius is `base (44) + wobble * (3 + level * 34) + level *
  12`, where `wobble` is the sum of three sine harmonics of the
  angle and time (`3×`, `5×`, `2×` frequencies, different phases and
  speeds). Stroke `--mic-ring`, `lineWidth: 2`, `globalAlpha: .9`.
  The mixed harmonics are what make it read as fluid and organic
  rather than a pulsing circle.
- **Ripples.** When `level` crosses ~`0.22` and ≥250ms since the
  last, push a ripple. Each expands from `base + 6` to `base + 40`
  over 900ms, `--mic-ring` stroke `lineWidth: 1.5`, alpha fading
  `(1 - age) * .3`. Remove when done.
- **Inner echo.** A faint circle at `base - 6 - level * 10`,
  `lineWidth: 1`, `globalAlpha` ~`.36`.

**On release.** `holding` goes false but the loop runs ~260ms more
with `level` easing to `0` and the blob alpha fading via
`(fadeUntil - now) / 260` — the waveform collapses inward instead of
snapping off. Then the canvas is cleared and the rAF loop stops.
Stop the media stream. If the clip is longer than 60s or larger than
1MB, reject locally, show an error state (see below), make no upload.
A press shorter than ~320ms is treated as a mis-tap: no turn, the
hint reads "Hold longer to talk" for ~1.4s.

**Reduced motion (`prefers-reduced-motion: reduce`).** Drop the
harmonic wobble (blob stays circular) and the ripples. The ring still
swells with `level` (radius `base + level * 22`) — that is functional
feedback, not decoration, and stays.

**Performance.** Animate only the canvas and `transform` / `opacity`
on the button. One rAF loop, and only while held or fading. Read the
stroke color once from `getComputedStyle` — do not query it per
frame.

**Hint.** Below the button: `--text-meta`, `--text-muted`. "Hold to
talk" at rest, "Listening…" while held.

### Display Support control (added 2026-09-12, converted to a popover same day)

- A single trigger pill (`components/DisplaySupportToggle.tsx`, "Display:
  {mode}") in the top-left corner cluster, opening a Radix Popover listing
  all 4 options — same pattern as `HskPicker` (trigger pill, `Check` glyph
  on the active row, click-to-select-and-close). Originally shipped as a
  4-way always-visible segmented row; converted to a popover the same day
  after it crowded the header at narrow widths.
- Options: "All (Hanzi + Pinyin + English)" (the default), "Hanzi + Pinyin",
  "Hanzi Only", "Audio Challenge" (hides all three text lines — replay
  button and per-message speed row still show).
- A global, `localStorage`-backed preference (`display_support` key,
  `useSyncExternalStore`, same pattern as `hsk_level`/`zh_only_mode`),
  applying live to every already-rendered AI turn, not just future ones.
  Does not affect the correction disclosure, which renders independently
  of this mode.

### Type/talk toggle

- A ghost icon button, Phosphor `Keyboard` (bold), sits at the left end of
  the fixed bottom bar, before the speaking-rate toggle. Same ghost-button
  treatment as the replay/history/close icons.
- Default state is talk (mic). Tapping the toggle swaps the bottom bar's
  center content: the mic circle is replaced by a single-line text input
  (`--surface`, `1px solid var(--border)`, `--radius-sm`, `--text-ui`,
  placeholder "用中文写一句话…") plus a ghost `PaperPlaneTilt` send button,
  sized to match the mic button's footprint in the bar. Tapping the icon
  again (now a Phosphor `Microphone`) swaps back to the mic.
- The typed message goes through the exact same `send()` pipeline as a
  transcribed voice message — same turn shape, same HSK level, same 500-char
  cap, same disabled state at the 25-turn cap.
- No mode persists across reloads; the screen always opens in talk mode.
- Motion: the swap crossfades (`opacity`, `160ms`) — no layout-shifting
  slide, since both modes occupy the same bar position.

### Tags and badges

- HSK tag: pill, `--text-tag`, uppercase, `1px solid var(--border)`,
  `--space-1` / `--space-2` padding, `--ink` text on `--surface`.
- Above-level word marker: **removed** — built (inline, `--warn-bg`
  background, `--warn-text`, `--radius-sm`, leading Phosphor `Warning`
  glyph) and then dropped by the user for inaccuracy before shipping (see
  `progress-tracker.md`). No such marker exists in the current UI.

### `<kbd>`

`background: var(--surface-sunken)`, `1px solid var(--border)`,
`--radius-sm`, `--font-mono`, `--text-meta`. Used only in the dev
typed-input harness, never in the shipped UI.

### Error and status states

No toast library. A single status line region above the bottom bar:

- Error: `--err-bg` background, `--err-text` text, `--radius-md`,
  `--space-3` padding, one sentence plus a retry affordance where the
  action is retryable (transcription, DeepSeek, TTS). Covers: mic
  permission denied, clip too long / large, transcription failure,
  DeepSeek timeout, TTS failure, offline, rate-limited ("slow down"),
  text over 500 characters.
- OK: `--ok-bg` / `--ok-text`, same shape, auto-dismiss after ~2s
  (level saved, "sent").
- Live: `--live-bg` / `--live-text` with a small pulsing dot while the
  turn is in flight (upload → STT → DeepSeek → TTS).

Every failure path shows one of these — never a blank screen or an
unhandled throw.

## Layout structure

The app is one route (`/`) plus the Clerk sign-in screen. No sidebar,
no navbar, no footer, no other pages.

### Conversation screen

```
+-----------------------------------------------+
|  ·                [HSK 3] [History] [Account] |  corner controls
|                                               |
|              +---------------------+          |
|              |  ni hao             |          |  transcript column
|              |  你好                |          |  centered, max-width
|              |  Hello              |          |  ~640px
|              |  > Correction        |          |
|              +---------------------+          |
|                        ...                    |
|                                               |
+-----------------------------------------------+
| [kbd]              ( o mic )              [ + ] |  fixed bottom bar
+-----------------------------------------------+
```

- **Corner controls** (top): absolutely positioned, `--space-4` from
  the top and sides. Left: the `app/icon.svg` mark (24px) next to the
  `hao.AI` wordmark (serif), then the Display Support toggle, then the
  `A-`/`A+` text-scale pair, then the zh-only toggle. Right: HSK tag, then the
  history icon button, then Clerk's `<UserButton />` (sign-out) as the
  outermost control, `--space-2` apart (Unit 6 decision, 2026-09-11).
- **Transcript column**: vertically scrolling, `max-width: 640px`,
  centered, `--space-4` side gutter, `--space-16` bottom padding so
  the last turn clears the bottom bar. Auto-scrolls to the newest
  turn on append.
- **Turn**: AI turn = pinyin / Chinese hero / English stacked (lines shown
  per the Display Support toggle), a ghost `SpeakerHigh` replay button plus
  the per-message speed row beneath it, aligned to the turn's start. User turn =
  one `--font-sans` line in `--text` labelled `You` (`--text-label`),
  with the Collapsible correction beneath.
- **Fixed bottom bar**: `position: fixed; inset-inline: 0; bottom: 0`,
  blurred `--surface`, `border-top: 1px solid var(--border)`,
  `--space-3` block padding, `--space-4` side gutter. Left: the
  type/talk toggle icon only (the speaking-rate switcher that used to sit
  here was moved per-message, see below — 2026-09-12). Center: mic
  button, or the typed-input row when in typed mode (see
  "Type/talk toggle"). Right: "New conversation" — icon-only Phosphor
  `Plus` ghost button below 480px, text button above.
- **Per-message speaking rate** (moved out of the bottom bar 2026-09-12):
  each AI turn gets its own `0.75x` / `1x` / `1.5x` row, right-aligned
  under that turn's replay button — three small buttons, `--text-meta`
  scale, active one filled `--border-strong` + bold, same active-segment
  treatment as elsewhere. Defaults to `1x` per turn; selecting a rate
  only affects that turn's next playback, not other turns or a global
  default.
- **25-turn cap**: at 25 turns the mic button is disabled and the
  status line reads "This conversation is full — start a new one."

### Sign-in

Two-panel shell (`components/auth/AuthShell.tsx`), `--surface` card,
`1px solid var(--border)`, `--radius-lg`, `max-width: 960px`, centered
on `--canvas`. Left panel (hidden below `768px`): a decorative
animated backdrop plus the `app/icon.svg` mark and `hao.AI` serif
wordmark, centered. Right panel: a serif heading, a sans subheading,
then Clerk's `<SignIn>` (`components/auth/clerk-appearance.ts` strips
Clerk's own card chrome/header and maps its `variables` to hao.AI's
own tokens). Sign-up is open — anyone can create an account; there is
no allowlist or "no access" state after signing in.

**Narrow exception (2026-09-14), scoped to `/sign-in` only:** the left
panel's backdrop uses blurred, drifting gradient blobs
(`--brand-accent`, `--mic-ring`, `filter: blur()`) and a CSS-only
sparkle-particle layer — otherwise-banned decoration (`Banned` list:
"no gradients, neon, glassmorphism"), approved by the user as a
deliberate one-screen exception, mirroring how the mic ring is "the
one deliberately expressive element" elsewhere. Both animations
respect `prefers-reduced-motion: reduce` (drop to a static backdrop).
Colors are drawn from tokens that already exist (`--brand-accent`,
`--mic-ring`) — no new hex values were introduced. The `0 2px 8px`
shadow ceiling, previously limited to the History panel/level dialog/
turn cards, extends to the auth shell card. Do not spread this
treatment to the conversation screen without a fresh decision.

## Iconography

Phosphor Icons (`@phosphor-icons/react`), **bold** weight everywhere
except the mic glyph which is **fill**. No other icon set. Standard
size `20px` for controls, `16px` inline.

| Icon | Where |
|---|---|
| `Microphone` (fill) | Mic button |
| `Keyboard` | Type/talk toggle (talk mode) |
| `PaperPlaneTilt` | Send button (typed mode) |
| `ClockCounterClockwise` | History trigger |
| `X` | Dialog close |
| `Check` | Active HSK level row |
| `CaretRight` / `CaretDown` | Correction disclosure |
| `SpeakerHigh` | Per-turn audio replay |
| `Plus` | New conversation |

`Warning` (above-level word marker) is no longer used — that feature was
removed before shipping.

No emoji as icons, in copy, or in alt text.

## Motion

Subtle, `transform` / `opacity` only, no layout-animating properties.

| Element | Motion |
|---|---|
| New turn appended | fade + `translateY(8px)` -> settle, `300ms`, `cubic-bezier(0.16, 1, 0.3, 1)` |
| Transcript auto-scroll | `scrollIntoView({ behavior: 'smooth', block: 'end' })` |
| Mic press | button `scale(1.04)`, glyph `scale(.9)`, rest hairline expands + fades, `.18s cubic-bezier(.16,1,.3,1)`; one acknowledgement ripple |
| Mic ring while held | canvas rAF loop: harmonic-wobble blob + peak ripples + inner echo, radius driven by smoothed `AnalyserNode` RMS; `--mic-ring` only, no glow / color / rotation |
| Mic release | ~260ms inward collapse — `level` eases to 0, blob alpha fades, then loop stops and canvas clears |
| Correction disclosure | Radix Collapsible height transition, `200ms ease` |
| History dialog | slide-in from right `translateX(100%)` -> `0`, `240ms`, `cubic-bezier(0.16, 1, 0.3, 1)`; overlay fades |
| Button `:active` | `transform: scale(0.98)` |
| Status line | fade in `160ms`; OK variant auto-fades out after ~2s |

Respect `prefers-reduced-motion: reduce` — drop the translate/slide,
keep opacity only, keep the mic ring (it is functional feedback).

## Responsive

- Works from `400px` to desktop. Side gutter never below `--space-4`
  (16px). No horizontal scroll at any width.
- Transcript column is fluid up to `640px`, then centered.
- Below `480px`: history panel is full-width; "New conversation"
  collapses to the `Plus` icon button; hero uses the low end of the
  `clamp`.
- Bottom bar is always fixed and full-width; the transcript reserves
  bottom padding equal to the bar height plus `--space-8`.
