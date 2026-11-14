import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { owedByWeek, type OwedSheet, type OwedPayLine } from '@/lib/consultant-portfolio'
import type { WageLine } from '@/lib/money/sheet-overtime'
import {
  workerPayCalendar, periodHolding, payFileCsv, PICK_A_MONTH_FOR_PAY_FILE, EXPORT_IS_NOT_A_PAY_FILE,
  monthPayFileName, type PayFileRow, type PayRhythm,
} from '@/lib/money/pay-periods'
import { DEFAULT_PAY_RHYTHM } from '@/lib/pay-dates'
import { periodFor } from '@/lib/periods'
import { payFileHref } from '@/lib/money/payroll-rows'
import { workedOutKeys, isWorkedOut, payCovers } from '@/lib/money/payroll-worked-out'
import { payLineFor, payLineSays, weeklyWorked } from '@/lib/money/pay-line'
import { paperChip } from '@/lib/money/paper-set'
import { NOT_CHECKED_AT_START } from '@/lib/document-stages/checked-at-start'

/**
 * A second reader worked the pay-run fixes by hand, 2026-11-14, and found
 * five places they did not hold. Each is a sentence here.
 *
 * Calendar facts: Sunday 6 December 2026; Saturday 19 December; Friday
 * 25 December is Christmas, a holiday, so its pay day moves back to
 * Thursday 24 December; Friday 8 January 2027.
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const words = (s: string) => s.split(/(?<=[.?!])\s+/).map((x) => x.split(/\s+/).filter(Boolean).length)

// Every other week from Sunday Dec 6, worked out Wednesday and paid Friday
// after each period's Saturday, a pay day on a holiday moved back.
const TWO_WEEKS: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: '2026-12-06' }
const RULE = { holidays: ['2026-12-25', '2027-01-01'], direction: 'BEFORE' as const, daysOff: [0, 6] }

const NONEXEMPT: WageLine = {
  personName: 'Dana Mendes', contractType: 'W2', weAreTheEmployer: true, payModel: 'FIXED_HOURLY', rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'brightmoor', assertedByCompanyName: 'Brightmoor Staffing',
    assertedByName: null, assertedAt: d('2026-12-01'), note: null, reviewBy: null,
  },
  contractPremiumBps: null, employerName: 'Brightmoor Staffing', cutOvertime: 'ABOVE_THE_LINE',
}

/** A 40-hour week, Monday to Friday, accepted on its Saturday. */
function week(monday: string, id: string): OwedSheet {
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[new Date(+d(monday) + i * 86_400_000).toISOString().slice(0, 10)] = 8
  return {
    id, days, leaveDays: {}, accepted: null, acceptedAt: new Date(+d(monday) + 5 * 86_400_000), totalHours: 40,
    periodStart: new Date(+d(monday) - 86_400_000), periodEnd: new Date(+d(monday) + 5 * 86_400_000),
  }
}

