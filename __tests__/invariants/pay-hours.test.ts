/**
 * Which hours are paid, when the employer accepts fewer than were worked.
 *
 * The founder, 2026-09-29 ("yes to all"): the cut on PAY comes off the
 * worker's ordinary hours first, so the worker keeps their overtime —
 * the opposite of the billing rule, on purpose: on the bill the firm
 * protects its client, on pay it protects its worker.
 *
 * One allocation for the run, the screen, the file and back pay:
 * ordinary hours first, from the latest day backward.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payBands, payCut, paidDayMaps, payCutSays, acceptanceForPay, acceptedOn, paySheet } from '@/lib/money/pay-hours'
import { acceptedDays } from '@/lib/periods'
import { sheetOvertime, premiumByDay, overtimeSaysFor, type WageLine } from '@/lib/money/sheet-overtime'
import { buildExport, type SheetToPay } from '@/lib/payroll-export'

// Monday 6 July to Friday 10 July 2026, nine hours a day: forty-five.
const WEEK = { '2026-07-06': 9, '2026-07-07': 9, '2026-07-08': 9, '2026-07-09': 9, '2026-07-10': 9 }
const all = (n: number) => ({ hours: n, from: null, to: null })

const nonexempt: WageLine = {
  personName: 'Priya Venkataraman',
  contractType: 'W2',
  weAreTheEmployer: true,
  payModel: 'FIXED_HOURLY',
  rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'co', assertedByCompanyName: 'Brightmoor',
    assertedByName: null, assertedAt: new Date('2026-06-01T00:00:00Z'), note: null, reviewBy: null,
  },
  contractPremiumBps: null,
  employerName: 'Brightmoor',
}

const paidWeek = (accepted: number | null) => {
  const cut = payCut(payBands(WEEK, {}, 40), accepted == null ? null : all(accepted), 40)
  return cut.weeks[0]
}

describe('the founder’s two examples, a forty-hour line and forty-five hours worked', () => {
  it('45 worked and 42 accepted pays 37 ordinary hours and 5 overtime', () => {
    const w = paidWeek(42)
    expect([w.regular, w.over]).toEqual([37, 5])
    expect(w.underTheLine).toBe(false)
  })

  it('45 worked and 42 accepted pays the five overtime hours time and a half: $165 of premium at $66', () => {
    const weeks = sheetOvertime({
      days: WEEK, accepted: all(42), afterHours: 40, contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    expect(weeks).toHaveLength(1)
    expect(weeks[0].overHours).toBe(5)
    expect(Math.round(weeks[0].overtime!.premiumCents)).toBe(16_500)
    // On Friday, the day the week crossed the line.
    expect([...premiumByDay(weeks).keys()]).toEqual(['2026-07-10'])
  })

  it('45 worked and 38 accepted pays 38 hours — 33 ordinary and the 5 worked past the line — at straight time, and holds the premium, because as accepted the week no longer goes over the line', () => {
    const w = paidWeek(38)
    expect([w.regular, w.over]).toEqual([33, 5])
    expect(w.underTheLine).toBe(true)
    const weeks = sheetOvertime({
      days: WEEK, accepted: all(38), afterHours: 40, contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    expect(weeks[0].terms.priced).toBe(false)
    expect(weeks[0].overtime).toBeNull()
    expect(premiumByDay(weeks).size).toBe(0)
    expect(overtimeSaysFor(weeks)).toContain(
      'In the week of July 6, 2026, Priya Venkataraman worked 45 hours, 5 over the 40-hour line, and Brightmoor accepted 38 of them. ' +
        'As accepted, the week no longer goes over the line, and nobody has decided whether the 5 hours worked past it still earn a premium. ' +
        'They are paid at straight time and the premium is held until that is decided.'
    )
  })

  it('holds the premium on a week accepted at exactly the line, because a week of forty does not go over forty', () => {
    expect(paidWeek(40).underTheLine).toBe(true)
    expect(paidWeek(41).underTheLine).toBe(false)
  })
})

describe('the one allocation for pay: ordinary hours first, from the latest day backward', () => {
  it('takes the hours struck out off the latest day’s ordinary hours first, and never off the hours over the line', () => {
    // Friday holds 4 ordinary hours and the 5 over the line. Seven struck:
    // Friday's 4 ordinary, then 3 of Thursday's.
    const { days } = paidDayMaps(payCut(payBands(WEEK, {}, 40), all(38), 40))
    expect(days).toEqual({ '2026-07-06': 9, '2026-07-07': 9, '2026-07-08': 9, '2026-07-09': 6, '2026-07-10': 5 })
  })

  it('takes hours worked before paid leave on the same day', () => {
    // Friday: 9 hours, 4 of them paid leave, so 41 worked and 1 over the
    // line. One struck comes off Friday's ordinary worked hours — not its
    // leave, and not the hour over the line.
    const bands = payBands(WEEK, { '2026-07-10': 4 }, 40)
    const cut = payCut(bands, all(44), 40)
    const friday = cut.days.find((d) => d.day === '2026-07-10')!
    expect([friday.regular, friday.leave, friday.over]).toEqual([3, 4, 1])
    // Five struck: Friday's 4 worked ordinary hours, then 1 of its leave.
    const five = payCut(bands, all(40), 40).days.find((d) => d.day === '2026-07-10')!
    expect([five.regular, five.leave, five.over]).toEqual([0, 3, 1])
  })

  it('never pays more hours than the employer accepted, even where the cut has to reach the hours over the line', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(4), 40)
    expect(cut.paid).toBe(4)
    expect(cut.weeks[0].over).toBe(4)
    expect(cut.weeks[0].underTheLine).toBe(true)
  })

  it('pays the hours filed where more were accepted than filed, and says so', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(47), 40)
    expect(cut.paid).toBe(45)
    expect(cut.moreThanFiled).toBe(true)
    expect(payCutSays(cut, { personName: 'Priya', employerName: 'Brightmoor' })).toBe(
      'Brightmoor accepted 47 hours and Priya filed 45 hours, so the 45 filed are paid: an hour nobody filed is on no day to pay it on.'
    )
  })

  it('says which hours were paid where fewer were accepted', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(42), 40)
    expect(payCutSays(cut, { personName: 'Priya', employerName: 'Brightmoor' })).toBe(
      'Brightmoor accepted 42 of the 45 hours Priya filed, so 42 are paid. The 3 not accepted come off ordinary hours first, ' +
        'from the last day back, so hours over the line keep their premium.'
    )
    expect(payCutSays(payCut(payBands(WEEK, {}, 40), null, 40), { personName: 'Priya' })).toBeNull()
  })

  it('cuts pay the opposite way to the bill, on purpose: the bill loses the overtime first, the pay loses ordinary hours first', () => {
    const bands = payBands(WEEK, {}, 40)
    const billed = acceptedDays(bands, all(42))
    expect([billed.reduce((n, d) => n + d.regular, 0), billed.reduce((n, d) => n + d.over, 0)]).toEqual([40, 2])
    const paid = payCut(bands, all(42), 40).weeks[0]
    expect([paid.regular, paid.over]).toEqual([37, 5])
  })

  it('cuts a two-week sheet from the latest week back, and holds only the week that falls under the line', () => {
    const two = { ...WEEK, '2026-07-13': 8, '2026-07-14': 8, '2026-07-15': 8, '2026-07-16': 8, '2026-07-17': 8 }
    const cut = payCut(payBands(two, {}, 40), all(82), 40)
    // 85 filed, 82 accepted: the 3 come off the latest ordinary hours,
    // Friday 17 July, and the first week keeps its overtime.
    expect(cut.weeks.map((w) => [w.weekOf, w.regular, w.over, w.underTheLine])).toEqual([
      ['2026-07-06', 40, 5, false],
      ['2026-07-13', 37, 0, false],
    ])
  })

  it('pays a partial acceptance on the days it covers, the week still judged whole against the line', () => {
    // Wednesday to Friday accepted at 27: the whole week crossed the line
    // on Friday, so Friday's 5 are over it; as accepted the week holds 27.
    const cut = payCut(payBands(WEEK, {}, 40), { hours: 27, from: '2026-07-08', to: '2026-07-10' }, 40)
    expect(cut.days.map((d) => d.day)).toEqual(['2026-07-08', '2026-07-09', '2026-07-10'])
    expect(cut.paid).toBe(27)
    expect(cut.weeks[0].underTheLine).toBe(true)
  })
})

describe('whose acceptance is paid', () => {
  const sheet = { periodStart: new Date('2026-07-06T00:00:00Z'), periodEnd: new Date('2026-07-10T00:00:00Z'), acceptedHours: null }

  it('pays the employer’s acceptance in the ledger', () => {
    expect(acceptanceForPay([{ role: 'EMPLOYER_ACCEPTANCE', hours: '42.00', companyId: 'co' }], sheet, 'co')).toEqual(all(42))
  })

  it('refuses to guess between two standing acceptances', () => {
    expect(
      acceptanceForPay(
        [{ role: 'EMPLOYER_ACCEPTANCE', hours: 42, companyId: 'co' }, { role: 'EMPLOYER_ACCEPTANCE', hours: 40, companyId: 'co' }],
        sheet,
        'co'
      )
    ).toBe('MANY')
  })

  it('reads the column that predates the ledger only where the ledger has nothing', () => {
    expect(acceptanceForPay([], { ...sheet, acceptedHours: '38' }, 'co')).toEqual(all(38))
    expect(acceptanceForPay([], sheet, 'co')).toBeNull()
  })

  it('reads a covered range as the days it covers', () => {
    const a = acceptanceForPay(
      [{ role: 'EMPLOYER_ACCEPTANCE', hours: 27, companyId: 'co', coversFrom: new Date('2026-07-08T00:00:00Z'), coversTo: null }],
      sheet,
      'co'
    )
    expect(a).toEqual({ hours: 27, from: '2026-07-08', to: null })
  })

  it('keeps, on the days one line was in force for, what the whole-sheet cut left on them', () => {
    // A new line from Thursday: the old line's Monday to Wednesday keep all
    // 27 of theirs, because the 3 struck came off Friday.
    const mine = { '2026-07-06': 9, '2026-07-07': 9, '2026-07-08': 9 }
    expect(acceptedOn(WEEK, {}, 40, all(42), mine)).toEqual(all(27))
    const theirs = { '2026-07-09': 9, '2026-07-10': 9 }
    expect(acceptedOn(WEEK, {}, 40, all(42), theirs)).toEqual(all(15))
    expect(paySheet({ all: WEEK, mine: theirs, leaveDays: {}, afterHours: 40, accepted: all(42) }).days).toEqual({
      '2026-07-09': 9, '2026-07-10': 6,
    })
  })
})

describe('the payroll file takes the same cut', () => {
  const row = (acceptedHours: number): SheetToPay => ({
    personName: 'Priya Venkataraman', payrollId: 'E1', contractType: 'W2', weAreTheEmployer: true,
    periodStart: new Date('2026-07-06T00:00:00Z'), periodEnd: new Date('2026-07-10T00:00:00Z'),
    weeks: [{ weekOf: '2026-07-06', regularHours: 40, leaveHours: 0, overHours: 5, client: { treatment: null, appliedBps: null } }],
    submittedHours: 45, acceptedHours, employerAcceptedAt: new Date('2026-07-11T00:00:00Z'),
    payRateCents: 6_600, payModel: 'FIXED_HOURLY', paidOnSalaryBasis: false, rule: 'US_FLSA',
    assertion: nonexempt.assertion, currency: 'USD', costCode: null, orderNumber: null, employerName: 'Brightmoor',
  })

  it('puts 37 ordinary hours and 5 overtime on the file where 42 of 45 were accepted', () => {
    const e = buildExport('ADP', [row(42)])
    expect([e.lines[0].hours, e.lines[0].overtimeHours]).toEqual([37, 5])
    expect(e.lines[0].overtimeCents).toBe(5 * 9_900)
  })

  it('leaves the sheet off the file, and says why, where 38 of 45 were accepted — the premium is held, not guessed', () => {
    const e = buildExport('ADP', [row(38)])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toContain('As accepted, the week no longer goes over the line')
    expect(e.skipped[0].action).toContain('pay this sheet by hand')
  })

  it('does not cut a second time where the days were already cut to the hours accepted', () => {
    const e = buildExport('ADP', [{
      ...row(42),
      weeksAreAccepted: true,
      weeks: [{ weekOf: '2026-07-06', regularHours: 37, leaveHours: 0, overHours: 5, client: { treatment: null, appliedBps: null } }],
    }])
    expect([e.lines[0].hours, e.lines[0].overtimeHours]).toEqual([37, 5])
  })

  it('leaves off a sheet with two standing acceptances, in a sentence', () => {
    const e = buildExport('ADP', [{ ...row(42), cannotPay: 'Two acceptances stand on the week.' }])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toBe('Two acceptances stand on the week.')
  })
})

describe('the run, the screen, the file and back pay cut in one place', () => {
  const root = join(__dirname, '..', '..', 'src')
  it('reads the hours accepted through lib/money/pay-hours, and never hands the filed days to the by-day pricing to cut', () => {
    for (const f of ['app/api/payroll/run/route.ts', 'app/api/payroll/route.ts', 'app/api/payroll/export/route.ts', 'lib/money/back-pay.ts']) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src).toContain("from '@/lib/money/pay-hours'")
      expect(src).toContain('acceptanceForPay(')
    }
    // The run and the screen price the days already cut: `hours` is only
    // ever given where a sheet has no daily hours at all.
    for (const f of ['app/api/payroll/run/route.ts', 'app/api/payroll/route.ts']) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src).toMatch(/hours: Object\.keys\([^)]*\)\.length > 0 \? null/)
    }
  })
})
