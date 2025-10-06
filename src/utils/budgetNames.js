// utils/budgetNames.js
export function collectAllCategoryNames(budget = {}) {
  const out = new Set();
  const push = (s) => {
    const v = (s ?? "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (v) out.add(v);
  };

  for (const r of budget.inflows || []) {
    push(r.category);
    for (const c of r.children || []) push(c.category);
  }
  for (const r of budget.outflows || []) {
    push(r.category);
    for (const c of r.children || []) push(c.category);
  }
  return [...out];
}
