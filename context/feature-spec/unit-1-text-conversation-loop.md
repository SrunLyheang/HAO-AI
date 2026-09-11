# Feature Spec — Unit 1: Text Conversation Loop (dev harness)

> Derived from `context/feature-spec/build-spec.md` Unit 1. Backend-focused
> half of the unit ("make it work"); a thin typed UI rides on top so the loop
> is verifiable in a browser. HSK is hardcoded. No auth, no DB, no rate
> limiting, no voice — those are later units.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Type a Chinese sentence in the browser → `POST /api/chat` → DeepSeek returns
`{ reply_zh, reply_en, correction }` → the route computes pinyin with
`pinyin-pro` → the page appends an AI turn showing pinyin + Chinese + English
with an expand/collapse correction, and malformed model output degrades to an
error instead of crashing.

## Why this is its own step (`ai-workflow-rules.md` §3)

- It crosses a trust boundary: first real provider API key
  (`DEEPSEEK_API_KEY`) and the first route that spends money. The route +
  its validation/retry logic + tests land as one reviewable step.
- It has a "make it work, then wire the UI" seam. The route + `lib` modules +
  types are the core; the typed harness page is deliberately minimal and
  disposable (Unit 5 replaces it).
- The biggest *quality* unknown in the whole project — HSK-constrained
  structured output and deterministic pinyin correctness — is proved here with
  the cheapest possible harness before voice is layered on.

## In scope

### 1. Types (`types/`)

Add the shared shapes this unit needs. `architecture.md` names `Turn`,
`Conversation`, `ChatResponse`, `Settings`; only the first three are relevant
now and only partially.

- `ChatResponse` — exactly the model's contract:
  ```ts
  type ChatResponse = {
    reply_zh: string;   // non-empty
    reply_en: string;   // non-empty
    correction: string; // "" when the user's input needs no correction
  };
  ```
  No `pinyin`, no `above_level_words` — pinyin is added by the route after
  validation (Unit 1), above-level flagging is Unit 2.
- `Turn` — what the UI renders. Superset of `ChatResponse` for AI turns:
  ```ts
  type Turn =
    | { role: "user"; text_zh: string }
    | { role: "ai"; text_zh: string; pinyin: string; text_en: string; correction: string };
  ```
  `id` / `created_at` / `conversation_id` are **not** added now — no
  persistence until Unit 7. Keep the type minimal; widen it in Unit 7.
- Put these in `types/index.ts` (single file until it needs splitting).

### 2. `lib/pinyin.ts` (server-only)

- Wraps `pinyin-pro`. Single export:
  ```ts
  export function toPinyin(hanzi: string): string
  ```
- Tone marks (not tone numbers), space-separated syllables, non-Han
  characters (punctuation, digits, spaces) passed through unchanged.
- Deterministic, no network, no model involvement (`architecture.md`
  invariant 5).

### 3. `lib/deepseek.ts` (server-only)

- The **only** module that reads `DEEPSEEK_API_KEY` (`architecture.md`
  folder-ownership + invariant 1).
- Single export, e.g.:
  ```ts
  export async function callDeepSeek(messages: {role: string; content: string}[]): Promise<string>
  ```
  Returns the raw assistant message content (a JSON string). Does **not**
  parse or validate — that's the route's job (`code-standards.md`
  §API Routes: validate at the boundary).
- Plain `fetch` POST to the DeepSeek chat-completions endpoint (it is
  OpenAI-compatible). No SDK dependency — see Open Questions #1.
