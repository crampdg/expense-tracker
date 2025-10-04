import { useMemo, useState, useEffect, useRef } from "react";
import { calcPeriodEnd, getAnchoredPeriodStart } from "../utils/periodUtils";
import Card from "./ui/Card.jsx";
import Button from "./ui/Button.jsx";
import BudgetEditModal from "./modals/BudgetEditModal.jsx";
import { money } from "../utils/format.js";
import ExportPDFButton from "./ui/ExportPDFButton.jsx";
import SharePDFButton from "./ui/SharePDFButton.jsx";
import Modal from "./ui/Modal.jsx";

/**
 * BudgetTab
 * - Always shows all categories
 * - Long-press drag to reorder (mouse + touch) with full-row ghost
 * - Hover a top-level row to make the dragged row its subcategory (1 level deep)
 * - Subcategories have no Budget; parent Actual = sum(child Actuals)
 * - FIX: pointer capture + strong scroll lock to stop page from scrolling while dragging
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

  const normBudgets = {
    inflows: normalizeTree(budgets?.inflows),
    outflows: normalizeTree(budgets?.outflows),
  };

  const txs = Array.isArray(transactions) ? transactions : [];

  // Editing
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  // DRAG & DROP
  /**
   * drag object:
   * { section, path, item, x, y, dx, dy, depth, rowRect, tableRect, sourceEl, pointerId }
   */
  const [drag, setDrag] = useState(null);
  const [indicator, setIndicator] = useState(null); // {section, path, pos: 'above'|'below'}
  const [hoverParent, setHoverParent] = useState(null); // {section, path}
  const longPressTimer = useRef(null);
  const rowRefs = useRef(new Map()); // key "section:1.2" -> {el, depth}

  const keyFor = (section, path) => `${section}:${path.join(".")}`;
  const registerRowRef = (section, path, depth) => (el) => {
    const k = keyFor(section, path);
    if (el) rowRefs.current.set(k, { el, depth });
    else rowRefs.current.delete(k);
  };

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
    setEditing({ section, path: [getArray(section).length], isNew: true, isSub: false });

  // ---- Period range ---------------------------------------------------------
  const offsetStart = useMemo(
    () =>
      getAnchoredPeriodStart(period.type, period.anchorDate, new Date(), periodOffset),
    [period.type, period.anchorDate, periodOffset]
  );
  const offsetEnd = useMemo(() => calcPeriodEnd(period.type, offsetStart), [period.type, offsetStart]);

  const startISO = offsetStart.toISOString().slice(0, 10);
  const endISO = offsetEnd.toISOString().slice(0, 10);

  // ---- Actuals in period ----------------------------------------------------
  const inflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "inflow" || isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO) m[norm(t.category)] = (m[norm(t.category)] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txs, startISO, endISO]);

  const outflowActuals = useMemo(() => {
    const m = {};
    for (const t of txs) {
      if (t.type !== "expense" || isBlank(t.category)) continue;
      if (t.date >= startISO && t.date <= endISO) m[norm(t.category)] = (m[norm(t.category)] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txs, startISO, endISO]);

  const actualForItem = (section, item) => {
    const map = section === "inflows" ? inflowActuals : outflowActuals;
    if (item.children?.length) {
      return item.children.reduce((s, c) => s + Number(map[norm(c.category)] || 0), 0);
    }
    return Number(map[norm(item.category)] || 0);
  };

  // ---- Totals / Net ---------------------------------------------------------
  const inflowsTotalBudget = useMemo(
    () => (normBudgets.inflows ?? []).reduce((s, i) => s + Number(i.amount || 0), 0),
    [normBudgets]
  );
  const outflowsTotalBudget = useMemo(
    () => (normBudgets.outflows ?? []).reduce((s, o) => s + Number(o.amount || 0), 0),
    [normBudgets]
  );
  const netBudgeted = inflowsTotalBudget - outflowsTotalBudget;

  const inflowsTotalActual = useMemo(
    () => (normBudgets.inflows ?? []).reduce((s, i) => s + actualForItem("inflows", i), 0),
    [normBudgets, inflowActuals]
  );
  const outflowsTotalActual = useMemo(
    () => (normBudgets.outflows ?? []).reduce((s, o) => s + actualForItem("outflows", o), 0),
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
      const section = t.type === "inflow" ? "inflows" : t.type === "expense" ? "outflows" : null;
      if (!section) continue;
      const k = norm(t.category);
      if (!have[section].has(k)) {
        toAdd[section].push({ category: (t.category || "").trim(), amount: 0, auto: true, children: [] });
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
  const getItemAtPath = (section, path) => (path.length === 1 ? getArray(section)[path[0]] : getArray(section)[path[0]]?.children?.[path[1]] ?? null);
  const setArray = (section, newArr) => setBudgets((prev) => ({ ...prev, [section]: newArr }));

  const removeAtPath = (arr, path) => {
    const clone = JSON.parse(JSON.stringify(arr));
    let removed = null;
    if (path.length === 1) removed = clone.splice(path[0], 1)[0];
    else removed = clone[path[0]].children.splice(path[1], 1)[0];
    return { removed, next: clone };
  };
  const insertAt = (arr, path, item, pos) => {
    const clone = JSON.parse(JSON.stringify(arr));
    if (path.length === 1) {
      const idx = path[0] + (pos === "below" ? 1 : 0);
      clone.splice(idx, 0, { ...item, children: item.children ?? [] });
    } else {
      const [pi, ci] = path;
      const idx = ci + (pos === "below" ? 1 : 0);
      clone[pi].children.splice(idx, 0, { ...item, children: [] });
    }
    return clone;
  };
  const nestUnder = (arr, parentPath, item) => {
    const clone = JSON.parse(JSON.stringify(arr));
    const [pi] = parentPath;
    const parent = clone[pi];
    if (!parent.children) parent.children = [];
    parent.children.push({ category: item.category, amount: 0, auto: !!item.auto, children: [] });
    return clone;
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

    const update = (sectionArr) => {
      if (isNew) {
        sectionArr.push({ category: newName, amount: newAmount, children: [] });
      } else if (path.length === 1) {
        sectionArr[path[0]] = { ...sectionArr[path[0]], category: newName, amount: newAmount };
      } else {
        const [pi, ci] = path;
        sectionArr[pi].children[ci] = { ...sectionArr[pi].children[ci], category: newName, amount: 0 };
      }
      return sectionArr;
    };

    setArray(section, update(getArray(section)));

    if (renamed && scope !== "none") {
      onBulkRenameTransactions?.({ section, oldName, newName, scope, startISO, endISO });
    }

    if (renamed) {
      showUndoToast?.(`Renamed “${oldName || "Untitled"}” → “${newName}”`, () => {
        setBudgets(snapshot);
        if (scope !== "none") onBulkRenameTransactions?.({ section, oldName: newName, newName: oldName, scope, startISO, endISO });
      });
    } else if (isNew) {
      showUndoToast?.(`Added “${newName}” to ${section === "inflows" ? "Inflows" : "Outflows"}`, () => setBudgets(snapshot));
    } else if (amountChanged) {
      showUndoToast?.(`Updated “${newName}” • ${money(oldAmount)} → ${money(newAmount)}`, () => setBudgets(snapshot));
    } else if (isSub) {
      showUndoToast?.(`Saved “${newName}”. Subcategories don’t have budgets.`, () => setBudgets(snapshot));
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
    showUndoToast?.(`Deleted “${removed?.category ?? "Budget line"}”`, () => setBudgets(snapshot));
  };

  const claimRow = ({ section, path, isNew }, form) => {
    const isSub = path?.length === 2;
    saveRow({ section, path, isNew, isSub }, form, "none");
    if (isSub) return;
    const k = norm((form.category || "").trim() || "Untitled");
    const arr = getArray(section);
    const found = arr.findIndex((r) => norm(r.category) === k);
    const targetIndex = found >= 0 ? found : path[0];
    onClaim(section, targetIndex, { category: (form.category || "").trim() || "Untitled", amount: Number(form.amount) || 0 });
  };

  // -------------------- Strong scroll lock + pointer capture --------------------
  const preventScrollSelection = (enable, sourceEl, pointerId) => {
    const root = document.documentElement;
    const body = document.body;
    if (enable) {
      root.style.cursor = "grabbing";
      body.style.userSelect = "none";
      body.style.webkitUserSelect = "none";
      // Hard lock scrolling on iOS and desktop
      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      root.style.touchAction = "none";
      body.style.touchAction = "none";
      // Capture the pointer so we keep receiving move events
      try {
        sourceEl?.setPointerCapture?.(pointerId);
      } catch {}
    } else {
      root.style.cursor = "";
      body.style.userSelect = "";
      body.style.webkitUserSelect = "";
      root.style.overflow = "";
      body.style.overflow = "";
      root.style.touchAction = "";
      body.style.touchAction = "";
      try {
        sourceEl?.releasePointerCapture?.(pointerId);
      } catch {}
    }
  };

  const startLongPress = (e, section, path) => {
    if (e.button === 2) return; // ignore right-click
    if (drag) return; // avoid duplicate timers/starts
    const startX = e.clientX ?? (e.touches?.[0]?.clientX || 0);
    const startY = e.clientY ?? (e.touches?.[0]?.clientY || 0);
    const pointerId = e.pointerId ?? 1;

    const ref = rowRefs.current.get(keyFor(section, path));
    const rowEl = ref?.el;

    // Lock this row immediately so iOS doesn't scroll during the long-press
    try { e.currentTarget?.setPointerCapture?.(pointerId); } catch {}
    if (rowEl) {
      rowEl.style.touchAction = "none";          // stop native panning on this element
      rowEl.style.webkitUserSelect = "none";     // no accidental text selection
    }

    const rowRect = rowEl?.getBoundingClientRect();
    const tableRect = rowEl?.closest("table")?.getBoundingClientRect();

    const item = getItemAtPath(section, path);
    const depth = path.length - 1;

    // prevent native long-press actions (context menu, etc.)
    if (e.cancelable) e.preventDefault();

    longPressTimer.current = window.setTimeout(() => {
      preventScrollSelection(true, rowEl, pointerId);
      setDrag({
        section,
        path,
        item,
        x: startX,
        y: startY,
        dx: 0,
        dy: 0,
        depth,
        rowRect,
        tableRect,
        sourceEl: rowEl || null,
        pointerId: pointerId,
      });
    }, 180);

    const clear = () => {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("touchend", clear);
    };
    window.addEventListener("pointerup", clear, { once: true });
    window.addEventListener("touchend", clear, { once: true });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e) => {
      // Stop page scroll while dragging
      if (e.cancelable) e.preventDefault();
      const x = e.clientX ?? (e.touches?.[0]?.clientX || drag.x);
      const y = e.clientY ?? (e.touches?.[0]?.clientY || drag.y);
      setDrag((d) => ({ ...d, dx: x - d.x, dy: y - d.y }));

      let bestIndicator = null;
      let bestHover = null;

      for (const [k, { el, depth }] of rowRefs.current.entries()) {
        const [sec, pathStr] = k.split(":");
        if (sec !== drag.section) continue;
        const rect = el.getBoundingClientRect();
        const nearTop = Math.abs(y - rect.top) <= 8;
        const nearBottom = Math.abs(y - rect.bottom) <= 8;

        if (y > rect.top + 10 && y < rect.bottom - 10 && depth === 0) {
          if (!(drag.item?.children && drag.item.children.length > 0)) {
            bestHover = { section: sec, path: pathStr.split(".").map(Number) };
          }
        }
        if (nearTop) bestIndicator = { section: sec, path: pathStr.split(".").map(Number), pos: "above" };
        else if (nearBottom) bestIndicator = { section: sec, path: pathStr.split(".").map(Number), pos: "below" };
      }

      setIndicator(bestIndicator);
      setHoverParent(bestHover);
    };

    const endDrag = () => {
      if (indicator || hoverParent) {
        pushHistory();
        const arr = getArray(drag.section);
        const { removed, next } = removeAtPath(arr, drag.path);
        let result = next;
        if (hoverParent) result = nestUnder(result, hoverParent.path, removed);
        else if (indicator) result = insertAt(result, indicator.path, removed, indicator.pos);
        setArray(drag.section, result);
      }
      preventScrollSelection(false, drag.sourceEl, drag.pointerId);
      if (drag.sourceEl) {
        try { drag.sourceEl.releasePointerCapture?.(drag.pointerId); } catch {}
        drag.sourceEl.style.touchAction = "";
        drag.sourceEl.style.webkitUserSelect = "";
      }
      setDrag(null);
      setIndicator(null);
      setHoverParent(null);

    };

    // Pointer events (primary path)
    document.addEventListener("pointermove", onMove, { passive: false, capture: true });
    document.addEventListener("pointerup", endDrag, { passive: false, capture: true });
    document.addEventListener("pointercancel", endDrag, { passive: false, capture: true });

    // Touch fallbacks (some iOS edge cases)
    const onTouchMovePrevent = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMovePrevent, { passive: false, capture: true });
    document.addEventListener("touchend", endDrag, { passive: false, capture: true });

    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", endDrag, true);
      document.removeEventListener("pointercancel", endDrag, true);
      document.removeEventListener("touchmove", onTouchMovePrevent, true);
      document.removeEventListener("touchend", endDrag, true);
    };
  }, [drag, indicator, hoverParent]); // eslint-disable-line

  // -------------------- Render --------------------
  const SectionTable = ({ section, rows }) => {
    const renderRow = (item, idx, depth, parentPath) => {
      const path = [...parentPath, idx];
      const isSub = depth === 1;
      const k = keyFor(section, path);
      const actual = actualForItem(section, item);

      const isIndicatorAbove =
        indicator && indicator.section === section && indicator.pos === "above" && indicator.path.join(".") === path.join(".");
      const isIndicatorBelow =
        indicator && indicator.section === section && indicator.pos === "below" && indicator.path.join(".") === path.join(".");
      const isHoverParent =
        hoverParent && hoverParent.section === section && hoverParent.path.join(".") === path.join(".") && depth === 0;

      const isDraggingThis = drag && drag.section === section && drag.path.join(".") === path.join(".");

      return (
        <>
          {isIndicatorAbove ? (
            <tr>
              <td colSpan={3}>
                <div className="h-0.5 bg-blue-500 mx-4 rounded-full" />
              </td>
            </tr>
          ) : null}

          <tr
            key={k}
            ref={registerRowRef(section, path, depth)}
            className={[
              "cursor-grab border-t border-gray-100 relative",
              isHoverParent ? "bg-gray-100/60" : "hover:bg-gray-50",
              isDraggingThis ? "opacity-40" : "",
            ].join(" ")}
            style={{ touchAction: drag ? "none" : "manipulation" }}
            onClick={() => setEditing({ section, path, isNew: false, isSub })}
            onPointerDown={(e) => startLongPress(e, section, path)}
            onPointerMove={(e) => { if (longPressTimer.current || drag) { if (e.cancelable) e.preventDefault(); } }}
            onTouchMove={(e) => { if (longPressTimer.current || drag) { if (e.cancelable) e.preventDefault(); } }}
            onContextMenu={(e) => e.preventDefault()}
            data-depth={depth}
          >

            <td className="px-4 py-2" style={{ paddingLeft: depth ? 24 : 16 }}>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 select-none">⋮⋮</span>
                <span>
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

          {isIndicatorBelow ? (
            <tr>
              <td colSpan={3}>
                <div className="h-0.5 bg-blue-500 mx-4 rounded-full" />
              </td>
            </tr>
          ) : null}

          {item.children?.map((c, j) => renderRow(c, j, 1, path))}
        </>
      );
    };

    return (
      <div className={`overflow-auto ${drag ? "select-none" : ""}`}>
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

  return (
    <>
      <div id="budget-tab" className="space-y-3" style={drag ? { touchAction: "none" } : undefined}>
        {/* HEADER */}
        <Card className="p-3 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text(base font-semibold tracking-tight">Budget</h2>
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
            <Button type="button" variant="ghost" onClick={() => addRow("inflows")} className="!px-2 !py-1 text-sm">+ Add</Button>
          </div>
          <SectionTable section="inflows" rows={normBudgets.inflows} />
          <div className="h-px bg-gray-200 my-1" />

          <div className="flex items-center justify-between px-4 py-3">
            <h3 className="font-medium">Outflows</h3>
            <Button type="button" variant="ghost" onClick={() => addRow("outflows")} className="!px-2 !py-1 text-sm">+ Add</Button>
          </div>
          <SectionTable section="outflows" rows={normBudgets.outflows} />

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
              ? { category: "", amount: editing.isSub ? 0 : "", section: editing.section }
              : { ...getItemAtPath(editing.section, editing.path), amount: editing.isSub ? 0 : getItemAtPath(editing.section, editing.path)?.amount ?? 0, section: editing.section }
            : null
        }
        isNew={!!editing?.isNew}
        isSub={!!editing?.isSub}
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

      {/* Floating drag GHOST — full row */}
      {drag ? (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: (drag.tableRect?.left ?? drag.rowRect?.left ?? 0) + "px",
            top: drag.y + drag.dy - ((drag.rowRect?.height ?? 40) / 2) + "px",
            width: (drag.tableRect?.width ?? drag.rowRect?.width ?? 320) + "px",
          }}
        >
          <div className="px-4 py-2 bg-white border rounded-md shadow-lg text-sm">
            <div className="grid" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 select-none">⋮⋮</span>
                <span>
                  {drag.item.category}
                  {drag.item.auto ? <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">auto</span> : null}
                </span>
              </div>
              <div className="text-right tabular-nums">{drag.path.length === 1 ? money(Number(drag.item.amount || 0)) : ""}</div>
              <div className="text-right tabular-nums">{money(actualForItem(drag.section, drag.item))}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
