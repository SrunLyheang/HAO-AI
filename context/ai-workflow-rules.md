# AI Workflow Rules — hao.AI

These are rules, not suggestions. Follow them exactly. When a rule here conflicts with your default behavior, this file wins. When a rule here conflicts with a direct instruction from the user in the current conversation, the user wins — and you must say out loud which rule you are setting aside and why.

The source-of-truth documents for this project are:

- `project-overview.md` — what the product is, goals, scope, success criteria.
- `build-spec.md` — the buildable units, their order, and their done criteria.
- `architecture.md` — the stack, folder ownership, storage model, auth model, and invariants.

Read all three before writing any code. Re-read the relevant section before starting each unit.

---

## 1. Overall approach

1. Build spec-driven. Every change must trace to a unit in `build-spec.md` or an explicit user instruction. If it traces to neither, do not make it.
2. Build incrementally. Ship one unit at a time in the order given by `build-spec.md` (`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10`). Do not start a later unit before the current one meets its done criteria.
3. Keep the app runnable after every unit. `npm run build` must pass and the deployed site must load at the end of each unit. Never leave the tree in a state that does not build.
4. Prefer the smallest change that satisfies the unit's done criteria. Do not add structure, abstraction, configuration, or files that the current unit does not require.
5. Match the existing code. Reuse the helpers, types, naming, and patterns already in the repo. Do not introduce a second way to do something that already has one way.
6. Do not add a dependency when a few lines of code or a built-in platform feature will do. If you believe a new dependency is justified, stop and ask the user first, naming the dependency and the reason.

---

## 2. Scoping rules

1. Work on exactly one unit at a time. Announce which unit you are starting and quote its done criteria from `build-spec.md` before you write code.
2. Do not make speculative changes. Do not build for a future unit, a roadmap item, or a "we'll probably need this later." If it is not required by the unit in front of you, do not write it.
3. Do not refactor code outside the current unit's scope unless the unit cannot be completed without it. If a refactor is required, state why, keep it minimal, and do it as a separate step with its own verification.
4. Do not rename files, move files, change public function signatures, or reorganize folders that the current unit does not touch.
5. Do not change the design tokens, colors, typography, spacing scale, or component patterns established by the minimalist-ui direction unless the unit explicitly calls for it.
6. Do not add new API routes, new database tables, or new columns beyond what `architecture.md` specifies. If the unit seems to need one, stop and ask.
7. Do not touch the `context/` folder. Do not create files inside it, edit files inside it, or read from it as a source of truth.
8. If you finish a unit and see obvious follow-up work, write it down in a short list for the user. Do not start it.

---

## 3. When to split work into smaller steps

Split a unit into smaller steps when any of these is true:

1. The unit touches more than roughly three files, or adds more than one new API route.
2. The unit has a natural "make it work, then wire it to the UI" seam. Do the working core first with a dev harness, then the UI.
3. The unit crosses a trust boundary — anything involving auth, `requireUser()`, rate limiting, input caps, or a provider API key. Land the guard and its test as its own step before the feature that depends on it.
4. The unit changes the database schema. Do the migration and schema change as one step, verify it applies cleanly, then build the feature that uses it.
5. You cannot write a single sentence describing what the step does. If the description needs "and", split on the "and".
6. A step would leave the build red for more than one commit. Find a smaller step that stays green.

Each step must independently build, be verifiable, and leave the app runnable. State the step boundaries before you start.

---

## 4. Missing or ambiguous requirements

When a requirement is undefined, unclear, or contradicts another document, do this in order:

1. Check `project-overview.md`, `build-spec.md`, and `architecture.md` for an answer. Quote the line that resolves it.
2. If those documents disagree with each other, stop. Do not guess which one is right. Tell the user exactly which two lines conflict and ask which wins.
3. If the documents are silent, check whether an existing pattern in the codebase already answers it. If so, follow that pattern and note that you did.
4. If it is still undefined, stop and ask the user one specific question with your recommended answer. Do not proceed on that point until they answer.
5. Never invent a requirement to fill a gap. Never widen scope to resolve ambiguity. Never pick the larger or more general implementation "to be safe" — pick nothing and ask.
6. If you are blocked on one point but the rest of the unit is clear, build the unblocked part, leave a clearly marked `TODO(question): <the question>` at the exact spot, and list every such TODO for the user when you hand the unit back.
7. Do not silently drop a requirement because it is hard or unclear. If you cannot do it, say so explicitly.

---

## 5. Files you must not modify without explicit instruction

Do not edit, delete, regenerate, or reformat any of the following unless the user tells you to in the current conversation, naming the file or category:

