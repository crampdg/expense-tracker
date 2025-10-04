import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState, useEffect, useMemo } from 'react'

/**
 * Props:
 * - open, onClose
 * - item: { category, amount, section, type? }  // 'type' used for outflows only
 * - isNew: boolean
 * - parents: string[]           // list of existing top-level parents in this section (excluding self)
 * - currentParent: string|null  // the row's current parent name, or null if top-level
 * - onSave(form, scope) -> scope: "all" | "period" | "none"
 *      form = { category: string, amount: number, parent: string|null, type?: "fixed"|"variable" }
 * - onDelete()
 * - onClaim(form)
 */
export default function BudgetEditModal({
  open,
  onClose,
  item,
  isNew = false,
  parents = [],
  currentParent = null,
  onSave,
  onDelete,
  onClaim
}) {
  const [form, setForm] = useState({ category: '', amount: '', parent: '', type: '' })
  const [stage, setStage] = useState('edit') // 'edit' | 'rename'
  const [renameScope, setRenameScope] = useState('all') // default A

  // Normalize section label (for rename copy)
  const sectionLabel = (() => {
    const s = (item?.section || '').toString().toLowerCase()
    if (s === 'inflows') return 'Inflows'
    if (s === 'outflows') return 'Outflows'
    return null
  })()

  const normalize = (s) =>
    (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

  // Re-init form only when the modal opens or the selected row truly changes
  const itemKey = item ? `${item.section || ''}::${item.category || ''}::${item.amount ?? ''}` : '';
  useEffect(() => {
    if (!open || !item) return;
    setForm({
      category: item.category || '',
      amount: item.amount ?? '',
      parent: currentParent || '', // '' => top-level
      type: ((item?.section || '').toString().toLowerCase() === 'outflows')
        ? (item?.type === 'fixed' ? 'fixed' : 'variable')
        : ''
    });
    setStage('edit');
    setRenameScope('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentParent, itemKey]);


  const originalCategory = item?.category ?? ''
  const hasParent = (form.parent ?? '').trim().length > 0

  const categoryChanged = useMemo(() => {
    if (isNew) return false
    return normalize(form.category) !== normalize(originalCategory)
  }, [form.category, originalCategory, isNew])

  const numberAmount = useMemo(() => {
    if (hasParent) return 0 // subs ignore amount
    const n = typeof form.amount === 'string' ? form.amount.trim() : form.amount
    const num = Number(n)
    return Number.isFinite(num) ? num : NaN
  }, [form.amount, hasParent])

  const canSave =
    (form.category ?? '').trim().length > 0 &&
    (!hasParent ? Number.isFinite(numberAmount) : true)

  function handlePrimarySave() {
    if (!canSave) return
    if (!isNew && categoryChanged) {
      setStage('rename') // ask scope
    } else {
      onSave?.(
        {
          category: form.category.trim(),
          amount: hasParent ? 0 : numberAmount,
          parent: hasParent ? form.parent.trim() : null,
          type: ((item?.section || '').toString().toLowerCase() === 'outflows' && !hasParent)
            ? (form.type === 'fixed' ? 'fixed' : 'variable')
            : undefined
        },
        'none'
      )
    }
  }

  function applyRename() {
    onSave?.(
      {
        category: form.category.trim(),
        amount: hasParent ? 0 : numberAmount,
        parent: hasParent ? form.parent.trim() : null,
        type: ((item?.section || '').toString().toLowerCase() === 'outflows' && !hasParent)
          ? (form.type === 'fixed' ? 'fixed' : 'variable')
          : undefined
      },
      renameScope
    )
  }

  return (
    <Modal open={open} onClose={onClose}>
      {stage === 'edit' ? (
        <>
          <h3 className="font-semibold mb-3">
            {isNew ? 'Add Budget Line' : `Edit ${item?.category}`}
          </h3>

          <div className="grid gap-3 tap-safe">
            <input
              className="input"
              type="text"
              placeholder="Title (e.g., Paycheck, Food)"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              required
            />

            {/* Parent selector: 'None' or any existing top-level parent */}
            <div className="grid gap-1">
              <label className="text-xs text-gray-600">Parent</label>
              <select
                className="select"
                value={form.parent}
                onChange={e => setForm(f => ({ ...f, parent: e.target.value }))}
              >
                <option value="">None (top-level)</option>
                {parents.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {hasParent && (
                <p className="text-xs text-gray-600">
                  Subcategories don’t have budgets. The parent’s <em>Actual</em> is the sum of all its subcategories’ actuals.
                </p>
              )}
            </div>

            {/* Type (Outflows only, top-level only) */}
            {((item?.section || '').toString().toLowerCase() === 'outflows') && !hasParent && (
              <div className="grid gap-1">
                <label className="text-xs text-gray-600">Type</label>
                <select
                  className="select"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="variable">Variable (default)</option>
                  <option value="fixed">Fixed</option>
                </select>
                <p className="text-xs text-gray-600">You can change this later. Variable is default.</p>
              </div>
            )}

            {/* Amount only for top-level */}
            {!hasParent && (
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="Amount"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                required
              />
            )}

            <div className="flex justify-end gap-2 flex-wrap">
              {!isNew && (
                <Button variant="danger" onClick={onDelete}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>Cancel</Button>

              {/* Claim is only meaningful for top-level rows */}
              {!hasParent && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    onClaim?.({ category: form.category.trim(), amount: numberAmount, type: ((item?.section || '').toString().toLowerCase() === 'outflows' && !hasParent) ? (form.type === 'fixed' ? 'fixed' : 'variable') : undefined })
                  }
                >
                  Claim
                </Button>
              )}

              <Button disabled={!canSave} onClick={handlePrimarySave}>
                Save
              </Button>
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
