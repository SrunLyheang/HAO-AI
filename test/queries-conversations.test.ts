import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  findFirstConversations,
  findManyTurns,
  selectWhere,
  insertValues,
  updateWhere,
  deleteWhere,
  batch,
} = vi.hoisted(() => {
  const findFirstConversations = vi.fn();
  const findManyTurns = vi.fn();
  const selectWhere = vi.fn();
  const insertValues = vi.fn((values: unknown) => ({ marker: "insert", values }));
  const updateWhere = vi.fn(() => ({ marker: "update" }));
  const deleteWhere = vi.fn(() => ({ marker: "delete" }));
  const batch = vi.fn(async (queries: unknown[]) => queries.map(() => undefined));
  return { findFirstConversations, findManyTurns, selectWhere, insertValues, updateWhere, deleteWhere, batch };
});

vi.mock("@/db/index", () => ({
  db: {
    query: {
      conversations: { findFirst: findFirstConversations },
      turns: { findMany: findManyTurns },
    },
    select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
    delete: vi.fn(() => ({ where: deleteWhere })),
    batch,
  },
}));

import { appendTurnPair, countTurns, getOrCreateActiveConversation } from "@/db/queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateActiveConversation", () => {
  it("returns the existing active conversation with its turns in order", async () => {
    findFirstConversations.mockResolvedValue({
      id: "conv_1",
      userId: "user_1",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    findManyTurns.mockResolvedValue([
      {
        id: "turn_1",
        conversationId: "conv_1",
        userId: "user_1",
        role: "ai",
        textZh: "你好",
        pinyin: "nǐ hǎo",
        textEn: "Hi",
        correction: "",
        correctionPinyin: "",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const result = await getOrCreateActiveConversation("user_1");

    expect(result.conversation).toEqual({
      id: "conv_1",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.turns).toEqual([
      {
        id: "turn_1",
        role: "ai",
        text_zh: "你好",
        pinyin: "nǐ hǎo",
        text_en: "Hi",
        correction: "",
        correctionPinyin: "",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(batch).not.toHaveBeenCalled();
  });

  it("creates a new conversation with a seeded greeting turn when none is active", async () => {
    findFirstConversations.mockResolvedValue(undefined);
    selectWhere.mockResolvedValue([{ value: 0 }]);

    const result = await getOrCreateActiveConversation("user_1");

    expect(result.conversation.status).toBe("active");
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({ role: "ai", text_zh: "你好！今天想聊什么？" });
    expect(batch).toHaveBeenCalledTimes(1);
    // archive-previous-active, insert-conversation, insert-greeting-turn — no
    // delete, since the cap has not been reached.
    expect(batch.mock.calls[0][0]).toHaveLength(3);
  });
});

describe("50-conversation retention cap", () => {
  it("deletes the oldest conversation once the 51st is created", async () => {
    // No active conversation is ever found, so every call goes through the
    // creation path — the query-level way to exercise the cap per the
    // grilling session's Decision #2 (no live UI trigger exists yet).
    findFirstConversations.mockImplementation((arg: { orderBy?: unknown }) =>
      arg?.orderBy ? Promise.resolve({ id: "oldest_conv" }) : Promise.resolve(undefined),
    );

    let totalConversations = 0;
    selectWhere.mockImplementation(() => Promise.resolve([{ value: totalConversations }]));

    for (let i = 0; i < 51; i++) {
      await getOrCreateActiveConversation("user_1");
      totalConversations++;
    }

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    // Only the 51st call's batch includes the delete (4 items instead of 3).
    expect(batch.mock.calls[49][0]).toHaveLength(3);
    expect(batch.mock.calls[50][0]).toHaveLength(4);
  });
});

describe("appendTurnPair", () => {
  it("inserts both turns scoped to the given userId", async () => {
    findFirstConversations.mockResolvedValue({
      id: "conv_1",
      userId: "user_1",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const aiTurn = await appendTurnPair(
      "user_1",
      "conv_1",
      { text_zh: "你好" },
      { text_zh: "你好！", pinyin: "nǐ hǎo", text_en: "Hello!", correction: "", correctionPinyin: "" },
    );

    expect(batch).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(2);
    for (const call of insertValues.mock.calls) {
      expect(call[0]).toMatchObject({ userId: "user_1", conversationId: "conv_1" });
    }
    expect(aiTurn).toMatchObject({ role: "ai", text_zh: "你好！" });
  });
});

describe("countTurns", () => {
  it.each([0, 1, 25])("returns %i for a conversation with %i turns", async (n) => {
    selectWhere.mockResolvedValue([{ value: n }]);
    expect(await countTurns("user_1", "conv_1")).toBe(n);
  });
});
