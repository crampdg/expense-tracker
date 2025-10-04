import { useMemo } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import Card from "./ui/Card.jsx"
import ExportPDFButton from "./ui/ExportPDFButton.jsx"
import SharePDFButton from "./ui/SharePDFButton.jsx"
import { money } from "../utils/format.js"
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils"

/**
 * SummaryTab — compact, insight-first period summary
 *
 * - Top is compact (mirrors Budget tab’s density).
 * - Removes redundant donut + duplicate inflow/outflow tiles.
 * - Adds Cashflow Timeline (cumulative net by day) for unique insight.
 * - Keeps Top Spending Categories (distinct info).
 * - Adds Projection (current period only) and Recent Activity (last 5).
 *
 * Props:
 * - transactions: [{ type: 'inflow'|'expense', amount, category, date: 'YYYY-MM-DD', ... }]
 * - budget: (unused here; kept for parity)
 * - period: { type, anchorDate }   // shared with BudgetTab
 * - periodOffset: number           // shared with BudgetTab
 */
export default function SummaryTab({ transactions, budget, period, periodOffset }) {
  const txs = Array.isArray(transactions) ? transactions : []

  // Respect BudgetTab's selected period if provided; otherwise fallback to saved/default.
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
  const filePrefix = `${startISO}_to_${endISO}`

  const dayMs = 24 * 60 * 60 * 1000
  const isCurrentPeriod = effectiveOffset === 0
  const daysTotal = Math.round((offsetEnd - offsetStart) / dayMs) + 1

  const today = new Date()
  const clampedToday = new Date(Math.min(today.getTime(), offsetEnd.getTime()))
  const daysElapsed = Math.max(1, Math.round((clampedToday - offsetStart) / dayMs) + 1)

  const daysLabel = isCurrentPeriod ? "Days Left" : "Days in Period"
  const daysValue = isCurrentPeriod
    ? Math.max(0, Math.ceil((offsetEnd - today) / dayMs))
    : daysTotal

  // Period-scope txs
  const periodTxs = useMemo(
    () => txs.filter((t) => t?.date && t.date >= startISO && t.date <= endISO),
    [txs, startISO, endISO]
  )

  // Totals
  const inflowsTotal = useMemo(
    () => periodTxs.filter((t) => t.type === "inflow").reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxs]
  )
  const outflowsTotal = useMemo(
    () => periodTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxs]
  )
  const net = inflowsTotal - outflowsTotal
  const savingsRate = inflowsTotal > 0 ? net / inflowsTotal : 0 // % of inflows kept

  // Top outflow categories (top 5)
  const outflowByCategory = useMemo(() => {
    const m = {}
    for (const t of periodTxs) {
      if (t.type !== "expense") continue
      const cat = (t.category ?? "Uncategorized") || "Uncategorized"
      m[cat] = (m[cat] || 0) + Number(t.amount || 0)
    }
    return Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [periodTxs])

  // Recent activity (last 5 by date, desc)
  const recentTxs = useMemo(() => {
    const sorted = [...periodTxs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return sorted.slice(0, 5)
  }, [periodTxs])

  // Cashflow timeline (cumulative net by day)
  const cashflowSeries = useMemo(() => {
    // Daily net map
    const daily = new Map()
    for (let t = new Date(offsetStart); t <= offsetEnd; t = new Date(t.getTime() + dayMs)) {
      const d = t.toISOString().slice(0, 10)
      daily.set(d, 0)
    }
    for (const tx of periodTxs) {
      const d = tx.date
      if (!daily.has(d)) continue
      const delta = tx.type === "inflow" ? Number(tx.amount || 0) : -Number(tx.amount || 0)
      daily.set(d, (daily.get(d) || 0) + delta)
    }
    // Accumulate
    let running = 0
    const series = []
    for (let t = new Date(offsetStart); t <= offsetEnd; t = new Date(t.getTime() + dayMs)) {
      const d = t.toISOString().slice(0, 10)
      running += daily.get(d) || 0
      series.push({ date: d, cum: running })
    }
    return series
  }, [periodTxs, offsetStart, offsetEnd])

  // Projection (current period only)
  const projectedNet = useMemo(() => {
    if (!isCurrentPeriod) return null
    const dailyNet = net / daysElapsed
    return dailyNet * daysTotal
  }, [isCurrentPeriod, net, daysElapsed, daysTotal])

  const topCategory = outflowByCategory[0]
  const concentration =
    topCategory && outflowsTotal > 0
      ? `${((topCategory.amount / outflowsTotal) * 100).toFixed(0)}% of outflows`
      : null

  return (
    <div className="space-y-4" id="summary-tab">
      {/* Compact header */}
      <div className="flex items-start justify-between">
        <div className="text-sm text-gray-600">
          <div className="font-semibold">{effectivePeriod.type} Summary</div>
          <div>
            {offsetStart.toDateString()} – {offsetEnd.toDateString()}
          </div>
        </div>
        <div className="flex gap-2">
          <ExportPDFButton targetId="summary-tab" filename={`${filePrefix}_Summary.pdf`} />
          <SharePDFButton targetId="summary-tab" filename={`${filePrefix}_Summary.pdf`} />
        </div>
      </div>

      {/* Ultra-compact stat strip (no duplicate tiles) */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <div className="text-center">
            <div className="font-semibold">Net</div>
            <div className={net >= 0 ? "text-green-600" : "text-red-600"}>{money(net)}</div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="font-semibold">Savings Rate</div>
            <div>{(savingsRate * 100).toFixed(0)}%</div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="font-semibold">{daysLabel}</div>
            <div>{daysValue}</div>
          </div>
        </Card>
      </div>

      {/* Unique insight: Cashflow Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Cashflow Timeline</h3>
          <div className="text-xs text-gray-500">Cumulative net by day</div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" hide />
            <YAxis tickFormatter={(v) => money(v)} width={70} />
            <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => `Date: ${l}`} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Area type="monotone" dataKey="cum" fillOpacity={0.2} strokeOpacity={1} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Category insight (kept — distinct info) */}
      {outflowByCategory.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Top Spending Categories</h3>
            {concentration && (
              <div className="text-xs text-gray-500">
                {topCategory.category}: {concentration}
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={outflowByCategory}>
              <XAxis dataKey="category" />
              <YAxis tickFormatter={(v) => money(v)} width={70} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="amount" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Projection (current period only) */}
      {isCurrentPeriod && projectedNet !== null && (
        <Card>
          <h3 className="font-semibold mb-1">Projection</h3>
          <p className="text-sm text-gray-700">
            Based on your average daily net so far, you’re on pace for{" "}
            <span className={projectedNet >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
              {money(projectedNet)}
            </span>{" "}
            by period end.
          </p>
        </Card>
      )}

      {/* Recent activity peek (adds utility without duplicating Detailed tab) */}
      {recentTxs.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-2">Recent Activity</h3>
          <ul className="divide-y">
            {recentTxs.map((t, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span aria-hidden>{t.type === "inflow" ? "➕" : "➖"}</span>
                  <span className="text-gray-700">{t.category || "Uncategorized"}</span>
                  <span className="text-gray-400">· {t.date}</span>
                </div>
                <div className={t.type === "inflow" ? "text-green-600" : "text-red-600"}>
                  {money(Number(t.amount || 0))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
