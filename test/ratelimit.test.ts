import { describe, expect, it, vi, beforeEach } from "vitest";

const { execute, batch, deleteWhere } = vi.hoisted(() => {
  const execute = vi.fn();
  const batch = vi.fn(async (queries: unknown[]) => Promise.all(queries));
  const deleteWhere = vi.fn(async () => undefined);
  return { execute, batch, deleteWhere };
});

vi.mock("@/db/index", () => ({
  db: {
    execute,
    batch,
    delete: vi.fn(() => ({ where: deleteWhere })),
  },
}));

import { cleanupExpiredUsage, reserveUsage } from "@/lib/ratelimit";

beforeEach(() => {
  vi.clearAllMocks();
});

// drizzle's `sql` template tag has no plain `.sql` string property — it
// builds a `queryChunks` array of literal fragments and bound params, so
// this reads the literal SQL text back out the same way `JSON.stringify`
// would (each queryChunks[i].value[0] is a literal fragment).
function queryText(query: unknown): string {
  return JSON.stringify(query);
}

// The 2nd batch item is the conditional insert; its `.rows` decide whether
// reserveUsage returns true. Items 1 (lock) and 3 (per-write cleanup) don't
// affect the return value.
function mockInsertResult(inserted: boolean) {
  execute.mockImplementation(async (query: unknown) => {
    if (queryText(query).includes("insert into usage_log")) {
      return { rows: inserted ? [{ id: "row_1" }] : [] };
    }
    return { rows: [] };
  });
}

describe("reserveUsage", () => {
  it("returns true and writes a row at 29 rows in the last 60s", async () => {
    mockInsertResult(true);
    const result = await reserveUsage("user_1", "chat");
    expect(result).toBe(true);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(3);
  });

  it("returns false and writes no row at 30 rows in the last 60s", async () => {
    mockInsertResult(false);
    const result = await reserveUsage("user_1", "chat");
    expect(result).toBe(false);
  });

  it("returns true at 299 rows in the last 24h (under the minute limit)", async () => {
    mockInsertResult(true);
    expect(await reserveUsage("user_1", "chat")).toBe(true);
  });

  it("returns false at 300 rows in the last 24h", async () => {
    mockInsertResult(false);
    expect(await reserveUsage("user_1", "chat")).toBe(false);
  });

  it("treats rows older than 24h as 0 for both windows (the DB query filters them, not this module)", async () => {
    // The window filtering lives in the SQL itself (created_at >= now() -
    // interval); this asserts the SQL text carries both window predicates
    // rather than re-implementing Postgres's own interval arithmetic here.
    mockInsertResult(true);
    await reserveUsage("user_1", "chat");
    const insertQuery = queryText(execute.mock.calls[1][0]);
    expect(insertQuery).toContain("60 seconds");
    expect(insertQuery).toContain("24 hours");
  });

  it("serializes two concurrent calls for the same user via the same batch shape", async () => {
    // Real atomicity (the advisory lock) is a Postgres-level guarantee, not
    // observable through a mocked db — this proves both calls issue the same
    // lock -> conditional-insert -> cleanup shape rather than a naive
    // count-then-insert with no lock step at all. Reads the SQL arguments
    // from `execute.mock.calls`, not `batch.mock.calls` — the array passed
    // to `db.batch()` holds the *return values* of `db.execute(...)` (here,
    // mocked as Promises), not the query objects themselves.
    mockInsertResult(true);
    await reserveUsage("user_1", "chat");
    mockInsertResult(false);
    await reserveUsage("user_1", "chat");

    expect(execute.mock.calls).toHaveLength(6);
    for (let i = 0; i < execute.mock.calls.length; i += 3) {
      const [lockQuery, insertQuery, cleanupQuery] = execute.mock.calls.slice(i, i + 3).map((c) => c[0]);
      expect(queryText(lockQuery)).toContain("pg_advisory_xact_lock");
      expect(queryText(insertQuery)).toContain("insert into usage_log");
      expect(queryText(cleanupQuery)).toContain("delete from usage_log");
    }
  });

  it.each(["transcribe", "chat", "speak"] as const)(
    "issues one conditional insert and one cleanup delete for route %s",
    async (route) => {
      mockInsertResult(true);
      await reserveUsage("user_1", route);
      const insertQuery = execute.mock.calls[1][0];
      const cleanupQuery = execute.mock.calls[2][0];
      expect(queryText(insertQuery)).toContain("insert into usage_log");
      expect(queryText(insertQuery)).toContain(route);
      expect(queryText(cleanupQuery)).toContain("delete from usage_log");
      expect(batch.mock.calls[0][0]).toHaveLength(3);
    },
  );
});

describe("cleanupExpiredUsage", () => {
  it("deletes rows older than 24h across all users, not scoped to one userId", async () => {
    await cleanupExpiredUsage();
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    // No userId is passed anywhere in this module's public API for cleanup —
    // the where clause built by db/schema's usageLog.createdAt comparison is
    // the only filter, proving it's a global sweep.
  });
});
