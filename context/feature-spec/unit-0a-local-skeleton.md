# Feature Spec — Unit 0a: Local Next.js Skeleton

> Derived from `build-spec.md` Unit 0 ("Skeleton + deploy pipeline"), split into
> **0a (this doc)** — a local app that builds — and **0b** — the deploy pipeline.
> Build 0a first, then 0b. Do not start Unit 1 until both meet their criteria.

## One sentence

Stand up a strict-TypeScript Next.js App Router project with the folder skeleton
from `architecture.md`, one placeholder page, and a green `npm run build` — no
features, no providers, no auth.

## Why this is its own step

- `create-next-app` output is many files; getting it stripped to the house
  layout is a discrete, verifiable piece of work.
- 0b depends on a repo that already builds locally; proving that here keeps the
  first deploy from debugging two things at once.
- Nothing here crosses a trust boundary, so it can land in one commit.

## In scope

1. **Project scaffold** via `create-next-app`:
   - TypeScript, `strict: true` (keep the generated `tsconfig.json` strict; do
     not loosen it).
   - App Router (`app/`), **no `src/` dir** — everything at repo root per
     `architecture.md` File Organization.
   - Tailwind CSS enabled.
   - ESLint enabled (the generated `next/core-web-vitals` config is fine).
   - Import alias `@/*`.
   - npm as the package manager (`package-lock.json`, not pnpm/yarn).
2. **Strip boilerplate** to the minimum:
   - `app/layout.tsx` — root layout, plain `<html lang="en"><body>`, metadata
     title `hao.AI`. Fonts wired later (Unit 5); do not add Geist/Newsreader now.
   - `app/page.tsx` — a **Server Component** rendering a single static line
     (e.g. `hao.AI — coming soon`). No client component, no state, no styling
     beyond a Tailwind class or two.
   - `app/globals.css` — keep the Tailwind directives; delete the
     `create-next-app` demo CSS variables and starter rules. Design tokens are
     added in Unit 5, not now.
   - Delete `public/*.svg` starter assets and any `app/page.module.css`.
3. **Folder skeleton** — create the directories `architecture.md` names, each
   with a one-line `README.md` or a `.gitkeep` so it commits, **but no code**:
   `components/`, `lib/`, `db/`, `drizzle/`, `data/`, `types/`, `test/`.
   (`app/` and `app/api/` come from the scaffold; `middleware.ts` is Unit 6.)
   Do **not** pre-create `app/api/transcribe` etc. — those are their own units.
4. **`.gitignore`** — the `create-next-app` default already covers
   `node_modules/`, `.next/`, `.env*`. Confirm `.env` and `.env*.local` are
   ignored; add them if missing.
5. **`.env.example`** — created with no secrets, only commented placeholder keys
   the later units will need. At 0a it may contain just a header comment; real
   vars are appended by the unit that introduces them. Never put a real value
   here.
6. **`git init`** and a first commit containing the scaffold + this skeleton.
   (Repo already contains `CLAUDE.md` and `context/` — leave both untouched.)
7. **`README.md`** at repo root — 5–10 lines: what the app is (one line, point
   at `context/project-overview.md`), how to run it (`npm install`,
   `npm run dev`), how to build (`npm run build`). Expanded in Unit 10.

## Out of scope (explicitly)

- Any provider SDK, API route, database, Drizzle schema, or `.env` wiring to a
  real service.
- Clerk, `middleware.ts`, `requireUser()`, allowlist.
- Design tokens, fonts, Phosphor icons, minimalist-ui layout (Unit 5).
- The typed dev harness (Unit 1).
- Vercel, GitHub remote, deployment (Unit 0b).
- Tests beyond confirming the build runs — there is no non-trivial logic yet.

## Files touched

`package.json`, `package-lock.json`, `tsconfig.json`, `next.config.*`,
`postcss.config.*`, `tailwind.config.*` (if generated), `.eslintrc.*` /
`eslint.config.*`, `.gitignore`, `.env.example`, `README.md`,
`app/layout.tsx`, `app/page.tsx`, `app/globals.css`, and the empty skeleton
dirs. This is more than three files, but all of it is scaffold + deletion with
no logic — the "roughly three files" rule in `ai-workflow-rules.md` §3 targets
hand-written feature code.

## Done criteria

1. `npm install` completes with no errors.
2. `npm run build` completes with **zero** errors and zero TypeScript errors.
   `strict` is still `true` in `tsconfig.json`; no `any`, `@ts-ignore`,
   `@ts-expect-error`, or `eslint-disable` was added to get there.
3. `npm run dev` serves `http://localhost:3000` and the page shows the single
   placeholder line — no Next.js starter content, no console errors in the
   browser.
4. `npm run lint` passes.
5. The repo root contains the folder skeleton from `architecture.md`
   (`components/`, `lib/`, `db/`, `drizzle/`, `data/`, `types/`, `test/`), each
   committed (via `.gitkeep` or a stub `README.md`), and **no** stray starter
   files (`app/page.module.css`, demo SVGs, demo CSS vars) remain.
6. `git log` shows one commit; `git status` is clean; `.env` and `.env*.local`
   are git-ignored; `.env.example` contains no real secret.
7. `context/` and the existing `CLAUDE.md` product content are unchanged by this
   unit (the `## Agent skills` block added by project setup is a separate,
   already-agreed edit).

## Verification (run these, do not assume)

```
npm install
npm run build
npm run lint
npm run dev   # then open localhost:3000, eyeball the page + console
git status
git log --oneline
grep -R "NEXT_PUBLIC" . --include=*.ts --include=*.tsx || echo "none — expected"
```

## Follow-ups to hand back (do not start)

- Unit 0b: GitHub repo + Vercel project + `git push` deploy + env round-trip
  proof + Vercel Deployment Protection.
