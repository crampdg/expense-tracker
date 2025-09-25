export function calcPeriodEnd(type, start) {
  if (type === "Weekly") {
    return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  }
  if (type === "Biweekly") {
    return new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000)
  }
  if (type === "SemiMonthly") {
    // if start is 1st, end on 15th; else end on last day of month
    const s = start.getDate()
    if (s <= 1) return new Date(start.getFullYear(), start.getMonth(), 15)
    return new Date(start.getFullYear(), start.getMonth() + 1, 0)
  }
  if (type === "Monthly") {
    return new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1)
  }
  if (type === "Annually") {
    return new Date(start.getFullYear(), 11, 31)
  }
  if (type === "Custom") {
    // fallback: 30 days
    return new Date(start.getTime() + 29 * 24 * 60 * 60 * 1000)
  }
}

export function rollForward(type, start) {
  if (type === "Weekly") return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  if (type === "Biweekly") return new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000)
  if (type === "SemiMonthly") {
    const s = start.getDate()
    if (s <= 1) return new Date(start.getFullYear(), start.getMonth(), 16)
    return new Date(start.getFullYear(), start.getMonth() + 1, 1)
  }
  if (type === "Monthly") return new Date(start.getFullYear(), start.getMonth() + 1, start.getDate())
  if (type === "Annually") return new Date(start.getFullYear() + 1, 0, 1)
  if (type === "Custom") return new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
}

export function rollBackward(type, start) {
  if (type === "Weekly") return new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (type === "Biweekly") return new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000)
  if (type === "SemiMonthly") {
    const s = start.getDate()
    if (s <= 1) return new Date(start.getFullYear(), start.getMonth() - 1, 16)
    return new Date(start.getFullYear(), start.getMonth(), 1)
  }
  if (type === "Monthly") return new Date(start.getFullYear(), start.getMonth() - 1, start.getDate())
  if (type === "Annually") return new Date(start.getFullYear() - 1, 0, 1)
  if (type === "Custom") return new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000)
}

// utils/periodUtils.js
export function getAnchoredPeriodStart(type, anchorDateISO, referenceDate = new Date(), offset = 0) {
  const anchor = new Date(anchorDateISO)

  // Find the period START that contains the referenceDate, but aligned to the anchor
  let start

  if (type === "Weekly" || type === "Biweekly" || type === "Custom") {
    const periodDays = type === "Weekly" ? 7 : type === "Biweekly" ? 14 : 30
    const lenMs = periodDays * 24 * 60 * 60 * 1000
    // how many whole periods since anchor?
    const k = Math.floor((referenceDate - anchor) / lenMs)
    start = new Date(anchor.getTime() + k * lenMs)
    // ensure reference is inside [start, end]
    const end = calcPeriodEnd(type, start)
    if (referenceDate > end) start = new Date(start.getTime() + lenMs)
    if (referenceDate < start) start = new Date(start.getTime() - lenMs)
  } else if (type === "SemiMonthly") {
    // Two fixed windows: 1–15 and 16–end. Anchor only decides which side to prefer.
    const d = referenceDate.getDate()
    start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), d <= 15 ? 1 : 16)
  } else if (type === "Monthly") {
    // Use the DAY OF MONTH from the anchor
    const day = anchor.getDate() // e.g., 4 → periods run 4..3
    const y = referenceDate.getFullYear()
    const m = referenceDate.getMonth()
    start = referenceDate.getDate() >= day
      ? new Date(y, m, day)
      : new Date(y, m - 1, day)
  } else if (type === "Annually") {
    // Use MONTH/DAY from anchor
    const am = anchor.getMonth(), ad = anchor.getDate()
    const y = referenceDate.getFullYear()
    const thisYearStart = new Date(y, am, ad)
    start = (referenceDate >= thisYearStart) ? thisYearStart : new Date(y - 1, am, ad)
  } else {
    // fallback to anchor
    start = anchor
  }

  // Apply UI navigation offset (Previous/Next)
  if (offset > 0) for (let i = 0; i < offset; i++) start = rollForward(type, start)
  if (offset < 0) for (let i = 0; i < -offset; i++) start = rollBackward(type, start)

  return start
}
