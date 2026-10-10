/**
 * Overtime on a cut week, as payroll pays it. Decided by the founder,
 * 2026-09-30: "go with your recommendations, but keep settings user
 * configurable".
 *
 * When the employer accepts fewer hours than were worked and the accepted
 * week is still over the line:
 *
 *   the default          overtime only on the accepted hours above the
 *                        line — 41 of 45 pays 40 + 1, 42 pays 40 + 2.
 *   keep the week's      the paying firm's choice, named and reasoned —
 *   overtime             ordinary hours cut first, 41 pays 36 + 5.
 *
 * At or under the line is straight time either way. The rule is read off
 * the pay line through one reader (`cutOvertimeFor`, lib/cut-overtime-choice)
 * and applied in one place (lib/money/pay-hours), so the run, its screen,
 * the payroll file, back pay and the worker's page cannot disagree.
 * Billing is not touched: the bill still loses the overtime first.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payBands, payCut, payCutSays, paySheet } from '@/lib/money/pay-hours'
import { acceptedDays } from '@/lib/periods'
import { sheetPay, wageLineFor, type WageLine } from '@/lib/money/sheet-overtime'
import { priceByDay } from '@/lib/contract-rate'
import { buildExport, type SheetToPay } from '@/lib/payroll-export'

// Monday 6 July to Friday 10 July 2026, nine hours a day: forty-five, in the
// Sunday-to-Saturday week of Sunday 5 July.
const WEEK = { '2026-07-06': 9, '2026-07-07': 9, '2026-07-08': 9, '2026-07-09': 9, '2026-07-10': 9 }
const SECOND = { '2026-07-13': 9, '2026-07-14': 9, '2026-07-15': 9, '2026-07-16': 9, '2026-07-17': 9 }
const all = (n: number) => ({ hours: n, from: null, to: null })

/** A W-2 buy line as the database holds it, with nothing chosen about a cut week. */
const untouched = {
  contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null, payModel: 'FIXED_HOURLY',
  overtimeAfterHours: null, overtimeMultiplierBps: 15_000, company: { name: 'Brightmoor' },
  cutOvertime: 'ABOVE_THE_LINE', cutOvertimeById: null, cutOvertimeReason: null,
}
/** The same line where the paying firm chose, by name and with a reason, to keep the week's overtime. */
const keeps = {
  ...untouched,
  cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: 'person-dana',
  cutOvertimeReason: 'Our handbook promises overtime on every week worked past forty',
}
const assertion = {
  personId: 'p', status: 'NONEXEMPT', basis: null, wageRule: 'US_FLSA', note: null,
  assertedAt: new Date('2026-06-01T00:00:00Z'), reviewBy: null, assertedByCompanyId: 'co',
  assertedByCompany: { name: 'Brightmoor' }, assertedBy: null,
}
const lineOf = (bc: object): WageLine => wageLineFor(bc as any, 'Priya Venkataraman', assertion)

const pay = (bc: object, accepted: number, days: Record<string, number> = WEEK) =>
  sheetPay({
    days, leaveDays: {}, afterHours: 40, accepted: all(accepted),
    contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: lineOf(bc),
  })
/** Ordinary hours and overtime hours paid, across the sheet. */
const split = (p: ReturnType<typeof pay>) => [
  p.cut.weeks.reduce((n, w) => n + w.regular + w.leave, 0),
  p.cut.weeks.reduce((n, w) => n + w.over, 0),
]
const premium = (p: ReturnType<typeof pay>) => Math.round([...p.premiums.values()].reduce((n, x) => n + x.premiumCents, 0))

