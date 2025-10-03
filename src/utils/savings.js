// src/utils/savings.js
import { startOfDay } from "./periodUtils";

// Pure helpers so UI stays simple

export function daysInRangeClamped(periodStart, periodEnd, today = new Date()) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const t = startOfDay(today);
  const from = startOfDay(start);
  const to = startOfDay(end);

  if (t < from) return 0;
  if (t > to) return Math.max(0, (to - from) / 86400000 + 1);
  return Math.max(0, (t - from) / 86400000 + 1);
}

/**
 * Compute how much to reserve in the current period up to "today".
 * If reserveOnMonthStart is true, we reserve the whole period amount on day 1.
 * Otherwise we accrue daily (linear) so "reserved this period" grows each day.
 */
export function computeReservedThisPeriod({
  reserveDaily = 0,
  reserveOnMonthStart = false,
  periodStart,
  periodEnd,
  today = new Date(),
}) {
  if (!reserveDaily || !periodStart || !periodEnd) return 0;

  const daysTotal =
    Math.max(1, Math.round((startOfDay(new Date(periodEnd)) - startOfDay(new Date(periodStart))) / 86400000) + 1);

  const daily = Number(reserveDaily) || 0;

  if (reserveOnMonthStart) {
    return daily * daysTotal;
  }

  const daysSoFar = Math.floor(daysInRangeClamped(periodStart, periodEnd, today));
  return daily * daysSoFar;
}

/**
 * Spendable = inflows - outflows - reservedThisPeriod (+/- other adjustments).
 * Caller passes the raw totals; we only subtract the reservation.
 */
export function applySavingsReservationToSpendable(spendable, reservedThisPeriod) {
  const r = Number(reservedThisPeriod) || 0;
  return Math.max(0, (Number(spendable) || 0) - r);
}
