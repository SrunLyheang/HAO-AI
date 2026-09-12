"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check } from "@phosphor-icons/react";
import type { DisplaySupportMode } from "@/types";

type Option = { value: DisplaySupportMode; label: string };

const OPTIONS: Option[] = [
  { value: "all", label: "All (Hanzi + Pinyin + English)" },
  { value: "hanzi_pinyin", label: "Hanzi + Pinyin" },
  { value: "hanzi_only", label: "Hanzi Only" },
  { value: "audio", label: "Audio Challenge" },
];

const SHORT_LABEL: Record<DisplaySupportMode, string> = {
  all: "All",
  hanzi_pinyin: "Hanzi+Pinyin",
  hanzi_only: "Hanzi Only",
  audio: "Audio",
};

type DisplaySupportToggleProps = {
  mode: DisplaySupportMode;
  onChange: (next: DisplaySupportMode) => void;
};

// One trigger + popover, same pattern as HskPicker — keeps the header to one
// control instead of four always-visible segments (which crowded narrow
// widths).
export default function DisplaySupportToggle({ mode, onChange }: DisplaySupportToggleProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          style={{
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-secondary)",
            fontSize: "0.8125rem",
            padding: "var(--space-2) var(--space-3)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Display: {SHORT_LABEL[mode]}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-2)",
            minWidth: 220,
          }}
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3)",
                fontSize: "0.9375rem",
                color: "var(--ink)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {option.label}
              {option.value === mode && <Check weight="bold" size={18} color="var(--live-text)" />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
