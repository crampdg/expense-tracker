import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState, useEffect, useRef } from 'react'

// ---- Duplicate-name helpers (local to modal) ----
const norm = (s) => (s || '').toLowerCase().trim();
function toSet(arr) {
  return new Set((arr || []).map((v) => norm(v)));
}


/**
 * Props:
 * - open, onClose
 * - item: { category, amount, section, type? }  // section is required; type used for outflows
 * - isNew: boolean
 * - parents: string[]
 * - currentParent: string|null
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
    type: 'variable',   // 'fixed' | 'variable' (outflows top-level AND subs)
  })
  const [renameScope, setRenameScope] = useState('all') // default if renaming

  // track original category to detect rename
  const originalCategoryRef = useRef('')

  // When the modal opens or the selected row changes, re-init the form
  const itemKey = item ? `${item.section || ''}::${item.category || ''}::${item.amount ?? ''}::${item?.type ?? ''}` : ''
  useEffect(() => {
    if (!open || !item) return
    originalCategoryRef.current = item.category || ''
    setForm({
      category: item.category || '',
      amount: item.amount ?? '',
      parent: currentParent || '', // '' => top-level
      type: isOutflows ? (item?.type === 'fixed' ? 'fixed' : 'variable') : 'variable',
    })
    setRenameScope('all')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey])

  const parentIsSelected = !!form.parent && form.parent.trim().length > 0

  const renamed =
    (form.category || '').trim() !== (originalCategoryRef.current || '').trim()

  const handleSave = () => {
    const newName = (form.category || '').trim();
    const originalName = (originalCategoryRef.current || '').trim();

    // Determine intended type for uniqueness check
    const intendedType = !isOutflows ? 'inflow' : (form.type === 'fixed' ? 'fixed' : 'variable');

    // Pull existing names by type if the parent provided them (recommended).
    const byType = item?.existingNamesByType || {};
    const existing = {
      inflow: toSet(byType.inflow),
      fixed: toSet(byType.fixed),
      variable: toSet(byType.variable),
    };

    // Block duplicates (case-insensitive + trimmed) within the intended type,
    // but allow keeping the same name while editing the same row.
    if (newName && norm(newName) !== norm(originalName) && existing[intendedType]?.has(norm(newName))) {
      window?.alert?.(`A ${intendedType} category named “${newName}” already exists. Choose a different name or merge.`);
      return;
    }

    const payload = {
      category: newName || 'Untitled',
      amount: parentIsSelected ? 0 : Number(form.amount || 0),
      parent: parentIsSelected ? form.parent : null,
      ...(isOutflows ? { type: form.type === 'fixed' ? 'fixed' : 'variable' } : {}),
    };
    const scope = renamed ? renameScope : 'none'; // only ask to rename when name actually changed
    onSave?.(payload, scope);
    onClose?.();
  }


  const handleDelete = () => {
    onDelete?.()
    onClose?.()
  }

  const handleClaim = () => {
    const fallback = Number(item?.amount ?? 0);
    const amt = (form.amount !== '' && form.amount !== null && form.amount !== undefined)
      ? Number(form.amount)
      : fallback;

    const payload = {
      category: (form.category || '').trim() || 'Untitled',
      amount: Math.max(0, amt),
      parent: null,
      ...(isOutflows ? { type: form.type === 'fixed' ? 'fixed' : 'variable' } : {}),
    };
    onClaim?.(payload);
    onClose?.();
  };



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
          If this subcategory’s type differs from its parent’s, it will be moved
          under a same-named parent within that type (created if missing).
        </p>
      ) : null}
    </div>
  )

  const TypeSelector = isOutflows ? (
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
        Applies to both parents and subcategories.
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
        disabled={!!form.parent}
      />
      {form.parent ? (
        <p className="text-[11px] text-gray-500">
          Amount is disabled for subcategories; totals roll up to the parent.
        </p>
      ) : null}
    </div>
  )

  const RenameScope = !renamed ? null : (
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

          {/* Type selector (parents and subs) */}
          {TypeSelector}

          {/* Amount (disabled when parent is set) */}
          {AmountField}

          {/* Rename scope (only shows if you actually changed the name) */}
          {RenameScope}

          {/* Actions */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isNew ? (
                <Button variant="ghost" data-noswipe onPointerUp={(e)=>{e.preventDefault();e.stopPropagation();handleDelete();}}>
                  Delete
                </Button>
              ) : null}
              <Button variant="ghost" data-noswipe onPointerUp={(e)=>{e.preventDefault();e.stopPropagation();handleClaim();}} title="Create a transaction from this line">
                Claim
              </Button>

            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" data-noswipe onPointerUp={(e)=>{e.preventDefault();e.stopPropagation();onClose();}}>Cancel</Button>
              <Button data-noswipe onPointerUp={(e)=>{e.preventDefault();e.stopPropagation();handleSave();}}>{isNew ? 'Add' : 'Save'}</Button>

            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
