import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  payLineFor, heldForExemption, withoutHeldWeeks, heldSays, owedSinceRecordedSays, judgedLine,
  type PayLineInput,
} from '@/lib/money/pay-line'
import { sheetPay, wageLineFor } from '@/lib/money/sheet-overtime'
import { priceByDay } from '@/lib/contract-rate'
import { payCovers, coversLeft, workedOutKeys, isWorkedOut } from '@/lib/money/payroll-worked-out'
import { periodStatusFromRuns } from '@/lib/money/payroll-rows'
import { payFileWaits, firstDayNeededSays, MONTH_HAS_NO_PAY_FILE, type PayFileRow } from '@/lib/money/pay-periods'
import { DEFAULT_PAY_RHYTHM, type PayRhythm } from '@/lib/pay-dates'
import { exemptBody, EXEMPTION_CHOICES } from '@/lib/money/exempt-form'
import { checkAssertion, screenExemption, type ExemptStatus, type ExemptionBasis } from '@/lib/worker-classification'

/**
 * The pay-run faults a skeptic worked by hand on 2026-11-14, each as a
 * sentence a payroll person can check.
 *
 * Calendar facts: Sunday Nov 8, 2026 begins the week; Nov 9 to Nov 13
 * are Monday to Friday. Sunday Oct 11, 2026 begins a two-week period.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const words = (t: string) => t.split(/(?<=\.)\s+/).map((s) => s.split(/\s+/).length)

/** 46 hours, Monday to Friday of the week of Nov 8, 2026. */
const WEEK_46 = { '2026-11-09': 10, '2026-11-10': 9, '2026-11-11': 9, '2026-11-12': 9, '2026-11-13': 9 }
/** 60 hours, the same week. */
const WEEK_60 = { '2026-11-09': 12, '2026-11-10': 12, '2026-11-11': 12, '2026-11-12': 12, '2026-11-13': 12 }
/** 40 hours, the same week. */
const WEEK_40 = { '2026-11-09': 8, '2026-11-10': 8, '2026-11-11': 8, '2026-11-12': 8, '2026-11-13': 8 }

const US = { wageRule: null, payCurrency: 'USD', entityCountry: null, siteCountry: 'US' }
const w2 = (over: Partial<PayLineInput> = {}) => payLineFor({
  buyAfterHours: null, sellAfterHours: null, personName: 'Omar Haddad', employerName: 'Brightmoor Staffing',
  contractType: 'W2', weAreTheEmployer: true, exemptStatus: null, where: US, ...over,
})
const held = (line: ReturnType<typeof w2>, days: Record<string, number>, accepted: { hours: number; from: string | null; to: string | null } | null = null) =>
  heldForExemption({ line, days, leaveDays: {}, accepted, cutOvertime: 'ABOVE_THE_LINE' })

/** What payroll pays for one week, in cents: straight time on each day plus the premium. */
function weekPay(days: Record<string, number>, rateCents: number, status: ExemptStatus | null): number {
  const line = w2({ exemptStatus: status, where: { ...US, wageRule: status ? 'US_FLSA' : null } })
  const bc = { contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null, payModel: 'FIXED_HOURLY', overtimeAfterHours: null, overtimeMultiplierBps: 15_000 }
  const row = status
    ? { status, basis: status === 'EXEMPT' ? 'COMPUTER' : null, assertedByCompanyId: 'co', assertedAt: new Date('2026-11-01'), note: null, reviewBy: null, wageRule: 'US_FLSA' }
    : null
  const pay = sheetPay({
    days, leaveDays: {}, afterHours: line.afterHours, accepted: null, contractRateCents: rateCents, periods: [],
    method: 'US_REGULAR_RATE', line: wageLineFor(bc, 'Omar Haddad', row),
  })
  const straight = priceByDay({ contractRateCents: rateCents, periods: [], days: pay.days }).days
    .reduce((n, d) => n + Math.round(d.hours * d.rateCents), 0)
  const premium = [...pay.premiums.values()].reduce((n, p) => n + p.premiumCents, 0)
  return straight + Math.round(premium)
}

