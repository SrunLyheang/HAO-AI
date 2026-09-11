"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { HskLevel, TranscribeResponse, Turn } from "@/types";

// Unit 1 typed dev harness. Not the real screen — Unit 5 replaces this with the
// minimalist-ui layout and moves this harness behind a dev flag.

// Hardcoded opening turn so first paint needs no server call. Unit 7 seeds the
// greeting server-side instead.
const GREETING: Turn = {
  role: "ai",
  text_zh: "你好！今天想聊什么？",
  pinyin: "nǐ hǎo！jīn tiān xiǎng liáo shén me？",
  text_en: "Hi! What would you like to talk about today?",
  correction: "",
};

const HSK_LEVEL_STORAGE_KEY = "hsk_level";
const HSK_LEVEL_CHANGE_EVENT = "hsk-level-change";

// Duplicated from app/api/transcribe/validate.ts's MAX_AUDIO_BYTES — no shared
// import between a server lib/ file and a client component (code-standards.md
// §TypeScript).
const MAX_AUDIO_BYTES_CLIENT = 1 * 1024 * 1024;
const MAX_RECORDING_MS = 60_000;
const MIC_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];

function pickSupportedMimeType(): string | null {
  return MIC_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function isHskLevel(n: number): n is HskLevel {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

function readStoredHskLevel(): HskLevel {
  const level = Number(localStorage.getItem(HSK_LEVEL_STORAGE_KEY));
  return isHskLevel(level) ? level : 3;
}

// Server render always sees the default; the real value (an external system,
// localStorage) is synced in via useSyncExternalStore below — no
// setState-in-effect, no hydration mismatch.
function getServerHskLevel(): HskLevel {
  return 3;
}

function subscribeToHskLevel(callback: () => void) {
  window.addEventListener(HSK_LEVEL_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(HSK_LEVEL_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function persistHskLevel(level: HskLevel) {
  localStorage.setItem(HSK_LEVEL_STORAGE_KEY, String(level));
  window.dispatchEvent(new Event(HSK_LEVEL_CHANGE_EVENT));
}

export default function Home() {
  const [history, setHistory] = useState<Turn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const hskLevel = useSyncExternalStore(
    subscribeToHskLevel,
    readStoredHskLevel,
    getServerHskLevel,
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function send(message: string) {
    message = message.trim();
    if (!message || pending) return;

    const userTurn: Turn = { role: "user", text_zh: message };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send history *before* this user turn; message carries the new turn.
        body: JSON.stringify({ history, message, hskLevel }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        setError(msg);
        return;
      }
      setHistory([...nextHistory, data as Turn]);
    } catch {
      setError("Network error — try again.");
    } finally {
      setPending(false);
    }
  }

  function stopRecording() {
    if (stopTimerRef.current !== null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function startRecording() {
    if (mediaRecorderRef.current?.state === "recording") return;
    setMicError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Microphone access denied — check your browser settings.");
      return;
    }

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setMicError("Voice input isn't supported in this browser.");
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      setRecording(false);
      void handleRecordedAudio(blob);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    stopTimerRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
  }

  async function handleRecordedAudio(blob: Blob) {
    if (blob.size > MAX_AUDIO_BYTES_CLIENT) {
      setMicError("Recording too large — try a shorter clip.");
      return;
    }

    const form = new FormData();
    form.append("audio", blob);

    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        setError(msg);
        return;
      }
      await send((data as TranscribeResponse).text);
    } catch {
      setError("Network error — try again.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white py-2">
        <h1 className="text-sm text-neutral-500">hao.AI — typed harness (Unit 1)</h1>
        <select
          value={hskLevel}
          onChange={(e) => persistHskLevel(Number(e.target.value) as HskLevel)}
          className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              HSK {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-6">
        {history.map((turn, i) =>
          turn.role === "user" ? (
            <p key={i} className="self-end rounded-lg bg-neutral-100 px-3 py-2 text-neutral-800">
              {turn.text_zh}
            </p>
          ) : (
            <div key={i} className="flex flex-col gap-1">
              <p className="text-xs text-neutral-400">{turn.pinyin}</p>
              <p className="text-xl text-neutral-900">{turn.text_zh}</p>
              <p className="text-sm text-neutral-500">{turn.text_en}</p>
              {turn.correction !== "" && (
                <details className="mt-1 text-sm">
                  <summary className="cursor-pointer text-amber-700">Correction</summary>
                  <p className="mt-1 text-neutral-700">{turn.correction}</p>
                </details>
              )}
            </div>
          ),
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {micError && <p className="text-sm text-red-600">{micError}</p>}
      {pending && <p className="text-sm text-neutral-400">…</p>}

      <div className="mt-auto flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="用中文写一句话…"
          className="flex-1 resize-none rounded-lg border border-neutral-300 p-2 text-neutral-900"
        />
        <button
          onPointerDown={() => void startRecording()}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onPointerCancel={stopRecording}
          className="self-end rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900"
        >
          {recording ? "Recording…" : "🎤"}
        </button>
        <button
          onClick={() => void send(input)}
          disabled={pending || input.trim().length === 0}
          className="self-end rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </main>
  );
}
