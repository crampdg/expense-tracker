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

// --- NEW: robust date helpers so strings or Dates are both OK ---
const toDate = (v) => {
  if (v instanceof Date) return isNaN(v) ? null : v
  if (typeof v === "string") {
    // handle "YYYY-MM-DD" or ISO
    const d = new Date(v.length <= 10 ? v + "T00:00:00" : v)
    return isNaN(d) ? null : d
  }
  if (typeof v === "number") {
    const d = new Date(v)
    return isNaN(d) ? null : d
  }
  return null
}
const mustDate = (v, fallback = new Date()) => toDate(v) ?? fallback

export default function SummaryTab({ transactions, budget, period, periodOffset, setPeriodOffset, setPeriod }) {

  const txs = Array.isArray(transactions) ? transactions : []

  const [menuOpen, setMenuOpen] = useState(false)
  const canAdjustPeriod = typeof setPeriodOffset === "function"

  // Period from shared state (synced with Budget tab)
  // Valid types + mapping from UI labels
  const VALID_TYPES = new Set(["Monthly", "Biweekly", "Weekly", "SemiMonthly", "Annually"]);
  const normalizeType = (t) => {
    const map = { "Semi-Monthly": "SemiMonthly", Annual: "Annually" };
    const candidate = map[t] || t;
    return VALID_TYPES.has(candidate) ? candidate : "Monthly";
  };

  const effectivePeriod = useMemo(() => {
    const type = normalizeType(period?.type);
    const anchor = period?.anchorDate || new Date().toISOString().slice(0, 10);
    return { type, anchorDate: anchor };
  }, [period?.type, period?.anchorDate]);

  const effectiveOffset = typeof periodOffset === "number" ? periodOffset : 0;

  const offsetStart = useMemo(() => {
    try {
      const raw = getAnchoredPeriodStart(
        effectivePeriod.type,
        effectivePeriod.anchorDate,
        new Date(),
        effectiveOffset
      );
      return mustDate(raw);
    } catch {
      return mustDate(effectivePeriod.anchorDate);
    }
  }, [effectivePeriod.type, effectivePeriod.anchorDate, effectiveOffset]);

  const offsetEnd = useMemo(() => {
    const raw = calcPeriodEnd(effectivePeriod.type, offsetStart)
    // if calcPeriodEnd returns string or Date, normalize; also never allow end < start
    const d = mustDate(raw, offsetStart)
    return d.getTime() < offsetStart.getTime() ? offsetStart : d
  }, [effectivePeriod.type, offsetStart])

  // If something still went wrong with dates, short-circuit to a safe UI
  const datesOkay = offsetStart instanceof Date && offsetEnd instanceof Date && !isNaN(offsetStart) && !isNaN(offsetEnd)

  const startISO = datesOkay ? offsetStart.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  const endISO = datesOkay ? offsetEnd.toISOString().slice(0, 10) : startISO
  const filePrefix = `${startISO}_to_${endISO}`

  const dayMs = 24 * 60 * 60 * 1000
  const isCurrentPeriod = effectiveOffset === 0
  const daysTotal = Math.max(1, Math.round((offsetEnd - offsetStart) / dayMs) + 1)
  const today = new Date()
  const clampedToday = new Date(Math.min(today.getTime(), offsetEnd.getTime()))
  const daysElapsed = Math.max(1, Math.round((clampedToday - offsetStart) / dayMs) + 1)
  const daysRemaining = Math.max(0, daysTotal - daysElapsed)

  // --- NEW: build a set of fixed-expense categories from the budget
  const fixedCategorySet = useMemo(() => {
    const rows = (budget?.outflows || [])
    const set = new Set()
    for (const r of rows) {
      const t = (r?.type || "").toLowerCase().trim()
      if (t === "fixed") {
        const c = (r?.category || "").toLowerCase().trim()
        if (c) set.add(c)
      }
    }
    return set
  }, [budget])

  const isFixedExpenseTx = (tx) => {
    if (!tx || tx.type !== "expense") return false
    const cat = (tx.category || "").toLowerCase().trim()
    return fixedCategorySet.has(cat)
  }

  // Period transactions (all)
  const periodTxs = useMemo(
    () => txs.filter((t) => t?.date && t.date >= startISO && t.date <= endISO),
    [txs, startISO, endISO]
  )

  // --- NEW: Summary should ignore fixed expenses
  const periodTxsForSummary = useMemo(() => {
    return periodTxs.filter((t) => !(t.type === "expense" && isFixedExpenseTx(t)))
  }, [periodTxs])

  // Totals to date (ignoring fixed expenses for outflows)
  const inflowsTotal = useMemo(
    () => periodTxsForSummary.filter((t) => t.type === "inflow").reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxsForSummary]
  )
  const outflowsTotal = useMemo(
    () => periodTxsForSummary.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0),
    [periodTxsForSummary]
  )
  const net = inflowsTotal - outflowsTotal
  const savingsRate = inflowsTotal > 0 ? net / inflowsTotal : 0

  // Top spending categories (ignoring fixed)
  const outflowByCategory = useMemo(() => {
    const m = {}
    for (const t of periodTxsForSummary) {
      if (t.type !== "expense") continue
      const cat = (t.category ?? "Uncategorized") || "Uncategorized"
      m[cat] = (m[cat] || 0) + Number(t.amount || 0)
    }
    return Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [periodTxsForSummary])

  // Recent activity (ignoring fixed)
  const recentTxs = useMemo(() => {
    const filtered = periodTxsForSummary
    const sorted = [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return sorted.slice(0, 5)
  }, [periodTxsForSummary])

  // Cashflow timeline (cumulative net), ignoring fixed expenses
  const cashflowSeries = useMemo(() => {
    const start = offsetStart
    const end = offsetEnd
    if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end)) return []

    const daily = new Map()
    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + dayMs)) {
      daily.set(t.toISOString().slice(0, 10), 0)
    }
    for (const tx of periodTxs) {
      const d = tx.date
      if (!daily.has(d)) continue
      // Skip fixed expense transactions entirely
      if (tx.type === "expense" && isFixedExpenseTx(tx)) continue

      const delta = tx.type === "inflow" ? Number(tx.amount || 0) : -Number(tx.amount || 0)
      daily.set(d, (daily.get(d) || 0) + delta)
    }
    let running = 0
    const series = []
    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + dayMs)) {
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
              {datesOkay ? `${offsetStart.toDateString()} – ${offsetEnd.toDateString()}` : "Invalid dates"}
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
        <div data-noswipe className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="!px-2 !py-1 text-sm"
            onPointerUp={() => canAdjustPeriod && setPeriodOffset((o) => o - 1)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && canAdjustPeriod) {
                e.preventDefault();
                setPeriodOffset((o) => o - 1);
              }
            }}
            disabled={!canAdjustPeriod}
            title="Previous"
          >
            ←
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="!px-2 !py-1 text-sm"
            onPointerUp={() => canAdjustPeriod && setPeriodOffset((o) => o + 1)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && canAdjustPeriod) {
                e.preventDefault();
                setPeriodOffset((o) => o + 1);
              }
            }}
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

      {/* Cashflow Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Cashflow Timeline</h3>
          <div className="text-xs text-gray-500">Cumulative net by day (fixed expenses excluded)</div>
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
