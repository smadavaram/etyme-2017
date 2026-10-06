import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  owedByWeek, waitingWeek, weekSigners, signedAtOf, paidDatesFrom,
  type OwedSheet, type OwedPayLine, type PaidSoFar, type PayDate, type WaitingSheet,
} from '@/lib/consultant-portfolio'
import { sheetPay, type WageLine } from '@/lib/money/sheet-overtime'
import { priceByDay, type RatePeriod } from '@/lib/contract-rate'
import { paidKey } from '@/lib/payroll-paid'

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
  cutOvertime: 'ABOVE_THE_LINE',
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
    payDates: [],
    ...over,
  }
}

function sheet(days: Record<string, number>, over: Partial<OwedSheet> = {}): OwedSheet {
  const keys = Object.keys(days).sort()
  return {
    id: 'ts1',
    days,
    leaveDays: {},
    accepted: null,
    acceptedAt: null,
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

    // Weeks run Sunday to Saturday: Monday the 7th's week opened on Sunday the 6th.
    expect(w.weekOf).toBe('2026-09-06')
    expect(w.priced).toBe(true)
    expect([w.hours, w.ordinaryHours, w.overtimeHours]).toEqual([45, 40, 5])
    // Half of $70 again on each of the five hours.
    expect(w.premiumCents).toBe(17_500)
    expect(w.owedCents).toBe(332_500)
    expect(w.owedCents).not.toBe(45 * 7_000)
    expect(w.stillOwedCents).toBe(332_500)
    expect(w.says).toContain(
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
    expect(w.says).toContain('40 hours, none of them overtime.')
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
    expect(w.says).toContain(
      '45 hours, 5 hours of them over 40 in the week. Brightmoor Staffing has not recorded whether you are owed ' +
        'overtime, so they are shown at your usual pay. Ask Brightmoor Staffing.'
    )
  })

  it('a week the employer cut is priced on the hours accepted, the way payroll pays it: by default 42 of 45 is 40 ordinary hours and 2 of overtime', () => {
    const cut = sheet(LONG_WEEK, { accepted: { hours: 42, from: null, to: null } })
    const [w] = owedByWeek([cut], line(), nothingPaid)
    expect(w.priced).toBe(true)
    // The default: overtime only on the accepted hours over the line.
    expect([w.hours, w.ordinaryHours, w.overtimeHours]).toEqual([42, 40, 2])
    expect(w.owedCents).toBe(42 * 7_000 + 2 * 3_500)
    const pay = sheetPay({
      days: LONG_WEEK, leaveDays: {}, afterHours: 40, accepted: { hours: 42, from: null, to: null },
      contractRateCents: 7_000, periods: AT_70, method: 'US_REGULAR_RATE', line: NONEXEMPT,
    })
    const straight = priceByDay({ contractRateCents: 7_000, periods: AT_70, days: pay.days }).days
      .reduce((n, d) => n + d.hours * d.rateCents, 0)
    const premium = [...pay.premiums.values()].reduce((n, p) => n + p.premiumCents, 0)
    expect(w.owedCents).toBe(Math.round(straight) + Math.round(premium))
  })

  it('a week the employer cut, where the employer keeps the week’s overtime, is priced the way payroll pays it: 42 of 45 keeps its five hours of overtime', () => {
    const KEEPS: WageLine = { ...NONEXEMPT, cutOvertime: 'KEEP_WEEK_OVERTIME' }
    const cut = sheet(LONG_WEEK, { accepted: { hours: 42, from: null, to: null } })
    const [w] = owedByWeek([cut], line({ wage: KEEPS }), nothingPaid)

    expect(w.priced).toBe(true)
    // The cut comes off ordinary hours first, so she keeps her overtime.
    expect([w.hours, w.ordinaryHours, w.overtimeHours]).toEqual([42, 37, 5])
    expect(w.owedCents).toBe(42 * 7_000 + 5 * 3_500)
    expect(w.says).toContain('You filed 45 hours and Brightmoor Staffing accepted 42.')

    // And that is exactly what payroll's own call makes of the same sheet.
    const pay = sheetPay({
      days: LONG_WEEK, leaveDays: {}, afterHours: 40, accepted: { hours: 42, from: null, to: null },
      contractRateCents: 7_000, periods: AT_70, method: 'US_REGULAR_RATE', line: KEEPS,
    })
    const straight = priceByDay({ contractRateCents: 7_000, periods: AT_70, days: pay.days }).days
      .reduce((n, d) => n + d.hours * d.rateCents, 0)
    const premium = [...pay.premiums.values()].reduce((n, p) => n + p.premiumCents, 0)
    expect(w.owedCents).toBe(Math.round(straight) + Math.round(premium))
  })

  it('a week the employer accepted at or under forty is paid at straight time on the hours accepted: 38 of 45 is 38 at her usual pay', () => {
    const [w] = owedByWeek([sheet(LONG_WEEK, { accepted: { hours: 38, from: null, to: null } })], line(), nothingPaid)

    expect(w.priced).toBe(true)
    expect([w.hours, w.ordinaryHours, w.overtimeHours, w.premiumCents]).toEqual([38, 38, 0, 0])
    expect(w.owedCents).toBe(38 * 7_000)
    expect(w.says).toContain(
      'You filed 45 hours and Brightmoor Staffing accepted 38. ' +
        '38 hours, all at your usual pay, because the week as accepted is not over 40 hours.'
    )
  })

  it('a week the employer cut, under the line, is owed for the accepted hours only', () => {
    const [w] = owedByWeek(
      [sheet({ '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }, { accepted: { hours: 36, from: null, to: null } })],
      line(),
      nothingPaid
    )

    expect(w.priced).toBe(true)
    expect(w.hours).toBe(36)
    expect(w.owedCents).toBe(36 * 7_000)
  })

  it('a week the employer accepted none of still shows, and says nothing is owed for it', () => {
    const [w] = owedByWeek(
      [sheet({ '2026-09-14': 8, '2026-09-15': 8 }, { accepted: { hours: 0, from: null, to: null } })],
      line(),
      nothingPaid
    )

    expect(w.filedHours).toBe(16)
    expect(w.owedCents).toBe(0)
    expect(w.stillOwedCents).toBe(0)
    expect(w.dueOn).toBeNull()
    expect(w.says).toBe('You filed 16 hours and Brightmoor Staffing accepted none of them.')
  })

  it('a week with two acceptances standing shows no figure, because payroll pays it on neither', () => {
    const [w] = owedByWeek([sheet(LONG_WEEK, { accepted: 'MANY' })], line(), nothingPaid)

    expect(w.priced).toBe(false)
    expect(w.owedCents).toBeNull()
    expect(w.stillOwedCents).toBeNull()
    expect(w.says).toContain('accepted this week more than once')
  })

  it('a week on her page carries no rate of any rung, only hours and money', () => {
    const [w] = owedByWeek([sheet(LONG_WEEK)], line(), nothingPaid)

    expect(Object.keys(w).filter((k) => /rate/i.test(k))).toEqual([])
    expect(JSON.stringify(w)).not.toContain('7000')
  })
})

// ── When it falls due, and when it was paid ─────────────────────────────

/** Her pay days: every other Friday, as the US pack writes them. */
const FRIDAYS = (done: string[] = []): PayDate[] =>
  ['2026-09-11', '2026-09-25', '2026-10-09', '2026-10-23'].map((x) => ({
    kind: 'SALARY_PAY', dueOn: d(x), completedAt: done.includes(x) ? d(x) : null,
  }))
const WEEK_OF_14 = { '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }

describe('a week her employer accepted falls due on her own pay schedule', () => {
  it('a week the employer accepted is owed to her, with the date it falls due on her pay schedule', () => {
    const [w] = owedByWeek(
      [sheet(WEEK_OF_14, { acceptedAt: d('2026-09-22') })],
      line({ payDates: FRIDAYS(['2026-09-11']) }),
      nothingPaid,
      d('2026-09-23')
    )

    expect(w.stage).toBe('OWED')
    expect(w.stillOwedCents).toBe(280_000)
    expect(w.dueOn).toBe('2026-09-25')
    expect(w.overdue).toBe(false)
    expect(w.says).toBe('40 hours, none of them overtime. It is due on your pay day, Sep 25.')
  })

  it('a pay day that came before the employer accepted the week is never the day it falls due', () => {
    const [w] = owedByWeek(
      [sheet(WEEK_OF_14, { acceptedAt: d('2026-09-26') })],
      line({ payDates: FRIDAYS() }),
      nothingPaid,
      d('2026-09-28')
    )

    expect(w.dueOn).toBe('2026-10-09')
  })

  it('a pay day payroll ran without paying the week is still the day it fell due, and the week reads as late', () => {
    const [w] = owedByWeek(
      [sheet(WEEK_OF_14, { acceptedAt: d('2026-09-21') })],
      line({ payDates: FRIDAYS(['2026-09-25']) }),
      nothingPaid,
      d('2026-09-28')
    )

    expect(w.dueOn).toBe('2026-09-25')
    expect(w.overdue).toBe(true)
  })

  it('a week still unpaid after its pay day says it fell due and has not been paid', () => {
    const [w] = owedByWeek(
      [sheet(WEEK_OF_14, { acceptedAt: d('2026-09-22') })],
      line({ payDates: FRIDAYS() }),
      nothingPaid,
      d('2026-10-01')
    )

    expect(w.dueOn).toBe('2026-09-25')
    expect(w.overdue).toBe(true)
    expect(w.says).toContain('It fell due on your pay day of Sep 25 and has not been paid.')
  })

  it('where her pay line has no pay day after the week, the page says the employer has not set one rather than inventing a date', () => {
    const [w] = owedByWeek(
      [sheet(WEEK_OF_14, { acceptedAt: d('2026-09-22') })],
      line({ payDates: [] }),
      nothingPaid,
      d('2026-09-23')
    )

    expect(w.stage).toBe('OWED')
    expect(w.dueOn).toBeNull()
    expect(w.says).toContain('Brightmoor Staffing has not set a pay date for this week.')
  })

  it('a paid week shows what was paid and when', () => {
    const paid = (_: string, day: string): PaidSoFar => ({
      hours: 8, straightCents: 56_000, premiumHours: 0, premiumCents: 0, paidOn: day <= '2026-09-16' ? '2026-09-25' : '2026-10-09',
    })
    const [w] = owedByWeek([sheet(WEEK_OF_14, { acceptedAt: d('2026-09-22') })], line({ payDates: FRIDAYS() }), paid, d('2026-10-12'))

    expect(w.stage).toBe('PAID')
    expect(w.paidCents).toBe(280_000)
    expect(w.stillOwedCents).toBe(0)
    // Paid in full on the later of the two days.
    expect(w.paidOn).toBe('2026-10-09')
    expect(w.dueOn).toBeNull()
    expect(w.says).toBe('40 hours, none of them overtime. Brightmoor Staffing paid it on Oct 9.')
  })

  it('a week paid in part says when part was paid and when the rest falls due', () => {
    const firstTwo = (_: string, day: string): PaidSoFar | undefined =>
      day <= '2026-09-15' ? { hours: 8, straightCents: 56_000, premiumHours: 0, premiumCents: 0, paidOn: '2026-09-18' } : undefined
    const [w] = owedByWeek(
      [sheet(WEEK_OF_14, { acceptedAt: d('2026-09-16') })],
      line({ payDates: FRIDAYS() }),
      firstTwo,
      d('2026-09-21')
    )

    expect(w.stage).toBe('OWED')
    expect(w.paidCents).toBe(112_000)
    expect(w.stillOwedCents).toBe(168_000)
    expect(w.dueOn).toBe('2026-09-25')
    expect(w.says).toContain('Brightmoor Staffing paid part of it on Sep 18.')
  })

  it('a paid week whose payment carries no date says the record does not say which day, rather than guessing one', () => {
    const paid = (): PaidSoFar => ({ hours: 8, straightCents: 56_000, premiumHours: 0, premiumCents: 0 })
    const [w] = owedByWeek([sheet(WEEK_OF_14)], line(), paid, d('2026-10-12'))

    expect(w.stage).toBe('PAID')
    expect(w.paidOn).toBeNull()
    expect(w.says).toContain('The record does not say which day.')
  })
})

// ── Not owed yet ─────────────────────────────────────────────────────────

const DIRECT = weekSigners(
  { rungs: [{ companyId: 'brightmoor', companyName: 'Brightmoor Staffing' }] },
  { id: 'northbend', name: 'Northbend Athletic' }
)
const CHAIN = weekSigners(
  {
    rungs: [
      { companyId: 'techpeple', companyName: 'Techpeple' },
      { companyId: 'csi', companyName: 'Computer Systems Inc' },
    ],
  },
  { id: 'northbend', name: 'Northbend Athletic' }
)

function sent(signers: typeof DIRECT, signedAt: Record<string, string>): WaitingSheet {
  return {
    id: 'ts9',
    periodStart: d('2026-09-13'),
    periodEnd: d('2026-09-19'),
    hours: 40,
    submittedAt: d('2026-09-18'),
    signers: signers.map((x) => ({ ...x, signedAt: signedAt[x.companyId] ? d(signedAt[x.companyId]) : null })),
  }
}

describe('a week sent and not yet accepted by her employer is waiting, and never owed', () => {
  it('the signatures a week needs run from the client where she works, through each firm between, to her employer last', () => {
    expect(DIRECT.map((x) => [x.name, x.role])).toEqual([
      ['Northbend Athletic', 'CLIENT_APPROVAL'],
      ['Brightmoor Staffing', 'EMPLOYER_ACCEPTANCE'],
    ])
    expect(CHAIN.map((x) => [x.name, x.role])).toEqual([
      ['Northbend Athletic', 'CLIENT_APPROVAL'],
      ['Computer Systems Inc', 'PASS_THROUGH'],
      ['Techpeple', 'EMPLOYER_ACCEPTANCE'],
    ])
  })

  it('a week sent and not yet signed reads as waiting for the client, with the day it was sent', () => {
    const w = waitingWeek(sent(DIRECT, {}), d('2026-09-19'))!

    expect(w.stage).toBe('WAITING_FOR_CLIENT')
    expect(w.label).toBe('Week of Sep 13')
    expect(w.waitingOn).toBe('Northbend Athletic')
    expect(w.says).toBe('Sent to Northbend Athletic on Sep 18. Waiting for them to sign.')
  })

  it('a week the client signed and the employer has not accepted reads as waiting on the employer, never as owed', () => {
    const w = waitingWeek(sent(DIRECT, { northbend: '2026-09-21' }), d('2026-09-22'))!

    expect(w.stage).toBe('WAITING_FOR_EMPLOYER')
    expect(w.waitingOn).toBe('Brightmoor Staffing')
    expect(w.says).toBe(
      'Northbend Athletic signed it on Sep 21. Waiting for Brightmoor Staffing to accept it. ' +
        'It is owed to you once Brightmoor Staffing accepts it.'
    )
    // Hours, and no money of any kind.
    expect(w.hours).toBe(40)
    expect(Object.keys(w).filter((k) => /cents|owed|rate/i.test(k))).toEqual([])
  })

  it('in a chain, a week the client signed names the firm between it and her employer, then her employer', () => {
    const w = waitingWeek(sent(CHAIN, { northbend: '2026-09-21' }), d('2026-09-22'))!
    expect(w.stage).toBe('WAITING_FOR_EMPLOYER')
    expect(w.says).toContain('Waiting for Computer Systems Inc to accept it, then Techpeple.')

    const next = waitingWeek(sent(CHAIN, { northbend: '2026-09-21', csi: '2026-09-22' }), d('2026-09-23'))!
    expect(next.says).toContain('Computer Systems Inc accepted it on Sep 22. Waiting for Techpeple to accept it.')
  })

  it('a week her employer has accepted is not waiting: it is owed, and priced where it is owed', () => {
    expect(waitingWeek(sent(DIRECT, { northbend: '2026-09-21', brightmoor: '2026-09-22' }))).toBeNull()
  })

  it('a signature is read off the ledger first, and off the old columns for a week signed before the ledger', () => {
    const [client, employer] = DIRECT
    const cols = { clientApprovedAt: d('2026-09-21'), employerAcceptedAt: null }
    expect(signedAtOf(client, cols, [])).toEqual(d('2026-09-21'))
    expect(signedAtOf(employer, cols, [])).toBeNull()
    const ledger = [{ companyId: 'brightmoor', role: 'EMPLOYER_ACCEPTANCE', at: d('2026-09-23') }]
    expect(signedAtOf(employer, cols, ledger)).toEqual(d('2026-09-23'))
    // Another firm's signature never stands in for hers.
    expect(signedAtOf(employer, cols, [{ companyId: 'northbend', role: 'EMPLOYER_ACCEPTANCE', at: d('2026-09-23') }])).toBeNull()
  })
})

describe('the day a week was paid is read off the payment that paid it', () => {
  const run = (at: string, action: string, paid: Array<{ day: string }>, refused: string | null = null) => ({
    at: d(at),
    payload: {
      action,
      contracts: [{ buyContractId: 'bc1', refused, paid: paid.map((p) => ({ personId: 'rosa', timesheetId: 'ts1', day: p.day, hours: 8, rateCents: 7_000 })) }],
    },
  })

  it('a processed run dates each day it paid, and a calculation or a refused row paid nothing', () => {
    const dates = paidDatesFrom(
      [
        run('2026-09-25', 'process', [{ day: '2026-09-14' }]),
        run('2026-09-24', 'calculate', [{ day: '2026-09-15' }]),
        run('2026-09-25', 'process', [{ day: '2026-09-16' }], 'Refused in a sentence'),
      ],
      [],
      ['bc1'],
      paidKey
    )
    expect(dates.get(paidKey('bc1', 'rosa', 'ts1', '2026-09-14'))).toBe('2026-09-25')
    expect(dates.has(paidKey('bc1', 'rosa', 'ts1', '2026-09-15'))).toBe(false)
    expect(dates.has(paidKey('bc1', 'rosa', 'ts1', '2026-09-16'))).toBe(false)
  })

  it('back pay a desk approved moves the day a week was last paid, and another line is never read', () => {
    const dates = paidDatesFrom(
      [run('2026-09-25', 'process', [{ day: '2026-09-14' }])],
      [{ at: d('2026-10-02'), payload: { backPay: [
        { buyContractId: 'bc1', personId: 'rosa', timesheetId: 'ts1', day: '2026-09-14', straightCents: 400, premiumCents: 0 },
        { buyContractId: 'other', personId: 'rosa', timesheetId: 'ts1', day: '2026-09-15', straightCents: 400, premiumCents: 0 },
      ] } }],
      ['bc1'],
      paidKey
    )
    expect(dates.get(paidKey('bc1', 'rosa', 'ts1', '2026-09-14'))).toBe('2026-10-02')
    expect(dates.has(paidKey('other', 'rosa', 'ts1', '2026-09-15'))).toBe(false)
  })
})

describe("the worker's page prices her pay with payroll's own functions", () => {
  const ROOT = process.cwd()
  const lib = readFileSync(join(ROOT, 'src/lib/consultant-portfolio.ts'), 'utf8')
  const body = lib.slice(lib.indexOf('export function owedByWeek'), lib.indexOf('export type SignRole'))
  const route = readFileSync(join(ROOT, 'src/app/api/me/work/route.ts'), 'utf8')

  it("the worker's page prices the hours accepted and their overtime by calling payroll's own functions, never by restating the arithmetic", () => {
    expect(body).toContain('sheetPay(')
    expect(body).toContain('priceByDay(')
    // No multiple of its own: time and a half is the wage rules' answer,
    // reached through sheetPay, never a constant here.
    expect(body).not.toMatch(/15_?000|1\.5\b|0\.5\b/)
    // No cut of its own either: which hours an acceptance pays is payroll's.
    expect(body).not.toMatch(/ordinary hours first,? latest/)
    expect(route).toContain('owedByWeek(')
    // The acceptance is read the way payroll reads it.
    expect(route).toContain('acceptanceForPay(t.assertions, t, bc.companyId)')
    // The method a line is paid on is the one payroll reads off the line.
    expect(route).toContain('methodFor(bc).method')
    expect(route).toContain('wageLineFor(bc,')
  })

  it('the weekly line on her page is the one payroll judges pay on, the law\u2019s forty included, never a line of its own', () => {
    expect(route).toContain('afterHours: payLineOn(bc, sell,')
    expect(route).not.toMatch(/afterHours:\s*bc\.overtimeAfterHours/)
    expect(route).not.toMatch(/\b40\b/)
  })

  it('the day a week falls due is read off her pay line\u2019s own pay days through the next-pay door, never worked out here', () => {
    expect(body).toContain('nextOpen(')
    expect(body).toContain("'SALARY_PAY'")
    expect(route).toContain("buyCycles: { where: { kind: 'SALARY_PAY' }")
    expect(route).toContain('payDates: bc.buyCycles')
  })
})