1. Anything in `context/` — no reads as source of truth, no writes, ever.
2. `project-overview.md`, `build-spec.md`, `architecture.md` — these are inputs. You update them only under the rules in section 6, and only when implementation has diverged from them.
3. Generated and vendored files: `drizzle/` migration files that have already been applied, `package-lock.json` except as a side effect of an approved `npm install`, `.next/`, `node_modules/`, any `*.generated.*` file.
4. Clerk, Neon, Vercel, OpenAI, and Azure dashboard configuration. You cannot change these from code. When a unit needs a dashboard setting (disable public sign-up, set a spend cap, add an env var), stop and give the user the exact steps to do it themselves.
5. Third-party component source. This project uses Radix UI primitives and Phosphor Icons as installed packages. Do not copy their source into the repo and do not patch files under `node_modules/`. If a primitive does not do what you need, wrap it in `components/`, do not fork it.
6. `.env` files and any real secret. Never write a real key into a tracked file. Add new env vars to `.env.example` with a placeholder value and tell the user to set the real value in Vercel.
7. `middleware.ts` and `lib/auth.ts` after Unit 6 is done — changes here are security-sensitive. Touch them only for a unit that explicitly concerns auth, and flag the change prominently for review.

If you think one of these files must change to complete a unit, stop and ask before touching it.

---

## 6. Keeping documentation in sync

1. Treat `architecture.md` as binding. If your implementation would violate an invariant, a folder-ownership rule, or the storage model, do not write that implementation. Change the approach, or stop and ask the user to amend the document first.
2. When implementation legitimately diverges from a document — a table gets a column the doc did not list, a route moves, an invariant needs rewording — update the document in the same change, not later. A unit is not done while a document describes something the code no longer does.
3. When you finish a unit, check its entry in `build-spec.md`. If the done criteria as written no longer match what "done" actually required, correct the wording and note what changed.
4. Keep documentation edits surgical. Change the lines that are now wrong. Do not rewrite sections, restructure files, or "improve" prose that is still accurate.
5. Do not add new documents unless the user asks for one. Do not split these files. Do not create per-unit spec files or per-criterion context files — the user has explicitly deferred those.
6. If a change affects the stack table, the invariants list, or the scope sections, call that out explicitly when you hand back the unit so the user can review the doc change directly.
7. Never let code and docs drift silently. If you notice an existing mismatch while working on something else, report it. Fix it only if it is small and safe; otherwise leave it for the user.

---

## 7. Verification checklist before moving to the next unit

Do not start the next unit until every item below is true for the current one. Run the checks; do not assume.

1. **Done criteria met.** Every bullet in this unit's `build-spec.md` done criteria is satisfied. Quote each one and state how it was verified.
2. **Build passes.** `npm run build` completes with no errors. TypeScript is strict and clean — no new `any`, no `@ts-ignore`, no `eslint-disable` added to get it green.
3. **App runs.** The app starts locally and the affected screen or flow works end to end by manual check. Describe the manual check you performed.
4. **Deploy works.** If the unit changes anything that affects the deployed build (dependencies, env vars, routes, config), confirm the Vercel deployment succeeds and the live URL loads.
5. **Auth boundary intact.** If the unit added or changed an API route: it calls `requireUser()` as its first statement, and there is a test proving an unauthenticated request is rejected before any provider or database call.
6. **Invariants hold.** Walk the invariants in `architecture.md`. Confirm this unit violates none of them. Pay specific attention to: no secret reaches the client, every DB query is scoped by `user_id`, no user audio is persisted, pinyin is computed by `pinyin-pro` and never taken from the model, no provider call happens before rate and size limits pass.
7. **Limits enforced.** If the unit touches input handling: audio ≤ 60s and ≤ 1 MB is enforced client-side, text ≤ 500 chars is enforced server-side, and the relevant caps (25 turns/conversation, 50 conversations/user, rate-limit windows) are respected.
8. **No scope creep.** The diff contains only what this unit required. No speculative files, no unrelated refactors, no roadmap work. If something extra crept in, remove it or move it to its own reviewed step.
9. **Docs in sync.** `build-spec.md` and `architecture.md` match what the code now does. Any divergence was corrected in this same change.
10. **Tests present for non-trivial logic.** Any branch, loop, parser, money path, or security path added in this unit has at least one runnable check that fails if the logic breaks. Trivial one-liners do not need one.
11. **Cleanup done.** No leftover dead code, commented-out blocks, `console.log`, debug harness, or scratch files in the committed diff. Dev harnesses added for a unit are removed once the real UI replaces them, unless `build-spec.md` says to keep them.
12. **Open questions surfaced.** Every `TODO(question)` left in the code is listed for the user, with the specific decision each one needs.

If any item fails, the unit is not done. Fix it or report it. Do not move on.
