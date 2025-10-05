import React, { useEffect, useRef } from "react";

/**
 * Edge-swipe between tabs (left/right).
 * Ignores touches that start on interactive elements or [data-noswipe].
 */
export default function SwipeTabs({
  tabs,
  active,
  onChange,
  edge = 24,
  threshold = 64,
  className = "",
  children,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0, startY = 0, w = 0;
    let armed = false, moved = false;

    const shouldIgnore = (target) =>
      target?.closest?.(
        "[data-noswipe],button,[role='button'],a,input,select,textarea,[contenteditable='true']"
      );


    const idx = () => Math.max(0, tabs.indexOf(active));

    const onTouchStart = (e) => {
      if (e.touches?.length !== 1) return;
      if (shouldIgnore(e.target)) return;
      const t = e.touches[0];
      w = el.clientWidth;
      startX = t.clientX;
      startY = t.clientY;
      armed = edge <= 0 || startX <= edge || startX >= w - edge;
      moved = false;
    };

    const onTouchMove = (e) => {
      if (!armed) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        e.preventDefault(); // keep it horizontal once armed
        moved = true;
      } else {
        armed = false; // vertical intent
      }
    };

    const onTouchEnd = (e) => {
      if (!armed || !moved) return;
      armed = false;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      if (Math.abs(dx) < threshold) return;

      const i = idx();
      if (dx < 0 && i < tabs.length - 1) onChange?.(tabs[i + 1]); // left → next
      if (dx > 0 && i > 0)                onChange?.(tabs[i - 1]); // right → prev
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [active, tabs, edge, threshold, onChange]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ touchAction: "pan-y", overscrollBehaviorX: "contain" }}
    >
      {children}
    </div>
  );
}
