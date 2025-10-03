import React, { useMemo, useState } from "react";
import MoneyTimeModal from "./modals/MoneyTimeModal";
import SavingsSettingsModal from "./modals/SavingsSettingsModal.jsx";
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils";
import { Settings as Gear } from "lucide-react";

/* ---------- settings I/O ---------- */
function clamp01(x){ return Math.min(1, Math.max(0, Number(x)||0)); }
function pickNum(k, d=0){ try{ const v = Number(localStorage.getItem(k)); return Number.isFinite(v) ? Math.max(0,v) : d; }catch{ return d; } }
function pickStr(k, d=""){ try{ const v = localStorage.getItem(k); return v ?? d; }catch{ return d; } }

function readSettings() {
  const autoSavePercent = clamp01(pickNum("autoSavePercent", 0));
  const autoSaveFixed = pickNum("autoSaveFixed", 0);
  const savingsLabel = pickStr("savingsLabel", "Savings");
  return { autoSavePercent, autoSaveFixed, savingsLabel };
}
function saveSettings(s) {
  try {
    localStorage.setItem("autoSavePercent", String(clamp01(s.autoSavePercent || 0)));
    localStorage.setItem("autoSaveFixed", String(Math.max(0, s.autoSaveFixed || 0)));
    localStorage.setItem("savingsLabel", String(s.savingsLabel || "Savings"));
  } catch {}
}

/* ---------- helpers ---------- */
function currency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0.00";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  return sign + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const amtClass = (n) => n < 0 ? "text-red-600" : n > 0 ? "text-emerald-700" : "text-gray-700";

/* ---------- period window ---------- */
function usePeriodWindow() {
  return useMemo(() => {
    let type = "Monthly";
    let anchor = new Date().toISOString().slice(0, 10);
    try {
      const saved = localStorage.getItem("periodConfig");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.type && parsed?.anchorDate) { type = parsed.type; anchor = parsed.anchorDate; }
      }
    } catch {}
    const start = getAnchoredPeriodStart(type, anchor, new Date(), 0);
    const end = calcPeriodEnd(type, start);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysLeft = Math.max(1, Math.ceil((end - new Date()) / dayMs));
    return {
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      daysLeft,
    };
  }, []);
}

