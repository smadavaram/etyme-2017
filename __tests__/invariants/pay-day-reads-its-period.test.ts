import { describe, it, expect } from 'vitest'
import { periodFor, type Terms } from '@/lib/periods'
import { periodPaidBy, payDaysToMark } from '@/lib/money/pay-day-period'
import { periodPayDay, periodPayStatus, type PayCycle } from '@/lib/money/payroll-rows'

/**
 * A pay day pays the period its own row says it pays.
 *
 * Walked 2026-11-14: October's pay file gave a line that started on
 * Wednesday Sep 30 "Pay day 2026-10-09; 2026-11-09". Its first cycle is
 * the one-day period Sep 30 to Sep 30, paid Oct 9; its second is October,
 * paid Nov 9. Counted by days since the line started, Oct 9 covers Sep 30
 * to Oct 9: one day of September and nine of October, so the guess gave
 * Oct 9 to October. The row says September. The row is read first, and the
 * guess is kept only for rows with no period written.
 */

const D = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const MONTHLY: Terms = { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: D('2026-09-30') }
const of = (d: Date) => periodFor(d, MONTHLY)
const month = (m: string) => of(D(`${m}-01`))

const cycle = (id: string, kind: string, due: string, periodEnd: string | null, completedAt: string | null = null): PayCycle => ({
  id, kind, dueOn: D(due), completedAt: completedAt ? D(completedAt) : null, periodEnd: periodEnd ? D(periodEnd) : null,
})

/** The seeded line, as its Cycle rows hold it. */
const line = (paidSeptember = false): PayCycle[] => [
  cycle('calc-sep', 'SALARY_CALCULATE', '2026-10-07', '2026-09-30', paidSeptember ? '2026-10-07' : null),
  cycle('pay-sep', 'SALARY_PAY', '2026-10-09', '2026-09-30', paidSeptember ? '2026-10-08' : null),
  cycle('calc-oct', 'SALARY_CALCULATE', '2026-11-06', '2026-10-31'),
  cycle('pay-oct', 'SALARY_PAY', '2026-11-09', '2026-10-31'),
]
const started = D('2026-09-30')

describe('a pay day pays the period its own row says it pays', () => {
  it('October’s pay day for a line that started on Sep 30 is Nov 9 alone, never "2026-10-09; 2026-11-09"', () => {
    expect(periodPayDay(line(), month('2026-10'), of, started)).toBe('2026-11-09')
  })

  it('September’s pay day for the same line is Oct 9, the day its one-day period of Sep 30 is paid', () => {
    expect(periodPayDay(line(), month('2026-09'), of, started)).toBe('2026-10-09')
  })

  it('Oct 9 pays September by its row (period Sep 30 to Sep 30), where days since the start would give it October: 1 day of September, 9 of October', () => {
    const pays = line().filter((c) => c.kind === 'SALARY_PAY')
    expect(iso(periodPaidBy(pays[0], pays, of, started).start)).toBe('2026-09-01')
    // The same row with no period written falls back to the older count, which gives October.
    const older = pays.map((c) => ({ ...c, periodEnd: null }))
    expect(iso(periodPaidBy(older[0], older, of, started).start)).toBe('2026-10-01')
  })

  it('the row’s status agrees with its pay day: September paid on Oct 9 reads Processed and October still reads Pending', () => {
    expect(periodPayStatus(line(true), month('2026-09'), of, started)).toBe('PROCESSED')
    expect(periodPayStatus(line(true), month('2026-10'), of, started)).toBe('PENDING')
  })

  it('a run for October marks Nov 9 alone, and a run for September marks Oct 9 alone, the same pay days the file names', () => {
    const pays = line().filter((c) => c.kind === 'SALARY_PAY')
    expect(payDaysToMark(pays, [month('2026-10')], of, started).map((c) => iso(c.dueOn))).toEqual(['2026-11-09'])
    expect(payDaysToMark(pays, [month('2026-09')], of, started).map((c) => iso(c.dueOn))).toEqual(['2026-10-09'])
  })

  it('a line paid nine days after the month with no period written is still placed by days since the pay day before: Aug 7 pays July', () => {
    const older: PayCycle[] = [cycle('jul', 'SALARY_PAY', '2026-07-09', null), cycle('aug', 'SALARY_PAY', '2026-08-07', null)]
    expect(periodPayDay(older, month('2026-07'), of, D('2026-06-01'))).toBe('2026-08-07')
  })
})
