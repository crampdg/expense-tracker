// --- date-only helpers (local-noon to avoid DST/UTC shifts) ---
function makeLocalDate(y, m /*0-based*/, d) {
  // noon local time prevents falling back to previous day on DST/UTC conversions
  return new Date(y, m, d, 12, 0, 0, 0)
}
function parseISODateLocal(iso /* YYYY-MM-DD */) {
  const [Y, M, D] = iso.split("-").map(Number)
  return makeLocalDate(Y, M - 1, D)
}


export function calcPeriodEnd(type, start) {
  if (type === "Weekly")     return new Date(start.getTime() + 6  * 24 * 60 * 60 * 1000)
  if (type === "Biweekly")   return new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000)
  if (type === "Custom")     return new Date(start.getTime() + 29 * 24 * 60 * 60 * 1000)

  if (type === "SemiMonthly") {
    const d = start.getDate()
    if (d === 1)  return makeLocalDate(start.getFullYear(), start.getMonth(), 15)                 // 1–15
    else          return makeLocalDate(start.getFullYear(), start.getMonth() + 1, 0)              // 16–EOM
  }
  if (type === "Monthly")    return makeLocalDate(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1)
  if (type === "Annually")   return makeLocalDate(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1)
  return start
}



export function rollForward(type, start) {
  if (type === "Weekly")     return new Date(start.getTime() + 7  * 24 * 60 * 60 * 1000)
  if (type === "Biweekly")   return new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000)
  if (type === "Custom")     return new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)

  if (type === "SemiMonthly") {
    const d = start.getDate()
    if (d <= 1) return makeLocalDate(start.getFullYear(), start.getMonth(), 16)
    return makeLocalDate(start.getFullYear(), start.getMonth() + 1, 1)
  }
  if (type === "Monthly")    return makeLocalDate(start.getFullYear(), start.getMonth() + 1, start.getDate())
  if (type === "Annually")   return makeLocalDate(start.getFullYear() + 1, start.getMonth(), start.getDate())
  return start
}

export function rollBackward(type, start) {
  if (type === "Weekly")     return new Date(start.getTime() - 7  * 24 * 60 * 60 * 1000)
  if (type === "Biweekly")   return new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000)
  if (type === "Custom")     return new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000)

  if (type === "SemiMonthly") {
    const d = start.getDate()
    if (d <= 1) return makeLocalDate(start.getFullYear(), start.getMonth() - 1, 16)
    return makeLocalDate(start.getFullYear(), start.getMonth(), 1)
  }
  if (type === "Monthly")    return makeLocalDate(start.getFullYear(), start.getMonth() - 1, start.getDate())
  if (type === "Annually")   return makeLocalDate(start.getFullYear() - 1, start.getMonth(), start.getDate())
  return start
}



// utils/periodUtils.js
export function getAnchoredPeriodStart(type, anchorDateISO, referenceDate = new Date(), offset = 0) {
  const anchor = parseISODateLocal(anchorDateISO)  // local-noon
  let start

  if (type === "Weekly" || type === "Biweekly" || type === "Custom") {
    const periodDays = type === "Weekly" ? 7 : type === "Biweekly" ? 14 : 30
    const lenMs = periodDays * 24 * 60 * 60 * 1000

    // snap to the period that contains the reference date
    const k = Math.floor((referenceDate - anchor) / lenMs)
    start = new Date(anchor.getTime() + k * lenMs)

    const end = calcPeriodEnd(type, start)
    if (referenceDate > end) start = new Date(start.getTime() + lenMs)
    if (referenceDate < start) start = new Date(start.getTime() - lenMs)

  } else if (type === "SemiMonthly") {
    // 1–15 and 16–end of month
    const d = referenceDate.getDate()
    start = makeLocalDate(referenceDate.getFullYear(), referenceDate.getMonth(), d <= 15 ? 1 : 16)

  } else if (type === "Monthly") {
    const day = anchor.getDate() // e.g., 5
    const y = referenceDate.getFullYear()
    const m = referenceDate.getMonth()

    const candidate = makeLocalDate(y, m, day)
    start = (referenceDate >= candidate) ? candidate : makeLocalDate(y, m - 1, day)

  } else if (type === "Annually") {
    const am = anchor.getMonth()
    const ad = anchor.getDate()
    const y = referenceDate.getFullYear()

    const thisYearStart = makeLocalDate(y, am, ad)
    start = (referenceDate >= thisYearStart) ? thisYearStart : makeLocalDate(y - 1, am, ad)

  } else {
    start = anchor
  }

  // Apply navigation offset
  if (offset > 0) for (let i = 0; i < offset; i++) start = rollForward(type, start)
  if (offset < 0) for (let i = 0; i < -offset; i++) start = rollBackward(type, start)

  return start
}
