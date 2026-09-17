"use client";

type ZhOnlyToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
};

// Standard switch pattern (role="switch") instead of a plain button that
// only differs by background color — the track + thumb makes the on/off
// state readable at a glance without relying on bold text or dark fills.
export default function ZhOnlyToggle({ checked, onChange }: ZhOnlyToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={checked ? "English speech is translated to Chinese" : "Speak in either language"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "var(--space-3) 0",
        minHeight: 44,
      }}
    >
      <span
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {checked ? "EN→中" : "中/EN"}
      </span>
      <span
        style={{
          position: "relative",
          width: 38,
          height: 22,
          borderRadius: "var(--radius-full)",
          background: checked ? "var(--text-muted)" : "var(--surface-sunken)",
          border: "1px solid var(--border)",
          transition: "background 150ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: checked ? 17 : 1,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--surface)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
            transition: "left 150ms ease",
          }}
        />
      </span>
    </button>
  );
}
