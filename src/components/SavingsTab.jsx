import React, { useMemo, useState } from "react";
import usePersistentState from "../hooks/usePersistentState";
import { formatCurrency } from "../utils/format";
import { uid } from "../utils/uid";

// Lightweight modal used only inside this tab
function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          background: "white",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ fontSize: 18, lineHeight: 1, border: 0, background: "transparent", cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Defaults shown/created on first run (can be removed or renamed by user)
const DEFAULT_GOALS = [
  { templateId: "emergency", name: "Emergency Fund", target: 600 },
  { templateId: "longterm", name: "Long-term Savings", target: null }, // no target => bar is shown as “filled”
  { templateId: "gift", name: "Large Gift Savings", target: 0 },
];

function clamp(n) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Number(n));
}

export default function SavingsTab() {
  // Persistent store for goals + simple history (local to this tab)
  const [goals, setGoals] = usePersistentState("savings.goals.v1", () =>
    DEFAULT_GOALS.map((g) => ({
      id: uid(),
      name: g.name,
      target: g.target, // null or 0 => “no target”
      balance: 0,
      createdAt: Date.now(),
    })),
  );
  const [history, setHistory] = usePersistentState("savings.history.v1", []);
  const [expandedId, setExpandedId] = useState(null);

  const [modal, setModal] = useState({ type: null, goalId: null }); // type: 'invest'|'withdraw'|'rename'|'add'|'remove'
  const activeGoal = goals.find((g) => g.id === modal.goalId) || null;

  const totals = useMemo(() => {
    const saved = goals.reduce((s, g) => s + (g.balance || 0), 0);
    const targeted = goals
      .filter((g) => g.target && g.target > 0)
      .reduce((s, g) => s + g.target, 0);
    return { saved, targeted };
  }, [goals]);

  function upsertGoal(next) {
    setGoals((prev) => prev.map((g) => (g.id === next.id ? next : g)));
  }
  function addGoal(newGoal) {
    setGoals((prev) => [{ id: uid(), balance: 0, createdAt: Date.now(), ...newGoal }, ...prev]);
  }
  function removeGoal(id) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }
  function addHistory(entry) {
    setHistory((prev) => [{ id: uid(), t: Date.now(), ...entry }, ...prev].slice(0, 500));
  }

  function applyTx(kind, goal, rawAmount) {
    const amt = clamp(parseFloat(rawAmount));
    if (!amt) return;
    const sign = kind === "invest" ? +1 : -1;
    const next = { ...goal, balance: clamp((goal.balance || 0) + sign * amt) };
    upsertGoal(next);
    addHistory({ kind, goalId: goal.id, goalName: goal.name, amount: amt });
  }

  return (
    <div style={{ padding: 16, paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Savings</h2>
        <button
          onClick={() => setModal({ type: "add", goalId: null })}
          style={{
            border: 0,
            borderRadius: 12,
            padding: "10px 14px",
            fontWeight: 700,
            cursor: "pointer",
            background: "linear-gradient(135deg,#22c55e,#16a34a)",
            color: "white",
          }}
        >
          + Add Goal
        </button>
      </div>

      {/* Totals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ background: "#ffffff", borderRadius: 16, padding: 14, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Total Saved</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{formatCurrency ? formatCurrency(totals.saved) : `$${totals.saved.toFixed(2)}`}</div>
        </div>
        <div style={{ background: "#ffffff", borderRadius: 16, padding: 14, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Total Targets</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {formatCurrency
              ? formatCurrency(totals.targeted || 0)
              : `$${Number(totals.targeted || 0).toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Goals list */}
      <div style={{ display: "grid", gap: 12 }}>
        {goals.map((g) => {
          const hasTarget = !!(g.target && g.target > 0);
          const pct = hasTarget ? Math.min(100, Math.round(((g.balance || 0) / g.target) * 100)) : 100;

          return (
            <div
              key={g.id}
              style={{
                background: "white",
                borderRadius: 16,
                padding: 14,
                boxShadow: "0 4px 16px rgba(0,0,0,.06)",
              }}
            >
              <button
                onClick={() => setExpandedId((id) => (id === g.id ? null : g.id))}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {hasTarget ? (
                      <>
                        {formatCurrency ? formatCurrency(g.balance || 0) : `$${(g.balance || 0).toFixed(2)}`}{" "}
                        /{" "}
                        {formatCurrency ? formatCurrency(g.target) : `$${Number(g.target).toFixed(2)}`}
                      </>
                    ) : (
                      <>{formatCurrency ? formatCurrency(g.balance || 0) : `$${(g.balance || 0).toFixed(2)}`}</>
                    )}
                  </div>
                </div>

                {/* progress bar */}
                <div style={{ marginTop: 10, height: 10, width: "100%", background: "#eef2f7", borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 999,
                      transition: "width .25s ease",
                      background:
                        pct >= 100
                          ? "linear-gradient(135deg,#6ee7b7,#34d399)"
                          : "linear-gradient(135deg,#60a5fa,#2563eb)",
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  {hasTarget ? `${pct}% of target` : "No target set"}
                </div>
              </button>

              {/* actions */}
              {expandedId === g.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setModal({ type: "invest", goalId: g.id })}
                    style={pillBtn("Invest")}
                    children="Invest"
                  />
                  <button
                    onClick={() => setModal({ type: "withdraw", goalId: g.id })}
                    style={pillBtn("Withdraw")}
                    children="Withdraw"
                  />
                  <button
                    onClick={() => setModal({ type: "rename", goalId: g.id })}
                    style={pillBtn("Edit")}
                    children="Rename / Target"
                  />
                  <button
                    onClick={() => setModal({ type: "remove", goalId: g.id })}
                    style={pillBtn("Remove")}
                    children="Remove"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ----- Modals ----- */}
      <Modal
        open={modal.type === "invest" && !!activeGoal}
        title={`Invest into ${activeGoal?.name ?? ""}`}
        onClose={() => setModal({ type: null, goalId: null })}
      >
        <AmountForm
          cta="Invest"
          onSubmit={(amt) => {
            applyTx("invest", activeGoal, amt);
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal
        open={modal.type === "withdraw" && !!activeGoal}
        title={`Withdraw from ${activeGoal?.name ?? ""}`}
        onClose={() => setModal({ type: null, goalId: null })}
      >
        <AmountForm
          cta="Withdraw"
          onSubmit={(amt) => {
            applyTx("withdraw", activeGoal, amt);
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal
        open={modal.type === "rename" && !!activeGoal}
        title={`Edit ${activeGoal?.name ?? ""}`}
        onClose={() => setModal({ type: null, goalId: null })}
      >
        {activeGoal && (
          <EditGoalForm
            initial={{ name: activeGoal.name, target: activeGoal.target ?? "" }}
            onSubmit={(vals) => {
              upsertGoal({ ...activeGoal, name: vals.name, target: vals.target === "" ? null : clamp(+vals.target) });
              setModal({ type: null, goalId: null });
            }}
          />
        )}
      </Modal>

      <Modal
        open={modal.type === "add"}
        title="Add Savings Goal"
        onClose={() => setModal({ type: null, goalId: null })}
      >
        <EditGoalForm
          initial={{ name: "", target: "" }}
          onSubmit={(vals) => {
            addGoal({
              name: vals.name || "New Goal",
              target: vals.target === "" ? null : clamp(+vals.target),
            });
            setModal({ type: null, goalId: null });
          }}
        />

        {/* Quick templates */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Templates</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEFAULT_GOALS.map((t) => (
              <button
                key={t.templateId}
                onClick={() => {
                  addGoal({ name: t.name, target: t.target ?? null });
                  setModal({ type: null, goalId: null });
                }}
                style={{
                  border: "1px dashed #d1d5db",
                  background: "#f9fafb",
                  padding: "8px 10px",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={modal.type === "remove" && !!activeGoal}
        title="Remove goal?"
        onClose={() => setModal({ type: null, goalId: null })}
      >
        <p style={{ fontSize: 14, margin: "8px 0 14px" }}>
          This removes <strong>{activeGoal?.name}</strong> from your list. It doesn’t delete your history.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => setModal({ type: null, goalId: null })}
            style={ghostBtn()}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              removeGoal(activeGoal.id);
              setModal({ type: null, goalId: null });
            }}
            style={dangerBtn()}
          >
            Remove
          </button>
        </div>
      </Modal>
    </div>
  );
}

function AmountForm({ cta, onSubmit }) {
  const [amount, setAmount] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(amount);
      }}
    >
      <label style={{ fontSize: 12, opacity: 0.8 }}>Amount</label>
      <input
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="submit" style={primaryBtn()}>{cta}</button>
      </div>
    </form>
  );
}

function EditGoalForm({ initial, onSubmit }) {
  const [name, setName] = useState(initial.name ?? "");
  const [target, setTarget] = useState(initial.target ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, target });
      }}
    >
      <label style={{ fontSize: 12, opacity: 0.8 }}>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g., Emergency Fund" />
      <label style={{ fontSize: 12, opacity: 0.8 }}>Target (optional)</label>
      <input
        inputMode="decimal"
        placeholder="e.g., 600"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="submit" style={primaryBtn()}>Save</button>
      </div>
    </form>
  );
}

/* --- tiny styling helpers (no external deps) --- */
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  margin: "6px 0 12px",
  fontSize: 16,
  outline: "none",
};

const pillBtn = () => ({
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  padding: "8px 12px",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 700,
});

const ghostBtn = () => ({
  border: "1px solid #e5e7eb",
  background: "white",
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 700,
});

const primaryBtn = () => ({
  border: 0,
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  color: "white",
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 800,
});

const dangerBtn = () => ({
  border: 0,
  background: "linear-gradient(135deg,#ef4444,#dc2626)",
  color: "white",
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 800,
});
