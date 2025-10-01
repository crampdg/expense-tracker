import { useRef, useState } from "react"
import Button from "./Button.jsx"

/**
 * ExportPDFButton
 *
 * Props:
 * - targetId: string (required)  -> the DOM id to capture (e.g., "budget-tab", "summary-tab")
 * - filename?: string            -> desired file name (we will prefix with the period if we can detect it)
 * - filenameBuilder?: () => string -> optional function to compute the name at click time
 *
 * Behavior:
 * - Prevents double-download via an internal "busy" lock and disabled state.
 * - Ensures <button type="button"> to avoid form submissions triggering a second download.
 * - If no filename provided, or it doesn't already start with a period prefix,
 *   tries to parse "Period: <start> – <end>" from the target element’s text and
 *   prefixes the file name like "YYYY-MM-DD_to_YYYY-MM-DD_<base>.pdf".
 */
export default function ExportPDFButton({
  targetId,
  filename,
  filenameBuilder,
  className = "",
  children,
}) {
  const [busy, setBusy] = useState(false)
  const lockRef = useRef(false)

  const toISO = (d) => {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  // Try to find "Period: <start> – <end>" in the captured section
  const derivePeriodPrefixFromDOM = () => {
    const el = document.getElementById(targetId)
    if (!el) return null
    const text = el.textContent || ""

    // 1) Prefer the explicit "Period: ..." line (BudgetTab)
    const m = text.match(/Period:\s*([^\n\r–—-]+)\s*[–—-]\s*([^\n\r]+)/)
    if (m) {
      const start = new Date(m[1].trim())
      const end = new Date(m[2].trim())
      if (!isNaN(start) && !isNaN(end)) {
        return `${toISO(start)}_to_${toISO(end)}`
      }
    }

    // 2) Fallback: look for two ISO dates in the content
    const m2 = text.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/s)
    if (m2) return `${m2[1]}_to_${m2[2]}`

    return null
  }

  const computeFileName = () => {
    // Highest priority: explicit builder
    if (typeof filenameBuilder === "function") {
      return filenameBuilder()
    }

    const base = filename || "Export.pdf"
    const periodPrefix = derivePeriodPrefixFromDOM()

    // If we can detect a period and it's not already prefixed, prefix it.
    if (
      periodPrefix &&
      !new RegExp(`^${periodPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(base)
    ) {
      return `${periodPrefix}_${base}`
    }

    return base
  }

  const handleClick = async (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()

    // Debounce & lock to prevent double triggers
    if (lockRef.current || busy) return
    lockRef.current = true
    setBusy(true)

    try {
      const name = computeFileName()
      const { exportElementToPDF } = await import("../../utils/pdfExport.js")
      await exportElementToPDF(targetId, name)
    } catch (err) {
      console.error("Export PDF failed:", err)
    } finally {
      // small delay before unlocking to avoid rapid double clicks
      setTimeout(() => {
        lockRef.current = false
        setBusy(false)
      }, 300)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={className}
      onClick={handleClick}
      disabled={busy}
      title={busy ? "Exporting..." : "Export PDF"}
    >
      {children ?? (busy ? "Exporting…" : "💾 Export PDF")}
    </Button>
  )
}
