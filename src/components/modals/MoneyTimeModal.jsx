import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState, useEffect } from 'react'

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[’'`´]/g, "'")               // apostrophes
    .replace(/[-–—]/g, '-')                // dashes
    .replace(/[\s_]+/g, ' ')               // collapse spaces/underscores
    .trim();

const snapToKnownCategory = (name, list = []) => {
  const n = norm(name);
  if (!n) return '';
  const map = new Map();
  for (const c of list) {
    const k = norm(c);
    if (!map.has(k)) map.set(k, c); // keep first exact casing from list
  }
  return map.get(n) || name.trim();
};


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

  // Build a canonical map of ALL existing budget names (parents + children, fixed + variable)
  const nameMap = new Map(); // norm(name) -> { category, isChild, parentCategory, type }
  (budgets?.outflows || []).forEach((p) => {
    if (p?.category) {
      nameMap.set(norm(p.category), {
        category: String(p.category).trim(),
        isChild: false,
        parentCategory: null,
        type: p?.type || "variable",
      });
    }
    (p?.children || []).forEach((c) => {
      if (c?.category) {
        nameMap.set(norm(c.category), {
          category: String(c.category).trim(),
          isChild: true,
          parentCategory: String(p.category || "").trim() || null,
          // child type inherits its own type, else parent’s type, default variable
          type: c?.type || p?.type || "variable",
        });
      }
    });
  });

  const typed = (cleanForm.category || "").trim();
  const hit = nameMap.get(norm(typed));

  if (typed && hit) {
    // Snap to canonical casing and attach a precise route
    const snapped = hit.category;
    const finalForm = {
      ...cleanForm,
      category: snapped,
      meta: {
        ...(cleanForm.meta || {}),
        budgetRoute: {
          category: snapped,
          isChild: !!hit.isChild,
          parentCategory: hit.parentCategory,
          type: hit.type, // "fixed" | "variable"
        },
      },
    };
    onSave(finalForm);
    onClose();
    return;
  }




  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="font-semibold mb-3">MONEY TIME! 💸</h3>
      <div
        className="grid gap-3 tap-safe"
        onKeyDownCapture={(e) => {
          // Don’t let global key handlers swallow typing inside the modal
          e.stopPropagation();
        }}
      >

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
          inputMode="decimal"
          className="input"
          placeholder="Amount"
          value={form.amount}
          onChange={e => handleChange('amount', e.target.value)}
          autoFocus
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
