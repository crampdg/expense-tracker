import { collectAllCategoryNames } from "../utils/budgetNames";
import React, { useState, useMemo, useEffect } from "react";
import MoneyTimeModal from "./modals/MoneyTimeModal";
import SavingsSettingsModal from "./modals/SavingsSettingsModal.jsx";
import { getAnchoredPeriodStart, calcPeriodEnd } from "../utils/periodUtils";
import { Settings as Gear, ChevronDown } from "lucide-react";

/* ---------- settings I/O (new keys, backward-friendly) ---------- */
function clamp01(x){ return Math.min(0.99, Math.max(0, Number(x)||0)); }
function pickNum(k, d=0){ try{ const v = Number(localStorage.getItem(k)); return Number.isFinite(v) ? Math.max(0,v) : d; }catch{ return d; } }
function pickBool(k, d=false){ try{ return localStorage.getItem(k) === "true" ? true : (localStorage.getItem(k)==="false" ? false : d); }catch{ return d; } }
function readSettings() {
  const investAPR = (() => {
    try { const v = Number(localStorage.getItem("investAPR")); return Number.isFinite(v) ? Math.max(0, v) : 0.04; } catch { return 0.04; }
  })();
  const suggestedDailyBufferPct = clamp01(pickNum("suggestedDailyBufferPct", 0.10));
  return { investAPR, suggestedDailyBufferPct };
}

// ===== Investments storage keys =====
const INVEST_KEYS = {
  APR: "investAPR",
  BAL: "investBalance",
  PRINC: "investPrincipal",
  LAST: "investLastAccruedISO",
};

function readInvestAPR() {
  try { const v = Number(localStorage.getItem(INVEST_KEYS.APR)); return Number.isFinite(v) ? Math.max(0, v) : 0.04; } catch { return 0.04; }
}

function readInvestState() {
  const apr = readInvestAPR();
  let bal = 0, pr = 0, last = null;
  try { bal = Number(localStorage.getItem(INVEST_KEYS.BAL)) || 0; } catch {}
  try { pr  = Number(localStorage.getItem(INVEST_KEYS.PRINC)) || 0; } catch {}
  try { last = localStorage.getItem(INVEST_KEYS.LAST) || null; } catch {}
  return { apr, balance: Math.max(0, bal), principal: Math.max(0, pr), lastAccruedISO: last };
}

function writeInvestState({ balance, principal, lastAccruedISO }) {
  try {
    localStorage.setItem(INVEST_KEYS.BAL, String(Math.max(0, Number(balance) || 0)));
    localStorage.setItem(INVEST_KEYS.PRINC, String(Math.max(0, Number(principal) || 0)));
    if (lastAccruedISO) localStorage.setItem(INVEST_KEYS.LAST, lastAccruedISO);
  } catch {}
}