describe('the worker’s own page can read her pay day by the company’s own pay periods', () => {
  // Pay days from Dec 12: the period before Dec 6 (Nov 22 – Dec 5) pays Fri, Dec 11.
  const cal = workerPayCalendar(TWO_WEEKS, RULE, 'SPLIT', { from: '2026-12-12', to: '2027-03-20' })!

  it('the period before pays Fri, Dec 11, and the company’s pay days from Dec 6 are Dec 24 (Christmas moved back), Jan 8, Jan 22, Feb 5, Feb 19, Mar 5 and Mar 19', () => {
    const wider = workerPayCalendar(TWO_WEEKS, RULE, 'SPLIT', { from: '2026-12-06', to: '2026-12-31' })!
    expect(wider.payDates.map((p) => p.dueOn.toISOString().slice(0, 10))).toEqual(['2026-12-11', '2026-12-24'])
    expect(cal.payDates.map((p) => p.dueOn.toISOString().slice(0, 10))).toEqual([
      '2026-12-24', '2027-01-08', '2027-01-22', '2027-02-05', '2027-02-19', '2027-03-05', '2027-03-19',
    ])
  })

  it('every day from October 2026 to June 2027 falls in the same period on the worker’s page as on the Payroll page', () => {
    for (let t = +d('2026-10-01'); t <= +d('2027-06-30'); t += 86_400_000) {
      const day = new Date(t)
      const ours = periodFor(day, cal.terms)
      const theirs = periodHolding(day, TWO_WEEKS, RULE)!
      expect([ours.start.toISOString().slice(0, 10), ours.end.toISOString().slice(0, 10)]).toEqual([theirs.start, theirs.end])
    }
    const weekly = workerPayCalendar({ ...TWO_WEEKS, payPeriod: 'WEEKLY' }, RULE, 'SPLIT', { from: '2026-12-06', to: '2027-01-31' })!
    for (let t = +d('2026-12-01'); t <= +d('2027-01-31'); t += 86_400_000) {
      const p = periodFor(new Date(t), weekly.terms)
      expect(p.start.toISOString().slice(0, 10)).toBe(periodHolding(new Date(t), { ...TWO_WEEKS, payPeriod: 'WEEKLY' }, RULE)!.start)
    }
  })

  it('a person who started Wednesday Dec 16 still reads the company’s fortnights, never ones counted from her own start', () => {
    // Her own start's Sunday is Dec 13, a week off the company's Dec 6.
    const p = periodFor(d('2026-12-17'), cal.terms)
    expect([p.start.toISOString().slice(0, 10), p.end.toISOString().slice(0, 10)]).toEqual(['2026-12-06', '2026-12-19'])
  })

  it('weeks of Dec 6 and Dec 13, 40 hours at $72 each ($2,880), are due on her pay day, Dec 24, as Payroll says, never Jan 8', () => {
    const line = (over: Partial<OwedPayLine>): OwedPayLine => ({
      contractRateCents: 7_200, periods: [], afterHours: 40, method: 'US_REGULAR_RATE', wage: NONEXEMPT, currency: 'USD',
      payDates: cal.payDates, ...over,
    })
    const sheets = [week('2026-12-07', 'ts1'), week('2026-12-14', 'ts2')]
    const today = d('2026-12-20')
    const byCompany = owedByWeek(sheets, line({ terms: cal.terms }), () => undefined, today)
    expect(byCompany.map((w) => [w.weekOf, w.owedCents, w.dueOn])).toEqual([
      ['2026-12-13', 288_000, '2026-12-24'],
      ['2026-12-06', 288_000, '2026-12-24'],
    ])
    expect(byCompany[0].says).toContain('It is due on your pay day, Dec 24.')
    // What the page reads today, on the line's own monthly rhythm: Jan 8.
    const byLine = owedByWeek(
      sheets,
      line({ terms: { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: d('2026-12-09') } }),
      () => undefined,
      today
    )
    expect(byLine.map((w) => w.dueOn)).toEqual(['2027-01-08', '2027-01-08'])
  })

  it('an open-ended line with no pay cycles written still reads its pay day from the company’s periods', () => {
    // The calendar's own pay days stand in for the cycles nobody wrote.
    expect(cal.payDates.length).toBeGreaterThan(0)
    expect(cal.payDates[0]).toEqual({ kind: 'SALARY_PAY', dueOn: d('2026-12-24'), completedAt: null })
  })

  it('a company that pays by the month, or has not set its first day, gets no calendar: the line’s own answer stands', () => {
    expect(workerPayCalendar({ ...DEFAULT_PAY_RHYTHM, payPeriod: 'MONTHLY' }, RULE, 'SPLIT', { from: '2026-12-01', to: '2027-01-31' })).toBeNull()
    expect(workerPayCalendar({ ...TWO_WEEKS, payFirstPeriodStart: null }, RULE, 'SPLIT', { from: '2026-12-01', to: '2027-01-31' })).toBeNull()
  })
})

