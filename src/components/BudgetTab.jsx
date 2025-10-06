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
  // -------------------- helpers --------------------
  const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const isBlank = (s) => !s || !s.trim();

  const VALID_TYPES = new Set(["Monthly", "Biweekly", "Weekly", "SemiMonthly", "Annually"]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const coerceISO = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : todayISO);

  const safePeriod = {
    type: VALID_TYPES.has(period?.type) ? period.type : "Monthly",
    anchorDate: coerceISO(period?.anchorDate),
  };

  // normalize + keep child.type if present
  const normalizeTree = (arr, section) =>
    (Array.isArray(arr) ? arr : []).map((it) => ({
      category: it.category ?? "",
      amount: Number(it.amount ?? 0),
      auto: !!it.auto,
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
            ...(section === "outflows"
              ? { type: c.type === "fixed" ? "fixed" : c.type === "variable" ? "variable" : (it.type || "variable") }
              : {}),
          }))
        : [],
    }));

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

  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

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
      /* ignore */
    }
  };

  // -------------------- period math --------------------
  const offsetStart = useMemo(() => {
    try {
      return getAnchoredPeriodStart(
        safePeriod.type,
        safePeriod.anchorDate,
        new Date(),
        periodOffset
      );
    } catch {
      const d = new Date(safePeriod.anchorDate || todayISO);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }, [safePeriod.type, safePeriod.anchorDate, periodOffset]);

  const offsetEnd = useMemo(() => {
    try {
      return calcPeriodEnd(safePeriod.type, offsetStart);
    } catch {
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

  // ---- actuals for period ---------------------------------------------------
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

  // ---- auto-rows from transactions (hardened: consider parents + children) --
  useEffect(() => {
    const allNames = (rows) => {
      const s = new Set();
      for (const r of rows || []) {
        s.add(norm(r.category));
        for (const c of r.children || []) s.add(norm(c.category));
      }
      return s;
    };

    const haveInflowNames = allNames(getArray("inflows"));
    const haveOutflowNames = allNames(getArray("outflows"));

    const toAdd = { inflows: [], outflows: [] };
    const pending = { inflows: new Set(), outflows: new Set() };

    for (const t of txs) {
      if (isBlank(t.category)) continue;
      if (!(t.date >= startISO && t.date <= endISO)) continue;
      const n = norm(t.category);

      if (t.type === "inflow") {
        if (!haveInflowNames.has(n) && !pending.inflows.has(n)) {
          toAdd.inflows.push({ category: t.category, amount: 0, auto: true, children: [] });
          pending.inflows.add(n);
        }
      } else if (t.type === "expense") {
        // ✅ Key rule: if name exists anywhere in outflows (parent OR child), do NOT add
        if (!haveOutflowNames.has(n) && !pending.outflows.has(n)) {
          toAdd.outflows.push({ category: t.category, amount: 0, auto: true, children: [], type: "variable" });
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


  // -------------------- collapse state (persisted) ---------------------------
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

  // -------------------- consolidation helpers --------------------
  const consolidateParents = (rows) => {
    const byKey = new Map();
    for (const r of rows) {
      const key = `${norm(r.category)}|${r.type || "variable"}`;
      if (!byKey.has(key)) {
        byKey.set(key, { ...r, children: [...(r.children || [])] });
      } else {
        const tgt = byKey.get(key);
        // merge children (dedupe by name)
        const childMap = new Map();
        for (const c of [...(tgt.children || []), ...(r.children || [])]) {
          const ck = norm(c.category);
          if (!childMap.has(ck)) childMap.set(ck, { ...c });
        }
        tgt.children = [...childMap.values()];
        // sum parent amount
        tgt.amount = Number(tgt.amount || 0) + Number(r.amount || 0);
        // keep auto if any is true
        tgt.auto = !!(tgt.auto || r.auto);
        byKey.set(key, tgt);
      }
    }
    return [...byKey.values()];
  };

  const ensureParentOfType = (rows, name, desiredType) => {
    let idx = rows.findIndex(
      (r) => norm(r.category) === norm(name) && (r.type || "variable") === desiredType
    );
    if (idx === -1) {
      rows.push({
        category: name,
        amount: 0,
        auto: false,
        children: [],
        type: desiredType,
      });
      idx = rows.length - 1;
    }
    return idx;
  };

  // -------------------- save/delete/claim ------------------------
  const saveRow = ({ section, path, isNew }, form, scope = "none") => {
    const newName = (form.category || "").trim() || "Untitled";
    const newNorm = norm(newName);
    const targetParentName = form.parent ? form.parent.trim() : null;
    const desiredType = section === "outflows" ? (form?.type === "fixed" ? "fixed" : "variable") : undefined;

    const originalItem = !isNew ? getItemAtPath(section, path) : null;
    const oldName = originalItem?.category ?? "";
    const wasSub = !isNew && path.length === 2;

    const snapshot = JSON.parse(JSON.stringify(budgets));
    pushHistory();

    // work on cloned array
    let arr = getArray(section);

    // --------- CREATE NEW ---------
    if (isNew) {
      if (section === "outflows" && targetParentName) {
        // add as sub with its own type; may need to move under a parent of matching type
        // start under the selected parent (any type)
        let pIdx = arr.findIndex((r) => norm(r.category) === norm(targetParentName));
        if (pIdx === -1) {
          arr.push({ category: targetParentName, amount: 0, auto: false, children: [], type: "variable" });
          pIdx = arr.length - 1;
        }
        const parent = arr[pIdx];
        // if parent's type doesn't match child's desired type, move to (or create) a same-named parent in that type
        let hostIdx = pIdx;
        if ((parent.type || "variable") !== desiredType) {
          hostIdx = ensureParentOfType(arr, parent.category, desiredType);
        }
        if (!arr[hostIdx].children) arr[hostIdx].children = [];
        arr[hostIdx].children.push({
          category: newName,
          amount: 0,
          auto: false,
          children: [],
          ...(section === "outflows" ? { type: desiredType } : {}),
        });
      } else if (targetParentName) {
        // inflows sub (no type dimension)
        let pIdx = arr.findIndex((r) => norm(r.category) === norm(targetParentName));
        if (pIdx === -1) {
          arr.push({ category: targetParentName, amount: 0, auto: false, children: [] });
          pIdx = arr.length - 1;
        }
        if (!arr[pIdx].children) arr[pIdx].children = [];
        arr[pIdx].children.push({ category: newName, amount: 0, auto: false, children: [] });
      } else {
        // top-level
        arr = [
          ...arr,
          {
            category: newName,
            amount: Number(form.amount ?? 0),
            auto: false,
            children: [],
            ...(section === "outflows" ? { type: desiredType } : {}),
          },
        ];
      }

      // consolidate duplicates for outflows
      if (section === "outflows") arr = consolidateParents(arr);

      setArray(section, arr);
      showUndoToast?.(`Added “${newName}”`, () => setBudgets(snapshot));
      setEditing(null);
      return;
    }

    // --------- EDIT EXISTING ---------
    if (path.length === 2) {
      // editing a subcategory
      const [pi, ci] = path;
      const base = JSON.parse(JSON.stringify(arr));
      const oldParent = base[pi];
      const child = oldParent.children[ci];
      const oldChildType = section === "outflows" ? (child?.type || oldParent?.type || "variable") : undefined;

      // remove from old parent
      base[pi].children.splice(ci, 1);

      // decide host parent (may be same name different type)
      let hostIdx;
      if (targetParentName) {
        // moving under a (possibly different) parent name
        hostIdx = base.findIndex((r) => norm(r.category) === norm(targetParentName));
        if (hostIdx === -1) {
          base.push({
            category: targetParentName,
            amount: 0,
            auto: false,
            children: [],
            ...(section === "outflows" ? { type: "variable" } : {}),
          });
          hostIdx = base.length - 1;
        }
      } else {
        // promote to top-level
        base.push({
          category: newName,
          amount: Number(form.amount ?? 0),
          auto: !!child.auto,
          children: [],
          ...(section === "outflows" ? { type: desiredType ?? oldChildType } : {}),
        });
        // consolidate if outflows
        const nextArr = section === "outflows" ? consolidateParents(base) : base;
        setArray(section, nextArr);
        setEditing(null);
        showUndoToast?.(`Saved “${newName}”`, () => setBudgets(snapshot));
        return;
      }

      // ensure type host for outflows when sub type changed
      if (section === "outflows") {
        const childType = desiredType ?? oldChildType;
        // if the (named) host parent is not of childType, move under/into same-named parent in that type
        if ((base[hostIdx].type || "variable") !== childType) {
          hostIdx = ensureParentOfType(base, base[hostIdx].category, childType);
        }
        if (!base[hostIdx].children) base[hostIdx].children = [];
        base[hostIdx].children.push({
          category: newName,
          amount: 0,
          auto: !!child.auto,
          children: [],
          type: childType,
        });
        arr = consolidateParents(base);
      } else {
        // inflows sub
        if (!base[hostIdx].children) base[hostIdx].children = [];
        base[hostIdx].children.push({
          category: newName,
          amount: 0,
          auto: !!child.auto,
          children: [],
        });
        arr = base;
      }

      setArray(section, arr);
    } else {
      // editing a parent
      const base = JSON.parse(JSON.stringify(arr));
      const idx = path[0];
      const current = base[idx];

      // changing type for outflow parent => cascade children & consolidate
      if (section === "outflows") {
        const newType = desiredType ?? (current?.type || "variable");
        const wasType = current?.type || "variable";

        if (!targetParentName) {
          // rename/type change in place
          base[idx] = {
            ...current,
            category: newName,
            amount: Number(targetParentName ? 0 : (form.amount ?? current.amount ?? 0)),
            type: newType,
            children: (current.children || []).map((c) => ({ ...c, type: newType })), // cascade rule (2)
          };
        } else {
          // move this parent under another (i.e., turn into a sub) – lift children to top-level under same name/type
          const removed = base.splice(idx, 1)[0];
          // lift children as top-level under same type as parent
          const lifted = (removed.children || []).map((c) => ({
            category: c.category,
            amount: 0,
            auto: !!c.auto,
            children: [],
            type: removed.type || "variable",
          }));
          base.push(...lifted);
          // ensure host parent in the same type as the sub we create
          let hostIdx = base.findIndex((r) => norm(r.category) === norm(targetParentName));
          if (hostIdx === -1) {
            base.push({ category: targetParentName, amount: 0, auto: false, children: [], type: "variable" });
            hostIdx = base.length - 1;
          }
          if ((base[hostIdx].type || "variable") !== newType) {
            hostIdx = ensureParentOfType(base, base[hostIdx].category, newType);
          }
          if (!base[hostIdx].children) base[hostIdx].children = [];
          base[hostIdx].children.push({
            category: newName,
            amount: 0,
            auto: !!removed.auto,
            children: [],
            type: newType,
          });
        }

        // consolidate duplicates where name+type collide
        arr = consolidateParents(base);
      } else {
        // inflows parent
        if (!targetParentName) {
          base[idx] = {
            ...current,
            category: newName,
            amount: Number(form.amount ?? current.amount ?? 0),
          };
          arr = base;
        } else {
          const removed = base.splice(idx, 1)[0];
          let hostIdx = base.findIndex((r) => norm(r.category) === norm(targetParentName));
          if (hostIdx === -1) {
            base.push({ category: targetParentName, amount: 0, auto: false, children: [] });
            hostIdx = base.length - 1;
          }
          if (!base[hostIdx].children) base[hostIdx].children = [];
          base[hostIdx].children.push({
            category: newName,
            amount: 0,
            auto: !!removed.auto,
            children: [],
          });
          arr = base;
        }
      }
    }

    // rename transactions if requested
    if (!isNew) {
      const renamed = norm(oldName) !== newNorm;
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
    }

    setArray(section, arr);
    setEditing(null);
    showUndoToast?.(`Saved “${newName}”`, () => setBudgets(snapshot));
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

  // -------------------- type-aware table helpers --------------------
  const outflowRowsFor = (desiredType) => {
    const base = getArray("outflows");
    const out = [];
    for (const p of base) {
      const pType = p.type || "variable";
      const childMatches = (p.children || []).filter(
        (c) => (c.type || pType) === desiredType
      );
      const parentMatches = pType === desiredType;
      if (parentMatches || childMatches.length) {
        out.push({
          ...p,
          // only show children that match the table’s type
          children: childMatches,
          // mark whether to show the parent’s budget amount in this table
          __showBudget: parentMatches,
        });
      }
    }
    return out;
  };

  // -------------------- section table --------------------
  const SectionTable = ({ section, rows = [], baseRows, currentType }) => {
    const top = baseRows ?? rows;

    const sortedRows = useMemo(
      () => (rows ?? []).slice().sort((a, b) => actualForItem(section, b) - actualForItem(section, a)),
      [rows, inflowActuals, outflowActuals, section]
    );

    const tableBudgetTotal = useMemo(
      () => (rows ?? []).reduce((s, it) => s + Number((it.__showBudget ? it.amount : 0) || 0), 0),
      [rows]
    );
    const tableActualTotal = useMemo(
      () => (rows ?? []).reduce((s, it) => s + actualForItem(section, it), 0),
      [rows, inflowActuals, outflowActuals, section]
    );

    const pathFor = (item, parentRef = null) => {
      if (!parentRef) {
        const pi = top.findIndex(r => norm(r.category) === norm(item.category) && (section !== "outflows" || (r.type || "variable") === (item.type || r.type || "variable")));
        // fallback to name only if needed
        return [pi > -1 ? pi : top.findIndex(r => norm(r.category) === norm(item.category))];
      }
      const pi = top.findIndex(r => norm(r.category) === norm(parentRef.category));
      const ci = (top[pi]?.children || []).findIndex(c => norm(c.category) === norm(item.category));
      return [pi, ci];
    };

    const renderRow = (item, depth, parentRef) => {
      const path = pathFor(item, parentRef);
      const thisKey = `${section}:${currentType || "all"}:${depth}:${norm(parentRef?.category || "")}:${norm(item.category)}`;
      const isSub = depth === 1;
      const actual = actualForItem(section, item);
      const budget = Number(item.amount || 0);

      const titleCellClass = [
        "px-4 py-2",
        depth ? "pl-6 border-l-4 border-emerald-100" : ""
      ].join(" ");

      let budgetCellClass = "px-4 py-2 text-right tabular-nums";
      let actualCellClass = "px-4 py-2 text-right tabular-nums";

      if (!isSub) {
        budgetCellClass += " font-medium";
        if (section === "outflows") {
          if (budget > 0 && actual > budget) actualCellClass += " text-rose-700 font-medium";
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
              "border-t border-slate-200 relative",
              "odd:bg-white even:bg-slate-50/60",
              depth === 0 && isCollapsed(section, path) ? "" : "hover:bg-slate-50"
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
                    className="text-slate-400 hover:text-slate-600"
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

                <span className="ml-1 text-slate-800">
                  {item.category}
                  {item.auto ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400 bg-slate-100 rounded px-1 py-0.5">
                      auto
                    </span>
                  ) : null}
                </span>
              </div>
            </td>
            <td className={budgetCellClass}>
              {isSub ? "" : (item.__showBudget ? money(budget) : "")}
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
        <table className="w-full border-t border-slate-200 text-sm">
          <thead className="bg-slate-100/80 backdrop-blur sticky top-0 z-10 border-b border-slate-200">
            <tr className="text-left text-slate-600">
              <th className="px-4 py-2 w-2/5">Title</th>
              <th className="px-4 py-2 text-right">Budget</th>
              <th className="px-4 py-2 text-right">Actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-center text-slate-500" colSpan={3}>
                  No items yet
                </td>
              </tr>
            ) : (
              sortedRows.map((it) => renderRow(it, 0, null))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-emerald-50/60">
              <td className="px-4 py-2 font-semibold text-emerald-900">Total</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-900">
                {money(tableBudgetTotal)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-900">
                {money(tableActualTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // -------------------- UI --------------------
  return (
    <>
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              {(safePeriod.type === "SemiMonthly" ? "Semi-Monthly" : safePeriod.type)} Budget
            </h2>
            <div className="text-[11px] md:text-xs text-gray-600">
              {offsetStart.toDateString()} – {offsetEnd.toDateString()}
            </div>
          </div>

          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-1"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More"
            >
              ⋯
            </Button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-md z-20">
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    undo();
                    setMenuOpen(false);
                  }}
                  disabled={!history.length}
                >
                  Undo
                </button>
                <div className="px-2 py-1.5 border-t border-slate-100">
                  <ExportPDFButton targetId="budget-tab" filename={`${startISO}_to_${endISO}_Budget.pdf`} compact />
                </div>
                <div className="px-2 py-1 border-t border-slate-100">
                  <SharePDFButton targetId="budget-tab" filename={`${startISO}_to_${endISO}_Budget.pdf`} compact />
                </div>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setPeriodOffset(0);
                    setMenuOpen(false);
                  }}
                >
                  Reset to current period
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
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

        {/* Period arrows (match Summary) */}
        <div data-noswipe className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="!px-2 !py-1 text-sm"
            onPointerUp={() => setPeriodOffset((o) => o - 1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPeriodOffset((o) => o - 1);
              }
            }}
            title="Previous"
          >
            ←
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="!px-2 !py-1 text-sm"
            onPointerUp={() => setPeriodOffset((o) => o + 1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPeriodOffset((o) => o + 1);
              }
            }}
            title="Next"
          >
            →
          </Button>
        </div>
      </Card>

      {/* MAIN CARD */}
      <Card id="budget-tab" className="p-0 overflow-hidden border border-slate-200 bg-white">
        {/* Inflows header */}
        <div className="flex items-center justify-between px-4 py-2 bg-emerald-50/70 border-b border-emerald-100">
          <h3 className="font-medium text-emerald-900">Inflows</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const len = getArray("inflows").length;
              setEditing({ section: "inflows", path: [len], isNew: true });
            }}
            className="!px-3 !py-1 text-sm rounded-full bg-emerald-600/10 hover:bg-emerald-600/15 text-emerald-800"
          >
            + Add
          </Button>
        </div>
        <SectionTable section="inflows" rows={getArray("inflows")} baseRows={getArray("inflows")} />

        {/* Fixed outflows header */}
        <div data-noswipe className="mt-2 flex items-center justify-between px-4 py-2 bg-emerald-50/70 border-y border-emerald-100">
          <h3 className="font-medium text-emerald-900">Fixed Outflows</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const len = getArray("outflows").length;
              setEditing({ section: "outflows", path: [len], isNew: true, presetType: "fixed" });
            }}
            className="!px-3 !py-1 text-sm rounded-full bg-emerald-600/10 hover:bg-emerald-600/15 text-emerald-800"
          >
            + Add
          </Button>
        </div>
        <SectionTable
          section="outflows"
          rows={outflowRowsFor("fixed")}
          baseRows={getArray("outflows")}
          currentType="fixed"
        />

        {/* Variable outflows header */}
        <div className="mt-2 flex items-center justify-between px-4 py-2 bg-emerald-50/70 border-y border-emerald-100">
          <h3 className="font-medium text-emerald-900">Variable Outflows</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const len = getArray("outflows").length;
              setEditing({ section: "outflows", path: [len], isNew: true, presetType: "variable" });
            }}
            className="!px-3 !py-1 text-sm rounded-full bg-emerald-600/10 hover:bg-emerald-600/15 text-emerald-800"
          >
            + Add
          </Button>
        </div>
        <SectionTable
          section="outflows"
          rows={outflowRowsFor("variable")}
          baseRows={getArray("outflows")}
          currentType="variable"
        />

        {/* Net band */}
        <div className="px-4 py-3 text-sm border-t border-emerald-200 bg-emerald-50">
          <table className="w-full">
            <thead>
              <tr className="text-left text-emerald-900/80">
                <th className="py-1 w-2/5"> </th>
                <th className="py-1 text-right">Budget</th>
                <th className="py-1 text-right">Actual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 font-semibold text-emerald-900">Net</td>
                <td className="py-2 text-right tabular-nums font-semibold text-emerald-900">
                  {money(netBudgeted)}
                </td>
                <td
                  className={`py-2 text-right tabular-nums font-semibold ${
                    netActual < 0 ? "text-rose-700" : "text-emerald-800"
                  }`}
                >
                  {money(netActual)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Period settings modal */}
      <Modal open={periodOpen} onClose={() => setPeriodOpen(false)} title="Period settings">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-slate-600">Type</label>
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
            <label className="text-xs text-slate-600">Anchor date</label>
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

      {/* Editor */}
      <BudgetEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
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
