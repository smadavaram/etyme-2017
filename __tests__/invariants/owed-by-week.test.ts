import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { owedByWeek, type OwedSheet, type OwedPayLine, type PaidSoFar } from '@/lib/consultant-portfolio'
import type { WageLine } from '@/lib/money/sheet-overtime'
import type { RatePeriod } from '@/lib/contract-rate'

/**
 * What a worker is owed, on her own page, is what payroll pays her.
 *
 * Money reported on 2026-09-29 that the worker's page priced a
 * non-exempt worker's forty-five-hour week as forty-five hours of
 * straight time, while payroll paid the premium on the five over the
 * line. `owedByWeek` now asks payroll's own functions, and these are the
 * sentences it has to keep true.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const NONEXEMPT: WageLine = {
  personName: 'Rosa Delgado',
  contractType: 'W2',
  weAreTheEmployer: true,
  payModel: 'FIXED_HOURLY',
  rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'brightmoor', assertedByCompanyName: 'Brightmoor Staffing',
    assertedByName: null, assertedAt: d('2026-01-01'), note: null, reviewBy: null,
  },
  contractPremiumBps: 15_000,
  employerName: 'Brightmoor Staffing',
}

const AT_70: RatePeriod[] = [{ id: 'r70', rateCents: 7_000, fromDate: d('2026-01-01'), toDate: null, approvalState: 'APPROVED' }]
const RAISE_ON_WEDNESDAY: RatePeriod[] = [
  { id: 'r66', rateCents: 6_600, fromDate: d('2026-02-02'), toDate: d('2026-06-30'), approvalState: 'APPROVED' },
  { id: 'r70', rateCents: 7_000, fromDate: d('2026-07-01'), toDate: null, approvalState: 'APPROVED' },
]

function line(over: Partial<OwedPayLine> = {}): OwedPayLine {
  return {
    contractRateCents: 7_000,
    periods: AT_70,
    afterHours: 40,
    method: 'US_REGULAR_RATE',
    wage: NONEXEMPT,
    currency: 'USD',
    ...over,
  }
}

function sheet(days: Record<string, number>, over: Partial<OwedSheet> = {}): OwedSheet {
  const keys = Object.keys(days).sort()
  return {
    id: 'ts1',
    days,
    leaveDays: {},
    acceptedHours: null,
    totalHours: Object.values(days).reduce((a, b) => a + b, 0),
    periodStart: d(keys[0]),
    periodEnd: d(keys[keys.length - 1]),
    ...over,
  }
}

/** Monday 7 September 2026, nine hours a day: forty-five hours. */
const LONG_WEEK = {
  '2026-09-07': 9, '2026-09-08': 9, '2026-09-09': 9, '2026-09-10': 9, '2026-09-11': 9,
}
const nothingPaid = () => undefined

