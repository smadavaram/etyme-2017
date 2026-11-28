/**
 * The next pay date on a line, and the ones already overdue.
 *
 * The payroll screen read a line's cycles newest first and took the
 * first open one, which is the LAST pay date ever generated — a
 * placement running to 2027 showed "Next pay" in February 2027 while
 * this month's pay date sat open above it.
 *
 * Two facts, kept apart. "Next pay" is the earliest open date on or
 * after today: the one coming. An open date before today is not next —
 * it is overdue — and a screen that calls February "next" in September
 * misleads as much as one that says 2027. So those are counted and the
 * oldest is named, beside it.
 */

type C = { kind: string; dueOn: Date; completedAt: Date | null }

/** The earliest open date of this kind, on or after `from` where given. */
export function nextOpen<T extends C>(cycles: T[], kind: string, from?: Date | null): T | null {
  let best: T | null = null
  for (const c of cycles) {
    if (c.kind !== kind || c.completedAt) continue
    if (from && c.dueOn < from) continue
    if (!best || c.dueOn < best.dueOn) best = c
  }
  return best
}

/** Open dates of this kind before `before`: how many, and the oldest. */
export function overdueOpen<T extends C>(cycles: T[], kind: string, before: Date): { count: number; earliest: Date | null } {
  let count = 0
  let earliest: Date | null = null
  for (const c of cycles) {
    if (c.kind !== kind || c.completedAt || c.dueOn >= before) continue
    count++
    if (!earliest || c.dueOn < earliest) earliest = c.dueOn
  }
  return { count, earliest }
}

/** Midnight UTC today, the day a cycle's date is compared against. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
