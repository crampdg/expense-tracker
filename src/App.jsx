import BottomNav from './components/ui/BottomNav.jsx'
import { useState, useMemo, useEffect } from 'react'
import WalletTab from './components/WalletTab.jsx'
import BudgetTab from './components/BudgetTab.jsx'
import SummaryTab from './components/SummaryTab.jsx'
import DetailedTab from './components/DetailedTab.jsx'
import usePersistentState from './hooks/usePersistentState.js'
import { calcPeriodEndDate, daysUntil } from './utils/period.js'
import uid from './utils/uid.js'

const DEFAULT_BUDGETS = {
  inflows: [
    { category: 'Allowance', amount: 400 },
  ],
  outflows: [
    { category: 'Food', amount: 200 },
    { category: 'Transport', amount: 50 },
    { category: 'Entertainment', amount: 100 },
    { category: 'Savings', amount: 50 },
  ],
}


function isNewBudgetsShape(b) {
  return b && typeof b === 'object' && Array.isArray(b.inflows) && Array.isArray(b.outflows)
}

function normalizeBudgets(b) {
  if (isNewBudgetsShape(b)) return b
  // legacy shape like { Food: 400, Transport: 200, Savings: 600 }
  const entries = Object.entries(b || {}).filter(([_, v]) => typeof v === 'number')
  const outflows = entries.length
    ? entries.map(([category, amount]) => ({ category, amount }))
    : DEFAULT_BUDGETS.outflows
  return { inflows: DEFAULT_BUDGETS.inflows, outflows }
}

