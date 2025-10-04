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
 * BudgetTab with:
 * - Always-show categories (removed "Show all" toggles)
 * - Drag to reorder with long-press (touch + mouse)
 * - Hover to nest as subcategory (1 level deep)
 * - Subcategories have no budget amount; parent actual = sum(child actuals)
 *
 * Notes/limits:
 * - Nesting is limited to one level (Category → Subcategories).
 * - You can reorder top-level categories and subcategories within a parent.
 * - You cannot drop a parent that already has children into another parent.
 * - Clicking a subcategory opens the same edit modal, but any entered amount is ignored.
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

  // Ensure items have "children" arrays for 1-level nesting support
  const normalizeTree = (arr) =>
    (Array.isArray(arr) ? arr : []).map((it) => ({
      category: it.category ?? "",
      amount: Number(it.amount ?? 0),
      auto: !!it.auto,
      // if file already had nested structure keep it, else default []
      children: Array.isArray(it.children)
        ? it.children.map((c) => ({
            category: c.category ?? "",
            amount: 0, // subcategories: budget ignored
            auto: !!c.auto,
            children: [], // limit to 1 level
          }))
        : [],
    }));

  const normBudgets = {
    inflows: normalizeTree(budgets?.inflows),
    outflows: normalizeTree(budgets?.outflows),
  };

  const txs = Array.isArray(transactions) ? transactions : [];

  // Editing path support: path = [topIndex] or [topIndex, childIndex]
  const [editing, setEditing] = useState(null); // {section, path, isNew, isSub}
  const [history, setHistory] = useState([]); // for Undo
  const [menuOpen, setMenuOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  // DRAG & DROP (long-press)
  const [drag, setDrag] = useState(null); // {section, path, item, x, y, dx, dy}
  const [indicator, setIndicator] = useState(null); // {section, path, pos: 'above'|'below'} | null
  const [hoverParent, setHoverParent] = useState(null); // {section, path} to nest under (only depth 0)
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

  // ---- Actuals in period ----------------------------------------------------
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

  // Helpers for actual calculation for a (possibly nested) item
  const actualForItem = (section, item) => {
    const map = section === "inflows" ? inflowActuals : outflowActuals;
    if (Array.isArray(item.children) && item.children.length > 0) {
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
    // Only create as top-level rows
    const have = { inflows: new Set(), outflows: new Set() };
    (normBudgets.inflows ?? []).forEach((r) => {
      have.inflows.add(norm(r.category));
      (r.children ?? []).forEach((c) => have.inflows.add(norm(c.category)));
    });
    (normBudgets.outflows ?? []).forEach((r) => {
      have.outflows.add(norm(r.category));
      (r.children ?? []).forEach((c) => have.outflows.add(norm(c.category)));
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

  const getItemAtPath = (section, path) => {
    let arr = getArray(section);
    if (path.length === 1) return arr[path[0]];
    if (path.length === 2) return arr[path[0]]?.children?.[path[1]];
    return null;
  };

  const setArray = (section, newArr) =>
    setBudgets((prev) => ({
      ...prev,
      [section]: newArr,
    }));

  const removeAtPath = (arr, path) => {
    const clone = JSON.parse(JSON.stringify(arr));
    let removed = null;
    if (path.length === 1) {
      removed = clone.splice(path[0], 1)[0];
    } else if (path.length === 2) {
      removed = clone[path[0]].children.splice(path[1], 1)[0];
    }
    return { removed, next: clone };
  };

  const insertAt = (arr, path, item, pos) => {
    // path points to existing row. Insert before/after that row.
    const clone = JSON.parse(JSON.stringify(arr));
    if (path.length === 1) {
      const idx = path[0] + (pos === "below" ? 1 : 0);
      clone.splice(idx, 0, { ...item, children: item.children ?? [] });
    } else if (path.length === 2) {
      const [pi, ci] = path;
      const idx = ci + (pos === "below" ? 1 : 0);
      clone[pi].children.splice(idx, 0, { ...item, children: [] });
    }
    return clone;
  };

  const nestUnder = (arr, parentPath, item) => {
    const clone = JSON.parse(JSON.stringify(arr));
    const [pi] = parentPath; // only allow depth 0 as parent
    const parent = clone[pi];
    if (!parent.children) parent.children = [];
    // When converting a parent to child, drop its own children (limit depth to 1)
    const child = {
      category: item.category,
      amount: 0,
      auto: !!item.auto,
      children: [],
    };
    parent.children.push(child);
    return clone;
  };

  // -------------------- Save/Delete/Claim --------------------
  const saveRow = ({ section, path, isNew, isSub }, form, scope = "none") => {
    const newName = (form.category || "").trim() || "Untitled";
    const newNorm = norm(newName);

    const originalItem = !isNew ? getItemAtPath(section, path) : null;
    const oldName = originalItem?.category ?? "";
    const oldNorm = norm(oldName);

    // Subcategories ignore amount; parents accept
    const oldAmount =
      !isNew && !isSub ? Number(originalItem?.amount ?? 0) : 0;
    const newAmount = !isSub ? Number(form.amount ?? 0) : 0;

    const renamed = !isNew && newNorm !== oldNorm;
    const amountChanged = !isNew && !isSub && oldAmount !== newAmount;

    const snapshot = JSON.parse(JSON.stringify(budgets));
    pushHistory();

    const update = (sectionArr) => {
      if (isNew) {
        // appending new top-level only
        sectionArr.push({
          category: newName,
          amount: newAmount,
          children: [],
        });
      } else {
        // update existing item
        if (path.length === 1) {
          const idx = path[0];
          sectionArr[idx] = {
            ...sectionArr[idx],
            category: newName,
            amount: newAmount,
          };
        } else if (path.length === 2) {
          const [pi, ci] = path;
          sectionArr[pi].children[ci] = {
            ...sectionArr[pi].children[ci],
            category: newName,
            amount: 0, // enforce
          };
        }
      }
      return sectionArr;
    };

    if (section === "inflows") {
      setArray(section, update(getArray(section)));
    } else {
      setArray(section, update(getArray(section)));
    }

    // rename in transactions if requested (allowed for both parent & sub)
    if (renamed && scope !== "none") {
      onBulkRenameTransactions?.({
        section,
        oldName,
        newName,
        scope, // 'all' | 'period'
        startISO,
        endISO,
      });
    }

    // Undo toasts
    if (renamed) {
      showUndoToast?.(`Renamed “${oldName || "Untitled"}” → “${newName}”`, () => {
        setBudgets(snapshot);
        if (scope !== "none") {
          onBulkRenameTransactions?.({
            section,
            oldName: newName,
            newName: oldName,
            scope,
            startISO,
            endISO,
          });
        }
      });
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
    if (isNew) {
      setEditing(null);
      return;
    }
    const snapshot = JSON.parse(JSON.stringify(budgets));
    const arr = getArray(section);
    const { removed, next } = removeAtPath(arr, path);

    pushHistory();
    setArray(section, next);
    setEditing(null);

    showUndoToast?.(
      `Deleted “${removed?.category ?? "Budget line"}”`,
      () => setBudgets(snapshot)
    );
  };

  const claimRow = ({ section, path, isNew }, form) => {
    // Claim only allowed for top-level rows
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

  // -------------------- Drag logic --------------------
  const startLongPress = (e, section, path) => {
    // only start if not clicking link/input etc
    if (e.button === 2) return; // right click ignore
    const startX = e.clientX ?? (e.touches?.[0]?.clientX || 0);
    const startY = e.clientY ?? (e.touches?.[0]?.clientY || 0);

    const item = getItemAtPath(section, path);
    const depth = path.length - 1;
    longPressTimer.current = window.setTimeout(() => {
      setDrag({
        section,
        path,
        item,
        x: startX,
        y: startY,
        dx: 0,
        dy: 0,
        depth,
      });
    }, 180);

    const clear = () => {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      window.removeEventListener("pointerup", clear, { passive: true });
      window.removeEventListener("touchend", clear, { passive: true });
    };
    window.addEventListener("pointerup", clear, { passive: true });
    window.addEventListener("touchend", clear, { passive: true });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e) => {
      const x = e.clientX ?? (e.touches?.[0]?.clientX || drag.x);
      const y = e.clientY ?? (e.touches?.[0]?.clientY || drag.y);
      setDrag((d) => ({ ...d, dx: x - d.x, dy: y - d.y }));

      // compute target
      let bestIndicator = null;
      let bestHover = null;

      for (const [k, { el, depth }] of rowRefs.current.entries()) {
        const [sec, pathStr] = k.split(":");
        if (sec !== drag.section) continue; // same section only
        const rect = el.getBoundingClientRect();
        const midY = (rect.top + rect.bottom) / 2;
        const nearTop = Math.abs(y - rect.top) <= 8;
        const nearBottom = Math.abs(y - rect.bottom) <= 8;

        // If pointer inside the row and not near edges -> possible nest (only depth 0)
        if (y > rect.top + 10 && y < rect.bottom - 10 && depth === 0) {
          // nest into this top-level item
          // disallow if dragged item has children
          if (
            !(drag.item?.children && drag.item.children.length > 0)
          ) {
            bestHover = { section: sec, path: pathStr.split(".").map((n) => Number(n)) };
          }
        }

        // insertion line above/below (blue)
        if (nearTop) {
          bestIndicator = {
            section: sec,
            path: pathStr.split(".").map((n) => Number(n)),
            pos: "above",
          };
        } else if (nearBottom) {
          bestIndicator = {
            section: sec,
            path: pathStr.split(".").map((n) => Number(n)),
            pos: "below",
          };
        } else {
          // choose by closeness to midline if nothing else
          if (!bestIndicator || Math.abs(y - midY) < Math.abs(y - ((rowRefs.current.get(keyFor(bestIndicator.section, bestIndicator.path))?.el.getBoundingClientRect().top ?? midY)))) {
            // do nothing; edges preferred
          }
        }
      }

      setIndicator(bestIndicator);
      setHoverParent(bestHover);
    };

    const onUp = () => {
      // Perform drop
      if (indicator || hoverParent) {
        pushHistory();
        const arr = getArray(drag.section);
        // remove source
        const { removed, next } = removeAtPath(arr, drag.path);
        let result = next;

        if (hoverParent) {
          // nest under parent depth 0
          result = nestUnder(result, hoverParent.path, removed);
        } else if (indicator) {
          // Prevent no-op when dropping immediately next to itself
          result = insertAt(result, indicator.path, removed, indicator.pos);
        }

        setArray(drag.section, result);
      }

      setDrag(null);
      setIndicator(null);
      setHoverParent(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
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
        indicator &&
        indicator.section === section &&
        indicator.pos === "above" &&
        indicator.path.join(".") === path.join(".");
      const isIndicatorBelow =
        indicator &&
        indicator.section === section &&
        indicator.pos === "below" &&
        indicator.path.join(".") === path.join(".");
      const isHoverParent =
        hoverParent &&
        hoverParent.section === section &&
        hoverParent.path.join(".") === path.join(".") &&
        depth === 0;

      return (
        <>
          <tr
            key={k}
            ref={registerRowRef(section, path, depth)}
            className={[
              "cursor-pointer border-t border-gray-100",
              "relative",
              isHoverParent ? "bg-gray-100/60" : "hover:bg-gray-50",
              isIndicatorAbove ? "outline outline-2 -outline-offset-2 outline-blue-500/70" : "",
            ].join(" ")}
            onClick={() =>
              setEditing({
                section,
                path,
                isNew: false,
                isSub,
              })
            }
            onPointerDown={(e) => startLongPress(e, section, path)}
            onTouchStart={(e) => startLongPress(e, section, path)}
            data-depth={depth}
          >
            <td className="px-4 py-2" style={{ paddingLeft: depth ? 24 : 16 }}>
              <div className="flex items-center gap-2">
                {/* grab handle icon (visual only) */}
                <span className="text-gray-400 select-none">⋮⋮</span>
                <span>
                  {item.category}
                  {item.auto ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                      auto
                    </span>
                  ) : null}
                </span>
              </div>
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {isSub ? "" : money(Number(item.amount || 0))}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {money(actual)}
            </td>
          </tr>
          {isIndicatorBelow ? (
            <tr>
              <td colSpan={3}>
                <div className="h-0.5 bg-blue-500 mx-4 rounded-full" />
              </td>
            </tr>
          ) : null}
          {Array.isArray(item.children) &&
            item.children.map((c, j) => renderRow(c, j, 1, path))}
        </>
      );
    };

    return (
      <div className="overflow-auto" data-noswipe>
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
        {/* HEADER — compact */}
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

        {/* TABLES — Inflows and Outflows */}
        <Card className="p-0 overflow-hidden">
          {/* Inflows */}
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
          <SectionTable section="inflows" rows={normBudgets.inflows} />
          <div className="h-px bg-gray-200 my-1" />

          {/* Outflows */}
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
          <SectionTable section="outflows" rows={normBudgets.outflows} />

          {/* Bottom NET row (Budget vs Actual) */}
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

      {/* Modal for add/edit */}
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
                  amount: editing.isSub ? 0 : getItemAtPath(editing.section, editing.path)?.amount ?? 0,
                  section: editing.section,
                }
            : null
        }
        isNew={!!editing?.isNew}
        onSave={(form, scope) => saveRow(editing, form, scope)}
        onDelete={() => deleteRow(editing)}
        onClaim={(form) => claimRow(editing, form)}
      />

      {/* Period Settings Modal (compact) */}
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

      {/* Floating drag preview */}
      {drag ? (
        <div
          className="fixed left-0 top-0 pointer-events-none z-50"
          style={{
            transform: `translate(${drag.x + drag.dx - 12}px, ${drag.y + drag.dy - 12}px)`,
            transition: "transform 0s",
          }}
        >
          <div className="px-3 py-1.5 rounded-md shadow-md border bg-white text-sm">
            {drag.item.category}
          </div>
        </div>
      ) : null}
    </>
  );
}
