// src/components/modals/MoneyTimeModal.jsx
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
  });

  useEffect(() => {
    if (!open) {
      setForm({
        type: 'expense',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        category: '',
        description: '',
      });
    }
  }, [open]);

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSave = () => {
    const cleanForm = {
      ...form,
      amount: Number(form.amount) || 0,
    };

    // If the typed name matches any known category (case-insensitive, trimmed),
    // snap to the canonical name and attach a simple route hint so BudgetTab won’t auto-create.
    const typed = (cleanForm.category || '').trim();
    const exists = categories.some((c) => norm(c) === norm(typed));

    if (typed && exists) {
      const snapped = snapToKnownCategory(typed, categories);
      const finalForm = {
        ...cleanForm,
        category: snapped,
        meta: {
          ...(cleanForm.meta || {}),
          budgetRoute: { category: snapped },
        },
      };
      onSave(finalForm);
    } else {
      onSave(cleanForm);
    }

    onClose();
  };

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
  );
}
