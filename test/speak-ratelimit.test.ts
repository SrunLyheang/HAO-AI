import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-tts", () => ({
  synthesizeSpeech: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({
  reserveUsage: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { synthesizeSpeech } from "@/lib/elevenlabs-tts";
import { reserveUsage } from "@/lib/ratelimit";

const mockAuth = vi.mocked(auth);
const mockReserveUsage = vi.mocked(reserveUsage);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_1" } as never);
  mockReserveUsage.mockResolvedValue(false);
});

describe("rate limit: POST /api/speak", () => {
  it("returns 429 and never calls synthesizeSpeech when reserveUsage fails", async () => {
    const { POST } = await import("@/app/api/speak/route");
    const res = await POST(
      new Request("http://localhost/api/speak", {
        method: "POST",
        body: JSON.stringify({ text: "你好" }),
      }),
    );
    expect(res.status).toBe(429);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
    expect(reserveUsage).toHaveBeenCalledWith("user_1", "speak");
  });
});
