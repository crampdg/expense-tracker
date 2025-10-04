import React, { useMemo, useState } from "react";
import usePersistentState from "../hooks/usePersistentState";
import { money } from "../utils/format";
import uid from "../utils/uid";

/**
 * SavingsTab links to your global transactions:
 * - Pass `transactions` (array) and `onAddTransaction(tx)` from the parent (same as Wallet/Detailed).
 * - Balances are computed from transactions: EXPENSE to a goal = invest (↑goal, ↓cash); INFLOW from a goal = withdraw (↓goal, ↑cash).
 */

const safeUid =
  typeof uid === "function"
    ? uid
    : () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_TEMPLATES = [
  { key: "emergency", name: "Emergency Fund", target: 600 },
  { key: "longterm", name: "Long-term Savings", target: null },
  { key: "gift", name: "Large Gift Savings", target: 0 },
];

// clamp to positive number
function clamp(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

export default function SavingsTab({ transactions, onAddTransaction }) {
  // Persist goal *metadata* only (name/target). Balance comes from tx scan.
  const [goals, setGoals] = usePersistentState(
    "savings.goals.v2",
    DEFAULT_TEMPLATES.map((t) => ({
      id: safeUid(),
      name: t.name,
      target: t.target, // null or 0 means “no target”
      createdAt: Date.now(),
    }))
  );

  const [expandedId, setExpandedId] = useState(null);
  const [modal, setModal] = useState({ type: null, goalId: null }); // 'invest'|'withdraw'|'edit'|'add'|'remove'
  const txs = Array.isArray(transactions) ? transactions : [];

  // --- derive per-goal balances from transactions (single source of truth) ---
  const balancesById = useMemo(() => {
    const m = new Map();
    for (const g of Array.isArray(goals) ? goals : []) m.set(g.id, 0);

    for (const t of txs) {
      const meta = t?.meta || {};
      const gid = meta.savingsGoalId;
      if (!gid || !m.has(gid)) continue;

      const amt = Math.max(0, Number(t.amount) || 0);
      if (!amt) continue;

      // Convention:
      //  - expense to savings = invest -> increases goal balance
      //  - inflow from savings = withdraw -> decreases goal balance
      if (t.type === "expense") m.set(gid, (m.get(gid) || 0) + amt);
      else if (t.type === "inflow") m.set(gid, Math.max(0, (m.get(gid) || 0) - amt));
    }
    return m;
  }, [txs, goals]);

  const goalsList = Array.isArray(goals) ? goals : [];
  const activeGoal = goalsList.find((g) => g.id === modal.goalId) || null;

  const totals = useMemo(() => {
    let saved = 0, targeted = 0;
    for (const g of goalsList) {
      const bal = balancesById.get(g.id) || 0;
      saved += bal;
      if (g.target && g.target > 0) targeted += g.target;
    }
    return { saved, targeted };
  }, [goalsList, balancesById]);

  // --- CRUD helpers ---
  const upsertGoal = (next) => {
    setGoals((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const i = arr.findIndex((g) => g.id === next.id);
      if (i >= 0) arr[i] = next; else arr.unshift(next);
      return arr;
    });
  };
  const addGoal = (g) => upsertGoal({ id: safeUid(), name: g.name || "New Goal", target: g.target ?? null, createdAt: Date.now() });
  const removeGoal = (id) => setGoals((prev) => (Array.isArray(prev) ? prev.filter((g) => g.id !== id) : []));

  // --- tx emitters ---
  function emitSavingsTx(kind, goal, rawAmount, note) {
    const amt = clamp(rawAmount);
    if (!amt || !goal) return;

    // expense = invest (cash → savings), inflow = withdraw (savings → cash)
    const isInvest = kind === "invest";
    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString().slice(0, 10),
      type: isInvest ? "expense" : "inflow",
      category: `Savings: ${goal.name}`,
      amount: amt,
      note: note || (isInvest ? "Invested into savings goal" : "Withdrew from savings goal"),
      meta: { savings: true, savingsGoalId: goal.id, action: isInvest ? "invest" : "withdraw" },
    };

    // prefer parent’s handler so Wallet/Detailed/Summary update in one place
    if (typeof onAddTransaction === "function") {
      onAddTransaction(tx);
    } else {
      // soft fallback so the UI doesn’t crash if handler not passed
      try {
        const raw = localStorage.getItem("transactions");
        const arr = raw ? JSON.parse(raw) : [];
        arr.push(tx);
        localStorage.setItem("transactions", JSON.stringify(arr));
      } catch {}
    }
  }

  return (
    <div style={{ padding: 16, paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Savings</h2>
        <button
          onClick={() => setModal({ type: "add", goalId: null })}
          style={{
            border: 0, borderRadius: 12, padding: "10px 14px",
            fontWeight: 700, cursor: "pointer",
            background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white",
          }}
        >
          + Add Goal
        </button>
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Tile label="Total Saved" value={totals.saved} />
        <Tile label="Total Targets" value={totals.targeted} />
      </div>

      {/* Goals */}
      <div style={{ display: "grid", gap: 12 }}>
        {goalsList.map((g) => {
          const bal = balancesById.get(g.id) || 0;
          const hasTarget = !!(g.target && g.target > 0);
          const pct = hasTarget ? Math.min(100, Math.round((bal / g.target) * 100)) : 100;

          return (
            <div key={g.id} style={{ background: "white", borderRadius: 16, padding: 14, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
              <button
                onClick={() => setExpandedId((id) => (id === g.id ? null : g.id))}
                style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    {hasTarget ? (
                      <>
                        {money(bal)} / {money(g.target)}
                      </>
                    ) : (
                      <>{money(bal)}</>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 10, height: 10, width: "100%", background: "#eef2f7", borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${pct}%`, height: "100%", borderRadius: 999, transition: "width .25s ease",
                      background: pct >= 100
                        ? "linear-gradient(135deg,#6ee7b7,#34d399)"
                        : "linear-gradient(135deg,#60a5fa,#2563eb)",
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  {hasTarget ? `${pct}% of target` : "No target set"}
                </div>
              </button>

              {expandedId === g.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={() => setModal({ type: "invest", goalId: g.id })} style={pillBtn()} children="Invest" />
                  <button onClick={() => setModal({ type: "withdraw", goalId: g.id })} style={pillBtn()} children="Withdraw" />
                  <button onClick={() => setModal({ type: "edit", goalId: g.id })} style={pillBtn()} children="Rename / Target" />
                  <button onClick={() => setModal({ type: "remove", goalId: g.id })} style={pillBtnDanger()} children="Remove" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODALS */}
      <Modal open={modal.type === "invest" && !!activeGoal} title={`Invest into ${activeGoal?.name || ""}`} onClose={() => setModal({ type: null, goalId: null })}>
        <AmountForm
          cta="Invest"
          onSubmit={(amt, note) => {
            emitSavingsTx("invest", activeGoal, amt, note);
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "withdraw" && !!activeGoal} title={`Withdraw from ${activeGoal?.name || ""}`} onClose={() => setModal({ type: null, goalId: null })}>
        <AmountForm
          cta="Withdraw"
          onSubmit={(amt, note) => {
            emitSavingsTx("withdraw", activeGoal, amt, note);
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "edit" && !!activeGoal} title={`Edit ${activeGoal?.name || ""}`} onClose={() => setModal({ type: null, goalId: null })}>
        <EditGoalForm
          initial={{ name: activeGoal?.name ?? "", target: activeGoal?.target ?? "" }}
          onSubmit={(vals) => {
            upsertGoal({ ...activeGoal, name: vals.name || "Untitled Goal", target: vals.target === "" ? null : clamp(vals.target) });
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "add"} title="Add Savings Goal" onClose={() => setModal({ type: null, goalId: null })}>
        <EditGoalForm
          initial={{ name: "", target: "" }}
          onSubmit={(vals) => {
            addGoal({ name: vals.name, target: vals.target === "" ? null : clamp(vals.target) });
            setModal({ type: null, goalId: null });
          }}
        />
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Templates</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEFAULT_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => { addGoal({ name: t.name, target: t.target ?? null }); setModal({ type: null, goalId: null }); }}
                style={{ border: "1px dashed #d1d5db", background: "#f9fafb", padding: "8px 10px", borderRadius: 999, cursor: "pointer" }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={modal.type === "remove" && !!activeGoal} title="Remove goal?" onClose={() => setModal({ type: null, goalId: null })}>
        <p style={{ fontSize: 14, margin: "8px 0 14px" }}>
          This removes <strong>{activeGoal?.name}</strong> from your list. It doesn’t delete any past transactions linked to this goal.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModal({ type: null, goalId: null })} style={ghostBtn()}>Cancel</button>
          <button onClick={() => { removeGoal(activeGoal.id); setModal({ type: null, goalId: null }); }} style={dangerBtn()}>Remove</button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- UI bits ---------- */
function Tile({ label, value }) {
  return (
    <div style={{ background: "#ffffff", borderRadius: 16, padding: 14, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{money(value || 0)}</div>
    </div>
  );
}

function AmountForm({ cta, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(amount, note); }}>
      <label style={{ fontSize: 12, opacity: 0.8 }}>Amount</label>
      <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
      <label style={{ fontSize: 12, opacity: 0.8 }}>Note (optional)</label>
      <input placeholder="e.g., Payday sweep" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
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
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, target }); }}>
      <label style={{ fontSize: 12, opacity: 0.8 }}>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g., Emergency Fund" />
      <label style={{ fontSize: 12, opacity: 0.8 }}>Target (optional)</label>
      <input inputMode="decimal" placeholder="e.g., 600" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="submit" style={primaryBtn()}>Save</button>
      </div>
    </form>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(520px, 92vw)", background: "white", borderRadius: 16, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}
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

/* --- tiny styling helpers --- */
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 12,
  border: "1px solid #e5e7eb", margin: "6px 0 12px", fontSize: 16, outline: "none",
};
const pillBtn = () => ({ border: "1px solid #e5e7eb", background: "#f9fafb", padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700 });
const pillBtnDanger = () => ({ border: "1px solid #fecaca", background: "#fff1f2", padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, color: "#b91c1c" });
const ghostBtn = () => ({ border: "1px solid #e5e7eb", background: "white", padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 700 });
const primaryBtn = () => ({ border: 0, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 800 });
const dangerBtn = () => ({ border: 0, background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 800 });
