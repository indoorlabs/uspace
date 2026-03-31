"use client";

export default function TopBar() {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        background: "rgba(18, 23, 33, 0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--panel-border)",
        fontFamily: '"Inter", "JetBrains Mono", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: "linear-gradient(135deg, var(--accent), #0088aa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}
        >
          U
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.02em" }}>
          uSpace
        </span>
        <span
          style={{
            fontSize: 11, color: "var(--text-dim)",
            padding: "2px 8px",
            background: "rgba(0, 212, 255, 0.08)",
            border: "1px solid rgba(0, 212, 255, 0.15)",
            borderRadius: 4,
          }}
        >
          Robot Sim
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)", marginLeft: 4 }}>
          <div
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--green)",
              boxShadow: "0 0 6px var(--green)",
            }}
          />
          Live
        </div>
      </div>
    </header>
  );
}
