"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  ClockCounterClockwise,
  Keyboard,
  Microphone,
  Moon,
  PaperPlaneTilt,
  Plus,
  Sun,
} from "@phosphor-icons/react";
import { UserButton } from "@clerk/nextjs";
import type { Conversation, DisplaySupportMode, HskLevel, SpeakingRate, Turn } from "@/types";
import MicButton from "@/components/MicButton";
import HskPicker from "@/components/HskPicker";
import ZhOnlyToggle from "@/components/ZhOnlyToggle";
import DisplaySupportToggle from "@/components/DisplaySupportToggle";
import TurnCard from "@/components/TurnCard";
import HistoryPanel from "@/components/HistoryPanel";
import { createPersistedPreference, themePreference } from "@/components/preference-store";
import * as conversation from "@/components/conversation-client";

const MAX_TURNS_PER_CONVERSATION = 25;

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
  0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4,
  1.5, 1.6, 1.8, 2,
] as const;
type TextScale = (typeof TEXT_SCALES)[number];

const textScalePreference = createPersistedPreference<TextScale>({
  storageKey: "text_scale",
  changeEvent: "text-scale-change",
  fallback: 0.7,
  isValid: (raw) => (TEXT_SCALES as readonly number[]).includes(Number(raw)),
  parse: (raw) => Number(raw) as TextScale,
});