export default function App() {
  const [active, setActive] = useState('wallet')

  const [transactions, setTransactions] = usePersistentState('transactions', [])

  const balance = useMemo(() => {
    return transactions.reduce((sum, t) => {
      if (t.type === 'inflow') return sum + Number(t.amount || 0)
      if (t.type === 'expense') return sum - Number(t.amount || 0)
      return sum
    }, 0)
  }, [transactions])


  const [period, setPeriod] = usePersistentState('period', { type: 'Monthly', day: 4 })

  // Read raw budgets from storage, then normalize/migrate
  const [storedBudgets, setStoredBudgets] = usePersistentState('budgets', DEFAULT_BUDGETS)
  const budgets = useMemo(() => normalizeBudgets(storedBudgets), [storedBudgets])

  // Write back migrated budgets so future loads are clean
  useEffect(() => {
    if (!isNewBudgetsShape(storedBudgets)) {
      setStoredBudgets(budgets)
    }
  }, [storedBudgets, budgets, setStoredBudgets])


  const today = new Date()
  const periodEnd = useMemo(() => calcPeriodEndDate(today, period), [today, period])
  const daysLeft   = useMemo(() => daysUntil(today, periodEnd),     [today, periodEnd])

  // suggestions based on budgeted outflows
  const totalOutflowBudget = useMemo(
    () => budgets.outflows.reduce((s, o) => s + Number(o.amount || 0), 0),
    [budgets]
  )
  const spentSoFar = useMemo(
    () => transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0),
    [transactions]
  )
  const remainingOutflow = Math.max(0, totalOutflowBudget - spentSoFar)
  const dailySuggested   = daysLeft > 0 ? (remainingOutflow / daysLeft) : 0

  const perCategoryDaily = useMemo(() => {
    const map = {}
    for (const o of budgets.outflows) {
      const spent = transactions
        .filter(t => t.type === 'expense' && t.category === o.category)
        .reduce((s, t) => s + Number(t.amount || 0), 0)
      const rem = Math.max(0, (Number(o.amount || 0) - spent))
      map[o.category] = daysLeft > 0 ? (rem / daysLeft) : 0
    }
    return map
  }, [budgets, transactions, daysLeft])

  // claim from budget
  const claimBudgetItem = (section, index, itemOverride) => {
    const item = itemOverride ?? (budgets[section] && budgets[section][index])
    if (!item) return
    const tx = {
      id: uid(),
      type: section === 'inflows' ? 'inflow' : 'expense',
      amount: Number(item.amount || 0),
      date: new Date().toISOString().slice(0, 10),
      category: item.category,
      description: section === 'inflows' ? 'Claimed inflow' : 'Claimed outflow',
    }
    setTransactions(prev => [tx, ...prev])
  }

  const toTitleCase = (str) =>
    str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())

  const handleMoneyTime = (form) => {
    const cleanCategory = form.category
      ? toTitleCase(form.category.trim())
      : (form.type === 'inflow' ? 'Inflow' : 'Other')

    const tx = {
      id: uid(),
      type: form.type,
      amount: Number(form.amount || 0),
      date: form.date,
      category: cleanCategory,
      description: form.description || (form.type === 'inflow' ? 'Manual inflow' : 'Manual outflow'),
    }

    setTransactions(prev => [tx, ...prev])

    // Auto-add new category to budgets if missing
    setStoredBudgets(prev => {
      const exists = [...prev.inflows, ...prev.outflows].some(
        i => i.category.toLowerCase() === cleanCategory.toLowerCase()
      )
      if (exists) return prev

      const next = { ...prev }
      if (tx.type === 'inflow') {
        next.inflows = [...prev.inflows, { category: cleanCategory, amount: 0 }]
      } else {
        next.outflows = [...prev.outflows, { category: cleanCategory, amount: 0 }]
      }
      return next
    })
  }





  // add expense from Spend!
  const addExpense = (payload) => {
    const tx = { id: uid(), type: 'expense', ...payload }
    setTransactions(prev => [tx, ...prev])
  }

  // edit/delete transactions and keep wallet in sync
  const editTransaction = (id, updated) => {
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === id)
      if (idx === -1) return prev
      const old = prev[idx]
      const oldSigned = old.type === 'inflow' ? Number(old.amount) : -Number(old.amount)
      const newSigned = updated.type === 'inflow' ? Number(updated.amount) : -Number(updated.amount)
      const delta = newSigned - oldSigned
      const next = [...prev]
      next[idx] = { ...old, ...updated }
      return next
    })
  }

  const deleteTransaction = (id) => {
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === id)
      if (idx === -1) return prev
      const tx = prev[idx]
      const signed = tx.type === 'inflow' ? Number(tx.amount) : -Number(tx.amount)
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }

  // Example: daily suggested spend calculation
  const suggestedSpend = useMemo(() => {
    if (!budgets || !period) return 0

    const totalBudgetedOutflows = budgets.outflows.reduce((s, o) => s + Number(o.amount || 0), 0)
    const totalBudgetedInflows  = budgets.inflows.reduce((s, i) => s + Number(i.amount || 0), 0)

    // Already spent
    const spentSoFar = transactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount || 0), 0)

    // Already received inflows
    const inflowsSoFar = transactions
      .filter(t => t.type === 'inflow')
      .reduce((s, t) => s + Number(t.amount || 0), 0)

    // Budget limits
    const remainingBudget = Math.max(0, totalBudgetedOutflows - spentSoFar)

    // Available funds (cannot spend more than actual inflows)
    const availableFunds = Math.max(0, inflowsSoFar - spentSoFar)

    // Daily allowance = min(remaining budget, available funds) / days left
    const today = new Date()
    const end = new Date(periodEnd)
    const daysLeft = Math.max(1, Math.ceil((end - today) / (1000 * 60 * 60 * 24)))

    return Math.min(remainingBudget, availableFunds) / daysLeft
  }, [budgets, period, periodEnd, transactions])



  return (
    <div className="min-h-screen flex">
      <BottomNav active={active} setActive={setActive} />

      <main className="flex-1 p-3 md:p-6 grid gap-4 md:gap-6">
        {active === 'wallet' && (
        <WalletTab
          balance={balance}
          suggestedSpend={suggestedSpend}
          transactions={transactions}
          onMoneyTime={handleMoneyTime}
          budgets={budgets}
          />
         )}
        {active === 'budget' && (
          <BudgetTab
            period={period}
            setPeriod={setPeriod}
            periodEnd={periodEnd}
            budgets={budgets}
            setBudgets={setStoredBudgets}
            onClaim={claimBudgetItem}
            transactions={transactions}
          />
        )}
        {active === 'summary' && (
          <SummaryTab transactions={transactions} />
        )}
        {active === 'detailed' && (
          <DetailedTab
            transactions={transactions}
            editTransaction={editTransaction}
            deleteTransaction={deleteTransaction}
          />
        )}        
      </main>
    </div>
  )
}
