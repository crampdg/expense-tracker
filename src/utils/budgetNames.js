// Canonical normalizer used everywhere
export const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/[’'`´]/g, "'")               // apostrophes
    .replace(/[-–—]/g, "-")                // dashes
    .replace(/[\s_]+/g, " ")               // collapse spaces/underscores
    .trim();

/**
 * Returns a deduped array of every category name (parents + subs)
 * across inflows + outflows, preserving the first-seen casing.
 */
export function collectAllCategoryNames(budgets) {
  const map = new Map(); // norm(name) -> canonical casing
  const add = (name) => {
    if (!name) return;
    const key = norm(name);
    if (!map.has(key)) map.set(key, String(name).trim());
  };

  const inflows = Array.isArray(budgets?.inflows) ? budgets.inflows : [];
  for (const r of inflows) {
    add(r?.category);
    for (const c of r?.children || []) add(c?.category);
  }

  const outflows = Array.isArray(budgets?.outflows) ? budgets.outflows : [];
  for (const r of outflows) {
    add(r?.category);
    for (const c of r?.children || []) add(c?.category);
  }

  // Sort loosely alphabetically, case-insensitive, keeping canonical casing
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/**
 * Optional: returns a directory Map<normName, { name, section, type, path }>
 * - section: "inflows" | "outflows"
 * - type: "fixed" | "variable" | null (for inflows)
 * - path: [i] for parent, [i,j] for child (index path into budgets)
 */
export function buildBudgetNameDirectory(budgets) {
  const dir = new Map();

  const add = (name, info) => {
    const key = norm(name);
    if (!dir.has(key)) {
      dir.set(key, { name: String(name).trim(), ...info });
    }
  };

  const inflows = Array.isArray(budgets?.inflows) ? budgets.inflows : [];
  inflows.forEach((r, i) => {
    add(r?.category, { section: "inflows", type: null, path: [i] });
    (r?.children || []).forEach((c, j) =>
      add(c?.category, { section: "inflows", type: null, path: [i, j] })
    );
  });

  const outflows = Array.isArray(budgets?.outflows) ? budgets.outflows : [];
  outflows.forEach((r, i) => {
    const t = r?.type === "fixed" ? "fixed" : "variable";
    add(r?.category, { section: "outflows", type: t, path: [i] });
    (r?.children || []).forEach((c, j) =>
      add(c?.category, { section: "outflows", type: t, path: [i, j] })
    );
  });

  return dir;
}
