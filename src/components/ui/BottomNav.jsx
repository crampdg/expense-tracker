// src/components/ui/BottomNav.jsx
import React, { useMemo, useRef, useCallback } from "react";
import { Wallet as WalletIcon, BarChart2, PieChart, List } from "lucide-react";

/**
 * BottomNav
 *
 * Props:
 *  - active: "wallet" | "budget" | "summary" | "detailed"
 *  - setActive: (key) => void
 *  - walletIconSrc?: string
 *
 * Notes:
 *  - Adds iOS zoom guards: .tap-safe (touch-action: manipulation), 44px min hit area,
 *    and a small double-tap suppression on the bar itself.
 */
export default function BottomNav({ active, setActive, walletIconSrc }) {
  const lastTouchEndRef = useRef(0);

  // tab order you requested: budget → summary → wallet (center FAB) → detailed
  const tabs = useMemo(
    () => [
      { key: "budget", label: "Budget", icon: BarChart2 },
      { key: "summary", label: "Summary", icon: PieChart },
      { key: "wallet", label: "Wallet", icon: WalletIcon, center: true },
      { key: "detailed", label: "Detailed", icon: List },
    ],
    []
  );

  const onKeyDown = useCallback(
    (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const order = tabs.map((t) => t.key);
      const idx = order.indexOf(active);
      if (idx === -1) return;
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + delta + order.length) % order.length;
      setActive(order[next]);
    },
    [active, setActive, tabs]
  );

  // Suppress double-tap zoom on the whole bar (extra belt-and-suspenders for iOS)
  const onTouchEnd = useCallback((e) => {
    const now = Date.now();
    if (now - lastTouchEndRef.current < 300) {
      e.preventDefault();
    }
    lastTouchEndRef.current = now;
  }, []);

  const baseBtn =
    "tap-safe select-none flex flex-col items-center justify-center min-h-[44px] min-w-[56px] px-3 py-1.5 " +
    "rounded-xl transition-transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

  const activeText = "text-emerald-900";
  const inactiveText = "text-emerald-100/80";
  const activeIcon = "text-white drop-shadow";
  const inactiveIcon = "text-emerald-100/90";

  return (
    <nav
      className="tap-safe fixed bottom-0 inset-x-0 z-40"
      aria-label="Bottom navigation"
      onKeyDown={onKeyDown}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative mx-auto max-w-screen-sm">
        {/* Bar */}
        <div className="h-16 bg-emerald-800/95 backdrop-blur supports-[backdrop-filter]:bg-emerald-800/80 rounded-t-2xl shadow-xl border-t border-emerald-700/60">
          <div className="grid grid-cols-5 h-full">
            {/* Left: Budget */}
            <button
              type="button"
              className={`${baseBtn} col-span-1`}
              onClick={() => setActive("budget")}
              aria-current={active === "budget" ? "page" : undefined}
            >
              <BarChart2
                size={22}
                className={active === "budget" ? activeIcon : inactiveIcon}
              />
              <span
                className={`text-[11px] font-medium ${
                  active === "budget" ? activeText : inactiveText
                }`}
              >
                Budget
              </span>
            </button>

            {/* Left-mid: Summary */}
            <button
              type="button"
              className={`${baseBtn} col-span-1`}
              onClick={() => setActive("summary")}
              aria-current={active === "summary" ? "page" : undefined}
            >
              <PieChart
                size={22}
                className={active === "summary" ? activeIcon : inactiveIcon}
              />
              <span
                className={`text-[11px] font-medium ${
                  active === "summary" ? activeText : inactiveText
                }`}
              >
                Summary
              </span>
            </button>

            {/* Center: Wallet FAB */}
            <div className="col-span-1 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setActive("wallet")}
                aria-current={active === "wallet" ? "page" : undefined}
                className="tap-safe select-none -mt-6 h-14 w-14 rounded-full bg-emerald-500 shadow-lg ring-4 ring-emerald-900/40
                           flex items-center justify-center active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500"
              >
                {walletIconSrc ? (
                  <img
                    src={walletIconSrc}
                    alt="Wallet"
                    className="h-7 w-7 pointer-events-none"
                    draggable={false}
                  />
                ) : (
                  <WalletIcon
                    size={26}
                    className={
                      active === "wallet"
                        ? "text-white drop-shadow"
                        : "text-white/95"
                    }
                  />
                )}
              </button>
            </div>

            {/* Right-mid: Detailed */}
            <button
              type="button"
              className={`${baseBtn} col-span-1`}
              onClick={() => setActive("detailed")}
              aria-current={active === "detailed" ? "page" : undefined}
            >
              <List
                size={22}
                className={active === "detailed" ? activeIcon : inactiveIcon}
              />
              <span
                className={`text-[11px] font-medium ${
                  active === "detailed" ? activeText : inactiveText
                }`}
              >
                Detailed
              </span>
            </button>

            {/* Right spacer (keeps grid balance) */}
            <div className="col-span-1" />
          </div>
        </div>
      </div>
    </nav>
  );
}
