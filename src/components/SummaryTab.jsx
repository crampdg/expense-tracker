import { useMemo } from "react"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts"
import Card from "./ui/Card.jsx"
import ExportPDFButton from "./ui/ExportPDFButton.jsx"
import SharePDFButton from "./ui/SharePDFButton.jsx"
import { money } from "../utils/format.js"
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils"

/**
 * SummaryTab — period-scoped summary
 *
 * Props:
 * - transactions: array of { type: 'inflow'|'expense', amount, category, date: 'YYYY-MM-DD', ... }
 * - budget: (unused here but kept for parity)
 * - period: { type, anchorDate }   <-- pass-through from App (same object used by BudgetTab)
 * - periodOffset: number            <-- pass-through from App (same offset used by BudgetTab)
 *
 * If period/periodOffset are not provided, this component will gracefully fall back to:
 * - period: from localStorage('periodConfig') or { type: 'Monthly', anchorDate: today }
 * - periodOffset: 0
 */
export default function SummaryTab({ transactions, budget, period, periodOffset }) {
  // Safety: ensure arrays exist
  const txs = Array.isArray(transactions) ? transactions : []

  // Compute the effective period inputs (use BudgetTab's state if provided; otherwise fallback)
  const effectivePeriod = useMemo(() => {
    if (period?.type && period?.anchorDate) return period
    try {
      const saved = localStorage.getItem("periodConfig")
      if (saved) {
        const p = JSON.parse(saved)
        if (p?.type && p?.anchorDate) return p
      }
    } catch {}
    return { type: "Monthly", anchorDate: new Date().toISOString().slice(0, 10) }
  }, [period?.type, period?.anchorDate])

  const effectiveOffset = typeof periodOffset === "number" ? periodOffset : 0

  // Derive the selected period start/end identical to BudgetTab
  const offsetStart = useMemo(
    () => getAnchoredPeriodStart(effectivePeriod.type, effectivePeriod.anchorDate, new Date(), effectiveOffset),
    [effectivePeriod.type, effectivePeriod.anchorDate, effectiveOffset]
  )

  const offsetEnd = useMemo(
    () => calcPeriodEnd(effectivePeriod.type, offsetStart),
    [effectivePeriod.type, offsetStart]
  )

  const startISO = offsetStart.toISOString().slice(0, 10)
  const endISO = offsetEnd.toISOString().slice(0, 10)

  // Build a nice filename prefix starting with the period window
  const filePrefix = `${startISO}_to_${endISO}`

  // Current period vs historical/future period display
  const isCurrentPeriod = effectiveOffset === 0
  const daysLabel = isCurrentPeriod ? "Days Left" : "Days in Period"
  const daysValue = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000
    if (isCurrentPeriod) {
      const today = new Date()
      return Math.max(0, Math.ceil((offsetEnd - today) / dayMs))
    } else {
      // Show the total number of days within the selected period for context
      return Math.round((offsetEnd - offsetStart) / dayMs) + 1
    }
  }, [isCurrentPeriod, offsetEnd, offsetStart])

  // --- Period-scoped data prep ---
  const periodTxs = useMemo(
    () => txs.filter((t) => t?.date && t.date >= startISO && t.date <= endISO),
    [txs, startISO, endISO]
  )

  const inflowsTotal = useMemo(
    () =>
      periodTxs
        .filter((t) => t.type === "inflow")
        .reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxs]
  )

  const outflowsTotal = useMemo(
    () =>
      periodTxs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxs]
  )

  const net = inflowsTotal - outflowsTotal

  // Pie data (period-scoped)
  const pieData = [
    { name: "Inflows", value: inflowsTotal },
    { name: "Outflows", value: outflowsTotal },
  ]
  const COLORS = ["#2dd4bf", "#3b82f6"]

  // Category breakdown (top 5 outflows) — period-scoped
  const outflowByCategory = useMemo(() => {
    const m = {}
    for (const t of periodTxs) {
      if (t.type !== "expense") continue
      m[t.category] = (m[t.category] || 0) + Number(t.amount || 0)
    }
    return Object.entries(m)
      .map(([cat, amt]) => ({ category: cat, amount: amt }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [periodTxs])

  // Insight text
  const topCategory = outflowByCategory[0]
  const insight =
    topCategory && outflowsTotal > 0
      ? `Top category: ${topCategory.category} – ${((topCategory.amount / outflowsTotal) * 100).toFixed(0)}% of outflows`
      : "No major spending yet this period."

  return (
    <div className="space-y-4" id="summary-tab">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          <div className="font-semibold">{effectivePeriod.type} Summary</div>
          <div>
            {offsetStart.toDateString()} – {offsetEnd.toDateString()}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Filenames start with the period window */}
          <ExportPDFButton targetId="summary-tab" filename={`${filePrefix}_Summary.pdf`} />
          <SharePDFButton targetId="summary-tab" filename={`${filePrefix}_Summary.pdf`} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <div className="text-center">
            <div className="font-semibold">Inflows</div>
            <div>{money(inflowsTotal)}</div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="font-semibold">Outflows</div>
            <div>{money(outflowsTotal)}</div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="font-semibold">Net</div>
            <div className={net >= 0 ? "text-green-600" : "text-red-600"}>{money(net)}</div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="font-semibold">{daysLabel}</div>
            <div>{daysValue}</div>
          </div>
        </Card>
      </div>

      {/* Donut chart */}
      <Card>
        <h3 className="font-semibold mb-2">Inflows vs Outflows</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Bar chart of top outflow categories */}
      {outflowByCategory.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-2">Top Spending Categories</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={outflowByCategory}>
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="amount" fill="#f43f5e" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Insights */}
      <Card>
        <h3 className="font-semibold mb-2">Insights</h3>
        <p>{insight}</p>
      </Card>
    </div>
  )
}