export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(readSettings());
  const { startISO, endISO, daysLeft } = usePeriodWindow();

  // Inputs
  const txs = Array.isArray(transactions) ? transactions : [];
  const inflowCats = (budget?.inflows || []).map((i) => i.category);
  const outflowCats = (budget?.outflows || []).map((o) => o.category);
  const categories = Array.from(new Set([...inflowCats, ...outflowCats])).filter(Boolean);

  // Cash on Hand (all time)
  const cashOnHand = useMemo(() => {
    return txs.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === "inflow") return sum + amt;
      if (t.type === "expense") return sum - amt;
      return sum;
    }, 0);
  }, [txs]);

  // Planned & actuals (current period)
  const plannedInflows = useMemo(() => (budget?.inflows || []).reduce((s, i) => s + (Number(i.amount) || 0), 0), [budget]);
  const plannedOutflows = useMemo(() => (budget?.outflows || []).reduce((s, o) => s + (Number(o.amount) || 0), 0), [budget]);

  const { actualInflows, actualOutflows } = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const t of txs) {
      const d = t.date || "";
      if (d >= startISO && d <= endISO) {
        const amt = Number(t.amount) || 0;
        if (t.type === "inflow") inflow += amt; else if (t.type === "expense") outflow += amt;
      }
    }
    return { actualInflows: inflow, actualOutflows: outflow };
  }, [txs, startISO, endISO]);

  const remainingPlannedInflows = Math.max(0, plannedInflows - actualInflows);
  const remainingPlannedOutflows = Math.max(0, plannedOutflows - actualOutflows);
  const projectedEndCash = cashOnHand + remainingPlannedInflows - remainingPlannedOutflows;

  // Savings (lifetime cumulative outflows)
  const savingsLabel = (settings.savingsLabel || "Savings").trim();
  const lifetimeSavings = useMemo(() => {
    let sum = 0;
    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      const cat = (t.category || "").trim();
      if (t.type === "expense" && (cat === savingsLabel || t?.meta?.autoSaved === true)) {
        sum += amt;
      }
    }
    return sum;
  }, [txs, savingsLabel]);

  // Suggested Daily
  const hasAnyBudget = ((budget?.inflows?.length || 0) + (budget?.outflows?.length || 0)) > 0;
  const suggestedDaily = useMemo(() => {
    const simple = cashOnHand / daysLeft;
    if (!hasAnyBudget) return Math.max(0, simple);
    const buffered = (projectedEndCash * 0.90) / daysLeft;
    return Math.max(0, buffered);
  }, [cashOnHand, daysLeft, hasAnyBudget, projectedEndCash]);

  // Intercept inflows to auto-create Savings outflow
  const handleAddTransaction = (t) => {
    if (!onAddTransaction) return;
    const inflowId = onAddTransaction(t);

    if (t?.type === "inflow") {
      const pct = clamp01(settings.autoSavePercent || 0);
      const fixed = Math.max(0, Number(settings.autoSaveFixed) || 0);
      const inflowAmt = Math.max(0, Number(t.amount) || 0);
      let saveAmt = inflowAmt * pct + fixed;
      if (!Number.isFinite(saveAmt) || saveAmt <= 0) return;
      saveAmt = Math.min(saveAmt, inflowAmt);
      const outTx = {
        id: undefined,
        date: t.date || new Date().toISOString().slice(0,10),
        type: "expense",
        category: savingsLabel || "Savings",
        amount: saveAmt,
        note: (t.note ? `${t.note} → auto-saved` : "Auto-saved from inflow"),
        meta: { autoSaved: true, pairOf: inflowId || t.id || null, sourceCategory: t.category || null },
      };
      onAddTransaction(outTx);
    }
    return inflowId;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="relative overflow-hidden rounded-3xl shadow-sm border border-emerald-200 bg-gradient-to-b from-emerald-300 to-emerald-500">
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Savings settings"
          title="Savings settings"
          className="absolute top-2 right-2 z-20 p-2 rounded-full bg-white/40 hover:bg-white/60 active:bg-white/50 text-emerald-900 shadow-sm"
        >
          <Gear size={18} />
        </button>

        <div className="relative z-10 px-5 py-6 md:px-7 md:py-8">
          <div className="flex items-baseline justify-between pr-10">
            <div className="text-xs text-emerald-950/85">{savingsLabel || "Savings"} (lifetime)</div>
            <div className="text-base font-semibold text-emerald-950">{currency(lifetimeSavings)}</div>
          </div>

          <div className="mt-3 text-sm text-emerald-950/90">Cash on Hand</div>
          <div className={`mt-1 text-4xl md:text-5xl font-extrabold leading-tight drop-shadow-sm ${cashOnHand < 0 ? "text-red-700" : "text-emerald-900"}`}>
            {currency(cashOnHand)}
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-sm text-emerald-950/80">
              Suggested Daily
            </div>
            <div className={`text-2xl font-bold ${amtClass(suggestedDaily)}`}>{currency(suggestedDaily)}</div>
          </div>

          <div className="mt-1 text-xs text-emerald-950/70">through <span className="font-medium">{endISO}</span></div>

          <div className="mt-4">
            <button
              onClick={() => setShowMoneyTime(true)}
              type="button"
              className="inline-flex items-center gap-2 bg-yellow-300 hover:bg-yellow-200 active:bg-yellow-300 text-yellow-900 font-extrabold tracking-wide px-5 py-2.5 rounded-full shadow border border-yellow-400"
            >
              <span>💰</span><span>MONEY TIME!</span><span className="text-lg">✨</span>
            </button>
          </div>
        </div>
      </div>

      {showMoneyTime && (
        <MoneyTimeModal
          open={showMoneyTime}
          onClose={() => setShowMoneyTime(false)}
          onSave={handleAddTransaction}
          categories={categories}
        />
      )}
      {showSettings && (
        <SavingsSettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          value={settings}
          onSave={(vals) => { saveSettings(vals); setSettings(vals); }}
          onAfterImport={() => window.location.reload()}
        />
      )}
    </div>
  );
}
