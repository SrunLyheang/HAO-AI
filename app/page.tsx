"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ClockCounterClockwise,
  Info,
  Keyboard,
  PaperPlaneTilt,
  Plus,
  SpeakerHigh,
} from "@phosphor-icons/react";
import type {
  DisplaySupportMode,
  HskLevel,
  SpeakingRate,
  TranscribeResponse,
  Turn,
} from "@/types";
import { toPinyin } from "@/lib/pinyin";
import MicButton from "@/components/MicButton";
import HskPicker from "@/components/HskPicker";
import CorrectionDisclosure from "@/components/CorrectionDisclosure";
import ZhOnlyToggle from "@/components/ZhOnlyToggle";
import DisplaySupportToggle from "@/components/DisplaySupportToggle";

// Hardcoded opening turn so first paint needs no server call. Unit 7 seeds the
// greeting server-side instead.
const GREETING: Turn = {
  role: "ai",
  text_zh: "你好！今天想聊什么？",
  pinyin: "nǐ hǎo！jīn tiān xiǎng liáo shén me？",
  text_en: "Hi! What would you like to talk about today?",
  correction: "",
  correctionPinyin: "",
};

const HSK_LEVEL_STORAGE_KEY = "hsk_level";
const HSK_LEVEL_CHANGE_EVENT = "hsk-level-change";

// Default off: mic transcribes literally in whatever language was spoken.
// On: forces the Whisper language hint to "zh", which makes spoken English
// come back translated into Chinese (see lib/groq-stt.ts).
const ZH_ONLY_STORAGE_KEY = "zh_only_mode";
const ZH_ONLY_CHANGE_EVENT = "zh-only-mode-change";

// Matches the current live-app rate options (see the ElevenLabs-speed-limit
// note in lib/elevenlabs-tts.ts) — restyled here, not widened. Now selected
// per AI turn (see turnRates below) instead of one app-wide value.
const SPEAKING_RATES: SpeakingRate[] = [0.75, 1, 1.5];

const MIC_BLOCKED_MESSAGE =
  "Wait for the bot to finish speaking before recording.";

// Which lines of an AI turn are shown — a display preference, stored the
// same way as hsk_level (localStorage, before any DB write path exists).
const DISPLAY_SUPPORT_STORAGE_KEY = "display_support";
const DISPLAY_SUPPORT_CHANGE_EVENT = "display-support-change";
const DISPLAY_SUPPORT_MODES: DisplaySupportMode[] = [
  "all",
  "hanzi_pinyin",
  "hanzi_only",
  "audio",
];

function isDisplaySupportMode(value: string): value is DisplaySupportMode {
  return (DISPLAY_SUPPORT_MODES as string[]).includes(value);
}

function readStoredDisplaySupport(): DisplaySupportMode {
  const raw = localStorage.getItem(DISPLAY_SUPPORT_STORAGE_KEY);
  return raw !== null && isDisplaySupportMode(raw) ? raw : "all";
}

function getServerDisplaySupport(): DisplaySupportMode {
  return "all";
}

