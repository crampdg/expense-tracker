import React, { useState, useMemo } from "react";
import MoneyTimeModal from "./modals/MoneyTimeModal";
import SavingsSettingsModal from "./modals/SavingsSettingsModal.jsx";
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils";
import { Settings as Gear } from "lucide-react";

/** helpers */
function clamp01(x){ return Math.min(0.99, Math.max(0, x)); }
function readSettings() {
  const pickNum = (k, d=0) => {
    try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) ? Math.max(0, v) : d; } catch { return d; }
  };
  const pickPct = (k, d=0) => clamp01(pickNum(k, d));
  return {
    savingsRate:              pickPct("savingsRate", 0.10),
    fixedMonthlySavings:      pickNum("fixedMonthlySavings", 0),
    includeOneOffInflowsPct:  pickPct("includeOneOffInflowsPct", 0.50),
    sinkingAccrualMonthly:    pickNum("sinkingAccrualMonthly", 0),
    suggestedDailyBufferPct:  pickPct("suggestedDailyBufferPct", 0.10),
  };
}
function saveSettings(s) {
  try {
    localStorage.setItem("savingsRate", String(clamp01(s.savingsRate)));
    localStorage.setItem("fixedMonthlySavings", String(Math.max(0, s.fixedMonthlySavings)));
    localStorage.setItem("includeOneOffInflowsPct", String(clamp01(s.includeOneOffInflowsPct)));
    localStorage.setItem("sinkingAccrualMonthly", String(Math.max(0, s.sinkingAccrualMonthly)));
    localStorage.setItem("suggestedDailyBufferPct", String(clamp01(s.suggestedDailyBufferPct)));
  } catch {}
}
function periodMonthsFactor(t) {
  switch (t) {
    case "Monthly": return 1;
    case "SemiMonthly": return 0.5;
    case "Biweekly": return 0.5;
    case "Weekly": return 0.25;
    case "Annually": return 12;
    default: return 1;
  }
}

