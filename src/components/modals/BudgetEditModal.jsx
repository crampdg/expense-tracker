import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState, useEffect, useMemo } from 'react'

/**
 * Props:
 * - open, onClose
 * - item: { category, amount, section }  // section is optional; purely for label context
 * - isNew: boolean
 * - onSave(form, scope) -> scope: "all" | "period" | "none"
 * - onDelete()
 * - onClaim(form)
 */
export default function BudgetEditModal({
  open,
  onClose,
  item,
  isNew = false,
  onSave,
  onDelete,
  onClaim
}) {
  const [form, setForm] = useState({ category: '', amount: '' })
  const [stage, setStage] = useState('edit') // 'edit' | 'rename'
  const [renameScope, setRenameScope] = useState('all') // default A

  useEffect(() => {
    if (item && open) {
      setForm({
        category: item.category || '',
        amount: item.amount ?? ''
      })
      setStage('edit')
      setRenameScope('all')
    }
  }, [item, open])

  const originalCategory = item?.category ?? ''
  const sectionLabel = (item?.section || '').toString().toLowerCase() === 'inflow'
    ? 'Inflows'
    : (item?.section || '').toString().toLowerCase() === 'outflow'
      ? 'Outflows'
      : null

  const normalize = (s) =>
    (s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const categoryChanged = useMemo(() => {
    if (isNew) return false
    return normalize(form.category) !== normalize(originalCategory)
  }, [form.category, originalCategory, isNew])

  const numberAmount = useMemo(() => {
    const n = typeof form.amount === 'string' ? form.amount.trim() : form.amount
    const num = Number(n)
    return Number.isFinite(num) ? num : NaN
  }, [form.amount])

  const canSave =
    (form.category ?? '').trim().length > 0 &&
    Number.isFinite(numberAmount)

  function handlePrimarySave() {
    if (!canSave) return
    if (!isNew && categoryChanged) {
      // Step into rename scope prompt
      setStage('rename')
    } else {
      // No rename needed
      onSave?.({ category: form.category.trim(), amount: numberAmount }, 'none')
    }
  }

  function applyRename() {
    // Return chosen scope along with the edited values
    onSave?.({ category: form.category.trim(), amount: numberAmount }, renameScope)
  }

  return (
    <Modal open={open} onClose={onClose}>
      {stage === 'edit' ? (
        <>
          <h3 className="font-semibold mb-3">
            {isNew ? 'Add Budget Line' : `Edit ${item?.category}`}
          </h3>

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
                <Button variant="ghost" onClick={() => onClaim?.({ category: form.category.trim(), amount: numberAmount })}>
                  Claim
                </Button>
                <Button
                  disabled={!canSave}
                  onClick={handlePrimarySave}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        // Rename scope prompt
        <>
          <h3 className="font-semibold mb-3">Rename matching transactions?</h3>
          <p className="text-sm mb-3 opacity-80">
            You’re renaming{sectionLabel ? ` in ${sectionLabel}` : ''}{' '}
            <strong>{originalCategory}</strong> → <strong>{form.category.trim()}</strong>.
            Choose how existing transactions should be updated.
          </p>

          <div className="grid gap-2 mb-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="rename-scope"
                value="all"
                checked={renameScope === 'all'}
                onChange={() => setRenameScope('all')}
              />
              <span>
                <strong>(A)</strong> Rename all matching transactions (all time)
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="rename-scope"
                value="period"
                checked={renameScope === 'period'}
                onChange={() => setRenameScope('period')}
              />
              <span>
                <strong>(B)</strong> Rename matching transactions in the current period only
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="rename-scope"
                value="none"
                checked={renameScope === 'none'}
                onChange={() => setRenameScope('none')}
              />
              <span>
                <strong>(C)</strong> Don’t rename previous transactions
              </span>
            </label>
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStage('edit')}>Back</Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={applyRename}>Apply</Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