function subscribeToDisplaySupport(callback: () => void) {
  window.addEventListener(DISPLAY_SUPPORT_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(DISPLAY_SUPPORT_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function persistDisplaySupport(mode: DisplaySupportMode) {
  localStorage.setItem(DISPLAY_SUPPORT_STORAGE_KEY, mode);
  window.dispatchEvent(new Event(DISPLAY_SUPPORT_CHANGE_EVENT));
}

// User-adjustable size for the transcript's Chinese/pinyin/English text only
// (chrome — buttons, labels, icons — stays fixed). Local-only, like hsk_level
// before the DB write path exists.
const TEXT_SCALE_STORAGE_KEY = "text_scale";
const TEXT_SCALES = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2,
] as const;
type TextScale = (typeof TEXT_SCALES)[number];

const TEXT_SCALE_CHANGE_EVENT = "text-scale-change";

function readStoredTextScale(): TextScale {
  const raw = Number(localStorage.getItem(TEXT_SCALE_STORAGE_KEY));
  return (TEXT_SCALES as readonly number[]).includes(raw)
    ? (raw as TextScale)
    : 1;
}

function getServerTextScale(): TextScale {
  return 1;
}

function subscribeToTextScale(callback: () => void) {
  window.addEventListener(TEXT_SCALE_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(TEXT_SCALE_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function persistTextScale(scale: TextScale) {
  localStorage.setItem(TEXT_SCALE_STORAGE_KEY, String(scale));
  window.dispatchEvent(new Event(TEXT_SCALE_CHANGE_EVENT));
}

function isHskLevel(n: number): n is HskLevel {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

function readStoredHskLevel(): HskLevel {
  const level = Number(localStorage.getItem(HSK_LEVEL_STORAGE_KEY));
  return isHskLevel(level) ? level : 3;
}

function readStoredZhOnlyMode(): boolean {
  return localStorage.getItem(ZH_ONLY_STORAGE_KEY) === "true";
}

function getServerZhOnlyMode(): boolean {
  return false;
}

function subscribeToZhOnlyMode(callback: () => void) {
  window.addEventListener(ZH_ONLY_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(ZH_ONLY_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function persistZhOnlyMode(next: boolean) {
  localStorage.setItem(ZH_ONLY_STORAGE_KEY, String(next));
  window.dispatchEvent(new Event(ZH_ONLY_CHANGE_EVENT));
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

function errorMessage(data: unknown, status: number): string {
  return typeof data === "object" && data !== null && "error" in data
    ? String((data as { error: unknown }).error)
    : `Request failed (${status})`;
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

export default function Home() {
  const [history, setHistory] = useState<Turn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<"talk" | "type">("talk");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const zhOnlyMode = useSyncExternalStore(
    subscribeToZhOnlyMode,
    readStoredZhOnlyMode,
    getServerZhOnlyMode,
  );
  // Per-AI-turn playback speed (index -> rate), default 1x. Replaces the old
  // single app-wide rate switcher (see progress-tracker.md).
  const [turnRates, setTurnRates] = useState<Record<number, SpeakingRate>>({});
  // Per-turn "sent at" time, display-only — seeded for the greeting, then
  // appended alongside setHistory in send() below.
  const [turnTimestamps, setTurnTimestamps] = useState<number[]>([]);
  const textScale = useSyncExternalStore(
    subscribeToTextScale,
    readStoredTextScale,
    getServerTextScale,
  );
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const hskLevel = useSyncExternalStore(
    subscribeToHskLevel,
    readStoredHskLevel,
    getServerHskLevel,
  );
  const displaySupport = useSyncExternalStore(
    subscribeToDisplaySupport,
    readStoredDisplaySupport,
    getServerDisplaySupport,
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
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
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

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // No `rate` — ElevenLabs' speed is hard-limited to 0.7-1.2, too
        // narrow for this app's rate range, so the server always synthesizes
        // at natural speed and playbackRate scales it here.
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data: unknown = await res.json();
        setSpeakError(errorMessage(data, res.status));
        setPlayingIndex(null);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.src) URL.revokeObjectURL(audio.src);
      audio.src = url;
      audio.playbackRate = turnRates[index] ?? 1;
      await audio.play();
    } catch {
      setSpeakError("Could not play audio — try again.");
      setPlayingIndex(null);
    }
  }

  async function send(message: string) {
    message = message.trim();
    if (!message || pending) return;

    const userTurn: Turn = { role: "user", text_zh: message };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    setTurnTimestamps((t) => [...t, Date.now()]);
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
        setError(errorMessage(data, res.status));
        return;
      }
      setHistory([...nextHistory, data as Turn]);
      setTurnTimestamps((t) => [...t, Date.now()]);
      void speak((data as Turn).text_zh, nextHistory.length);
    } catch {
      setError("Network error — try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleRecordedAudio(blob: Blob) {
    const form = new FormData();
    form.append("audio", blob);
    form.append("mode", zhOnlyMode ? "zh" : "auto");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(errorMessage(data, res.status));
        return;
      }
      await send((data as TranscribeResponse).text);
    } catch {
      setError("Network error — try again.");
    }
  }

  return (
    <main style={{ position: "relative", minHeight: "100dvh" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          rowGap: "var(--space-2)",
          columnGap: "var(--space-4)",
          padding: "var(--space-4)",
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
            onChange={persistDisplaySupport}
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
                persistTextScale(
                  TEXT_SCALES[Math.max(0, TEXT_SCALES.indexOf(textScale) - 1)],
                )
              }
              aria-label="Decrease Chinese text size"
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
                persistTextScale(
                  TEXT_SCALES[
                    Math.min(
                      TEXT_SCALES.length - 1,
                      TEXT_SCALES.indexOf(textScale) + 1,
                    )
                  ],
                )
              }
              aria-label="Increase Chinese text size"
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
          <ZhOnlyToggle checked={zhOnlyMode} onChange={persistZhOnlyMode} />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <HskPicker level={hskLevel} onChange={persistHskLevel} />
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
            <div
              key={i}
              ref={isLast ? lastTurnRef : undefined}
              className="turn-in"
            >
              {turn.role === "user" ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div
                    style={{
                      maxWidth: "85%",
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--space-4) var(--space-6)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "baseline",
                        gap: "var(--space-2)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {formatTurnTime(turnTimestamps[i])}
                      </span>
                      <span
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 600,
                          color: "var(--text-secondary)",
                        }}
                      >
                        You
                      </span>
                    </div>
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        color: "var(--text-secondary)",
                        fontSize: `calc(0.9375rem * ${textScale})`,
                        textAlign: "right",
                      }}
                    >
                      {toPinyin(turn.text_zh)}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        color: "var(--ink)",
                        fontSize: `calc(1.25rem * ${textScale})`,
                        textAlign: "right",
                      }}
                    >
                      {turn.text_zh}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-6)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "var(--space-4)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "var(--surface-sunken)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Info
                          weight="bold"
                          size={14}
                          color="var(--text-secondary)"
                        />
                      </span>
                      <span
                        style={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        hao.AI Tutor · {turnRates[i] ?? 1}x
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {formatTurnTime(turnTimestamps[i])}
                    </span>
                  </div>

                  {displaySupport !== "hanzi_only" &&
                    displaySupport !== "audio" && (
                      <p
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-secondary)",
                          fontSize: `calc(1.125rem * ${textScale})`,
                        }}
                      >
                        {turn.pinyin}
                      </p>
                    )}
                  {displaySupport !== "audio" && (
                    <p
                      style={{
                        fontFamily: "var(--font-serif)",
                        color: "var(--ink)",
                        fontSize: `calc(clamp(2.25rem, 6vw, 3.25rem) * ${textScale})`,
                        lineHeight: 1.15,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {turn.text_zh}
                    </p>
                  )}
                  {displaySupport === "all" && (
                    <p
                      style={{
                        color: "var(--text)",
                        fontSize: `calc(1.25rem * ${textScale})`,
                        marginTop: "var(--space-2)",
                      }}
                    >
                      {turn.text_en}
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      marginTop: "var(--space-4)",
                      paddingTop: "var(--space-4)",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void speak(turn.text_zh, i)}
                      disabled={playingIndex !== null}
                      aria-label="Play tutor response"
                      title="Play audio"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ink)",
                        cursor:
                          playingIndex !== null ? "not-allowed" : "pointer",
                        opacity: playingIndex !== null ? 0.4 : 1,
                        padding: "var(--space-3)",
                      }}
                    >
                      <SpeakerHigh weight="bold" size={26} />
                    </button>
                    <div style={{ display: "flex", gap: "var(--space-1)" }}>
                      {SPEAKING_RATES.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() =>
                            setTurnRates((r) => ({ ...r, [i]: rate }))
                          }
                          style={{
                            background:
                              (turnRates[i] ?? 1) === rate
                                ? "var(--border-strong)"
                                : "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            color: "var(--ink)",
                            fontWeight:
                              (turnRates[i] ?? 1) === rate ? 600 : 400,
                            padding: "var(--space-1) var(--space-2)",
                            fontSize: "0.75rem",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                          }}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <CorrectionDisclosure correction={turn.correction} />
                </div>
              )}
            </div>
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
