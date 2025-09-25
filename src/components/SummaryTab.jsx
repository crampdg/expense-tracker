import { useMemo } from "react"
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts"
import Card from "./ui/Card.jsx"
import { money } from "../utils/format.js"

export default function SummaryTab({ transactions, budget }) {
  // --- Data prep ---
  const inflowsTotal = useMemo(
    () => transactions.filter(t => t.type === "inflow").reduce((s, t) => s + Number(t.amount || 0), 0),
    [transactions]
  )

  const outflowsTotal = useMemo(
    () => transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0),
    [transactions]
  )

  const net = inflowsTotal - outflowsTotal

  const daysLeft = useMemo(() => {
    const today = new Date()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return Math.max(0, Math.floor((endOfMonth - today) / (1000 * 60 * 60 * 24)))
  }, [])

  // Pie data
  const pieData = [
    { name: "Inflows", value: inflowsTotal },
    { name: "Outflows", value: outflowsTotal },
  ]
  const COLORS = ["#2dd4bf", "#3b82f6"]

  // Category breakdown (top 5 outflows)
  const outflowByCategory = useMemo(() => {
    const m = {}
    for (const t of transactions) {
      if (t.type !== "expense") continue
      m[t.category] = (m[t.category] || 0) + Number(t.amount || 0)
    }
    return Object.entries(m)
      .map(([cat, amt]) => ({ category: cat, amount: amt }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [transactions])

  // Insight text
  const topCategory = outflowByCategory[0]
  const insight =
    topCategory && outflowsTotal > 0
      ? `Top category: ${topCategory.category} – ${(topCategory.amount / outflowsTotal * 100).toFixed(0)}% of outflows`
      : "No major spending yet this period."

  return (
    <div className="space-y-4">
      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card><div className="text-center"><div className="font-semibold">Inflows</div><div>{money(inflowsTotal)}</div></div></Card>
        <Card><div className="text-center"><div className="font-semibold">Outflows</div><div>{money(outflowsTotal)}</div></div></Card>
        <Card><div className="text-center"><div className="font-semibold">Net</div><div className={net >= 0 ? "text-green-600" : "text-red-600"}>{money(net)}</div></div></Card>
        <Card><div className="text-center"><div className="font-semibold">Days Left</div><div>{daysLeft}</div></div></Card>
      </div>

      {/* Donut chart */}
      <Card>
        <h3 className="font-semibold mb-2">Inflows vs Outflows</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Bar chart of top outflow categories */}
      {outflowByCategory.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-2">Top Spending Categories</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={outflowByCategory}>
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="amount" fill="#f43f5e" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Insights */}
      <Card>
        <h3 className="font-semibold mb-2">Insights</h3>
        <p>{insight}</p>
      </Card>
    </div>
  )
}
