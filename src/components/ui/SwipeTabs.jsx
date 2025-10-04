import { useEffect, useRef } from "react";

/**
 * Edge-swipe between tabs controlled by parent state (no router).
 *
 * Props:
 * - tabs:      array of tab keys, e.g. ["wallet","budget","summary","detailed"]
 * - active:    current tab key
 * - onChange:  (nextKey) => void
 * - edge:      px from edges to arm swipe (default 24)
 * - threshold: min horizontal movement in px to trigger (default 64)
 * - className: optional classes for container
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

    let startX = 0, startY = 0, width = 0;
    let armed = false, moved = false;

    const currentIndex = () => Math.max(0, tabs.indexOf(active));

    const onTouchStart = (e) => {
      if (e.touches?.length !== 1) return;
      const t = e.touches[0];
      width = el.clientWidth;
      startX = t.clientX;
      startY = t.clientY;
      // only arm swipe if started at edges to avoid fighting scroll
      // Allow "edge=0" to mean: start swipe anywhere
      armed = edge <= 0 || startX <= edge || startX >= width - edge;

      moved = false;
    };

    const onTouchMove = (e) => {
      if (!armed) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // mostly horizontal? prevent vertical scroll during swipe
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        e.preventDefault();
        moved = true;
      } else {
        armed = false; // vertical intent -> bail
      }
    };

    const onTouchEnd = (e) => {
      if (!armed || !moved) return;
      armed = false;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      if (Math.abs(dx) < threshold) return;

      const idx = currentIndex();
      if (dx < 0 && idx < tabs.length - 1) onChange?.(tabs[idx + 1]); // left -> next
      if (dx > 0 && idx > 0)                onChange?.(tabs[idx - 1]); // right -> prev
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
