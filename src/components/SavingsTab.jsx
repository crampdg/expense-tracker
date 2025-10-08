import React, { useMemo, useState, useEffect } from "react";

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

const DEFAULT_LOAN_TEMPLATES = [
  { key: "creditline", name: "Line of Credit" },
  { key: "student", name: "Student Loan" },
  { key: "car", name: "Auto Loan" },
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
      aprPct: 0,
      compounding: "annually",
      createdAt: Date.now(),
    }))

  );

  // Persist loan *metadata* (name/apr/compounding). Balance comes from tx scan.
  const [loans, setLoans] = usePersistentState(
    "savings.loans.v1",
    [] // start empty; we’ll also allow “Add Loan”
  );


  const [expandedId, setExpandedId] = useState(null);
  const [modal, setModal] = useState({ type: null, goalId: null }); // 'invest'|'withdraw'|'edit'|'add'|'remove'
  const txs = Array.isArray(transactions) ? transactions : [];

  // Auto-create Savings goals from transactions routed to fixed parent "Savings"
  useEffect(() => {
    const norm = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[’'`´]/g, "'")
        .replace(/[-–—]/g, "-")
        .replace(/[\s_]+/g, " ")
        .trim();

    const namesFromTx = new Set();
    for (const t of txs) {
      const route = t?.meta?.budgetRoute || {};
      if ((route.bucket === "fixed") && norm(route.parent) === "savings") {
        namesFromTx.add(String(route.category || t.category || "").trim());
      }
    }
    if (!namesFromTx.size) return;

    setGoals((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const have = new Set(arr.map((g) => norm(g.name)));
      let changed = false;
      for (const name of namesFromTx) {
        if (name && !have.has(norm(name))) {
          arr.push({ id: safeUid(), name, target: null, aprPct: 0, compounding: "annually", createdAt: Date.now() });

          changed = true;
        }
      }
      return changed ? arr : prev;
    });
  }, [txs, setGoals]);


  // --- derive per-goal balances from transactions (single source of truth) ---
  const balancesById = useMemo(() => {
    const m = new Map();
    const byName = new Map();

    const norm = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[’'`´]/g, "'")
        .replace(/[-–—]/g, "-")
        .replace(/[\s_]+/g, " ")
        .trim();

    for (const g of Array.isArray(goals) ? goals : []) {
      m.set(g.id, 0);
      byName.set(norm(g.name), g.id);
    }

    for (const t of txs) {
      const amt = Math.max(0, Number(t.amount) || 0);
      if (!amt) continue;

      const meta = t?.meta || {};
      let gid = meta.savingsGoalId;

      if (!gid) {
        const maybeName =
          meta.savingsGoalName ||
          (meta.budgetRoute && norm(meta.budgetRoute.parent) === "savings" ? meta.budgetRoute.category : null) ||
          t.category;
        const key = norm(maybeName);
        gid = byName.get(key);
      }

      if (!gid || !m.has(gid)) continue;

      // expense to savings = invest; inflow from savings = withdraw
      if (t.type === "expense") m.set(gid, (m.get(gid) || 0) + amt);
      else if (t.type === "inflow") m.set(gid, Math.max(0, (m.get(gid) || 0) - amt));
    }
    return m;
  }, [txs, goals]);


  // --- derive per-loan balances from transactions (single source of truth) ---
  const loanBalancesById = useMemo(() => {
    const m = new Map();
    const byName = new Map();

    const norm = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[’'`´]/g, "'")
        .replace(/[-–—]/g, "-")
        .replace(/[\s_]+/g, " ")
        .trim();

    for (const ln of Array.isArray(loans) ? loans : []) {
      m.set(ln.id, 0);
      byName.set(norm(ln.name), ln.id);
    }

    for (const t of txs) {
      const amt = Math.max(0, Number(t.amount) || 0);
      if (!amt) continue;

      const meta = t?.meta || {};
      let lid = meta.loanId;

      if (!lid) {
        const maybeName =
          meta.loanName ||
          (meta.budgetRoute && norm(meta.budgetRoute.parent) === "loans" ? meta.budgetRoute.category : null) ||
          t.category;
        const key = norm(maybeName);
        lid = byName.get(key);
      }

      if (!lid || !m.has(lid)) continue;

      // inflow tagged to loan = receive (↑debt); expense tagged to loan = repay (↓debt)
      if (t.type === "inflow") m.set(lid, (m.get(lid) || 0) + amt);
      else if (t.type === "expense") m.set(lid, Math.max(0, (m.get(lid) || 0) - amt));
    }
    return m;
  }, [txs, loans]);


  const goalsList = Array.isArray(goals) ? goals : [];
  const activeGoal = goalsList.find((g) => g.id === modal.goalId) || null;
  const loansList = Array.isArray(loans) ? loans : [];
  const activeLoan = loansList.find((l) => l.id === modal.goalId) || null;

  const totals = useMemo(() => {
    let saved = 0, targeted = 0, debt = 0;
    for (const g of goalsList) {
      const bal = balancesById.get(g.id) || 0;
      saved += bal;
      if (g.target && g.target > 0) targeted += g.target;
    }
    for (const ln of Array.isArray(loans) ? loans : []) {
      const bal = loanBalancesById.get(ln.id) || 0;
      debt += bal;
    }
    return { saved, targeted, debt, net: saved - debt };
  }, [goalsList, balancesById, loans, loanBalancesById]);


  // --- CRUD helpers ---
  const upsertGoal = (next) => {
    setGoals((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const i = arr.findIndex((g) => g.id === next.id);
      if (i >= 0) arr[i] = next; else arr.unshift(next);
      return arr;
    });
  };

  // Loans CRUD
  const upsertLoan = (next) => {
    setLoans((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const i = arr.findIndex((l) => l.id === next.id);
      if (i >= 0) arr[i] = next; else arr.unshift(next);
      return arr;
    });
  };

  const addLoan = (l) => upsertLoan({
    id: safeUid(),
    name: l.name || "New Loan",
    aprPct: Number(l.aprPct) || 0,
    compounding: l.compounding || "annually",
    createdAt: Date.now(),
  });

  const removeLoan = (id) =>
    setLoans((prev) => (Array.isArray(prev) ? prev.filter((l) => l.id !== id) : []));


  const addGoal = (g) => upsertGoal({
    id: safeUid(),
    name: g.name || "New Goal",
    target: g.target ?? null,
    aprPct: Number(g.aprPct) || 0,
    compounding: g.compounding || "annually",
    createdAt: Date.now()
  });

  const removeGoal = (id) => setGoals((prev) => (Array.isArray(prev) ? prev.filter((g) => g.id !== id) : []));

  // --- tx emitters ---
  function emitSavingsTx(kind, goal, rawAmount, note) {
    const amt = clamp(rawAmount);
    if (!amt || !goal) return;

    // expense = invest (cash → savings), inflow = withdraw (savings → cash)
    const isInvest = kind === "invest";
    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      type: isInvest ? "expense" : "inflow",
      category: goal.name, // no "Savings: " prefix
      amount: amt,
      note: note || (isInvest ? "Invested into savings goal" : "Withdrew from savings goal"),
      meta: {
        savings: true,
        savingsGoalId: goal.id,
        savingsGoalName: goal.name,
        action: isInvest ? "invest" : "withdraw",
        budgetRoute: {
          bucket: kind === "withdraw" ? "inflow" : "fixed",
          parent: "Savings",
          category: goal.name
        },

      },
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

  function emitLoanTx(kind, loan, rawAmount, note) {
    const amt = clamp(rawAmount);
    if (!amt || !loan) return;

    // inflow = receive loan (cash ↑, debt ↑), expense = repay loan (cash ↓, debt ↓)
    const isReceive = kind === "receive";
    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      type: isReceive ? "inflow" : "expense",
      category: loan.name,
      amount: amt,
      note: note || (isReceive ? "Loan received" : "Loan repayment"),
      meta: {
        loan: true,
        loanId: loan.id,
        loanName: loan.name,
        action: isReceive ? "receive" : "repay",
        // route under a fixed parent "Loans" to keep budgets organized, mirroring Savings
        budgetRoute: { bucket: isReceive ? "inflow" : "fixed", parent: "Loans", category: loan.name },
      },
    };

    if (typeof onAddTransaction === "function") {
      onAddTransaction(tx);
    } else {
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <Tile label="Total Saved" value={totals.saved} />
        <Tile label="Total Debt" value={totals.debt} />
        <Tile label="Net (Saved − Debt)" value={totals.net} />
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
                <div style={{ marginTop: 2, fontSize: 12, opacity: 0.6 }}>
                  APR: {(g.aprPct ?? 0)}% • {g.compounding || "annually"}
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
      
      {/* Loans */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 8 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>Loans</h3>
        <button
          onClick={() => setModal({ type: "loan.add", goalId: null })}
          style={{ border: 0, borderRadius: 12, padding: "8px 12px", fontWeight: 700, cursor: "pointer", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white" }}
        >
          + Add Loan
        </button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {(Array.isArray(loans) ? loans : []).map((l) => {
          const bal = loanBalancesById.get(l.id) || 0;
          // No “target” for loans; show balance owed and APR/compounding
          return (
            <div key={l.id} style={{ background: "white", borderRadius: 16, padding: 14, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
              <button
                onClick={() => setExpandedId((id) => (id === l.id ? null : l.id))}
                style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{l.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>Owed: {money(bal)}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
                  APR: {(l.aprPct ?? 0)}% • {l.compounding || "annually"}
                </div>
              </button>

              {expandedId === l.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={() => setModal({ type: "loan.receive", goalId: l.id })} style={pillBtn()} children="Receive" />
                  <button onClick={() => setModal({ type: "loan.repay", goalId: l.id })} style={pillBtn()} children="Repay" />
                  <button onClick={() => setModal({ type: "loan.edit", goalId: l.id })} style={pillBtn()} children="Rename / APR" />
                  <button onClick={() => setModal({ type: "loan.remove", goalId: l.id })} style={pillBtnDanger()} children="Remove" />
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
          initial={{
            name: activeGoal?.name ?? "",
            target: activeGoal?.target ?? "",
            aprPct: activeGoal?.aprPct ?? 0,
            compounding: activeGoal?.compounding || "annually"
          }}

          onSubmit={(vals) => {
            upsertGoal({
              ...activeGoal,
              name: vals.name || "Untitled Goal",
              target: vals.target === "" ? null : clamp(vals.target),
              aprPct: Number(vals.aprPct) || 0,
              compounding: vals.compounding || "annually"
            });

            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "add"} title="Add Savings Goal" onClose={() => setModal({ type: null, goalId: null })}>
        <EditGoalForm
          initial={{ name: "", target: "", aprPct: 0, compounding: "annually" }}
          onSubmit={(vals) => {
            addGoal({
              name: vals.name,
              target: vals.target === "" ? null : clamp(vals.target),
              aprPct: Number(vals.aprPct) || 0,
              compounding: vals.compounding || "annually"
            });

            setModal({ type: null, goalId: null });
          }}
        />
        
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Templates</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEFAULT_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  addGoal({ name: t.name, target: t.target ?? null, aprPct: 0, compounding: "annually" });
                  setModal({ type: null, goalId: null });
                }}
                style={pillBtn()}
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

      {/* LOAN MODALS */}
      <Modal open={modal.type === "loan.receive" && !!activeLoan} title={`Receive ${activeLoan?.name || ""}`} onClose={() => setModal({ type: null, goalId: null })}>
        <AmountForm
          cta="Receive"
          onSubmit={(amt, note) => {
            emitLoanTx("receive", activeLoan, amt, note);
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "loan.repay" && !!activeLoan} title={`Repay ${activeLoan?.name || ""}`} onClose={() => setModal({ type: null, goalId: null })}>
        <AmountForm
          cta="Repay"
          onSubmit={(amt, note) => {
            emitLoanTx("repay", activeLoan, amt, note);
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "loan.edit" && !!activeLoan} title={`Edit ${activeLoan?.name || ""}`} onClose={() => setModal({ type: null, goalId: null })}>
        <EditLoanForm
          initial={{
            name: activeLoan?.name ?? "",
            aprPct: activeLoan?.aprPct ?? 0,
            compounding: activeLoan?.compounding || "annually",
          }}
          onSubmit={(vals) => {
            upsertLoan({
              ...activeLoan,
              name: vals.name || "Untitled Loan",
              aprPct: Number(vals.aprPct) || 0,
              compounding: vals.compounding || "annually",
            });
            setModal({ type: null, goalId: null });
          }}
        />
      </Modal>

      <Modal open={modal.type === "loan.add"} title="Add Loan" onClose={() => setModal({ type: null, goalId: null })}>
        <EditLoanForm
          initial={{ name: "", aprPct: 0, compounding: "annually" }}
          onSubmit={(vals) => {
            addLoan({
              name: vals.name,
              aprPct: Number(vals.aprPct) || 0,
              compounding: vals.compounding || "annually",
            });
            setModal({ type: null, goalId: null });
          }}
        />
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Templates</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEFAULT_LOAN_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  addLoan({ name: t.name, aprPct: 0, compounding: "annually" });
                  setModal({ type: null, goalId: null });
                }}
                style={pillBtn()}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={modal.type === "loan.remove" && !!activeLoan} title="Remove loan?" onClose={() => setModal({ type: null, goalId: null })}>
        <p style={{ fontSize: 14, margin: "8px 0 14px" }}>
          This removes <strong>{activeLoan?.name}</strong> from your list. It doesn’t delete any past transactions linked to this loan.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModal({ type: null, goalId: null })} style={ghostBtn()}>Cancel</button>
          <button onClick={() => { removeLoan(activeLoan.id); setModal({ type: null, goalId: null }); }} style={dangerBtn()}>Remove</button>
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
  const [aprPct, setAprPct] = useState(initial.aprPct ?? 0);
  const [compounding, setCompounding] = useState(initial.compounding || "annually");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          target,
          aprPct,
          compounding,
        });
      }}
    >
      <label style={{ fontSize: 12, opacity: 0.8 }}>Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
        placeholder="e.g., Emergency Fund"
      />

      <label style={{ fontSize: 12, opacity: 0.8 }}>Target (optional)</label>
      <input
        inputMode="decimal"
        placeholder="e.g., 600"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={inputStyle}
      />

      <label style={{ fontSize: 12, opacity: 0.8 }}>APR (%)</label>
      <input
        inputMode="decimal"
        placeholder="e.g., 4"
        value={aprPct}
        onChange={(e) => setAprPct(e.target.value)}
        style={inputStyle}
      />

      <label style={{ fontSize: 12, opacity: 0.8 }}>Compounding</label>
      <select
        value={compounding}
        onChange={(e) => setCompounding(e.target.value)}
        style={{ ...inputStyle, appearance: "auto" }}
      >
        <option value="annually">Annually</option>
        <option value="monthly">Monthly</option>
        <option value="daily">Daily</option>
        <option value="continuously">Continuously</option>
      </select>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="submit" style={primaryBtn()}>Save</button>
      </div>
    </form>
  );
}

function EditLoanForm({ initial, onSubmit }) {
  const [name, setName] = useState(initial.name ?? "");
  const [aprPct, setAprPct] = useState(initial.aprPct ?? 0);
  const [compounding, setCompounding] = useState(initial.compounding || "annually");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, aprPct, compounding });
      }}
    >
      <label style={{ fontSize: 12, opacity: 0.8 }}>Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
        placeholder="e.g., Student Loan"
      />

      <label style={{ fontSize: 12, opacity: 0.8 }}>APR (%)</label>
      <input
        inputMode="decimal"
        placeholder="e.g., 6"
        value={aprPct}
        onChange={(e) => setAprPct(e.target.value)}
        style={inputStyle}
      />

      <label style={{ fontSize: 12, opacity: 0.8 }}>Compounding</label>
      <select
        value={compounding}
        onChange={(e) => setCompounding(e.target.value)}
        style={{ ...inputStyle, appearance: "auto" }}
      >
        <option value="annually">Annually</option>
        <option value="monthly">Monthly</option>
        <option value="daily">Daily</option>
        <option value="continuously">Continuously</option>
      </select>

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