describe('a week over 40 hours for a person nobody has said is exempt is held off pay, never paid at straight time', () => {
  it('46 hours at $96 with nobody having said is held, because straight time is 46 x 96 = $4,416 and not exempt is $4,704', () => {
    expect(weekPay(WEEK_46, 9_600, 'NONEXEMPT')).toBe(470_400) // 40 x 96 + 6 x 144 = 3,840 + 864
    expect(46 * 9_600).toBe(441_600) // what straight time would have paid, $288 short
    const h = held(w2(), WEEK_46)
    expect(h).toEqual([{ weekOf: '2026-11-08', workedHours: 46, overHours: 6 }])
  })

  it('46 hours at $45 with nobody having said is held: not exempt is 1,800 + 6 x 67.50 = $2,205, straight time $2,070', () => {
    expect(weekPay(WEEK_46, 4_500, 'NONEXEMPT')).toBe(220_500)
    expect(46 * 4_500).toBe(207_000)
    expect(held(w2(), WEEK_46)).toHaveLength(1)
  })

  it('60 hours at $96: not exempt 3,840 + 20 x 144 = $6,720, exempt 60 x 96 = $5,760, and with nobody having said it is held', () => {
    expect(weekPay(WEEK_60, 9_600, 'NONEXEMPT')).toBe(672_000)
    expect(weekPay(WEEK_60, 9_600, 'EXEMPT')).toBe(576_000)
    expect(held(w2(), WEEK_60)).toEqual([{ weekOf: '2026-11-08', workedHours: 60, overHours: 20 }])
  })

  it('60 hours at $45: not exempt 1,800 + 20 x 67.50 = $3,150, exempt $2,700', () => {
    expect(weekPay(WEEK_60, 4_500, 'NONEXEMPT')).toBe(315_000)
    expect(weekPay(WEEK_60, 4_500, 'EXEMPT')).toBe(270_000)
  })

  it('a 40-hour week is paid whatever is recorded: $3,840 at $96 and $1,800 at $45, and nothing is held', () => {
    expect(weekPay(WEEK_40, 9_600, 'NONEXEMPT')).toBe(384_000)
    expect(weekPay(WEEK_40, 9_600, null)).toBe(384_000)
    expect(weekPay(WEEK_40, 4_500, 'EXEMPT')).toBe(180_000)
    expect(held(w2(), WEEK_40)).toEqual([])
  })

  it('a week of 46 hours accepted at 40 is not held: an acceptance at or under the line is straight time either way', () => {
    expect(held(w2(), WEEK_46, { hours: 40, from: null, to: null })).toEqual([])
    expect(held(w2(), WEEK_46, { hours: 44, from: null, to: null })).toEqual([{ weekOf: '2026-11-08', workedHours: 44, overHours: 4 }])
  })

  it('once the person is recorded as not exempt, or as exempt, the week is no longer held', () => {
    expect(held(w2({ exemptStatus: 'NONEXEMPT', where: { ...US, wageRule: 'US_FLSA' } }), WEEK_46)).toEqual([])
    expect(held(w2({ exemptStatus: 'EXEMPT' }), WEEK_46)).toEqual([])
  })

  it('a contract line at 45 hours does not let a 46-hour week through: it is judged on 40 until somebody says', () => {
    const line = w2({ buyAfterHours: 45 })
    expect(judgedLine(line)).toBe(40)
    expect(held(line, WEEK_46)).toEqual([{ weekOf: '2026-11-08', workedHours: 46, overHours: 6 }])
    // A line at 38 is the contract's own, and is lower than the law's.
    expect(judgedLine(w2({ buyAfterHours: 38 }))).toBe(38)
  })

  it('a worker this firm does not pay as a wage, or work outside the US, is never held here', () => {
    expect(held(w2({ contractType: 'C2C' }), WEEK_46)).toEqual([])
    expect(held(w2({ weAreTheEmployer: false }), WEEK_46)).toEqual([])
    expect(held(w2({ where: { ...US, siteCountry: 'IN' } }), WEEK_46)).toEqual([])
    expect(judgedLine(w2({ where: { ...US, siteCountry: 'IN' } }))).toBeNull()
  })

  it('the held week leaves the days to pay, all 46 of its hours, and the other week stays', () => {
    const two = { ...WEEK_46, '2026-11-16': 8, '2026-11-17': 8 }
    const out = withoutHeldWeeks(two, held(w2(), two))
    expect(out.hoursHeld).toBe(46)
    expect(out.days).toEqual({ '2026-11-16': 8, '2026-11-17': 8 })
  })

  it('the row says whose week is held, its hours, why, and who releases it, each sentence under twenty-five words', () => {
    const said = heldSays('Omar Haddad', held(w2(), WEEK_46))!
    expect(said).toBe(
      "Omar Haddad's week of November 8, 2026, 46 hours, is held off this pay. " +
        'Nobody has recorded whether Omar Haddad is exempt from overtime. ' +
        'Whoever runs payroll records it on this row. The week is then paid once, with any overtime owed.'
    )
    for (const n of words(said)) expect(n).toBeLessThan(25)
    expect(heldSays('Omar Haddad', [])).toBeNull()
  })

  it('a week paid at straight time before "not exempt" was recorded says the $288 still owed (4,704 - 4,416), and to calculate first', () => {
    const said = owedSinceRecordedSays('Omar Haddad', [{ weekOf: '2026-11-08', premiumCents: 28_800 }], (c) => `$${(c / 100).toFixed(2)}`)!
    expect(said).toBe(
      "Omar Haddad's week of November 8, 2026 was paid at straight time before the answer on overtime was recorded. " +
        '$288.00 of overtime is still owed. Calculate, then pay it with this period.'
    )
    for (const n of words(said)) expect(n).toBeLessThan(25)
    expect(owedSinceRecordedSays('Omar Haddad', [{ weekOf: '2026-11-08', premiumCents: 0 }], String)).toBeNull()
  })

  it('a period whose straight time is all paid and whose overtime is still owed is not read as processed', () => {
    const days = [{ key: 'bc|p|ts|2026-11-13', hours: 9 }]
    const paid = new Map([['bc|p|ts|2026-11-13', 9]])
    expect(periodStatusFromRuns({ days, paid, workedOut: false })).toBe('PROCESSED')
    expect(periodStatusFromRuns({ days, paid, workedOut: false, premiumOwed: true })).toBe('PENDING')
    expect(periodStatusFromRuns({ days, paid, workedOut: true, premiumOwed: true })).toBe('CALCULATED')
  })

  it('the Payroll screen, the run and the pay file each hold the week, and the file judges it on the held line', () => {
    expect(src('src/app/api/payroll/route.ts')).toContain('heldForExemption({ line, days: filedDays')
    expect(src('src/app/api/payroll/run/route.ts')).toContain('heldForExemption({ line, days: filed')
    expect(src('src/app/api/payroll/export/route.ts')).toContain('const lineAt = judgedLine(payLine)')
  })
})

