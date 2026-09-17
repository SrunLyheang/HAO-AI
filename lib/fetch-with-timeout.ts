// Server-only. Shared AbortController-based timeout wrapper for the
// outbound API clients (deepseek, elevenlabs-tts, groq-stt) — same
// abort/finally shape, only the label in the timeout error differs.
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await consume(response);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
