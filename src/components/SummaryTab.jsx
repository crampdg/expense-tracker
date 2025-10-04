import { useMemo, useState } from "react"

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
import Button from "./ui/Button.jsx"

export default function SummaryTab({ transactions, budget, period, periodOffset, setPeriodOffset, setPeriod }) {

  const txs = Array.isArray(transactions) ? transactions : []

  const [menuOpen, setMenuOpen] = useState(false)
  const canAdjustPeriod = typeof setPeriodOffset === "function"

  // Period from shared state (synced with Budget tab)
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
  const daysRemaining = Math.max(0, daysTotal - daysElapsed)

  // Period transactions
  const periodTxs = useMemo(
    () => txs.filter((t) => t?.date && t.date >= startISO && t.date <= endISO),
    [txs, startISO, endISO]
  )

  // Totals to date
  const inflowsTotal = useMemo(
    () => periodTxs.filter((t) => t.type === "inflow").reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxs]
  )
  const outflowsTotal = useMemo(
    () => periodTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxs]
  )
  const net = inflowsTotal - outflowsTotal
  const savingsRate = inflowsTotal > 0 ? net / inflowsTotal : 0

  // Budgeted totals (if provided)
  const plannedInflows = useMemo(
    () => (budget?.inflows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [budget]
  )
  const plannedOutflows = useMemo(
    () => (budget?.outflows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [budget]
  )

  // Projection: cap INFLOWS at remaining budget;
  // and cap INVESTMENTS outflows at their budget (pace other outflows).
  const projection = useMemo(() => {
    if (!isCurrentPeriod) return null;

    // Pace to-date
    const dailyInflow = inflowsTotal / Math.max(1, daysElapsed);

    // ---------------- Inflows (unchanged): cap at remaining budget if exists ----------------
    const hasInflowBudget = plannedInflows > 0;
    const remainingBudgetedInflows = Math.max(0, plannedInflows - inflowsTotal);
    const projectedInflowsRemaining = hasInflowBudget
      ? remainingBudgetedInflows
      : dailyInflow * daysRemaining;

    // ---------------- Outflows: split Investments vs non-Investments ----------------
    const investCatName = "investments";

    // Budgeted Investments outflow for the period
    const plannedInvestOutflow = (budget?.outflows || []).reduce((s, r) => {
      const cat = (r.category || "").toLowerCase().trim();
      return s + (cat === investCatName ? (Number(r.amount) || 0) : 0);
    }, 0);

    // Actual Investments outflow to date
    const investSpentToDate = periodTxs.reduce((s, t) => {
      if (t.type !== "expense") return s;
      const cat = (t.category || "").toLowerCase().trim();
      return s + (cat === investCatName ? (Number(t.amount) || 0) : 0);
    }, 0);

    // Remaining budget for Investments (do NOT pace beyond this)
    const remainingBudgetedInvestOut = Math.max(0, plannedInvestOutflow - investSpentToDate);

    // Non-investment outflows to date (these will be paced)
    const outflowsNonInvestToDate = outflowsTotal - investSpentToDate;
    const dailyOutflowNonInvest = outflowsNonInvestToDate / Math.max(1, daysElapsed);
    const projectedNonInvestOutRemaining = dailyOutflowNonInvest * daysRemaining;

    // Total projected outflows remaining = non-invest pace + capped investments
    const projectedOutflowsRemaining = projectedNonInvestOutRemaining + remainingBudgetedInvestOut;

    const projectedNetEnd = net + projectedInflowsRemaining - projectedOutflowsRemaining;

    return {
      projectedNetEnd,
      projectedInflowsRemaining,
      projectedOutflowsRemaining,
      remainingBudgetedInflows,
      remainingBudgetedInvestOut,
      clampApplied: {
        inflows: hasInflowBudget && inflowsTotal >= plannedInflows,
        investments: plannedInvestOutflow > 0 && investSpentToDate >= plannedInvestOutflow,
      },
    };
  }, [
    isCurrentPeriod,
    inflowsTotal,
    outflowsTotal,
    daysElapsed,
    daysRemaining,
    plannedInflows,
    budget?.outflows,
    net,
    periodTxs,
  ])


  // Top spending categories (distinct insight)
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

  const recentTxs = useMemo(() => {
    const sorted = [...periodTxs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return sorted.slice(0, 5)
  }, [periodTxs])

  // Cashflow timeline (cumulative net)
  const cashflowSeries = useMemo(() => {
    const daily = new Map()
    for (let t = new Date(offsetStart); t <= offsetEnd; t = new Date(t.getTime() + dayMs)) {
      daily.set(t.toISOString().slice(0, 10), 0)
    }
    for (const tx of periodTxs) {
      const d = tx.date
      if (!daily.has(d)) continue
      const delta = tx.type === "inflow" ? Number(tx.amount || 0) : -Number(tx.amount || 0)
      daily.set(d, (daily.get(d) || 0) + delta)
    }
    let running = 0
    const series = []
    for (let t = new Date(offsetStart); t <= offsetEnd; t = new Date(t.getTime() + dayMs)) {
      const d = t.toISOString().slice(0, 10)
      running += daily.get(d) || 0
      series.push({ date: d, cum: running })
    }
    return series
  }, [periodTxs, offsetStart, offsetEnd])

  const topCategory = outflowByCategory[0]
  const concentration =
    topCategory && outflowsTotal > 0
      ? `${((topCategory.amount / outflowsTotal) * 100).toFixed(0)}% of outflows`
      : null

  return (
    <div className="space-y-4" id="summary-tab">
      {/* Header (mirrors Budget tab) */}
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{effectivePeriod.type} Summary</h2>
            <div className="text-[11px] md:text-xs text-gray-600">
              {offsetStart.toDateString()} – {offsetEnd.toDateString()}
            </div>
          </div>

          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-1"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More"
            >
              ⋯
            </Button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-md z-20">
                <div className="px-2 py-1.5">
                  <ExportPDFButton targetId="summary-tab" filename={`${filePrefix}_Summary.pdf`} compact />
                </div>
                <div className="px-2 py-1 border-t border-gray-100">
                  <SharePDFButton targetId="summary-tab" filename={`${filePrefix}_Summary.pdf`} compact />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Period arrows */}
        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="!px-2 !py-1 text-sm"
            onClick={() => canAdjustPeriod && setPeriodOffset((o) => o - 1)}
            disabled={!canAdjustPeriod}
            title="Previous"
          >
            ←
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="!px-2 !py-1 text-sm"
            onClick={() => canAdjustPeriod && setPeriodOffset((o) => o + 1)}
            disabled={!canAdjustPeriod}
            title="Next"
          >
            →
          </Button>
        </div>
      </Card>


      {/* Stat strip */}
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
            <div className="font-semibold">{isCurrentPeriod ? "Days Left" : "Days in Period"}</div>
            <div>{isCurrentPeriod ? daysRemaining : daysTotal}</div>
          </div>
        </Card>
      </div>

      {/* Cashflow Timeline (unique insight) */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Cashflow Timeline</h3>
          <div className="text-xs text-gray-500">Cumulative net by day</div>
        </div>
        <div data-noswipe>
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
        </div>

      </Card>

      {/* Top Spending Categories */}
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
          <div data-noswipe>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={outflowByCategory}>
                <XAxis dataKey="category" />
                <YAxis tickFormatter={(v) => money(v)} width={70} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="amount" />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </Card>
      )}

      {/* Projection (current period only) */}
      {isCurrentPeriod && projection && (
        <Card>
          <h3 className="font-semibold mb-1">Projection</h3>
          <p className="text-sm text-gray-700">
            By period end you’re on pace for{" "}
            <span
              className={
                projection.projectedNetEnd >= 0
                  ? "text-green-600 font-medium"
                  : "text-red-600 font-medium"
              }
            >
              {money(projection.projectedNetEnd)}
            </span>
            .
          </p>
          {plannedInflows > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Inflows capped at budget (remaining {money(projection.remainingBudgetedInflows)}); outflows projected by current pace.
            </p>
          )}
        </Card>
      )}

      {/* Recent activity */}
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
