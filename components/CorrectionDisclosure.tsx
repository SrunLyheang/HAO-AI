"use client";

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { CaretDown, CaretRight } from "@phosphor-icons/react";

type CorrectionDisclosureProps = {
  correction: string;
};

export default function CorrectionDisclosure({ correction }: CorrectionDisclosureProps) {
  const [open, setOpen] = useState(false);
  if (correction === "") return null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} style={{ marginTop: "var(--space-2)" }}>
      <Collapsible.Trigger
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          background: "transparent",
          border: "none",
          padding: 0,
          fontSize: "0.9375rem",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        {open ? <CaretDown weight="bold" size={18} /> : <CaretRight weight="bold" size={18} />}
        Correction
      </Collapsible.Trigger>
      <Collapsible.Content
        style={{
          background: "var(--surface-inset)",
          color: "var(--warn-text)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginTop: "var(--space-2)",
          fontSize: "1.0625rem",
        }}
      >
        {correction}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
