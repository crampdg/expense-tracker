import React, { useEffect, useRef, useState } from "react";
import Modal from "../ui/Modal.jsx";

// ---- Utilities ---------------------------------------------------------------
const clamp01 = (x) => Math.min(0.99, Math.max(0, Number(x) || 0));
const num0 = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0);

function lsGetJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function lsSetJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// Build a portable backup of the most important app data.
function buildBackup() {
  const transactions = lsGetJSON("transactions") ?? [];
  const budgets = lsGetJSON("budgets") ?? lsGetJSON("budget") ?? { inflows: [], outflows: [] };
  const periodConfig = lsGetJSON("periodConfig") ?? null;

  return {
    version: "blehxpenses.v1",
    exportedAt: new Date().toISOString(),
    data: { transactions, budgets, periodConfig },
  };
}

// Merge transactions by a composite key (id if present; otherwise date|type|category|amount).
function mergeTransactions(existing, incoming) {
  const map = new Map();
  const put = (t) => {
    const id =
      t.id ??
      [t.date || "", t.type || "", (t.category || "").trim().toLowerCase(), Number(t.amount) || 0]
        .join("|");
    map.set(id, { ...t });
  };
  (existing || []).forEach(put);
  (incoming || []).forEach(put);
  return Array.from(map.values());
}

async function shareJsonMobile(name, obj) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  // Web Share with files (best mobile UX)
  const canShareFiles =
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [new File([""], "x.txt")] });

  if (canShareFiles) {
    try {
      const file = new File([blob], `${name}.json`, { type: "application/json" });
      await navigator.share({ files: [file], title: name, text: "Blehxpenses backup" });
      return;
    } catch {
      // fall through to download
    }
  }

  // Fallback: trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied backup JSON to clipboard.");
  } catch {
    // If Clipboard fails, show textarea for manual copy
    alert("Copy failed. Long-press in the text box to copy manually.");
  }
}

// ---- Component ----------------------------------------------------------------
export default function SavingsSettingsModal({ open, onClose, value, onSave, onAfterImport }) {
  const [form, setForm] = useState(value);
  const [showPaste, setShowPaste] = useState(false);
  const pasteRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setForm(value);
  }, [value, open]);

  const setPct = (k, v) => setForm((f) => ({ ...f, [k]: clamp01(v) }));
  const setNum = (k, v) => setForm((f) => ({ ...f, [k]: num0(v) }));

  const save = () => {
    onSave(form);
    onClose();
  };

  // --- Export -----------------------------------------------------------------
  const handleExportShare = async () => {
    const backup = buildBackup();
    await shareJsonMobile(`blehxpenses-backup-${new Date().toISOString().slice(0,10)}`, backup);
  };
  const handleExportCopy = async () => {
    const backup = buildBackup();
    await copyToClipboard(JSON.stringify(backup));
  };
  const handleExportDownload = () => {
    const backup = buildBackup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blehxpenses-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // --- Import -----------------------------------------------------------------
  const applyBackup = (backup) => {
    if (!backup || !backup.data) throw new Error("Invalid backup format.");
    const existingTx = lsGetJSON("transactions") ?? [];
    const incomingTx = backup.data.transactions ?? [];
    const mergedTx = mergeTransactions(existingTx, incomingTx);

    lsSetJSON("transactions", mergedTx);

    if (backup.data.budgets) {
      lsSetJSON("budgets", backup.data.budgets);
    }
    if (backup.data.periodConfig) {
      lsSetJSON("periodConfig", backup.data.periodConfig);
    }
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      applyBackup(json);
      alert("Import complete. Reloading to apply…");
      setTimeout(() => (onAfterImport ? onAfterImport() : window.location.reload()), 300);
    } catch (e) {
      alert("Import failed: " + (e?.message || "Unknown error"));
    }
  };

  const handleImportPaste = async () => {
    try {
      const text = pasteRef.current?.value || "";
      const json = JSON.parse(text);
      applyBackup(json);
      alert("Import complete. Reloading to apply…");
      setTimeout(() => (onAfterImport ? onAfterImport() : window.location.reload()), 300);
    } catch (e) {
      alert("Import failed: " + (e?.message || "Invalid JSON"));
    }
  };

  return (
    <Modal
        open={open}
        onClose={onClose}
        bodyClass="
            max-h-[min(80vh,calc(100dvh-140px))]
            overflow-y-auto
            pr-1
            pb-[calc(env(safe-area-inset-bottom)+88px)]
            overscroll-contain
        "
        >

      <div className="p-4 md:p-5">
        <h3 className="text-lg font-semibold">Savings & Daily Settings</h3>
        <p className="mt-1 text-sm text-gray-600">
          Tune how your Suggested Daily is calculated. Values save to your device.
        </p>

        {/* SETTINGS */}
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Savings rate</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" min="0" max="0.99"
                     value={form.savingsRate}
                     onChange={(e) => setPct("savingsRate", e.target.value)}
                     className="input !py-1 !text-sm w-24 text-right"/>
              <span className="text-sm text-gray-500">e.g., 0.15</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Fixed monthly savings</label>
            <input type="number" step="1" min="0"
                   value={form.fixedMonthlySavings}
                   onChange={(e) => setNum("fixedMonthlySavings", e.target.value)}
                   className="input !py-1 !text-sm w-32 text-right"/>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Count of remaining inflows</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.05" min="0" max="0.99"
                     value={form.includeOneOffInflowsPct}
                     onChange={(e) => setPct("includeOneOffInflowsPct", e.target.value)}
                     className="input !py-1 !text-sm w-24 text-right"/>
              <span className="text-sm text-gray-500">fraction (e.g., 0.50)</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Sinking funds (monthly total)</label>
            <input type="number" step="1" min="0"
                   value={form.sinkingAccrualMonthly}
                   onChange={(e) => setNum("sinkingAccrualMonthly", e.target.value)}
                   className="input !py-1 !text-sm w-32 text-right"/>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Safety buffer</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" min="0" max="0.99"
                     value={form.suggestedDailyBufferPct}
                     onChange={(e) => setPct("suggestedDailyBufferPct", e.target.value)}
                     className="input !py-1 !text-sm w-24 text-right"/>
              <span className="text-sm text-gray-500">fraction (e.g., 0.10)</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" className="px-3 py-1.5 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50"
                    onClick={onClose}>Close</button>
            <button type="button" className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={save}>Save</button>
          </div>
        </div>

        {/* BACKUP & TRANSFER */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-800">Backup & Transfer (mobile-friendly)</h4>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button"
                    className="px-3 py-2 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={handleExportShare}>Export / Share…</button>
            <button type="button"
                    className="px-3 py-2 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50"
                    onClick={handleExportDownload}>Download JSON</button>
            <button type="button"
                    className="px-3 py-2 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50"
                    onClick={handleExportCopy}>Copy JSON</button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                   onChange={(e) => handleImportFile(e.target.files?.[0])}/>
            <button type="button"
                    className="px-3 py-2 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => fileRef.current?.click()}>Import from File</button>
            <button type="button"
                    className="px-3 py-2 rounded-md text-sm border border-gray-300 bg-white hover:bg-gray-50"
                    onClick={() => setShowPaste((v) => !v)}>{showPaste ? "Hide Paste" : "Paste JSON"}</button>
          </div>

          {showPaste && (
            <div className="mt-2">
              <textarea ref={pasteRef}
                        placeholder='Paste backup JSON here'
                        className="w-full h-28 p-2 border border-gray-300 rounded-md text-sm"
              />
              <div className="mt-2 flex items-center justify-end">
                <button type="button"
                        className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={handleImportPaste}>Import</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
