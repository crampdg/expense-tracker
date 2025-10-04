import { useCallback, useMemo } from "react";
import { Wallet as WalletIcon, BarChart2, PieChart, List, Lock } from "lucide-react";

/**
 * BottomNav
 *
 * Props:
 *  - active: "wallet" | "budget" | "summary" | "detailed" | "settings" | "coming"
 *  - setActive: (key) => void
 *  - walletIconSrc?: string  // OPTIONAL: path to your app logo (PNG/SVG). If omitted, uses a vector icon.
 *
 * Notes:
 *  - Wallet button is a raised, circular FAB that sits slightly above the bar.
 *  - Bar is a darker emerald so the center button stands out.
 *  - Arrow keys cycle tabs (skips disabled).
 */
export default function BottomNav({ active, setActive, walletIconSrc }) {
  const items = useMemo(
    () => [
      { key: "budget", label: "Budget", Icon: BarChart2, disabled: false },
      { key: "summary", label: "Summary", Icon: PieChart, disabled: false },
      // center wallet rendered separately as a FAB
      { key: "detailed", label: "Detailed", Icon: List, disabled: false },
      { key: "coming", label: "Coming", Icon: Lock, disabled: true },
    ],
    []
  );

  const keys = useMemo(
    () => ["budget", "summary", "wallet", "detailed", "coming"],
    []
  );

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

      // skip disabled destinations
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

  // styling tokens
  const barBg =
    "bg-emerald-700/95 backdrop-blur-sm border-t border-emerald-800 shadow-[0_-4px_12px_rgba(16,185,129,0.25)]";
  const baseBtn =
    "h-12 w-full max-w-[110px] px-2 flex flex-col items-center justify-center gap-1 focus:outline-none";
  const inactiveIcon = "text-emerald-200";
  const activeIcon = "text-white";
  const inactiveText = "text-emerald-100/80";
  const activeText = "text-white";

  // center wallet FAB styles
  const fabWrapper =
    "absolute left-1/2 -translate-x-1/2 -translate-y-3 top-0 pointer-events-none"; // positions above the bar
  const fabBtn =
    "pointer-events-auto h-[60px] w-[60px] rounded-full bg-white border-4 border-emerald-700 shadow-xl " +
    "flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white/60";
  const fabActive =
    "ring-4 ring-yellow-300 shadow-[0_10px_20px_rgba(0,0,0,0.25)] scale-[1.04]";
  const fabInactive = "opacity-100";

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 ${barBg} h-[74px] pb-[env(safe-area-inset-bottom)] tap-safe`}

      role="tablist"
      aria-label="Primary"
      onKeyDown={handleKey}
    >
      <div className="relative mx-auto max-w-screen-sm h-full">
        {/* grid: leave center column empty for the raised wallet */}
        <div className="grid grid-cols-5 h-full items-end">
          {/* Budget */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "budget"}
              aria-label="Budget"
              onClick={() => setActive("budget")}
              className={baseBtn}
            >
              <BarChart2
                size={24}
                className={active === "budget" ? activeIcon : inactiveIcon}
              />
              <span
                className={`text-xs font-medium ${
                  active === "budget" ? activeText : inactiveText
                }`}
              >
                Budget
              </span>
              <span
                className={`h-1 w-1 rounded-full mt-0.5 ${
                  active === "budget" ? "bg-white" : "bg-transparent"
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
              className={baseBtn}
            >
              <PieChart
                size={24}
                className={active === "summary" ? activeIcon : inactiveIcon}
              />
              <span
                className={`text-xs font-medium ${
                  active === "summary" ? activeText : inactiveText
                }`}
              >
                Summary
              </span>
              <span
                className={`h-1 w-1 rounded-full mt-0.5 ${
                  active === "summary" ? "bg-white" : "bg-transparent"
                }`}
              />
            </button>
          </div>

          {/* Spacer column for raised wallet */}
          <div />

          {/* Detailed */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "detailed"}
              aria-label="Detailed"
              onClick={() => setActive("detailed")}
              className={baseBtn}
            >
              <List
                size={24}
                className={active === "detailed" ? activeIcon : inactiveIcon}
              />
              <span
                className={`text-xs font-medium ${
                  active === "detailed" ? activeText : inactiveText
                }`}
              >
                Detailed
              </span>
              <span
                className={`h-1 w-1 rounded-full mt-0.5 ${
                  active === "detailed" ? "bg-white" : "bg-transparent"
                }`}
              />
            </button>
          </div>

          {/* Coming (disabled) */}
          <div className="flex justify-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === "coming"}
              aria-label="Coming soon"
              disabled
              className={`${baseBtn} opacity-50 cursor-not-allowed`}
              title="Coming soon"
            >
              <Lock size={24} className="text-emerald-300/60" />
              <span className="text-emerald-200/70 text-xs font-medium">
                Coming
              </span>
              <span className="h-1 w-1 rounded-full mt-0.5 bg-transparent" />
            </button>
          </div>
        </div>

        {/* Raised Wallet FAB (center) */}
        <div className={fabWrapper} aria-hidden={false}>
          <button
            type="button"
            role="tab"
            aria-selected={active === "wallet"}
            aria-label="Wallet"
            onClick={() => setActive("wallet")}
            className={`${fabBtn} ${
              active === "wallet" ? fabActive : fabInactive
            }`}
          >
            {walletIconSrc ? (
              <img
                src={walletIconSrc}
                alt="Wallet"
                className="h-[34px] w-[34px] rounded-xl object-cover"
                draggable="false"
              />
            ) : (
              <WalletIcon
                size={28}
                className="text-emerald-700"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