describe('the Payroll row records whether the person is exempt, through the one route that keeps it', () => {
  const screen = screenExemption({ payModel: 'FIXED_HOURLY', payRateCents: 9_600, paidOnSalaryBasis: false, payCurrency: 'USD' })
  const check = (body: ReturnType<typeof exemptBody>) => checkAssertion({
    status: body.status as ExemptStatus, basis: (body.basis ?? null) as ExemptionBasis | null, screen, note: body.note ?? null,
    assertedByCompanyId: 'co', employerCompanyId: 'co', assertedByCompanyName: 'Brightmoor Staffing', assertedAt: new Date('2026-11-14'), reviewBy: null,
  })

  it('"Not exempt" is one press and the route records it with no reason asked', () => {
    expect(exemptBody('p1', 'NONEXEMPT')).toEqual({ personId: 'p1', status: 'NONEXEMPT' })
    expect(check(exemptBody('p1', 'NONEXEMPT')).ok).toBe(true)
  })

  it('"Exempt" with every field the row draws filled in is not refused for a field the row did not draw', () => {
    for (const c of EXEMPTION_CHOICES) {
      const body = exemptBody('p1', 'EXEMPT', {
        basis: c.value,
        note: 'Designs and tests the client’s systems; paid hourly above the computer-employee floor.',
      })
      const v = check(body)
      expect(v.ok, `${c.value}: ${v.says}`).toBe(true)
    }
  })

  it('the row calls the exempt route and offers it only to a seat that runs payroll', () => {
    const page = src('src/app/dashboard/payroll/page.tsx')
    expect(page).toContain('/api/contracts/${row.buyContractId}/exempt')
    expect(page).toContain("hasPermission(permissions, 'payroll.run')")
    expect(page).toContain('aria-label="Which exemption"')
    expect(page).toContain('aria-label="Why, in a sentence"')
  })
})

