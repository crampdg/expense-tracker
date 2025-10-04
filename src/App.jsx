import walletLogo from "./assets/ui/wallet-logo.png";
import { calcPeriodEnd, getAnchoredPeriodStart } from "./utils/periodUtils"
import PeriodSettings from "./components/PeriodSettings"
import WalletTab from './components/WalletTab.jsx'
import BudgetTab from './components/BudgetTab.jsx'
import DetailedTab from './components/DetailedTab.jsx'
import SummaryTab from './components/SummaryTab.jsx'
import SpendModal from './components/modals/SpendModal.jsx'
import MoneyTimeModal from './components/modals/MoneyTimeModal.jsx'
import BudgetEditModal from './components/modals/BudgetEditModal.jsx'
import TransactionEditModal from './components/modals/TransactionEditModal.jsx'
import BottomNav from './components/ui/BottomNav.jsx'
import { useState, useMemo, useEffect, useRef } from 'react'
import SwipeTabs from './components/ui/SwipeTabs.jsx';



function App() {
  const [activeTab, setActiveTab] = useState('wallet')
  const [showSpendModal, setShowSpendModal] = useState(false)
  const [showMoneyTimeModal, setShowMoneyTimeModal] = useState(false)
  const [showBudgetEditModal, setShowBudgetEditModal] = useState(false)
  const [showTransactionEditModal, setShowTransactionEditModal] = useState(false)
  const [periodOffset, setPeriodOffset] = useState(0)

  // ---- Global Undo Toast ----
  const [toast, setToast] = useState(null) // { message, onUndo?: fn }
  const toastTimerRef = useRef(null)
  function showUndoToast(message, onUndo) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, onUndo })
    toastTimerRef.current = setTimeout(() => setToast(null), 6000)
  }


  
  const [transactions, setTransactions] = useState(() => {
    try {
      const saved = localStorage.getItem("transactions")
      return saved ? JSON.parse(saved) : []
    } catch {
      localStorage.removeItem("transactions")
      return []
    }
  })

  const [budget, setBudget] = useState(() => {
    try {
      const saved = localStorage.getItem("budget")
      return saved ? JSON.parse(saved) : { inflows: [], outflows: [] }
    } catch {
      localStorage.removeItem("budget")
      return { inflows: [], outflows: [] }
    }
  })

  // Replace these old states:
  // const [period, setPeriod] = useState(...)
  // const [periodEnd, setPeriodEnd] = useState(...)

  const [periodConfig, setPeriodConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("periodConfig")
      return saved ? JSON.parse(saved) : { type: "Monthly", anchorDate: new Date().toISOString().slice(0, 10) }
    } catch {
      localStorage.removeItem("periodConfig")
      return { type: "Monthly", anchorDate: new Date().toISOString().slice(0, 10) }
    }
  })
 
  const periodStart = useMemo(() => {
    return getAnchoredPeriodStart(
      periodConfig.type,
      periodConfig.anchorDate,
      new Date(),    // this determines which anchored period is “current”
      periodOffset
    )
  }, [periodConfig, periodOffset])

  const periodEnd = useMemo(() => {
    return calcPeriodEnd(periodConfig.type, periodStart)
  }, [periodConfig.type, periodStart])


  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [selectedBudgetCategory, setSelectedBudgetCategory] = useState(null)

  const today = useMemo(() => new Date(), [])


  useEffect(() => {
    localStorage.setItem("transactions", JSON.stringify(transactions))
  }, [transactions])

  useEffect(() => {
    localStorage.setItem("budget", JSON.stringify(budget))
  }, [budget])

  // persisting periods
  useEffect(() => {
    localStorage.setItem("periodConfig", JSON.stringify(periodConfig))
  }, [periodConfig])




  // Suggested spend: divide *remaining* outflow budget across days in month
  const suggestedSpend = useMemo(() => {
    const totalBudget =
      (budget?.outflows || []).reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0)

    if (totalBudget === 0) return 0

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const daysInMonth =
      (endOfMonth - startOfMonth) / (1000 * 60 * 60 * 24) + 1

    return totalBudget / daysInMonth
  }, [budget?.outflows, today])


  // Handlers
  const handleAddTransaction = (transaction) => {
    const txWithId = { id: Date.now(), ...transaction }
    setTransactions([...transactions, txWithId])

    // Auto-add category into budget if missing
    if (transaction.type === 'inflow') {
      if (!budget.inflows.some(i => i.category === transaction.category)) {
        setBudget(prev => ({
          ...prev,
          inflows: [...prev.inflows, { category: transaction.category, amount: 0 }]
        }))
      }
    } else if (transaction.type === 'expense') {
      if (!budget.outflows.some(o => o.category === transaction.category)) {
        setBudget(prev => ({
          ...prev,
          outflows: [...prev.outflows, { category: transaction.category, amount: 0 }]
        }))
      }
    }

    return txWithId
  }



  const handleEditTransaction = (updatedTransaction) => {
    setTransactions(prev =>
      prev.map(t =>
        t.id === updatedTransaction.id
          ? { ...t, ...updatedTransaction, id: t.id } // ✅ always keep id
          : t
      )
    )
  }



  const handleDeleteTransaction = (id) => {
    setTransactions(transactions.filter(t => t.id !== id))
  }

  const handleAddBudget = (section, category) => {
    setBudget(prev => ({
      ...prev,
      [section]: [...prev[section], category]
    }))
  }

  const handleEditBudget = (section, index, updatedCategory) => {
    setBudget(prev => {
      const updated = [...prev[section]]
      updated[index] = updatedCategory
      return { ...prev, [section]: updated }
    })
  }

  const handleDeleteBudget = (section, index) => {
    setBudget(prev => {
      const updated = prev[section].filter((_, i) => i !== index)
      return { ...prev, [section]: updated }
    })
  }

  // -- Bulk rename matching transactions by section/name/scope --------------
  // Called from BudgetTab when a row's title is renamed with scope A/B/C
  // O(n) over transactions; only sets state if something actually changed.
  const onBulkRenameTransactions = ({
    section,          // 'inflows' | 'outflows'
    oldName,          // previous row name (as typed)
    newName,          // new row name (as typed)
    scope,            // 'all' | 'period'
    startISO,         // inclusive 'YYYY-MM-DD' for current period
    endISO            // inclusive 'YYYY-MM-DD' for current period
  }) => {
    const norm = (s) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const matchType = section === 'inflows' ? 'inflow' : 'expense';
    const oldKey = norm(oldName);
    const newLabel = (newName ?? '').trim();
    if (!newLabel || !oldKey) return;

    let changed = false;
    setTransactions(prev => {
      const next = prev.map(tx => {
        // Section/type must match and category must normalize-equal
        if (tx.type !== matchType) return tx;
        if (!tx.category || norm(tx.category) !== oldKey) return tx;

        // Scope 'period' limits by date (inclusive)
        if (scope === 'period') {
          const d = tx.date;
          if (!(d >= startISO && d <= endISO)) return tx;
        }

        // If already exactly the target label (same casing), skip
        if (tx.category === newLabel) return tx;

        changed = true;
        return { ...tx, category: newLabel };
      });
      // Only commit if a change occurred (avoids unnecessary re-renders)
      return changed ? next : prev;
    });
  };


  const handleClaimBudget = (section, index, { category, amount }) => {
    const tx = {
      type: section === 'inflows' ? 'inflow' : 'expense',
      category: (category ?? '').trim() || 'Untitled',
      amount: Number(amount) || 0,
      date: new Date().toISOString().slice(0, 10),
    }

    const newTx = handleAddTransaction(tx)
    setActiveTab('wallet') // jump to Wallet so it’s visible immediately

    showUndoToast(`Added to Wallet • ${tx.category}`, () => {
      // remove the just-added tx
      if (newTx?.id != null) {
        handleDeleteTransaction(newTx.id)
      }
    })
  }



  return (
    <div className="flex flex-col h-screen">
      <SwipeTabs
        className="flex-1 overflow-y-auto p-4 pb-28"
        tabs={["wallet","budget","summary","detailed"]}
        active={activeTab}
        onChange={setActiveTab}
        edge={0}        // swipe can start anywhere, not just the edges
        threshold={56}  // ~56px horizontal move to trigger
      >


        {activeTab === 'wallet' && (
          <WalletTab
            budget={budget}
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetTab
            period={periodConfig}
            setPeriod={setPeriodConfig}
            budgets={budget}
            setBudgets={setBudget}
            onClaim={handleClaimBudget}
            transactions={transactions}
            periodOffset={periodOffset}
            setPeriodOffset={setPeriodOffset}
            onBulkRenameTransactions={onBulkRenameTransactions}
            showUndoToast={showUndoToast}

          />
        )}

        {activeTab === 'detailed' && (
          <DetailedTab
            transactions={transactions}
            budget={budget}
            editTransaction={handleEditTransaction}     // ✅ pass edit handler
            deleteTransaction={handleDeleteTransaction} // ✅ pass delete handler
          />
        )}

        {activeTab === 'summary' && (
          <SummaryTab
            transactions={transactions}
            budget={budget}
            // Pass the SAME period + offset used by BudgetTab so both tabs stay in sync
            period={periodConfig}
            periodOffset={periodOffset}
          />
        )}


        {activeTab === 'settings' && (
          <PeriodSettings periodConfig={periodConfig} setPeriodConfig={setPeriodConfig} />
        )}


      </SwipeTabs>

      {/* Undo Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-full px-4 py-2 shadow-lg">
            <span className="text-sm">{toast.message}</span>
            {toast.onUndo && (
              <button
                className="text-emerald-300 underline underline-offset-4"
                onClick={() => { toast.onUndo?.(); setToast(null); }}
              >
                Undo
              </button>
            )}
            <button className="opacity-70 hover:opacity-100" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}
      <BottomNav active={activeTab} setActive={setActiveTab} walletIconSrc={walletLogo} />


      {/* Modals */}
      {showSpendModal && (
        <SpendModal
          onClose={() => setShowSpendModal(false)}
          onSave={handleAddTransaction}
        />
      )}
      {showMoneyTimeModal && (
        <MoneyTimeModal
          onClose={() => setShowMoneyTimeModal(false)}
          onSave={handleAddTransaction}
        />
      )}
      
      {selectedTransaction && (
        <TransactionEditModal
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transaction={selectedTransaction}
          onSave={handleEditTransaction}
          onDelete={() => {
            handleDeleteTransaction(selectedTransaction.id)
            setSelectedTransaction(null)
          }}
        />
      )}
      {showBudgetEditModal && (
        <BudgetEditModal
          open={true}
          isNew={true}
          item={{ category: '', amount: '' }}
          onClose={() => setShowBudgetEditModal(false)}
          onSave={(form) => handleAddBudget('outflows', form)}
          onDelete={() => setShowBudgetEditModal(false)}
          onClaim={() => {}}
        />
      )}

      {selectedBudgetCategory && (
        <BudgetEditModal
          category={selectedBudgetCategory}
          onClose={() => setSelectedBudgetCategory(null)}
          onSave={(form) =>
            handleEditBudget('outflows', selectedBudgetCategory.index, form)
          }
        />
      )}
    </div>
  )
}



export default App
