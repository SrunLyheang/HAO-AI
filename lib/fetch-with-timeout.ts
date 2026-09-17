// Server-only. Shared AbortController-based timeout wrapper for the
// outbound API clients (deepseek, elevenlabs-tts, groq-stt) — same
// abort/finally shape, only the label in the timeout error differs.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