describe('a period worked out stays worked out only while what is still to pay is what Calculate covered', () => {
  const period = { start: '2026-10-11', end: '2026-10-24' }
  const ask = { buyContractId: 'bc1', buyContractCandidateId: 'c1', start: '2026-10-11T00:00:00.000Z', end: '2026-10-24T00:00:00.000Z' }
  const week1 = [12, 13, 14, 15, 16].map((d) => ({ timesheetId: 'ts1', day: `2026-10-${d}`, hours: 8 }))
  const week2 = [19, 20, 21, 22, 23].map((d) => ({ timesheetId: 'ts2', day: `2026-10-${d}`, hours: 8 }))

  it('two weeks of 40 hours at $45 ($1,800 each) are told apart, because their days differ', () => {
    expect(payCovers(week1)).not.toBe(payCovers(week2))
  })

  it('a week accepted after the period was worked out and part paid sends the period back to Calculate', () => {
    const keys = workedOutKeys([{ contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period, covers: payCovers(week1) }] }])
    expect(isWorkedOut(keys, ask, payCovers(week1))).toBe(true)
    // Week one paid, week two accepted late: what is still to pay is week two.
    expect(isWorkedOut(keys, ask, payCovers(week2))).toBe(false)
    // Calculated again, it is worked out again.
    const again = workedOutKeys([
      { contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period, covers: payCovers(week1) }] },
      { contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period, covers: payCovers(week2) }] },
    ])
    expect(isWorkedOut(again, ask, payCovers(week2))).toBe(true)
  })

  it('a cut changed after Calculate, 40 hours accepted as 38, sends the period back too', () => {
    const keys = workedOutKeys([{ contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period, covers: payCovers(week1) }] }])
    const cut = week1.map((d, i) => (i === 4 ? { ...d, hours: 6 } : d))
    expect(isWorkedOut(keys, ask, payCovers(cut))).toBe(false)
  })

  it('a calculation written before it said what it covered no longer counts once what is still to pay is known: Calculate again', () => {
    // Found by hand, 2026-11-14: such a row stayed "Calculated" after a
    // late 40-hour week at $45 was accepted, and Process paid $1,800 unworked.
    const keys = workedOutKeys([{ contracts: [{ buyContractId: 'bc1', buyContractCandidateId: 'c1', payPeriod: period }] }])
    expect(isWorkedOut(keys, ask, payCovers(week2))).toBe(false)
    expect(isWorkedOut(keys, ask, payCovers(week1))).toBe(false)
    // Asked with nothing left to compare, it is still on the record.
    expect(isWorkedOut(keys, ask)).toBe(true)
  })

  it('the screen reads what is still to pay as the run does: each day less what was paid, each premium less the premium paid', () => {
    const days = [{ key: 'bc1|p1|ts1|2026-10-12', hours: 8 }, { key: 'bc1|p1|ts2|2026-10-19', hours: 8 }]
    const premiums = [{ key: 'bc1|p1|ts2|2026-10-23', hours: 6 }]
    const left = coversLeft(days, premiums, { paid: new Map([['bc1|p1|ts1|2026-10-12', 8]]), premiumHours: new Map() })
    expect(left).toEqual([
      { timesheetId: 'ts2', day: '2026-10-19', hours: 8, overtimeHours: 0 },
      { timesheetId: 'ts2', day: '2026-10-23', hours: 0, overtimeHours: 6 },
    ])
    // The run's own lines for the same days: one straight day, one premium-only day.
    expect(payCovers(left)).toBe(payCovers([
      { timesheetId: 'ts2', day: '2026-10-19', hours: 8 },
      { timesheetId: 'ts2', day: '2026-10-23', hours: 0, overtimeHours: 6 },
    ]))
  })

  it('a part-paid period whose new week nobody worked out offers no pay file', () => {
    const row: PayFileRow = {
      person: { name: 'Marisol Quintero' }, totalApprovedHours: 80, payRate: 4_500, grossPay: 360_000, payCurrency: 'USD', payStatus: 'PENDING',
      paidSoFar: { hours: 40, grossCents: 180_000 },
      toPay: { hours: 40, grossCents: 180_000, overtimeHours: 0, premiumCents: 0, rates: null, rateCents: 4_500 },
    }
    expect(payFileWaits([row])).toBe('Pay for Marisol Quintero is not worked out yet, so there is no pay file yet. Press Calculate first.')
    expect(payFileWaits([{ ...row, payStatus: 'CALCULATED' }])).toBeNull()
  })

  it('the run compares what it would pay with what the latest calculation covered, before anything is marked paid', () => {
    const run = src('src/app/api/payroll/run/route.ts')
    expect(run).toContain('const covers = payCovers(lines)')
    expect(run).toContain("}, covers === '' ? undefined : covers)")
    expect(run).toContain("orderBy: { at: 'asc' }")
  })
})

