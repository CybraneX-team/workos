import { useState } from "react";
import { useCreateAccount, useHasAccount, useResetAccount, useSwitchActingAs, useTeamRoster } from "./localBackend";
import type { MemberRole } from "./lemma";

const SHELL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "#bdeaf5",
  color: "#20362a",
  fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
};

const CARD: React.CSSProperties = {
  width: 400,
  maxWidth: "92vw",
  background: "#fff",
  borderRadius: 20,
  padding: 32,
  boxShadow: "0 20px 60px rgba(32, 54, 42, 0.18)",
};

function RoleCard({ label, desc, active, onClick }: { label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        background: active ? "#e8f7ec" : "#f5f5f2",
        border: active ? "2px solid #2f8d4d" : "2px solid transparent",
        borderRadius: 12,
        padding: 12,
        cursor: "pointer",
        flex: 1,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#66806d", lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

function CreateAccountScreen() {
  const createAccount = useCreateAccount();
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("manager");

  return (
    <div style={SHELL}>
      <div style={CARD}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, color: "#2f8d4d", marginBottom: 8 }}>
          Task Arcade
        </div>
        <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Build your world</h1>
        <p style={{ fontSize: 13, color: "#66806d", margin: "0 0 20px", lineHeight: 1.5 }}>
          Create your account to start assigning tasks, clearing them, and placing builds in the world.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createAccount(name.trim(), role);
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Your name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya"
              maxLength={40}
              style={{ border: "1px solid #d8e0d9", borderRadius: 10, padding: "11px 14px", fontSize: 14 }}
            />
          </label>
          <div style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Your role</span>
            <div style={{ display: "flex", gap: 10 }}>
              <RoleCard
                label="Manager"
                desc="Assign tasks and review builds."
                active={role === "manager"}
                onClick={() => setRole("manager")}
              />
              <RoleCard
                label="Member"
                desc="Clear tasks and place builds."
                active={role === "member"}
                onClick={() => setRole("member")}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: name.trim() ? "#2f8d4d" : "#a8b8ac",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              cursor: name.trim() ? "pointer" : "not-allowed",
            }}
          >
            Enter the world
          </button>
        </form>
        <p style={{ fontSize: 11, color: "#8a9c8f", lineHeight: 1.5, marginTop: 16 }}>
          A few teammates (Riya, Asha, Rohan, Maya) are seeded automatically so the full
          assign → clear → place → review loop works right away.
        </p>
      </div>
    </div>
  );
}

// Floating bar: lets you act as any seeded team member (to try both the
// manager and member sides of the loop solo) plus a reset control.
export function DemoControls() {
  const hasAccount = useHasAccount();
  const resetAccount = useResetAccount();
  const switchActingAs = useSwitchActingAs();
  const { members, currentEmail } = useTeamRoster();
  if (!hasAccount) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 14,
        right: 14,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(32, 54, 42, 0.78)",
        borderRadius: 10,
        padding: "6px 8px",
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      }}
    >
      <span style={{ fontSize: 10, color: "#cfe6d6", fontWeight: 600, paddingLeft: 4 }}>Acting as</span>
      <select
        value={currentEmail ?? ""}
        onChange={(e) => switchActingAs(e.target.value)}
        style={{
          background: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "5px 8px",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {members.map((m) => (
          <option key={m.email} value={m.email}>
            {m.name} — {m.role}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Reset the local demo? This clears your account, teammates, and tasks.")) {
            resetAccount();
          }
        }}
        style={{
          background: "rgba(255, 255, 255, 0.14)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reset demo
      </button>
    </div>
  );
}

export function AccountGate({ children }: { children: React.ReactNode }) {
  const hasAccount = useHasAccount();
  if (!hasAccount) return <CreateAccountScreen />;
  return <>{children}</>;
}
