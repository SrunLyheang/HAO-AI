import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/db/queries", () => ({
  listConversations: vi.fn(),
  createConversationWithGreeting: vi.fn(),
  getConversationTurns: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { createConversationWithGreeting, getConversationTurns, listConversations } from "@/db/queries";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: null } as never);
});

describe("auth guard: GET /api/conversations", () => {
  it("rejects an unauthenticated request with 401 before touching the DB", async () => {
    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listConversations).not.toHaveBeenCalled();
  });
});

describe("auth guard: POST /api/conversations", () => {
  it("rejects an unauthenticated request with 401 before touching the DB", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(createConversationWithGreeting).not.toHaveBeenCalled();
  });
});

describe("auth guard: GET /api/conversations/[id]", () => {
  it("rejects an unauthenticated request with 401 before touching the DB", async () => {
    const { GET } = await import("@/app/api/conversations/[id]/route");
    const res = await GET(new Request("http://localhost/api/conversations/conv_1"), {
      params: Promise.resolve({ id: "conv_1" }),
    });
    expect(res.status).toBe(401);
    expect(getConversationTurns).not.toHaveBeenCalled();
  });
});
