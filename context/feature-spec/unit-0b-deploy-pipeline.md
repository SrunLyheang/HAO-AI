# Feature Spec — Unit 0b: Deploy Pipeline

> Second half of `build-spec.md` Unit 0. Depends on **Unit 0a** (a local app that
> builds). When 0b's done criteria are met, Unit 0 is complete and Unit 1 may
> start.

## One sentence

Connect the repo to GitHub and Vercel so `git push` to `main` produces a live
URL, prove one server-only env var is readable on the server and absent from the
client bundle, and lock the dev URL behind Vercel Deployment Protection.

## Why this is its own step

- 0a is pure local code; 0b is almost entirely dashboard configuration
  (GitHub, Vercel) plus one tiny code proof. Different failure modes, different
  fix surface.
- The env-var-not-in-bundle check is a mild trust-boundary concern and deserves
  its own explicit verification (`ai-workflow-rules.md` §3.3).

## Prerequisites (user actions — the agent cannot do these)

The agent stops and gives exact steps; the user performs them:

1. Create an empty **GitHub repo** (private) and add it as the `origin` remote.
2. Create a **Vercel project** linked to that repo, framework preset "Next.js",
   production branch `main`.
3. In Vercel project settings, add one environment variable for the proof:
   - `APP_ENV_CHECK` = `server-only-ok` (Production **and** Preview).
   - It must **not** be prefixed `NEXT_PUBLIC_`.
4. Enable **Deployment Protection** (Vercel → Settings → Deployment Protection →
   "Vercel Authentication" or "Password Protection") for Preview **and**
   Production, so no unauthenticated visitor can load the site while auth does
   not exist yet (removed in Unit 6).

## In scope (agent code)

1. **`git remote add origin <url>`**, push `main`, confirm Vercel auto-builds.
2. **Env round-trip proof** — the smallest possible:
   - In `app/page.tsx` (still a Server Component), read
     `process.env.APP_ENV_CHECK` server-side and render a small confirmation
     (e.g. `env: ok` when it equals `server-only-ok`, `env: missing` otherwise).
   - This is temporary scaffolding for Unit 0 only. Mark it with a comment
     `// TODO(unit-1): remove env-check placeholder` so it is deleted when the
     real page content lands. `build-spec.md` says the harness/placeholder is
     removed once real UI replaces it.
   - Do **not** create an API route for this; a Server Component read is enough
     and avoids a route that would later need `requireUser()`.
3. **`.env.example`** — add `APP_ENV_CHECK=` with a comment explaining it is a
   throwaway Unit 0 probe, to be removed in Unit 1.
4. **`README.md`** — add a "Deploy" line: push to `main` → Vercel builds → live
   URL; note the dev URL is password-protected until Unit 6.

## Out of scope (explicitly)

- Any real provider key (OpenAI, DeepSeek, Azure, Clerk, Neon) — those arrive
  with their units.
- Clerk / `middleware.ts` / allowlist — Unit 6 removes Deployment Protection and
  replaces it with real auth.
- CI beyond Vercel's built-in build (no GitHub Actions).
- Preview-vs-production *value* differences beyond the single probe var
  (Unit 10 handles the real prod/preview split).
- Custom domain.

## Files touched

`app/page.tsx` (add temporary env read), `.env.example` (one line),
`README.md` (deploy note). Three files, all trivial.

## Done criteria (from `build-spec.md` Unit 0, plus the split)

1. **Push deploys.** A commit pushed to `main` triggers a Vercel build that
   succeeds and updates the production URL — verified by making a one-line
   change, pushing, and seeing it live.
2. **Env readable server-side.** The deployed page shows the `env: ok` state,
   proving `process.env.APP_ENV_CHECK` is available in the Server Component at
   runtime on Vercel.
3. **Env absent from client bundle.** After `npm run build`, `APP_ENV_CHECK`
   and its value `server-only-ok` do **not** appear anywhere in `.next/static/`
   (grep proves it). No `NEXT_PUBLIC_` variable exists.
4. **Dev URL protected.** Opening the Vercel URL in a fresh private window
   prompts for Vercel authentication / the protection password before any app
   content is shown, on both a preview deployment and production.
5. **Build still green.** `npm run build` and `npm run lint` pass locally and on
   Vercel; `tsconfig.json` still strict; no suppressions added.
6. **Repo clean.** `git status` clean, `origin` set, `main` pushed, `.env*`
   still git-ignored, no secret committed.

## Verification (run these, do not assume)

```
npm run build
grep -R "server-only-ok" .next/static/ && echo "LEAK — fail" || echo "not in client bundle — pass"
grep -R "APP_ENV_CHECK" .next/static/ && echo "name leaked — investigate" || echo "name not in client bundle"
git remote -v
git push origin main    # then watch the Vercel dashboard build
# open the production URL in a private window -> expect protection prompt
# after auth -> expect the page + "env: ok"
```

## Follow-ups to hand back (do not start)

- Unit 1: remove the `APP_ENV_CHECK` probe and the placeholder page; build the
  typed conversation harness (`/api/chat` → DeepSeek → structured JSON →
  transcript with pinyin).
- Set the OpenAI / Azure provider spending caps now if nervous about spend
  (`build-spec.md` says this is dashboard-only and order-independent).