describe('a company that pays by the month gets a month’s pay file that never repeats a paid week', () => {
  // Week of Jun 7, 40 x $96 = $3,840, paid. Week of Jun 14, 40 x $96 = $3,840, worked out, not paid.
  const row: PayFileRow & { payPeriod: { start: string; end: string }; periodPayDay: string } = {
    person: { name: 'Omar Haddock' }, totalApprovedHours: 80, payRate: 9_600, grossPay: 768_000, payCurrency: 'USD',
    payStatus: 'CALCULATED',
    paidSoFar: { hours: 40, grossCents: 384_000 },
    toPay: { hours: 40, grossCents: 384_000, overtimeHours: 0, premiumCents: 0, rates: null, rateCents: 9_600 },
    payPeriod: { start: '2026-06-01T00:00:00.000Z', end: '2026-06-30T00:00:00.000Z' },
    // June's own pay day, the one that pays June (lib/money/payroll-rows, `periodPayDay`).
    periodPayDay: '2026-07-09',
  }

  it('the second June file lists 40 hours and $3,840.00 still to pay, with $3,840.00 paid already, never 80 hours as new', () => {
    const [, line] = payFileCsv([row], null).trim().split('\n')
    expect(line).toBe('Omar Haddock,40,96.00,0,0.00,3840.00,3840.00,USD,2026-06-01,2026-06-30,2026-07-09,Part paid,')
  })

  it('once both weeks are paid, the June file pays nothing and says $7,680.00 was paid already', () => {
    const paid = { ...row, payStatus: 'PROCESSED', paidSoFar: { hours: 80, grossCents: 768_000 },
      toPay: { hours: 0, grossCents: 0, overtimeHours: 0, premiumCents: 0, rates: null, rateCents: 9_600 } }
    const [, line] = payFileCsv([paid], null).trim().split('\n')
    expect(line).toBe('Omar Haddock,0,96.00,0,0.00,0.00,7680.00,USD,2026-06-01,2026-06-30,2026-07-09,Paid,')
  })

  it('the button asks the Payroll page for the month, and the file is named by it', () => {
    expect(payFileHref('2026-06')).toBe('/api/payroll?period=2026-06&format=csv')
    expect(monthPayFileName('2026-06')).toBe('payroll-2026-06.csv')
  })

  it('the view of every period, and the older export, say in a sentence where the pay file is', () => {
    expect(PICK_A_MONTH_FOR_PAY_FILE).toBe('A pay file comes from one month, so no hour is paid twice. Pick a month above.')
    expect(EXPORT_IS_NOT_A_PAY_FILE).toBe(
      'This list shows accepted hours whether or not they were paid. Download the pay file from the Payroll page instead.'
    )
    for (const n of [...words(PICK_A_MONTH_FOR_PAY_FILE), ...words(EXPORT_IS_NOT_A_PAY_FILE)]) expect(n).toBeLessThan(25)
  })

  it('the older export gives no file in any spelling of csv, and the month file reads the Payroll page’s own rows', () => {
    const exp = src('src/app/api/payroll/export/route.ts')
    expect(exp).toContain("url.searchParams.get('format')?.toLowerCase()")
    expect(exp).not.toContain('toCsv(')
    const route = src('src/app/api/payroll/route.ts')
    expect(route).toContain("url.searchParams.get('format')?.toLowerCase() === 'csv'")
    expect(route).toContain('payFileCsv(items, shownPeriod)')
    // period=all was a 500; it is a sentence now.
    expect(route).toContain("message: 'Pick a month or one of your pay periods.'")
  })
})

