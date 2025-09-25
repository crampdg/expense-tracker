import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import TransactionEditModal from './modals/TransactionEditModal.jsx'
import { useMemo, useState } from 'react'
import { money } from '../utils/format.js'

export default function DetailedTab({ transactions, editTransaction, deleteTransaction }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ month: '', type: '', category: '', amtSign: '', amtValue: '' })

  const openEdit = (transaction) => { setSelected(transaction); setOpen(true) }

  const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))] // YYYY-MM
  const categories = [...new Set(transactions.map(t => t.category || '-'))]

  const filtered = useMemo(() => {
    return transactions
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter(t => !filters.month || t.date.startsWith(filters.month))
      .filter(t => !filters.type || t.type === filters.type)
      .filter(t => !filters.category || t.category === filters.category)
      .filter(t => !filters.amtSign || (
        filters.amtSign === '>' ? Number(t.amount) > Number(filters.amtValue || 0)
                                : Number(t.amount) < Number(filters.amtValue || 0)
      ))
  }, [transactions, filters])

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Detailed Listing</h2>

        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <select className="select" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}>
            <option value="">Filter by Month</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select className="select" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">Filter by Type</option>
            <option value="inflow">Inflow</option>
            <option value="expense">Expense</option>
          </select>

          <select className="select" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">Filter by Category</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <select className="select" value={filters.amtSign} onChange={e => setFilters(f => ({ ...f, amtSign: e.target.value }))}>
              <option value="">Amount</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
            </select>
            <input
              className="input w-28"
              type="number"
              placeholder="Value"
              value={filters.amtValue}
              onChange={e => setFilters(f => ({ ...f, amtValue: e.target.value }))}
            />
          </div>

          <Button variant="ghost" onClick={() => setFilters({ month: '', type: '', category: '', amtSign: '', amtValue: '' })}>
            Clear
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs md:text-sm">
            <thead className="table-head">
              <tr>
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th">Amount</th>
                <th className="th">Category</th>
                <th className="th">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(transaction => (
                <tr key={transaction.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(transaction)}>
                  <td className="td">{transaction.date}</td>
                  <td className="td capitalize">{transaction.type}</td>
                  <td className="td">{transaction.type === 'inflow' ? '+' : '-'}{money(transaction.amount)}</td>
                  <td className="td">{transaction.category || '-'}</td>
                  <td className="td">{transaction.description || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <TransactionEditModal
        open={open}
        onClose={() => setOpen(false)}
        transaction={selected}
        onSave={(updated) => { editTransaction(selected.id, updated); setOpen(false) }}
        onDelete={() => { deleteTransaction(selected.id); setOpen(false) }}
      />
    </>
  )
}
