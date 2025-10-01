import { useMemo, useState } from "react"
import Card from "./ui/Card.jsx"
import Button from "./ui/Button.jsx"
import MoneyTimeModal from "./modals/MoneyTimeModal.jsx"
import { money } from "../utils/format.js"
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils"

/**
 * WalletTab
 * Props:
 *  - budget: { inflows: [{category, amount}], outflows: [{category, amount}] }
 *  - transactions: [{ id, type: 'inflow'|'expense', amount, category, date: 'YYYY-MM-DD', ... }]
 *  - onAddTransaction: (tx) => void
 *
 * Visual goals:
 *  - Clear KPIs: Cash on Hand, Suggested Daily, Days Left
 *  - Consistent period context (reads periodConfig from localStorage)
 *  - Big, friendly "Money Time!" CTA
 *  - Clean, readable recent transactions list
 */
export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false)

  // -------- Period context (align with other tabs) --------
  const { periodConfig, offsetStart, offsetEnd, startISO, endISO, daysLeft } = useMemo(() => {
    // Fallback to saved config or Monthly anchored to today
    let p = { type: "Monthly", anchorDate: new Date().toISOString().slice(0, 10) }
    try {
      const saved = localStorage.getItem("periodConfig")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.type && parsed?.anchorDate) p = parsed
      }
    } catch {}
    const start = getAnchoredPeriodStart(p.type, p.anchorDate, new Date(), 0) // wallet uses "current" period
    const end = calcPeriodEnd(p.type, start)
    const dayMs = 24 * 60 * 60 * 1000
    const dl = Math.max(0, Math.ceil((end - new Date()) / dayMs))
    return {
      periodConfig: p,
      offsetStart: start,
      offsetEnd: end,
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      daysLeft: dl,
    }
  }, [])

  // -------- Budget totals --------
  const totalInflowsBudget = useMemo(
    () => (budget?.inflows || []).reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    [budget]
  )
  const totalOutflowsBudget = useMemo(
    () => (budget?.outflows || []).reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
    [budget]
  )

  // -------- Actuals (global + period-scoped) --------
  const txs = Array.isArray(transactions) ? transactions : []

  const cashOnHand = useMemo(() => {
    return txs.reduce((sum, t) => {
      const amt = Number(t.amount) || 0
      if (t.type === "inflow") return sum + amt
      if (t.type === "expense") return sum - amt
      return sum
    }, 0)
  }, [txs])

  const periodTxs = useMemo(
    () => txs.filter((t) => t?.date && t.date >= startISO && t.date <= endISO),
    [txs, startISO, endISO]
  )

  const periodActualOutflows = useMemo(() => {
    return periodTxs
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  }, [periodTxs])

  // Suggested Daily Spend = remaining cashOnHand for this period / days left
  const suggestedDaily = useMemo(() => {
    const dl = Math.max(1, daysLeft) // avoid divide-by-zero
    return cashOnHand / dl
  }, [cashOnHand, daysLeft])

  // -------- UI data --------
  const recentTransactions = useMemo(() => {
    return [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6)
  }, [txs])

  const categories = useMemo(() => {
    const inflowCats = (budget?.inflows || []).map((i) => i.category)
    const outflowCats = (budget?.outflows || []).map((o) => o.category)
    return Array.from(new Set([...inflowCats, ...outflowCats])).filter(Boolean)
  }, [budget])

  // -------- Render --------
  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 md:p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Wallet</h2>
            <p className="text-sm text-gray-600">
              {periodConfig.type}: {offsetStart.toDateString()} – {offsetEnd.toDateString()}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={() => setShowMoneyTime(true)}
            title="Add a quick transaction"
          >
            💸 Money Time!
          </Button>
        </div>

        {/* KPI row */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="text-center">
            <div className="text-xs text-gray-500">Cash on Hand</div>
            <div className="text-2xl md:text-3xl font-bold">{money(cashOnHand)}</div>
          </Card>

          <Card className="text-center">
            <div className="text-xs text-gray-500">Suggested Daily Spend</div>
            <div className="text-xl md:text-2xl font-semibold text-green-700">
              {money(suggestedDaily)}
            </div>
          </Card>

          <Card className="text-center">
            <div className="text-xs text-gray-500">Budgeted Inflows</div>
            <div className="text-lg font-semibold">{money(totalInflowsBudget)}</div>
          </Card>

          <Card className="text-center">
            <div className="text-xs text-gray-500">Budgeted Outflows</div>
            <div className="text-lg font-semibold">{money(totalOutflowsBudget)}</div>
          </Card>
        </div>
      </Card>

      {/* Recent Transactions */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-3">
          <h3 className="font-semibold">Recent Transactions</h3>
          <div className="text-xs text-gray-500">
            Period: {startISO} → {endISO}
          </div>
        </div>

        {recentTransactions.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {recentTransactions.map((t) => {
              const isExpense = t.type === "expense"
              const amt = Number(t.amount) || 0
              const dateStr = t.date ? new Date(t.date + "T00:00:00").toLocaleDateString() : "—"
              return (
                <li key={t.id ?? `${t.category}-${t.date}-${amt}`} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isExpense
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-green-50 text-green-700 border border-green-200"
                          }`}
                        >
                          {isExpense ? "Expense" : "Inflow"}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {t.category || "Uncategorized"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{dateStr}</div>
                    </div>
                    <div
                      className={`text-sm md:text-base font-semibold tabular-nums ${
                        isExpense ? "text-red-600" : "text-green-700"
                      }`}
                    >
                      {isExpense ? "-" : "+"}
                      {money(amt)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            No recent transactions yet.
          </div>
        )}
      </Card>

      {/* Period insights (optional, simple readout) */}
      <Card className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <div>
            <span className="font-medium">Days left:</span> {daysLeft}
          </div>
          <div className="mt-0.5">
            <span className="font-medium">Period outflows so far:</span>{" "}
            {money(periodActualOutflows)}
          </div>
        </div>

        <Button
          variant="ghost"
          type="button"
          onClick={() => setShowMoneyTime(true)}
          title="Add a quick spend/income"
        >
          + Add Transaction
        </Button>
      </Card>

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
  )
}
