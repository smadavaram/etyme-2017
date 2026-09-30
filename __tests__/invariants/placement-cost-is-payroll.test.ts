import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { placementEarned, hoursSigned, type SheetToPrice, type PayOvertime } from '@/lib/money/placement-earned'
import { sheetPay, overtimeSaysFor, type WageLine } from '@/lib/money/sheet-overtime'
import { priceByDay, segmentsSay, type RatePeriod } from '@/lib/contract-rate'
import { depositDeadline } from '@/lib/payroll-export'

/**
 * Rosa Delgado's placement at Brightmoor, as the browser walk of the
 * seeded world found it: billed at $112, paid $66, raised to $70 from 29
 * July, and a forty-five-hour week on 10 August that payroll pays with a
 * $175 premium the placement page left out.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const ISO = /\b\d{4}-\d{2}-\d{2}\b/

const RAISE: RatePeriod[] = [
  { id: 'opening', rateCents: 6_600, fromDate: d('2026-02-23'), toDate: d('2026-07-28'), approvalState: 'APPROVED' },
  { id: 'raise', rateCents: 7_000, fromDate: d('2026-07-29'), toDate: null, approvalState: 'APPROVED' },
]

const nonexempt: WageLine = {
  personName: 'Rosa Delgado',
  contractType: 'W2',
  weAreTheEmployer: true,
  payModel: 'FIXED_HOURLY',
  rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'brightmoor', assertedByCompanyName: 'Brightmoor Staffing',
    assertedByName: null, assertedAt: d('2026-02-01'), note: null, reviewBy: null,
  },
  contractPremiumBps: null,
  employerName: 'Brightmoor Staffing',
  cutOvertime: 'ABOVE_THE_LINE',
}

const OVERTIME: PayOvertime = { afterHours: 40, method: 'US_REGULAR_RATE', wage: nonexempt, payerCompanyId: 'brightmoor' }

function week(monday: string, perDay: number[], opts: { client?: number | null; employer?: number | null; employers?: number } = {}): SheetToPrice {
  const start = d(monday)
  const days: Record<string, number> = {}
  perDay.forEach((h, i) => {
    days[new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)] = h
  })
  const filed = perDay.reduce((a, b) => a + b, 0)
  const client = opts.client === undefined ? filed : opts.client
  const employer = opts.employer === undefined ? filed : opts.employer
  const employers = opts.employers ?? 1
  return {
    periodStart: start,
    periodEnd: new Date(start.getTime() + 6 * 86_400_000),
    days,
    assertions: [
      ...(client != null ? [{ role: 'CLIENT_APPROVAL', hours: client, rateCents: 11_200, companyId: 'northbend' }] : []),
      ...(employer != null
        ? Array.from({ length: employers }, () => ({ role: 'EMPLOYER_ACCEPTANCE', hours: employer, rateCents: 7_000, companyId: 'brightmoor' }))
        : []),
    ],
  }
}

const BILL = { openingRateCents: 11_200, periods: [] as RatePeriod[], currency: 'USD' }
const PAY = { openingRateCents: 6_600, periods: RAISE, currency: 'USD', overtime: OVERTIME }

// The forty-five-hour week: nine hours Monday to Friday, all at $70.
const AUG_10 = week('2026-08-10', [9, 9, 9, 9, 9])
const JUL_13 = week('2026-07-13', [8, 8, 8, 8, 8])

describe("a placement's cost is what payroll pays, overtime premium included", () => {
  it("a placement's cost is what payroll pays, overtime premium included: 45 hours at $70 is $3,150 of straight time and $175 of premium", () => {
    const e = placementEarned({ sheets: [AUG_10], bill: BILL, pay: PAY })
    expect(e.costCents).toBe(45 * 7_000 + 17_500)
    expect(e.overtimePremiumCents).toBe(17_500)
    expect(e.overtimeHours).toBe(5)
    expect(e.marginCents).toBe(45 * 11_200 - (45 * 7_000 + 17_500))
  })

  it('the cost is reached through the payroll run’s own call, sheetPay, and agrees with it to the cent', () => {
    const pay = sheetPay({
      days: AUG_10.days as Record<string, number>, leaveDays: {}, afterHours: 40,
      accepted: { hours: 45, from: null, to: null }, contractRateCents: 6_600, periods: RAISE,
      method: 'US_REGULAR_RATE', line: nonexempt,
    })
    const straight = priceByDay({ contractRateCents: 6_600, periods: RAISE, days: pay.days })
    const premium = Math.round([...pay.premiums.values()].reduce((n, p) => n + p.premiumCents, 0))
    const e = placementEarned({ sheets: [AUG_10], bill: BILL, pay: PAY })
    expect(e.costCents).toBe(straight.cents + premium)
  })

  it('a week at or under the line costs straight time and carries no premium', () => {
    const e = placementEarned({ sheets: [JUL_13], bill: BILL, pay: PAY })
    expect(e.costCents).toBe(40 * 6_600)
    expect(e.overtimePremiumCents).toBe(0)
    expect(e.overtimeSays).toBeNull()
  })

  it('a forty-five-hour week accepted at thirty-eight costs thirty-eight hours at straight time, the way payroll pays it', () => {
    const cut = week('2026-08-10', [9, 9, 9, 9, 9], { employer: 38 })
    const e = placementEarned({ sheets: [cut], bill: BILL, pay: PAY })
    expect(e.costCents).toBe(38 * 7_000)
    expect(e.overtimePremiumCents).toBe(0)
  })

  it('a forty-five-hour week accepted at forty-two costs forty straight and two at the premium, under the default cut', () => {
    const cut = week('2026-08-10', [9, 9, 9, 9, 9], { employer: 42 })
    const e = placementEarned({ sheets: [cut], bill: BILL, pay: PAY })
    expect(e.costCents).toBe(42 * 7_000 + 2 * 3_500)
    expect(e.overtimeHours).toBe(2)
  })

  it('the cost says in a sentence how much of it is overtime premium, with the week as a person reads it', () => {
    const e = placementEarned({ sheets: [JUL_13, AUG_10], bill: BILL, pay: PAY })
    expect(e.overtimeSays).toContain('$175.00 of overtime premium')
    expect(e.overtimeSays).toContain('Aug 10, 2026')
    expect(e.overtimeSays).not.toMatch(ISO)
  })

  it('where the pay line’s overtime terms were not read and a week went over forty hours, the cost is blank rather than straight time', () => {
    const e = placementEarned({
      sheets: [JUL_13, AUG_10],
      bill: BILL,
      pay: { openingRateCents: 6_600, periods: RAISE, currency: 'USD' },
    })
    expect(e.costCents).toBeNull()
    expect(e.marginCents).toBeNull()
    expect(e.costRefusedBecause).toContain('Aug 10, 2026')
    expect(e.costRefusedBecause).not.toMatch(ISO)
  })

  it('without the overtime terms a placement that never went over forty is still costed at straight time', () => {
    const e = placementEarned({
      sheets: [JUL_13],
      bill: BILL,
      pay: { openingRateCents: 6_600, periods: RAISE, currency: 'USD' },
    })
    expect(e.costCents).toBe(40 * 6_600)
  })

  it('a week with two acceptances standing is not costed, because payroll pays none of it on a guess', () => {
    const twice = week('2026-08-10', [9, 9, 9, 9, 9], { employers: 2 })
    const e = placementEarned({ sheets: [JUL_13, twice], bill: BILL, pay: PAY })
    expect(e.costCents).toBeNull()
    expect(e.costRefusedBecause).toContain('more than one acceptance')
  })
})

describe('the hours on a placement’s header are every week it has, not the dozen on its card', () => {
  it('the hours a placement reports are summed over every sheet, so thirty-one weeks are never read as twelve', () => {
    const sheets = Array.from({ length: 31 }, (_, i) =>
      week(new Date(d('2026-02-23').getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10), [8, 8, 8, 8, 8])
    )
    const signed = hoursSigned(sheets)
    expect(signed.approved).toBe(31 * 40)
    expect(signed.accepted).toBe(31 * 40)
    expect(signed.accepted).toBe(placementEarned({ sheets, bill: BILL, pay: PAY }).hoursPaid)
  })

  it('what the client approved and what the employer accepted are counted apart', () => {
    const sheets = [JUL_13, week('2026-07-20', [8, 8, 8, 8, 8], { employer: null })]
    expect(hoursSigned(sheets)).toEqual({ approved: 80, accepted: 40 })
  })
})

describe('no sentence on the payroll or placement money screens carries an ISO date', () => {
  it('no sentence on the payroll or placement money screens carries an ISO date: the rate change on a placement', () => {
    const e = placementEarned({
      sheets: [week('2026-07-27', [8, 8, 8, 8, 8]), week('2026-08-03', [8, 8, 8, 8, 8])],
      bill: BILL, pay: PAY,
    })
    expect(e.payRateChangeSays).toContain('Jul 27 – Jul 28, 2026')
    expect(e.payRateChangeSays).not.toMatch(ISO)
    const raise = priceByDay({ contractRateCents: 6_600, periods: RAISE, days: { '2026-07-28': 8, '2026-07-29': 8 } })
    expect(segmentsSay(raise.segments)).not.toMatch(ISO)
  })

  it('no sentence on the payroll or placement money screens carries an ISO date: the overtime a run pays', () => {
    const pay = sheetPay({
      days: AUG_10.days as Record<string, number>, leaveDays: {}, afterHours: 40, accepted: null,
      contractRateCents: 7_000, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    const says = overtimeSaysFor(pay.weeks)!
    expect(says).toContain('Aug 10, 2026')
    expect(says).not.toMatch(ISO)
  })

  it('no sentence on the payroll or placement money screens carries an ISO date: a deposit deadline', () => {
    const says = depositDeadline(d('2026-07-10'), 'MONTHLY').says
    expect(says).toContain('Jul 10, 2026')
    expect(says).not.toMatch(ISO)
  })

  it('no sentence on the payroll or placement money screens carries an ISO date: the payroll screen and routes print no day by slicing it', () => {
    const root = join(__dirname, '..', '..')
    for (const file of [
      'src/app/dashboard/payroll/page.tsx',
      'src/app/api/payroll/route.ts',
      'src/app/api/payroll/run/route.ts',
      'src/app/api/payroll/statutory/route.ts',
      'src/lib/money/placement-earned.ts',
      'src/lib/money/sheet-overtime.ts',
    ]) {
      const src = readFileSync(join(root, file), 'utf8')
      // A day sliced out of an ISO string and printed into words or JSX.
      expect(src, file).not.toMatch(/(week of|paid|deposit by|from|to) \$?\{[^}]*\.slice\(0, 10\)\}/)
      expect(src, file).not.toMatch(/(?<!\$)\{String\([^)]*\)\.slice\(0, 10\)\}/)
    }
  })
})
