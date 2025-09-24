import { Wallet, BarChart2, PieChart, List, Lock } from "lucide-react"

export default function BottomNav({ active, setActive }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-md flex justify-around items-center h-16">
      
      {/* Budget */}
      <button onClick={() => setActive("budget")} className="flex flex-col items-center">
        <BarChart2 size={22} className={active === "budget" ? "text-blue-500" : "text-gray-500"} />
        <span className="text-xs">Budget</span>
      </button>

      {/* Summary */}
      <button onClick={() => setActive("summary")} className="flex flex-col items-center">
        <PieChart size={22} className={active === "summary" ? "text-blue-500" : "text-gray-500"} />
        <span className="text-xs">Summary</span>
      </button>

      {/* Wallet (big button in middle) */}
      <button
        onClick={() => setActive("wallet")}
        className="relative -mt-6 bg-blue-500 rounded-full p-4 shadow-lg"
      >
        <Wallet size={28} className="text-white" />
      </button>

      {/* Detailed */}
      <button onClick={() => setActive("detailed")} className="flex flex-col items-center">
        <List size={22} className={active === "detailed" ? "text-blue-500" : "text-gray-500"} />
        <span className="text-xs">Detailed</span>
      </button>

      {/* Coming Soon */}
      <button disabled className="flex flex-col items-center opacity-50">
        <Lock size={22} />
        <span className="text-xs">Coming</span>
      </button>

    </nav>
  )
}
