import { calcPeriodEnd, getAnchoredPeriodStart } from "../utils/periodUtils"
import Card from "./ui/Card.jsx"
import Button from "./ui/Button.jsx"
import BudgetEditModal from "./modals/BudgetEditModal.jsx"
import { useMemo, useState } from "react"
import { money } from "../utils/format.js"
import ExportPDFButton from "./ui/ExportPDFButton.jsx"
import SharePDFButton from "./ui/SharePDFButton.jsx"

export default function BudgetTab({
  period,            // { type, anchorDate }
  setPeriod,
  budgets,           // { inflows: [], outflows: [] }
  setBudgets,
  onClaim,
  transactions,
  periodOffset,
  setPeriodOffset,
}) {
  // Safety: normalize props
  const normBudgets = budgets ?? { inflows: [], outflows: [] }
  const txs = Array.isArray(transactions) ? transactions : []

  const [editing, setEditing] = useState(null) // {section, index, isNew}
  const [history, setHistory] = useState([])   // stack of prior budgets for Undo

  const pushHistory = () =>
    setHistory((h) => [...h, JSON.parse(JSON.stringify(budgets))])

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setBudgets(prev)
      return h.slice(0, -1)
    })
  }

  const addRow = (section) =>
    setEditing({ section, index: normBudgets[section].length, isNew: true })

  // --- Period range (start/end) for “Actuals” ---
  const offsetStart = useMemo(() => {
    return getAnchoredPeriodStart(
      period.type,
      period.anchorDate,
      new Date(),
      periodOffset
    )
  }, [period.type, period.anchorDate, periodOffset])

  const offsetEnd = useMemo(() => {
    return calcPeriodEnd(period.type, offsetStart)
  }, [period.type, offsetStart])

  const startISO = offsetStart.toISOString().slice(0, 10)
  const endISO   = offsetEnd.toISOString().slice(0, 10)

  // --- Actuals in current (or offset) period ---
  const inflowActuals = useMemo(() => {
    const m = {}
    for (const t of txs) {
      if (t.type !== "inflow") continue
      if (t.date >= startISO && t.date <= endISO) {
        m[t.category] = (m[t.category] || 0) + Number(t.amount || 0)
      }
    }
    return m
  }, [txs, startISO, endISO])

  const outflowActuals = useMemo(() => {
    const m = {}
    for (const t of txs) {
      if (t.type !== "expense") continue
      if (t.date >= startISO && t.date <= endISO) {
        m[t.category] = (m[t.category] || 0) + Number(t.amount || 0)
      }
    }
    return m
  }, [txs, startISO, endISO])

  // Totals / net (budgeted)
  const inflowsTotalBudget  = useMemo(
    () => normBudgets.inflows.reduce((s, i) => s + Number(i.amount || 0), 0),
    [normBudgets]
  )
  const outflowsTotalBudget = useMemo(
    () => normBudgets.outflows.reduce((s, o) => s + Number(o.amount || 0), 0),
    [normBudgets]
  )
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget

  // Save row (new or existing)
  const saveRow = ({ section, index, isNew }, form) => {
    pushHistory()
    setBudgets((prev) => {
      const next = { ...prev }
      const arr = [...(prev?.[section] ?? [])]
      const payload = {
        category: (form.category || "").trim() || "Untitled",
        amount: Number(form.amount) || 0,
      }
      if (isNew) arr.push(payload)
      else arr[index] = payload
      next[section] = arr
      return next
    })
    setEditing(null)
  }

  // Delete row
  const deleteRow = ({ section, index, isNew }) => {
    if (isNew) { setEditing(null); return }
    pushHistory()
    setBudgets((prev) => {
      const next = { ...prev }
      const arr = [...(prev?.[section] ?? [])]
      arr.splice(index, 1)
      next[section] = arr
      return next
    })
    setEditing(null)
  }

  // Claim row (supports claiming a brand-new row by passing its values)
  const claimRow = ({ section, index, isNew }, form) => {
    // Ensure it exists in budgets first
    saveRow({ section, index, isNew }, form)
    // Use provided values for immediate claim
    onClaim(section, isNew ? normBudgets[section].length : index, {
      category: (form.category || "").trim() || "Untitled",
      amount: Number(form.amount) || 0,
    })
  }

  const diffClass = (n) => (n >= 0 ? "text-green-600" : "text-red-600")

  return (
    <>
      {/* Wrap what we want to export/share */}
      <div id="budget-tab" className="space-y-4">
        {/* Header / toolbar */}
        <Card className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Budget</h2>
              <p className="text-sm text-gray-600">
                {offsetStart.toDateString()} – {offsetEnd.toDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-2"
                onClick={undo}
                disabled={!history.length}
                title="Undo"
              >
                ↩️ Undo
              </Button>
              <ExportPDFButton
                targetId="budget-tab"
                filename={`${startISO}_to_${endISO}_Budget.pdf`}
              />
              <SharePDFButton
                targetId="budget-tab"
                filename={`${startISO}_to_${endISO}_Budget.pdf`}
              />
            </div>
          </div>

          {/* Period navigator */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 items-center">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-1.5"
                onClick={() => setPeriodOffset((o) => o - 1)}
                title="Previous period"
              >
                ← Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-1.5"
                onClick={() => setPeriodOffset((o) => o + 1)}
                title="Next period"
              >
                Next →
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-1.5"
                onClick={() => setPeriodOffset(0)}
                title="Reset to current period"
              >
                Reset
              </Button>
            </div>

            {/* period type + anchor date */}
            <div className="col-span-2 md:col-span-1 md:justify-self-end">
              <div className="bg-gray-50 rounded-xl p-2 flex items-center gap-2">
                <select
                  value={period.type}
                  onChange={(e) => setPeriod((p) => ({ ...p, type: e.target.value }))}
                  className="select !py-1.5"
                >
                  <option>Monthly</option>
                  <option>Biweekly</option>
                  <option>Weekly</option>
                  <option>SemiMonthly</option>
                  <option>Annually</option>
                </select>

                <input
                  type="date"
                  value={period.anchorDate}
                  onChange={(e) => setPeriod((p) => ({ ...p, anchorDate: e.target.value }))}
                  className="input !py-1.5"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="text-center">
            <div className="text-xs text-gray-500">Budgeted Inflows</div>
            <div className="text-lg font-semibold">{money(inflowsTotalBudget)}</div>
          </Card>
          <Card className="text-center">
            <div className="text-xs text-gray-500">Budgeted Outflows</div>
            <div className="text-lg font-semibold">{money(outflowsTotalBudget)}</div>
          </Card>
          <Card className="text-center md:col-span-1 col-span-2">
            <div className="text-xs text-gray-500">Net Budgeted</div>
            <div className={`text-lg font-semibold ${netBudgeted < 0 ? "text-red-600" : "text-green-700"}`}>
              {money(netBudgeted)}
            </div>
          </Card>
        </div>

        {/* Tables side-by-side on desktop */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Inflows */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3">
              <h3 className="font-semibold">Inflows</h3>
              <Button type="button" variant="ghost" onClick={() => addRow("inflows")}>
                + Add Inflow
              </Button>
            </div>
            <div className="overflow-auto">
              <table className="w-full border-collapse text-xs md:text-sm">
                <thead className="table-head sticky top-0 z-10">
                  <tr>
                    <th className="th w-2/5">Title</th>
                    <th className="th text-right">Budget</th>
                    <th className="th text-right">Actual</th>
                    <th className="th text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {normBudgets.inflows.map((item, idx) => {
                    const actual = Number(inflowActuals[item.category] || 0)
                    const budget = Number(item.amount || 0)
                    const diff = actual - budget // inflow: good if >= 0
                    return (
                      <tr
                        key={`${item.category}-${idx}`}
                        className="hover:bg-gray-50 cursor-pointer odd:bg-white even:bg-gray-50/40"
                        onClick={() => setEditing({ section: "inflows", index: idx, isNew: false })}
                      >
                        <td className="td">{item.category}</td>
                        <td className="td text-right">{money(budget)}</td>
                        <td className="td text-right">{money(actual)}</td>
                        <td className={`td text-right ${diffClass(diff)}`}>{money(diff)}</td>
                      </tr>
                    )
                  })}
                  {normBudgets.inflows.length === 0 && (
                    <tr>
                      <td className="td text-center text-gray-500" colSpan={4}>No inflows yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Outflows */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3">
              <h3 className="font-semibold">Outflows</h3>
              <Button type="button" variant="ghost" onClick={() => addRow("outflows")}>
                + Add Outflow
              </Button>
            </div>
            <div className="overflow-auto">
              <table className="w-full border-collapse text-xs md:text-sm">
                <thead className="table-head sticky top-0 z-10">
                  <tr>
                    <th className="th w-2/5">Title</th>
                    <th className="th text-right">Budget</th>
                    <th className="th text-right">Actual</th>
                    <th className="th text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {normBudgets.outflows.map((item, idx) => {
                    const actual = Number(outflowActuals[item.category] || 0)
                    const budget = Number(item.amount || 0)
                    const diff = budget - actual // outflow: good if >= 0 (remaining)
                    return (
                      <tr
                        key={`${item.category}-${idx}`}
                        className="hover:bg-gray-50 cursor-pointer odd:bg-white even:bg-gray-50/40"
                        onClick={() => setEditing({ section: "outflows", index: idx, isNew: false })}
                      >
                        <td className="td">{item.category}</td>
                        <td className="td text-right">{money(budget)}</td>
                        <td className="td text-right">{money(actual)}</td>
                        <td className={`td text-right ${diffClass(diff)}`}>{money(diff)}</td>
                      </tr>
                    )
                  })}
                  {normBudgets.outflows.length === 0 && (
                    <tr>
                      <td className="td text-center text-gray-500" colSpan={4}>No outflows yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Net budgeted spending (reinforced at bottom for long lists) */}
        <div className="flex justify-end">
          <Card className="inline-flex items-center gap-2">
            <span className="text-sm text-gray-600">Net Budgeted:</span>
            <span className={`font-semibold ${netBudgeted < 0 ? "text-red-600" : "text-green-700"}`}>
              {money(netBudgeted)}
            </span>
          </Card>
        </div>
      </div>

      {/* Modal for add/edit */}
      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={
          editing
            ? editing.isNew
              ? { category: "", amount: "" }
              : normBudgets[editing.section][editing.index]
            : null
        }
        isNew={!!editing?.isNew}
        onSave={(form) => saveRow(editing, form)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />
    </>
  )
}
