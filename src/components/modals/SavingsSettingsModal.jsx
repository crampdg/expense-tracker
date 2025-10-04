import React, { useEffect, useRef, useState } from "react";
import Modal from "../ui/Modal.jsx";

/* ---------- tiny utils ---------- */
const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
const num0 = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0);

/* ---------- backup helpers (unchanged from your prior modal) ---------- */
function lsGetJSON(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function lsSetJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

function buildBackup() {
  const transactions = lsGetJSON("transactions") ?? [];
  const budgets = lsGetJSON("budgets") ?? lsGetJSON("budget") ?? { inflows: [], outflows: [] };
  const periodConfig = lsGetJSON("periodConfig") ?? null;
  return { version: "blehxpenses.v3", exportedAt: new Date().toISOString(), data: { transactions, budgets, periodConfig } };
}

function mergeTransactions(existing, incoming) {
  const map = new Map();
  const put = (t) => {
    const id = t.id ?? [t.date||"", t.type||"", (t.category||"").trim().toLowerCase(), Number(t.amount)||0].join("|");
    map.set(id, { ...t });
  };
  (existing||[]).forEach(put); (incoming||[]).forEach(put);
  return Array.from(map.values());
}

async function shareJsonMobile(name, obj) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const canShareFiles =
    typeof navigator !== "undefined" &&
    navigator.share && navigator.canShare &&
    navigator.canShare({ files: [new File([""], "x.txt")] });
  if (canShareFiles) {
    try {
      const file = new File([blob], `${name}.json`, { type: "application/json" });
      await navigator.share({ files: [file], title: name, text: "Blehxpenses backup" });
      return;
    } catch {}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${name}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); alert("Copied backup JSON to clipboard."); }
  catch { alert("Copy failed. Long-press in the text box to copy manually."); }
}

export default function SavingsSettingsModal({ open, onClose, value, onSave, onAfterImport }) {
  // New settings model (auto-save on inflow)
  // value = { autoSavePercent, autoSaveFixed, savingsLabel }
  const [form, setForm] = useState(value || {});
  const [showPaste, setShowPaste] = useState(false);
  const pasteRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { setForm(value || {}); }, [value, open]);

  const setNum = (k, v) => setForm((f) => ({ ...f, [k]: num0(v) }));
  const setPct = (k, v) => setForm((f) => ({ ...f, [k]: clamp01(v) }));
  const setStr = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => { onSave(form); onClose?.(); };

  // --- Export
  const handleExportShare = async () => { await shareJsonMobile(`blehxpenses-backup-${new Date().toISOString().slice(0,10)}`, buildBackup()); };
  const handleExportCopy = async () => { await copyToClipboard(JSON.stringify(buildBackup())); };
  const handleExportDownload = () => {
    const backup = buildBackup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `blehxpenses-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  // --- Import
  const applyBackup = (backup) => {
    if (!backup || !backup.data) throw new Error("Invalid backup format.");
    const existingTx = lsGetJSON("transactions") ?? [];
    const incomingTx = backup.data.transactions ?? [];
    const mergedTx = mergeTransactions(existingTx, incomingTx);
    lsSetJSON("transactions", mergedTx);
    if (backup.data.budgets) lsSetJSON("budgets", backup.data.budgets);
    if (backup.data.periodConfig) lsSetJSON("periodConfig", backup.data.periodConfig);
  };
  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      applyBackup(JSON.parse(text));
      alert("Import complete. Reloading to apply…");
      setTimeout(() => (onAfterImport ? onAfterImport() : window.location.reload()), 300);
    } catch (e) { alert("Import failed: " + (e?.message || "Unknown error")); }
  };
  const handleImportPaste = async () => {
    try {
      applyBackup(JSON.parse(pasteRef.current?.value || ""));
      alert("Import complete. Reloading to apply…");
      setTimeout(() => (onAfterImport ? onAfterImport() : window.location.reload()), 300);
    } catch (e) { alert("Import failed: " + (e?.message || "Invalid JSON")); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      bodyClass="max-h-[min(80vh,calc(100dvh-140px))] overflow-y-auto pr-1 pb-[calc(env(safe-area-inset-bottom)+88px)] overscroll-contain"
    >
      <div className="p-4 md:p-5 tap-safe">
        <h3 className="text-lg font-semibold">Investments Settings</h3>

          <p className="mt-1 text-sm text-gray-600">
            When you add an inflow, the app will automatically add a matching outflow to your Savings category.
          </p>


        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Investment annual interest (APR, decimal)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={form.investAPR ?? 0.04}
              onChange={(e) => setForm(f => ({ ...f, investAPR: Math.max(0, Number(e.target.value) || 0) }))}
              className="input !py-1 !text-sm w-28 text-right"
            />
          </div>


          <div className="mt-2 flex items-center justify-end gap-2">
            <button className="px-3 py-1.5 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50" onClick={onClose}>Close</button>
            <button className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500" onClick={save}>Save</button>
          </div>
        </div>

        {/* Backup & Transfer (unchanged) */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-800">Backup & Transfer</h4>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button className="px-3 py-2 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500" onClick={handleExportShare}>Export / Share…</button>
            <button className="px-3 py-2 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50" onClick={handleExportDownload}>Download JSON</button>
            <button className="px-3 py-2 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50" onClick={handleExportCopy}>Copy JSON</button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => handleImportFile(e.target.files?.[0])}/>
            <button className="px-3 py-2 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => fileRef.current?.click()}>Import from File</button>
            <button className="px-3 py-2 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50" onClick={() => setShowPaste((v) => !v)}>{showPaste ? "Hide Paste" : "Paste JSON"}</button>
          </div>

          {showPaste && (
            <div className="mt-2">
              <textarea ref={pasteRef} placeholder="Paste backup JSON here" className="w-full h-28 p-2 border border-gray-300 rounded-md text-base"/>
              <div className="mt-2 flex items-center justify-end">
                <button className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500" onClick={handleImportPaste}>Import</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
