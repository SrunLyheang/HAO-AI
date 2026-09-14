import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/db/queries", () => ({
  getConversationTurns: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { getConversationTurns } from "@/db/queries";

const mockAuth = vi.mocked(auth);
const mockGetConversationTurns = vi.mocked(getConversationTurns);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_1" } as never);
});

describe("GET /api/conversations/[id] ownership", () => {
  it("returns 404, not another user's turns, when getConversationTurns finds no owned row", async () => {
    mockGetConversationTurns.mockResolvedValue(null);
    const { GET } = await import("@/app/api/conversations/[id]/route");
    const res = await GET(new Request("http://localhost/api/conversations/conv_other"), {
      params: Promise.resolve({ id: "conv_other" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(mockGetConversationTurns).toHaveBeenCalledWith("user_1", "conv_other");
  });
});
