import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  owedByWeek, paidDatesFrom, payStageOf, weekState, signedWeeksCard,
  type OwedSheet, type OwedPayLine, type PaidSoFar,
} from '@/lib/consultant-portfolio'
import { paidKey } from '@/lib/payroll-paid'
import type { WageLine } from '@/lib/money/sheet-overtime'
import { openingWeek, allFiledSays } from '@/app/dashboard/my-work/asked-week'

/**
 * Walk l2a, 2026-11-15: payroll was processed on Sun Nov 15 for a period
 * whose pay day is Fri Nov 27. Payroll and the pay file named Nov 27; her
 * own page said her firm "paid it on Nov 15". Etyme moves no money: the
 * outside payroll provider pays on the pay day. And the week picker opened
 * on a one-day week that began that Sunday.
 *
 * Every date here is an input to the function under test, never the
 * seeded world's or the clock's.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const W2: WageLine = {
  personName: 'Amara Velde',
  contractType: 'W2',
  weAreTheEmployer: true,
  payModel: 'FIXED_HOURLY',
  rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'bluecrest', assertedByCompanyName: 'Bluecrest Staffing',
    assertedByName: null, assertedAt: d('2026-01-01'), note: null, reviewBy: null,
  },
  contractPremiumBps: 15_000,
  employerName: 'Bluecrest Staffing',
  cutOvertime: 'ABOVE_THE_LINE',
}

const LINE: OwedPayLine = {
  contractRateCents: 4_500,
  periods: [{ id: 'r45', rateCents: 4_500, fromDate: d('2026-01-01'), toDate: null, approvalState: 'APPROVED' }],
  afterHours: 40,
  method: 'US_REGULAR_RATE',
  wage: W2,
  currency: 'USD',
  payDates: [],
}

const WEEK_OF_8: Record<string, number> = { '2026-11-09': 8, '2026-11-10': 8, '2026-11-11': 8, '2026-11-12': 8, '2026-11-13': 8 }
const SHEET: OwedSheet = {
  id: 'ts1', days: WEEK_OF_8, leaveDays: {}, accepted: null, acceptedAt: d('2026-11-15'),
  totalHours: 40, periodStart: d('2026-11-09'), periodEnd: d('2026-11-13'),
}
const paidAll = (on: string) => (): PaidSoFar => ({ hours: 8, straightCents: 36_000, premiumHours: 0, premiumCents: 0, paidOn: on })

const processRun = (at: string) => ({
  at: d(at),
  payload: {
    action: 'process',
    contracts: [{ buyContractId: 'bc1', paid: Object.keys(WEEK_OF_8).map((day) => ({ personId: 'amara', timesheetId: 'ts1', day })) }],
  },
})
const PERIOD_PAYS_27 = () => '2026-11-27'

describe('a week payroll has processed reads as paid on its pay day, never on the day Process was pressed', () => {
  it('a run processed before the pay day dates each day on the pay day of the period it was worked in', () => {
    const dates = paidDatesFrom([processRun('2026-11-15')], [], ['bc1'], paidKey, undefined, PERIOD_PAYS_27)
    expect(dates.get(paidKey('bc1', 'amara', 'ts1', '2026-11-09'))).toBe('2026-11-27')
    expect(dates.get(paidKey('bc1', 'amara', 'ts1', '2026-11-13'))).toBe('2026-11-27')
  })

  it('a run processed after the period’s pay day reads as paid on the day it ran, never as on time', () => {
    const dates = paidDatesFrom([processRun('2026-11-30')], [], ['bc1'], paidKey, undefined, PERIOD_PAYS_27)
    expect(dates.get(paidKey('bc1', 'amara', 'ts1', '2026-11-09'))).toBe('2026-11-30')
  })

  it('a firm that does not pay by its own periods keeps the day it read before', () => {
    const dates = paidDatesFrom([processRun('2026-11-15')], [], ['bc1'], paidKey, undefined, () => null)
    expect(dates.get(paidKey('bc1', 'amara', 'ts1', '2026-11-09'))).toBe('2026-11-15')
  })

  it('until its pay day, her week says payroll has processed it and names her pay day, never a paid date', () => {
    const [w] = owedByWeek([SHEET], LINE, paidAll('2026-11-27'), d('2026-11-15'))
    expect(w.stage).toBe('PAID')
    expect(w.paysLater).toBe(true)
    expect(w.paidOn).toBe('2026-11-27')
    expect(w.says).toBe('40 hours, none of them overtime. Bluecrest Staffing’s payroll has processed it. It is paid on your pay day, Nov 27.')
    expect(w.says).not.toContain('paid it on')
  })

  it('from its pay day on, the same week reads as paid on that day', () => {
    for (const today of ['2026-11-27', '2026-12-04']) {
      const [w] = owedByWeek([SHEET], LINE, paidAll('2026-11-27'), d(today))
      expect(w.paysLater).toBeUndefined()
      expect(w.says).toBe('40 hours, none of them overtime. Bluecrest Staffing paid it on Nov 27.')
    }
  })

  it('a processed week whose pay day has not come is not called paid on her list of weeks', () => {
    const owed = [{ weekOf: '2026-11-08', stage: 'PAID' as const, priced: true, paysLater: true }]
    expect(payStageOf(WEEK_OF_8, '2026-11-09', owed)).toBeNull()
    expect(weekState({ status: 'APPROVED', billed: false, waitingOn: null, pay: null }).word).toBe('approved')
    expect(payStageOf(WEEK_OF_8, '2026-11-09', [{ ...owed[0], paysLater: false }])).toBe('PAID')
  })

  it('the approved weeks card counts a processed week apart from the weeks already paid', () => {
    const card = signedWeeksCard({ ownCompany: false, notBilled: 0, employed: { paid: 2, processed: 1, owed: 0, unknown: 0, employer: 'Bluecrest Staffing' } })
    expect(card.value).toBe(3)
    expect(card.note).toBe('2 paid · 1 processed, paid on your pay day')
  })

  it('her page draws a processed week as Processed with its pay day, and keeps it out of the weeks paid in full', () => {
    const page = src('src/app/dashboard/my-work/page.tsx')
    expect(page).toContain("w.paysLater ? { word: 'Processed', tone: 'passive' }")
    expect(page).toContain("label={w.paysLater ? 'Pay day' : 'On'}")
    expect(page).toContain("weeks.filter((w) => w.stage === 'PAID' && !w.paysLater)")
  })

  it('her page reads the pay day off her employer’s own pay periods, the day Payroll names', () => {
    const route = src('src/app/api/me/work/route.ts')
    expect(route).toContain('periodHolding(day, co.rhythm, co.rule)?.payOn')
    expect(route).toContain('periodPayDayOf\n      )')
    expect(route).toContain('Payroll has processed ${amount(sum, currency ?? undefined)} for you.')
  })
})

describe('the week picker on her page opens on a whole week', () => {
  const wk = (periodStart: string, periodEnd = periodStart) => ({ periodStart, periodEnd })

  it('on a Sunday, it opens on the most recent whole week she has not filed, not on the one day of this week', () => {
    const weeks = [wk('2026-11-15'), wk('2026-11-08', '2026-11-14'), wk('2026-11-01', '2026-11-07')]
    expect(openingWeek(weeks, '2026-11-15')?.periodStart).toBe('2026-11-08')
  })

  it('on a Saturday, this week is not whole yet, so the week before is offered first', () => {
    const weeks = [wk('2026-11-15', '2026-11-21'), wk('2026-11-08', '2026-11-14')]
    expect(openingWeek(weeks, '2026-11-21')?.periodStart).toBe('2026-11-08')
  })

  it('where every whole week is filed, it opens on this week as she works it', () => {
    expect(openingWeek([wk('2026-11-15', '2026-11-17')], '2026-11-17')?.periodStart).toBe('2026-11-15')
  })

  it('with everything filed on a Sunday, the page says this week ends Saturday, never that the next week opens tomorrow', () => {
    const says = allFiledSays('Harborline Tech', '2026-11-15', null)
    expect(says).toBe('You have filed every day you worked at Harborline Tech. File the rest of this week as you work it. It ends Sat, Nov 21.')
    expect(says).not.toContain('opens tomorrow')
  })

  it('with everything filed on a Saturday, the next week does open tomorrow', () => {
    expect(allFiledSays('Harborline Tech', '2026-11-21', null)).toBe('You have filed every day you worked at Harborline Tech. The next week opens tomorrow.')
  })

  it('a placement that has ended says only that every day is filed', () => {
    expect(allFiledSays('Harborline Tech', '2026-11-18', '2026-11-13')).toBe('You have filed every day you worked at Harborline Tech.')
  })

  it('her page opens the picker through openingWeek and says the filed sentence through allFiledSays', () => {
    const page = src('src/app/dashboard/my-work/page.tsx')
    expect(page).toContain('openingWeek(current.weeks, current.today)')
    expect(page).toContain('{allFiledSays(current.site, current.today, current.endDate)}')
    expect(page).not.toContain('The next week opens tomorrow.')
    expect(src('src/app/api/me/work/route.ts')).toMatch(/weeks: openWeeks\(r, filed, today\),\n\s+\/\/[^\n]*\n\s+today,/)
  })
})
