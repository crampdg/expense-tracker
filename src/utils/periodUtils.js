export function calcPeriodEnd(type, start) {
  if (type === "Weekly") {
    return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  }
  if (type === "Biweekly") {
    return new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000)
  }
  if (type === "SemiMonthly") {
    const d = start.getUTCDate()
    if (d === 1) {
      // 1 → 15
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 15))
    } else {
      // 16 → end of month
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    }
  }
  if (type === "Monthly") {
    // End = day-1 of next month
    return new Date(Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      start.getUTCDate() - 1
    ))
  }
  if (type === "Annually") {
    // End = day-1 of next year, same month
    return new Date(Date.UTC(
      start.getUTCFullYear() + 1,
      start.getUTCMonth(),
      start.getUTCDate() - 1
    ))
  }
  if (type === "Custom") {
    return new Date(start.getTime() + 29 * 24 * 60 * 60 * 1000)
  }
  return start
}


export function rollForward(type, start) {
  if (type === "Weekly") {
    return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
  if (type === "Biweekly") {
    return new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000)
  }
  if (type === "SemiMonthly") {
    const s = start.getUTCDate()
    if (s <= 1) {
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 16))
    }
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  }
  if (type === "Monthly") {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()))
  }
  if (type === "Annually") {
    return new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()))
  }
  if (type === "Custom") {
    return new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
  }
  return start
}

export function rollBackward(type, start) {
  if (type === "Weekly") {
    return new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
  if (type === "Biweekly") {
    return new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000)
  }
  if (type === "SemiMonthly") {
    const s = start.getUTCDate()
    if (s <= 1) {
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 16))
    }
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  }
  if (type === "Monthly") {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, start.getUTCDate()))
  }
  if (type === "Annually") {
    return new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate()))
  }
  if (type === "Custom") {
    return new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
  return start
}


// utils/periodUtils.js
export function getAnchoredPeriodStart(type, anchorDateISO, referenceDate = new Date(), offset = 0) {
  const anchor = new Date(anchorDateISO)
  let start

  if (type === "Weekly" || type === "Biweekly" || type === "Custom") {
    const periodDays =
      type === "Weekly" ? 7 :
      type === "Biweekly" ? 14 :
      30

    const lenMs = periodDays * 24 * 60 * 60 * 1000
    const k = Math.floor((referenceDate - anchor) / lenMs)
    start = new Date(anchor.getTime() + k * lenMs)

    const end = calcPeriodEnd(type, start)
    if (referenceDate > end) start = new Date(start.getTime() + lenMs)
    if (referenceDate < start) start = new Date(start.getTime() - lenMs)

  } else if (type === "SemiMonthly") {
    // Periods: 1–15 and 16–end of month
    const d = referenceDate.getDate()
    start = new Date(Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      d <= 15 ? 1 : 16
    ))

  } else if (type === "Monthly") {
    const day = anchor.getDate() // anchor day-of-month
    const y = referenceDate.getFullYear()
    const m = referenceDate.getMonth()

    const candidate = new Date(Date.UTC(y, m, day))
    start = (referenceDate >= candidate)
      ? candidate
      : new Date(Date.UTC(y, m - 1, day))

  } else if (type === "Annually") {
    const am = anchor.getMonth()
    const ad = anchor.getDate()
    const y = referenceDate.getFullYear()

    const thisYearStart = new Date(Date.UTC(y, am, ad))
    start = (referenceDate >= thisYearStart)
      ? thisYearStart
      : new Date(Date.UTC(y - 1, am, ad))

  } else {
    // Fallback: use anchor directly
    start = anchor
  }

  // Apply offset (Previous/Next navigation)
  if (offset > 0) for (let i = 0; i < offset; i++) start = rollForward(type, start)
  if (offset < 0) for (let i = 0; i < -offset; i++) start = rollBackward(type, start)

  return start
}
