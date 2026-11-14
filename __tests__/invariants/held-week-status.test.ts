import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  statusWithHeld, payStatusSays, heldWeeksCell, heldAboveTableSays, payFileCsv, periodHolding, firstDayNeededSays,
  PAY_FILE_COLUMNS, type PayFileRow,
} from '@/lib/money/pay-periods'
import { paidByPayroll } from '@/lib/money/paid-through'
import { DEFAULT_PAY_RHYTHM, type PayRhythm } from '@/lib/pay-dates'

/**
 * A week held off pay because nobody has said whether the person is exempt
 * from overtime, as the payroll clerk reads it on the row, above the table
 * and in the pay file. Found by hand, 2026-11-14: after Process the row
 * read "Processed" and the file "Paid", with nothing about the held week.
 *
 * Calendar facts: Sunday Dec 6, 2026 begins a two-week period ending
 * Saturday Dec 19; Sunday Dec 13, 2026 begins its second week.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const words = (t: string) => t.split(/(?<=\.)\s+/).map((s) => s.split(/\s+/).length)

describe('a held week is said on the row for as long as it is held', () => {
  it('a period whose other hours are all paid reads "Processed, week held" while a week is held, never "Processed" alone', () => {
    expect(statusWithHeld('PROCESSED', 46)).toBe('HELD')
    expect(payStatusSays('HELD', 46)).toBe('Processed, week held')
  })

  it('pending and calculated stay pending and calculated, so Calculate and Process are still offered, and say a week is held', () => {
    expect(statusWithHeld('PENDING', 46)).toBe('PENDING')
    expect(statusWithHeld('CALCULATED', 46)).toBe('CALCULATED')
    expect(payStatusSays('PENDING', 46)).toBe('Pending, week held')
    expect(payStatusSays('CALCULATED', 46)).toBe('Calculated, week held')
  })

  it('once nothing is held, a paid period reads "Processed" as before', () => {
    expect(statusWithHeld('PROCESSED', 0)).toBe('PROCESSED')
    expect(payStatusSays('PROCESSED', 0)).toBe('Processed')
    expect(payStatusSays('PENDING', 0)).toBe('Pending')
  })

  it('the Payroll page shows the route’s status words on the chip, and offers a filter for a week held', () => {
    const page = src('src/app/dashboard/payroll/page.tsx')
    expect(page).toContain("row.statusSays ?? row.payStatus.replace('_', ' ')")
    expect(page).toContain("{ key: 'HELD', label: 'Processed, week held', count: stats.held }")
    const route = src('src/app/api/payroll/route.ts')
    expect(route).toContain('payStatus: statusWithHeld(payStatus, heldHours)')
  })
})

describe('the pay file names a held week and its hours on the person’s line', () => {
  const biweekly: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: '2026-12-06' }
  const p = periodHolding('2026-12-06', biweekly, { holidays: [] })!
  // Week one, 40 hours at $96 = $3,840, paid by an earlier run. Week two,
  // 46 hours, held: none of its hours or pay is on the line's figures.
  const omar: PayFileRow = {
    person: { name: 'Omar Haddad' }, totalApprovedHours: 40, payRate: 9_600, overtimeHours: 0, premiumCents: 0,
    grossPay: 384_000, payCurrency: 'USD', payStatus: 'HELD',
    paidSoFar: { hours: 40, grossCents: 384_000 },
    toPay: { hours: 0, grossCents: 0, overtimeHours: 0, premiumCents: 0, rates: null, rateCents: 9_600 },
    heldWeeks: [{ weekOf: '2026-12-13', hours: 46 }],
  }

  it('the file has a "Held off this pay" column after Status', () => {
    expect(PAY_FILE_COLUMNS.slice(-2)).toEqual(['Status', 'Held off this pay'])
  })

  it('on a period’s file, the person paid $3,840 with a 46-hour week held reads "Paid, week held" and names the week, with nothing of it in the figures', () => {
    const [, line] = payFileCsv([omar], p).trim().split('\n')
    expect(line).toBe(
      'Omar Haddad,0,96.00,0,0.00,0.00,3840.00,USD,2026-12-06,2026-12-19,' + p.payOn +
        ',"Paid, week held","Week of December 13, 2026, 46 hours, overtime answer not recorded"'
    )
  })

  it('on a month’s file, the same line carries the row’s own period and pay day and names the held week the same way', () => {
    const row = { ...omar, payPeriod: { start: '2026-12-01T00:00:00.000Z', end: '2026-12-31T00:00:00.000Z' }, periodPayDay: '2027-01-08' }
    const [, line] = payFileCsv([row], null).trim().split('\n')
    expect(line).toBe(
      'Omar Haddad,0,96.00,0,0.00,0.00,3840.00,USD,2026-12-01,2026-12-31,2027-01-08' +
        ',"Paid, week held","Week of December 13, 2026, 46 hours, overtime answer not recorded"'
    )
  })

  it('a person whose only week in the period is held is still on the file, at no hours and no pay, so the provider is told it is owed', () => {
    const only: PayFileRow = {
      ...omar, totalApprovedHours: 0, grossPay: 0, payStatus: 'PENDING', paidSoFar: null,
      toPay: { hours: 0, grossCents: 0, overtimeHours: 0, premiumCents: 0, rates: null, rateCents: 9_600 },
    }
    const [, line] = payFileCsv([only], p).trim().split('\n')
    expect(line).toBe(
      'Omar Haddad,0,96.00,0,0.00,0.00,0.00,USD,2026-12-06,2026-12-19,' + p.payOn +
        ',"Not worked out yet, week held","Week of December 13, 2026, 46 hours, overtime answer not recorded"'
    )
  })

  it('a person part paid with a week held reads "Part paid, week held"', () => {
    const part: PayFileRow = {
      ...omar, payStatus: 'CALCULATED',
      toPay: { hours: 8, grossCents: 76_800, overtimeHours: 0, premiumCents: 0, rates: null, rateCents: 9_600 }, // 8 x 96
    }
    const [, line] = payFileCsv([part], p).trim().split('\n')
    expect(line).toContain(',8,96.00,0,0.00,768.00,3840.00,USD,')
    expect(line).toContain(',"Part paid, week held","Week of December 13, 2026, 46 hours')
  })

  it('two held weeks are named in order, and a line with nothing held leaves the column empty', () => {
    expect(heldWeeksCell([{ weekOf: '2026-12-13', hours: 46 }, { weekOf: '2026-12-06', hours: 43 }])).toBe(
      'Week of December 6, 2026, 43 hours, overtime answer not recorded; Week of December 13, 2026, 46 hours, overtime answer not recorded'
    )
    expect(heldWeeksCell([])).toBe('')
    expect(heldWeeksCell(null)).toBe('')
  })
})

describe('a held week is found above the Payroll table before the run', () => {
  const r = (name: string, heldHours: number) => ({ person: { name }, heldHours })

  it('one person with a week held is named, with where the answer is recorded, in one sentence under twenty-five words', () => {
    const said = heldAboveTableSays([r('Omar Haddad', 46), r('Ana Lee', 0)])!
    expect(said).toBe('Omar Haddad has a week held off this pay until you record on the row whether the person is exempt from overtime.')
    expect(words(said)).toHaveLength(1)
    expect(words(said)[0]).toBeLessThan(25)
  })

  it('two or three people are named; four or more are counted', () => {
    expect(heldAboveTableSays([r('Omar Haddad', 46), r('Ana Lee', 43), r('Marisol Quintero', 50)])).toBe(
      'Omar Haddad, Ana Lee and Marisol Quintero have a week held off this pay until you record on each row whether the person is exempt from overtime.'
    )
    expect(heldAboveTableSays([r('A', 41), r('B', 42), r('C', 43), r('D', 44)])).toBe(
      '4 people have a week held off this pay until you record on each row whether the person is exempt from overtime.'
    )
  })

  it('nobody held, nothing said', () => {
    expect(heldAboveTableSays([r('Omar Haddad', 0)])).toBeNull()
  })

  it('the Payroll page shows the sentence above the table, from the route, read off every row whatever the filter', () => {
    const page = src('src/app/dashboard/payroll/page.tsx')
    expect(page).toContain('{heldSays && <p')
    expect(src('src/app/api/payroll/route.ts')).toContain('heldSays: heldAboveTableSays(onRun)')
  })
})

describe('the first-day refusal on "Record a placement" never refuses a firm that pays by the month, or a 1099 or C2C line', () => {
  it('a company paying by the month, or twice a month, with no first day set records the W-2 line', () => {
    const chosen = (payPeriod: PayRhythm['payPeriod']): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payPeriod, payFirstPeriodStart: null })
    expect(firstDayNeededSays({ payroll: true, chosen: chosen('MONTHLY') })).toBeNull()
    expect(firstDayNeededSays({ payroll: true, chosen: chosen('SEMIMONTHLY') })).toBeNull()
    expect(firstDayNeededSays({ payroll: true, chosen: chosen('BIWEEKLY') })).not.toBeNull()
    expect(firstDayNeededSays({ payroll: true, chosen: chosen('WEEKLY') })).not.toBeNull()
  })

  it('a 1099 line or a C2C line is not paid by payroll, so the refusal never reaches it', () => {
    expect(paidByPayroll({ contractType: 'IND_1099', vendorCompanyId: null })).toBe(false)
    expect(paidByPayroll({ contractType: 'C2C', vendorCompanyId: null })).toBe(false)
    expect(paidByPayroll({ contractType: 'W2', vendorCompanyId: 'a-supplier' })).toBe(false)
    expect(paidByPayroll({ contractType: 'W2', vendorCompanyId: null })).toBe(true)
  })
})
