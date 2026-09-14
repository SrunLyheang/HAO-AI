import { forwardRef } from "react";
import { Info, SpeakerHigh } from "@phosphor-icons/react";
import type { DisplaySupportMode, SpeakingRate, Turn } from "@/types";
import { toPinyin } from "@/lib/pinyin";
import CorrectionDisclosure from "@/components/CorrectionDisclosure";

type TurnCardProps = {
  turn: Turn;
  time: string;
  textScale: number;
  displaySupport: DisplaySupportMode;
  rate: SpeakingRate;
  speakingRates: SpeakingRate[];
  onPlay: () => void;
  onRateChange: (rate: SpeakingRate) => void;
  playbackDisabled: boolean;
};

// One turn's card — user bubble or AI response, extracted from app/page.tsx
// so rendering rules (display-support branching, rate buttons) live in one
// place, independent of the conversation orchestration around it.
const TurnCard = forwardRef<HTMLDivElement, TurnCardProps>(function TurnCard(
  { turn, time, textScale, displaySupport, rate, speakingRates, onPlay, onRateChange, playbackDisabled },
  ref,
) {
  if (turn.role === "user") {
    return (
      <div ref={ref} className="turn-in" style={{ display: "flex", justifyContent: "flex-end" }}>
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
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {time}
            </span>
            <span
              style={{
                fontSize: `calc(0.9375rem * ${textScale})`,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              You
            </span>
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
              fontSize: `calc(1.125rem * ${textScale})`,
              textAlign: "right",
            }}
          >
            {toPinyin(turn.text_zh)}
          </p>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--ink)",
              fontSize: `calc(clamp(2.25rem, 6vw, 3.25rem) * ${textScale})`,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              textAlign: "right",
            }}
          >
            {turn.text_zh}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="turn-in"
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
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
            <Info weight="bold" size={14} color="var(--text-secondary)" />
          </span>
          <span
            style={{
              fontSize: `calc(0.8125rem * ${textScale})`,
              fontWeight: 600,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            hao.AI Tutor · {rate}x
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          {time}
        </span>
      </div>

      {displaySupport !== "hanzi_only" && displaySupport !== "audio" && (
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
        <p style={{ color: "var(--text)", fontSize: `calc(1.25rem * ${textScale})`, marginTop: "var(--space-2)" }}>
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
          onClick={onPlay}
          disabled={playbackDisabled}
          aria-label="Play tutor response"
          title="Play audio"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink)",
            cursor: playbackDisabled ? "not-allowed" : "pointer",
            opacity: playbackDisabled ? 0.4 : 1,
            padding: "var(--space-3)",
          }}
        >
          <SpeakerHigh weight="bold" size={26} />
        </button>
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          {speakingRates.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onRateChange(option)}
              style={{
                background: rate === option ? "var(--border-strong)" : "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--ink)",
                fontWeight: rate === option ? 600 : 400,
                padding: "var(--space-1) var(--space-2)",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
              }}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
      <CorrectionDisclosure correction={turn.correction} />
    </div>
  );
});

export default TurnCard;
