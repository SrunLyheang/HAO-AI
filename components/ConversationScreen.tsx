"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ClockCounterClockwise,
  Keyboard,
  PaperPlaneTilt,
  Plus,
} from "@phosphor-icons/react";
import { UserButton } from "@clerk/nextjs";
import type { Conversation, DisplaySupportMode, HskLevel, SpeakingRate, Turn } from "@/types";
import MicButton from "@/components/MicButton";
import HskPicker from "@/components/HskPicker";
import ZhOnlyToggle from "@/components/ZhOnlyToggle";
import DisplaySupportToggle from "@/components/DisplaySupportToggle";
import TurnCard from "@/components/TurnCard";
import { createPersistedPreference } from "@/components/preference-store";
import * as conversation from "@/components/conversation-client";

// Matches the current live-app rate options (see the ElevenLabs-speed-limit
// note in lib/elevenlabs-tts.ts) — restyled here, not widened. Now selected
// per AI turn (see turnRates below) instead of one app-wide value.
const SPEAKING_RATES: SpeakingRate[] = [0.75, 1, 1.5];

const MIC_BLOCKED_MESSAGE =
  "Wait for the bot to finish speaking before recording.";

// Server render always sees each fallback; the real value (an external
// system, localStorage) is synced in via useSyncExternalStore below — no
// setState-in-effect, no hydration mismatch. See components/preference-store.

// Default off: mic transcribes literally in whatever language was spoken.
// On: forces the Whisper language hint to "zh", which makes spoken English
// come back translated into Chinese (see lib/groq-stt.ts).
const zhOnlyModePreference = createPersistedPreference<boolean>({
  storageKey: "zh_only_mode",
  changeEvent: "zh-only-mode-change",
  fallback: false,
  isValid: () => true,
  parse: (raw) => raw === "true",
});

// Which lines of an AI turn are shown — a display preference, stored the
// same way as hsk_level (localStorage, before any DB write path exists).
const DISPLAY_SUPPORT_MODES: DisplaySupportMode[] = [
  "all",
  "hanzi_pinyin",
  "hanzi_only",
  "audio",
];

function isDisplaySupportMode(value: string): value is DisplaySupportMode {
  return (DISPLAY_SUPPORT_MODES as string[]).includes(value);
}

const displaySupportPreference = createPersistedPreference<DisplaySupportMode>({
  storageKey: "display_support",
  changeEvent: "display-support-change",
  fallback: "all",
  isValid: isDisplaySupportMode,
  parse: (raw) => raw as DisplaySupportMode,
});

// User-adjustable size for the transcript's Chinese/pinyin/English text only
// (chrome — buttons, labels, icons — stays fixed). Local-only, like hsk_level
// before the DB write path exists.
const TEXT_SCALES = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2,
] as const;
type TextScale = (typeof TEXT_SCALES)[number];

const textScalePreference = createPersistedPreference<TextScale>({
  storageKey: "text_scale",
  changeEvent: "text-scale-change",
  fallback: 1,
  isValid: (raw) => (TEXT_SCALES as readonly number[]).includes(Number(raw)),
  parse: (raw) => Number(raw) as TextScale,
});

