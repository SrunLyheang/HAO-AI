# Feature Spec — Unit 7a: DB Schema + Neon/Drizzle Setup

> Part 1 of 3 for `build-spec.md` Unit 7 ("Persistence"), split per
> `ai-workflow-rules.md` §3.1 (more than ~3 files) and §3.4 (a unit that
> changes the DB schema does the migration as its own step first). Derived
> from `architecture.md`'s "Storage model" and "System boundaries" sections.
> Pure foundation: defines the schema and wires up the Neon connection, but
> nothing in the app reads or writes through it yet — `npm run build` stays
> green with an unused (but present) `db/` layer.
>
> **Status: DRAFT for review. Do not implement until approved.**

## One sentence

Add `drizzle-orm` + `@neondatabase/serverless` + `drizzle-kit`, define
`settings`/`conversations`/`turns` in `db/schema.ts`, create the Neon client
in `db/index.ts`, generate the first migration, and add `DATABASE_URL` to
`.env.example` — no application code calls any of this yet.

## s

## Prerequisites (user, dashboard — cannot be done from code)

1. Create a Neon project (or use an existing one), copy its pooled connection
   string into `.env.local` as `DATABASE_URL`.

## In scope

### 1. `package.json` (edit)

- Add `drizzle-orm`, `@neondatabase/serverless` (runtime), `drizzle-kit`
  (dev dependency, matches `architecture.md`'s "ORM / migrations" row).

### 2. `.env.example` (edit)

```
# --- Unit 7a: Neon Postgres + Drizzle (server-only) ---
DATABASE_URL=
```

### 3. `db/schema.ts` (new)

Drizzle table definitions, exactly matching `architecture.md`'s storage
model table with one deliberate omission (see "Deviation from
`architecture.md`" below):

```ts
export const settings = pgTable("settings", {
  userId: text("user_id").primaryKey(),
  hskLevel: integer("hsk_level").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index("conversations_user_id_idx").on(t.userId),
  }),
);

export const turns = pgTable("turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  userId: text("user_id").notNull(),
  role: text("role", { enum: ["user", "ai"] }).notNull(),
  textZh: text("text_zh").notNull(),
  pinyin: text("pinyin"),
  textEn: text("text_en"),
  correction: text("correction"),
  correctionPinyin: text("correction_pinyin"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- No `usage_log` table — that is Unit 9's, per `architecture.md`'s own
  table list and `build-spec.md`'s unit boundary. Do not add it here.
- Column names are `snake_case` in Postgres, `camelCase` in the Drizzle
  definition — Drizzle's default mapping, no extra config needed.

**Deviation from `architecture.md` (flag for correction alongside 7b):**
`architecture.md`'s `settings` row currently also lists a `speaking_rate`
column. The live app (per `progress-tracker.md`, 2026-09-12) replaced the
single app-wide rate toggle with a per-message rate control
(`turnRates: Record<number, SpeakingRate>`, client-only React state) — there
is no longer a single per-user "speaking rate" to persist. This schema
omits the column. `architecture.md`'s `settings` row needs its
`speaking_rate` mention removed; do this edit in 7b (the step that actually
builds `settings` persistence), not here, since 7a touches no `context/`
file.

### 4. `db/index.ts` (new)

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- `neon-http` driver (not the WebSocket/pooled driver) — matches Vercel's
  serverless function model: one request, one connection, no persistent
  socket to manage. `process.env.DATABASE_URL!` is the one accepted
  non-null-assertion case per `code-standards.md` ("a variable proven
  present at startup") — the app cannot run without it.

### 5. `drizzle.config.ts` (new, repo root)

Standard `drizzle-kit` config pointing `schema` at `db/schema.ts`, `out` at
`drizzle/`, dialect `postgresql`, credentials from `DATABASE_URL`.

### 6. First migration (generated, not hand-written)

Run `drizzle-kit generate` to produce the initial SQL migration under
`drizzle/`; apply it with `drizzle-kit migrate` against the Neon database
from Prerequisites #1. Per `ai-workflow-rules.md` §5.3, this migration file
is never hand-edited once applied — a later schema change adds a new
migration.

## Out of scope (explicitly — do not build now)

- Any query function (`db/queries.ts` does not exist yet — that's 7b/7c).
- Any route or component reading/writing through `db`.
- The `speaking_rate` column, and the `usage_log` table (Unit 9).
- Removing the `localStorage` `hsk_level` fallback — that's 7b, once
  something actually replaces it.

## Files touched

| File                 | Change                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `package.json`       | edit — add `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit` |
| `.env.example`       | edit — `DATABASE_URL`                                               |
| `db/schema.ts`       | new — `settings`, `conversations`, `turns` table definitions        |
| `db/index.ts`        | new — Neon client + Drizzle instance                                |
| `drizzle.config.ts`  | new — `drizzle-kit` config                                          |
| `drizzle/0000_*.sql` | generated — first migration                                         |

## Tests (`test/`)

None required — this step defines schema and wiring only, no branching
logic to verify (`code-standards.md`: "Every non-trivial branch, loop,
parser... gets one runnable check" — there is no such logic here). The
verification is that the migration applies cleanly.

## Done criteria

1. `npm install` succeeds with the three new dependencies.
2. `drizzle-kit generate` produces a migration with no manual edits needed.
3. `drizzle-kit migrate` (or `push`, for local dev) applies cleanly against
   the Neon database in Prerequisites #1 with no errors.
4. `npm run build` and `npm run lint` still pass — nothing in the app
   imports `db/` yet, so this is unchanged behavior.
5. No secret (`DATABASE_URL`) reaches the client bundle — `grep -R
DATABASE_URL app components` finds nothing.
6. Diff contains only schema/config/migration files — no query functions,
   no route changes, no component changes.
7. Clean commit on `main`, no push (Unit 0b still deferred).

## Verification commands

```
npm install
npx drizzle-kit generate
npx drizzle-kit migrate
npm run build
npm run lint
grep -R "DATABASE_URL" app components --include=*.tsx --include=*.ts || echo "none — expected"
git status && git log --oneline -1
```

## Open questions

None — this step is pure infrastructure with no product decisions left
open after the grilling session that produced this spec (2026-09-14).

## Follow-ups to hand back (do NOT start in 7a)

- 7b: `db/queries.ts` settings functions, `app/api/settings/route.ts`, and
  the `architecture.md`/`code-standards.md` `speaking_rate` correction.
- 7c: `db/queries.ts` conversation/turn functions, `app/page.tsx` server-side
  load, `app/api/chat/route.ts` persistence wiring.