describe('a calculation that did not say what it covered sends the period back to Calculate', () => {
  it('a late 40-hour week at $45 after such a calculation is not paid until Calculate runs again', () => {
    const period = { start: '2026-06-01', end: '2026-06-30' }
    const ask = { buyContractId: 'bc1', buyContractCandidateId: 'c1', start: '2026-06-01T00:00:00.000Z', end: '2026-06-30T00:00:00.000Z' }
    const late = [15, 16, 17, 18, 19].map((n) => ({ timesheetId: 'ts2', day: `2026-06-${n}`, hours: 8 }))
    const old = workedOutKeys([{ contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period }] }])
    expect(isWorkedOut(old, ask, payCovers(late))).toBe(false)
    const again = workedOutKeys([
      { contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period }] },
      { contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period, covers: payCovers(late) }] },
    ])
    expect(isWorkedOut(again, ask, payCovers(late))).toBe(true)
  })
})

describe('a week over 40 hours outside the US, for a person nobody has said is exempt, says why it is paid at straight time', () => {
  const where = (over: object) => ({ wageRule: null, payCurrency: 'USD', entityCountry: null, siteCountry: null, ...over })
  const line = (over: object) => payLineFor({
    buyAfterHours: null, sellAfterHours: null, personName: 'Ravi Kumar', employerName: 'Brightmoor Staffing',
    contractType: 'W2', weAreTheEmployer: true, exemptStatus: null, where: where(over),
  })
  // Monday Dec 14 to Friday Dec 18, 2026: 10 + 9 x 4 = 46 hours, all 46 x $96 = $4,416 at straight time.
  const days = { '2026-12-14': 10, '2026-12-15': 9, '2026-12-16': 9, '2026-12-17': 9, '2026-12-18': 9 }

  it('a work site in India: the row says the US 40-hour line is not applied, nobody has said, and every hour is straight time', () => {
    const said = payLineSays(line({ siteCountry: 'IN' }), { personName: 'Ravi Kumar', employerName: 'Brightmoor Staffing' }, weeklyWorked(days))
    expect(said).toBe(
      'Ravi Kumar worked 46 hours in the week of December 13, 2026. The US 40-hour overtime line is not applied, ' +
        'because the work site is in India. Nobody has recorded whether Ravi Kumar is exempt, or which country\'s ' +
        'overtime rules apply. Neither contract sets an overtime line, so every hour is paid at straight time.'
    )
    for (const n of words(said!)) expect(n).toBeLessThan(25)
  })

  it('pay in rupees says the same, naming the currency', () => {
    const said = payLineSays(line({ payCurrency: 'INR' }), { personName: 'Ravi Kumar' }, weeklyWorked(days))
    expect(said).toContain('because pay is in INR.')
  })

  it('a week of 40 hours needs no sentence', () => {
    const said = payLineSays(line({ siteCountry: 'IN' }), { personName: 'Ravi Kumar' }, weeklyWorked({ '2026-12-14': 8, '2026-12-15': 8, '2026-12-16': 8, '2026-12-17': 8, '2026-12-18': 8 }))
    expect(said).toBeNull()
  })
})

describe('the placement’s list of papers says the route’s own words for a client’s paper the start never checks', () => {
  it('the client’s master agreement from the default set reads "Asked of the client, not checked at the start", in a passive tone', () => {
    const chip = paperChip({ waived: false, waiverRefused: false, blocks: false, required: true, standingSays: NOT_CHECKED_AT_START })
    expect(chip).toEqual({ word: 'Asked of the client, not checked at the start', tone: 'passive' })
  })

  it('a paper somebody wrote on the order, which the start does check, still reads "Required"', () => {
    expect(paperChip({ waived: false, waiverRefused: false, blocks: false, required: true, standingSays: null }))
      .toEqual({ word: 'Required', tone: 'attention' })
  })

  it('the panel draws the chip from the route’s words, never a word of its own', () => {
    const panel = src('src/app/dashboard/purchase-orders/paper-set.tsx')
    expect(panel).toContain('standingSays?: string | null')
    expect(panel).toContain('const chip = paperChip(i)')
    expect(panel).toContain('<Chip tone={chip.tone}>{chip.word}</Chip>')
  })
})
