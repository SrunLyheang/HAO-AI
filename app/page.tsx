"use client";

import { useState } from "react";
import type { Turn } from "@/types";

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

export default function Home() {
  const [history, setHistory] = useState<Turn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const message = input.trim();
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
        body: JSON.stringify({ history, message }),
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6">
      <h1 className="text-sm text-neutral-500">hao.AI — typed harness (Unit 1)</h1>

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
      {pending && <p className="text-sm text-neutral-400">…</p>}

      <div className="mt-auto flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="用中文写一句话…"
          className="flex-1 resize-none rounded-lg border border-neutral-300 p-2 text-neutral-900"
        />
        <button
          onClick={() => void send()}
          disabled={pending || input.trim().length === 0}
          className="self-end rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </main>
  );
}
