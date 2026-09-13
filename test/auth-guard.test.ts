import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/deepseek", () => ({
  callDeepSeek: vi.fn(),
}));
vi.mock("@/lib/groq-stt", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-tts", () => ({
  synthesizeSpeech: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { callDeepSeek } from "@/lib/deepseek";
import { transcribeAudio } from "@/lib/groq-stt";
import { synthesizeSpeech } from "@/lib/elevenlabs-tts";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: null } as never);
});

describe("auth guard: /api/chat", () => {
  it("rejects an unauthenticated request with 401 before calling DeepSeek", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "你好", history: [], hskLevel: 1 }),
      }),
    );
    expect(res.status).toBe(401);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });
});

describe("auth guard: /api/transcribe", () => {
  it("rejects an unauthenticated request with 401 before calling the STT client", async () => {
    const { POST } = await import("@/app/api/transcribe/route");
    const form = new FormData();
    form.set("audio", new Blob(["x"], { type: "audio/webm" }));
    const res = await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: form }));
    expect(res.status).toBe(401);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });
});

describe("auth guard: /api/speak", () => {
  it("rejects an unauthenticated request with 401 before calling the TTS client", async () => {
    const { POST } = await import("@/app/api/speak/route");
    const res = await POST(
      new Request("http://localhost/api/speak", {
        method: "POST",
        body: JSON.stringify({ text: "你好" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });
});