// Per-turn "sent at" time, display-only (mirrors the mockup's timestamps).
// Now sourced from each turn's persisted createdAt (Unit 7c).
// toLocaleTimeString resolves the server's default locale/timezone during
// SSR, which can differ from the browser's — callers must gate this behind
// a mounted check so the SSR/hydration pass renders a stable placeholder.
function formatTurnTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], {
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
  // Same hydration-safe pattern as the preference stores above: server
  // snapshot is always false, so formatTurnTime's locale-dependent output
  // (see comment on that function) is deferred until after hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [history, setHistory] = useState<Turn[]>(initialTurns);
  const [conversationId, setConversationId] = useState(activeConversation.id);
  const [viewMode, setViewMode] = useState<"live" | "history">("live");
  const [historyTurns, setHistoryTurns] = useState<Turn[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<"talk" | "type">("talk");
  const [pending, setPending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [newConversationPending, setNewConversationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same useSyncExternalStore pattern as `mounted` above — avoids the
  // set-state-in-effect hydration mismatch a plain useState+useEffect pair
  // would hit (server always has navigator.onLine === true).
  const offline = useSyncExternalStore(
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    () => !navigator.onLine,
    () => false,
  );
  const [textScaleMessage, setTextScaleMessage] = useState<string | null>(null);
  const textScaleMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const zhOnlyMode = useSyncExternalStore(
    zhOnlyModePreference.subscribe,
    zhOnlyModePreference.read,
    zhOnlyModePreference.getServer,
  );
  const darkMode = useSyncExternalStore(
    themePreference.subscribe,
    themePreference.read,
    themePreference.getServer,
  );
  // Per-AI-turn playback speed (index -> rate), default 1x. Replaces the old
  // single app-wide rate switcher (see progress-tracker.md).
  const [turnRates, setTurnRates] = useState<Record<number, SpeakingRate>>({});
  const textScale = useSyncExternalStore(
    textScalePreference.subscribe,
    textScalePreference.read,
    textScalePreference.getServer,
  );
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  // Loaded from Postgres via /api/settings (Unit 7b) — 3 is the same
  // default getSettings() returns for a brand-new user, so there is no
  // visible flash once the fetch resolves.
  const [hskLevel, setHskLevel] = useState<HskLevel>(3);
  // Guards the initial GET from clobbering a level the user already changed
  // before it resolved, and chains PATCHes so out-of-order responses can't
  // persist a stale level (see progress-tracker.md, settings race fix).
  const hskLevelUserChanged = useRef(false);
  const hskLevelWriteChain = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error("settings fetch failed");
        return r.json();
      })
      .then((data: { hskLevel: HskLevel }) => {
        if (!cancelled && !hskLevelUserChanged.current) setHskLevel(data.hskLevel);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your HSK level — using the default.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function changeHskLevel(level: HskLevel) {
    hskLevelUserChanged.current = true;
    setHskLevel(level);
    hskLevelWriteChain.current = hskLevelWriteChain.current.then(() =>
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hskLevel: level }),
      })
        .then((r) => {
          if (!r.ok) setError("Could not save your HSK level — try again.");
        })
        .catch(() => setError("Could not save your HSK level — try again.")),
    );
  }
  function stepTextScale(direction: -1 | 1) {
    const i = TEXT_SCALES.indexOf(textScale);
    const nextIndex = Math.min(TEXT_SCALES.length - 1, Math.max(0, i + direction));
    if (nextIndex === i) {
      if (textScaleMessageTimer.current) clearTimeout(textScaleMessageTimer.current);
      setTextScaleMessage(
        direction === -1 ? "Smallest text size reached." : "Largest text size reached.",
      );
      textScaleMessageTimer.current = setTimeout(() => setTextScaleMessage(null), 2500);
      return;
    }
    textScalePreference.persist(TEXT_SCALES[nextIndex]);
  }

  const displaySupport = useSyncExternalStore(
    displaySupportPreference.subscribe,
    displaySupportPreference.read,
    displaySupportPreference.getServer,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTurnRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  // The fixed footer's height varies (error/Thinking… status lines stack
  // above the input row), so the scroll padding below it must track that —
  // a hardcoded value leaves the latest message hidden behind a taller footer.
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const observer = new ResizeObserver(([entry]) => {
      setFooterHeight(entry.contentRect.height);
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

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
  }, [history.length, footerHeight]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    return () => {
      if (textScaleMessageTimer.current) clearTimeout(textScaleMessageTimer.current);
    };
  }, []);

  async function speak(text: string, index: number) {
    if (playingIndex !== null) return;
    setPlayingIndex(index);
    setSpeakError(null);
    setTtsLoading(true);

    const result = await conversation.speak(text);
    setTtsLoading(false);
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
    setInput("");
    setError(null);
    setPending(true);

    const result = await conversation.reply(history, message, hskLevel, conversationId);
    if (!result.ok) {
      setError(result.error);
    } else {
      setHistory([...nextHistory, result.data]);
      void speak(result.data.text_zh, nextHistory.length);
    }
    setPending(false);
  }

  async function startNewConversation() {
    setError(null);
    setNewConversationPending(true);
    const res = await fetch("/api/conversations", { method: "POST" });
    if (!res.ok) {
      setError("Could not start a new conversation — try again.");
      setNewConversationPending(false);
      return;
    }
    const data: { conversation: Conversation; turns: Turn[] } = await res.json();
    setConversationId(data.conversation.id);
    setHistory(data.turns);
    setTurnRates({});
    setPending(false);
    setNewConversationPending(false);
    if (data.turns.length > 0) {
      void speak(data.turns[0].text_zh, 0);
    }
  }

  // Only the AI's seeded greeting exists until the user actually replies —
  // starting "another" conversation before that has happened is meaningless.
  const hasChatted = history.some((turn) => turn.role === "user");

  const conversationFull = history.length >= MAX_TURNS_PER_CONVERSATION;

  async function handleRecordedAudio(blob: Blob) {
    setError(null);
    setTranscribing(true);
    const result = await conversation.transcribe(
      blob,
      zhOnlyMode ? "zh" : "auto",
    );
    setTranscribing(false);
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
              onClick={() => stepTextScale(-1)}
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
            <span
              style={{
                display: "flex",
                alignItems: "center",
                borderLeft: "1px solid var(--border)",
                borderRight: "1px solid var(--border)",
                padding: "var(--space-2) var(--space-2)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                minWidth: "2.75rem",
                justifyContent: "center",
              }}
            >
              {Math.round(textScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => stepTextScale(1)}
              aria-label="Increase Chinese text size"
              title="Increase Chinese text size"
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
          <button
            type="button"
            onClick={() => themePreference.persist(!darkMode)}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink)",
              cursor: "pointer",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {darkMode ? <Sun weight="bold" size={22} /> : <Moon weight="bold" size={22} />}
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            title="Conversation history"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink)",
              cursor: "pointer",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <ClockCounterClockwise weight="bold" size={26} />
          </button>
          <UserButton />
        </div>
      </div>

      <HistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onSelect={(turns) => {
          setHistoryTurns(turns);
          setViewMode("history");
        }}
        onGoLive={() => setViewMode("live")}
      />

      {viewMode === "history" && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 9,
            backdropFilter: "blur(8px)",
            background: "color-mix(in srgb, var(--canvas) 85%, transparent)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              padding: "var(--space-3) var(--space-4)",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("live")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                background: "var(--surface)",
                color: "var(--ink)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-2) var(--space-4)",
                fontSize: "0.9375rem",
                cursor: "pointer",
              }}
            >
              <ArrowLeft weight="bold" size={18} />
              Back to conversation
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: `var(--space-4) var(--space-4) calc(${footerHeight}px + var(--space-4))`,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-12)",
        }}
      >
        {(viewMode === "history" ? historyTurns : history).map((turn, i) => {
          const isLast = viewMode === "live" && i === history.length - 1;
          return (
            <TurnCard
              key={i}
              ref={isLast ? lastTurnRef : undefined}
              style={isLast ? { scrollMarginBottom: `calc(${footerHeight}px + var(--space-4))` } : undefined}
              turn={turn}
              time={mounted ? formatTurnTime(turn.createdAt) : ""}
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
        ref={footerRef}
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
          {offline && (
            <StatusLine variant="error">
              You&rsquo;re offline — reconnect to keep chatting.
            </StatusLine>
          )}
          {error && <StatusLine variant="error">{error}</StatusLine>}
          {micError && <StatusLine variant="error">{micError}</StatusLine>}
          {speakError && <StatusLine variant="error">{speakError}</StatusLine>}
          {textScaleMessage && <StatusLine variant="ok">{textScaleMessage}</StatusLine>}
          {viewMode === "live" && conversationFull && (
            <StatusLine variant="error">
              This conversation is full — start a new one to keep going.
            </StatusLine>
          )}
          {transcribing && <StatusLine variant="live">Transcribing…</StatusLine>}
          {pending && <StatusLine variant="live">Thinking…</StatusLine>}
          {ttsLoading && <StatusLine variant="live">Loading audio…</StatusLine>}
        </div>

        {viewMode === "live" && (
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
              disabled={conversationFull}
              aria-disabled={conversationFull}
              style={{
                background: "transparent",
                border: "none",
                color: conversationFull ? "var(--text-disabled)" : "var(--ink)",
                cursor: conversationFull ? "not-allowed" : "pointer",
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
              {inputMode === "talk" ? (
                <Keyboard weight="bold" size={24} />
              ) : (
                <Microphone weight="bold" size={24} />
              )}
            </button>
          </div>

          <div style={{ justifySelf: "center" }}>
            {inputMode === "talk" ? (
              <MicButton
                onRecordingComplete={(blob) => void handleRecordedAudio(blob)}
                onMicError={setMicError}
                disabled={
                  playingIndex !== null ||
                  conversationFull ||
                  pending ||
                  transcribing ||
                  offline
                }
                disabledMessage={
                  conversationFull
                    ? "This conversation is full — start a new one to keep going."
                    : offline
                      ? "You're offline — reconnect to keep chatting."
                      : pending || transcribing
                        ? "Wait for the current message to finish."
                        : MIC_BLOCKED_MESSAGE
                }
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
                  placeholder="Type in Chinese…"
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
                  disabled={pending || conversationFull || offline || input.trim().length === 0}
                  title="Send"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--ink)",
                    cursor: "pointer",
                    opacity: pending || offline || input.trim().length === 0 ? 0.4 : 1,
                    padding: "var(--space-3)",
                  }}
                >
                  <PaperPlaneTilt weight="bold" size={24} />
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              justifySelf: "end",
            }}
          >
            {hasChatted && (
              <span title="New conversation">
                <button
                  type="button"
                  onClick={() => void startNewConversation()}
                  disabled={newConversationPending}
                  aria-disabled={newConversationPending}
                  aria-label="New conversation"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--ink)",
                    cursor: newConversationPending ? "not-allowed" : "pointer",
                    opacity: newConversationPending ? 0.4 : 1,
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <Plus weight="bold" size={24} />
                </button>
              </span>
            )}
          </div>
        </div>
        )}
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
