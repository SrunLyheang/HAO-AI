# Feature Spec — Unit 7b: Settings Persistence (HSK level)

> Part 2 of 3 for `build-spec.md` Unit 7 ("Persistence"). Depends on 7a
> (schema + Neon client must exist and apply cleanly) and on Unit 6
> (`requireUser()` must exist — this unit's route calls it as its first
> statement). Moves the HSK level setting from `localStorage` to Postgres,
> per `build-spec.md` Unit 7: "HSK setting moves localStorage → DB."
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Add `getSettings`/`upsertHskLevel` to `db/queries.ts`, a new
`app/api/settings/route.ts` (`GET`/`PATCH`, `requireUser()` first), and wire
`app/page.tsx`'s `HskPicker` to read/write through it instead of
`localStorage`.

## Why this is its own step

- `ai-workflow-rules.md` §3.1: a new API route plus a new `db/queries.ts`
  file plus a component change is more than the "roughly three files"
  threshold together with 7a/7c, so it stands alone.
- §3.3: this unit's route crosses the trust boundary again (a new place
  `requireUser()` is called) — worth its own verification pass separate
  from 7c's larger conversation-persistence change.

## Decisions made in the grilling session that produced this spec (2026-09-14)

1. **New `app/api/settings/route.ts`, not folded into `/api/chat`.**
   `architecture.md`'s and `code-standards.md`'s route lists do not mention
   a settings route — this is a genuine addition beyond what those
   documents currently specify, which `ai-workflow-rules.md` §2.6 requires
   stopping to ask about before building. Asked; user approved a dedicated
   route over overloading `/api/chat`'s request/response shape with a field
   unrelated to a chat turn. This spec's doc-edit list below updates both
   documents in the same change per §6.2 ("update in the same change, not
   later").
2. **No `speaking_rate` persistence.** `architecture.md`'s `settings` row
   lists `speaking_rate`, but the live app has no single per-user rate
   setting anymore (see 7a's "Deviation" note) — only `hsk_level` is
   persisted. `architecture.md`'s row is corrected in this unit (see below).

## In scope

### 1. `db/queries.ts` (new file — first functions in it)

```ts
export async function getSettings(userId: string): Promise<{ hskLevel: HskLevel }> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  return { hskLevel: (row?.hskLevel as HskLevel) ?? 3 };
}

export async function upsertHskLevel(userId: string, hskLevel: HskLevel): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, hskLevel, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { hskLevel, updatedAt: new Date() },
    });
}
```

- Default `3` when no row exists — matches the existing client-side default
  (`project-overview.md`/current `HskPicker` behavior), so a brand-new user
  sees the same starting level as before this unit.
- Both functions take `userId` and scope by it, per `architecture.md`
  invariant 3 and `code-standards.md`'s "every function in `db/queries.ts`
  requiring `userId`."

### 2. `types/index.ts` (edit)

Add:

```ts
export type Settings = { hskLevel: HskLevel };
```

Matches `code-standards.md`'s shared-types list, which already names
`Settings` as an expected type.

### 3. `app/api/settings/route.ts` (new)

```ts
export async function GET() {
  const userId = await requireUser(); // throws AuthError -> 401, same shape as other routes
  const settings = await getSettings(userId);
  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const userId = await requireUser();
  const body = await req.json();
  // validate: hskLevel present, integer, 1-6 — reuse isValidHskLevel from lib/hsk.ts
  if (!isValidHskLevel(body.hskLevel)) {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
  await upsertHskLevel(userId, body.hskLevel);
  return NextResponse.json({ hskLevel: body.hskLevel });
}
```

- Route order matches `code-standards.md`: `requireUser()` → parse/validate
  → DB work → response. No provider call, no rate limit needed here (rate
  limiting in `code-standards.md` is scoped to `transcribe`/`chat` only).
- Reuses `lib/hsk.ts`'s existing `isValidHskLevel` — no new validation
  logic duplicated.

### 4. `app/page.tsx` (edit)

- Replace `hskLevelPreference` (the `localStorage`-backed
  `createPersistedPreference` instance from
  `components/preference-store.ts`) with a fetch to `GET /api/settings` on
  initial load and a `PATCH /api/settings` call when `HskPicker` changes
  the level. The existing `HskPicker` component's props/behavior do not
  change — only what backs the value does.
- No other control migrates off `localStorage`: `zh_only_mode`,
  `display_support`, and `text_scale` remain client-only preferences
  (`project-overview.md`: "HSK level is the only persistent learning
  state").

### 5. `context/architecture.md` (edit — doc correction, per `ai-workflow-rules.md` §6.2)

- `settings` table row: remove `speaking_rate` column, update its note to
  reflect only `hsk_level` is persisted.
- "System boundaries" folder table: add an `app/api/settings/` row
  ("Reading and writing the user's HSK level setting. No provider calls.").
- Cache table's "HSK setting fallback" row: mark it removed as of this
  unit (it already says "removed at Unit 7").

### 6. `context/code-standards.md` (edit — doc correction, same rule)

- "File Organization" section: add `app/api/settings/` to the route list
  next to `transcribe`/`chat`/`speak`/`conversations`.

## Out of scope (explicitly — do not build now)

- Conversation or turn persistence (7c).
- Removing `zh_only_mode`/`display_support`/`text_scale` from
  `localStorage` — those are not part of Unit 7's scope per
  `project-overview.md`.
- Any UI change to `HskPicker` itself — same component, same props, only
  its data source changes.
- Rate limiting on `/api/settings` — Unit 9's concern, and
  `code-standards.md` only requires rate limiting before
  `transcribe`/`chat` calls.

## Files touched

| File | Change |
|------|--------|
| `db/queries.ts` | new — `getSettings`, `upsertHskLevel` |
| `types/index.ts` | edit — add `Settings` |
| `app/api/settings/route.ts` | new — `GET`/`PATCH`, `requireUser()` first |
| `app/page.tsx` | edit — `HskPicker` backed by `/api/settings` instead of `localStorage` |
| `context/architecture.md` | edit — remove `speaking_rate`, add `app/api/settings/` row |
| `context/code-standards.md` | edit — add `app/api/settings/` to File Organization |

## Tests (`test/`)

### `test/settings-route.test.ts` (new)

Following Unit 6's mocking precedent (`vi.mock` on `@clerk/nextjs/server`'s
`auth`):

- `auth` mocked to return `{ userId: null }` → `GET` and `PATCH` both
  return `401`, and `getSettings`/`upsertHskLevel` are never called
  (mock `db/queries.ts` too, spy on both functions).
- `auth` mocked to return a real `userId` → `GET` returns `{ hskLevel: 3 }`
  when the mocked `getSettings` resolves that; `PATCH` with a valid level
  (1–6) calls `upsertHskLevel` with the right arguments and returns it;
  `PATCH` with `hskLevel: 7` or a missing field returns `400` before
  `upsertHskLevel` is called.

### `test/queries-settings.test.ts` (new)

Per Q5 of the grilling session: mock the Drizzle client (`db`) itself,
matching the Unit 6 precedent of mocking the one external dependency at the
boundary. Cases: `getSettings` returns the default `3` when the mocked
query resolves `undefined`; `getSettings` returns the row's value when one
exists; `upsertHskLevel` is called with the exact `userId` passed in
(proves the `user_id` scoping invariant at the query-builder level — it
does not catch a real cross-user leak at the SQL level, which is a known
gap noted in the grilling session, covered instead by the manual Neon check
below).

## Done criteria

1. Setting HSK level in the UI persists across a page reload (was already
   true via `localStorage`; now true via Postgres — verify by clearing
   `localStorage` and confirming the level still loads correctly).
2. "HSK setting set on one device shows on another" (`build-spec.md` Unit 7)
   — verify by changing the level in one browser profile and reloading in
   a different one signed in as the same Clerk user.
3. An unauthenticated request to `/api/settings` (`GET` or `PATCH`) returns
   `401` before any DB call — verified by `test/settings-route.test.ts`.
4. `npm run build` and `npm run lint` pass; `strict` stays `true`.
5. `npm test` green, including both new test files and every prior test
   file unchanged.
6. No secret reaches the client — `DATABASE_URL` never appears outside
   `db/`.
7. Diff contains only 7b scope: no conversation/turn code, no rate
   limiting, no `HskPicker` UI change.
8. `architecture.md` and `code-standards.md` now match the code exactly for
   the settings route and the corrected `settings` table — confirmed at
   handback per `ai-workflow-rules.md` §6.3.
9. Clean commit on `main`, no push.

## Verification commands

```
npm install
npm run build
npm run lint
npm test
npm run dev   # manual check: change HSK level, reload, confirm persistence; check across two browser profiles
grep -R "DATABASE_URL" app components --include=*.tsx --include=*.ts || echo "none — expected"
git status && git log --oneline -1
```

## Open questions

None — resolved in the grilling session that produced this spec
(2026-09-14): the new route, and dropping `speaking_rate`, were both
explicit user decisions (see "Decisions made" above).

## Follow-ups to hand back (do NOT start in 7b)

- 7c: conversation/turn persistence, server-side transcript load, greeting
  seeding, retention cap.
- Unit 8's `app/api/conversations/` route is unaffected by this unit's new
  `app/api/settings/` route — they are separate concerns.
