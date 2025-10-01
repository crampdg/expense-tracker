import { calcPeriodEnd, getAnchoredPeriodStart } from "../utils/periodUtils"
import Card from "./ui/Card.jsx"
import Button from "./ui/Button.jsx"
import BudgetEditModal from "./modals/BudgetEditModal.jsx"
import { useMemo, useState } from "react"
import { money } from "../utils/format.js"
import ExportPDFButton from "./ui/ExportPDFButton.jsx"
import SharePDFButton from "./ui/SharePDFButton.jsx"

export default function BudgetTab({
  period,
  setPeriod,
  budgets,
  setBudgets,
  onClaim,
  transactions,
  periodOffset,
  setPeriodOffset,
}) {
  // Safety: ensure arrays exist
  const b = budgets ?? { inflows: [], outflows: [] }
  const txs = Array.isArray(transactions) ? transactions : []

  const [editing, setEditing] = useState(null) // {section, index, isNew}
  const [history, setHistory] = useState([]) // stack of prior budgets for Undo

  const pushHistory = () =>
    setHistory((h) => [...h, JSON.parse(JSON.stringify(b))])

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setBudgets(prev)
      return h.slice(0, -1)
    })
  }

  const addRow = (section) =>
    setEditing({ section, index: b[section].length, isNew: true })

  // --- Period range (start/end) for “Actuals” ---
  const offsetStart = useMemo(() => {
    return getAnchoredPeriodStart(
      period.type,
      period.anchorDate,
      new Date(), // figure out the “current” period
      periodOffset
    )
  }, [period.type, period.anchorDate, periodOffset])

  const offsetEnd = useMemo(() => {
    return calcPeriodEnd(period.type, offsetStart)
  }, [period.type, offsetStart])

  const startISO = offsetStart.toISOString().slice(0, 10)
  const endISO = offsetEnd.toISOString().slice(0, 10)

  // --- Actuals in current period ---
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

  // Totals / net
  const inflowsTotalBudget = useMemo(
    () => b.inflows.reduce((s, i) => s + Number(i.amount || 0), 0),
    [b]
  )
  const outflowsTotalBudget = useMemo(
    () => b.outflows.reduce((s, o) => s + Number(o.amount || 0), 0),
    [b]
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
    if (isNew) {
      setEditing(null)
      return // nothing to delete yet
    }
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
    onClaim(section, isNew ? b[section].length : index, {
      category: (form.category || "").trim() || "Untitled",
      amount: Number(form.amount) || 0,
    })
  }

  const diffClass = (n) => (n >= 0 ? "text-green-600" : "text-red-600")

  return (
    <>
      {/* Wrap the visible content so Export/Share can capture it */}
      <div id="budget-tab">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-center font-bold">Budget</h2>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={undo} disabled={!history.length}>
                Undo
              </Button>
              <ExportPDFButton targetId="budget-tab" filename="Budget.pdf" />
              <SharePDFButton targetId="budget-tab" filename="Budget.pdf" />
            </div>
          </div>

          <div className="flex justify-between items-center mb-2">
            <button
              className="px-2 py-1 bg-gray-200 rounded"
              onClick={() => setPeriodOffset((o) => o - 1)}
            >
              ← Previous
            </button>

            <p>
              Period: {offsetStart.toDateString()} – {offsetEnd.toDateString()}
            </p>

            <button
              className="px-2 py-1 bg-gray-200 rounded"
              onClick={() => setPeriodOffset((o) => o + 1)}
            >
              Next →
            </button>

            <button
              className="ml-2 px-2 py-1 bg-gray-200 rounded"
              onClick={() => setPeriodOffset(0)}
            >
              Reset
            </button>
          </div>

          <div className="flex justify-center gap-2 mb-6">
            <select
              value={period.type}
              onChange={(e) =>
                setPeriod((p) => ({ ...p, type: e.target.value }))
              }
              className="select"
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
              onChange={(e) =>
                setPeriod((p) => ({ ...p, anchorDate: e.target.value }))
              }
              className="input"
            />
          </div>

          {/* Inflows */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Inflows</h3>
            <Button variant="ghost" onClick={() => addRow("inflows")}>
              + Add Inflow
            </Button>
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-xs md:text-sm">
              <thead className="table-head">
                <tr>
                  <th className="th w-2/5">Title</th>
                  <th className="th text-right">Budget</th>
                  <th className="th text-right">Actual</th>
                  <th className="th text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {b.inflows.map((item, idx) => {
                  const actual = Number(inflowActuals[item.category] || 0)
                  const budget = Number(item.amount || 0)
                  const diff = actual - budget // inflow: good if >= 0
                  return (
                    <tr
                      key={`${item.category}-${idx}`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() =>
                        setEditing({
                          section: "inflows",
                          index: idx,
                          isNew: false,
                        })
                      }
                    >
                      <td className="td">{item.category}</td>
                      <td className="td text-right">{money(budget)}</td>
                      <td className="td text-right">{money(actual)}</td>
                      <td className={`td text-right ${diffClass(diff)}`}>
                        {money(diff)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Outflows */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Outflows</h3>
            <Button variant="ghost" onClick={() => addRow("outflows")}>
              + Add Outflow
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs md:text-sm">
              <thead className="table-head">
                <tr>
                  <th className="th w-2/5">Title</th>
                  <th className="th text-right">Budget</th>
                  <th className="th text-right">Actual</th>
                  <th className="th text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {b.outflows.map((item, idx) => {
                  const actual = Number(outflowActuals[item.category] || 0)
                  const budget = Number(item.amount || 0)
                  const diff = budget - actual // outflow: good if >= 0 (remaining)
                  return (
                    <tr
                      key={`${item.category}-${idx}`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() =>
                        setEditing({
                          section: "outflows",
                          index: idx,
                          isNew: false,
                        })
                      }
                    >
                      <td className="td">{item.category}</td>
                      <td className="td text-right">{money(budget)}</td>
                      <td className="td text-right">{money(actual)}</td>
                      <td className={`td text-right ${diffClass(diff)}`}>
                        {money(diff)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Net budgeted spending */}
          <div className="mt-4 flex justify-end">
            <div
              className={`font-semibold ${netBudgeted < 0 ? "text-red-600" : ""}`}
            >
              Net Budgeted Spending: {money(netBudgeted)}
            </div>
          </div>
        </Card>
      </div>

      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={
          editing
            ? editing.isNew
              ? { category: "", amount: "" }
              : b[editing.section][editing.index]
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
