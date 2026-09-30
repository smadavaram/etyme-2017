/**
 * Which hours are paid, when the employer accepts fewer than were worked,
 * on a line whose paying firm chose to keep the week's overtime.
 *
 * Since 2026-09-30 this is a setting on the pay line and not the default:
 * the default pays overtime only on the accepted hours over the line, and
 * its sentences are in cut-overtime-pay.test.ts. Every sentence here is the
 * ordinary-first rule, which is what KEEP_WEEK_OVERTIME pays.
 *
 * The founder, 2026-09-29 ("yes to all"): the cut on PAY comes off the
 * worker's ordinary hours first, so the worker keeps their overtime —
 * the opposite of the billing rule, on purpose: on the bill the firm
 * protects its client, on pay it protects its worker.
 *
 * One allocation for the run, the screen, the file and back pay:
 * ordinary hours first, from the latest day backward.
 *
 * And the founder, the same day: an acceptance at or under the line is
 * the hours worked. Where the employer accepts forty hours or fewer of a
 * longer week, those hours are paid at straight time; above the line the
 * worker keeps their overtime.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  payBands, payCut, paidDayMaps, payCutSays, acceptanceForPay, acceptedOn, paySheet, straightTimeSays, straightTimeWeeks,
} from '@/lib/money/pay-hours'
import { acceptedDays } from '@/lib/periods'
import { sheetOvertime, sheetPay, premiumByDay, overtimeSaysFor, type WageLine } from '@/lib/money/sheet-overtime'
import { priceByDay } from '@/lib/contract-rate'
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
  // This file is the ordinary-first cut: the rule a paying firm chooses
  // when it keeps the week's overtime. The default is in cut-overtime-pay.test.ts.
  cutOvertime: 'KEEP_WEEK_OVERTIME',
}

const paidWeek = (accepted: number | null) => {
  const cut = payCut(payBands(WEEK, {}, 40), accepted == null ? null : all(accepted), 40, 'KEEP_WEEK_OVERTIME')
  return cut.weeks[0]
}

describe('the founder’s two examples, a forty-hour line and forty-five hours worked, where the paying firm keeps the week’s overtime', () => {
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

  it('45 worked and 38 accepted pays 38 hours at straight time, because an acceptance under the line is the hours worked', () => {
    const w = paidWeek(38)
    expect([w.regular, w.over]).toEqual([38, 0])
    expect(w.underTheLine).toBe(true)
    const weeks = sheetOvertime({
      days: WEEK, accepted: all(38), afterHours: 40, contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    // No week over the line, so no premium, priced or held.
    expect(weeks).toEqual([])
    expect(premiumByDay(weeks).size).toBe(0)
    expect(overtimeSaysFor(weeks)).toBeNull()
    // 38 hours at $66, and nothing on top.
    const paid = paySheet({ cutOvertime: 'KEEP_WEEK_OVERTIME', all: WEEK, mine: WEEK, leaveDays: {}, afterHours: 40, accepted: all(38) })
    expect(priceByDay({ contractRateCents: 6_600, periods: [], days: paid.days }).cents).toBe(38 * 6_600)
  })

  it('45 worked and 40 accepted pays 40 at straight time', () => {
    const w = paidWeek(40)
    expect([w.regular, w.over]).toEqual([40, 0])
    expect(w.underTheLine).toBe(true)
    const weeks = sheetOvertime({
      days: WEEK, accepted: all(40), afterHours: 40, contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    expect(premiumByDay(weeks).size).toBe(0)
  })

  it('45 worked and 41 accepted pays 36 ordinary and 5 overtime', () => {
    const w = paidWeek(41)
    expect([w.regular, w.over]).toEqual([36, 5])
    expect(w.underTheLine).toBe(false)
    const weeks = sheetOvertime({
      days: WEEK, accepted: all(41), afterHours: 40, contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    expect(weeks[0].overHours).toBe(5)
    expect(Math.round(weeks[0].overtime!.premiumCents)).toBe(5 * 3_300)
  })

  it('says a week accepted under the line in one sentence: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(38), 40, 'KEEP_WEEK_OVERTIME')
    expect(straightTimeSays(cut.weeks[0], 40)).toBe(
      'Week of July 6, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.'
    )
    expect(payCutSays(cut, { personName: 'Priya', employerName: 'Brightmoor' })).toBe(
      'Brightmoor accepted 38 of the 45 hours Priya filed, so 38 are paid. The 7 not accepted come off ordinary hours first, ' +
        'from the last day back. Week of July 6, 2026: 38 of 45 hours accepted; paid at straight time because the accepted ' +
        'week is not over 40.'
    )
    // A week that keeps its overtime says nothing of straight time.
    expect(straightTimeWeeks(payCut(payBands(WEEK, {}, 40), all(42), 40, 'KEEP_WEEK_OVERTIME'))).toEqual([])
  })

  it('judges the week on the line in force: on a contract’s own 37.5-hour line, 37.5 of 45 accepted is straight time and 39 keeps its 7.5 hours over the line', () => {
    const at = (n: number) => payCut(payBands(WEEK, {}, 37.5), all(n), 37.5, 'KEEP_WEEK_OVERTIME').weeks[0]
    expect([at(37.5).regular, at(37.5).over, at(37.5).underTheLine]).toEqual([37.5, 0, true])
    expect([at(39).regular, at(39).over, at(39).underTheLine]).toEqual([31.5, 7.5, false])
    expect(straightTimeSays(at(37.5), 37.5)).toBe(
      'Week of July 6, 2026: 37.5 of 45 hours accepted; paid at straight time because the accepted week is not over 37.5.'
    )
  })

  it('judges the accepted week on hours worked and never on paid leave: 46 of 54 accepted with 8 of leave is 38 worked, paid at straight time', () => {
    // Monday to Saturday at nine, eight of Monday's paid leave: 46 worked,
    // 6 over the line on Saturday. 46 accepted: 8 struck, off Saturday's
    // 3 ordinary and 5 of Friday's. 38 worked remain, with the 8 of leave.
    const six = { ...WEEK, '2026-07-11': 9 }
    const cut = payCut(payBands(six, { '2026-07-06': 8 }, 40), all(46), 40, 'KEEP_WEEK_OVERTIME')
    const w = cut.weeks[0]
    expect([w.regular, w.leave, w.over, w.underTheLine]).toEqual([38, 8, 0, true])
    expect(cut.paid).toBe(46)
    expect(straightTimeSays(w, 40)).toBe(
      'Week of July 6, 2026: 46 of 54 hours accepted, 8 of them paid leave; paid at straight time because the 38 hours ' +
        'worked in the accepted week are not over 40.'
    )
  })
})

describe('where the paying firm keeps the week’s overtime: ordinary hours first, from the latest day backward', () => {
  it('takes the hours struck out off the latest day’s ordinary hours first, and never off the hours over the line', () => {
    // Friday holds 4 ordinary hours and the 5 over the line. Seven struck:
    // Friday's 4 ordinary, then 3 of Thursday's.
    const { days } = paidDayMaps(payCut(payBands(WEEK, {}, 40), all(38), 40, 'KEEP_WEEK_OVERTIME'))
    expect(days).toEqual({ '2026-07-06': 9, '2026-07-07': 9, '2026-07-08': 9, '2026-07-09': 6, '2026-07-10': 5 })
  })

  it('takes hours worked before paid leave on the same day', () => {
    // Friday: 9 hours, 4 of them paid leave, so 41 worked and 1 over the
    // line. One struck comes off Friday's ordinary worked hours — not its
    // leave, and not the hour over the line: Friday keeps 3 ordinary, its
    // 4 of leave and the hour over, 4 worked in all.
    const bands = payBands(WEEK, { '2026-07-10': 4 }, 40)
    const cut = payCut(bands, all(44), 40, 'KEEP_WEEK_OVERTIME')
    const friday = cut.days.find((d) => d.day === '2026-07-10')!
    expect([friday.leave, friday.regular + friday.over]).toEqual([4, 4])
    // As accepted the week is 40 worked, not over the line, so the hour
    // worked past it is paid at straight time with the rest.
    expect([friday.regular, friday.over, cut.weeks[0].underTheLine]).toEqual([4, 0, true])
    // Five struck: Friday's 4 worked ordinary hours, then 1 of its leave;
    // the hour past the line stays, at straight time — 37 worked.
    const five = payCut(bands, all(40), 40, 'KEEP_WEEK_OVERTIME').days.find((d) => d.day === '2026-07-10')!
    expect([five.regular, five.leave, five.over]).toEqual([1, 3, 0])
  })

  it('never pays more hours than the employer accepted, even where the cut has to reach the hours over the line: 4 of 45 accepted pays 4, at straight time', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(4), 40, 'KEEP_WEEK_OVERTIME')
    expect(cut.paid).toBe(4)
    expect([cut.weeks[0].regular, cut.weeks[0].over]).toEqual([4, 0])
    expect(cut.weeks[0].underTheLine).toBe(true)
  })

  it('pays the hours filed where more were accepted than filed, and says so', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(47), 40, 'KEEP_WEEK_OVERTIME')
    expect(cut.paid).toBe(45)
    expect(cut.moreThanFiled).toBe(true)
    expect(payCutSays(cut, { personName: 'Priya', employerName: 'Brightmoor' })).toBe(
      'Brightmoor accepted 47 hours and Priya filed 45 hours, so the 45 filed are paid: an hour nobody filed is on no day to pay it on.'
    )
  })

  it('says which hours were paid where fewer were accepted', () => {
    const cut = payCut(payBands(WEEK, {}, 40), all(42), 40, 'KEEP_WEEK_OVERTIME')
    expect(payCutSays(cut, { personName: 'Priya', employerName: 'Brightmoor' })).toBe(
      'Brightmoor accepted 42 of the 45 hours Priya filed, so 42 are paid. The 3 not accepted come off ordinary hours first, ' +
        'from the last day back, so hours over the line keep their premium.'
    )
    expect(payCutSays(payCut(payBands(WEEK, {}, 40), null, 40, 'KEEP_WEEK_OVERTIME'), { personName: 'Priya' })).toBeNull()
  })

  it('where the paying firm keeps the week’s overtime, pay is cut the opposite way to the bill: the bill loses the overtime first, the pay loses ordinary hours first', () => {
    const bands = payBands(WEEK, {}, 40)
    const billed = acceptedDays(bands, all(42))
    expect([billed.reduce((n, d) => n + d.regular, 0), billed.reduce((n, d) => n + d.over, 0)]).toEqual([40, 2])
    const paid = payCut(bands, all(42), 40, 'KEEP_WEEK_OVERTIME').weeks[0]
    expect([paid.regular, paid.over]).toEqual([37, 5])
  })

  it('cuts a two-week sheet from the latest week back, so the first week keeps its overtime', () => {
    const two = { ...WEEK, '2026-07-13': 8, '2026-07-14': 8, '2026-07-15': 8, '2026-07-16': 8, '2026-07-17': 8 }
    const cut = payCut(payBands(two, {}, 40), all(82), 40, 'KEEP_WEEK_OVERTIME')
    // 85 filed, 82 accepted: the 3 come off the latest ordinary hours,
    // Friday 17 July, and the first week keeps its overtime.
    expect(cut.weeks.map((w) => [w.weekOf, w.regular, w.over, w.underTheLine])).toEqual([
      ['2026-07-06', 40, 5, false],
      ['2026-07-13', 37, 0, false],
    ])
  })

  it('pays only the week of a two-week sheet that the cut takes under the line at straight time, and the other keeps its overtime', () => {
    // Two weeks of forty-five, 90 filed, 82 accepted: the 8 come off the
    // second week's ordinary hours, which leaves it 37 worked — straight
    // time — while the first keeps its 5 over the line.
    const second = { '2026-07-13': 9, '2026-07-14': 9, '2026-07-15': 9, '2026-07-16': 9, '2026-07-17': 9 }
    const cut = payCut(payBands({ ...WEEK, ...second }, {}, 40), all(82), 40, 'KEEP_WEEK_OVERTIME')
    expect(cut.weeks.map((w) => [w.weekOf, w.regular, w.over, w.underTheLine])).toEqual([
      ['2026-07-06', 40, 5, false],
      ['2026-07-13', 37, 0, true],
    ])
    expect(payCutSays(cut, { personName: 'Priya', employerName: 'Brightmoor' })).toContain(
      'so hours over the line keep their premium. Week of July 13, 2026: 37 of 45 hours accepted; paid at straight time'
    )
  })

  it('pays a partial acceptance on the days it covers, the week still judged whole against the line', () => {
    // Wednesday to Friday accepted at 27: the whole week crossed the line
    // on Friday, so Friday's 5 are over it; as accepted the week holds 27.
    const cut = payCut(payBands(WEEK, {}, 40), { hours: 27, from: '2026-07-08', to: '2026-07-10' }, 40, 'KEEP_WEEK_OVERTIME')
    expect(cut.days.map((d) => d.day)).toEqual(['2026-07-08', '2026-07-09', '2026-07-10'])
    expect(cut.paid).toBe(27)
    // As accepted the week holds 27 worked hours, under the line: all 27
    // at straight time, Friday's 5 among them.
    expect(cut.weeks[0].underTheLine).toBe(true)
    expect([cut.weeks[0].regular, cut.weeks[0].over]).toEqual([27, 0])
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
    expect(acceptedOn(WEEK, {}, 40, all(42), mine, 'KEEP_WEEK_OVERTIME')).toEqual(all(27))
    const theirs = { '2026-07-09': 9, '2026-07-10': 9 }
    expect(acceptedOn(WEEK, {}, 40, all(42), theirs, 'KEEP_WEEK_OVERTIME')).toEqual(all(15))
    expect(paySheet({ cutOvertime: 'KEEP_WEEK_OVERTIME', all: WEEK, mine: theirs, leaveDays: {}, afterHours: 40, accepted: all(42) }).days).toEqual({
      '2026-07-09': 9, '2026-07-10': 6,
    })
  })
})

describe('the payroll file takes the same cut, on a line that keeps the week’s overtime', () => {
  const row = (acceptedHours: number): SheetToPay => ({
    personName: 'Priya Venkataraman', payrollId: 'E1', contractType: 'W2', weAreTheEmployer: true, cutOvertime: 'KEEP_WEEK_OVERTIME',
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

  it('puts 38 hours at straight time on the file where 38 of 45 were accepted, with the week’s sentence as a note, rather than leaving the sheet off', () => {
    const e = buildExport('ADP', [row(38)])
    expect(e.skipped).toHaveLength(0)
    expect(e.lines).toHaveLength(1)
    expect([e.lines[0].hours, e.lines[0].overtimeHours]).toEqual([38, 0])
    expect(e.lines[0].totalCents).toBe(38 * 6_600)
    expect(e.lines[0].notes).toContain(
      'Priya Venkataraman, week of July 6, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.'
    )
  })

  it('puts 40 of 45 accepted on the file as 40 at straight time, and 41 as 36 ordinary and 5 overtime', () => {
    const forty = buildExport('ADP', [row(40)]).lines[0]
    expect([forty.hours, forty.overtimeHours, forty.totalCents]).toEqual([40, 0, 40 * 6_600])
    const fortyOne = buildExport('ADP', [row(41)]).lines[0]
    expect([fortyOne.hours, fortyOne.overtimeHours, fortyOne.totalCents]).toEqual([36, 5, 36 * 6_600 + 5 * 9_900])
  })

  it('pays a week accepted under the line at straight time on a worker nobody has classified, because no accepted hour is over the line to classify', () => {
    const e = buildExport('ADP', [{ ...row(38), assertion: null }])
    expect(e.skipped).toHaveLength(0)
    expect([e.lines[0].hours, e.lines[0].overtimeHours]).toEqual([38, 0])
    // Over the line as accepted, the same worker is still left off, unclassified.
    expect(buildExport('ADP', [{ ...row(42), assertion: null }]).lines).toHaveLength(0)
  })

  it('puts the hours worked past the line on the rate they were worked at, where a week accepted under the line crossed a rate change', () => {
    // $66 Monday to Wednesday, $70 from Thursday; 45 filed, 38 accepted.
    // Paid: 27 at $66 and 11 at $70 — Thursday's 6 and Friday's 5.
    const e = buildExport('ADP', [{
      ...row(38),
      weeks: [{
        weekOf: '2026-07-06', regularHours: 40, leaveHours: 0, overHours: 5, client: { treatment: null, appliedBps: null },
        payRateCents: 6_600,
        rates: [{ rateCents: 6_600, hours: 27 }, { rateCents: 7_000, hours: 13 }],
        worked: [
          { day: '2026-07-06', hours: 9, rateCents: 6_600 }, { day: '2026-07-07', hours: 9, rateCents: 6_600 },
          { day: '2026-07-08', hours: 9, rateCents: 6_600 }, { day: '2026-07-09', hours: 9, rateCents: 7_000 },
          { day: '2026-07-10', hours: 9, rateCents: 7_000 },
        ],
      }],
    }])
    expect(e.lines.map((l) => [l.rateCents, l.hours, l.overtimeHours])).toEqual([[6_600, 27, 0], [7_000, 11, 0]])
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

describe('the payroll file pays the overtime method the run pays', () => {
  it('reads the paying firm’s choice, who made it and why, off the buy line, because a choice read as the default is a choice ignored', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'app/api/payroll/export/route.ts'), 'utf8')
    expect(src).toContain('overtimeMethod: true, overtimeMethodById: true, overtimeMethodReason: true')
    expect(src).toContain('methodFor(buy)')
  })
})

describe('the worker’s page prices a cut week with the function payroll pays it with', () => {
  const one = (n: number) =>
    sheetPay({
      days: WEEK, leaveDays: {}, afterHours: 40, accepted: all(n),
      contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
  // The run's two calls, as the run makes them.
  const run = (n: number) => {
    const p = paySheet({ cutOvertime: 'KEEP_WEEK_OVERTIME', all: WEEK, mine: WEEK, leaveDays: {}, afterHours: 40, accepted: all(n) })
    const weeks = sheetOvertime({
      days: WEEK, leaveDays: {}, accepted: p.accepted, afterHours: 40,
      contractRateCents: 6_600, periods: [], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    return { days: p.days, premiums: premiumByDay(weeks) }
  }
  const straight = (n: number) => priceByDay({ contractRateCents: 6_600, periods: [], days: one(n).days }).cents
  const premium = (n: number) => Math.round([...one(n).premiums.values()].reduce((a, p) => a + p.premiumCents, 0))

  it('gives, in one call, the days and the premium the payroll run pays, for every acceptance from 38 to 45', () => {
    for (const n of [38, 40, 41, 42, 45]) {
      expect(one(n).days).toEqual(run(n).days)
      expect([...one(n).premiums]).toEqual([...run(n).premiums])
    }
  })

  it('42 of 45 accepted is $2,772 of straight time and $165 of premium; 38 of 45 is $2,508 of straight time and nothing on top', () => {
    expect([straight(42), premium(42)]).toEqual([42 * 6_600, 5 * 3_300])
    expect([straight(38), premium(38)]).toEqual([38 * 6_600, 0])
  })

  it('names each week paid at straight time, with the hours accepted, filed and worked and the line, so the page can say it to the worker', () => {
    expect(one(38).straightTime.map((w) => [w.weekOf, w.accepted, w.filed, w.worked, w.line])).toEqual([
      ['2026-07-06', 38, 45, 38, 40],
    ])
    expect(one(38).says).toContain('Week of July 6, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.')
    expect(one(42).straightTime).toEqual([])
    expect(one(45).says).toBeNull()
  })
})
