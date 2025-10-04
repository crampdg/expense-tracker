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
 * BudgetTab (drag-free)
 * - Subcategories: one level deep
 * - Create/move subs via:
 *    • Type “Parent > Child” in the title field (add or rename)
 *    • “+ Sub” on a parent row
 *    • Inline “↳ Move” selector on a parent row (pick existing parent or create new)
 * - Collapse/expand subcategories per parent
 * - Auto-rows from transactions in active period
 * - Net row (Budget vs Actual)
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
            amount: 0, // subs have no budgets
            auto: !!c.auto,
            children: [],
          }))
        : [],
    }));

  const normBudgets = {
    inflows: normalizeTree(budgets?.inflows),
    outflows: normalizeTree(budgets?.outflows),
  };

  const txs = Array.isArray(transactions) ? transactions : [];

  // Editing / history
  const [editing, setEditing] = useState(null);
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

  // ---- Totals / Net ---------------------------------------------------------
  const inflowsTotalBudget = useMemo(
    () =>
      (normBudgets.inflows ?? []).reduce(
        (s, i) => s + Number(i.amount || 0),
        0
      ),
    [normBudgets]
  );
  const outflowsTotalBudget = useMemo(
    () =>
      (normBudgets.outflows ?? []).reduce(
        (s, o) => s + Number(o.amount || 0),
        0
      ),
    [normBudgets]
  );
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget;

  const inflowsTotalActual = useMemo(
    () =>
      (normBudgets.inflows ?? []).reduce(
        (s, i) => s + actualForItem("inflows", i),
        0
      ),
    [normBudgets, inflowActuals]
  );
  const outflowsTotalActual = useMemo(
    () =>
      (normBudgets.outflows ?? []).reduce(
        (s, o) => s + actualForItem("outflows", o),
        0
      ),
    [normBudgets, outflowActuals]
  );
  const netActual = inflowsTotalActual - outflowsTotalActual;

  // ---- Auto-rows from transactions in active period ------------------------
  useEffect(() => {
    const have = { inflows: new Set(), outflows: new Set() };
    (normBudgets.inflows ?? []).forEach((r) => {
      have.inflows.add(norm(r.category));
      r.children?.forEach((c) => have.inflows.add(norm(c.category)));
    });
    (normBudgets.outflows ?? []).forEach((r) => {
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

  // -------------------- Tree utils --------------------
  const getArray = (section) => normalizeTree(budgets?.[section]);
  const setArray = (section, newArr) =>
    setBudgets((prev) => ({ ...prev, [section]: newArr }));

  const removeAtPath = (arr, path) => {
    const clone = JSON.parse(JSON.stringify(arr));
    let removed = null;
    if (path.length === 1) removed = clone.splice(path[0], 1)[0];
    else removed = clone[path[0]].children.splice(path[1], 1)[0];
    return { removed, next: clone };
  };

  // List of existing top-level parents (unique), excluding a given name
  const parentNames = (section, excludeName = "") =>
    Array.from(
      new Set(
        getArray(section)
          .map((r) => r.category)
          .filter((n) => n && norm(n) !== norm(excludeName))
      )
    );

  // Turn any existing top-level category into a sub of a parent (by name). One-level hierarchy only.
  const moveRowToParent = (section, fromPath, parentName) => {
    const snapshot = JSON.parse(JSON.stringify(budgets));
    let arr = getArray(section);
    const { removed, next } = removeAtPath(arr, fromPath);
    arr = next;

    // ensure parent exists (create if needed)
    let pIdx = arr.findIndex((r) => norm(r.category) === norm(parentName));
    if (pIdx === -1) {
      arr.push({ category: parentName, amount: 0, auto: false, children: [] });
      pIdx = arr.length - 1;
    }
    if (!arr[pIdx].children) arr[pIdx].children = [];

    // if the moved item had children, lift them to top level to keep 1-level depth
    if (removed.children?.length) {
      arr = [
        ...arr,
        ...removed.children.map((c) => ({ ...c, amount: 0, children: [] })),
      ];
    }

    // add the moved item as a child (no budget on subs)
    arr[pIdx].children.push({
      category: removed.category,
      amount: 0,
      auto: !!removed.auto,
      children: [],
    });

    setArray(section, arr);
    showUndoToast?.(
      `Moved “${removed.category}” under “${parentName}”`,
      () => setBudgets(snapshot)
    );
  };

  // -------------------- Save/Delete/Claim --------------------
  const saveRow = ({ section, path, isNew, isSub }, form, scope = "none") => {
    const newName = (form.category || "").trim() || "Untitled";
    const newNorm = norm(newName);
    const originalItem = !isNew ? getItemAtPath(section, path) : null;
    const oldName = originalItem?.category ?? "";
    const oldNorm = norm(oldName);

    const oldAmount = !isNew && !isSub ? Number(originalItem?.amount ?? 0) : 0;
    const newAmount = !isSub ? Number(form.amount ?? 0) : 0;

    const renamed = !isNew && newNorm !== oldNorm;
    const amountChanged = !isNew && !isSub && oldAmount !== newAmount;

    const snapshot = JSON.parse(JSON.stringify(budgets));
    pushHistory();

    // (A) If creating a sub via the "+ Sub" button
    if (isNew && isSub) {
      const parentIdx = path[0];
      const arr = JSON.parse(JSON.stringify(getArray(section)));
      if (!arr[parentIdx].children) arr[parentIdx].children = [];
      arr[parentIdx].children.push({
        category: newName,
        amount: 0,
        auto: false,
        children: [],
      });
      setArray(section, arr);
      showUndoToast?.(
        `Added “${newName}” as a subcategory`,
        () => setBudgets(snapshot)
      );
      setEditing(null);
      return;
    }

    // (B) Quick nest/move with "Parent > Child"
    const parts = newName
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      let base = getArray(section);

      // If renaming an existing row, remove it from its current spot first
      if (!isNew) {
        const removed = removeAtPath(base, path);
        base = removed.next;
      }

      const parentName = parts[0];
      const childName = parts.slice(1).join(" > ");
      let pIdx = base.findIndex(
        (r) => norm(r.category) === norm(parentName)
      );
      if (pIdx === -1) {
        base = [
          ...base,
          { category: parentName, amount: 0, auto: false, children: [] },
        ];
        pIdx = base.length - 1;
      }
      if (!base[pIdx].children) base[pIdx].children = [];
      base[pIdx].children.push({
        category: childName,
        amount: 0,
        auto: false,
        children: [],
      });
      setArray(section, base);
      showUndoToast?.(
        `Nested “${childName}” under “${parentName}”`,
        () => setBudgets(snapshot)
      );
      setEditing(null);
      return;
    }

    // Default: create/update at current depth
    const update = (sectionArr) => {
      if (isNew) {
        sectionArr.push({
          category: newName,
          amount: newAmount,
          children: [],
        });
      } else if (path.length === 1) {
        sectionArr[path[0]] = {
          ...sectionArr[path[0]],
          category: newName,
          amount: newAmount,
        };
      } else {
        const [pi, ci] = path;
        sectionArr[pi].children[ci] = {
          ...sectionArr[pi].children[ci],
          category: newName,
          amount: 0,
        };
      }
      return sectionArr;
    };

    setArray(section, update(getArray(section)));

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
    } else if (isNew) {
      showUndoToast?.(
        `Added “${newName}” to ${section === "inflows" ? "Inflows" : "Outflows"}`,
        () => setBudgets(snapshot)
      );
    } else if (amountChanged) {
      showUndoToast?.(
        `Updated “${newName}” • ${money(oldAmount)} → ${money(newAmount)}`,
        () => setBudgets(snapshot)
      );
    } else if (isSub) {
      showUndoToast?.(
        `Saved “${newName}”. Subcategories don’t have budgets.`,
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

  const getItemAtPath = (section, path) =>
    path.length === 1
      ? getArray(section)[path[0]]
      : getArray(section)[path[0]]?.children?.[path[1]] ?? null;

  const claimRow = ({ section, path, isNew }, form) => {
    const isSub = path?.length === 2;
    saveRow({ section, path, isNew, isSub }, form, "none");
    if (isSub) return;
    const k = norm((form.category || "").trim() || "Untitled");
    const arr = getArray(section);
    const found = arr.findIndex((r) => norm(r.category) === k);
    const targetIndex = found >= 0 ? found : path[0];
    onClaim(section, targetIndex, {
      category: (form.category || "").trim() || "Untitled",
      amount: Number(form.amount) || 0,
    });
  };

  // -------------------- Collapse + Move UI state --------------------
  const keyFor = (section, path) => `${section}:${path.join(".")}`;

  // Collapse/expand parents
  const [collapsed, setCollapsed] = useState(new Set());
  const isCollapsed = (section, path) => collapsed.has(keyFor(section, path));
  const toggleCollapse = (section, path) =>
    setCollapsed((s) => {
      const k = keyFor(section, path);
      const ns = new Set(s);
      ns.has(k) ? ns.delete(k) : ns.add(k);
      return ns;
    });

  // Inline “Move under…” UI state
  const [moveKey, setMoveKey] = useState(null); // e.g., "inflows:3"
  const [moveChoice, setMoveChoice] = useState(""); // selected parent name or "__new__"
  const [moveNewParent, setMoveNewParent] = useState(""); // typed new parent

  // -------------------- Render --------------------
  const SectionTable = ({ section, rows }) => {
    const renderRow = (item, idx, depth, parentPath) => {
      const path = [...parentPath, idx];
      const isSub = depth === 1;
      const thisKey = keyFor(section, path);
      const actual = actualForItem(section, item);
      const moveOpen = moveKey === thisKey;

      return (
        <>
          <tr
            key={thisKey}
            className={[
              "border-t border-gray-100 relative",
              depth === 0 && isCollapsed(section, path)
                ? ""
                : "hover:bg-gray-50",
            ].join(" ")}
            onClick={() =>
              setEditing({ section, path, isNew: false, isSub })
            }
            data-depth={depth}
          >
            <td
              className="px-4 py-2"
              style={{ paddingLeft: depth ? 24 : 16 }}
            >
              <div className="flex items-center gap-2">
                {/* collapse/expand for parents */}
                {depth === 0 && item.children?.length ? (
                  <button
                    type="button"
                    className="text-gray-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(section, path);
                    }}
                    title={
                      isCollapsed(section, path) ? "Expand" : "Collapse"
                    }
                    aria-label={
                      isCollapsed(section, path)
                        ? "Expand subcategories"
                        : "Collapse subcategories"
                    }
                  >
                    {isCollapsed(section, path) ? "▸" : "▾"}
                  </button>
                ) : null}

                <span className="ml-1">
                  {item.category}
                  {item.auto ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                      auto
                    </span>
                  ) : null}
                </span>

                {/* + Sub button on parents */}
                {depth === 0 ? (
                  <button
                    type="button"
                    className="ml-2 text-[11px] text-blue-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({
                        section,
                        path,
                        isNew: true,
                        isSub: true,
                      });
                    }}
                    title="Add subcategory"
                  >
                    + Sub
                  </button>
                ) : null}

                {/* Inline “Move under…” selector for parents */}
                {depth === 0 ? (
                  !moveOpen ? (
                    <button
                      type="button"
                      className="ml-2 text-[11px] text-blue-600 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        const parents = parentNames(section, item.category);
                        setMoveKey(thisKey);
                        setMoveChoice(parents[0] ?? "");
                        setMoveNewParent("");
                      }}
                      title="Move under parent"
                    >
                      ↳ Move
                    </button>
                  ) : (
                    <span
                      className="ml-2 inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        className="border rounded px-1 py-[2px] text-[11px]"
                        value={moveChoice}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMoveChoice(v);
                          if (v && v !== "__new__") {
                            moveRowToParent(section, path, v);
                            setMoveKey(null);
                          } else {
                            setMoveNewParent("");
                          }
                        }}
                      >
                        {parentNames(section, item.category).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        <option value="__new__">+ New parent…</option>
                      </select>

                      {moveChoice === "__new__" ? (
                        <>
                          <input
                            className="border rounded px-1 py-[2px] text-[11px]"
                            placeholder="Parent name"
                            value={moveNewParent}
                            onChange={(e) =>
                              setMoveNewParent(e.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="text-[11px] px-1 py-[2px] border rounded"
                            onClick={() => {
                              const v = moveNewParent.trim();
                              if (!v) return;
                              moveRowToParent(section, path, v);
                              setMoveKey(null);
                            }}
                            title="Confirm move"
                          >
                            ✔
                          </button>
                        </>
                      ) : null}

                      <button
                        type="button"
                        className="text-[11px] px-1 py-[2px] border rounded"
                        onClick={() => {
                          setMoveKey(null);
                        }}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </span>
                  )
                ) : null}
              </div>
            </td>

            <td className="px-4 py-2 text-right tabular-nums">
              {isSub ? "" : money(Number(item.amount || 0))}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {money(actual)}
            </td>
          </tr>

          {/* children */}
          {!isCollapsed(section, path)
            ? item.children?.map((c, j) => renderRow(c, j, 1, path))
            : null}
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
                <td
                  className="px-4 py-4 text-center text-gray-500"
                  colSpan={3}
                >
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
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t border-gray-100"
                    onClick={() => {
                      setPeriodOffset(0);
                      setMenuOpen(false);
                    }}
                  >
                    Reset to current period
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t border-gray-100"
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
        </Card>

        {/* TABLES */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h3 className="font-medium">Inflows</h3>
              <div className="text-xs text-gray-500">
                Tip: type “Parent &gt; Child” to nest
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setEditing({
                  section: "inflows",
                  path: [getArray("inflows").length],
                  isNew: true,
                  isSub: false,
                })
              }
              className="!px-2 !py-1 text-sm"
            >
              + Add
            </Button>
          </div>
          <SectionTable section="inflows" rows={normBudgets.inflows} />
          <div className="h-px bg-gray-200 my-1" />

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h3 className="font-medium">Outflows</h3>
              <div className="text-xs text-gray-500">
                Tip: type “Parent &gt; Child” to nest
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setEditing({
                  section: "outflows",
                  path: [getArray("outflows").length],
                  isNew: true,
                  isSub: false,
                })
              }
              className="!px-2 !py-1 text-sm"
            >
              + Add
            </Button>
          </div>
          <SectionTable section="outflows" rows={normBudgets.outflows} />

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
                  <td className="py-2 text-right tabular-nums font-semibold">
                    {money(netBudgeted)}
                  </td>
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
      </div>

      {/* Modal */}
      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={
          editing
            ? editing.isNew
              ? {
                  category: "",
                  amount: editing.isSub ? 0 : "",
                  section: editing.section,
                }
              : {
                  ...getItemAtPath(editing.section, editing.path),
                  amount: editing.isSub
                    ? 0
                    : getItemAtPath(editing.section, editing.path)?.amount ??
                      0,
                  section: editing.section,
                }
            : null
        }
        isNew={!!editing?.isNew}
        isSub={!!editing?.isSub}
        onSave={(form, scope) => saveRow(editing, form, scope)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />

      {/* Period Settings */}
      <Modal
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        title="Period settings"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-gray-600">Type</label>
            <select
              value={period.type}
              onChange={(e) =>
                setPeriod((p) => ({ ...p, type: e.target.value }))
              }
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
              onChange={(e) =>
                setPeriod((p) => ({ ...p, anchorDate: e.target.value }))
              }
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
    </>
  );
}
