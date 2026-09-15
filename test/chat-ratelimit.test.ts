import { describe, expect, it, vi, beforeEach } from "vitest";

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
  appendTurnPair: vi.fn(),
  countTurns: vi.fn(),
  ConversationNotFoundError: class ConversationNotFoundError extends Error {},
}));

import { auth } from "@clerk/nextjs/server";
import { callDeepSeek } from "@/lib/deepseek";
import { reserveUsage } from "@/lib/ratelimit";
import { appendTurnPair, countTurns } from "@/db/queries";

const mockAuth = vi.mocked(auth);
const mockReserveUsage = vi.mocked(reserveUsage);
const mockCountTurns = vi.mocked(countTurns);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_1" } as never);
  mockCountTurns.mockResolvedValue(0);
  mockReserveUsage.mockResolvedValue(false);
});

describe("rate limit: POST /api/chat", () => {
  it("returns 429 and never calls DeepSeek or appendTurnPair when reserveUsage fails", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "你好",
          history: [],
          hskLevel: 1,
          conversationId: "11111111-1111-1111-1111-111111111111",
        }),
      }),
    );
    expect(res.status).toBe(429);
    expect(callDeepSeek).not.toHaveBeenCalled();
    expect(appendTurnPair).not.toHaveBeenCalled();
    expect(reserveUsage).toHaveBeenCalledWith("user_1", "chat");
  });
});
