import { ArrowLeft, Sparkles } from "lucide-react";

// The Quartermaster agent chat talks to a real Lemma agent/conversation API,
// which this local-backend build doesn't have. Rather than fake an AI chat,
// this route shows a plain placeholder — the rest of the app (world, tasks,
// review) is fully interactive against the local dummy backend.
export function QuartermasterPage() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "#bdeaf5",
        color: "#20362a",
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        textAlign: "center",
        padding: 24,
      }}
    >
      <Sparkles size={32} color="#2f8d4d" />
      <div style={{ fontSize: 20, fontWeight: 700 }}>Quartermaster isn't available here</div>
      <div style={{ fontSize: 14, color: "#66806d", maxWidth: 360, lineHeight: 1.5 }}>
        This local demo swaps out the Lemma backend for in-memory data, so the agent chat
        (which needs a real deployed agent) is disabled. World, Tasks, and Review all work.
      </div>
      <a
        href="#/"
        style={{
          marginTop: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          background: "#2f8d4d",
          color: "#fff",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={14} /> Back to the world
      </a>
    </div>
  );
}