describe('the default: overtime only on the accepted hours over the line', () => {
  it('a line nobody touched pays overtime only on the accepted hours over the line', () => {
    expect(lineOf(untouched).cutOvertime).toBe('ABOVE_THE_LINE')
    // A line whose column was never written reads the same.
    const { cutOvertime: _, cutOvertimeById: __, cutOvertimeReason: ___, ...bare } = untouched
    expect(lineOf(bare).cutOvertime).toBe('ABOVE_THE_LINE')
    expect(split(pay(bare, 41))).toEqual([40, 1])
  })

  it('41 of 45 accepted pays 40 ordinary hours and 1 hour of overtime', () => {
    expect(split(pay(untouched, 41))).toEqual([40, 1])
  })

  it('42 of 45 accepted pays 40 ordinary hours and 2 hours of overtime', () => {
    expect(split(pay(untouched, 42))).toEqual([40, 2])
  })

  it('has no jump at the line: each hour accepted past 40 adds exactly one hour of overtime', () => {
    expect([40, 41, 42, 43, 44, 45].map((n) => split(pay(untouched, n)))).toEqual([
      [40, 0], [40, 1], [40, 2], [40, 3], [40, 4], [40, 5],
    ])
  })

  it('41 of 45 at $66 an hour is $2,706 of straight time and $33 of premium', () => {
    const p = pay(untouched, 41)
    expect(priceByDay({ contractRateCents: 6_600, periods: [], days: p.days }).cents).toBe(41 * 6_600)
    expect(premium(p)).toBe(1 * 3_300)
  })

  it('a two-week sheet loses its overtime from the latest week back: 82 of 90 pays 40 + 2 and then 40', () => {
    const p = pay(untouched, 82, { ...WEEK, ...SECOND })
    expect(p.cut.weeks.map((w) => [w.weekOf, w.regular, w.over])).toEqual([
      ['2026-07-05', 40, 2],
      ['2026-07-12', 40, 0],
    ])
  })

  it('says in a sentence that the cut came off the hours over the line, so overtime is paid only on the accepted hours over it', () => {
    expect(pay(untouched, 42).says).toBe(
      'Brightmoor accepted 42 of the 45 hours Priya Venkataraman filed, so 42 are paid. The 3 not accepted come off ' +
        'the hours over the line first, from the last day back, so overtime is paid only on the accepted hours over the line.'
    )
  })
})

describe('the paying firm’s choice: keep the week’s overtime', () => {
  it('41 of 45 accepted pays 36 ordinary hours and 5 hours of overtime', () => {
    expect(lineOf(keeps).cutOvertime).toBe('KEEP_WEEK_OVERTIME')
    expect(split(pay(keeps, 41))).toEqual([36, 5])
  })

  it('42 of 45 accepted pays 37 ordinary hours and 5 hours of overtime', () => {
    expect(split(pay(keeps, 42))).toEqual([37, 5])
  })

  it('41 of 45 at $66 an hour is $2,706 of straight time and $165 of premium', () => {
    const p = pay(keeps, 41)
    expect(priceByDay({ contractRateCents: 6_600, periods: [], days: p.days }).cents).toBe(41 * 6_600)
    expect(premium(p)).toBe(5 * 3_300)
  })

  it('a choice to keep the week’s overtime that names nobody, or gives no reason, is paid by the default', () => {
    expect(split(pay({ ...keeps, cutOvertimeById: null }, 41))).toEqual([40, 1])
    expect(split(pay({ ...keeps, cutOvertimeReason: '  ' }, 41))).toEqual([40, 1])
  })

  it('says in a sentence that the cut came off ordinary hours, so the week keeps its overtime', () => {
    expect(pay(keeps, 42).says).toBe(
      'Brightmoor accepted 42 of the 45 hours Priya Venkataraman filed, so 42 are paid. The 3 not accepted come off ' +
        'ordinary hours first, from the last day back, so hours over the line keep their premium.'
    )
  })
})

describe('at or under the line, the rule changes nothing', () => {
  it('40 and 38 of 45 accepted are paid at straight time under either rule', () => {
    for (const bc of [untouched, keeps]) {
      expect(split(pay(bc, 40))).toEqual([40, 0])
      expect(split(pay(bc, 38))).toEqual([38, 0])
      expect(premium(pay(bc, 38))).toBe(0)
    }
  })

  it('a week accepted under the line still says it is paid at straight time under the default', () => {
    const p = pay(untouched, 38)
    expect(p.straightTime.map((w) => [w.accepted, w.filed, w.worked, w.line])).toEqual([[38, 45, 38, 40]])
    expect(p.says).toContain('Week of July 5, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.')
  })

  it('a week accepted in full is paid 40 + 5 under either rule, with nothing to say about a cut', () => {
    for (const bc of [untouched, keeps]) {
      expect(split(pay(bc, 45))).toEqual([40, 5])
      expect(pay(bc, 45).says).toBeNull()
    }
  })
})

