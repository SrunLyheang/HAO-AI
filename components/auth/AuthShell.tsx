import type { ReactNode } from "react";

export default function AuthShell({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--canvas)",
        padding: "var(--space-4)",
      }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          width: "100%",
          maxWidth: 960,
          overflow: "hidden",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
        className="auth-shell-grid"
      >
        <div
          style={{
            position: "relative",
            minHeight: 480,
            overflow: "hidden",
            background: "var(--canvas)",
            alignItems: "center",
            justifyContent: "center",
          }}
          className="auth-brand-panel"
        >
          <div className="auth-aurora-blob auth-aurora-blob-1" aria-hidden="true" />
          <div className="auth-aurora-blob auth-aurora-blob-2" aria-hidden="true" />
          <div className="auth-sparkle-layer auth-sparkle-layer-a" aria-hidden="true" />
          <div className="auth-sparkle-layer auth-sparkle-layer-b" aria-hidden="true" />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static app-icon asset, not a Next/Image-optimized content image */}
            <img src="/icon.svg" alt="" width={72} height={72} />
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.75rem",
                color: "var(--ink)",
              }}
            >
              hao.AI
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "var(--space-8) var(--space-6)",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--text-hero)",
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            {heading}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-ui)",
              color: "var(--text-secondary)",
              margin: "var(--space-2) 0 var(--space-6)",
            }}
          >
            {subheading}
          </p>
          <div style={{ width: "100%", maxWidth: 360 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
