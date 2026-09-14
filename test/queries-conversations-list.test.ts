import { describe, expect, it, vi, beforeEach } from "vitest";

const { findManyConversations, findFirstTurns } = vi.hoisted(() => {
  const findManyConversations = vi.fn();
  const findFirstTurns = vi.fn();
  return { findManyConversations, findFirstTurns };
});

vi.mock("@/db/index", () => ({
  db: {
    query: {
      conversations: { findMany: findManyConversations },
      turns: { findFirst: findFirstTurns },
    },
  },
}));

import { listConversations } from "@/db/queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listConversations", () => {
  it("returns active and archived conversations, newest first, each with its earliest turn's preview", async () => {
    findManyConversations.mockResolvedValue([
      { id: "conv_active", userId: "user_1", status: "active", createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "conv_old", userId: "user_1", status: "archived", createdAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    findFirstTurns.mockImplementation((arg: { where?: unknown }) => {
      void arg;
      return Promise.resolve({ textZh: "你好" });
    });

    const result = await listConversations("user_1");

    expect(result).toEqual([
      { id: "conv_active", status: "active", createdAt: "2026-01-02T00:00:00.000Z", preview: "你好" },
      { id: "conv_old", status: "archived", createdAt: "2026-01-01T00:00:00.000Z", preview: "你好" },
    ]);
  });

  it("falls back to an empty preview when a conversation has no turns", async () => {
    findManyConversations.mockResolvedValue([
      { id: "conv_1", userId: "user_1", status: "active", createdAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    findFirstTurns.mockResolvedValue(undefined);

    const result = await listConversations("user_1");

    expect(result[0].preview).toBe("");
  });
});
