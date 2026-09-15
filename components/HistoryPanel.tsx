"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash, X } from "@phosphor-icons/react";
import type { ConversationSummary, Turn } from "@/types";

type HistoryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (turns: Turn[]) => void;
  onGoLive: () => void;
};

function formatDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HistoryPanel({ open, onOpenChange, onSelect, onGoLive }: HistoryPanelProps) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  // Guards selectConversation/removeConversation against a double-click
  // firing overlapping requests — same pattern as ConversationScreen's
  // "New conversation" pending guard.
  const [pendingId, setPendingId] = useState<string | null>(null);

  // No separate "loading" state — derived below as `conversations === null`
  // (still true on the very first open, before any fetch resolves).
  useEffect(() => {
    if (!open) return;
    fetch("/api/conversations")
      .then((r) => {
        if (!r.ok) throw new Error("history fetch failed");
        return r.json();
      })
      .then((data: { conversations: ConversationSummary[] }) => {
        setConversations(data.conversations);
        setError(null);
      })
      .catch(() => setError("Could not load history — try again."));
  }, [open]);

  async function selectConversation(c: ConversationSummary) {
    if (c.status === "active") {
      onGoLive();
      onOpenChange(false);
      return;
    }
    if (pendingId) return;
    setPendingId(c.id);
    const res = await fetch(`/api/conversations/${c.id}`);
    setPendingId(null);
    if (!res.ok) {
      setError("Could not load that conversation — try again.");
      return;
    }
    const data: { turns: Turn[] } = await res.json();
    onSelect(data.turns);
    onOpenChange(false);
  }

  async function removeConversation(c: ConversationSummary) {
    if (pendingId) return;
    if (!window.confirm("Delete this conversation? This can't be undone.")) return;
    setMutationError(null);
    setPendingId(c.id);
    try {
      const res = await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        setMutationError("Could not delete that conversation — try again.");
        return;
      }
      setConversations((prev) => prev?.filter((row) => row.id !== c.id) ?? prev);
    } catch {
      setMutationError("Could not delete that conversation — try again.");
    } finally {
      setPendingId(null);
    }
  }

  const sorted = conversations
    ? [...conversations].sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0))
    : null;
  const loading = conversations === null && !error;

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
            {loading && !error && (
              <div
                style={{
                  padding: "var(--space-8) var(--space-4)",
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                Loading…
              </div>
            )}
            {error && (
              <div style={{ padding: "var(--space-4)", color: "var(--err-text)" }}>{error}</div>
            )}
            {!error && mutationError && (
              <div style={{ padding: "var(--space-4)", color: "var(--err-text)" }}>{mutationError}</div>
            )}
            {!loading && !error && sorted && sorted.length === 0 && (
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
            {!loading &&
              !error &&
              sorted?.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    background: c.status === "active" ? "var(--border-strong)" : "transparent",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void selectConversation(c)}
                    disabled={pendingId !== null}
                    aria-disabled={pendingId !== null}
                    style={{
                      display: "block",
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      padding: "var(--space-4)",
                      cursor: pendingId !== null ? "not-allowed" : "pointer",
                      opacity: pendingId !== null && pendingId !== c.id ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (c.status !== "active") e.currentTarget.style.background = "var(--surface-sunken)";
                    }}
                    onMouseLeave={(e) => {
                      if (c.status !== "active") e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8125rem",
                        fontWeight: c.status === "active" ? 600 : 400,
                        color: c.status === "active" ? "var(--ink)" : "var(--text-secondary)",
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
                      {c.title ?? c.preview}
                    </div>
                  </button>
                  {c.status !== "active" && (
                    <button
                      type="button"
                      onClick={() => void removeConversation(c)}
                      disabled={pendingId !== null}
                      aria-disabled={pendingId !== null}
                      aria-label="Delete conversation"
                      title="Delete conversation"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: pendingId !== null ? "not-allowed" : "pointer",
                        opacity: pendingId !== null && pendingId !== c.id ? 0.5 : 1,
                        padding: "var(--space-4)",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--err-text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      <Trash weight="bold" size={18} />
                    </button>
                  )}
                </div>
              ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
