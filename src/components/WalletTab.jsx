import { useMemo } from "react"

export default function WalletTab({ transactions }) {
  // Default to [] if transactions is missing
  const txns = transactions || []

  // Compute total inflows, outflows, and balance
  const { inflows, outflows, balance } = useMemo(() => {
    let inflows = 0
    let outflows = 0

    txns.forEach((t) => {
      if (t.amount > 0) inflows += t.amount
      else outflows += Math.abs(t.amount)
    })

    return {
      inflows,
      outflows,
      balance: inflows - outflows,
    }
  }, [txns])

  return (
    <div className="card">
      <h2 className="text-lg font-bold mb-4">Wallet Summary</h2>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Total Inflows:</span>
          <span>${inflows.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Total Outflows:</span>
          <span>${outflows.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Balance:</span>
          <span>${balance.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
