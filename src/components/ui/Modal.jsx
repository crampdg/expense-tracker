// src/components/ui/Modal.jsx
import React, { useEffect } from "react";

export default function Modal({
  open,
  onClose,
  children,
  widthClass = "w-11/12 max-w-md", // kept for backward-compat
  bodyClass = "",
  className = "", // optional extra classes
}) {
  // Close on Escape; don't swallow typing in inputs/textareas/selects
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const isEditable =
        t?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT";

      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (isEditable) return;

      // Prevent background page scroll/navigation when modal is open
      if ([" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleOverlayClick = (e) => {
    // Only close if user clicked the backdrop itself
    if (e.target === e.currentTarget) onClose?.();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3"
      onClick={handleOverlayClick}
      onTouchStart={handleOverlayClick}
    >
      <div
        className={`bg-white rounded-2xl shadow p-4 ${widthClass} ${className}`}
        // Keep keystrokes inside the modal from reaching any global handlers
        onKeyDownCapture={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={bodyClass}>{children}</div>
      </div>
    </div>
  );
}
