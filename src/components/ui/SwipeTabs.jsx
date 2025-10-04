import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Wrap your page content with <SwipeTabs> to enable edge swipes
 * between routes in `tabs` order. Starts only from left/right edges
 * to avoid fighting with normal scrolling.
 *
 * Opt out per-area by adding: data-noswipe="true"
 */
export default function SwipeTabs({
  tabs = ["/wallet", "/budget", "/summary", "/detailed"],
  edge = 24,        // px from left/right edges to arm swipe
  threshold = 64,   // min horizontal movement to trigger
  children,
}) {
  const ref = useRef(null);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0, startY = 0, width = 0;
    let armed = false, moved = false;

    const isFormish = (node) => {
      const tag = (node?.tagName || "").toLowerCase();
      return ["input","textarea","select","button","a"].includes(tag);
    };

    const shouldIgnore = (target) =>
      isFormish(target) || target?.closest?.("[data-noswipe='true']");

    const currentIndex = () =>
      tabs.findIndex((p) => loc.pathname === p || loc.pathname.startsWith(p + "/"));

    // ----- touch -----
    const onTouchStart = (e) => {
      if (e.touches?.length !== 1) return;
      const t = e.touches[0];
      if (shouldIgnore(e.target)) return;

      width = el.clientWidth;
      startX = t.clientX;
      startY = t.clientY;

      // only arm if starting near edges
      armed = startX <= edge || startX >= width - edge;
      moved = false;
    };

    const onTouchMove = (e) => {
      if (!armed) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // require mostly horizontal
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        e.preventDefault(); // keep vertical scroll working (touchAction: pan-y)
        moved = true;
      } else {
        armed = false; // vertical intent -> bail
      }
    };

    const onTouchEnd = (e) => {
      if (!armed) return;
      armed = false;
      const touch = e.changedTouches?.[0];
      if (!touch || !moved) return;

      const dx = touch.clientX - startX;
      if (Math.abs(dx) < threshold) return;

      const idx = currentIndex();
      if (idx === -1) return;

      if (dx < 0) {
        // swipe left -> next
        const next = tabs[Math.min(idx + 1, tabs.length - 1)];
        if (next && next !== tabs[idx]) nav(next);
      } else {
        // swipe right -> prev
        const prev = tabs[Math.max(idx - 1, 0)];
        if (prev && prev !== tabs[idx]) nav(prev);
      }
    };

    // ----- mouse/trackpad (optional) -----
    let mouseDown = false;
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (shouldIgnore(e.target)) return;
      width = el.clientWidth;
      startX = e.clientX;
      startY = e.clientY;
      mouseDown = startX <= edge || startX >= width - edge;
      moved = false;
    };
    const onMouseMove = (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) moved = true;
      else mouseDown = false;
    };
    const onMouseUp = (e) => {
      if (!mouseDown) return;
      mouseDown = false;
      if (!moved) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) < threshold) return;

      const idx = currentIndex();
      if (idx === -1) return;

      if (dx < 0) {
        const next = tabs[Math.min(idx + 1, tabs.length - 1)];
        if (next && next !== tabs[idx]) nav(next);
      } else {
        const prev = tabs[Math.max(idx - 1, 0)];
        if (prev && prev !== tabs[idx]) nav(prev);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [nav, loc.pathname, tabs, edge, threshold]);

  return (
    <div ref={ref} className="relative" style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
}
