// The three-call conversational pipeline (architecture.md: transcribe ->
// chat -> speak) as typed calls instead of ad-hoc fetches inlined in
// app/page.tsx. Lives in components/, not lib/: lib/ is server-only (see
// architecture.md's system-boundaries table), and this runs from a Client
// Component.

import type { HskLevel, TranscribeResponse, Turn } from "@/types";

export type ClientResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errorMessage(data: unknown, status: number): string {
  return typeof data === "object" && data !== null && "error" in data
    ? String((data as { error: unknown }).error)
    : `Request failed (${status})`;
}

async function parseJsonResult<T>(res: Response): Promise<ClientResult<T>> {
  const data: unknown = await res.json();
  if (!res.ok) return { ok: false, error: errorMessage(data, res.status) };
  return { ok: true, data: data as T };
}

export async function transcribe(
  blob: Blob,
  mode: "zh" | "auto",
): Promise<ClientResult<TranscribeResponse>> {
  const form = new FormData();
  form.append("audio", blob);
  form.append("mode", mode);

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    return await parseJsonResult<TranscribeResponse>(res);
  } catch {
    return { ok: false, error: "Network error — try again." };
  }
}

export async function reply(
  history: Turn[],
  message: string,
  hskLevel: HskLevel,
  conversationId: string,
): Promise<ClientResult<Turn>> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Send history *before* this user turn; message carries the new turn.
      body: JSON.stringify({ history, message, hskLevel, conversationId }),
    });
    return await parseJsonResult<Turn>(res);
  } catch {
    return { ok: false, error: "Network error — try again." };
  }
}

export async function speak(text: string): Promise<ClientResult<Blob>> {
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // No `rate` — ElevenLabs' speed is hard-limited to 0.7-1.2, too narrow
      // for this app's rate range, so the server always synthesizes at
      // natural speed and the caller scales playbackRate itself.
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const data: unknown = await res.json();
      return { ok: false, error: errorMessage(data, res.status) };
    }
    return { ok: true, data: await res.blob() };
  } catch {
    return { ok: false, error: "Could not play audio — try again." };
  }
}
