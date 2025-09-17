import React, { useState, useEffect } from "react";
import {
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";

// Utility to format money
const money = (n) => `$${n.toFixed(2)}`;

export default function App() {
  const [activeTab, setActiveTab] = useState("expenses");
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "",
    note: "",
    amount: "",
  });
  const [editingIndex, setEditingIndex] = useState(null);

  const categories = [...new Set(expenses.map((e) => e.category))];
  const notes = [...new Set(expenses.map((e) => e.note))];


    // load from localStorage when the component first mounts
    useEffect(() => {
      const savedExpenses = JSON.parse(localStorage.getItem("expenses")) || [];
      const savedBudgets = JSON.parse(localStorage.getItem("budgets")) || {};
      setExpenses(savedExpenses);
      setBudgets(savedBudgets);
    }, []);

    // save to localStorage whenever expenses change
    useEffect(() => {
      localStorage.setItem("expenses", JSON.stringify(expenses));
    }, [expenses]);

    // save to localStorage whenever budgets change
    useEffect(() => {
      localStorage.setItem("budgets", JSON.stringify(budgets));
    }, [budgets]);

    
  // Save expense
  const saveExpense = () => {
    if (!form.date || !form.amount || !form.category) return;
    const entry = { ...form, amount: parseFloat(form.amount) };
    if (editingIndex !== null) {
      const copy = [...expenses];
      copy[editingIndex] = entry;
      setExpenses(copy);
      setEditingIndex(null);
    } else {
      setExpenses([...expenses, entry]);
    }
    setForm({
      date: new Date().toISOString().split("T")[0],
      category: "",
      note: "",
      amount: "",
    });
  };

  const deleteExpense = (i) => {
    setExpenses(expenses.filter((_, idx) => idx !== i));
  };

  // Date ranges
  const ranges = {
    week: (d) => [startOfWeek(d), endOfWeek(d)],
    month: (d) => [startOfMonth(d), endOfMonth(d)],
    year: (d) => [startOfYear(d), endOfYear(d)],
    all: () => [new Date(0), new Date()],
  };

  const [summaryMode, setSummaryMode] = useState("month");
  const [summaryDate, setSummaryDate] = useState(new Date());

  const [rangeStart, rangeEnd] =
    ranges[summaryMode === "all" ? "all" : summaryMode](summaryDate);

  const filtered = expenses.filter((e) => {
    const d = parseISO(e.date);
    return d >= rangeStart && d <= rangeEnd;
  });

  const totals = filtered.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  // Budget helpers
  const proratedBudget = (category) => {
    const b = budgets[category];
    if (!b) return null;
    if (summaryMode === "week") return (b.monthly ?? 0) / 4;
    if (summaryMode === "month") return b.monthly ?? 0;
    if (summaryMode === "year") return b.annual ?? (b.monthly ?? 0) * 12;
    return null;
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] p-6">
      <h1 className="text-4xl font-bold mb-8 text-center">Expense Tracker</h1>

      {/* Tabs */}
      <div className="flex gap-4 justify-center mb-8">
        {["expenses", "summary", "budget"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg shadow ${
              activeTab === tab
                ? "bg-[var(--color-accent)] text-white"
                : "bg-gray-200"
            }`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Expenses */}
      {activeTab === "expenses" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow space-y-4">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full p-2"
          />
          <input
            list="categories"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full p-2"
          />
          <datalist id="categories">
            {categories.map((c, i) => (
              <option key={i} value={c} />
            ))}
          </datalist>
          <input
            list="notes"
            placeholder="Note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="w-full p-2"
          />
          <datalist id="notes">
            {notes.map((n, i) => (
              <option key={i} value={n} />
            ))}
          </datalist>
          <input
            type="number"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full p-2"
          />
          <button
            onClick={saveExpense}
            className="w-full bg-[var(--color-accent)] text-white p-2 rounded-lg shadow"
          >
            {editingIndex !== null ? "Update" : "Add"} Expense
          </button>

          {/* Expense list */}
          <div className="mt-6 space-y-3">
            {expenses.map((e, i) => (
              <div
                key={i}
                className="flex justify-between items-center bg-gray-50 p-2 rounded-md shadow-sm"
              >
                <span>
                  {e.date} – <b>{e.category}</b> – {e.note} – {money(e.amount)}
                </span>
                <div className="space-x-2">
                  <button
                    className="text-blue-600"
                    onClick={() => {
                      setForm(e);
                      setEditingIndex(i);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-600"
                    onClick={() => deleteExpense(i)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {activeTab === "summary" && (
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow">
          <div className="flex gap-2 items-center justify-center mb-4">
            {["week", "month", "year", "all"].map((m) => (
              <button
                key={m}
                onClick={() => setSummaryMode(m)}
                className={`px-3 py-1 rounded ${
                  summaryMode === m
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-gray-200"
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          <table className="w-full border rounded-lg overflow-hidden shadow-sm">
            <thead>
              <tr className="bg-[var(--color-highlight)]">
                <th className="text-left">Category</th>
                <th className="text-right">Spent</th>
                <th className="text-right">Budget</th>
                <th className="text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(totals).map(([cat, amt]) => {
                const b = proratedBudget(cat);
                const delta = b !== null ? amt - b : null;
                return (
                  <tr key={cat} className="border-t">
                    <td>{cat}</td>
                    <td className="text-right">{money(amt)}</td>
                    <td className="text-right">{b !== null ? money(b) : "-"}</td>
                    <td
                      className={`text-right font-semibold ${
                        delta > 0 ? "text-[var(--color-danger)]" : "text-green-600"
                      }`}
                    >
                      {delta !== null ? money(delta) : "-"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-100 font-bold">
                <td>Total</td>
                <td className="text-right">{money(total)}</td>
                <td className="text-right">
                  {Object.keys(totals).length > 0
                    ? money(
                        Object.keys(totals).reduce((s, cat) => {
                          const b = proratedBudget(cat);
                          return s + (b ?? 0);
                        }, 0)
                      )
                    : "-"}
                </td>
                <td className="text-right">
                  {Object.keys(totals).length > 0
                    ? money(
                        Object.entries(totals).reduce((s, [cat, amt]) => {
                          const b = proratedBudget(cat);
                          return s + (b !== null ? amt - b : 0);
                        }, 0)
                      )
                    : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Budget */}
      {activeTab === "budget" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow space-y-4">
          {categories.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="w-24">{c}</span>
              <input
                type="number"
                placeholder="Monthly"
                value={budgets[c]?.monthly ?? ""}
                onChange={(e) =>
                  setBudgets({
                    ...budgets,
                    [c]: {
                      ...budgets[c],
                      monthly: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="p-1 flex-1"
              />
              <input
                type="number"
                placeholder="Annual"
                value={budgets[c]?.annual ?? ""}
                onChange={(e) =>
                  setBudgets({
                    ...budgets,
                    [c]: {
                      ...budgets[c],
                      annual: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="p-1 flex-1"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
