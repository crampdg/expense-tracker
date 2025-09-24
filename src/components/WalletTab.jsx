import React, { useState, useMemo } from "react";
import MoneyTimeModal from "./modals/MoneyTimeModal";

export default function WalletTab({ budget, transactions, onAddTransaction }) {
  const [showMoneyTime, setShowMoneyTime] = useState(false);

  // ✅ Calculate totals from budget
  const totalInflows = useMemo(
    () => (budget?.inflows || []).reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    [budget]
  );
  const totalOutflowsBudget = useMemo(
    () => (budget?.outflows || []).reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
    [budget]
  );

  // ✅ Calculate actual spending from transactions
  const actualOutflows = useMemo(
    () => transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [transactions]
  );

  // ✅ Correct Cash on Hand calculation from transactions
  const cashOnHand = useMemo(() => {
    return transactions.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === "inflow") return sum + amt;
      if (t.type === "expense") return sum - amt;
      return sum;
    }, 0);
  }, [transactions]);


  // ✅ Suggested Daily Spend = remaining cashOnHand / days left in period
  const suggestedDaily = useMemo(() => {
    const today = new Date();
    const end = new Date(budget?.periodEnd || new Date(today.getFullYear(), today.getMonth() + 1, 0));
    const daysLeft = Math.max(
      1,
      Math.ceil((end - today) / (1000 * 60 * 60 * 24))
    );

    return cashOnHand / daysLeft;
  }, [budget?.periodEnd, cashOnHand]);


  // ✅ Show the 3 most recent transactions
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
  }, [transactions]);

  return (
    <div className="p-6 flex flex-col items-center space-y-6">
      {/* Cash on Hand */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-600">Cash on Hand</h2>
        <p className="text-4xl font-bold mt-2">
          ${isNaN(cashOnHand) ? "0.00" : cashOnHand.toFixed(2)}
        </p>
      </div>

      {/* Suggested Daily Spend */}
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-600">
          Suggested Daily Spend
        </h3>
        <p className="text-2xl text-green-600 font-bold">
          ${isNaN(suggestedDaily) ? "0.00" : suggestedDaily.toFixed(2)}
        </p>
      </div>


      {/* Money Time Button */}
      <button
        onClick={() => setShowMoneyTime(true)}
        className="bg-yellow-400 text-black font-bold text-lg px-6 py-3 rounded-full shadow-lg hover:bg-yellow-300 transition"
      >
        MONEY TIME! 💸
      </button>

      {/* Recent Transactions */}
      <div className="w-full mt-6">
        <h4 className="text-md font-semibold text-gray-700 mb-2 text-center">
          Recent Transactions
        </h4>
        {recentTransactions.length > 0 ? (
          <ul className="space-y-2">
            {recentTransactions.map((t, idx) => (
              <li
                key={idx}
                className="flex justify-between bg-gray-100 rounded-lg p-2 shadow-sm"
              >
                <span className="text-sm">{t.category || "Uncategorized"}</span>
                <span className="text-sm font-medium">
                  -${(t.amount || 0).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 text-center">No recent spends</p>
        )}
      </div>

      {/* Modal */}
      {showMoneyTime && (
        <MoneyTimeModal
          open={showMoneyTime}
          onClose={() => setShowMoneyTime(false)}
          onSave={onAddTransaction}          // ✅ match expected prop
          categories={[
            ...budget.inflows.map(i => i.category),
            ...budget.outflows.map(o => o.category),
          ]}
        />
      )}

    </div>
  );
}
