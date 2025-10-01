import { calcPeriodEnd, getAnchoredPeriodStart } from "../utils/periodUtils";
import Card from "./ui/Card.jsx";
import Button from "./ui/Button.jsx";
import BudgetEditModal from "./modals/BudgetEditModal.jsx";
import { useMemo, useState } from "react";
import { money } from "../utils/format.js";
import ExportPDFButton from "./ui/ExportPDFButton.jsx";
import SharePDFButton from "./ui/SharePDFButton.jsx";

export default function BudgetTab({
  period,            // { type, anchorDate }
  setPeriod,
  budgets,           // { inflows: [], outflows: [] }
  setBudgets,
  onClaim,
  transactions,
  periodOffset,
  setPeriodOffset,
}) {
  // ---- Safety ---------------------------------------------------------------
  const normBudgets = budgets ?? { inflows: [], outflows: [] };
  const txs = Array.isArray(transactions) ? transactions : [];

  const [editing, setEditing] = useState(null); // {section, index, isNew}
  const [history, setHistory] = useState([]);   // stack for Undo

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
  const endISO   = offsetEnd.toISOString().slice(0, 10);

  // ---- Actuals inside the active period ------------------------------------
  const inflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "inflow") continue;
      if (t.date >= startISO && t.date <= endISO) {
        m[t.category] = (m[t.category] || 0) + Number(t.amount || 0);
      }
    }
    return m;
  }, [txs, startISO, endISO]);

  const outflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "expense") continue;
      if (t.date >= startISO && t.date <= endISO) {
        m[t.category] = (m[t.category] || 0) + Number(t.amount || 0);
      }
    }
    return m;
  }, [txs, startISO, endISO]);

  // ---- Totals / Net (budgeted) ---------------------------------------------
  const inflowsTotalBudget  = useMemo(
    () => normBudgets.inflows.reduce((s, i) => s + Number(i.amount || 0), 0),
    [normBudgets]
  );
  const outflowsTotalBudget = useMemo(
    () => normBudgets.outflows.reduce((s, o) => s + Number(o.amount || 0), 0),
    [normBudgets]
  );
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget;

  // ---- Save / Delete / Claim ------------------------------------------------
  const saveRow = ({ section, index, isNew }, form) => {
    pushHistory();
    setBudgets((prev) => {
      const next = { ...prev };
      const arr = [...(prev?.[section] ?? [])];
      const payload = {
        category: (form.category || "").trim() || "Untitled",
        amount: Number(form.amount) || 0,
      };
      if (isNew) arr.push(payload);
      else arr[index] = payload;
      next[section] = arr;
      return next;
    });
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
    // ensure row exists first
    saveRow({ section, index, isNew }, form);
    onClaim(section, isNew ? normBudgets[section].length : index, {
      category: (form.category || "").trim() || "Untitled",
      amount: Number(form.amount) || 0,
    });
  };

  const diffClass = (n) => (n >= 0 ? "text-emerald-700" : "text-red-600");

  // ================ RENDER ===================================================
  return (
    <>
      {/* Export/Share root */}
      <div id="budget-tab" className="space-y-3">
        {/* HEADER — condensed, single card */}
        <Card className="p-4">
          <div className="flex flex-col gap-3">
            {/* Title + date range + tiny actions */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Budget</h2>
                <div className="text-xs text-gray-600">
                  {offsetStart.toDateString()} – {offsetEnd.toDateString()}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-2 !py-1 text-sm"
                  onClick={undo}
                  disabled={!history.length}
                  title="Undo"
                >
                  ↩️
                </Button>
                <ExportPDFButton
                  targetId="budget-tab"
                  filename={`${startISO}_to_${endISO}_Budget.pdf`}
                  compact
                />
                <SharePDFButton
                  targetId="budget-tab"
                  filename={`${startISO}_to_${endISO}_Budget.pdf`}
                  compact
                />
              </div>
            </div>

            {/* Period controls — one quiet row */}
            <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-2 !py-1 text-sm"
                  onClick={() => setPeriodOffset(0)}
                  title="Reset to current"
                >
                  Reset
                </Button>
              </div>

              <div className="h-4 w-px bg-gray-200 mx-1" />

              <div className="flex items-center gap-2">
                <select
                  value={period.type}
                  onChange={(e) => setPeriod((p) => ({ ...p, type: e.target.value }))}
                  className="select !py-1 !text-sm"
                >
                  <option>Monthly</option>
                  <option>Biweekly</option>
                  <option>Weekly</option>
                  <option>SemiMonthly</option>
                  <option>Annually</option>
                </select>
                <input
                  type="date"
                  value={period.anchorDate}
                  onChange={(e) => setPeriod((p) => ({ ...p, anchorDate: e.target.value }))}
                  className="input !py-1 !text-sm"
                />
              </div>
            </div>

            {/* KPIs — inline chips instead of big cards */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
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
          </div>
        </Card>

        {/* TABLES — one quiet card with two sections */}
        <Card className="p-0 overflow-hidden">
          {/* Inflows header */}
          <div className="flex items-center justify-between px-4 py-3">
            <h3 className="font-medium">Inflows</h3>
            <Button type="button" variant="ghost" onClick={() => addRow("inflows")} className="!px-2 !py-1 text-sm">
              + Add
            </Button>
          </div>
          {/* Inflows table (minimal borders, no stripes) */}
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
                {normBudgets.inflows.map((item, idx) => {
                  const actual = Number(inflowActuals[item.category] || 0);
                  const budget = Number(item.amount || 0);
                  const diff = actual - budget; // inflow good if >= 0
                  return (
                    <tr
                      key={`${item.category}-${idx}`}
                      className="hover:bg-gray-50 cursor-pointer border-t border-gray-100"
                      onClick={() => setEditing({ section: "inflows", index: idx, isNew: false })}
                    >
                      <td className="px-4 py-2">{item.category}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(budget)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(actual)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${diffClass(diff)}`}>{money(diff)}</td>
                    </tr>
                  );
                })}
                {normBudgets.inflows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-500" colSpan={4}>No inflows yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-200 my-1" />

          {/* Outflows header */}
          <div className="flex items-center justify-between px-4 py-3">
            <h3 className="font-medium">Outflows</h3>
            <Button type="button" variant="ghost" onClick={() => addRow("outflows")} className="!px-2 !py-1 text-sm">
              + Add
            </Button>
          </div>
          {/* Outflows table */}
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
                {normBudgets.outflows.map((item, idx) => {
                  const actual = Number(outflowActuals[item.category] || 0);
                  const budget = Number(item.amount || 0);
                  const diff = budget - actual; // outflow remaining (good if >= 0)
                  return (
                    <tr
                      key={`${item.category}-${idx}`}
                      className="hover:bg-gray-50 cursor-pointer border-t border-gray-100"
                      onClick={() => setEditing({ section: "outflows", index: idx, isNew: false })}
                    >
                      <td className="px-4 py-2">{item.category}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(budget)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(actual)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${diffClass(diff)}`}>{money(diff)}</td>
                    </tr>
                  );
                })}
                {normBudgets.outflows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-500" colSpan={4}>No outflows yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
              ? { category: "", amount: "" }
              : normBudgets[editing.section][editing.index]
            : null
        }
        isNew={!!editing?.isNew}
        onSave={(form) => saveRow(editing, form)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />
    </>
  );
}
