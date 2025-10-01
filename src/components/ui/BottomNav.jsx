import { useCallback, useMemo } from "react";
import { Wallet, BarChart2, PieChart, List, Lock } from "lucide-react";

/**
 * BottomNav
 *
 * Props:
 *  - active: "wallet" | "budget" | "summary" | "detailed" | "settings" | "coming"
 *  - setActive: (key) => void
 *
 * Features:
 *  - Large tap targets + iOS safe-area padding
 *  - Clear active state (color + dot indicator)
 *  - Accessible (role="tablist"/"tab", aria-selected, aria-labels)
 *  - Keyboard arrows (← →) to switch tabs
 *  - Raised center Wallet action
 */
export default function BottomNav({ active, setActive }) {
  const items = useMemo(
    () => [
      { key: "budget", label: "Budget", Icon: BarChart2, disabled: false },
      { key: "summary", label: "Summary", Icon: PieChart, disabled: false },
      // Center "wallet" is rendered separately as a raised FAB-style button
      { key: "detailed", label: "Detailed", Icon: List, disabled: false },
      { key: "coming", label: "Coming", Icon: Lock, disabled: true },
    ],
    []
  );

  const keys = useMemo(() => ["budget", "summary", "wallet", "detailed", "coming"], []);

  const handleKey = useCallback(
    (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = keys.indexOf(active);
      if (current === -1) return;

      let nextIndex =
        e.key === "ArrowRight"
          ? (current + 1) % keys.length
          : (current - 1 + keys.length) % keys.length;

      // Skip disabled destination(s)
      let guard = 0;
      while (keys[nextIndex] === "coming" && guard++ < keys.length) {
        nextIndex =
          e.key === "ArrowRight"
            ? (nextIndex + 1) % keys.length
            : (nextIndex - 1 + keys.length) % keys.length;
      }
      setActive(keys[nextIndex]);
    },
    [active, keys, setActive]
  );

  const baseBtn =
    "flex flex-col items-center justify-center gap-1 min-w-[64px] px-3 py-2 text-xs font-medium " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl";

  const inactiveIcon = "text-gray-500";
  const activeIcon = "text-blue-600";
  const inactiveText = "text-gray-600";
  const activeText = "text-blue-700";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-t border-gray-200 h-[74px]
                 pb-[env(safe-area-inset-bottom)]"
      role="tablist"
      aria-label="Primary"
      onKeyDown={handleKey}
    >
      <div className="relative mx-auto max-w-screen-sm h-full">
        {/* Bar content */}
        <div className="grid grid-cols-5 h-full items-end">
          {/* Budget */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "budget"}
              aria-label="Budget"
              onClick={() => setActive("budget")}
              className={`${baseBtn}`}
            >
              <BarChart2
                size={24}
                className={active === "budget" ? activeIcon : inactiveIcon}
              />
              <span
                className={`${active === "budget" ? activeText : inactiveText}`}
              >
                Budget
              </span>
              <span
                className={`h-1 w-1 rounded-full mt-0.5 ${
                  active === "budget" ? "bg-blue-600" : "bg-transparent"
                }`}
              />
            </button>
          </div>

          {/* Summary */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "summary"}
              aria-label="Summary"
              onClick={() => setActive("summary")}
              className={`${baseBtn}`}
            >
              <PieChart
                size={24}
                className={active === "summary" ? activeIcon : inactiveIcon}
              />
              <span
                className={`${active === "summary" ? activeText : inactiveText}`}
              >
                Summary
              </span>
              <span
                className={`h-1 w-1 rounded-full mt-0.5 ${
                  active === "summary" ? "bg-blue-600" : "bg-transparent"
                }`}
              />
            </button>
          </div>

          {/* Center Wallet (raised) */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "wallet"}
              aria-label="Wallet"
              onClick={() => setActive("wallet")}
              className="relative -mt-8 md:-mt-10 bg-blue-600 text-white rounded-full shadow-xl
                         ring-4 ring-blue-100 hover:bg-blue-700 active:bg-blue-800
                         focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500
                         w-14 h-14 md:w-16 md:h-16 flex items-center justify-center"
            >
              <Wallet size={28} className="text-white" />
            </button>
          </div>

          {/* Detailed */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "detailed"}
              aria-label="Detailed"
              onClick={() => setActive("detailed")}
              className={`${baseBtn}`}
            >
              <List
                size={24}
                className={active === "detailed" ? activeIcon : inactiveIcon}
              />
              <span
                className={`${active === "detailed" ? activeText : inactiveText}`}
              >
                Detailed
              </span>
              <span
                className={`h-1 w-1 rounded-full mt-0.5 ${
                  active === "detailed" ? "bg-blue-600" : "bg-transparent"
                }`}
              />
            </button>
          </div>

          {/* Coming (disabled) */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={false}
              aria-label="Coming soon"
              disabled
              className={`${baseBtn} opacity-50 cursor-not-allowed`}
              title="Coming soon"
            >
              <Lock size={24} className="text-gray-400" />
              <span className="text-gray-500">Coming</span>
              <span className="h-1 w-1 rounded-full mt-0.5 bg-transparent" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
