import { useMemo, useState } from "react"
import Card from "./ui/Card.jsx"
import Button from "./ui/Button.jsx"
import { money } from "../utils/format.js"
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils"
import TransactionEditModal from "./modals/TransactionEditModal.jsx"

export default function DetailedTab({
  transactions,
  budget,
  editTransaction,      // (updatedTx) => void
  deleteTransaction,    // (id) => void
  // Optional: if App ever passes these, we’ll use them; otherwise fallback to localStorage config
  period,
  periodOffset,
}) {
  const txs = Array.isArray(transactions) ? transactions : []

  // ---------- Period Context (align w/ Budget & Summary) ----------
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

  // ---------- Filters ----------
  const categories = useMemo(() => {
    const inflowCats = (budget?.inflows || []).map((i) => i.category)
    const outflowCats = (budget?.outflows || []).map((o) => o.category)
    return Array.from(new Set([...inflowCats, ...outflowCats])).filter(Boolean).sort()
  }, [budget])

  const [typeFilter, setTypeFilter] = useState("all") // all | inflow | expense
  const [categoryFilter, setCategoryFilter] = useState("")
  const [dateFrom, setDateFrom] = useState(startISO)
  const [dateTo, setDateTo] = useState(endISO)

  const applyCurrentPeriod = () => {
    setDateFrom(startISO)
    setDateTo(endISO)
  }
  const clearFilters = () => {
    setTypeFilter("all")
    setCategoryFilter("")
    setDateFrom("")
    setDateTo("")
  }

  // ---------- Data after filters ----------
  const filtered = useMemo(() => {
    const df = dateFrom ? new Date(dateFrom + "T00:00:00") : null
    const dt = dateTo ? new Date(dateTo + "T23:59:59") : null

    return txs
      .filter((t) => {
        if (typeFilter !== "all" && t.type !== typeFilter) return false
        if (categoryFilter && t.category !== categoryFilter) return false
        if (df || dt) {
          const td = t.date ? new Date(t.date + "T12:00:00") : null // noon to avoid TZ edge
          if (!td) return false
          if (df && td < df) return false
          if (dt && td > dt) return false
        }
        return true
      })
      .sort((a, b) => {
        // most recent first, then by id as tiebreaker
        const ad = a.date ? new Date(a.date) : new Date(0)
        const bd = b.date ? new Date(b.date) : new Date(0)
        if (bd - ad !== 0) return bd - ad
        return (b.id || 0) - (a.id || 0)
      })
  }, [txs, typeFilter, categoryFilter, dateFrom, dateTo])

  const totals = useMemo(() => {
    let inflows = 0
    let outflows = 0
    for (const t of filtered) {
      const amt = Number(t.amount) || 0
      if (t.type === "inflow") inflows += amt
      else if (t.type === "expense") outflows += amt
    }
    return {
      inflows,
      outflows,
      net: inflows - outflows,
    }
  }, [filtered])

  // ---------- Editing (local modal) ----------
  const [editingTx, setEditingTx] = useState(null)

  const onEdit = (tx) => setEditingTx(tx)
  const onDelete = (id) => deleteTransaction?.(id)

  return (
    <div className="space-y-4">
      {/* Header / Period context */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Detailed</h2>
            <p className="text-sm text-gray-600">
              {effectivePeriod.type} • {offsetStart.toDateString()} – {offsetEnd.toDateString()}
            </p>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 items-center">
            <select
              className="select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              title="Filter by type"
            >
              <option value="all">All Types</option>
              <option value="inflow">Inflows</option>
              <option value="expense">Expenses</option>
            </select>

            <select
              className="select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              title="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <input
              className="input"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
            />
            <input
              className="input"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
            />

            <Button variant="ghost" type="button" onClick={applyCurrentPeriod} title="Set to current period">
              Current Period
            </Button>
            <Button variant="ghost" type="button" onClick={clearFilters} title="Clear filters">
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-3">
          <h3 className="font-semibold">Transactions</h3>
          <div className="text-xs text-gray-500">
            Showing {filtered.length} of {txs.length}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs md:text-sm">
            <thead className="table-head sticky top-0 z-10">
              <tr>
                <th className="th w-[7.5rem]">Date</th>
                <th className="th w-[6.5rem]">Type</th>
                <th className="th">Category</th>
                <th className="th text-right w-[8rem]">Amount</th>
                <th className="th text-right w-[7rem]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isExpense = t.type === "expense"
                const amt = Number(t.amount) || 0
                const dateStr = t.date ? new Date(t.date + "T00:00:00").toLocaleDateString() : "—"
                return (
                  <tr key={t.id ?? `${t.category}-${t.date}-${amt}`}
                      className="odd:bg-white even:bg-gray-50/40 hover:bg-gray-50">
                    <td className="td">{dateStr}</td>
                    <td className="td">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          isExpense
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-green-50 text-green-700 border-green-200"
                        }`}
                      >
                        {isExpense ? "Expense" : "Inflow"}
                      </span>
                    </td>
                    <td className="td">{t.category || "Uncategorized"}</td>
                    <td className={`td text-right tabular-nums ${isExpense ? "text-red-600" : "text-green-700"}`}>
                      {isExpense ? "-" : "+"}{money(amt)}
                    </td>
                    <td className="td text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => onEdit(t)}
                          title="Edit"
                        >
                          ✏️ Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => onDelete(t.id)}
                          title="Delete"
                        >
                          🗑️ Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filtered.length === 0 && (
                <tr>
                  <td className="td text-center text-gray-500" colSpan={5}>
                    No transactions match your filters.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals */}
            <tfoot>
              <tr>
                <td className="th" colSpan={2}>Totals</td>
                <td className="th text-right">Inflows / Outflows / Net</td>
                <td className="th text-right tabular-nums" colSpan={2}>
                  <span className="mr-3 text-green-700">+{money(totals.inflows)}</span>
                  <span className="mr-3 text-red-600">-{money(totals.outflows)}</span>
                  <span className={`${totals.net >= 0 ? "text-green-700" : "text-red-600"} font-semibold`}>
                    {money(totals.net)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Local edit modal (reuses your existing component) */}
      {editingTx && (
        <TransactionEditModal
          open={!!editingTx}
          onClose={() => setEditingTx(null)}
          transaction={editingTx}
          onSave={(updated) => {
            editTransaction?.(updated)
            setEditingTx(null)
          }}
          onDelete={() => {
            if (editingTx?.id != null) deleteTransaction?.(editingTx.id)
            setEditingTx(null)
          }}
        />
      )}
    </div>
  )
}