describe('a calendar month or every period never hands out a pay file on a company that pays by its own periods', () => {
  it('the month view says to pick a pay period in the pay file button’s place', () => {
    expect(MONTH_HAS_NO_PAY_FILE).toBe('A pay file comes from one of your pay periods, so no hour is paid twice. Pick a pay period above.')
    expect(src('src/app/api/payroll/route.ts')).toContain('const monthFile = !co.byPeriod && Boolean(monthAsked)')
    expect(src('src/app/api/payroll/route.ts')).toContain(': co.byPeriod ? MONTH_HAS_NO_PAY_FILE : PICK_A_MONTH_FOR_PAY_FILE')
  })

  it('the older export gives no file to any company, in any spelling of csv, and a company paying by periods reads the same sentence', () => {
    const route = src('src/app/api/payroll/export/route.ts')
    expect(route).toContain("const format = url.searchParams.get('format')?.toLowerCase() ?? null")
    expect(route).toContain("message: byPeriod ? MONTH_HAS_NO_PAY_FILE : EXPORT_IS_NOT_A_PAY_FILE")
    expect(route).not.toContain('toCsv(')
  })

  it('a month on such a company is judged on what the runs paid, never on the line’s own pay dates', () => {
    expect(src('src/app/api/payroll/route.ts')).toContain('const byLineDates = !companyHeld && !co.byPeriod')
  })

  it('the table export carries what was paid already beside each row', () => {
    const page = src('src/app/dashboard/payroll/page.tsx')
    expect(page).toContain("key: 'paidAlready'")
    expect(page).toContain("label: 'Paid already'")
  })
})

describe('a W-2 placement recorded on screen takes the company’s pay days', () => {
  const biweekly = (over: Partial<PayRhythm> = {}): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', ...over })

  it('a company paying every other week with no first day set refuses the W-2 line and names the Owner’s step', () => {
    const said = firstDayNeededSays({ payroll: true, chosen: biweekly({ payFirstPeriodStart: null }) })
    expect(said).toBe(
      "A W-2 line's pay days count from the Sunday your pay periods start on, and that Sunday is not set yet. " +
        'The Owner or an Admin sets it in Settings, under Cycles, then Payroll: "The Sunday your pay periods are counted from".'
    )
    for (const n of words(said!)) expect(n).toBeLessThan(25)
  })

  it('with the first day set, or with no payroll choice made, or on a line paid by invoice, nothing is refused', () => {
    expect(firstDayNeededSays({ payroll: true, chosen: biweekly({ payFirstPeriodStart: '2026-10-11' }) })).toBeNull()
    expect(firstDayNeededSays({ payroll: true, chosen: null })).toBeNull()
    expect(firstDayNeededSays({ payroll: false, chosen: biweekly({ payFirstPeriodStart: null }) })).toBeNull()
  })

  it('recording a placement writes its dates through the one door, so a company that chose its payroll gets its own pay days', () => {
    const route = src('src/app/api/contracts/route.ts')
    expect(route).toContain('await writeCyclesFor(tx, {')
    expect(route).toContain('if (firstDayNeeded) return errResponse(firstDayNeeded')
    expect(route).not.toContain('generateCycles(start, end, split.buy')
  })
})
