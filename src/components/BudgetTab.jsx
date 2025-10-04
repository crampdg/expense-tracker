// BudgetTab.jsx
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
  showUndoToast,
  onBulkRenameTransactions,
}) {
  // -------------------- Helpers --------------------
  const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const isBlank = (s) => !s || !s.trim();

  // Robust period defaults (prevents invalid dates from crashing render)
  const VALID_TYPES = new Set(["Monthly", "Biweekly", "Weekly", "SemiMonthly", "Annually"]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const coerceISO = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : todayISO);

  const safePeriod = {
    type: VALID_TYPES.has(period?.type) ? period.type : "Monthly",
    anchorDate: coerceISO(period?.anchorDate),
  };

  const normalizeTree = (arr, section) =>
    (Array.isArray(arr) ? arr : []).map((it) => ({
      category: it.category ?? "",
      amount: Number(it.amount ?? 0),
      auto: !!it.auto,
      // Type only matters for outflows top-level; default to "variable" if missing
      type:
        section === "outflows"
          ? it.type === "fixed"
            ? "fixed"
            : "variable"
          : it.type ?? undefined,
      children: Array.isArray(it.children)
        ? it.children.map((c) => ({
            category: c.category ?? "",
            amount: 0,
            auto: !!c.auto,
            children: [],
          }))
        : [],
    }));

  // derived accessors into budgets state
  const getArray = (section) => normalizeTree(budgets?.[section], section);
  const setArray = (section, newArr) => setBudgets((prev) => ({ ...prev, [section]: newArr }));

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
  const [editing, setEditing] = useState(null); // {section, path, isNew, presetType?}
  const [history, setHistory] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  // history snapshot
  const pushHistory = () =>
    setHistory((h) => [
      ...h,
      JSON.stringify({ period, budgets, transactions, periodOffset }),
    ]);

  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    try {
      const parsed = JSON.parse(last);
      setPeriod(parsed.period);
      setBudgets(parsed.budgets);
      setPeriodOffset(parsed.periodOffset);
      showUndoToast?.("Undid last change");
      setHistory((h) => h.slice(0, -1));
    } catch {
      // ignore
    }
  };

  // -------------------- Period math (defensive) --------------------
  const offsetStart = useMemo(() => {
    try {
      return getAnchoredPeriodStart(
        safePeriod.type,
        safePeriod.anchorDate,
        periodOffset
      );
    } catch {
      // Hard fallback to today if utils choke on input
      const d = new Date(safePeriod.anchorDate || todayISO);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }, [safePeriod.type, safePeriod.anchorDate, periodOffset]);

  const offsetEnd = useMemo(() => {
    try {
      return calcPeriodEnd(safePeriod.type, offsetStart);
    } catch {
      // 1-day fallback
      const d = new Date(offsetStart);
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    }
  }, [safePeriod.type, offsetStart]);

  const startISO = useMemo(() => {
    try {
      return offsetStart.toISOString().slice(0, 10);
    } catch {
      return todayISO;
    }
  }, [offsetStart]);

  const endISO = useMemo(() => {
    try {
      return offsetEnd.toISOString().slice(0, 10);
    } catch {
      return todayISO;
    }
  }, [offsetEnd]);

  // ---- Actuals in period ----------------------------------------------------
  const txs = Array.isArray(transactions) ? transactions : [];

  const inflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "inflow" || isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO)
        m[norm(t.category)] = (m[norm(t.category)] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txs, startISO, endISO]);

  const outflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "expense" || isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO)
        m[norm(t.category)] = (m[norm(t.category)] || 0) + Number(t.amount || 0);
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

  const inflowsTotalBudget = useMemo(
    () => (getArray("inflows") ?? []).reduce((s, i) => s + Number(i.amount || 0), 0),
    [budgets]
  );
  const outflowsTotalBudget = useMemo(
    () => (getArray("outflows") ?? []).reduce((s, o) => s + Number(o.amount || 0), 0),
    [budgets]
  );

  const inflowsTotalActual = useMemo(
    () => (getArray("inflows") ?? []).reduce((s, i) => s + actualForItem("inflows", i), 0),
    [budgets, inflowActuals]
  );
  const outflowsTotalActual = useMemo(
    () => (getArray("outflows") ?? []).reduce((s, o) => s + actualForItem("outflows", o), 0),
    [budgets, outflowActuals]
  );
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget;
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
    const pending = { inflows: new Set(), outflows: new Set() }; // prevent dupes within the same pass

    for (const t of txs) {
      if (isBlank(t.category)) continue;
      if (!(t.date >= startISO && t.date <= endISO)) continue;

      const n = norm(t.category);

      if (t.type === "inflow") {
        if (!have.inflows.has(n) && !pending.inflows.has(n)) {
          toAdd.inflows.push({
            category: t.category,
            amount: 0,
            auto: true,
            children: [],
          });
          pending.inflows.add(n);
        }
      } else if (t.type === "expense") {
        if (!have.outflows.has(n) && !pending.outflows.has(n)) {
          toAdd.outflows.push({
            category: t.category,
            amount: 0,
            auto: true,
            children: [],
            type: "variable",
          });
          pending.outflows.add(n);
        }
      }
    }

    if (toAdd.inflows.length || toAdd.outflows.length) {
      setBudgets((prev) => ({
        ...prev,
        inflows: [...normalizeTree(prev?.inflows, "inflows"), ...toAdd.inflows],
        outflows: [...normalizeTree(prev?.outflows, "outflows"), ...toAdd.outflows],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, endISO, txs]);

  // -------------------- Collapse UI (now persisted) --------------------
  const COLLAPSE_KEY = "bleh:budget:collapsed:v2";
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // key by section + normalized NAME (stable across sessions)
  const keyFor = (section, pathOrName) => {
    const name =
      Array.isArray(pathOrName)
        ? getItemAtPath(section, pathOrName)?.category
        : pathOrName;
    return `${section}:${norm(name || "")}`;
  };

  const isCollapsed = (section, pathOrName) => collapsed.has(keyFor(section, pathOrName));
  const toggleCollapse = (section, pathOrName) =>
    setCollapsed((s) => {
      const k = keyFor(section, pathOrName);
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
        arr = [
          ...arr,
          {
            category: newName,
            amount: newAmount,
            auto: false,
            children: [],
            ...(section === "outflows" ? { type: form?.type === "fixed" ? "fixed" : "variable" } : {}),
          },
        ];
      } else {
        // sub of existing or new parent (create parent if needed)
        let pIdx = arr.findIndex((r) => norm(r.category) === norm(targetParent));
        if (pIdx === -1) {
          arr = [
            ...arr,
            {
              category: targetParent,
              amount: 0,
              auto: false,
              children: [],
              ...(section === "outflows" ? { type: "variable" } : {}),
            },
          ];
          pIdx = arr.length - 1;
        }
        const clone = JSON.parse(JSON.stringify(arr));
        if (!clone[pIdx].children) clone[pIdx].children = [];
        clone[pIdx].children.push({
          category: newName,
          amount: 0,
          auto: false,
          children: [],
        });
        arr = clone;
      }
      setArray(section, arr);
      showUndoToast?.(
        `Added “${newName}” to ${
          targetParent
            ? `subcategories of “${targetParent}”`
            : section === "inflows"
            ? "Inflows"
            : "Outflows"
        }`,
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
        base.push({
          category: newName,
          amount: newAmount,
          auto: !!child.auto,
          children: [],
          ...(section === "outflows"
            ? { type: form?.type ? (form.type === "fixed" ? "fixed" : "variable") : base[pi]?.type || "variable" }
            : {}),
        });
        setArray(section, base);
      } else {
        // Move to (possibly different) parent
        base[pi].children.splice(ci, 1);
        let pIdx = base.findIndex((r) => norm(r.category) === norm(targetParent));
        if (pIdx === -1) {
          base.push({
            category: targetParent,
            amount: 0,
            auto: false,
            children: [],
            ...(section === "outflows" ? { type: "variable" } : {}),
          });
          pIdx = base.length - 1;
        }
        if (!base[pIdx].children) base[pIdx].children = [];
        base[pIdx].children.push({
          category: newName,
          amount: 0,
          auto: !!child.auto,
          children: [],
        });
        setArray(section, base);
      }
    } else {
      // was top-level
      const base = JSON.parse(JSON.stringify(arr));
      const idx = path[0];
      const current = base[idx];

      if (!targetParent) {
        // stay top-level; update category/amount (and type for outflows)
        base[idx] = {
          ...current,
          category: newName,
          amount: newAmount,
          ...(section === "outflows" ? { type: form?.type === "fixed" ? "fixed" : "variable" } : {}),
        };
        setArray(section, base);
      } else {
        // move under parent; lift existing children to top-level to maintain 1-level depth
        const removed = base.splice(idx, 1)[0];
        let withLift = base;
        if (removed.children?.length) {
          withLift = [
            ...withLift,
            ...removed.children.map((c) => ({
              ...c,
              amount: 0,
              children: [],
              ...(section === "outflows" ? { type: removed?.type || "variable" } : {}),
            })),
          ];
        }
        let pIdx = withLift.findIndex((r) => norm(r.category) === norm(targetParent));
        if (pIdx === -1) {
          withLift = [
            ...withLift,
            {
              category: targetParent,
              amount: 0,
              auto: false,
              children: [],
              ...(section === "outflows" ? { type: "variable" } : {}),
            },
          ];
          pIdx = withLift.length - 1;
        }
        if (!withLift[pIdx].children) withLift[pIdx].children = [];
        withLift[pIdx].children.push({
          category: newName,
          amount: 0,
          auto: !!removed.auto,
          children: [],
        });
        setArray(section, withLift);
      }
    }

    // rename transaction scope
    if (renamed && scope !== "none") {
      onBulkRenameTransactions?.({
        section,
        oldName,
        newName,
        scope,
        startISO,
        endISO,
      });
    }

    if (renamed) {
      showUndoToast?.(
        `Renamed “${oldName || "Untitled"}” → “${newName}”`,
        () => {
          setBudgets(snapshot);
          if (scope !== "none")
            onBulkRenameTransactions?.({
              section,
              oldName: newName,
              newName: oldName,
              scope,
              startISO,
              endISO,
            });
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
    showUndoToast?.(`Deleted “${removed?.category ?? "Budget line"}”`, () =>
      setBudgets(snapshot)
    );
  };

  const claimRow = ({ section, path, isNew }, form) => {
    // only for top-level lines
    const isSub = path?.length === 2;
    saveRow(
      { section, path, isNew },
      { category: form.category, amount: form.amount, parent: null, type: form?.type },
      "none"
    );
    if (isSub) return;
    const k = norm((form.category || "").trim() || "Untitled");
    const arr = getArray(section);
    const found = arr.findIndex((r) => norm(r.category) === k);
    if (found > -1) {
      onClaim?.({
        section,
        category: arr[found].category,
        amount: Number(form.amount || 0),
      });
    }
  };

  // ---- SECTION TABLE (now sorted; shows per-table totals) -------------------
  const SectionTable = ({ section, rows = [], baseRows }) => {
    // baseRows = the full, original top-level array for this section (unfiltered)
    const top = baseRows ?? rows;

    // Sort only for display
    const sortedRows = useMemo(
      () => (rows ?? []).slice().sort((a, b) => actualForItem(section, b) - actualForItem(section, a)),
      [rows, inflowActuals, outflowActuals, section]
    );

    const tableBudgetTotal = useMemo(
      () => (rows ?? []).reduce((s, it) => s + Number(it.amount || 0), 0),
      [rows]
    );
    const tableActualTotal = useMemo(
      () => (rows ?? []).reduce((s, it) => s + actualForItem(section, it), 0),
      [rows, inflowActuals, outflowActuals, section]
    );

    // Path by NAME to avoid identity issues from clones/filters
    const pathFor = (item, parentRef = null) => {
      if (!parentRef) {
        const pi = top.findIndex(r => norm(r.category) === norm(item.category));
        return [pi];
      }
      const pi = top.findIndex(r => norm(r.category) === norm(parentRef.category));
      const ci = (top[pi]?.children || []).findIndex(c => norm(c.category) === norm(item.category));
      return [pi, ci];
    };

    const renderRow = (item, depth, parentRef) => {
      const path = pathFor(item, parentRef);
      const thisKey = keyFor(section, path);
      const isSub = depth === 1;
      const actual = actualForItem(section, item);
      const budget = Number(item.amount || 0);

      const titleCellClass = ["px-4 py-2", depth ? "pl-6 border-l-2 border-gray-200" : ""].join(" ");
      let budgetCellClass = "px-4 py-2 text-right tabular-nums";
      let actualCellClass = "px-4 py-2 text-right tabular-nums";

      if (!isSub) {
        budgetCellClass += " font-medium";
        // color cues
        if (section === "outflows") {
          if (budget > 0 && actual > budget) actualCellClass += " text-rose-600 font-medium";
          else if (budget > 0 && actual < budget) actualCellClass += " text-emerald-700 font-medium";
          else actualCellClass += " font-medium";
        } else {
          if (budget > 0 && actual >= budget) actualCellClass += " text-emerald-700 font-medium";
          else if (budget > 0 && actual < budget) actualCellClass += " text-amber-700 font-medium";
          else actualCellClass += " font-medium";
        }
      }

      return (
        <>
          <tr
            key={thisKey}
            className={[
              "border-t border-gray-100 relative odd:bg-white even:bg-gray-50/40",
              depth === 0 && isCollapsed(section, path) ? "" : "hover:bg-gray-50",
            ].join(" ")}
            onClick={
              editing ? undefined : () => setEditing({ section, path, isNew: false })
            }
            data-depth={depth}
          >
            <td className={titleCellClass}>
              <div className="flex items-center gap-2">
                {depth === 0 && item.children?.length ? (
                  <button
                    type="button"
                    className="text-gray-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(section, path);
                    }}
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
            <td className={budgetCellClass}>
              {isSub ? "" : money(budget)}
            </td>
            <td className={actualCellClass}>{money(actual)}</td>
          </tr>

          {!isCollapsed(section, path)
            ? (item.children
                ? [...item.children].sort((a, b) => actualForItem(section, b) - actualForItem(section, a))
                : []
              ).map((child) => renderRow(child, 1, item))
            : null}
        </>
      );
    };

    return (
      <div className="overflow-auto" style={editing ? { pointerEvents: "none" } : undefined}>
        <table className="w-full border-t border-gray-200 text-sm">
          <thead className="bg-white sticky top-0 z-10 border-b">
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
              sortedRows.map((it) => renderRow(it, 0, null))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-gray-50/60">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold">{money(tableBudgetTotal)}</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold">{money(tableActualTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // -------------------- UI --------------------
  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-lg">Budget</h2>
          <div className="relative">
            <Button type="button" variant="ghost" onClick={() => setMenuOpen((o) => !o)}>
              ⋯
            </Button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-md z-20">
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    undo();
                    setMenuOpen(false);
                  }}
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setPeriodOffset(0);
                    setMenuOpen(false);
                  }}
                >
                  Reset to current period
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setPeriodOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  Period settings…
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Period arrows + chip */}
        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="!px-2"
            onClick={() => setPeriodOffset((o) => o - 1)}
            title="Previous"
          >
            ←
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="!px-2"
            onClick={() => setPeriodOffset((o) => o + 1)}
            title="Next"
          >
            → 
          </Button>
          <button
            type="button"
            onClick={() => setPeriodOpen(true)}
            className="px-2 py-1 rounded border text-gray-700 text-xs md:text-sm hover:bg-gray-50"
            title="Open period settings"
          >
            {safePeriod.type} • {startISO} → {endISO}
          </button>
        </div>
      </Card>

      {/* TABLES */}
      <Card id="budget-tab" className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-medium">Inflows</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditing({ section: "inflows", path: [getArray("inflows").length], isNew: true });
            }}
            className="!px-2 !py-1 text-sm"
          >
            + Add
          </Button>
        </div>
        <SectionTable section="inflows" rows={getArray("inflows")} baseRows={getArray("inflows")} />

        <div className="h-px bg-gray-200 my-1" />

        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-medium">Fixed Outflows</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const len = getArray("outflows").length;
              setEditing({ section: "outflows", path: [len], isNew: true, presetType: "fixed" });
            }}
            className="!px-2 !py-1 text-sm"
          >
            + Add
          </Button>
        </div>
        <SectionTable
          section="outflows"
          rows={getArray("outflows").filter((r) => (r.type || "variable") === "fixed")}
          baseRows={getArray("outflows")}
        />

        <div className="h-px bg-gray-200 my-1" />

        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-medium">Variable Outflows</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const len = getArray("outflows").length;
              setEditing({ section: "outflows", path: [len], isNew: true, presetType: "variable" });
            }}
            className="!px-2 !py-1 text-sm"
          >
            + Add
          </Button>
        </div>
        <SectionTable
          section="outflows"
          rows={getArray("outflows").filter((r) => (r.type || "variable") === "variable")}
          baseRows={getArray("outflows")}
        />

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
              <tr className="bg-gray-50/60">
                <td className="py-2 font-semibold">Net</td>
                <td className="py-2 text-right tabular-nums font-semibold">{money(netBudgeted)}</td>
                <td
                  className={`py-2 text-right tabular-nums font-semibold ${
                    netActual < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {money(netActual)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Period Settings */}
      <Modal open={periodOpen} onClose={() => setPeriodOpen(false)} title="Period settings">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Type</label>
            <select
              value={safePeriod.type}
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
              value={safePeriod.anchorDate}
              onChange={(e) => setPeriod((p) => ({ ...p, anchorDate: e.target.value }))}
              className="input"
            />
          </div>
          <div className="pt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPeriodOpen(false)}>
              Close
            </Button>
            <Button onClick={() => setPeriodOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Editor modal */}
      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}  // <-- makes Cancel work
        item={
          editing
            ? (() => {
                const base =
                  getItemAtPath(editing.section, editing.path) || {
                    category: "",
                    amount: 0,
                    children: [],
                  };
                return {
                  ...base,
                  section: editing.section,
                  ...(editing.section === "outflows"
                    ? { type: base?.type || editing.presetType || "variable" }
                    : {}),
                };
              })()
            : null
        }
        isNew={!!editing?.isNew}
        parents={
          editing
            ? parentNames(
                editing.section,
                getItemAtPath(editing.section, editing.path)?.category || ""
              )
            : []
        }
        currentParent={
          editing && editing.path?.length === 2
            ? getArray(editing.section)[editing.path[0]]?.category || null
            : null
        }
        onSave={(form, scope) => saveRow(editing, form, scope)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />
    </>
  );
}
