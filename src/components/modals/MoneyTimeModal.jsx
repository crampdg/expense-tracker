import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState, useEffect } from 'react'

export default function MoneyTimeModal({ open, onClose, onSave, categories = [] }) {
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    category: '',
    description: '',
  })

  useEffect(() => {
    if (!open) {
      setForm({
        type: 'expense',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        category: '',
        description: '',
      })
    }
  }, [open])

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const handleSave = () => {
    const cleanForm = {
      ...form,
      amount: Number(form.amount) || 0,   // ensure numeric
    }
    onSave(cleanForm)
    onClose()
  }


  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="font-semibold mb-3">MONEY TIME! 💸</h3>
      <div className="grid gap-3">
        <select
          className="input"
          value={form.type}
          onChange={e => handleChange('type', e.target.value)}
        >
          <option value="inflow">Inflow</option>
          <option value="expense">Outflow</option>
        </select>

        <input
          type="number"
          className="input"
          placeholder="Amount"
          value={form.amount}
          onChange={e => handleChange('amount', e.target.value)}
        />

        <input
          type="date"
          className="input"
          value={form.date}
          onChange={e => handleChange('date', e.target.value)}
        />

        {/* Category with autocomplete */}
        <input
          type="text"
          className="input"
          list="category-options"
          placeholder="Category"
          value={form.category}
          onChange={e => handleChange('category', e.target.value)}
        />
        <datalist id="category-options">
          {categories.map((c, i) => (
            <option key={i} value={c} />
          ))}
        </datalist>

        <input
          type="text"
          className="input"
          placeholder="Description"
          value={form.description}
          onChange={e => handleChange('description', e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
