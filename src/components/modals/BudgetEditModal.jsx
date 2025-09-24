import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState, useEffect } from 'react'

export default function BudgetEditModal({ open, onClose, item, isNew = false, onSave, onDelete, onClaim }) {
  const [form, setForm] = useState({ category: '', amount: '' })

  useEffect(() => {
    if (item) setForm({ category: item.category || '', amount: item.amount ?? '' })
  }, [item, open])

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="font-semibold mb-3">{isNew ? 'Add Budget Line' : `Edit ${item?.category}`}</h3>
      <div className="grid gap-3">
        <input
          className="input"
          type="text"
          placeholder="Title (e.g., Paycheck, Food)"
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          required
        />
        <input
          className="input"
          type="number"
          placeholder="Amount"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          required
        />
        <div className="flex justify-between gap-2">
          {!isNew ? (
            <Button
              variant="ghost"
              className="bg-red-600 text-white hover:bg-red-700 border-transparent"
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : <div />}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="ghost" onClick={() => onClaim?.(form)}>Claim</Button>
            <Button onClick={() => onSave?.(form)}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
