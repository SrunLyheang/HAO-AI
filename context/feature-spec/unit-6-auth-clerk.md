# Feature Spec — Unit 6: Auth (Clerk)

> Derived from `build-spec.md` Unit 6 and `architecture.md`'s "Auth and
> access model" section, which this unit exists to implement. Adds Clerk
> session gating in front of the Unit 1–5 conversation screen and its three
> API routes. Sign-up is left **open** — anyone can create a Clerk account,
> no allowlist (user decision, 2026-09-11: "I just want everyone to be able
> to sign up ... I feel like no one is going to use it anyway"). No
> database, no rate limiting, no history, no styling changes beyond the one
> new sign-in/sign-up route.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Add `@clerk/nextjs`, gate every route through `middleware.ts`, add
`lib/auth.ts` (`requireUser`, wrapping Clerk's `auth()`), call
`requireUser()` as the first statement in `app/api/{chat,transcribe,speak}`,
and add the Clerk sign-in/sign-up route — any authenticated user can use the
app, no allowlist, no "no access" view.

## Why this is its own step (`ai-workflow-rules.md` §3.3)

- "The unit crosses a trust boundary — anything involving auth,
  `requireUser()`, rate limiting, input caps, or a provider API key. Land the
  guard and its test as its own step before the feature that depends on it."
  This unit *is* that guard, for every route that exists so far.
- `ai-workflow-rules.md` §5.7 singles out `middleware.ts` and `lib/auth.ts`
  as security-sensitive and says changes to them must be flagged
  prominently for review — this spec is that flag, up front.
- Touches three route handlers plus `middleware.ts` and `layout.tsx` — past
  the "roughly three files" threshold in §3.1.

## In scope

### 1. `package.json` (edit)

- Add `@clerk/nextjs` (the only new dependency; already named in
  `architecture.md`'s stack table as the auth provider — not a new
  decision).

### 2. `.env.example` (edit)

Append, matching the existing per-unit comment convention:

```
# --- Unit 6: Clerk auth (server-only except the publishable key) ---
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the one intentional exception to
  "never `NEXT_PUBLIC_*`" — it is Clerk's publishable key, designed to be
  client-visible (used to boot `<ClerkProvider>` in the browser). It is not
  a secret; `CLERK_SECRET_KEY` is, and stays server-only.
- No `ALLOWLIST` variable — sign-up is open, there is nothing to gate.

### 3. `middleware.ts` (new, repo root)

- `clerkMiddleware()` from `@clerk/nextjs/server`, per
  `architecture.md`: "everything requires a session except static assets and
  `/sign-in`."
- Matcher config follows Clerk's documented Next.js App Router pattern:
  protect everything except `_next` internals and static file extensions,
  and always run on `/api/*` and the sign-in route's own segment.
- No authorization logic here — this only proves "is there a Clerk
  session", which is now also the *only* check the app makes.

### 4. `lib/auth.ts` (new)

```ts
import { auth } from "@clerk/nextjs/server";

export class AuthError extends Error {
  constructor(public status: 401, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new AuthError(401, "Unauthenticated");
  return userId;
}
```

- Returns the Clerk `userId` so callers have it ready for Unit 7's
  `db/queries.ts` scoping, without this unit needing any DB code itself.
- Only checks session presence — no allowlist step. `status` is narrowed to
  the single `401` case (no `403` branch exists in this unit).
- Throws rather than returning a `Response` so every route handler's
  `catch` block returns it the same shape as its other error branches
  (matching `code-standards.md`'s "same shape for the same condition
  across all routes").

### 5. `app/api/chat/route.ts`, `app/api/transcribe/route.ts`, `app/api/speak/route.ts` (edit)

Each handler's `POST` gets one new first line, before the existing
`req.json()` / `req.formData()` call:

```ts
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
  // ...existing body-parsing, validation, and provider-call logic, unchanged
}
```

- No other line in any of the three routes changes. `code-standards.md`'s
  route order ("`requireUser()` → parse and validate input → check size
  caps → check rate limit → provider/DB work → shape and return response")
  is now satisfied for the first step; rate limiting is still Unit 9.
- The `try/catch` shape is identical across all three routes — copy it, do
  not vary it per route.

### 6. `app/layout.tsx` (edit)

- Wrap the existing `<html>`/`<body>` tree in `<ClerkProvider>` from
  `@clerk/nextjs`. No other change — the `next/font` variables and
  `metadata` export from Unit 5 stay as they are.

### 7. `app/sign-in/[[...sign-in]]/page.tsx` (new)

- Matches the folder `architecture.md` already names for this. Renders
  Clerk's `<SignIn>` centered on `--canvas`, `max-width: 400px`, no custom
  chrome, per `ui-context.md`'s "Sign-in" section. Clerk's own hosted
  component includes its sign-up flow (email/Google) since the Clerk
  application is configured for open sign-up (Prerequisites #2) — no
  separate `/sign-up` route or "invite only" messaging is needed.

### 8. `app/page.tsx` — no split needed

Unlike the allowlisted design this spec originally drafted, `page.tsx` does
**not** need a server-side authorization check of its own: `middleware.ts`
already redirects any unauthenticated page request to `/sign-in`, and once
signed in there is no further gate to check (no allowlist, no "no access"
view). `app/page.tsx` stays exactly as Unit 5 left it — no move to
`components/ConversationScreen.tsx`, no new Server Component wrapper.

- Render Clerk's `<UserButton />` for sign-out in the top-right corner
  group, **right of the history icon** (the outermost position — resolved
  2026-09-11, see "Resolved" below).

### 9. `.gitignore` / secrets

- No change needed — `.env*` is already git-ignored per Unit 0a. Confirm
  `.env.local` (where the real Clerk keys go for local dev) is not tracked.

## Out of scope (explicitly — do not build now)

- Any database work. `db/`, `settings`, `conversations`, `turns` do not
  exist until Unit 7 — `requireUser()` returns a `userId` but nothing
  persists or queries it yet.
- Rate limiting, `usage_log`, spend guards (Unit 9). `lib/ratelimit.ts` is
  not created in this unit. With open sign-up this is the primary defense
  against cost abuse, so treat Unit 9 as higher priority to land soon after
  this one, not as something to fold in here (`ai-workflow-rules.md` §2.2:
  build what the current unit needs, not more).
- History panel, "new conversation" behavior — both remain disabled per
  Unit 5's resolved Open Questions #1/#2; this unit does not touch them.
- Any styling, token, or layout change beyond the one new sign-in/sign-up
  page.
- Any allowlist, invite code, waitlist, or admin-approval mechanism — sign-
  up is unrestricted by explicit user decision.
- Removing Vercel Deployment Protection — that is a dashboard action for the
  user, listed in `build-spec.md`'s Unit 6 done criteria and in
  Prerequisites below, not something this unit's code touches.

## Prerequisites (user, dashboard — cannot be done from code, `ai-workflow-rules.md` §5.4)

1. Create a Clerk application (or use an existing one), copy the
   publishable key and secret key into `.env.local`.
2. In the Clerk dashboard, leave public sign-up **enabled** (the default) —
   no allowlist, invite-only mode, or restricted sign-up to configure.
3. After this unit is verified working, remove Vercel Deployment Protection
   (per `build-spec.md`'s Unit 6 done criteria — Clerk now covers the
   open-URL gap it was standing in for since Unit 0a).

## Files touched

| File | Change |
|------|--------|
| `package.json` | edit — add `@clerk/nextjs` |
| `.env.example` | edit — Clerk publishable/secret key |
| `middleware.ts` | new — `clerkMiddleware()`, protects all routes except static assets and `/sign-in` |
| `lib/auth.ts` | new — `requireUser()`, `AuthError` |
| `app/api/chat/route.ts` | edit — `requireUser()` as first statement |
| `app/api/transcribe/route.ts` | edit — `requireUser()` as first statement |
| `app/api/speak/route.ts` | edit — `requireUser()` as first statement |
| `app/layout.tsx` | edit — wrap tree in `<ClerkProvider>` |
| `app/sign-in/[[...sign-in]]/page.tsx` | new — centered Clerk `<SignIn>` (sign-up included) |

## Tests (`test/`)

### `test/auth-guard.test.ts` (new, one per API route)

`ai-workflow-rules.md` §7.5: "there is a test proving an unauthenticated ...
request is rejected before any provider or database call." Mock
`@clerk/nextjs/server`'s `auth` with `vi.mock`, and spy on each route's
provider entry point (`callDeepSeek`, the Groq client call, the ElevenLabs
client call) to assert it is never invoked:

- For each of `app/api/chat`, `app/api/transcribe`, `app/api/speak`:
  - `auth` mocked to return `{ userId: null }` → `POST` returns `401` and
    the route's provider function is not called.
- No non-allowlisted / `403` case — there is no allowlist to test.
- This is the first place the repo mocks a module in a test; keep the
  mocking pattern identical across all three route tests (same `vi.mock`
  shape) so it reads as one convention, not three.

### Manual browser check (record in `progress-tracker.md`)

Sign out (or use a private window): confirm `/` redirects to `/sign-in` and
the Clerk form renders centered, no custom chrome, and offers both sign-in
and sign-up. Create a brand-new account: confirm it succeeds with no
allowlist rejection and the full conversation screen renders and works
exactly as it did at the end of Unit 5 (hold to talk, typed mode, HSK
picker, replay, correction disclosure). Confirm `/sign-in` itself does not
require a session (no redirect loop).

## Done criteria (`build-spec.md` Unit 6)

1. "Signed-out users see only the sign-in/sign-up screen." — verified
   manually (private window → `/` redirects to `/sign-in`).
2. "An unauthenticated request is rejected by every API route (verified by
   test)." — `test/auth-guard.test.ts` covers all three routes with the
   `401` case.
3. "You (or anyone) can sign up and use the app normally." — verified
   manually by creating a fresh account and running the full Unit 1–5 flow
   unchanged.
4. "Public sign-up is left on in the Clerk dashboard — no allowlist gate." —
   user-confirmed dashboard state (Prerequisites #2), not code; stated
   explicitly at handback.
5. `npm run build` and `npm run lint` pass. `strict` stays `true`; no `any`,
   `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` added.
6. `npm test` green, including the new `auth-guard` suite and every prior
   test file unchanged.
7. No secret (`CLERK_SECRET_KEY`) reaches the client bundle or a response
   body — verified by grepping `app/` and `components/` for
   `CLERK_SECRET_KEY` (should find nothing) and confirming only
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` appears in any client-reachable file.
8. Diff contains only Unit 6 scope: no DB, no rate limiting, no history
   behavior, no styling changes beyond the sign-in page, no allowlist
   mechanism of any kind.
9. `architecture.md`'s "Auth and access model" section now matches the code
   exactly (it already describes this unit's target state, so this is a
   confirmation, not an edit) — noted at handback per
   `ai-workflow-rules.md` §6.3.
10. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # manual check: signed-out redirect, fresh sign-up, full flow
grep -R "CLERK_SECRET_KEY" app components --include=*.tsx --include=*.ts || echo "none — expected"
git status && git log --oneline -1
```

## Open questions

Resolved (user decision, 2026-09-11):

1. **`<UserButton />` placement.** Neither `ui-context.md` nor
   `project-overview.md` said where the sign-out control lives on the
   conversation screen (`project-overview.md` only said it exists). Settled:
   Clerk's `<UserButton />` sits in the top-right corner group, **right of**
   the (currently disabled) history icon — the outermost position, matching
   the usual top-right "account menu" convention. `ui-context.md`'s corner-
   controls layout needs the one-line addition when this unit implements.

## Follow-ups to hand back (do NOT start in Unit 6)

- Unit 7: `db/queries.ts` functions take the `userId` that `requireUser()`
  now returns and scope every query by it — no change needed in `lib/auth.ts`
  itself, callers just start using its return value for more than logging.
- **Unit 9 matters more with open sign-up.** With no allowlist, per-user
  rate limiting and the provider billing caps are the only things standing
  between an open sign-up flow and runaway cost. Recommend not leaving a
  long gap between shipping this unit and shipping Unit 9.
- No further sign-in-screen styling work expected — Clerk's hosted
  component is used as-is per `ui-context.md`.
