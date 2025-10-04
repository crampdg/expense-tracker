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
  APR: "investAPR",                  // annual rate as decimal (0.04 = 4%)
  BAL: "investBalance",              // current compounded balance
  PRINC: "investPrincipal",          // net principal currently invested
  LAST: "investLastAccruedISO",      // last monthly accrual date (ISO)
};

// Read APR from storage (default 4%)
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

// Whole-month difference: if day-of-month hasn’t reached yet, subtract 1
function monthsBetween(fromISO, toISO) {
  if (!fromISO) return 0;
  const a = new Date(fromISO), b = new Date(toISO);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

// Apply monthly compounding for all full months since last accrual
function accrueInvestMonthly(state, today = new Date()) {
  const toISO = today.toISOString().slice(0, 10);
  const months = monthsBetween(state.lastAccruedISO || toISO, toISO);
  if (months <= 0) return state;

  const apr = readInvestAPR();                     // use latest saved APR
  const monthly = apr / 12;
  const factor = Math.pow(1 + monthly, months);
  const newBal = (Number(state.balance) || 0) * factor;

  const updated = { ...state, balance: newBal, lastAccruedISO: toISO };
  writeInvestState(updated);
  return updated;
}

// ---- Rebuild Investments from transactions (single source of truth) ----
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

    // Prefer explicit meta action; otherwise infer from type
    const action = (meta.action || "").toLowerCase();
    let kind = null; // 'invest' | 'withdraw'
    if (action === "invest") kind = "invest";
    else if (action === "withdraw") kind = "withdraw";
    else if (t.type === "expense") kind = "invest";      // expense to Investments = invest
    else if (t.type === "inflow") kind = "withdraw";     // inflow from Investments = withdraw

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
function periodSpan(start, end){ // inclusive days
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

export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(readSettings());
  // Investments local state
  const [invest, setInvest] = useState(() => accrueInvestMonthly(readInvestState()));

  // UI: collapse/expand Investments
  const [isInvestOpen, setIsInvestOpen] = useState(() => {
    try {
      const v = localStorage.getItem("investIsOpen");
      return v ? v === "true" : false; // collapsed by default
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try { localStorage.setItem("investIsOpen", String(isInvestOpen)); } catch {}
  }, [isInvestOpen]);

  // ---- Inputs (MOVED ABOVE EFFECTS THAT DEPEND ON txs) ----
  const txs = Array.isArray(transactions) ? transactions : [];
  const inflowCats = (budget?.inflows || []).map((i) => i.category);
  const outflowCats = (budget?.outflows || []).map((o) => o.category);
  const categories = Array.from(new Set([...inflowCats, ...outflowCats])).filter(Boolean);

  useEffect(() => {
    const tick = setInterval(() => {
      const updated = accrueInvestMonthly(readInvestState(), new Date());
      // Only set state if something changed materially (avoid extra renders)
      if (Math.abs(updated.balance - invest.balance) > 0.005 || updated.lastAccruedISO !== invest.lastAccruedISO) {
        setInvest(updated);
      }
    }, 60 * 1000); // check monthly rollover roughly; cheap
    return () => clearInterval(tick);
  }, [invest.balance, invest.lastAccruedISO]);

  // Whenever the master transactions list changes (e.g., deletions in Detailed),
  // rebuild principal/current purely from transactions so there's no drift.
  useEffect(() => {
    const rebuilt = rebuildInvestFromTransactions(readInvestAPR(), txs, new Date());
    // Only persist/state-update if something materially changed
    const changed =
      Math.abs(rebuilt.balance - invest.balance) > 0.005 ||
      Math.abs(rebuilt.principal - invest.principal) > 0.005 ||
      rebuilt.lastAccruedISO !== invest.lastAccruedISO;

    if (changed) {
      writeInvestState(rebuilt);
      setInvest(rebuilt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs]); // key: reacts to deletes/edits/adds in Detailed

  // ---- Period window ----
  const { startISO, endISO, daysLeft } = useMemo(() => {
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
    return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10), daysLeft: left };
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

  // ---- Wrap inflows to auto-save (robust inflow detection) ----
  const handleAddTransaction = (t) => {
    if (!onAddTransaction) return;

    const tx = { ...t };

    // Normalize type robustly: force inflow when amount > 0 (even if UI said "expense")
    const rawType = (tx.type || "").toString().toLowerCase();
    const amtNum = Number(tx.amount);

    // Respect the UI selection when it’s valid.
    // Only infer when the type is unknown.
    if (rawType === "inflow" || rawType === "income") {
      tx.type = "inflow";
    } else if (rawType === "expense" || rawType === "outflow") {
      tx.type = "expense";
    } else {
      // Fallback inference by sign (optional)
      tx.type = Number.isFinite(amtNum) && amtNum < 0 ? "expense" : "inflow";
    }

    // Ensure TX has an id so paired record can reference it even if the store doesn't return one
    if (!tx.id) tx.id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1) Commit the original transaction first
    const committedId = onAddTransaction(tx) ?? tx.id;

    // 2) If this is an inflow, compute and add the Savings outflow on next tick
    if (tx.type === "inflow") {
      const pct = Math.max(0, Math.min(1, Number(settings.autoSavePercent)));
      const fixed = Math.max(0, Number(settings.autoSaveFixed));
      const inflowAmt = Math.max(0, Number(tx.amount) || 0);

      let saveAmt = inflowAmt * (Number.isFinite(pct) ? pct : 0) + (Number.isFinite(fixed) ? fixed : 0);
      if (Number.isFinite(saveAmt) && saveAmt > 0) {
        saveAmt = Math.min(saveAmt, inflowAmt);

        const outTx = {
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          date: tx.date || new Date().toISOString().slice(0, 10),
          type: "expense",
          category: (settings.savingsLabel || "Savings").trim() || "Savings",
          amount: saveAmt,
          note: tx.note ? `${tx.note} → auto-saved` : "Auto-saved from inflow",
          meta: { autoSaved: true, pairOf: committedId, sourceCategory: tx.category || null },
        };

        setTimeout(() => onAddTransaction(outTx), 0);
      }
    }

    return committedId;
  };

  // ---- Planned & actuals this period ----
  const plannedInflows = useMemo(() => (budget?.inflows || []).reduce((s, i) => s + (Number(i.amount) || 0), 0), [budget]);
  const plannedOutflows = useMemo(() => (budget?.outflows || []).reduce((s, o) => s + (Number(o.amount) || 0), 0), [budget]);

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
  const periodDays = periodSpan(startISO, endISO);
  const accruedDays = daysSoFar(startISO, endISO);
  const periodReserveTotal = (settings.reserveDaily || 0) * periodDays;
  const savingsReserved = settings.reserveOnMonthStart ? periodReserveTotal : (settings.reserveDaily || 0) * accruedDays;

  // ---- Suggested Daily ----
  const hasAnyBudget = ((budget?.inflows?.length || 0) + (budget?.outflows?.length || 0)) > 0;
  const suggestedDaily = useMemo(() => {
    const simple = cashOnHand / daysLeft;
    if (!hasAnyBudget) return Math.max(0, simple);
    const bufferPct = settings.suggestedDailyBufferPct ?? 0.10;
    const buffered = (projectedEndCash * (1 - bufferPct)) / daysLeft;
    return Math.max(0, buffered);
  }, [cashOnHand, daysLeft, hasAnyBudget, projectedEndCash, settings.suggestedDailyBufferPct]);

  // ---- Recent list ----
  const recentTransactions = useMemo(() => [...txs].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,3), [txs]);

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
    // Accrue interest first so we add on top of up-to-date balance
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

    // Record an expense transaction to Investments
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

    // Reduce principal first; remainder comes from earnings
    const newPrincipal = Math.max(0, state.principal - take);

    const after = { ...state, balance: newBal, principal: newPrincipal, lastAccruedISO: todayISO };
    writeInvestState(after);
    setInvest(after);

    // Record an inflow transaction from Investments
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
          onClick={openSettings}
          aria-label="Savings & Daily settings"
          title="Savings & Daily settings"
          className="absolute top-2 right-2 z-20 p-2 rounded-full bg-white/40 hover:bg-white/60 active:bg-white/50 text-emerald-900 shadow-sm"
        >
          <Gear size={18} />
        </button>

        <div className="relative z-10 px-5 py-6 md:px-7 md:py-8">
          {/* INVESTMENTS MOVED TO SAVINGS TAB */}
          {false && (
          <div className="rounded-2xl border border-emerald-300/60 bg-white/80 backdrop-blur px-4 py-3 mt-1">
            {/* Header row: label + chevron (APR shows only when open) */}
            <button
              type="button"
              onClick={() => setIsInvestOpen((v) => !v)}
              aria-expanded={isInvestOpen}
              aria-controls="investments-panel"
              className="w-full flex items-center justify-between"
            >
              <div className="text-sm font-semibold text-emerald-900">Investments</div>
              <div className="flex items-center gap-2">
                {isInvestOpen && (
                  <div className="text-xs text-emerald-800/80">
                    APR {(readInvestAPR() * 100).toFixed(2)}%
                  </div>
                )}
                <ChevronDown className={`h-4 w-4 transition-transform ${isInvestOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {/* Collapsible panel */}
            <div id="investments-panel" className={isInvestOpen ? "mt-2 space-y-3" : "hidden"}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="text-[11px] text-emerald-900/80">Principal invested</div>
                  <div className="text-base font-semibold text-emerald-900">{currency(invest.principal)}</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="text-[11px] text-emerald-900/80">Current balance</div>
                  <div className="text-base font-semibold text-emerald-900">{currency(invest.balance)}</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="text-[11px] text-emerald-900/80">Amount earned</div>
                  <div className="text-base font-semibold text-emerald-900">{currency(invest.balance - invest.principal)}</div>
                </div>
              </div>

              {/* 20-year forecast */}
              <div className="text-xs text-emerald-900/80">
                In 20 years (forecast):{" "}
                <span className="font-semibold text-emerald-900">
                  {currency(invest.balance * Math.pow(1 + readInvestAPR() / 12, 12 * 20))}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={investNow}
                  className="px-3 py-1.5 text-sm rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  INVEST!
                </button>
                <button
                  type="button"
                  onClick={withdrawNow}
                  className="px-3 py-1.5 text-sm rounded-full bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-semibold"
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>
          )}
          
          {/* Cash on Hand */}
          <div className="mt-3 text-sm text-emerald-950/90">Cash on Hand</div>
          <div className={`mt-1 text-4xl md:text-5xl font-extrabold leading-tight drop-shadow-sm ${cashOnHand < 0 ? "text-red-700" : "text-emerald-900"}`} aria-live="polite">
            {currency(cashOnHand)}
          </div>

          {/* Suggested Daily */}
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-sm text-emerald-950/80" title={((budget?.inflows?.length || 0)+(budget?.outflows?.length || 0))>0 ? "After planned bills, savings pot & buffer" : "Cash ÷ days left"}>
              Suggested Daily
            </div>
            <div className={`text-2xl font-bold ${amtClass(suggestedDaily)}`}>{currency(suggestedDaily)}</div>
          </div>

          <div className="mt-1 text-xs text-emerald-950/70">through <span className="font-medium">{endISO}</span></div>

          <div className="mt-4">
            <button
              onClick={() => setShowMoneyTime(true)}
              type="button"
              className="inline-flex items-center gap-2 bg-yellow-300 hover:bg-yellow-200 active:bg-yellow-300
                         text-yellow-900 font-extrabold tracking-wide px-5 py-2.5 rounded-full shadow
                         border border-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
            >
              <span>💰</span><span>MONEY TIME!</span><span className="text-lg">✨</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">Recent Transactions</div>
          <div className="text-xs text-gray-500">Period: {startISO} → {endISO}</div>
        </div>
        {recentTransactions.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {recentTransactions.map((t, idx) => {
              const amt = Number(t.amount) || 0;
              const isExpense = t.type === "expense";
              return (
                <li key={t.id ?? `${t.category}-${t.date}-${idx}`} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${isExpense ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} aria-hidden="true">
                        {isExpense ? "–" : "+"}
                      </span>
                      <span className="truncate text-sm font-medium">{t.category || "Uncategorized"}</span>
                    </div>
                    <div className={`text-sm font-semibold tabular-nums ${isExpense ? "text-red-600" : "text-emerald-700"}`}>
                      {isExpense ? "-" : "+"}{currency(amt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-gray-500">No recent spends</div>
        )}
      </div>

      {/* Modals */}
      {showMoneyTime && (
        <MoneyTimeModal
          open={showMoneyTime}
          onClose={() => setShowMoneyTime(false)}
          onSave={onAddTransaction}
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
