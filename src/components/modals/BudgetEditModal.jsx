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
  isNew,
  parents = [],
  currentParent = null,
  onSave,
  onDelete,
  onClaim,
}) {
  const section = (item?.section || '').toString().toLowerCase()
  const isOutflows = section === 'outflows'

  // ------- Local state -------
  const [form, setForm] = useState({
    category: '',
    amount: '',
    parent: '', // '' => top-level
    type: '',   // 'fixed' | 'variable' (outflows only; top-level only)
  })
  const [renameScope, setRenameScope] = useState('all') // "all" | "period" | "none"

  // When the modal opens or the selected row changes, re-init the form
  const itemKey = item ? `${item.section || ''}::${item.category || ''}::${item.amount ?? ''}` : ''
  useEffect(() => {
    if (!open || !item) return
    setForm({
      category: item.category || '',
      amount: item.amount ?? '',
      parent: currentParent || '', // '' => top-level
      type: isOutflows ? (item?.type === 'fixed' ? 'fixed' : 'variable') : '',
    })
    setRenameScope('all')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey])

  const parentIsSelected = !!form.parent && form.parent.trim().length > 0
  const showTypeSelector = isOutflows && !parentIsSelected // only for top-level outflows

  const handleSave = () => {
    const payload = {
      category: (form.category || '').trim() || 'Untitled',
      // Top-level rows can set amount; sub-rows always have amount=0 and sum via children
      amount: parentIsSelected ? 0 : Number(form.amount || 0),
      parent: parentIsSelected ? form.parent : null,
      ...(isOutflows ? { type: showTypeSelector ? (form.type === 'fixed' ? 'fixed' : 'variable') : undefined } : {}),
    }
    onSave?.(payload, renameScope)
    onClose?.()
  }

  const handleDelete = () => {
    onDelete?.()
    onClose?.()
  }

  const handleClaim = () => {
    // Claim only really makes sense for top-level lines
    const payload = {
      category: (form.category || '').trim() || 'Untitled',
      amount: Number(form.amount || 0),
      parent: null,
      ...(isOutflows ? { type: showTypeSelector ? (form.type === 'fixed' ? 'fixed' : 'variable') : undefined } : {}),
    }
    onClaim?.(payload)
    onClose?.()
  }

  // --------- UI helpers ----------
  const ParentSelect = (
    <div className="grid grid-cols-1 gap-2">
      <label className="text-xs text-gray-600">Parent</label>
      <select
        className="select"
        value={form.parent}
        onChange={(e) => setForm((f) => ({ ...f, parent: e.target.value }))}
      >
        <option value="">None (top-level)</option>
        {parents.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      {isOutflows && parentIsSelected ? (
        <p className="text-[11px] text-gray-500">
          Subcategories inherit their parent’s type (Fixed/Variable).
        </p>
      ) : null}
    </div>
  )

  const TypeSelector = showTypeSelector ? (
    <div className="grid grid-cols-1 gap-2">
      <label className="text-xs text-gray-600">Type</label>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="radio"
            name="outflow-type"
            value="fixed"
            checked={form.type === 'fixed'}
            onChange={() => setForm((f) => ({ ...f, type: 'fixed' }))}
          />
          Fixed
        </label>
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="radio"
            name="outflow-type"
            value="variable"
            checked={form.type !== 'fixed'}
            onChange={() => setForm((f) => ({ ...f, type: 'variable' }))}
          />
          Variable
        </label>
      </div>
      <p className="text-[11px] text-gray-500">
        Fixed = predictable, scheduled bills. Variable = everything else.
      </p>
    </div>
  ) : null

  const AmountField = (
    <div className="grid grid-cols-1 gap-2">
      <label className="text-xs text-gray-600">Amount</label>
      <input
        className="input"
        type="number"
        step="0.01"
        inputMode="decimal"
        value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        disabled={parentIsSelected}
      />
      {parentIsSelected ? (
        <p className="text-[11px] text-gray-500">
          Amount is disabled for subcategories; totals roll up to the parent.
        </p>
      ) : null}
    </div>
  )

  const RenameScope = (
    <div className="grid grid-cols-1 gap-2">
      <label className="text-xs text-gray-600">Rename scope</label>
      <select
        className="select"
        value={renameScope}
        onChange={(e) => setRenameScope(e.target.value)}
      >
        <option value="all">All time (rename matching transactions)</option>
        <option value="period">This period only</option>
        <option value="none">Don’t rename transactions</option>
      </select>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "Add budget line" : "Edit budget line"}>
      {!item ? null : (
        <div className="space-y-4">
          {/* Category */}
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Category</label>
            <input
              className="input"
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder={isOutflows ? "e.g., Rent, Groceries" : "e.g., Paycheque"}
            />
          </div>

          {/* Parent selector */}
          {ParentSelect}

          {/* Type selector (top-level Outflows only) */}
          {TypeSelector}

          {/* Amount (disabled when parent is set) */}
          {AmountField}

          {/* Rename scope (only makes sense when editing existing OR renaming on save) */}
          {RenameScope}

          {/* Actions */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isNew ? (
                <Button variant="ghost" onClick={handleDelete}>
                  Delete
                </Button>
              ) : null}
              {!parentIsSelected ? (
                <Button variant="ghost" onClick={handleClaim} title="Create a transaction from this line">
                  Claim
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>{isNew ? 'Add' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
