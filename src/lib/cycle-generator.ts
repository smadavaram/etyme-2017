/**
 * Cycle generation engine.
 *
 * CLAUDE.md: "Port the arithmetic, not the architecture, and write the tests first."
 *
 * Nineteen kinds, five frequencies, business-day shifting against a
 * per-company holiday calendar, month ends, February, and idempotency
 * on extension.
 *
 * This module generates the full Cycle chain for an assignment.
 * Generated on contract start, extended on extension.
 */

export type CycleKind =
  | 'TIMESHEET_SUBMIT'
  | 'TIMESHEET_APPROVE'
  | 'INVOICE_GENERATE'
  | 'INVOICE_DUE'
  | 'SALARY_PAY'
  | 'SALARY_PROCESS'
  | 'VENDOR_BILL_DUE'
  | 'VENDOR_BILL_GENERATE'
  | 'TAX_DEPOSIT'
  | 'TAX_RETURN'
  | 'COMMISSION_CALCULATE'
  | 'COMMISSION_PAY'
  | 'INSURANCE_RENEW'
  | 'COMPLIANCE_CHECK'
  | 'VISA_TRACK'
  | 'IR35_ASSESSMENT'
  | 'GST_RETURN'
  | 'PF_DEPOSIT'
  | 'PERFORMANCE_REVIEW'

export type CycleFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'ON_COMPLETION'

export interface CycleDefinition {
  kind: CycleKind
  frequency: CycleFrequency
  offsetDays: number // days after the period end when the cycle is due
}

export interface GeneratedCycle {
  kind: string
  dueOn: Date
}

const WEEKEND_DAYS = [0, 6] // Sunday, Saturday

/**
 * Shift a date to the next business day if it falls on a weekend.
 * Does not check holidays (per-company calendar would be needed for that).
 */
function shiftToBusinessDay(date: Date, holidays: Set<string> = new Set()): Date {
  const d = new Date(date)
  const key = () => d.toISOString().slice(0, 10)

  while (WEEKEND_DAYS.includes(d.getDay()) || holidays.has(key())) {
    d.setDate(d.getDate() + 1)
  }

  return d
}

/**
 * Get the last day of a month.
 */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0)
}

/**
 * Generate period end dates for a given frequency between start and end dates.
 */
function generatePeriodEnds(
  start: Date,
  end: Date,
  frequency: CycleFrequency
): Date[] {
  const periods: Date[] = []
  const current = new Date(start)

  switch (frequency) {
    case 'WEEKLY': {
      // Find the next Friday from start
      const first = new Date(current)
      while (first.getDay() !== 5) first.setDate(first.getDate() + 1)

      const cursor = new Date(first)
      while (cursor <= end) {
        periods.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + 7)
      }
      break
    }

    case 'BIWEEKLY': {
      // Every 14 days from start
      const first = new Date(current)
      while (first.getDay() !== 5) first.setDate(first.getDate() + 1)

      const cursor = new Date(first)
      while (cursor <= end) {
        periods.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + 14)
      }
      break
    }

    case 'SEMIMONTHLY': {
      // 15th and last day of each month
      let year = current.getFullYear()
      let month = current.getMonth()

      while (true) {
        const mid = new Date(year, month, 15)
        if (mid >= current && mid <= end) periods.push(mid)

        const eom = lastDayOfMonth(year, month)
        if (eom >= current && eom <= end) periods.push(eom)

        month++
        if (month > 11) { month = 0; year++ }
        if (new Date(year, month, 1) > end) break
      }
      break
    }

    case 'MONTHLY': {
      // Last day of each month
      let year = current.getFullYear()
      let month = current.getMonth()

      while (true) {
        const eom = lastDayOfMonth(year, month)
        if (eom >= current && eom <= end) periods.push(eom)

        month++
        if (month > 11) { month = 0; year++ }
        if (new Date(year, month, 1) > end) break
      }
      break
    }

    case 'ON_COMPLETION': {
      // Single cycle at the end
      periods.push(new Date(end))
      break
    }
  }

  return periods
}

/**
 * Generate the full Cycle chain for an assignment.
 *
 * @param start - Assignment start date
 * @param end - Assignment end date
 * @param definitions - Cycle definitions from the template pack
 * @param holidays - Company holiday dates (YYYY-MM-DD strings)
 * @param existingDates - Already-generated cycle due dates for idempotency
 * @returns Array of cycles to create
 */
export function generateCycles(
  start: Date,
  end: Date,
  definitions: CycleDefinition[],
  holidays: string[] = [],
  existingDates: Map<string, Set<string>> = new Map()
): GeneratedCycle[] {
  const cycles: GeneratedCycle[] = []
  const holidaySet = new Set(holidays)

  for (const def of definitions) {
    const periodEnds = generatePeriodEnds(start, end, def.frequency)
    const existing = existingDates.get(def.kind) ?? new Set()

    for (const periodEnd of periodEnds) {
      // Apply offset
      const due = new Date(periodEnd)
      due.setDate(due.getDate() + def.offsetDays)

      // Shift to business day
      const shifted = shiftToBusinessDay(due, holidaySet)

      // Idempotency: skip if this date already exists for this kind
      const key = `${def.kind}-${shifted.toISOString().slice(0, 10)}`
      if (existing.has(shifted.toISOString().slice(0, 10))) continue

      cycles.push({
        kind: def.kind,
        dueOn: shifted,
      })
    }
  }

  // Sort by due date
  cycles.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())

  return cycles
}
