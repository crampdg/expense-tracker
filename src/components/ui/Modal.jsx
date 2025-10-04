// src/components/ui/Modal.jsx
import React, { useEffect, useRef } from "react";

/**
 * Modal
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - children: React.ReactNode
 *  - widthClass?: string  (container width utilities)
 *  - bodyClass?: string   (extra classes applied around children)
 *  - className?: string   (extra classes for outer card)
 *
 * Notes:
 *  - Adds iOS zoom guards while open (prevents pinch / double-tap zoom).
 *  - Locks body scroll using position:fixed to avoid layout jumps.
 *  - Blurs any focused input before closing to avoid "stuck zoom" on iPhone.
 */
export default function Modal({
  open,
  onClose,
  children,
  widthClass = "w-11/12 max-w-md",
  bodyClass = "",
  className = "",
}) {
  const scrollYRef = useRef(0);
  const rootRef = useRef(null);
  const lastTouchEndRef = useRef(0);

  // Body lock/unlock to keep background stable
  useEffect(() => {
    if (!open) return;

    // Save current scroll and lock body
    scrollYRef.current = window.scrollY || document.documentElement.scrollTop || 0;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${scrollYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overscrollBehaviorY = "contain";

    return () => {
      // Unlock body and restore scroll
      const y = scrollYRef.current;
      const b = document.body;
      b.style.position = "";
      b.style.top = "";
      b.style.left = "";
      b.style.right = "";
      b.style.width = "";
      b.style.overscrollBehaviorY = "";
      window.scrollTo(0, y);
    };
  }, [open]);

  // iOS: prevent pinch-zoom and double-tap zoom while modal is open
  useEffect(() => {
    if (!open) return;

    const preventPinch = (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };
    const preventGesture = (e) => {
      e.preventDefault();
    };
    const preventDoubleTap = (e) => {
      const t = Date.now();
      if (t - lastTouchEndRef.current < 300) {
        e.preventDefault();
      }
      lastTouchEndRef.current = t;
    };

    // Scope listeners to the modal root so scrolling inside still works
    const el = rootRef.current || document;
    el.addEventListener("touchstart", preventPinch, { passive: false });
    el.addEventListener("gesturestart", preventGesture);
    el.addEventListener("touchend", preventDoubleTap);

    return () => {
      el.removeEventListener("touchstart", preventPinch);
      el.removeEventListener("gesturestart", preventGesture);
      el.removeEventListener("touchend", preventDoubleTap);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        doClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doClose = () => {
    // Blur focused element first to dismiss any iOS zoom state
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    onClose?.();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      doClose();
    }
  };

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="modal-root fixed inset-0 z-50 flex items-center justify-center tap-safe"
      onClick={handleOverlayClick}
      onTouchStart={handleOverlayClick}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="modal-backdrop absolute inset-0 bg-black/40" />

      {/* Card */}
      <div
        className={`bg-white rounded-2xl shadow p-4 modal-stable relative ${widthClass} ${className}`}
        onKeyDownCapture={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={bodyClass}>{children}</div>
      </div>
    </div>
  );
}
