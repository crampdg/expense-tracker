import { useState, useMemo, useEffect } from 'react'
import WalletTab from './components/WalletTab.jsx'
import BudgetTab from './components/BudgetTab.jsx'
import DetailedTab from './components/DetailedTab.jsx'
import SummaryTab from './components/SummaryTab.jsx'
import SpendModal from './components/modals/SpendModal.jsx'
import MoneyTimeModal from './components/modals/MoneyTimeModal.jsx'
import BudgetEditModal from './components/modals/BudgetEditModal.jsx'
import TransactionEditModal from './components/modals/TransactionEditModal.jsx'
import BottomNav from './components/ui/BottomNav.jsx'

function App() {
  const [activeTab, setActiveTab] = useState('wallet')
  const [showSpendModal, setShowSpendModal] = useState(false)
  const [showMoneyTimeModal, setShowMoneyTimeModal] = useState(false)
  const [showBudgetEditModal, setShowBudgetEditModal] = useState(false)
  const [showTransactionEditModal, setShowTransactionEditModal] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [budget, setBudget] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [selectedBudgetCategory, setSelectedBudgetCategory] = useState(null)

  // ✅ Memoized once, no duplicate inside suggestedSpend
  const today = useMemo(() => new Date(), [])

  // Suggested spend calculation (simplified to avoid duplicate today/useMemo)
  const suggestedSpend = useMemo(() => {
    if (budget.length === 0) return 0
    const totalBudget = budget.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const daysInMonth = (endOfMonth - startOfMonth) / (1000 * 60 * 60 * 24) + 1
    return totalBudget / daysInMonth
  }, [budget, today])

  // Handlers
  const handleAddTransaction = (transaction) => {
    setTransactions([...transactions, transaction])
  }

  const handleEditTransaction = (updatedTransaction) => {
    setTransactions(transactions.map(t =>
      t.id === updatedTransaction.id ? updatedTransaction : t
    ))
  }

  const handleDeleteTransaction = (id) => {
    setTransactions(transactions.filter(t => t.id !== id))
  }

  const handleAddBudget = (category) => {
    setBudget([...budget, category])
  }

  const handleEditBudget = (updatedCategory) => {
    setBudget(budget.map(b =>
      b.id === updatedCategory.id ? updatedCategory : b
    ))
  }

  const handleDeleteBudget = (id) => {
    setBudget(budget.filter(b => b.id !== id))
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'wallet' && (
          <WalletTab
            budget={budget}
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetTab
            budget={budget}
            onAdd={() => setShowBudgetEditModal(true)}
            onEdit={setSelectedBudgetCategory}
            onDelete={handleDeleteBudget}
          />
        )}
        {activeTab === 'detailed' && (
          <DetailedTab transactions={transactions} budget={budget} />
        )}
        {activeTab === 'summary' && (
          <SummaryTab transactions={transactions} budget={budget} />
        )}
      </div>

      {/* ✅ New Bottom Navigation */}
      <BottomNav
        active={activeTab}
        setActive={setActiveTab}
      />

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
      {showBudgetEditModal && (
        <BudgetEditModal
          onClose={() => setShowBudgetEditModal(false)}
          onSave={handleAddBudget}
        />
      )}
      {selectedTransaction && (
        <TransactionEditModal
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onSave={handleEditTransaction}
        />
      )}
      {selectedBudgetCategory && (
        <BudgetEditModal
          category={selectedBudgetCategory}
          onClose={() => setSelectedBudgetCategory(null)}
          onSave={handleEditBudget}
        />
      )}
    </div>
  )
}

export default App