export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(readSettings());

  // ---- Safe inputs ----
  const txs = Array.isArray(transactions) ? transactions : [];
  const inflowCats = (budget?.inflows || []).map((i) => i.category);
  const outflowCats = (budget?.outflows || []).map((o) => o.category);
  const categories = Array.from(new Set([...inflowCats, ...outflowCats])).filter(Boolean);

  // ---- Cash on Hand ----
  const cashOnHand = useMemo(() => {
    return txs.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === "inflow") return sum + amt;
      if (t.type === "expense") return sum - amt;
      return sum;
    }, 0);
  }, [txs]);

  // ---- Period window ----
  const { startISO, endISO, daysLeft, periodType } = useMemo(() => {
    let type = "Monthly";
    let anchor = new Date().toISOString().slice(0, 10);
    try {
      const saved = localStorage.getItem("periodConfig");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.type && parsed?.anchorDate) {
          type = parsed.type;
          anchor = parsed.anchorDate;
        }
      }
    } catch {}
    const start = getAnchoredPeriodStart(type, anchor, new Date(), 0);
    const end = calcPeriodEnd(type, start);
    const dayMs = 24 * 60 * 60 * 1000;
    const left = Math.max(1, Math.ceil((end - new Date()) / dayMs));
    return {
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      daysLeft: left,
      periodType: type,
    };
  }, []);

  // ---- Budget plan totals ----
  const plannedInflows = useMemo(
    () => (budget?.inflows || []).reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [budget]
  );
  const plannedOutflows = useMemo(
    () => (budget?.outflows || []).reduce((s, o) => s + (Number(o.amount) || 0), 0),
    [budget]
  );

  // ---- Actuals this period ----
  const { actualInflows, actualOutflows } = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const t of txs) {
      const d = t.date || "";
      if (d >= startISO && d <= endISO) {
        const amt = Number(t.amount) || 0;
        if (t.type === "inflow") inflow += amt;
        else if (t.type === "expense") outflow += amt;
      }
    }
    return { actualInflows: inflow, actualOutflows: outflow };
  }, [txs, startISO, endISO]);

  // ---- Remaining planned amounts ----
  const remainingPlannedInflows = Math.max(0, plannedInflows - actualInflows);
  const remainingPlannedOutflows = Math.max(0, plannedOutflows - actualOutflows);

  // ---- Projected end cash ----
  const projectedEndCash = cashOnHand + remainingPlannedInflows - remainingPlannedOutflows;

  // ---- Savings & sinking (this period) from settings ----
  const projectedIncome =
    actualInflows + remainingPlannedInflows * settings.includeOneOffInflowsPct;
  const savingsFirst = Math.max(settings.fixedMonthlySavings, projectedIncome * settings.savingsRate);
  const sinkThisPeriod = settings.sinkingAccrualMonthly * periodMonthsFactor(periodType);
  const savingsReserved = Math.max(0, savingsFirst + sinkThisPeriod);

  // ---- Suggested Daily (smart) ----
  const hasAnyBudget =
    ((budget?.inflows?.length || 0) + (budget?.outflows?.length || 0)) > 0;

  const suggestedDaily = useMemo(() => {
    const simple = cashOnHand / daysLeft;
    if (!hasAnyBudget) return Math.max(0, simple);
    const adjustedProjectedEnd = projectedEndCash - savingsReserved;
    const buffered = (adjustedProjectedEnd * (1 - settings.suggestedDailyBufferPct)) / daysLeft;
    return Math.max(0, buffered);
  }, [
    cashOnHand,
    daysLeft,
    hasAnyBudget,
    projectedEndCash,
    savingsReserved,
    settings.suggestedDailyBufferPct,
  ]);

  // ---- Recent list ----
  const recentTransactions = useMemo(() => {
    return [...txs]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 3);
  }, [txs]);

  // ---- Formatting ----
  const formatAmount = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0.00";
    const sign = num < 0 ? "-" : "";
    const abs = Math.abs(num);
    return sign + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const amountClass = (n) =>
    n < 0 ? "text-red-600" : n > 0 ? "text-emerald-700" : "text-gray-700";

  // ---- Handlers ----
  const openSettings = () => setShowSettings(true);
  const saveSettingsAndRefresh = (newVals) => {
    saveSettings(newVals);
    setSettings(newVals); // trigger recompute immediately
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl shadow-sm border border-emerald-200 bg-gradient-to-b from-emerald-300 to-emerald-500">
        {/* bubbles */}
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute -bottom-16 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />

        {/* tiny gear – top-right */}
        <button
          type="button"
          onClick={openSettings}
          aria-label="Savings & Daily settings"
          title="Savings & Daily settings"
          className="absolute top-2 right-2 z-20 p-2 rounded-full bg-white/40 hover:bg-white/60 active:bg-white/50 text-emerald-900 shadow-sm"
        >
          <Gear size={18} />
        </button>


        <div className="relative z-10 px-5 py-6 md:px-7 md:py-8">
          {/* Savings (reserved) */}
          <div className="flex items-baseline justify-between pr-10">{/* pr-10 keeps space for the gear */}
            <div className="text-xs text-emerald-950/85">Savings (reserved this period)</div>
            <div className="text-base font-semibold text-emerald-950">
              {formatAmount(savingsReserved)}
            </div>
          </div>


          {/* Cash on Hand */}
          <div className="mt-3 text-sm text-emerald-950/90">Cash on Hand</div>
          <div
            className={`mt-1 text-4xl md:text-5xl font-extrabold leading-tight drop-shadow-sm ${
              cashOnHand < 0 ? "text-red-700" : "text-emerald-900"
            }`}
            aria-live="polite"
          >
            {formatAmount(cashOnHand)}
          </div>

          {/* Suggested Daily */}
          <div className="mt-3 flex items-baseline gap-2">
            <div
              className="text-sm text-emerald-950/80"
              title={
                hasAnyBudget
                  ? "After planned bills/inflows, savings & sinking funds, plus safety buffer"
                  : "Cash ÷ days left"
              }
            >
              Suggested Daily
            </div>
            <div className={`text-2xl font-bold ${amountClass(suggestedDaily)}`}>
              {formatAmount(suggestedDaily)}
            </div>
          </div>

          <div className="mt-1 text-xs text-emerald-950/70">
            through <span className="font-medium">{endISO}</span>
          </div>

          {/* CTA */}
          <div className="mt-4">
            <button
              onClick={() => setShowMoneyTime(true)}
              type="button"
              className="inline-flex items-center gap-2 bg-yellow-300 hover:bg-yellow-200 active:bg-yellow-300
                         text-yellow-900 font-extrabold tracking-wide px-5 py-2.5 rounded-full shadow
                         border border-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
            >
              <span>💰</span>
              <span>MONEY TIME!</span>
              <span className="text-lg">✨</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">Recent Transactions</div>
          <div className="text-xs text-gray-500">Period: {startISO} → {endISO}</div>
        </div>

        {recentTransactions.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {recentTransactions.map((t, idx) => {
              const amt = Number(t.amount) || 0;
              const isExpense = t.type === "expense";
              return (
                <li key={t.id ?? `${t.category}-${t.date}-${idx}`} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${
                          isExpense
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                        aria-hidden="true"
                      >
                        {isExpense ? "–" : "+"}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {t.category || "Uncategorized"}
                      </span>
                    </div>
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        isExpense ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {isExpense ? "-" : "+"}
                      {formatAmount(amt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-gray-500">No recent spends</div>
        )}
      </div>

      {/* Modals */}
      {showMoneyTime && (
        <MoneyTimeModal
          open={showMoneyTime}
          onClose={() => setShowMoneyTime(false)}
          onSave={onAddTransaction}
          categories={categories}
        />
      )}
      {showSettings && (
        <SavingsSettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          value={settings}
          onSave={saveSettingsAndRefresh}
          onAfterImport={() => window.location.reload()}
        />

      )}
    </div>
  );
}