// Per-turn "sent at" time, display-only (mirrors the mockup's timestamps).
// Client-only, like turnRates — not part of the Turn shape or any API
// contract, since there is no persistence layer for turns yet.
function formatTurnTime(ts: number | undefined): string {
  return ts === undefined
    ? ""
    : new Date(ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

function StatusLine({
  variant,
  children,
}: {
  variant: "error" | "ok" | "live";
  children: React.ReactNode;
}) {
  const styles = {
    error: { background: "var(--err-bg)", color: "var(--err-text)" },
    ok: { background: "var(--ok-bg)", color: "var(--ok-text)" },
    live: { background: "var(--live-bg)", color: "var(--live-text)" },
  }[variant];
  return (
    <div
      style={{
        ...styles,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
        fontSize: "1.0625rem",
      }}
    >
      {children}
    </div>
  );
}

type ConversationScreenProps = {
  conversation: Conversation;
  initialTurns: Turn[];
};

export default function ConversationScreen({
  conversation: activeConversation,
  initialTurns,
}: ConversationScreenProps) {
  const [history, setHistory] = useState<Turn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<"talk" | "type">("talk");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const zhOnlyMode = useSyncExternalStore(
    zhOnlyModePreference.subscribe,
    zhOnlyModePreference.read,
    zhOnlyModePreference.getServer,
  );
  // Per-AI-turn playback speed (index -> rate), default 1x. Replaces the old
  // single app-wide rate switcher (see progress-tracker.md).
  const [turnRates, setTurnRates] = useState<Record<number, SpeakingRate>>({});
  // Per-turn "sent at" time, display-only — seeded for the greeting, then
  // appended alongside setHistory in send() below.
  const [turnTimestamps, setTurnTimestamps] = useState<number[]>([]);
  const textScale = useSyncExternalStore(
    textScalePreference.subscribe,
    textScalePreference.read,
    textScalePreference.getServer,
  );
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  // Loaded from Postgres via /api/settings (Unit 7b) — 3 is the same
  // default getSettings() returns for a brand-new user, so there is no
  // visible flash once the fetch resolves.
  const [hskLevel, setHskLevel] = useState<HskLevel>(3);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { hskLevel: HskLevel }) => {
        if (!cancelled) setHskLevel(data.hskLevel);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function changeHskLevel(level: HskLevel) {
    setHskLevel(level);
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hskLevel: level }),
    });
  }
  const displaySupport = useSyncExternalStore(
    displaySupportPreference.subscribe,
    displaySupportPreference.read,
    displaySupportPreference.getServer,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTurnRef = useRef<HTMLDivElement | null>(null);

  // Revoke-after-playback point (architecture.md's TTS object URL lifecycle).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      URL.revokeObjectURL(audio.src);
      setPlayingIndex(null);
      setMicError((m) => (m === MIC_BLOCKED_MESSAGE ? null : m));
    };
    const onError = () => {
      if (audio.src) URL.revokeObjectURL(audio.src);
      setPlayingIndex(null);
      setMicError((m) => (m === MIC_BLOCKED_MESSAGE ? null : m));
      setSpeakError("Audio playback failed — try again.");
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    lastTurnRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTurnTimestamps([Date.now()]), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function speak(text: string, index: number) {
    if (playingIndex !== null) return;
    setPlayingIndex(index);
    setSpeakError(null);

    const result = await conversation.speak(text);
    if (!result.ok) {
      setSpeakError(result.error);
      setPlayingIndex(null);
      return;
    }

    const url = URL.createObjectURL(result.data);
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = url;
    audio.playbackRate = turnRates[index] ?? 1;
    try {
      await audio.play();
    } catch {
      setSpeakError("Could not play audio — try again.");
      setPlayingIndex(null);
    }
  }

  async function send(message: string) {
    message = message.trim();
    if (!message || pending) return;

    // Optimistic — the server assigns the real id/createdAt on persistence
    // (appendTurnPair); this client-side placeholder is only ever rendered,
    // never sent back to the server.
    const userTurn: Turn = {
      id: crypto.randomUUID(),
      role: "user",
      text_zh: message,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    setTurnTimestamps((t) => [...t, Date.now()]);
    setInput("");
    setError(null);
    setPending(true);

    const result = await conversation.reply(history, message, hskLevel, activeConversation.id);
    if (!result.ok) {
      setError(result.error);
    } else {
      setHistory([...nextHistory, result.data]);
      setTurnTimestamps((t) => [...t, Date.now()]);
      void speak(result.data.text_zh, nextHistory.length);
    }
    setPending(false);
  }

  async function handleRecordedAudio(blob: Blob) {
    const result = await conversation.transcribe(
      blob,
      zhOnlyMode ? "zh" : "auto",
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await send(result.data.text);
  }

  return (
    <main style={{ position: "relative", minHeight: "100dvh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          rowGap: "var(--space-2)",
          columnGap: "var(--space-4)",
          padding: "var(--space-4)",
          background: "var(--canvas)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-3)",
            rowGap: "var(--space-2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static app-icon asset, not a Next/Image-optimized content image */}
            <img src="/icon.svg" alt="" width={24} height={24} />
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.375rem",
                color: "var(--ink)",
              }}
            >
              hao.AI
            </span>
          </div>
          <DisplaySupportToggle
            mode={displaySupport}
            onChange={displaySupportPreference.persist}
          />
          <div
            style={{
              display: "flex",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <button
              type="button"
              onClick={() =>
                textScalePreference.persist(
                  TEXT_SCALES[Math.max(0, TEXT_SCALES.indexOf(textScale) - 1)],
                )
              }
              aria-label="Decrease Chinese text size"
              title="Decrease Chinese text size"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink)",
                cursor: "pointer",
                padding: "var(--space-2) var(--space-3)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
              }}
            >
              A-
            </button>
            <button
              type="button"
              onClick={() =>
                textScalePreference.persist(
                  TEXT_SCALES[
                    Math.min(
                      TEXT_SCALES.length - 1,
                      TEXT_SCALES.indexOf(textScale) + 1,
                    )
                  ],
                )
              }
              aria-label="Increase Chinese text size"
              title="Increase Chinese text size"
              style={{
                background: "transparent",
                border: "none",
                borderLeft: "1px solid var(--border)",
                color: "var(--ink)",
                cursor: "pointer",
                padding: "var(--space-2) var(--space-3)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
              }}
            >
              A+
            </button>
          </div>
          <ZhOnlyToggle
            checked={zhOnlyMode}
            onChange={zhOnlyModePreference.persist}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <HskPicker level={hskLevel} onChange={changeHskLevel} />
          <span title="Conversation history (coming soon)">
            <button
              type="button"
              disabled
              aria-disabled="true"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-disabled)",
                cursor: "not-allowed",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <ClockCounterClockwise weight="bold" size={26} />
            </button>
          </span>
          <UserButton />
        </div>
      </div>

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: `var(--space-4) var(--space-4) calc(var(--space-16) + var(--space-16))`,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-12)",
        }}
      >
        {history.map((turn, i) => {
          const isLast = i === history.length - 1;
          return (
            <TurnCard
              key={i}
              ref={isLast ? lastTurnRef : undefined}
              turn={turn}
              time={formatTurnTime(turnTimestamps[i])}
              textScale={textScale}
              displaySupport={displaySupport}
              rate={turnRates[i] ?? 1}
              speakingRates={SPEAKING_RATES}
              onPlay={() => void speak(turn.text_zh, i)}
              onRateChange={(rate: SpeakingRate) =>
                setTurnRates((r) => ({ ...r, [i]: rate }))
              }
              playbackDisabled={playingIndex !== null}
            />
          );
        })}
      </div>

      <div
        style={{
          position: "fixed",
          insetInline: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            width: "100%",
            padding: "0 var(--space-4)",
          }}
        >
          {error && <StatusLine variant="error">{error}</StatusLine>}
          {micError && <StatusLine variant="error">{micError}</StatusLine>}
          {speakError && <StatusLine variant="error">{speakError}</StatusLine>}
          {pending && <StatusLine variant="live">Thinking…</StatusLine>}
        </div>

        <div
          style={{
            backdropFilter: "blur(8px)",
            background: "color-mix(in srgb, var(--surface) 80%, transparent)",
            borderTop: "1px solid var(--border)",
            padding: "var(--space-3) var(--space-4)",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              justifySelf: "start",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setInputMode((m) => (m === "talk" ? "type" : "talk"))
              }
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink)",
                cursor: "pointer",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
              }}
              aria-label={
                inputMode === "talk" ? "Switch to typing" : "Switch to talking"
              }
              title={
                inputMode === "talk" ? "Switch to typing" : "Switch to talking"
              }
            >
              <Keyboard weight="bold" size={24} />
            </button>
          </div>

          <div style={{ justifySelf: "center" }}>
            {inputMode === "talk" ? (
              <MicButton
                onRecordingComplete={(blob) => void handleRecordedAudio(blob)}
                onMicError={setMicError}
                disabled={playingIndex !== null}
                disabledMessage={MIC_BLOCKED_MESSAGE}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  width: "100%",
                  maxWidth: 480,
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder="用中文写一句话…"
                  style={{
                    flex: 1,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-3)",
                    fontSize: "1.0625rem",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={pending || input.trim().length === 0}
                  title="Send"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--ink)",
                    cursor: "pointer",
                    opacity: pending || input.trim().length === 0 ? 0.4 : 1,
                    padding: "var(--space-3)",
                  }}
                >
                  <PaperPlaneTilt weight="bold" size={24} />
                </button>
              </div>
            )}
          </div>

          <span title="Attach (coming soon)" style={{ justifySelf: "end" }}>
            <button
              type="button"
              disabled
              aria-disabled="true"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-disabled)",
                cursor: "not-allowed",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <Plus weight="bold" size={24} />
            </button>
          </span>
        </div>
      </div>

      <audio ref={audioRef} style={{ display: "none" }} />

      <style jsx>{`
        .turn-in {
          animation: turn-in 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes turn-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .turn-in {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
