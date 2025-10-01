import React, { useEffect, useState } from "react";
import Modal from "../ui/Modal.jsx"; // adjust path if your Modal lives elsewhere

export default function SavingsSettingsModal({ open, onClose, value, onSave }) {
  const [form, setForm] = useState(value);

  useEffect(() => {
    setForm(value);
  }, [value, open]);

  const setPct = (k, v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setForm((f) => ({ ...f, [k]: Math.min(0.99, Math.max(0, n)) }));
  };
  const setNum = (k, v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setForm((f) => ({ ...f, [k]: Math.max(0, n) }));
  };

  const save = () => {
    onSave(form);
    onClose();
  };

  const resetDefaults = () => {
    setForm({
      savingsRate: 0.10,
      fixedMonthlySavings: 0,
      includeOneOffInflowsPct: 0.5,
      sinkingAccrualMonthly: 0,
      suggestedDailyBufferPct: 0.10,
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-4 md:p-5">
        <h3 className="text-lg font-semibold">Savings & Daily Settings</h3>
        <p className="mt-1 text-sm text-gray-600">
          Tune how your Suggested Daily is calculated. Values save to your device.
        </p>

        <div className="mt-4 space-y-4">
          {/* Savings rate */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Savings rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.99"
                value={form.savingsRate}
                onChange={(e) => setPct("savingsRate", e.target.value)}
                className="input !py-1 !text-sm w-24 text-right"
              />
              <span className="text-sm text-gray-500">0–0.99 (e.g., 0.15)</span>
            </div>
          </div>

          {/* Fixed monthly savings */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Fixed monthly savings</label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.fixedMonthlySavings}
              onChange={(e) => setNum("fixedMonthlySavings", e.target.value)}
              className="input !py-1 !text-sm w-32 text-right"
            />
          </div>

          {/* Count % of one-off/remaining inflows */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Count of remaining inflows</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.05"
                min="0"
                max="0.99"
                value={form.includeOneOffInflowsPct}
                onChange={(e) => setPct("includeOneOffInflowsPct", e.target.value)}
                className="input !py-1 !text-sm w-24 text-right"
              />
              <span className="text-sm text-gray-500">fraction (e.g., 0.50)</span>
            </div>
          </div>

          {/* Sinking accrual total (monthly) */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Sinking funds (monthly total)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.sinkingAccrualMonthly}
              onChange={(e) => setNum("sinkingAccrualMonthly", e.target.value)}
              className="input !py-1 !text-sm w-32 text-right"
            />
          </div>

          {/* Safety buffer */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Safety buffer</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.99"
                value={form.suggestedDailyBufferPct}
                onChange={(e) => setPct("suggestedDailyBufferPct", e.target.value)}
                className="input !py-1 !text-sm w-24 text-right"
              />
              <span className="text-sm text-gray-500">fraction (e.g., 0.10)</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={resetDefaults}
          >
            Reset defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={save}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
