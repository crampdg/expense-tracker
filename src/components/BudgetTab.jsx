import { useMemo, useState, useEffect } from "react";
import { calcPeriodEnd, getAnchoredPeriodStart } from "../utils/periodUtils";
import Card from "./ui/Card.jsx";
import Button from "./ui/Button.jsx";
import BudgetEditModal from "./modals/BudgetEditModal.jsx";
import { money } from "../utils/format.js";
import ExportPDFButton from "./ui/ExportPDFButton.jsx";
import SharePDFButton from "./ui/SharePDFButton.jsx";
import Modal from "./ui/Modal.jsx";

/**
 * Props:
 * - period, setPeriod
 * - budgets, setBudgets         // { inflows: [{category, amount, auto?}], outflows: [...] }
 * - transactions                // [{ date:'YYYY-MM-DD', type:'inflow'|'expense'|..., category, amount }]
 * - periodOffset, setPeriodOffset
 * - onClaim(section, index, {category, amount})
 * - onBulkRenameTransactions({ section:'inflows'|'outflows', oldName, newName, scope:'all'|'period'|'none', startISO, endISO })
 */
export default function BudgetTab({
  period,
  setPeriod,
  budgets,
  setBudgets,
  onClaim,
  transactions,
  periodOffset,
  setPeriodOffset,
  onBulkRenameTransactions,
}) {
  // ---------------- Utils ----------------
  const norm = (s) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const isBlank = (s) => !s || !s.trim();

  // ---- Safety ---------------------------------------------------------------
  const normBudgets = budgets ?? { inflows: [], outflows: [] };
  const txs = Array.isArray(transactions) ? transactions : [];

  const [editing, setEditing] = useState(null); // {section, index, isNew}
  const [history, setHistory] = useState([]);   // for Undo (budgets)
  const [activeSection, setActiveSection] = useState("outflows"); // 'inflows' | 'outflows' | 'all'
  const [showAllIn, setShowAllIn] = useState(false);
  const [showAllOut, setShowAllOut] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const pushHistory = () =>
    setHistory((h) => [...h, JSON.parse(JSON.stringify(budgets))]);

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setBudgets(prev);
      return h.slice(0, -1);
    });
  };

  const addRow = (section) =>
    setEditing({ section, index: normBudgets[section].length, isNew: true });

  // ---- Period range (start / end) ------------------------------------------
  const offsetStart = useMemo(() => {
    return getAnchoredPeriodStart(
      period.type,
      period.anchorDate,
      new Date(),
      periodOffset
    );
  }, [period.type, period.anchorDate, periodOffset]);

  const offsetEnd = useMemo(() => {
    return calcPeriodEnd(period.type, offsetStart);
  }, [period.type, offsetStart]);

  const startISO = offsetStart.toISOString().slice(0, 10);
  const endISO = offsetEnd.toISOString().slice(0, 10);

  // ---- Actuals inside the active period (case/space-insensitive) -----------
  const inflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "inflow") continue;
      if (isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO) {
        const k = norm(t.category);
        m[k] = (m[k] || 0) + Number(t.amount || 0);
      }
    }
    return m;
  }, [txs, startISO, endISO]);

  const outflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "expense") continue;
      if (isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO) {
        const k = norm(t.category);
        m[k] = (m[k] || 0) + Number(t.amount || 0);
      }
    }
    return m;
  }, [txs, startISO, endISO]);

  // ---- Totals / Net (budgeted) ---------------------------------------------
  const inflowsTotalBudget = useMemo(
    () => (normBudgets.inflows ?? []).reduce((s, i) => s + Number(i.amount || 0), 0),
    [normBudgets]
  );
  const outflowsTotalBudget = useMemo(
    () => (normBudgets.outflows ?? []).reduce((s, o) => s + Number(o.amount || 0), 0),
    [normBudgets]
  );
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget;

  // ---- Auto-rows from transactions in active period ------------------------
  useEffect(() => {
    const have = { inflows: new Map(), outflows: new Map() };
    (normBudgets.inflows ?? []).forEach((r, i) => have.inflows.set(norm(r.category), i));
    (normBudgets.outflows ?? []).forEach((r, i) => have.outflows.set(norm(r.category), i));

    const toAdd = { inflows: [], outflows: [] };
    for (const t of txs) {
      if (isBlank(t.category)) continue;
      if (!(t.date >= startISO && t.date <= endISO)) continue;
      const section = t.type === "inflow" ? "inflows" : t.type === "expense" ? "outflows" : null;
      if (!section) continue;
      const k = norm(t.category);
      if (!have[section].has(k)) {
        toAdd[section].push({ category: (t.category || "").trim(), amount: 0, auto: true });
        have[section].set(k, -1);
      }
    }
    if (toAdd.inflows.length || toAdd.outflows.length) {
      setBudgets((prev) => ({
        inflows: [...(prev?.inflows ?? []), ...toAdd.inflows],
        outflows: [...(prev?.outflows ?? []), ...toAdd.outflows],
      }));
    }
  }, [startISO, endISO, txs, normBudgets.inflows, normBudgets.outflows, setBudgets]); // eslint-disable-line

  // ---- Save / Delete / Claim ------------------------------------------------
  const saveRow = ({ section, index, isNew }, form, scope = "none") => {
    const newName = (form.category || "").trim() || "Untitled";
    const newNorm = norm(newName);

    const originalItem = !isNew ? normBudgets[section][index] : null;
    const oldName = originalItem?.category ?? "";
    const oldNorm = norm(oldName);
    const renamed = !isNew && newNorm !== oldNorm;

    pushHistory();
    setBudgets((prev) => {
      const arr = [...(prev?.[section] ?? [])];

      if (isNew) {
        const existingIdx = arr.findIndex((r) => norm(r.category) === newNorm);
        if (existingIdx !== -1) {
          const mergedAmount = Number(arr[existingIdx].amount || 0) + Number(form.amount || 0);
          arr[existingIdx] = { category: newName, amount: mergedAmount };
        } else {
          arr.push({ category: newName, amount: Number(form.amount) || 0 });
        }
      } else {
        const existingIdx = arr.findIndex((r, i) => i !== index && norm(r.category) === newNorm);
        if (existingIdx !== -1) {
          const mergedAmount = Number(arr[existingIdx].amount || 0) + Number(form.amount || 0);
          arr[existingIdx] = { category: newName, amount: mergedAmount };
          arr.splice(index, 1);
        } else {
          arr[index] = { category: newName, amount: Number(form.amount) || 0 };
        }
      }

      return { ...prev, [section]: arr };
    });

    if (renamed && scope !== "none") {
      onBulkRenameTransactions?.({
        section,
        oldName,
        newName,
        scope, // 'all' or 'period'
        startISO,
        endISO,
      });
    }
    setEditing(null);
  };

  const deleteRow = ({ section, index, isNew }) => {
    if (isNew) { setEditing(null); return; }
    pushHistory();
    setBudgets((prev) => {
      const next = { ...prev };
      const arr = [...(prev?.[section] ?? [])];
      arr.splice(index, 1);
      next[section] = arr;
      return next;
    });
    setEditing(null);
  };

  const claimRow = ({ section, index, isNew }, form) => {
    saveRow({ section, index, isNew }, form, "none");
    const k = norm((form.category || "").trim() || "Untitled");
    const arr = (budgets?.[section] ?? []);
    const found = arr.findIndex((r) => norm(r.category) === k);
    const targetIndex = found >= 0 ? found : index;
    onClaim(section, targetIndex, {
      category: (form.category || "").trim() || "Untitled",
      amount: Number(form.amount) || 0,
    });
  };

  const diffClass = (n) => (n >= 0 ? "text-emerald-700" : "text-red-600");

  // ------------- Helpers for compact tables ---------------------------------
  const sliceOrAll = (arr, showAll) => showAll ? arr : arr.slice(0, 4);

  const InflowsTable = ({ rows }) => (
    <div className="overflow-auto">
      <table className="w-full border-t border-gray-200 text-sm">
        <thead className="bg-gray-50/50 sticky top-0 z-10">
          <tr className="text-left text-gray-600">
            <th className="px-4 py-2 w-2/5">Title</th>
            <th className="px-4 py-2 text-right">Budget</th>
            <th className="px-4 py-2 text-right">Actual</th>
            <th className="px-4 py-2 text-right">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, idx) => {
            const k = norm(item.category);
            const actual = Number(inflowActuals[k] || 0);
            const budget = Number(item.amount || 0);
            const diff = actual - budget; // inflow good if >= 0
            return (
              <tr
                key={`${item.category}-${idx}`}
                className="hover:bg-gray-50 cursor-pointer border-t border-gray-100"
                onClick={() => setEditing({ section: "inflows", index: idx, isNew: false })}
              >
                <td className="px-4 py-2">
                  {item.category}
                  {item.auto ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">auto</span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{money(budget)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(actual)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${diffClass(diff)}`}>{money(diff)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-4 text-center text-gray-500" colSpan={4}>No inflows yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const OutflowsTable = ({ rows }) => (
    <div className="overflow-auto">
      <table className="w-full border-t border-gray-200 text-sm">
        <thead className="bg-gray-50/50 sticky top-0 z-10">
          <tr className="text-left text-gray-600">
            <th className="px-4 py-2 w-2/5">Title</th>
            <th className="px-4 py-2 text-right">Budget</th>
            <th className="px-4 py-2 text-right">Actual</th>
            <th className="px-4 py-2 text-right">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, idx) => {
            const k = norm(item.category);
            const actual = Number(outflowActuals[k] || 0);
            const budget = Number(item.amount || 0);
            const diff = budget - actual; // outflow remaining (good if >= 0)
            return (
              <tr
                key={`${item.category}-${idx}`}
                className="hover:bg-gray-50 cursor-pointer border-t border-gray-100"
                onClick={() => setEditing({ section: "outflows", index: idx, isNew: false })}
              >
                <td className="px-4 py-2">
                  {item.category}
                  {item.auto ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">auto</span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{money(budget)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(actual)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${diffClass(diff)}`}>{money(diff)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-4 text-center text-gray-500" colSpan={4}>No outflows yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // ================ RENDER ===================================================
  return (
    <>
      {/* Export/Share root */}
      <div id="budget-tab" className="space-y-3">
        {/* HEADER — super compact */}
        <Card className="p-3 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">Budget</h2>
              <div className="text-[11px] md:text-xs text-gray-600">
                {offsetStart.toDateString()} – {offsetEnd.toDateString()}
              </div>
            </div>

            {/* Overflow menu */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                className="!px-2 !py-1"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="More"
              >
                ⋯
              </Button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-md z-20">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:text-gray-400"
                    onClick={() => { undo(); setMenuOpen(false); }}
                    disabled={!history.length}
                  >
                    Undo
                  </button>
                  <div className="px-2 py-1.5 border-t border-gray-100">
                    <ExportPDFButton
                      targetId="budget-tab"
                      filename={`${startISO}_to_${endISO}_Budget.pdf`}
                      compact
                    />
                  </div>
                  <div className="px-2 py-1 border-t border-gray-100">
                    <SharePDFButton
                      targetId="budget-tab"
                      filename={`${startISO}_to_${endISO}_Budget.pdf`}
                      compact
                    />
                  </div>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t border-gray-100"
                    onClick={() => { setPeriodOffset(0); setMenuOpen(false); }}
                  >
                    Reset to current period
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t border-gray-100"
                    onClick={() => { setPeriodOpen(true); setMenuOpen(false); }}
                  >
                    Period settings…
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Period arrows + chip */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                className="!px-2 !py-1 text-sm"
                onClick={() => setPeriodOffset((o) => o - 1)}
                title="Previous"
              >
                ←
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="!px-2 !py-1 text-sm"
                onClick={() => setPeriodOffset((o) => o + 1)}
                title="Next"
              >
                →
              </Button>
              <button
                type="button"
                onClick={() => setPeriodOpen(true)}
                className="px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 text-xs md:text-sm hover:bg-gray-50"
                title="Open period settings"
              >
                {period.type} • {startISO} → {endISO}
              </button>
            </div>

            {/* Segmented toggle */}
            <div className="flex rounded-full border border-gray-300 overflow-hidden text-xs md:text-sm">
              {["inflows","outflows","all"].map((key, i) => {
                const map = { inflows: "Inflows", outflows: "Outflows", all: "All" };
                const active = activeSection === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveSection(key)}
                    className={`px-3 py-1 ${active ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"} ${i ? "border-l border-gray-300" : ""}`}
                    aria-pressed={active}
                  >
                    {map[key]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI pills */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
              <span className="text-gray-500 mr-1">Budgeted Inflows</span>
              <span className="font-medium">{money(inflowsTotalBudget)}</span>
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
              <span className="text-gray-500 mr-1">Budgeted Outflows</span>
              <span className="font-medium">{money(outflowsTotalBudget)}</span>
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
              <span className="text-gray-500 mr-1">Net</span>
              <span className={`font-semibold ${netBudgeted < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {money(netBudgeted)}
              </span>
            </span>
          </div>
        </Card>

        {/* TABLES — compact, with show first 4 rows */}
        <Card className="p-0 overflow-hidden">
          {/* ACTIVE: Inflows */}
          {(activeSection === "inflows" || activeSection === "all") && (
            <>
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="font-medium">Inflows</h3>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => addRow("inflows")}
                  className="!px-2 !py-1 text-sm"
                >
                  + Add
                </Button>
              </div>
              <InflowsTable rows={sliceOrAll(normBudgets.inflows ?? [], activeSection === "all" ? showAllIn : showAllIn)} />
              {(normBudgets.inflows ?? []).length > 4 && (
                <div className="px-4 py-2">
                  <button
                    type="button"
                    className="text-xs text-gray-700 underline underline-offset-4"
                    onClick={() => setShowAllIn((v) => !v)}
                  >
                    {showAllIn ? "Show less" : `Show all (${(normBudgets.inflows ?? []).length})`}
                  </button>
                </div>
              )}
              {activeSection === "all" && <div className="h-px bg-gray-200 my-1" />}
            </>
          )}

          {/* ACTIVE: Outflows */}
          {(activeSection === "outflows" || activeSection === "all") && (
            <>
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="font-medium">Outflows</h3>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => addRow("outflows")}
                  className="!px-2 !py-1 text-sm"
                >
                  + Add
                </Button>
              </div>
              <OutflowsTable rows={sliceOrAll(normBudgets.outflows ?? [], activeSection === "all" ? showAllOut : showAllOut)} />
              {(normBudgets.outflows ?? []).length > 4 && (
                <div className="px-4 py-2">
                  <button
                    type="button"
                    className="text-xs text-gray-700 underline underline-offset-4"
                    onClick={() => setShowAllOut((v) => !v)}
                  >
                    {showAllOut ? "Show less" : `Show all (${(normBudgets.outflows ?? []).length})`}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Subtle footer total (right aligned) */}
          <div className="flex justify-end px-4 py-3 text-sm border-t border-gray-100">
            <span className="text-gray-600 mr-2">Net Budgeted:</span>
            <span className={`font-semibold ${netBudgeted < 0 ? "text-red-600" : "text-emerald-700"}`}>
              {money(netBudgeted)}
            </span>
          </div>
        </Card>
      </div>

      {/* Modal for add/edit */}
      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={
          editing
            ? editing.isNew
              ? { category: "", amount: "", section: editing.section }
              : { ...normBudgets[editing.section][editing.index], section: editing.section }
            : null
        }
        isNew={!!editing?.isNew}
        onSave={(form, scope) => saveRow(editing, form, scope)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />

      {/* Period Settings Modal (compact) */}
      <Modal open={periodOpen} onClose={() => setPeriodOpen(false)} title="Period settings">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Type</label>
            <select
              value={period.type}
              onChange={(e) => setPeriod((p) => ({ ...p, type: e.target.value }))}
              className="select"
            >
              <option>Monthly</option>
              <option>Biweekly</option>
              <option>Weekly</option>
              <option>SemiMonthly</option>
              <option>Annually</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Anchor date</label>
            <input
              type="date"
              value={period.anchorDate}
              onChange={(e) => setPeriod((p) => ({ ...p, anchorDate: e.target.value }))}
              className="input"
            />
          </div>
          <div className="pt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPeriodOpen(false)}>Close</Button>
            <Button onClick={() => setPeriodOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
