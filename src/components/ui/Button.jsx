// src/components/ui/Button.jsx
import React, { useRef, useCallback } from "react";

/**
 * Button
 *
 * Props:
 *  - as?: React.ElementType (default: 'button')
 *  - type?: 'button' | 'submit' | 'reset' (default: 'button')
 *  - variant?: 'primary' | 'ghost' | 'subtle' | 'danger' (optional; just adds sensible defaults)
 *  - size?: 'sm' | 'md' | 'lg' (default: 'md')
 *  - noMinHitArea?: boolean (default: false)  // if true, removes the 44px min size
 *  - suppressDoubleTap?: boolean (default: true) // prevents iOS double-tap zoom
 *  - className?: string
 *  - disabled?: boolean
 *  - children?: React.ReactNode
 *  - ...rest (forwarded)
 *
 * Notes:
 *  - Adds `.tap-safe` so CSS `touch-action: manipulation` applies.
 *  - Forces text to 16px to prevent iOS input-focus zoom (also set globally).
 *  - Provides a ≥44px hit area by default (iOS HIG).
 */
export default function Button({
  as: Tag = "button",
  type = "button",
  variant,
  size = "md",
  noMinHitArea = false,
  suppressDoubleTap = true,
  className = "",
  disabled,
  children,
  ...rest
}) {
  const lastTouchEndRef = useRef(0);

  const onTouchEnd = useCallback(
    (e) => {
      if (!suppressDoubleTap) return;
      const now = Date.now();
      if (now - lastTouchEndRef.current < 300) {
        // Prevent iOS double-tap zoom
        e.preventDefault();
      }
      lastTouchEndRef.current = now;
    },
    [suppressDoubleTap]
  );

  const base =
    "tap-safe inline-flex items-center justify-center select-none rounded-xl font-medium " +
    "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
    (disabled ? "opacity-50 cursor-not-allowed " : "active:scale-[0.98] ");

  const minArea = noMinHitArea ? "" : " min-h-[44px] min-w-[44px]";
  const textSize = " text-[16px]"; // avoid iOS zoom on focus

  const sizeMap = {
    sm: " px-3 py-1.5",
    md: " px-4 py-2",
    lg: " px-5 py-3",
  };

  const variantMap = {
    primary: " bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm",
    ghost: " bg-white text-gray-800 border border-gray-300 hover:bg-gray-50",
    subtle: " bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200",
    danger: " bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
  };

  const variantCls = variant ? variantMap[variant] || "" : "";
  const sizeCls = sizeMap[size] || sizeMap.md;

  const classes = `${base}${minArea}${textSize}${sizeCls} ${variantCls} ${className}`.trim();

  // If developer uses <Button as="a" .../>, omit 'type'
  const tagProps = Tag === "button" ? { type } : {};

  return (
    <Tag
      className={classes}
      onTouchEnd={onTouchEnd}
      aria-disabled={disabled || undefined}
      disabled={Tag === "button" ? disabled : undefined}
      {...tagProps}
      {...rest}
    >
      {children}
    </Tag>
  );
}
