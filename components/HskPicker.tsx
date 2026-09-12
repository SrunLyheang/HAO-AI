"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check } from "@phosphor-icons/react";
import type { HskLevel } from "@/types";

type HskPickerProps = {
  level: HskLevel;
  onChange: (level: HskLevel) => void;
};

const LEVELS: HskLevel[] = [1, 2, 3, 4, 5, 6];

export default function HskPicker({ level, onChange }: HskPickerProps) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function selectLevel(next: HskLevel) {
    onChange(next);
    setOpen(false);
    setShowConfirm(true);
    setTimeout(() => setShowConfirm(false), 2000);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Change HSK level"
          style={{
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border)",
            background: showConfirm ? "var(--ok-bg)" : "var(--surface)",
            color: showConfirm ? "var(--ok-text)" : "var(--text-secondary)",
            fontSize: "0.9375rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "var(--space-2) var(--space-3)",
            cursor: "pointer",
          }}
        >
          {showConfirm ? "Saved" : `HSK ${level}`}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-2)",
            minWidth: 140,
          }}
        >
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => selectLevel(l)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3)",
                fontSize: "1.0625rem",
                color: "var(--ink)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              HSK {l}
              {l === level && <Check weight="bold" size={18} color="var(--live-text)" />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