describe('the bill is not touched', () => {
  it('the bill still loses the overtime first, whichever rule pays the worker: 41 of 45 bills 40 ordinary and 1 over the line', () => {
    const billed = acceptedDays(payBands(WEEK, {}, 40), all(41))
    expect([billed.reduce((n, d) => n + d.regular, 0), billed.reduce((n, d) => n + d.over, 0)]).toEqual([40, 1])
    // And the worker who keeps the week's overtime is paid 36 + 5 on the same week.
    expect(split(pay(keeps, 41))).toEqual([36, 5])
  })
})

describe('one rule, read once, for every reader of pay', () => {
  it('the cut itself says which rule it was taken under', () => {
    expect(payCut(payBands(WEEK, {}, 40), all(41), 40, 'ABOVE_THE_LINE').rule).toBe('ABOVE_THE_LINE')
    expect(payCut(payBands(WEEK, {}, 40), all(41), 40, 'KEEP_WEEK_OVERTIME').rule).toBe('KEEP_WEEK_OVERTIME')
    expect(payCutSays(payCut(payBands(WEEK, {}, 40), all(41), 40, 'ABOVE_THE_LINE'), { personName: 'Priya' })).toContain(
      'overtime is paid only on the accepted hours over the line'
    )
  })

  it('the straight time the run pays and the premium it adds are cut by the same rule', () => {
    for (const bc of [untouched, keeps]) {
      const line = lineOf(bc)
      const run = paySheet({ all: WEEK, mine: WEEK, leaveDays: {}, afterHours: 40, accepted: all(41), cutOvertime: line.cutOvertime })
      expect(run.days).toEqual(pay(bc, 41).days)
    }
  })

  it('the payroll file pays 41 of 45 as 40 + 1 by default and 36 + 5 where the week’s overtime is kept', () => {
    const row = (cutOvertime: 'ABOVE_THE_LINE' | 'KEEP_WEEK_OVERTIME'): SheetToPay => ({
      personName: 'Priya Venkataraman', payrollId: 'E1', contractType: 'W2', weAreTheEmployer: true,
      periodStart: new Date('2026-07-05T00:00:00Z'), periodEnd: new Date('2026-07-11T00:00:00Z'),
      weeks: [{ weekOf: '2026-07-05', regularHours: 40, leaveHours: 0, overHours: 5, client: { treatment: null, appliedBps: null } }],
      submittedHours: 45, acceptedHours: 41, employerAcceptedAt: new Date('2026-07-11T00:00:00Z'),
      payRateCents: 6_600, payModel: 'FIXED_HOURLY', paidOnSalaryBasis: false, rule: 'US_FLSA',
      assertion: lineOf(untouched).assertion, currency: 'USD', costCode: null, orderNumber: null, employerName: 'Brightmoor',
      cutOvertime,
    })
    const byDefault = buildExport('ADP', [row('ABOVE_THE_LINE')]).lines[0]
    expect([byDefault.hours, byDefault.overtimeHours]).toEqual([40, 1])
    const kept = buildExport('ADP', [row('KEEP_WEEK_OVERTIME')]).lines[0]
    expect([kept.hours, kept.overtimeHours]).toEqual([36, 5])
  })

  it('the run, its screen and the payroll file read the rule off the pay line, and the file loads the columns that say who chose it and why', () => {
    const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8')
    const run = src('app/api/payroll/run/route.ts')
    const screen = src('app/api/payroll/route.ts')
    const file = src('app/api/payroll/export/route.ts')
    for (const route of [run, screen, file]) expect(route).toContain('cutOvertimeFor(')
    expect(file).toContain('cutOvertime: true, cutOvertimeById: true, cutOvertimeReason: true')
    // Back pay and the worker's page reach it through wageLineFor, which reads it the same way.
    expect(src('lib/money/sheet-overtime.ts')).toContain('cutOvertime: cutOvertimeFor(bc).rule')
  })
})
