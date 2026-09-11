# Feature Spec — Unit 2: HSK Level Control

> Derived from `build-spec.md` Unit 2. Builds on Unit 1's typed loop: the
> system prompt's HSK level stops being hardcoded, a picker lets the user
> choose it, and above-level words in the AI's reply are marked.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

A corner-ish level picker (1–6, persisted to `localStorage`) drives the
`/api/chat` request; the route builds a byte-stable system prompt containing
the cumulative HSK 1–N word list for that level, and any word in the AI's
reply that isn't in that list is flagged and shown to the user.

## Why this is its own step (`ai-workflow-rules.md` §3)

- It changes the `/api/chat` request contract (adds a required `hskLevel`
  field) — the route and the harness page must land together, not
  independently.
- It introduces real bundled data (`data/`) and a non-trivial matching
  algorithm (the above-level check), which needs its own tests.
- It must preserve `architecture.md` invariant 8 (the system-prompt prefix is
  byte-identical across turns for a given level) — care needed, verifiable.

## Data source (verified, not guessed)

`drkameleon/complete-hsk-vocabulary` (MIT license, confirmed via `LICENSE`),
specifically `wordlists/inclusive/old/{1..6}.min.json` — the **old** 6-level
HSK standard (matches `build-spec.md`'s "HSK 1–6"), **inclusive** meaning each
file already IS the cumulative list up to that level (level 6's file is the
whole old-standard vocabulary). No union logic needed at runtime.

Confirmed word counts (`inclusive/old/{n}.min.json` array length):

| Level | Cumulative word count |
|-------|-----------------------|
| 1 | 150 |
| 2 | 297 |
| 3 | 595 |
| 4 | 1193 |
| 5 | 2491 |
| 6 | 4991 |

Each array entry is an object; only the `s` field (simplified form, e.g.
`"爱"`, `"爸爸"`) is needed. Longest entries are 4-character chengyu (e.g.
`爱不释手`); nothing in the dataset is longer than 4 characters — confirmed by
checking the length distribution of `inclusive/old/6.min.json` (696×1-char,
4033×2-char, 143×3-char, 119×4-char, 0 longer).

### `data/hsk-words.json` (new, static, read-only)

One file, not six — fewer files, one static import, matches
`architecture.md`'s `data/` folder note ("Static bundled HSK 1–6 word lists
as JSON ... read-only at runtime"):

```json
{
  "1": ["爱", "八", "爸爸", "..."],
  "2": ["...cumulative through level 2..."],
  "3": ["..."],
  "4": ["..."],
  "5": ["..."],
  "6": ["...all ~4991..."]
}
```
Built once by extracting the `s` field from each of the six
`inclusive/old/{n}.min.json` files (a one-off transform during
implementation, not a runtime fetch — `data/` is static per
`code-standards.md` §File Organization). MIT license / attribution note goes
in this spec (here) and as a header comment in `lib/hsk.ts` (JSON has no
comments).

## In scope

### 1. `types/index.ts` (edit)

- `export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6;`
- Extend the `ai` variant of `Turn` with `aboveLevelWords: string[]`:
  ```ts
  export type Turn =
    | { role: "user"; text_zh: string }
    | {
        role: "ai";
        text_zh: string;
        pinyin: string;
        text_en: string;
        correction: string;
        aboveLevelWords: string[]; // NEW — words not in the selected HSK level
      };
  ```

### 2. `lib/hsk.ts` (new)

Pure word-list domain logic — no Next.js imports, no request handling
(`architecture.md`: `lib/hsk.ts` "loads and slices the word lists").

- `HSK_LEVELS: readonly HskLevel[] = [1, 2, 3, 4, 5, 6]`
- `isValidHskLevel(n: unknown): n is HskLevel` — `typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6`.
- `getCumulativeWordSet(level: HskLevel): Set<string>` — direct lookup into
  the statically-imported `data/hsk-words.json` (already cumulative, no
  union). Built once per level at module load (six `Set`s, cheap — max 4991
  entries) and reused; no per-request recomputation.
- `getWordListText(level: HskLevel): string` — the level's array joined with
  `"、"` (Chinese comma) in the JSON file's original order. **Deterministic**:
  same level → byte-identical string every call, because the source order
  never changes (needed for invariant 8 / prompt caching).
- `flagAboveLevel(replyZh: string, level: HskLevel): string[]` — see
  algorithm below. Dedups, preserves first-occurrence order.

#### The above-level algorithm (why not `pinyin-pro`'s `segment()`)

Verified `pinyin-pro`'s `segment()` is **not** a general Chinese word
segmenter — it only groups a small built-in set of disambiguation phrases
(觉得/记得/非得 come back as one token; 今天/这样/什么/一贯 all come back
character-by-character). Using it here would either (a) flag real HSK1
characters as "words" that happen to combine into a higher-level word
(missed positives — e.g. 马上 "immediately": both characters are
individually basic, but the word itself may be a higher level), or (b) need
a new segmentation dependency.

Instead, tokenize using the HSK dictionary **itself** as the word list —
forward maximum matching, a well-known simple algorithm, no dependency:

```ts
const MAX_WORD_LEN = 4; // longest entry in the dataset

function tokenizeHanRun(run: string, dict: Set<string>): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < run.length) {
    let matchLen = 1; // fallback: the single character itself
    for (let len = Math.min(MAX_WORD_LEN, run.length - i); len >= 2; len--) {
      if (dict.has(run.slice(i, i + len))) { matchLen = len; break; }
    }
    tokens.push(run.slice(i, i + matchLen));
    i += matchLen;
  }
  return tokens;
}
```

`flagAboveLevel`:
1. Split `replyZh` into alternating Han / non-Han runs
   (`/[一-鿿]+|[^一-鿿]+/g`); ignore non-Han runs entirely
   (punctuation, digits, Latin — never flagged).
2. Tokenize each Han run against the **full** dictionary
   (`getCumulativeWordSet(6)` — the complete old-standard vocabulary, used
   purely as the segmentation reference).
3. Keep tokens not present in `getCumulativeWordSet(level)` (the *selected*
   level's cumulative set).
4. Dedup preserving first-occurrence order; return.

A token that matches nothing in the full dictionary even at length 1 (a
genuinely unknown character — rare) is conservatively treated as above-level,
which is the desired behavior.

**ponytail:** forward-max-matching over the HSK dictionary, not a real
segmenter — it can occasionally over- or under-match at multi-word
boundaries the dictionary doesn't cover explicitly. Upgrade path: swap in a
real segmenter (e.g. `jieba`-style) if false positives/negatives become a
practical problem; not needed at this app's scale (2–3 users).

### 3. `app/api/chat/prompt.ts` (new)

Lives in the `app/api/chat/` folder — `architecture.md` assigns "building the
system prompt" to this folder, not to `lib/`; a separate file (not inline in
`route.ts`) because Next.js route modules may only export recognized HTTP
handlers, the same reason `validate.ts` exists.

```ts
export function buildSystemPrompt(level: HskLevel): string
```
Generalizes the current `route.ts` constant (already refined since Unit 1 to
correct only the newest message, never repeat a past correction) —
keep that behavior, just parameterize the level and append the word list:
```
You are a friendly Chinese conversation tutor.
Reply in short (1-2 sentence), natural, spoken-style Mandarin.
Restrict your vocabulary and grammar to HSK level {level}. Only use words
from this list (plus basic grammar particles): {word list}
Always reply with a single JSON object and nothing else:
{"reply_zh": "...", "reply_en": "...", "correction": "..."}
- reply_zh: your spoken reply in Chinese characters.
- reply_en: a natural English translation of reply_zh.
- correction: look ONLY at the single newest user message (the last "user"
  turn you were given, i.e. what you are replying to right now). If that
  exact message has a grammar or wording mistake, put one short line with
  the improved sentence; otherwise "". Never repeat a correction you already
  gave in an earlier turn — earlier user messages were already handled and
  must not be corrected again.
Do not include pinyin.
```
Byte-identical for a given `level` across every call (invariant 8) — no
per-turn interpolation. Changing `level` deliberately (via the picker) does
change the prefix and so does *not* hit the previous prompt cache from that
point on — expected and acceptable; the invariant is about not defeating the
cache with incidental per-turn noise, not about levels being immutable.

### 4. `app/api/chat/validate.ts` (edit)

Move the currently-private `parseRequest` out of `route.ts` into this file as
an exported `parseChatRequest`, extended with `hskLevel`:

```ts
export type ChatRequest = { history: Turn[]; message: string; hskLevel: HskLevel };
export function parseChatRequest(body: unknown): ChatRequest | null
```
Same shape checks as Unit 1, plus: `hskLevel` required,
`isValidHskLevel(body.hskLevel)` must be true. This mirrors why
`parseChatResponse` already lives here — testable without HTTP, and the
route stays an orchestrator.

### 5. `app/api/chat/route.ts` (edit)

- Import `parseChatRequest` (instead of the local `parseRequest`),
  `buildSystemPrompt`, `flagAboveLevel`.
- Build messages as `[{role:"system", content: buildSystemPrompt(hskLevel)}, ...history, ...]`.
- After a valid `reply` is obtained (Unit 1's parse/retry/502 logic
  unchanged), compute
  `aboveLevelWords = flagAboveLevel(reply.reply_zh, parsed.hskLevel)`.
- Response `AiTurn` gains `aboveLevelWords`.
- No other behavior changes (500-char cap, history cap, retry-once, error
  shapes all as Unit 1 left them).

### 6. `app/page.tsx` (edit)

- New state: `hskLevel: HskLevel`, initialized to `3` (matches the current
  hardcoded default) so server-rendered and first-client-render markup match
  (no hydration mismatch).
- `useEffect` on mount: read `localStorage.getItem("hsk_level")`; if it's a
  valid level string, `setHskLevel` to it. (Client-only — `localStorage`
  doesn't exist during SSR; reading it in an effect, not during render, is
  what avoids the mismatch.)
- Header row gains a level control next to the existing title, e.g.:
  ```tsx
  <select
    value={hskLevel}
    onChange={(e) => {
      const level = Number(e.target.value) as HskLevel;
      setHskLevel(level);
      localStorage.setItem("hsk_level", String(level));
    }}
    className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
  >
    {[1, 2, 3, 4, 5, 6].map((n) => (
      <option key={n} value={n}>HSK {n}</option>
    ))}
  </select>
  ```
  This is the functional "corner picker" `build-spec.md` names for Unit 2 —
  plain `<select>`, not yet the Radix `Popover` + minimalist-ui corner tag
  (Unit 5 restyles the whole screen).
- Send `hskLevel` in the `/api/chat` POST body.
- Render `aboveLevelWords` under the English line when non-empty, e.g.
  `⚠ above level: 一贯、不妨`. No inline highlighting inside `text_zh` yet
  (avoids the complexity of splitting a rendered string around possibly
  overlapping substrings) — a below-line list satisfies "words ... render
  with the marker." Inline highlighting can be revisited in Unit 5.
- The hardcoded `GREETING` constant keeps `aboveLevelWords: []` — it's a
  static harness constant, not model output, so it is never run through
  `flagAboveLevel`.

## Out of scope (explicitly)

- Persisting `hsk_level` to Postgres / the `settings` table (Unit 7).
  `localStorage` is the only store, exactly as `build-spec.md` says
  ("localStorage for now") and `architecture.md`'s cache table already
  documents.
- Radix `Popover`, the minimalist-ui corner-tag visual design, inline
  highlighting of above-level words inside the Chinese text (Unit 5).
- Auth, rate limiting, voice (Units 3/4/6/9).
- A general-purpose Chinese segmenter dependency — the dictionary
  max-matching approach is deliberately dependency-free (see ponytail note
  above); revisit only if it proves inadequate.
- Confirming an actual DeepSeek prompt-cache hit is code — it's a manual
  verification step (see Verification), not a shipped feature.

## Files touched

| File | Change |
|------|--------|
| `data/hsk-words.json` | new — bundled cumulative word lists, levels 1–6 |
| `types/index.ts` | edit — `HskLevel`, `Turn`'s ai variant gains `aboveLevelWords` |
| `lib/hsk.ts` | new — `getCumulativeWordSet`, `getWordListText`, `flagAboveLevel`, `isValidHskLevel` |
| `app/api/chat/prompt.ts` | new — `buildSystemPrompt(level)` |
| `app/api/chat/validate.ts` | edit — export `parseChatRequest` (moved from route.ts, adds `hskLevel`) |
| `app/api/chat/route.ts` | edit — use the above three; response includes `aboveLevelWords` |
| `app/page.tsx` | edit — level `<select>`, `localStorage`, send `hskLevel`, render marker line |
| `test/hsk.test.ts` | new |
| `test/chat-validation.test.ts` | edit — add `parseChatRequest` cases |

## API contract changes

**`POST /api/chat`** request body gains a required field:
```json
{ "history": [...], "message": "...", "hskLevel": 3 }
```
Missing / non-integer / out-of-1–6-range `hskLevel` → `400 { "error": "Malformed request" }` (reuses the existing malformed-body branch — no new error shape).

Success `200` response gains a field:
```json
{
  "role": "ai",
  "text_zh": "...", "pinyin": "...", "text_en": "...", "correction": "",
  "aboveLevelWords": ["一贯"]
}
```

## Tests

### `test/hsk.test.ts`

- `getCumulativeWordSet(n).size` equals the confirmed counts (150, 297, 595,
  1193, 2491, 4991) for `n` = 1..6.
- Level N's set is a subset of level N+1's set (cumulative, monotonic
  growth) for each adjacent pair.
- `getWordListText(3)` called twice returns the identical string (byte
  equality) — the invariant-8 building block.
- `getWordListText(1) !== getWordListText(5)` (levels actually differ).
- `isValidHskLevel`: `1`..`6` → true; `0`, `7`, `3.5`, `"3"`, `null`,
  `undefined` → false.
- `flagAboveLevel`:
  - an all-HSK1 sentence (e.g. `"你好，我很好，谢谢。"`) at level 1 → `[]`.
  - a sentence containing a confirmed HSK6-only word (e.g. `"他一贯很认真"`,
    where `一贯` is HSK6-only per the verified dataset) at level 1 → array
    contains `"一贯"` — this is the case that would fail under naive
    character-by-character checking (both 一 and 贯 individually might read
    as "known enough") and proves the dictionary max-match works.
  - the same sentence at level 6 → `[]` (一贯 is within HSK1–6).
  - punctuation/digits in the input never appear in the returned array.
  - a repeated above-level word appears once in the output (dedup).

### `test/chat-validation.test.ts` (additions)

- `parseChatRequest` with a valid `hskLevel` (1 and 6, boundary values) →
  returns the parsed request.
- Missing `hskLevel` → `null`.
- `hskLevel: 0`, `7`, `3.5`, `"3"` → `null`.
- Existing `history`/`message` cases from Unit 1 still pass unchanged
  (regression check on the moved function).

### Manual browser check

Set the picker to HSK 1, send a message, note the AI's reply is noticeably
simpler than at HSK 5 with the same input. Confirm the picker survives a
page reload (persisted via `localStorage`). Trigger a reply likely to
contain harder vocabulary at HSK 1 (e.g. ask about a specific hobby) and
confirm the `⚠ above level` line appears with a plausible word.

### Manual: prompt-cache hit (not shippable code, verification only)

Temporarily log DeepSeek's response `usage` object (has
`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` in the OpenAI-
compatible response shape) for two consecutive turns at the same HSK level in
one conversation; confirm the second turn shows a non-zero cache-hit count.
Remove the temporary log before committing — `code-standards.md` forbids
`console.log` in a committed change.

