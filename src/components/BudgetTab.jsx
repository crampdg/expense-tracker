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
 * BudgetTab (editor-only nesting)
 * - Subcategories are one level deep.
 * - The ONLY way to set/move/remove a parent is in BudgetEditModal.
 * - No drag, no "Parent > Child", no "+ Sub", no inline move.
 * - Collapse toggle (▾/▸) stays for readability.
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
  showUndoToast,
}) {
  // -------------------- Helpers --------------------
  const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const isBlank = (s) => !s || !s.trim();

  const normalizeTree = (arr) =>
    (Array.isArray(arr) ? arr : []).map((it) => ({
      category: it.category ?? "",
      amount: Number(it.amount ?? 0),
      auto: !!it.auto,
      children: Array.isArray(it.children)
        ? it.children.map((c) => ({
            category: c.category ?? "",
            amount: 0,
            auto: !!c.auto,
            children: [],
          }))
        : [],
    }));

  const getArray = (section) => normalizeTree(budgets?.[section]);
  const setArray = (section, newArr) =>
    setBudgets((prev) => ({ ...prev, [section]: newArr }));

  const getItemAtPath = (section, path) =>
    path.length === 1
      ? getArray(section)[path[0]]
      : getArray(section)[path[0]]?.children?.[path[1]] ?? null;

  const removeAtPath = (arr, path) => {
    const clone = JSON.parse(JSON.stringify(arr));
    let removed = null;
    if (path.length === 1) removed = clone.splice(path[0], 1)[0];
    else removed = clone[path[0]].children.splice(path[1], 1)[0];
    return { removed, next: clone };
  };

  const parentNames = (section, excludeName = "") =>
    Array.from(
      new Set(
        getArray(section)
          .map((r) => r.category)
          .filter((n) => n && norm(n) !== norm(excludeName))
      )
    );

  // Editing / history
  const [editing, setEditing] = useState(null); // {section, path, isNew}
  const [history, setHistory] = useState([]);
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

  // ---- Period range ---------------------------------------------------------
  const offsetStart = useMemo(
    () =>
      getAnchoredPeriodStart(
        period.type,
        period.anchorDate,
        new Date(),
        periodOffset
      ),
    [period.type, period.anchorDate, periodOffset]
  );
  const offsetEnd = useMemo(
    () => calcPeriodEnd(period.type, offsetStart),
    [period.type, offsetStart]
  );
  const startISO = offsetStart.toISOString().slice(0, 10);
  const endISO = offsetEnd.toISOString().slice(0, 10);

  // ---- Actuals in period ----------------------------------------------------
  const txs = Array.isArray(transactions) ? transactions : [];

  const inflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "inflow" || isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO)
        m[norm(t.category)] =
          (m[norm(t.category)] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txs, startISO, endISO]);

  const outflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "expense" || isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO)
        m[norm(t.category)] =
          (m[norm(t.category)] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txs, startISO, endISO]);

  const actualForItem = (section, item) => {
    const map = section === "inflows" ? inflowActuals : outflowActuals;
    if (item.children?.length) {
      return item.children.reduce(
        (s, c) => s + Number(map[norm(c.category)] || 0),
        0
      );
    }
    return Number(map[norm(item.category)] || 0);
  };

  // ---- Totals / Net ---------------------------------------------------------
  const inflowsTotalBudget = useMemo(
    () =>
      (getArray("inflows") ?? []).reduce(
        (s, i) => s + Number(i.amount || 0),
        0
      ),
    [budgets]
  );
  const outflowsTotalBudget = useMemo(
    () =>
      (getArray("outflows") ?? []).reduce(
        (s, o) => s + Number(o.amount || 0),
        0
      ),
    [budgets]
  );
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget;

  const inflowsTotalActual = useMemo(
    () =>
      (getArray("inflows") ?? []).reduce(
        (s, i) => s + actualForItem("inflows", i),
        0
      ),
    [budgets, inflowActuals]
  );
  const outflowsTotalActual = useMemo(
    () =>
      (getArray("outflows") ?? []).reduce(
        (s, o) => s + actualForItem("outflows", o),
        0
      ),
    [budgets, outflowActuals]
  );
  const netActual = inflowsTotalActual - outflowsTotalActual;

  // ---- Auto-rows from transactions in active period ------------------------
  useEffect(() => {
    const have = { inflows: new Set(), outflows: new Set() };
    (getArray("inflows") ?? []).forEach((r) => {
      have.inflows.add(norm(r.category));
      r.children?.forEach((c) => have.inflows.add(norm(c.category)));
    });
    (getArray("outflows") ?? []).forEach((r) => {
      have.outflows.add(norm(r.category));
      r.children?.forEach((c) => have.outflows.add(norm(c.category)));
    });

    const toAdd = { inflows: [], outflows: [] };
    for (const t of txs) {
      if (isBlank(t.category)) continue;
      if (!(t.date >= startISO && t.date <= endISO)) continue;
      const section =
        t.type === "inflow"
          ? "inflows"
          : t.type === "expense"
          ? "outflows"
          : null;
      if (!section) continue;
      const k = norm(t.category);
      if (!have[section].has(k)) {
        toAdd[section].push({
          category: (t.category || "").trim(),
          amount: 0,
          auto: true,
          children: [],
        });
        have[section].add(k);
      }
    }
    if (toAdd.inflows.length || toAdd.outflows.length) {
      setBudgets((prev) => ({
        inflows: [...normalizeTree(prev?.inflows), ...toAdd.inflows],
        outflows: [...normalizeTree(prev?.outflows), ...toAdd.outflows],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, endISO, txs]);

  // -------------------- Collapse UI --------------------
  const keyFor = (section, path) => `${section}:${path.join(".")}`;
  const [collapsed, setCollapsed] = useState(new Set());
  const isCollapsed = (section, path) => collapsed.has(keyFor(section, path));
  const toggleCollapse = (section, path) =>
    setCollapsed((s) => {
      const k = keyFor(section, path);
      const ns = new Set(s);
      ns.has(k) ? ns.delete(k) : ns.add(k);
      return ns;
    });

  // -------------------- Save/Delete/Claim (editor is the only entry point) ---
  const saveRow = ({ section, path, isNew }, form, scope = "none") => {
    const newName = (form.category || "").trim() || "Untitled";
    const newNorm = norm(newName);
    const targetParent = form.parent ? form.parent.trim() : null;

    const originalItem = !isNew ? getItemAtPath(section, path) : null;
    const oldName = originalItem?.category ?? "";
    const oldNorm = norm(oldName);
    const wasSub = !isNew && path.length === 2;

    const oldAmount = !isNew && !wasSub ? Number(originalItem?.amount ?? 0) : 0;
    const newAmount = targetParent ? 0 : Number(form.amount ?? 0);

    const renamed = !isNew && newNorm !== oldNorm;
    const amountChanged = !isNew && !wasSub && oldAmount !== newAmount;

    const snapshot = JSON.parse(JSON.stringify(budgets));
    pushHistory();

    let arr = getArray(section);

    // --- NEW row
    if (isNew) {
      if (!targetParent) {
        // top-level
        arr = [...arr, { category: newName, amount: newAmount, auto: false, children: [] }];
      } else {
        // sub of existing or new parent (create parent if needed)
        let pIdx = arr.findIndex((r) => norm(r.category) === norm(targetParent));
        if (pIdx === -1) {
          arr = [...arr, { category: targetParent, amount: 0, auto: false, children: [] }];
          pIdx = arr.length - 1;
        }
        const clone = JSON.parse(JSON.stringify(arr));
        if (!clone[pIdx].children) clone[pIdx].children = [];
        clone[pIdx].children.push({ category: newName, amount: 0, auto: false, children: [] });
        arr = clone;
      }
      setArray(section, arr);
      showUndoToast?.(
        `Added “${newName}” to ${targetParent ? `subcategories of “${targetParent}”` : (section === "inflows" ? "Inflows" : "Outflows")}`,
        () => setBudgets(snapshot)
      );
      setEditing(null);
      return;
    }

    // --- EDIT existing row
    if (wasSub) {
      const [pi, ci] = path;
      const base = JSON.parse(JSON.stringify(arr));
      const child = base[pi].children[ci];

      // If staying under same parent (or moving to 'none')
      if (!targetParent) {
        // Promote to top-level
        base[pi].children.splice(ci, 1);
        base.push({ category: newName, amount: newAmount, auto: !!child.auto, children: [] });
        setArray(section, base);
      } else {
        // Move to (possibly different) parent
        base[pi].children.splice(ci, 1);
        let pIdx = base.findIndex((r) => norm(r.category) === norm(targetParent));
        if (pIdx === -1) {
          base.push({ category: targetParent, amount: 0, auto: false, children: [] });
          pIdx = base.length - 1;
        }
        if (!base[pIdx].children) base[pIdx].children = [];
        base[pIdx].children.push({ category: newName, amount: 0, auto: !!child.auto, children: [] });
        setArray(section, base);
      }
    } else {
      // was top-level
      const idx = path[0];
      const base = JSON.parse(JSON.stringify(arr));
      const current = base[idx];

      if (!targetParent) {
        // remain top-level: update name/amount
        base[idx] = { ...current, category: newName, amount: newAmount };
        setArray(section, base);
      } else {
        // move under parent; lift existing children to top-level to maintain 1-level depth
        const removed = base.splice(idx, 1)[0];
        let withLift = base;
        if (removed.children?.length) {
          withLift = [
            ...withLift,
            ...removed.children.map((c) => ({ ...c, amount: 0, children: [] })),
          ];
        }
        let pIdx = withLift.findIndex((r) => norm(r.category) === norm(targetParent));
        if (pIdx === -1) {
          withLift = [...withLift, { category: targetParent, amount: 0, auto: false, children: [] }];
          pIdx = withLift.length - 1;
        }
        if (!withLift[pIdx].children) withLift[pIdx].children = [];
        withLift[pIdx].children.push({ category: newName, amount: 0, auto: !!removed.auto, children: [] });
        setArray(section, withLift);
      }
    }

    // rename transaction scope
    if (renamed && scope !== "none") {
      onBulkRenameTransactions?.({ section, oldName, newName, scope, startISO, endISO });
    }

    if (renamed) {
      showUndoToast?.(
        `Renamed “${oldName || "Untitled"}” → “${newName}”`,
        () => {
          setBudgets(snapshot);
          if (scope !== "none")
            onBulkRenameTransactions?.({ section, oldName: newName, newName: oldName, scope, startISO, endISO });
        }
      );
    } else if (amountChanged) {
      showUndoToast?.(
        `Updated “${newName}” • ${money(oldAmount)} → ${money(newAmount)}`,
        () => setBudgets(snapshot)
      );
    }

    setEditing(null);
  };

  const deleteRow = ({ section, path, isNew }) => {
    if (isNew) return setEditing(null);
    const snapshot = JSON.parse(JSON.stringify(budgets));
    const { removed, next } = removeAtPath(getArray(section), path);
    pushHistory();
    setArray(section, next);
    setEditing(null);
    showUndoToast?.(
      `Deleted “${removed?.category ?? "Budget line"}”`,
      () => setBudgets(snapshot)
    );
  };

  const claimRow = ({ section, path, isNew }, form) => {
    // only for top-level lines
    const isSub = path?.length === 2;
    saveRow({ section, path, isNew }, { category: form.category, amount: form.amount, parent: null }, "none");
    if (isSub) return;
    const k = norm((form.category || "").trim() || "Untitled");
    const arr = getArray(section);
    const found = arr.findIndex((r) => norm(r.category) === k);
    const targetIndex = found >= 0 ? found : path[0];
    onClaim(section, targetIndex, { category: (form.category || "").trim() || "Untitled", amount: Number(form.amount) || 0 });
  };

  // -------------------- Render --------------------
  const SectionTable = ({ section, rows }) => {
    const renderRow = (item, idx, depth, parentPath) => {
      const path = [...parentPath, idx];
      const thisKey = keyFor(section, path);
      const isSub = depth === 1;
      const actual = actualForItem(section, item);

      return (
        <>
          <tr
            key={thisKey}
            className={[
              "border-t border-gray-100 relative",
              depth === 0 && isCollapsed(section, path) ? "" : "hover:bg-gray-50",
            ].join(" ")}
            onClick={() => setEditing({ section, path, isNew: false })}
            data-depth={depth}
          >
            <td className="px-4 py-2" style={{ paddingLeft: depth ? 24 : 16 }}>
              <div className="flex items-center gap-2">
                {/* collapse/expand for parents */}
                {depth === 0 && item.children?.length ? (
                  <button
                    type="button"
                    className="text-gray-400"
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(section, path); }}
                    title={isCollapsed(section, path) ? "Expand" : "Collapse"}
                    aria-label={isCollapsed(section, path) ? "Expand subcategories" : "Collapse subcategories"}
                  >
                    {isCollapsed(section, path) ? "▸" : "▾"}
                  </button>
                ) : null}

                <span className="ml-1">
                  {item.category}
                  {item.auto ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">auto</span>
                  ) : null}
                </span>
              </div>
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{isSub ? "" : money(Number(item.amount || 0))}</td>
            <td className="px-4 py-2 text-right tabular-nums">{money(actual)}</td>
          </tr>

          {/* children */}
          {!isCollapsed(section, path) ? item.children?.map((c, j) => renderRow(c, j, 1, path)) : null}
        </>
      );
    };

    return (
      <div className="overflow-auto">
        <table className="w-full border-t border-gray-200 text-sm">
          <thead className="bg-gray-50/50 sticky top-0 z-10">
            <tr className="text-left text-gray-600">
              <th className="px-4 py-2 w-2/5">Title</th>
              <th className="px-4 py-2 text-right">Budget</th>
              <th className="px-4 py-2 text-right">Actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-center text-gray-500" colSpan={3}>
                  No items yet
                </td>
              </tr>
            ) : (
              rows.map((it, i) => renderRow(it, i, 0, []))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const openAdd = (section) => {
    setEditing({
      section,
      path: [getArray(section).length],
      isNew: true,
    });
  };

  // Compute modal props (parents list + current parent) based on editing ctx
  const modalParents = editing
    ? parentNames(editing.section, editing.path?.length === 1 ? getItemAtPath(editing.section, editing.path)?.category : "")
    : [];
  const modalCurrentParent =
    editing && editing.path?.length === 2
      ? getArray(editing.section)[editing.path[0]]?.category || null
      : null;

  return (
    <>
      <div id="budget-tab" className="space-y-3">
        {/* HEADER */}
        <Card className="p-3 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">Budget</h2>
              <div className="text-[11px] md:text-xs text-gray-600">
                {offsetStart.toDateString()} – {offsetEnd.toDateString()}
              </div>
            </div>

            <div className="relative">
              <Button type="button" variant="ghost" className="!px-2 !py-1" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} title="More">
                ⋯
              </Button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-md z-20">
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:text-gray-400" onClick={() => { undo(); setMenuOpen(false); }} disabled={!history.length}>
                    Undo
                  </button>
                  <div className="px-2 py-1.5 border-t border-gray-100">
                    <ExportPDFButton targetId="budget-tab" filename={`${startISO}_to_${endISO}_Budget.pdf`} compact />
                  </div>
                  <div className="px-2 py-1 border-t border-gray-100">
                    <SharePDFButton targetId="budget-tab" filename={`${startISO}_to_${endISO}_Budget.pdf`} compact />
                  </div>
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t border-gray-100" onClick={() => { setPeriodOffset(0); setMenuOpen(false); }}>
                    Reset to current period
                  </button>
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t border-gray-100" onClick={() => { setPeriodOpen(true); setMenuOpen(false); }}>
                    Period settings…
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Period arrows + chip */}
          <div className="mt-2 flex items-center gap-1">
            <Button type="button" variant="ghost" className="!px-2 !py-1 text-sm" onClick={() => setPeriodOffset((o) => o - 1)} title="Previous">←</Button>
            <Button type="button" variant="ghost" className="!px-2 !py-1 text-sm" onClick={() => setPeriodOffset((o) => o + 1)} title="Next">→</Button>
            <button type="button" onClick={() => setPeriodOpen(true)} className="px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 text-xs md:text-sm hover:bg-gray-50" title="Open period settings">
              {period.type} • {startISO} → {endISO}
            </button>
          </div>
        </Card>

        {/* TABLES */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h3 className="font-medium">Inflows</h3>
            <Button type="button" variant="ghost" onClick={() => openAdd("inflows")} className="!px-2 !py-1 text-sm">+ Add</Button>
          </div>
          <SectionTable section="inflows" rows={getArray("inflows")} />
          <div className="h-px bg-gray-200 my-1" />

          <div className="flex items-center justify-between px-4 py-3">
            <h3 className="font-medium">Outflows</h3>
            <Button type="button" variant="ghost" onClick={() => openAdd("outflows")} className="!px-2 !py-1 text-sm">+ Add</Button>
          </div>
          <SectionTable section="outflows" rows={getArray("outflows")} />

          {/* NET */}
          <div className="px-4 py-3 text-sm border-t border-gray-100">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-1 w-2/5"> </th>
                  <th className="py-1 text-right">Budget</th>
                  <th className="py-1 text-right">Actual</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2 font-semibold">Net</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{money(netBudgeted)}</td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${netActual < 0 ? "text-red-600" : "text-emerald-700"}`}>{money(netActual)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal */}
      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={
          editing
            ? editing.isNew
              ? { category: "", amount: "", section: editing.section }
              : { ...getItemAtPath(editing.section, editing.path), section: editing.section }
            : null
        }
        isNew={!!editing?.isNew}
        parents={editing ? parentNames(editing.section, editing.path?.length === 1 ? getItemAtPath(editing.section, editing.path)?.category : "") : []}
        currentParent={editing && editing.path?.length === 2 ? getArray(editing.section)[editing.path[0]]?.category || null : null}
        onSave={(form, scope) => saveRow(editing, form, scope)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />

      {/* Period Settings */}
      <Modal open={periodOpen} onClose={() => setPeriodOpen(false)} title="Period settings">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Type</label>
            <select value={period.type} onChange={(e) => setPeriod((p) => ({ ...p, type: e.target.value }))} className="select">
              <option>Monthly</option><option>Biweekly</option><option>Weekly</option><option>SemiMonthly</option><option>Annually</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Anchor date</label>
            <input type="date" value={period.anchorDate} onChange={(e) => setPeriod((p) => ({ ...p, anchorDate: e.target.value }))} className="input" />
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
