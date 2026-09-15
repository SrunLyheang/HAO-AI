import { describe, expect, it, vi, beforeEach } from "vitest";

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/deepseek", () => ({
  callDeepSeek: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({
  reserveUsage: vi.fn(),
}));
vi.mock("@/db/queries", () => ({
  countTurns: vi.fn(),
  appendTurnPair: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { callDeepSeek } from "@/lib/deepseek";
import { reserveUsage } from "@/lib/ratelimit";
import { appendTurnPair, countTurns } from "@/db/queries";

const mockAuth = vi.mocked(auth);
const mockCallDeepSeek = vi.mocked(callDeepSeek);
const mockReserveUsage = vi.mocked(reserveUsage);
const mockCountTurns = vi.mocked(countTurns);
const mockAppendTurnPair = vi.mocked(appendTurnPair);

function chatRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_123" } as never);
  mockCountTurns.mockResolvedValue(0);
  mockReserveUsage.mockResolvedValue(true);
  mockCallDeepSeek.mockResolvedValue(
    JSON.stringify({ reply_zh: "你好！", reply_en: "Hello!", correction: "" }),
  );
  mockAppendTurnPair.mockResolvedValue({
    id: "turn_ai",
    role: "ai",
    text_zh: "你好！",
    pinyin: "nǐ hǎo！",
    text_en: "Hello!",
    correction: "",
    correctionPinyin: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
});

describe("POST /api/chat — conversation persistence", () => {
  it("rejects a request already at the 25-turn cap before calling DeepSeek or appendTurnPair", async () => {
    mockCountTurns.mockResolvedValue(25);
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      chatRequest({ history: [], message: "你好", hskLevel: 3, conversationId: CONVERSATION_ID }),
    );
    expect(res.status).toBe(400);
    expect(mockCallDeepSeek).not.toHaveBeenCalled();
    expect(mockAppendTurnPair).not.toHaveBeenCalled();
  });

  it("persists both turns after a successful DeepSeek round trip", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      chatRequest({ history: [], message: "你好", hskLevel: 3, conversationId: CONVERSATION_ID }),
    );
    expect(res.status).toBe(200);
    expect(mockAppendTurnPair).toHaveBeenCalledWith(
      "user_123",
      CONVERSATION_ID,
      { text_zh: "你好" },
      expect.objectContaining({ text_zh: "你好！" }),
    );
    expect(await res.json()).toMatchObject({ role: "ai", text_zh: "你好！" });
  });

  it("rejects a missing conversationId with 400 before any DeepSeek call", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(chatRequest({ history: [], message: "你好", hskLevel: 3 }));
    expect(res.status).toBe(400);
    expect(mockCallDeepSeek).not.toHaveBeenCalled();
  });

  it("rejects a malformed conversationId with 400 before any DeepSeek call", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      chatRequest({ history: [], message: "你好", hskLevel: 3, conversationId: "not-a-uuid" }),
    );
    expect(res.status).toBe(400);
    expect(mockCallDeepSeek).not.toHaveBeenCalled();
  });
});
