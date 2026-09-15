import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/groq-stt", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({
  reserveUsage: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { transcribeAudio } from "@/lib/groq-stt";
import { reserveUsage } from "@/lib/ratelimit";

const mockAuth = vi.mocked(auth);
const mockReserveUsage = vi.mocked(reserveUsage);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_1" } as never);
  mockReserveUsage.mockResolvedValue(false);
});

describe("rate limit: POST /api/transcribe", () => {
  it("returns 429 and never calls transcribeAudio when reserveUsage fails", async () => {
    const { POST } = await import("@/app/api/transcribe/route");
    const form = new FormData();
    form.set("audio", new Blob(["x"], { type: "audio/webm" }));
    const res = await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: form }));
    expect(res.status).toBe(429);
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(reserveUsage).toHaveBeenCalledWith("user_1", "transcribe");
  });
});
