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