## Done criteria (`build-spec.md` Unit 2 + `ai-workflow-rules.md` §7)

1. Setting HSK 1 vs HSK 5 visibly changes vocabulary difficulty in replies
   (manual check).
2. Picker choice survives reload (`localStorage`, manual check).
3. Words outside the selected level's list render with the `⚠ above level`
   marker (manual check + `test/hsk.test.ts`).
4. Repeated turns don't re-bill the full word list — prompt cache hit
   confirmed via the temporary `usage` log (manual check, not committed
   code).
5. `getWordListText` and therefore `buildSystemPrompt` are byte-identical
   across calls for the same level (invariant 8) — `test/hsk.test.ts`.
6. `npm run build` and `npm run lint` pass; `strict` stays `true`, no `any`
   / `@ts-ignore` / `eslint-disable` added.
7. `npm test` green, including the new `hsk.test.ts` and the extended
   `chat-validation.test.ts`.
8. Invalid `hskLevel` is rejected with `400` before any DeepSeek call
   (route-level, covered by `parseChatRequest` tests + one curl check).
9. No new secret, no new `NEXT_PUBLIC_` var, `data/hsk-words.json` contains
   no user data (it's a static public word list).
10. Diff contains only Unit 2 scope — no DB, no auth, no Radix, no voice.
11. `architecture.md` needs **no changes** — `data/`, `lib/hsk.ts`, and the
    `app/api/chat/` folder's responsibilities are already documented exactly
    as this unit implements them. Confirm this at handback (no silent
    drift).
12. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # picker HSK1 vs HSK5, reload persistence, above-level marker
curl -s -w " [%{http_code}]\n" -XPOST localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"history":[],"message":"你好","hskLevel":7}'   # expect 400
git status && git log --oneline -1
```

## Open questions

None blocking — the data source, format, and algorithm were verified
directly (license, file structure, word counts, `segment()` behavior) rather
than assumed, so there's nothing left to guess at. Flag during review if a
different data source or a real segmenter dependency is preferred over the
dictionary max-match approach.

## Follow-ups to hand back (do NOT start in Unit 2)

- Unit 5: Radix `Popover` + minimalist-ui corner-tag styling for the level
  picker; inline highlighting of above-level words inside `text_zh` instead
  of a below-line list.
- Unit 7: persist `hsk_level` to the `settings` table; remove the
  `localStorage` fallback per `architecture.md`'s cache table note ("removed
  at Unit 7").
- Note for later: the harness's hardcoded `GREETING` constant contains 聊
  ("to chat"), which is not in HSK1 — harmless now (it bypasses
  `flagAboveLevel` entirely, being static, not model output) but worth
  remembering when Unit 7 replaces it with a real server-seeded,
  level-aware greeting.
