"use client";

import { useEffect, useRef, useState } from "react";
import { Microphone } from "@phosphor-icons/react";
import { isMisTap, smoothLevel } from "./mic-button-helpers";
import { MAX_AUDIO_BYTES } from "@/app/api/transcribe/validate";

type MicButtonProps = {
  onRecordingComplete: (blob: Blob) => void;
  onMicError: (message: string) => void;
  disabled?: boolean; // true at the 25-turn cap (Unit 9) and while the bot is speaking
  disabledMessage?: string; // shown via onMicError if the user presses while disabled
};

const MIC_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];
// Client-side only — the server does not enforce a duration cap (see
// validate.ts), this just avoids recording past the point the server would
// reject on size.
const MAX_RECORDING_MS = 60_000;

const BUTTON_SIZE = 96;
const CANVAS_SIZE = 220;
const CANVAS_INSET = (CANVAS_SIZE - BUTTON_SIZE) / 2;
const BASE_RADIUS = 59;
const MIS_TAP_HINT_MS = 1400;
const RELEASE_FADE_MS = 260;
const RIPPLE_DURATION_MS = 900;
const RIPPLE_LEVEL_THRESHOLD = 0.22;
const RIPPLE_MIN_GAP_MS = 250;

function pickSupportedMimeType(): string | null {
  return MIC_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

type Ripple = { start: number };

export default function MicButton({
  onRecordingComplete,
  onMicError,
  disabled,
  disabledMessage,
}: MicButtonProps) {
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState<"idle" | "listening" | "mistap">("idle");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const micRingColorRef = useRef("");
  const reducedMotionRef = useRef(false);

  const pressStartRef = useRef(0);
  const holdingRef = useRef(false);
  const fadingRef = useRef(false);
  const fadeUntilRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const ripplesRef = useRef<Ripple[]>([]);
  const lastRippleAtRef = useRef(0);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const syntheticRef = useRef(false);
  const mistapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    micRingColorRef.current = getComputedStyle(canvas)
      .getPropertyValue("--mic-ring")
      .trim();
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctxRef.current = ctx;
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (stopTimerRef.current !== null) clearTimeout(stopTimerRef.current);
      if (mistapTimerRef.current !== null) clearTimeout(mistapTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  function readLevel(): number {
    const analyser = analyserRef.current;
    const data = timeDataRef.current;
    if (syntheticRef.current || !analyser || !data) {
      const t = performance.now() / 1000;
      const synthetic =
        0.25 +
        0.2 * Math.abs(Math.sin(t * 2.3)) +
        (Math.random() < 0.03 ? Math.random() * 0.3 : 0);
      return Math.min(1, synthetic);
    }
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const centered = (data[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    return Math.min(1, rms * 4);
  }

  function drawFrame(now: number) {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const target = readLevel();
    levelRef.current = smoothLevel(levelRef.current, target);
    const level = levelRef.current;

    let alpha = 1;
    if (fadingRef.current) {
      alpha = Math.max(0, (fadeUntilRef.current - now) / RELEASE_FADE_MS);
      if (alpha <= 0) {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        fadingRef.current = false;
        rafRef.current = null;
        return;
      }
    }

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const stroke = micRingColorRef.current;
    const reduced = reducedMotionRef.current;
    const t = now / 1000;

    if (!reduced && !fadingRef.current) {
      if (
        level > RIPPLE_LEVEL_THRESHOLD &&
        now - lastRippleAtRef.current >= RIPPLE_MIN_GAP_MS
      ) {
        ripplesRef.current.push({ start: now });
        lastRippleAtRef.current = now;
      }
    }
    ripplesRef.current = ripplesRef.current.filter(
      (r) => now - r.start < RIPPLE_DURATION_MS,
    );
    if (!reduced) {
      for (const ripple of ripplesRef.current) {
        const age = (now - ripple.start) / RIPPLE_DURATION_MS;
        const radius =
          BASE_RADIUS + 6 + (BASE_RADIUS + 40 - (BASE_RADIUS + 6)) * age;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = (1 - age) * 0.3 * alpha;
        ctx.stroke();
      }
    }

    // Inner echo
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, BASE_RADIUS - 6 - level * 10), 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.36 * alpha;
    ctx.stroke();

    // Blob
    ctx.beginPath();
    const points = 84;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      let radius: number;
      if (reduced) {
        radius = BASE_RADIUS + level * 22;
      } else {
        const wobble =
          Math.sin(angle * 3 + t * 1.7) +
          Math.sin(angle * 5 + t * 2.3 + 1) +
          Math.sin(angle * 2 + t * 1.1 + 2);
        radius = BASE_RADIUS + wobble * (3 + level * 34) + level * 12;
      }
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9 * alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;

    rafRef.current = requestAnimationFrame(drawFrame);
  }

  function startLoop() {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }

  async function setUpMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      syntheticRef.current = false;

      const AudioCtx = window.AudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      timeDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      const mimeType = pickSupportedMimeType();
      if (!mimeType) {
        onMicError("Voice input isn't supported in this browser.");
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        if (blob.size > MAX_AUDIO_BYTES) {
          onMicError("Recording too large — try a shorter clip.");
          return;
        }
        onRecordingComplete(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      stopTimerRef.current = setTimeout(() => stopRecorder(), MAX_RECORDING_MS);
    } catch {
      onMicError("Microphone access denied — check your browser settings.");
      syntheticRef.current = true;
    }
  }

  function stopRecorder() {
    if (stopTimerRef.current !== null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function handlePointerDown() {
    if (disabled) {
      if (disabledMessage) onMicError(disabledMessage);
      return;
    }
    if (holdingRef.current) return;
    holdingRef.current = true;
    pressStartRef.current = performance.now();
    fadingRef.current = false;
    setHolding(true);
    setHint("listening");
    startLoop();
    void setUpMic();
  }

  function handlePointerUp() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    const heldMs = performance.now() - pressStartRef.current;

    if (isMisTap(heldMs)) {
      stopRecorder();
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      levelRef.current = 0;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ctx = ctxRef.current;
      if (ctx) ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      setHint("mistap");
      if (mistapTimerRef.current !== null) clearTimeout(mistapTimerRef.current);
      mistapTimerRef.current = setTimeout(
        () => setHint("idle"),
        MIS_TAP_HINT_MS,
      );
      return;
    }

    setHint("idle");
    stopRecorder();
    fadingRef.current = true;
    fadeUntilRef.current = performance.now() + RELEASE_FADE_MS;
    startLoop();
  }

  const hintText =
    hint === "mistap"
      ? "Hold longer to talk"
      : hint === "listening"
        ? "Listening…"
        : "Hold to talk";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -CANVAS_INSET,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            pointerEvents: "none",
            opacity: holding || fadingRef.current ? 1 : 0,
            transition: "opacity .2s",
            zIndex: 1,
          }}
        />
        <button
          type="button"
          aria-label="Hold to record a message in Chinese"
          aria-disabled={disabled}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              handlePointerDown();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") handlePointerUp();
          }}
          className="mic-button"
          style={{
            position: "relative",
            zIndex: 2,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: "var(--radius-full)",
            background: disabled ? "var(--surface-sunken)" : "var(--action)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled ? "not-allowed" : "pointer",
            transform: holding ? "scale(1.04)" : "scale(1)",
            transition: "transform .18s cubic-bezier(.16,1,.3,1)",
          }}
        >
          <Microphone
            weight="fill"
            size={38}
            color={disabled ? "var(--text-disabled)" : "var(--text-inverse)"}
            style={{
              transform: holding ? "scale(.9)" : "scale(1)",
              transition: "transform .18s cubic-bezier(.16,1,.3,1)",
            }}
          />
        </button>
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.875rem",
          color: "var(--text-muted)",
        }}
      >
        {hintText}
      </span>
      <style jsx>{`
        .mic-button::before {
          content: "";
          position: absolute;
          inset: -12px;
          border-radius: var(--radius-full);
          border: 1px solid var(--mic-ring-track);
          opacity: ${holding ? 0 : 0.6};
          transform: scale(${holding ? 1.15 : 1});
          transition:
            opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
