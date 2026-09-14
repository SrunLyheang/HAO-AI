"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import type { ConversationSummary, Turn } from "@/types";

type HistoryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (turns: Turn[]) => void;
};

function formatDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HistoryPanel({ open, onOpenChange, onSelect }: HistoryPanelProps) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data: { conversations: ConversationSummary[] }) => {
        setConversations(data.conversations);
        setError(null);
      })
      .catch(() => setError("Could not load history — try again."));
  }, [open]);

  async function selectConversation(c: ConversationSummary) {
    if (c.status === "active") {
      onOpenChange(false);
      return;
    }
    const res = await fetch(`/api/conversations/${c.id}`);
    if (!res.ok) {
      setError("Could not load that conversation — try again.");
      return;
    }
    const data: { turns: Turn[] } = await res.json();
    onSelect(data.turns);
    onOpenChange(false);
  }

  const sorted = conversations
    ? [...conversations].sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0))
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--scrim)",
            zIndex: 20,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            maxWidth: 420,
            background: "var(--surface)",
            borderTopLeftRadius: "var(--radius-lg)",
            borderBottomLeftRadius: "var(--radius-lg)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            zIndex: 21,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-4)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Dialog.Title style={{ fontSize: "1rem", color: "var(--ink)" }}>
              History
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close history"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--ink)",
                  cursor: "pointer",
                  padding: "var(--space-2)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <X weight="bold" size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{ padding: "var(--space-4)", color: "var(--err-text)" }}>{error}</div>
            )}
            {!error && sorted && sorted.length === 0 && (
              <div
                style={{
                  padding: "var(--space-8) var(--space-4)",
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                No past conversations yet.
              </div>
            )}
            {!error &&
              sorted?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void selectConversation(c)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    padding: "var(--space-4)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    {c.status === "active" ? "Current" : formatDate(c.createdAt)}
                  </div>
                  <div
                    style={{
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.preview}
                  </div>
                </button>
              ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
