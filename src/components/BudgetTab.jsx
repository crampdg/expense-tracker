import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import BudgetEditModal from './modals/BudgetEditModal.jsx'
import { useMemo, useState } from 'react'
import { money } from '../utils/format.js'

export default function BudgetTab({
  period, setPeriod, periodEnd,
  budgets, setBudgets,
  onClaim,
  transactions, // <-- pass from App.jsx (see step 3)
}) {
  const [editing, setEditing] = useState(null) // {section, index, isNew}
  const [history, setHistory] = useState([])   // stack of prior budgets for Undo

  const setPeriodType = (type) => setPeriod(p => ({ ...p, type }))
  const setDay = (day) => setPeriod(p => ({ ...p, day: Number(day) || 1 }))

  const pushHistory = () => setHistory(h => [...h, JSON.parse(JSON.stringify(budgets))])
  const undo = () => {
    setHistory(h => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setBudgets(prev)
      return h.slice(0, -1)
    })
  }

  const addRow = (section) => setEditing({ section, index: budgets[section].length, isNew: true })

  // --- Period range (start/end) for “Actuals” ---
  const startOfPeriod = useMemo(() => {
    const end = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate())
    if (period.type === 'Monthly') {
      const prevEnd = new Date(end.getFullYear(), end.getMonth() - 1, end.getDate())
      return new Date(prevEnd.getTime() + 24 * 60 * 60 * 1000) // day after prev end
    }
    if (period.type === 'Biweekly') {
      return new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000)
    }
    // Annually
    return new Date(end.getFullYear(), 0, 1)
  }, [period.type, periodEnd])

  const startISO = useMemo(() => startOfPeriod.toISOString().slice(0, 10), [startOfPeriod])
  const endISO   = useMemo(() => periodEnd.toISOString().slice(0, 10), [periodEnd])

  // --- Actuals in current period ---
  const inflowActuals = useMemo(() => {
    const m = {}
    for (const t of transactions || []) {
      if (t.type !== 'inflow') continue
      if (t.date >= startISO && t.date <= endISO) {
        m[t.category] = (m[t.category] || 0) + Number(t.amount || 0)
      }
    }
    return m
  }, [transactions, startISO, endISO])

  const outflowActuals = useMemo(() => {
    const m = {}
    for (const t of transactions || []) {
      if (t.type !== 'expense') continue
      if (t.date >= startISO && t.date <= endISO) {
        m[t.category] = (m[t.category] || 0) + Number(t.amount || 0)
      }
    }
    return m
  }, [transactions, startISO, endISO])

  // Totals / net
  const inflowsTotalBudget  = useMemo(() => budgets.inflows.reduce((s, i) => s + Number(i.amount || 0), 0), [budgets])
  const outflowsTotalBudget = useMemo(() => budgets.outflows.reduce((s, o) => s + Number(o.amount || 0), 0), [budgets])
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget

  // Save row (new or existing)
  const saveRow = ({ section, index, isNew }, form) => {
    pushHistory()
    setBudgets(b => {
      const next = { ...b }
      const arr = [...b[section]]
      const payload = { category: (form.category || '').trim() || 'Untitled', amount: Number(form.amount) || 0 }
      if (isNew) arr.push(payload)
      else arr[index] = payload
      next[section] = arr
      return next
    })
    setEditing(null)
  }

  // Delete row
  const deleteRow = ({ section, index, isNew }) => {
    if (isNew) { setEditing(null); return } // nothing to delete yet
    pushHistory()
    setBudgets(b => {
      const next = { ...b }
      const arr = [...b[section]]
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
    onClaim(section, isNew ? budgets[section].length : index, {
      category: (form.category || '').trim() || 'Untitled',
      amount: Number(form.amount) || 0
    })
  }

  const diffClass = (n) => (n >= 0 ? 'text-green-600' : 'text-red-600')

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-center font-bold">Budget</h2>
          <Button variant="ghost" onClick={undo} disabled={!history.length}>Undo</Button>
        </div>
        <p className="text-center text-gray-600 mb-4">Period Ended {periodEnd.toDateString()}</p>

        <div className="flex justify-center gap-2 mb-6">
          <select value={period.type} onChange={e => setPeriodType(e.target.value)} className="select">
            <option>Monthly</option>
            <option>Biweekly</option>
            <option>Annually</option>
          </select>
          {period.type === 'Monthly' && (
            <input
              type="number" min="1" max="28"
              value={period.day}
              onChange={e => setDay(e.target.value)}
              className="input w-20"
            />
          )}
        </div>

        {/* Inflows */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Inflows</h3>
          <Button variant="ghost" onClick={() => addRow('inflows')}>+ Add Inflow</Button>
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
              {budgets.inflows.map((item, idx) => {
                const actual = Number(inflowActuals[item.category] || 0)
                const budget = Number(item.amount || 0)
                const diff = actual - budget // inflow: good if >= 0
                return (
                  <tr
                    key={`${item.category}-${idx}`}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setEditing({ section: 'inflows', index: idx, isNew: false })}
                  >
                    <td className="td">{item.category}</td>
                    <td className="td text-right">{money(budget)}</td>
                    <td className="td text-right">{money(actual)}</td>
                    <td className={`td text-right ${diffClass(diff)}`}>{money(diff)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Outflows */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Outflows</h3>
          <Button variant="ghost" onClick={() => addRow('outflows')}>+ Add Outflow</Button>
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
              {budgets.outflows.map((item, idx) => {
                const actual = Number(outflowActuals[item.category] || 0)
                const budget = Number(item.amount || 0)
                const diff = budget - actual // outflow: good if >= 0 (remaining)
                return (
                  <tr
                    key={`${item.category}-${idx}`}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setEditing({ section: 'outflows', index: idx, isNew: false })}
                  >
                    <td className="td">{item.category}</td>
                    <td className="td text-right">{money(budget)}</td>
                    <td className="td text-right">{money(actual)}</td>
                    <td className={`td text-right ${diffClass(diff)}`}>{money(diff)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Net budgeted spending */}
        <div className="mt-4 flex justify-end">
          <div className={`font-semibold ${netBudgeted < 0 ? 'text-red-600' : ''}`}>
            Net Budgeted Spending: {money(netBudgeted)}
          </div>
        </div>
      </Card>

      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={editing ? (editing.isNew ? { category: '', amount: '' } : budgets[editing.section][editing.index]) : null}
        isNew={!!editing?.isNew}
        onSave={(form) => saveRow(editing, form)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />
    </>
  )
}
