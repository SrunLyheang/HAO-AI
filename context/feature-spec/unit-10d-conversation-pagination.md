# Feature Spec — Unit 10d: Pagination for conversation history

> Part 4 of 8 for `build-spec.md` Unit 10 ("Hardening + ship"), split per
> `ai-workflow-rules.md` §3. Derived from a production-readiness audit run
> against the live codebase on 2026-09-15.
>
> **Status: CLOSED for now — deferred, see "Decision" below. No code in
> this unit has been written or should be started from this document.**

## One sentence

`GET /api/conversations` returns every conversation for the user in one
response, bounded only by the existing 50-conversation retention cap — real
pagination is deferred, not built now.

## Evidence

`app/api/conversations/route.ts`'s `GET` calls `listConversations(userId)`
with no `limit`/`cursor` — it returns every conversation for the user in one
response, capped only by the 50-conversation retention policy deleting the
oldest once exceeded.

## Decision (resolved 2026-09-15)

**Skip real pagination.** The 50-conversation cap already bounds the
response size — each row is a short preview string, not full conversation
text, so the max possible payload is small regardless. Cursor/offset paging
would be solving a problem that structurally cannot occur at the current
cap. Confirmed with the user; not a default assumed silently.

## Deferred — revisit if the cap is ever raised

If the 50-conversation retention cap is ever raised or removed, this becomes
active work:

- Cursor-based paging on `listConversations` and the `GET` route, matching
  the `next_cursor` pattern already familiar from other tools in this
  environment — no new dependency needed.
- Re-open this file's status to DRAFT and move it back into the active
  build order when that happens; until then, no action is required.

## Out of scope (for now)

All pagination implementation — see "Deferred" above.

## Verification

Not applicable until this is un-deferred — no code change ships from this
document as it stands.
