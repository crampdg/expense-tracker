import { forwardRef } from "react";

/**
 * Card
 *
 * Props:
 * - as?: string | React.Component (default: "div")
 * - className?: string
 * - interactive?: boolean  // adds subtle hover + transition for clickable cards
 * - children?: ReactNode
 * - ...rest: forwards id, aria-*, data-*, onClick, etc.
 *
 * Usage:
 *  <Card>...</Card>
 *  <Card className="p-0">...</Card>
 *  <Card as="section" id="budget-tab">...</Card>
 *  <Card interactive onClick={...}>...</Card>
 */
const Card = forwardRef(function Card(
  { as: As = "div", className = "", interactive = false, children, ...rest },
  ref
) {
  const interactiveClasses = interactive
    ? " transition-shadow hover:shadow-md"
    : "";

  return (
    <As ref={ref} className={`card ${interactiveClasses} ${className}`} {...rest}>
      {children}
    </As>
  );
});

export default Card;