describe('what a worker is owed on her own page is what payroll pays her', () => {
  it("a non-exempt worker's forty-five-hour week at $70 is owed forty ordinary hours and five overtime hours, $3,325.00 in all", () => {
    const [w] = owedByWeek([sheet(LONG_WEEK)], line(), nothingPaid)

    expect(w.weekOf).toBe('2026-09-07')
    expect(w.priced).toBe(true)
    expect([w.hours, w.ordinaryHours, w.overtimeHours]).toEqual([45, 40, 5])
    // Half of $70 again on each of the five hours.
    expect(w.premiumCents).toBe(17_500)
    expect(w.owedCents).toBe(332_500)
    expect(w.owedCents).not.toBe(45 * 7_000)
    expect(w.stillOwedCents).toBe(332_500)
    expect(w.says).toBe(
      '45 hours: 40 ordinary and 5 overtime. The 5 hours of overtime earn an extra $175.00 on top of your usual pay.'
    )
  })

  it('a forty-five-hour week across a raise from $66 to $70 is owed $3,257.44, the figure payroll pays on the US regular rate', () => {
    const [w] = owedByWeek(
      [sheet({ '2026-06-29': 8, '2026-06-30': 8, '2026-07-01': 8, '2026-07-02': 8, '2026-07-03': 13 })],
      line({ contractRateCents: 6_600, periods: RAISE_ON_WEDNESDAY }),
      nothingPaid
    )

    // $3,086 straight time; a regular rate of $3,086 / 45; half of it on
    // each of five hours is $171.44, rounded once.
    expect(w.premiumCents).toBe(17_144)
    expect(w.owedCents).toBe(325_744)
    expect(w.says).toContain('paid at two rates that week')
  })

  it('a forty-hour week has no overtime and says so in plain words', () => {
    const [w] = owedByWeek(
      [sheet({ '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 })],
      line(),
      nothingPaid
    )

    expect([w.hours, w.ordinaryHours, w.overtimeHours, w.premiumCents]).toEqual([40, 40, 0, 0])
    expect(w.owedCents).toBe(280_000)
    expect(w.says).toBe('40 hours, none of them overtime.')
  })

  it('a worker paid through her own company, with no overtime line in the contract, is owed straight time however long the week', () => {
    const c2c: WageLine = { ...NONEXEMPT, contractType: 'C2C', assertion: null, contractPremiumBps: null }
    const [w] = owedByWeek([sheet(LONG_WEEK)], line({ afterHours: null, wage: c2c, contractRateCents: 9_000, periods: [] }), nothingPaid)

    expect(w.overtimeHours).toBe(0)
    expect(w.owedCents).toBe(45 * 9_000)
  })

  it('what a payroll run already paid comes off, premium included, and what is left is still owed', () => {
    // Monday to Wednesday paid at $70; Thursday and Friday not yet.
    const firstThree = (_: string, day: string): PaidSoFar | undefined =>
      day <= '2026-09-09' ? { hours: 9, straightCents: 63_000, premiumHours: 0, premiumCents: 0 } : undefined
    const [part] = owedByWeek([sheet(LONG_WEEK)], line(), firstThree)
    expect(part.paidCents).toBe(189_000)
    expect(part.stillOwedCents).toBe(332_500 - 189_000)
    expect(part.unpaidHours).toBe(18)
    // The five hours over the line are Friday's last five, and unpaid.
    expect(part.unpaidOvertimeHours).toBe(5)

    // Every day paid, and Friday's premium with it: nothing left.
    const all = (_: string, day: string): PaidSoFar =>
      day === '2026-09-11'
        ? { hours: 9, straightCents: 63_000, premiumHours: 5, premiumCents: 17_500 }
        : { hours: 9, straightCents: 63_000, premiumHours: 0, premiumCents: 0 }
    const [done] = owedByWeek([sheet(LONG_WEEK)], line(), all)
    expect(done.paidCents).toBe(332_500)
    expect(done.stillOwedCents).toBe(0)
    expect(done.unpaidOvertimeHours).toBe(0)
  })

  it('a week over the line whose overtime nobody has classified shows the hours at usual pay and says who to ask', () => {
    const unsaid: WageLine = { ...NONEXEMPT, assertion: null }
    const [w] = owedByWeek([sheet(LONG_WEEK)], line({ wage: unsaid }), nothingPaid)

    expect(w.priced).toBe(true)
    expect(w.premiumCents).toBe(0)
    expect(w.owedCents).toBe(45 * 7_000)
    expect(w.says).toBe(
      '45 hours, 5 hours of them over 40 in the week. Brightmoor Staffing has not recorded whether you are owed ' +
        'overtime, so they are shown at your usual pay. Ask Brightmoor Staffing.'
    )
  })

  it('a week the employer cut, that went over the line, shows no figure rather than a guess at which hours came off', () => {
    const [w] = owedByWeek([sheet(LONG_WEEK, { acceptedHours: 42 })], line(), nothingPaid)

    expect(w.priced).toBe(false)
    expect(w.owedCents).toBeNull()
    expect(w.stillOwedCents).toBeNull()
    expect(w.premiumCents).toBeNull()
    expect(w.says).toBe(
      'You filed 45 hours and Brightmoor Staffing accepted 42 hours. Which hours come off changes your overtime, ' +
        "so this page shows no figure for this week. Brightmoor Staffing's payroll has it."
    )
  })

  it('a week the employer cut, under the line, is owed for the accepted hours only', () => {
    const [w] = owedByWeek(
      [sheet({ '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }, { acceptedHours: 36 })],
      line(),
      nothingPaid
    )

    expect(w.priced).toBe(true)
    expect(w.hours).toBe(36)
    expect(w.owedCents).toBe(36 * 7_000)
  })

  it('a week on her page carries no rate of any rung, only hours and money', () => {
    const [w] = owedByWeek([sheet(LONG_WEEK)], line(), nothingPaid)

    expect(Object.keys(w).filter((k) => /rate/i.test(k))).toEqual([])
    expect(JSON.stringify(w)).not.toContain('7000')
  })
})

describe("the worker's page prices overtime with payroll's own functions", () => {
  const ROOT = process.cwd()
  const lib = readFileSync(join(ROOT, 'src/lib/consultant-portfolio.ts'), 'utf8')
  const body = lib.slice(lib.indexOf('export function owedByWeek'))
  const route = readFileSync(join(ROOT, 'src/app/api/me/work/route.ts'), 'utf8')

  it("the worker's page prices overtime by calling payroll's own functions, never by restating the arithmetic", () => {
    expect(body).toContain('sheetOvertime(')
    expect(body).toContain('premiumByDay(')
    expect(body).toContain('priceByDay(')
    // No multiple of its own: time and a half is the wage rules' answer,
    // reached through sheetOvertime, never a constant here.
    expect(body).not.toMatch(/15_?000|1\.5\b|0\.5\b/)
    expect(route).toContain('owedByWeek(')
    // The method a line is paid on is the one payroll reads off the line.
    expect(route).toContain('methodFor(bc).method')
    expect(route).toContain('wageLineFor(bc,')
  })
})
