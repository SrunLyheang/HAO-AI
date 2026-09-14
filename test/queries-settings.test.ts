import { describe, expect, it, vi, beforeEach } from "vitest";

const { findFirst, values, onConflictDoUpdate, insert } = vi.hoisted(() => {
  const findFirst = vi.fn();
  const values = vi.fn();
  const onConflictDoUpdate = vi.fn();
  const insert = vi.fn(() => ({ values }));
  return { findFirst, values, onConflictDoUpdate, insert };
});

vi.mock("@/db/index", () => ({
  db: {
    query: { settings: { findFirst } },
    insert,
  },
}));

import { getSettings, upsertHskLevel } from "@/db/queries";

beforeEach(() => {
  vi.clearAllMocks();
  values.mockReturnValue({ onConflictDoUpdate });
});

describe("getSettings", () => {
  it("returns the default hskLevel of 3 when no row exists", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await getSettings("user_123")).toEqual({ hskLevel: 3 });
  });

  it("returns the row's hskLevel when one exists", async () => {
    findFirst.mockResolvedValue({ userId: "user_123", hskLevel: 5, updatedAt: new Date() });
    expect(await getSettings("user_123")).toEqual({ hskLevel: 5 });
  });
});

describe("upsertHskLevel", () => {
  it("inserts/updates scoped to the exact userId passed in", async () => {
    await upsertHskLevel("user_123", 4);
    expect(insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", hskLevel: 4 }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });
});