- Request: `response_format: { type: "json_object" }`, `temperature` low
  (~0.3), model + base URL from env (Open Questions #2).
- On non-2xx or network failure: `throw` with a message that does **not**
  include the key. The route turns this into a 500/502.
- No retry here — the route owns the single retry (`code-standards.md`
  §TypeScript: "On malformed JSON, retry once, then return 502").

### 4. `app/api/chat/route.ts` (POST only)

Handler order (the subset of `code-standards.md` §Next.js route order that
exists at Unit 1 — `requireUser()` and rate-limit are Units 6/9):

1. **Parse + validate body.** Expected:
   `{ history: Turn[]; message: string }` where `message` is the new user
   text. Reject non-POST with 405, unparseable / wrong-shape body with
   `400 { error }`.
2. **Input cap.** `message.length > 500` → `400 { error: "Message too long" }`,
   no provider call. (Invariant 6 names the 500-char text cap; it is a
   two-line guard and belongs wherever text enters — pulling it in now, not
   deferring to Unit 9.) Also cap `history` length defensively (e.g. ≤ 50
   turns) → 400.
3. **Assemble messages.** System prompt (see below, HSK hardcoded to 3) +
   the `history` turns mapped to `{role, content}` (`user` → `user`, `ai` →
   `assistant` using `text_zh`) + the new `{role: "user", content: message}`.
   System prompt is a fixed string constant in this file for Unit 1; it
   moves to `lib/hsk.ts` / `lib/prompt.ts` in Unit 2 when the word list is
   injected. No per-turn interpolation into the system string (invariant 8).
4. **Call DeepSeek** via `lib/deepseek.ts`.
5. **Parse + validate** the returned string against `ChatResponse`:
   `JSON.parse` in a try/catch; then explicit field checks
   (`reply_zh` / `reply_en` are non-empty strings, `correction` is a string).
   No casting `unknown` to the type (`code-standards.md` §TypeScript).
6. **On invalid** (parse threw *or* shape check failed): call DeepSeek
   **once** more with an appended
   `{role: "user", content: "Return only the JSON object described."}`
   nudge. Validate again. Second failure → `502 { error: "Bad model response" }`,
   nothing rendered as a turn.
7. **Compute pinyin** — `toPinyin(parsed.reply_zh)`.
8. **Respond** `200` with:
   ```ts
   { role: "ai", text_zh, pinyin, text_en, correction }
   ```
   No persistence (Unit 7). No `usage_log` (Unit 9).

Failure response shape is `{ error: string }` with the status codes above,
consistent across branches (`code-standards.md` §Next.js). No key, no raw
upstream body, no stack in the response or logs.

### 5. `app/page.tsx` — typed dev harness (Client Component)

Replaces the Unit 0a placeholder. Intentionally plain — **not** the
minimalist-ui screen (that's Unit 5).

- `"use client"`. Local `useState` for `history: Turn[]`, `input: string`,
  `pending: boolean`, `error: string | null`.
- A seeded AI opening turn (hardcoded constant, e.g.
  `你好！今天想聊什么？` with its pinyin/English also hardcoded in the
  constant so the page needs no server call to first paint). Matches the
  product's "greeting already present" behavior without needing Unit 7's
  server seeding.
- `<textarea>` + Send button. Disabled while `pending`.
- On send: optimistically append `{role:"user", text_zh: input}`, POST to
  `/api/chat` with `{ history, message }`, append the returned AI turn, or
  set `error` on non-2xx (show the `error` string inline, keep the user
  turn, allow retry).
- Transcript render: map `history`. Each AI turn = three stacked lines
  (pinyin muted/small, Chinese larger, English muted/small) + a correction
  disclosure when `correction !== ""`.
- **Correction disclosure:** native `<details><summary>` toggle. No Radix
  yet — Radix `Collapsible` arrives with the real UI in Unit 5. (Keeps a
  throwaway harness dependency-free.)
- Styling: a handful of Tailwind utilities for legibility only. No design
  tokens, no `globals.css` changes, no fonts, no Phosphor.
- **Rendering safety (invariant 7):** every model string rendered as JSX
  text children only. No `dangerouslySetInnerHTML` anywhere.

### 6. `.env.example`

- Remove the Unit 0b `APP_ENV_CHECK` probe line (its own comment says
  "remove in Unit 1").
- Append:
  ```
  # --- Unit 1: DeepSeek (server-only, never NEXT_PUBLIC_) ---
  DEEPSEEK_API_KEY=
  DEEPSEEK_BASE_URL=https://api.deepseek.com
  DEEPSEEK_MODEL=deepseek-chat
  ```
  Placeholders only. Real values go in `.env.local` locally and in Vercel
  later.

### 7. Dependencies

- **`pinyin-pro`** — pre-approved (named in `build-spec.md` and
  `architecture.md`). `npm install pinyin-pro`, runtime dep.
- **Test runner** — see Open Questions #3. Nothing else.
- **No** DeepSeek SDK, **no** Radix, **no** zod (hand-written validation is
  ~10 lines and `code-standards.md` allows "manual checks or a schema").

## Out of scope (explicitly — do not build now)

- `requireUser()`, Clerk, `middleware.ts` (Unit 6).
- Any database, Drizzle schema, migration, persistence, turn IDs,
  `conversations` / `turns` tables (Unit 7).
- HSK word-list bundling, cumulative-list injection, prompt caching, the
  "⚠ above level" marker, the corner level picker (Unit 2). HSK stays a
  hardcoded `3` in the system prompt string.
- Rate limiting, `usage_log`, per-minute / per-day caps (Unit 9).
- Voice input / STT / MediaRecorder (Unit 3).
- Voice output / TTS / `<audio>` (Unit 4).
- minimalist-ui layout, design tokens, Newsreader / Geist fonts, Phosphor
  icons, mic button, backdrop-blur bar, 400px responsive polish (Unit 5).
- Radix primitives, `lib/hsk.ts`, `lib/prompt.ts`, `lib/openai.ts`,
  `lib/azure-tts.ts` (later units).
- Moving the harness behind a dev flag / to `app/dev/` — that's a Unit 5
  follow-up (listed below). For Unit 1 it is simply `app/page.tsx`.
- Streaming responses.

## Files touched

| File | Change |
|------|--------|
| `types/index.ts` | new — `ChatResponse`, `Turn` |
| `lib/pinyin.ts` | new — `toPinyin()` |
| `lib/deepseek.ts` | new — `callDeepSeek()` |
| `app/api/chat/route.ts` | new — POST handler |
| `app/page.tsx` | rewrite — typed harness (was the placeholder) |
| `.env.example` | edit — drop probe var, add 3 DeepSeek vars |
| `package.json` / lock | `pinyin-pro` + chosen test runner |
| `test/pinyin.test.ts` | new |
| `test/chat-validation.test.ts` | new |
| `README.md` | 2–3 lines: set `DEEPSEEK_*` in `.env.local` to run the loop |

Count: 4 new source files + 1 rewrite + config. Above the "~3 files" guide in
`ai-workflow-rules.md` §3, but it is one indivisible loop (types → lib →
route → harness) with no green intermediate smaller than "the loop works".
Called out here for reviewer awareness.

## API contract

**`POST /api/chat`**

Request body:
```json
{
  "history": [
    { "role": "ai", "text_zh": "你好！今天想聊什么？", "pinyin": "nǐ hǎo ...", "text_en": "Hi! ...", "correction": "" }
  ],
  "message": "我今天很累"
}
```

Success `200`:
```json
{
  "role": "ai",
  "text_zh": "为什么累呢？",
  "pinyin": "wèi shén me lèi ne？",
  "text_en": "Why are you tired?",
  "correction": ""
}
```

Errors: `400 {"error":"..."}` (bad body / message > 500 chars / history too
long), `405` (non-POST), `502 {"error":"Bad model response"}` (invalid JSON
twice), `500 {"error":"..."}` (DeepSeek unreachable / key missing).

## System prompt (Unit 1, HSK hardcoded)

Fixed constant in `app/api/chat/route.ts`. Intent (exact wording is the
implementer's, keep it firm and short):

- Role: a friendly Chinese conversation tutor.
- Keep replies short (1–2 sentences), natural, spoken-style Mandarin.
- Restrict vocabulary and grammar to roughly **HSK level 3**. (No word list
  injected yet — that's Unit 2. Level 3 is the hardcoded default from
  `build-spec.md`'s "HSK 3" tag.)
- Always reply with a single JSON object and nothing else:
  `{"reply_zh": "...", "reply_en": "...", "correction": "..."}`.
  - `reply_zh`: your spoken reply in Chinese characters.
  - `reply_en`: a natural English translation of `reply_zh`.
  - `correction`: if the user's most recent Chinese has grammar / wording
    mistakes, a one-line correction with the improved sentence; otherwise an
    empty string `""`.
- Do not include pinyin (the app generates it).

## Tests (`test/`)

No auth-rejection test yet (no auth until Unit 6). Unit 1 tests cover the
non-trivial logic: pinyin correctness, model-output validation, input cap.

### `test/pinyin.test.ts` — `toPinyin()` (heteronym done-criterion)

| Input | Expected reading of the tricky char |
|-------|-------------------------------------|
| `还是` | 还 = `hái` |
| `我把书还给你` | 还 = `huán` |
| `我得走了` | 得 = `děi` |
| `跑得快` | 得 = `de` |
| `很长` | 长 = `cháng` |
| `长大` | 长 = `zhǎng` |
| `银行` | 行 = `háng` |
| `不行` | 行 = `xíng` |
| `你好，世界！` | Han → pinyin, `，！` passed through unchanged |

These assert `pinyin-pro`'s context disambiguation actually fires. If a row
fails, `pinyin-pro` options need tuning (e.g. enable segmentation) — that
adjustment is in scope for Unit 1.

### `test/chat-validation.test.ts` — the route's parse / validate / retry

Extract the validator as a pure function (e.g.
`parseChatResponse(raw: string): ChatResponse | null`) so it is testable
without HTTP. Cases:

- Valid JSON, all fields present, `correction: ""` → returns the object.
- Valid JSON, `correction` a real string → returns the object.
- `reply_zh` missing → `null`.
- `reply_zh` empty string → `null`.
- `reply_en` is a number → `null`.
- Not JSON at all (`"sorry, here is..."`) → `null` (no throw escapes).
- JSON wrapped in markdown fences → decide and spec one behavior: strip
  fences before parse (recommended — models do this often) or return `null`.
  Test whichever is chosen.
- Extra unknown fields present → still returns a valid `ChatResponse`
  (ignore extras, don't reject).

Optionally one route-level test with `callDeepSeek` stubbed: first call
returns garbage, second returns valid → route responds `200`; both garbage →
route responds `502` with body `{error}`.

### Manual browser check (record in `progress-tracker.md`)

Hold a ~6-turn typed Chinese conversation. Confirm: every AI turn shows all
three lines; pinyin on a crafted turn containing 还 / 得 / 长 / 银行 reads
correctly; the correction line expands and collapses; a deliberately broken
call (e.g. bad key) shows an inline error, not a blank screen or a console
unhandled rejection.

## Done criteria (from `build-spec.md` Unit 1 + `ai-workflow-rules.md` §7)

1. In the browser you hold a typed Chinese conversation across ≥ 6 turns;
   each AI turn renders Chinese + pinyin + English + a working
   expand/collapse correction.
2. Pinyin for 还 / 得 / 长 / 银行 is contextually correct
   (`test/pinyin.test.ts` green + spot-checked in the browser).
3. Malformed model output is caught: one retry, then a clean `502` and an
   inline error state — never a crash or unhandled rejection.
4. `message` over 500 characters is rejected server-side with `400` and no
   DeepSeek call.
5. `DEEPSEEK_API_KEY` is read only in `lib/deepseek.ts`, is not
   `NEXT_PUBLIC_`, and appears in no response body or log.
6. Pinyin is computed by `pinyin-pro` in `lib/pinyin.ts`; the model is never
   asked for pinyin and any pinyin-looking model output is ignored
   (invariant 5).
7. No `dangerouslySetInnerHTML`; model strings render as escaped text
   (invariant 7).
8. `npm run build` and `npm run lint` pass. `strict` still `true`; no `any`,
   `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
9. `npm test` (or chosen runner) runs both test files green.
10. Diff contains only Unit 1 scope — no DB, no auth, no Radix, no Unit 2
    HSK work, no voice.
11. `.env.example` updated (probe var removed, DeepSeek vars added);
    `architecture.md` still accurate — the chat route it describes is a
    superset of Unit 1's; note in the handback that its
    persistence / rate-limit lines are "later unit", not divergence.
12. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev        # hold a typed conversation, exercise heteronyms + correction toggle + error path
grep -R "NEXT_PUBLIC" . --include=*.ts --include=*.tsx || echo "none — expected"
grep -R "dangerouslySetInnerHTML" app components || echo "none — expected"
git status && git log --oneline -1
```

## Open questions (decide before implementation)

1. **DeepSeek client: plain `fetch` vs the `openai` SDK.**
   Recommendation: **`fetch`** — one POST, no dependency, DeepSeek's endpoint
   is OpenAI-compatible. Add the SDK later only if `transcribe` (Unit 3)
   wants it too.
2. **DeepSeek model id + base URL.** `build-spec.md` says "DeepSeek V4"; the
   API model string is likely `deepseek-chat`. Confirm the exact
   `DEEPSEEK_MODEL` value and base URL for your account. Recommendation:
   default `deepseek-chat` + `https://api.deepseek.com`, both overridable via
   env so a rename needs no code change.
3. **Test runner.** Nothing is installed. Recommendation: **`vitest`** —
   zero-config with TS + ESM, fast, `npm test` script, common with Next.
   Alternative: Node's built-in `node:test` + a `tsx` loader (no dep, more
   setup friction). The choice becomes the project's runner for every later
   unit (including the Unit 6 auth-rejection tests).
4. **`correction` convention.** Model returns `""` when nothing to correct
   (recommended — always a string, UI hides the disclosure on `""`) vs
   `null`. Affects the `ChatResponse` type and the validator.
5. **Seeded greeting in the harness.** Hardcode all three lines
   (zh / pinyin / en) as a constant in `app/page.tsx` (recommended — no
   server round-trip to first paint) vs call `/api/chat` once on mount with
   empty history. Server-seeded greeting proper is Unit 7.

## Follow-ups to hand back (do NOT start in Unit 1)

- Unit 2: bundle HSK 1–6 lists, move the system prompt to `lib/hsk.ts` /
  `lib/prompt.ts`, inject the cumulative list with a byte-stable prefix for
  prompt caching, add the "⚠ above level" marker and corner picker,
  `localStorage` persistence.
- Unit 5: relocate this harness behind a dev flag (e.g. `app/dev/page.tsx`
  gated on `process.env.NODE_ENV !== "production"`) so `app/page.tsx` becomes
  the real minimalist-ui screen; swap the native `<details>` correction for
  Radix `Collapsible`.
- Unit 6: add `requireUser()` as the first line of `/api/chat` + an
  auth rejection test for the route.
- Unit 7: persist the turn pair, add turn ids / `created_at`, widen `Turn`,
  server-seed the greeting.
- Unit 9: `usage_log` insert + per-minute / per-day rate check before the
  DeepSeek call; the 500-char cap added here stays.
