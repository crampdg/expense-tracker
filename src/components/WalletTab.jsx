import React, { useState, useMemo } from "react";
import MoneyTimeModal from "./modals/MoneyTimeModal";
// Period helpers so Suggested Daily has a sensible end date (falls back to end-of-month if config is missing)
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils";

export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false);

  // ---- Safe inputs ----
  const txs = Array.isArray(transactions) ? transactions : [];
  const inflowCats = (budget?.inflows || []).map((i) => i.category);
  const outflowCats = (budget?.outflows || []).map((o) => o.category);
  const categories = Array.from(new Set([...inflowCats, ...outflowCats])).filter(Boolean);

  // ---- Cash on Hand (minimal + correct) ----
  const cashOnHand = useMemo(() => {
    return txs.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === "inflow") return sum + amt;
      if (t.type === "expense") return sum - amt;
      return sum;
    }, 0);
  }, [txs]);

  // ---- Suggested Daily: use current anchored period if available; else end of this month ----
  const { startISO, endISO, daysLeft } = useMemo(() => {
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
    };
  }, []);

  const suggestedDaily = useMemo(() => cashOnHand / daysLeft, [cashOnHand, daysLeft]);

  // ---- Simple, recent list (3 items) ----
  const recentTransactions = useMemo(() => {
    return [...txs]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 3);
  }, [txs]);

  // ---- Amount formatting (no currency symbol) ----
  const formatAmount = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0.00";
    const sign = num < 0 ? "-" : "";
    const abs = Math.abs(num);
    return sign + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const amountClass = (n) =>
    n < 0 ? "text-red-600" : n > 0 ? "text-emerald-700" : "text-gray-700";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* HERO — friendly green gradient; icon removed to maximize text width */}
      <div className="relative overflow-hidden rounded-3xl shadow-sm border border-emerald-200 bg-gradient-to-b from-emerald-300 to-emerald-500">
        {/* soft texture bubbles */}
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute -bottom-16 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 px-5 py-6 md:px-7 md:py-8">
          {/* Copy-only layout (no left icon) */}
          <div className="text-sm text-emerald-950/90">Cash on Hand</div>

          <div
            className={`mt-1 text-4xl md:text-5xl font-extrabold leading-tight drop-shadow-sm ${
              cashOnHand < 0 ? "text-red-700" : "text-emerald-900"
            }`}
            aria-live="polite"
          >
            {formatAmount(cashOnHand)}
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-sm text-emerald-950/80">Suggested Daily</div>
            <div className={`text-2xl font-bold ${amountClass(suggestedDaily)}`}>
              {formatAmount(suggestedDaily)}
            </div>
          </div>

          {/* Tiny period hint */}
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

      {/* Recent — ultra minimal */}
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

      {/* Modal */}
      {showMoneyTime && (
        <MoneyTimeModal
          open={showMoneyTime}
          onClose={() => setShowMoneyTime(false)}
          onSave={onAddTransaction}
          categories={categories}
        />
      )}
    </div>
  );
}
