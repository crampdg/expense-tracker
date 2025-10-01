export default function Button({
  className = "",
  variant = "primary", // "primary" | "ghost" | "outline" | "danger" | "subtle"
  size = "md",         // "sm" | "md" | "lg"
  loading = false,
  disabled = false,
  type = "button",
  children,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center select-none rounded-2xl font-medium shadow-sm " +
    "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  const sizes = {
    sm: "text-xs px-2.5 py-1.5",
    md: "text-sm px-3.5 py-2.5",
    lg: "text-base px-4.5 py-3",
  };

  const variants = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500",
    ghost:
      "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 focus:ring-gray-300",
    outline:
      "bg-transparent text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 focus:ring-gray-300",
    danger:
      "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500",
    subtle:
      "bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 focus:ring-gray-300",
  };

  const cls = [
    base,
    sizes[size] || sizes.md,
    variants[variant] || variants.primary,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // One unified click handler is enough; relying on onClick avoids double-firing on mobile
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={cls}
      disabled={isDisabled}
      aria-busy={loading ? "true" : "false"}
      {...props}
    >
      {loading ? "…" : children}
    </button>
  );
}
