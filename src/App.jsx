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
import { useState, useMemo, useEffect } from 'react'


function App() {
  const [activeTab, setActiveTab] = useState('wallet')
  const [showSpendModal, setShowSpendModal] = useState(false)
  const [showMoneyTimeModal, setShowMoneyTimeModal] = useState(false)
  const [showBudgetEditModal, setShowBudgetEditModal] = useState(false)
  const [showTransactionEditModal, setShowTransactionEditModal] = useState(false)
  const [periodOffset, setPeriodOffset] = useState(0)

  
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

  const handleClaimBudget = (section, index, payload) => {
    console.log("Claiming budget row:", section, index, payload)
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4 pb-20">
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
            periodEnd={periodEnd}
          />
        )}


        {activeTab === 'settings' && (
          <PeriodSettings periodConfig={periodConfig} setPeriodConfig={setPeriodConfig} />
        )}


      </div>

      <BottomNav active={activeTab} setActive={setActiveTab} />

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