function monthsBetween(fromISO, toISO) {
  if (!fromISO) return 0;
  const a = new Date(fromISO), b = new Date(toISO);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

function accrueInvestMonthly(state, today = new Date()) {
  const toISO = today.toISOString().slice(0, 10);
  const months = monthsBetween(state.lastAccruedISO || toISO, toISO);
  if (months <= 0) return state;

  const apr = readInvestAPR();
  const monthly = apr / 12;
  const factor = Math.pow(1 + monthly, months);
  const newBal = (Number(state.balance) || 0) * factor;

  const updated = { ...state, balance: newBal, lastAccruedISO: toISO };
  writeInvestState(updated);
  return updated;
}

function listInvestEventsFromTxs(transactions = []) {
  const events = [];
  for (const t of transactions) {
    if (!t?.date) continue;
    const amt = Math.max(0, Number(t.amount) || 0);
    if (amt <= 0) continue;

    const meta = t.meta || {};
    const cat = (t.category || "").toLowerCase().trim();
    const isInvest = meta.investment === true || cat === "investments";

    if (!isInvest) continue;

    const action = (meta.action || "").toLowerCase();
    let kind = null; // 'invest' | 'withdraw'
    if (action === "invest") kind = "invest";
    else if (action === "withdraw") kind = "withdraw";
    else if (t.type === "expense") kind = "invest";
    else if (t.type === "inflow") kind = "withdraw";

    if (!kind) continue;
    events.push({ date: t.date, amount: amt, kind });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

function rebuildInvestFromTransactions(apr, transactions, today = new Date()) {
  const events = listInvestEventsFromTxs(transactions);
  const monthly = Math.max(0, Number(apr) || 0) / 12;

  if (events.length === 0) {
    const todayISO = today.toISOString().slice(0, 10);
    return { balance: 0, principal: 0, lastAccruedISO: todayISO };
  }

  let state = { balance: 0, principal: 0, lastAccruedISO: events[0].date };
  const accrueTo = (toISO) => {
    const m = monthsBetween(state.lastAccruedISO, toISO);
    if (m > 0) {
      state.balance = state.balance * Math.pow(1 + monthly, m);
      state.lastAccruedISO = toISO;
    }
  };

  for (const ev of events) {
    accrueTo(ev.date);
    if (ev.kind === "invest") {
      state.balance += ev.amount;
      state.principal += ev.amount;
    } else {
      const take = Math.min(ev.amount, state.balance);
      state.balance -= take;
      const reduceP = Math.min(state.principal, take);
      state.principal -= reduceP;
    }
  }

  const todayISO = today.toISOString().slice(0, 10);
  accrueTo(todayISO);

  return {
    balance: Math.max(0, +state.balance.toFixed(2)),
    principal: Math.max(0, +state.principal.toFixed(2)),
    lastAccruedISO: todayISO,
  };
}

function saveSettings(s) {
  try {
    if (s.investAPR !== undefined) {
      const v = Math.max(0, Number(s.investAPR) || 0.04);
      localStorage.setItem("investAPR", String(v));
    }
    if (s.suggestedDailyBufferPct !== undefined) {
      const v = Math.max(0, Math.min(0.99, Number(s.suggestedDailyBufferPct) || 0.10));
      localStorage.setItem("suggestedDailyBufferPct", String(v));
    }
  } catch {}
}

function pickStr(k, d="") {
  try {
    const v = localStorage.getItem(k);
    return v !== null && v !== undefined ? v : d;
  } catch {
    return d;
  }
}

/* ---------- small helpers ---------- */
function currency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0.00";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  return sign + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const amtClass = (n) => n < 0 ? "text-red-600" : n > 0 ? "text-emerald-700" : "text-gray-700";

/* ---------- compute reserved for this period ---------- */
function periodSpan(start, end){
  const d0 = new Date(start), d1 = new Date(end);
  const ms = 24*60*60*1000;
  return Math.max(1, Math.round((Date.UTC(d1.getFullYear(),d1.getMonth(),d1.getDate()) - Date.UTC(d0.getFullYear(),d0.getMonth(),d0.getDate()))/ms) + 1);
}
function daysSoFar(start, end, today=new Date()){
  const d0 = new Date(start), d1 = new Date(end);
  const ms = 24*60*60*1000;
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const a = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
  const b = new Date(Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate()));
  if (t < a) return 0;
  if (t > b) return periodSpan(start,end);
  return Math.round((t - a)/ms) + 1;
}

/* ---------- variable/outflow helpers (robust to different shapes) ---------- */
const isTopLevel = (o) => !(o?.parentId || o?.parent || o?.parentCategory || o?.parentKey);
const normCat = (s) => (s || "").trim();
const pickBudgeted = (o) => Number(o?.amount ?? o?.budget ?? o?.budgeted ?? 0) || 0;
const isVariableOutflow = (o) => {
  const type = (o?.type || o?.kind || "").toString().toLowerCase();
  if (typeof o?.isVariable === "boolean") return o.isVariable;
  if (typeof o?.fixed === "boolean") return !o.fixed;
  if (type) return type !== "fixed";
  // Fallback: treat as variable if unknown (safer for warnings)
  return true;
};

export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(readSettings());
  const [invest, setInvest] = useState(() => accrueInvestMonthly(readInvestState()));

  const [isInvestOpen, setIsInvestOpen] = useState(() => {
    try {
      const v = localStorage.getItem("investIsOpen");
      return v ? v === "true" : false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try { localStorage.setItem("investIsOpen", String(isInvestOpen)); } catch {}
  }, [isInvestOpen]);

  const txs = Array.isArray(transactions) ? transactions : [];
  const categories = useMemo(() => collectAllCategoryNames(canonBudget), [canonBudget]);




  useEffect(() => {
    const tick = setInterval(() => {
      const updated = accrueInvestMonthly(readInvestState(), new Date());
      if (Math.abs(updated.balance - invest.balance) > 0.005 || updated.lastAccruedISO !== invest.lastAccruedISO) {
        setInvest(updated);
      }
    }, 60 * 1000);
    return () => clearInterval(tick);
  }, [invest.balance, invest.lastAccruedISO]);

  useEffect(() => {
    const rebuilt = rebuildInvestFromTransactions(readInvestAPR(), txs, new Date());
    const changed =
      Math.abs(rebuilt.balance - invest.balance) > 0.005 ||
      Math.abs(rebuilt.principal - invest.principal) > 0.005 ||
      rebuilt.lastAccruedISO !== invest.lastAccruedISO;

    if (changed) {
      writeInvestState(rebuilt);
      setInvest(rebuilt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs]);

  // ---- Period window ----
  const { startISO, endISO, daysLeft, periodDays, daysPassed } = useMemo(() => {
    let type = "Monthly";
    let anchor = new Date().toISOString().slice(0, 10);
    try {
      const saved = localStorage.getItem("periodConfig");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.type && parsed?.anchorDate) { type = parsed.type; anchor = parsed.anchorDate; }
      }
    } catch {}
    const start = getAnchoredPeriodStart(type, anchor, new Date(), 0);
    const end = calcPeriodEnd(type, start);
    const dayMs = 24 * 60 * 60 * 1000;
    const left = Math.max(1, Math.ceil((end - new Date()) / dayMs));
    const pDays = periodSpan(start.toISOString().slice(0,10), end.toISOString().slice(0,10));
    const dPassed = daysSoFar(start.toISOString().slice(0,10), end.toISOString().slice(0,10));
    return {
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      daysLeft: left,
      periodDays: pDays,
      daysPassed: dPassed
    };
  }, []);

  // ---- Cash on Hand ----
  const cashOnHand = useMemo(() => {
    return txs.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === "inflow") return sum + amt;
      if (t.type === "expense") return sum - amt;
      return sum;
    }, 0);
  }, [txs]);

  // ---- Savings (cumulative) ----
  const savingsLabel = (settings.savingsLabel || "Savings").trim();
  const lifetimeSavings = useMemo(() => {
    let sum = 0;
    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      const cat = (t.category || "").trim();
      if (t.type === "expense" && (cat === savingsLabel || t?.meta?.autoSaved === true)) {
        sum += amt;
      }
    }
    return sum;
  }, [txs, savingsLabel]);


  // Normalize text for comparisons
  const normKey = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // strip zero-width chars
    .replace(/[’'`´]/g, "'")               // unify apostrophes
    .replace(/[-–—]/g, "-")                // unify dashes
    .replace(/[\s_]+/g, " ")               // collapse spaces/underscores
    .trim();

  // Canonicalize budget for Wallet:
  // - If a top-level outflow (with no children) has the same name as ANY child,
  //   drop the top-level duplicate so Wallet never sees a $0 phantom row.
  const canonBudget = useMemo(() => {
    const b = budget || {};
    const outflows = Array.isArray(b.outflows) ? b.outflows : [];
    const childNames = new Set();
    for (const p of outflows) {
      for (const c of (p?.children || [])) {
        const n = normKey(c?.category);
        if (n) childNames.add(n);
      }
    }
    const filteredOutflows = outflows.filter((p) => {
      const hasKids = Array.isArray(p?.children) && p.children.length > 0;
      const dupChild = childNames.has(normKey(p?.category));
      // drop only if it's a parent with NO kids and it duplicates a child name
      return !(dupChild && !hasKids);
    });
    return { ...b, outflows: filteredOutflows };
  }, [budget]);


  // Collect only leaf rows (children == 0), preserving original refs
  const collectLeaves = (rows = [], bag = []) => {
    for (const r of rows) {
      const kids = Array.isArray(r?.children) ? r.children : [];
      if (kids.length) collectLeaves(kids, bag);
      else bag.push(r);
    }
    return bag;
  };

  // Find an existing LEAF named `cat` in the current schema.
  // Returns { leaf, bucket } where bucket ∈ {"inflow","fixed","variable"}.
  function resolveExistingCategory(budget, cat, txType) {
    const key = normKey(cat);

    // helper: collect leaves from a mixed tree (parents may have children)
    const leavesOf = (rows = []) => {
      const out = [];
      for (const r of rows) {
        const kids = Array.isArray(r?.children) ? r.children : [];
        if (kids.length > 0) {
          for (const c of kids) out.push({ ...c, __parentType: r?.type });
        } else {
          // parent with no children behaves like a leaf
          out.push({ ...r, __parentType: r?.type });
        }
      }
      return out;
    };

    if (txType === "inflow") {
      const inflowLeaves = leavesOf(budget?.inflows || []);
      const hit = inflowLeaves.find((r) => normKey(r?.category) === key);
      if (hit) return { leaf: hit, bucket: "inflow" };
      return null;
    }

    // expense: search all outflow leaves, infer bucket from leaf.type or parent’s type
    const outLeaves = leavesOf(budget?.outflows || []);
    const hit = outLeaves.find((r) => normKey(r?.category) === key);
    if (!hit) return null;
    const t = (hit?.type || hit?.__parentType || "variable").toLowerCase();
    return { leaf: hit, bucket: t === "fixed" ? "fixed" : "variable" };
  }



  // ---- Wrap inflows to auto-save (robust inflow detection) ----
  const handleAddTransaction = (t) => {
    if (!onAddTransaction) return;

    const tx = { ...t };
    const rawType = (tx.type || "").toString().toLowerCase();
    const amtNum = Number(tx.amount);

    // Normalize type
    if (rawType === "inflow" || rawType === "income") tx.type = "inflow";
    else if (rawType === "expense" || rawType === "outflow") tx.type = "expense";
    else tx.type = Number.isFinite(amtNum) && amtNum < 0 ? "expense" : "inflow";

    // Ensure ID
    if (!tx.id) tx.id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 🔎 Resolve the category to an existing leaf so no new row is created
    const hit = resolveExistingCategory(canonBudget, (tx.category || "").trim(), tx.type);

    if (hit?.leaf) {
      const routedName = hit.leaf.category || tx.category;
      tx.category = routedName;
      tx.meta = {
        ...(tx.meta || {}),
        // This flag is what the Budget tab reads to NEVER auto-create a duplicate
        budgetRoute: { bucket: hit.bucket, category: routedName }
      };
    }


    // Hand off and capture the committed ID
    const committedId = onAddTransaction(tx) ?? tx.id;

    // 🔁 Auto-save (only for inflows)
    if (tx.type === "inflow") {
      const pct = Math.max(0, Math.min(1, Number(settings?.autoSavePercent)));
      const fixed = Math.max(0, Number(settings?.autoSaveFixed));
      const inflowAmt = Math.max(0, Number(tx.amount) || 0);

      let saveAmt =
        inflowAmt * (Number.isFinite(pct) ? pct : 0) +
        (Number.isFinite(fixed) ? fixed : 0);

      if (Number.isFinite(saveAmt) && saveAmt > 0) {
        saveAmt = Math.min(saveAmt, inflowAmt);

        // Build the auto-outflow
        let outTx = {
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          date: tx.date || new Date().toISOString().slice(0, 10),
          type: "expense",
          category: (settings?.savingsLabel || "Savings").trim() || "Savings",
          amount: saveAmt, // keep positive; your expense handler should interpret as outflow
          note: tx.note ? `${tx.note} → auto-saved` : "Auto-saved from inflow",
          meta: {
            autoSaved: true,
            pairOf: committedId,
            sourceCategory: tx.category || null,
          },
        };

        // 🔎 Resolve Savings too, so it hits an existing leaf if present
        const outHit = resolveExistingCategory(canonBudget, outTx.category, "expense");

        if (outHit?.leaf) {
          outTx.category = outHit.leaf.category || outTx.category;
          outTx.meta = {
            ...(outTx.meta || {}),
            budgetRoute: { bucket: outHit.bucket, category: outHit.leaf.category },
          };
        }

        // Queue after the inflow is saved
        setTimeout(() => onAddTransaction(outTx), 0);
      }
    }

    return committedId;
  };


  // ---- Planned & actuals this period ----
  const plannedInflows = useMemo(() => (canonBudget?.inflows || []).reduce((s, i) => s + (Number(i.amount) || 0), 0), [canonBudget]);
  const plannedOutflows = useMemo(() => (canonBudget?.outflows || []).reduce((s, o) => s + (Number(o.amount) || 0), 0), [canonBudget]);

  const { actualInflows, actualOutflows } = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const t of txs) {
      const d = t.date || "";
      if (d >= startISO && d <= endISO) {
        const amt = Number(t.amount) || 0;
        if (t.type === "inflow") inflow += amt; else if (t.type === "expense") outflow += amt;
      }
    }
    return { actualInflows: inflow, actualOutflows: outflow };
  }, [txs, startISO, endISO]);

  const remainingPlannedInflows = Math.max(0, plannedInflows - actualInflows);
  const remainingPlannedOutflows = Math.max(0, plannedOutflows - actualOutflows);
  const projectedEndCash = cashOnHand + remainingPlannedInflows - remainingPlannedOutflows;

  // ---- Savings (new accrual model) ----
  const periodReserveTotal = (settings.reserveDaily || 0) * periodDays;
  const savingsReserved = settings.reserveOnMonthStart ? periodReserveTotal : (settings.reserveDaily || 0) * daysPassed;

  // ---- Suggested Daily ----
  const hasAnyBudget = ((budget?.inflows?.length || 0) + (budget?.outflows?.length || 0)) > 0;
  const suggestedDaily = useMemo(() => {
    const simple = cashOnHand / daysLeft;
    if (!hasAnyBudget) return Math.max(0, simple);
    const bufferPct = settings.suggestedDailyBufferPct ?? 0.10;
    const buffered = (projectedEndCash * (1 - bufferPct)) / daysLeft;
    return Math.max(0, buffered);
  }, [cashOnHand, daysLeft, hasAnyBudget, projectedEndCash, settings.suggestedDailyBufferPct]);

  /* =========================
     VARIABLE SPEND WARNINGS
     ========================= */
    const variableBudgetTopLevel = useMemo(() => {
      const out = new Map(); // key: normalized category -> { category, budgeted }
      (canonBudget?.outflows || []).forEach((o) => {
        if (!o) return;
        if (!isTopLevel(o)) return;
        if (!isVariableOutflow(o)) return;
        const cat = normCat(o.category);
        if (!cat) return;
        const amt = pickBudgeted(o);
        const prev = out.get(cat);
        out.set(cat, { category: cat, budgeted: (prev?.budgeted || 0) + amt });
      });
      return out;
    }, [budget]);

  const spendByCategoryThisPeriod = useMemo(() => {
    const m = new Map();
    for (const t of txs) {
      if (!t || t.type !== "expense") continue;
      const d = t.date || "";
      if (!(d >= startISO && d <= endISO)) continue;
      const cat = normCat(t.category);
      if (!cat) continue;
      const amt = Math.max(0, Number(t.amount) || 0);
      m.set(cat, (m.get(cat) || 0) + amt);
    }
    return m;
  }, [txs, startISO, endISO]);

  const warnings = useMemo(() => {
    const arr = [];
    if (daysPassed <= 0) return arr; // before period starts, nothing to project

    for (const { category, budgeted } of variableBudgetTopLevel.values()) {
      const spent = spendByCategoryThisPeriod.get(category) || 0;
      const allowedDaily = budgeted / Math.max(1, periodDays);

      // Budget of 0 means any spend risks overshoot
      if (budgeted <= 0 && spent > 0) {
        arr.push({
          category,
          budgeted,
          spent,
          projected: Infinity,
          overBy: spent,
          canRecover: false,
          waitDays: null,
        });
        continue;
      }

      // Current pace projection
      const dailyRate = spent / Math.max(1, daysPassed);
      const projected = dailyRate * periodDays;

      if (projected > budgeted + 0.005) {
        // How many zero-spend "cooldown" days to bring cumulative average down to allowed?
        // Solve w >= spent/allowedDaily - daysPassed
        let wait = Math.ceil(Math.max(0, spent / Math.max(1e-9, allowedDaily) - daysPassed));
        const remainingDays = Math.max(0, periodDays - daysPassed);
        const canRecover = wait <= remainingDays;

        // If math says 0 but projection says over, force at least 1 day
        if (wait === 0) wait = 1;

        arr.push({
          category,
          budgeted,
          spent,
          projected,
          overBy: projected - budgeted,
          canRecover,
          waitDays: canRecover ? wait : null,
        });
      }
    }

    // Sort most urgent first (largest projected overage)
    arr.sort((a, b) => (b.overBy || 0) - (a.overBy || 0));
    return arr;
  }, [variableBudgetTopLevel, spendByCategoryThisPeriod, daysPassed, periodDays]);

  // ---- UI handlers ----
  const openSettings = () => setShowSettings(true);
  const saveSettingsAndRefresh = (vals) => { saveSettings(vals); setSettings(vals); };

  function promptNumber(title, defaultValue = "") {
    const raw = window.prompt(title, defaultValue);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function investNow() {
    const state = accrueInvestMonthly(readInvestState(), new Date());
    const amt = promptNumber("Amount to INVEST:");
    if (amt === null) return;

    const todayISO = new Date().toISOString().slice(0, 10);
    const after = {
      ...state,
      balance: state.balance + amt,
      principal: state.principal + amt,
      lastAccruedISO: todayISO,
    };
    writeInvestState(after);
    setInvest(after);

    onAddTransaction?.({
      date: todayISO,
      type: "expense",
      category: "Investments",
      amount: amt,
      note: "Invested",
      meta: { investment: true, action: "invest" },
    });
  }

  function withdrawNow() {
    const state = accrueInvestMonthly(readInvestState(), new Date());
    const amt = promptNumber(`Amount to WITHDRAW (available: ${currency(state.balance)})`);
    if (amt === null) return;

    const take = Math.min(amt, state.balance);
    if (take <= 0) return;

    const todayISO = new Date().toISOString().slice(0, 10);
    const newBal = state.balance - take;
    const newPrincipal = Math.max(0, state.principal - take);

    const after = { ...state, balance: newBal, principal: newPrincipal, lastAccruedISO: todayISO };
    writeInvestState(after);
    setInvest(after);

    onAddTransaction?.({
      date: todayISO,
      type: "inflow",
      category: "Investments",
      amount: take,
      note: "Withdrawal",
      meta: { investment: true, action: "withdraw" },
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl shadow-sm border border-emerald-200 bg-gradient-to-b from-emerald-300 to-emerald-500">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute -bottom-16 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />

        <button
          type="button"
          data-noswipe
          onPointerUp={(e)=>{e.preventDefault();e.stopPropagation();openSettings();}}
          aria-label="Savings & Daily settings"
          title="Savings & Daily settings"
          className="absolute right-3 top-3 rounded-full p-2 hover:bg黑/5 touch-manipulation"

        >
          <Gear size={18} />
        </button>

        <div className="relative z-10 px-5 py-6 md:px-7 md:py-8">
          
          {/* Cash on Hand */}
          <div className="mt-3 text-sm text-emerald-950/90">Cash on Hand</div>
          <div className={`mt-1 text-4xl md:text-5xl font-extrabold leading-tight drop-shadow-sm ${cashOnHand < 0 ? "text-red-700" : "text-emerald-900"}`} aria-live="polite">
            {currency(cashOnHand)}
          </div>

          <div className="mt-1 text-xs text-emerald-950/70">through <span className="font-medium">{endISO}</span></div>

          <div className="mt-4">
            <button
              data-noswipe
              onPointerUp={(e)=>{e.preventDefault();e.stopPropagation();setShowMoneyTime(true);}}
              type="button"
              className="inline-flex items-center gap-2 bg-yellow-300 hover:bg-yellow-200 active:bg-yellow-400 px-4 py-2 rounded-xl font-semibold touch-manipulation"

            >
              <span>💰</span><span>MONEY TIME!</span><span className="text-lg">✨</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==== Variable Spend Warnings (replaces Recent Transactions) ==== */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-amber-900">Variable Spend Warnings</div>
          <div className="text-xs text-amber-800/90">Period: {startISO} → {endISO}</div>
        </div>

        {daysPassed <= 0 ? (
          <div className="px-4 pb-4 text-sm text-amber-800">This period hasn’t started yet—no pacing data.</div>
        ) : warnings.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-emerald-800">All variable categories are on pace. ✅</div>
        ) : (
          <ul className="divide-y divide-amber-200">
            {warnings.map((w) => (
              <li key={w.category} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-amber-900 truncate">{w.category}</div>
                    <div className="text-xs text-amber-900/80">
                      On pace for <span className="font-semibold">${Number.isFinite(w.projected) ? w.projected.toFixed(2) : "∞"}</span>
                      {" "}(budget ${w.budgeted.toFixed(2)}; over by ${Number.isFinite(w.overBy) ? w.overBy.toFixed(2) : "∞"}).
                    </div>
                  </div>
                  <div className="text-xs shrink-0">
                    {w.canRecover ? (
                      <span className="inline-flex items-center rounded-full bg-amber-200/80 px-2 py-1 font-semibold text-amber-900">
                        Wait <span className="mx-1">{w.waitDays}</span> day{w.waitDays === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-600 text-white px-2 py-1 font-semibold">
                        STOP SPENDING
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modals */}
      {showMoneyTime && (
        <MoneyTimeModal
          open={showMoneyTime}
          onClose={() => setShowMoneyTime(false)}
          onSave={handleAddTransaction}
          categories={categories}
        />
      )}
      {showSettings && (
        <SavingsSettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          value={settings}
          onSave={saveSettingsAndRefresh}
          onAfterImport={() => window.location.reload()}
        />
      )}
    </div>
  );
}
