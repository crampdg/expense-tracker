import { useState } from 'react'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import MoneyTimeModal from './modals/MoneyTimeModal.jsx'
import { money } from '../utils/format.js'

export default function WalletTab({ balance, suggestedSpend, transactions, onMoneyTime, budgets }) {

  const [open, setOpen] = useState(false)
  const isEmpty = balance === 0 && (!transactions || transactions.length === 0)

  return (
    <Card>
      <h2 className="text-center font-bold mb-4">Wallet</h2>

      {isEmpty ? (
        <div className="text-center text-gray-600 space-y-3 mb-8">
          <p className="text-lg">💡 Getting Started</p>
          <p className="text-sm">
            Add or <span className="font-semibold">Claim</span> your first inflow to start tracking cash on hand.
          </p>
        </div>
      ) : (
        <>
          <div className="text-center mb-6">
            <p className="text-gray-600">Cash on Hand</p>
            <p className={`text-3xl font-bold ${balance < 0 ? 'text-red-600' : ''}`}>
              {money(balance)}
            </p>
          </div>
          <div className="text-center mb-8">
            <p className="text-gray-600">Suggested Daily Spend</p>
            <p className="text-xl font-semibold">{money(suggestedSpend)}</p>
          </div>
        </>
      )}

      {/* Button always at bottom */}
      <div className="flex justify-center">
        <Button onClick={() => setOpen(true)}>MONEY TIME! 💸</Button>
      </div>

      <MoneyTimeModal
        open={open}
        onClose={() => setOpen(false)}
        onSave={onMoneyTime}
        categories={[
            ...new Set([
            ...budgets.inflows.map(i => i.category),
            ...budgets.outflows.map(o => o.category),
            ]),
        ]}
        />

    </Card>
  )
}
