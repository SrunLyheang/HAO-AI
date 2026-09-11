# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Unit 1 (Text conversation loop, dev harness) — DONE. Starting Unit 2 (HSK
  level control).

## Current Goal

- Unit 2: bundle HSK 1–6 word lists, inject the cumulative list per level into
  the system prompt with prompt caching, corner level picker, "⚠ above level"
  marker, selection persisted to `localStorage`.

## Completed

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

- None. Starting Unit 2.

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
- Unit 2: HSK level control — next up.

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
