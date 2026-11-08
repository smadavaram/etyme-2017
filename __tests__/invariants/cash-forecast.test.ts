import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cashForecast, carryLine, forecastWindow, FORECAST_DAYS,
  type ForecastInputs, type RunningLine, type Expected,
} from '@/lib/money/cash-forecast'
import { cashFlow, slotsFor, type CashInputs } from '@/lib/money/cash-flow'

/**
 * Cash flow has a forecast, by week or month, for the next 90 days (the
 * founder, 2026-11-08). These are the sentences for the Forecast half of
 * the Cash flow tab.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const TODAY = new Date('2026-11-18T12:00:00Z') // a Wednesday; this week began Sunday Nov 15
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const ymd = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)

function seller(over: Partial<ForecastInputs> = {}): ForecastInputs {
  return {
    side: 'SELLER',
    billsDue: [], toBill: [], running: [], receiptsDue: [], subVendors: [],
    payroll: { pending: [], lines: [] },
    ...over,
  }
}

/** Helena Marsh's line: $100 an hour, 40 hours, billed every Monday, net 30 from the day it is sent. */
function line(over: Partial<RunningLine> = {}): RunningLine {
  return {
    name: 'Helena Marsh',
    currency: 'USD',
    rateMinor: 10_000,
    rates: [],
    hoursPerWeek: 40,
    startDate: d('2026-09-01'),
    endDate: null,
    daysOff: [0, 6],
    from: null,
    cycleDates: [d('2026-11-23'), d('2026-11-30'), d('2026-12-07')],
    terms: { anchor: 'INVOICE_DATE', days: 30 },
    ...over,
  }
}

describe('the forecast’s window and its rows', () => {
  it('the forecast reads the next 90 days from today, today among them', () => {
    const w = forecastWindow(TODAY)
    expect(ymd(w.start)).toBe('2026-11-18')
    expect((w.end.getTime() - w.start.getTime()) / 86_400_000 + 1).toBe(FORECAST_DAYS)
    expect(FORECAST_DAYS).toBe(90)
  })

  it('a forecast week runs Sunday to Saturday, the first clipped to today', () => {
    const slots = slotsFor(forecastWindow(TODAY), 'week')
    expect(slots[0].key).toBe('2026-11-15')
    expect(ymd(slots[0].start)).toBe('2026-11-18')
    expect(ymd(slots[0].end)).toBe('2026-11-21')
    expect(slots[1].key).toBe('2026-11-22')
  })

  it('by month, the 90 days are the months they touch, the first and last clipped', () => {
    const slots = slotsFor(forecastWindow(TODAY), 'month')
    expect(slots.map((s) => s.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(ymd(slots[3].end)).toBe('2027-02-15')
  })
})

describe('what is expected in', () => {
  it('a bill sent on net 30 is expected on the thirtieth day, in its own currency', () => {
    // A bill sent Nov 23 on net 30 from the day it is sent: due Dec 23, by the agreement's own arithmetic.
    const c = carryLine(line({ currency: 'INR', cycleDates: [d('2026-11-23')] }), TODAY)
    expect(c.expected).toHaveLength(1)
    expect(ymd(c.expected[0].at)).toBe('2026-12-23')
    expect(c.expected[0].currency).toBe('INR')

    const f = cashForecast(seller({ billsDue: [{ currency: 'INR', at: d('2026-12-23'), minor: 400_000 }] }), 'week', TODAY)
    expect(f.currencies.map((x) => x.currency)).toEqual(['INR'])
    expect(f.currencies[0].rows.find((r) => r.key === '2026-12-20')!.figures.billsDue).toBe(400_000)
  })

  it('a running line is expected at its rate and its weekly hours on the generator’s invoice dates, straight time, never overtime', () => {
    // The Nov 23 bill carries Mon Nov 16 to Fri Nov 20: five days of eight hours at $100.
    const c = carryLine(line(), TODAY)
    expect(c.expected.map((e) => e.minor)).toEqual([400_000, 400_000, 400_000])
    expect(c.expected.map((e) => ymd(e.at))).toEqual(['2026-12-23', '2026-12-30', '2027-01-06'])
    // A fifty-hour job is fifty hours at the line's rate, never forty plus ten at time and a half.
    const long = carryLine(line({ hoursPerWeek: 50, cycleDates: [d('2026-11-23')] }), TODAY)
    expect(long.expected[0].minor).toBe(50 * 10_000)
  })

  it('a job that says no hours a week is read as full time, as every money page reads it', () => {
    const c = carryLine(line({ hoursPerWeek: null, cycleDates: [d('2026-11-23')] }), TODAY)
    expect(c.expected[0].minor).toBe(40 * 10_000)
  })

  it('an approved raise is used from its own day, and the rate before it until then', () => {
    const c = carryLine(line({
      cycleDates: [d('2026-11-23')],
      rates: [
        { id: 'r1', rateCents: 12_000, fromDate: d('2026-11-19'), toDate: null, approvalState: 'APPROVED' },
        { id: 'r2', rateCents: 99_000, fromDate: d('2026-11-16'), toDate: null, approvalState: 'PROPOSED' },
      ],
    }), TODAY)
    // Mon to Wed at $100, Thu and Fri at $120; the proposed rate bills nothing.
    expect(c.expected[0].minor).toBe(3 * 8 * 10_000 + 2 * 8 * 12_000)
  })

  it('the company’s days off are not expected; a firm that works Saturdays is expected on Saturday', () => {
    const dubai = carryLine(line({ daysOff: [5], cycleDates: [d('2026-11-23')] }), TODAY)
    // Six working days a week share the forty hours: Sun Nov 15 to Sun Nov 22, Friday off.
    const days = 7 // Nov 15..22 is eight days, one of them a Friday
    expect(dubai.expected[0].minor).toBe(Math.round(days * (40 / 6) * 10_000))
  })

  it('a line’s last day is the last day carried; nothing runs past it', () => {
    const c = carryLine(line({ endDate: d('2026-11-25') }), TODAY)
    // Nov 23 carries a full week; Nov 30 carries Mon Nov 23 to Wed Nov 25; nothing after.
    expect(c.expected.map((e) => e.minor)).toEqual([400_000, 3 * 8 * 10_000])
  })

  it('weeks before this one that nobody signed are not forecast', () => {
    // The last signed week ended in October; the forecast still starts on this week's Sunday.
    const c = carryLine(line({ from: d('2026-10-04'), cycleDates: [d('2026-11-23')] }), TODAY)
    expect(c.expected[0].minor).toBe(400_000)
  })

  it('a week already signed is never forecast again from its line', () => {
    // Signed through Saturday Nov 21: the line starts again on Sunday Nov 22, so the Nov 23 bill carries nothing new.
    const c = carryLine(line({ from: d('2026-11-22') }), TODAY)
    expect(c.expected.map((e) => ymd(e.at))).toEqual(['2026-12-30', '2027-01-06'])
  })

  it('a line with no rate, a currency its agreement does not bill in, or no dates written is not forecast, and is named', () => {
    expect(carryLine(line({ rateMinor: 0 }), TODAY)).toEqual({ expected: [], says: 'Helena Marsh’s line has no rate, so it is not forecast.' })
    expect(carryLine(line({ refused: 'Helena Marsh’s rate is in USD and the agreement bills in INR, so the line is not forecast.' }), TODAY).expected).toEqual([])
    expect(carryLine(line({ cycleDates: [] }), TODAY).says).toBe('Helena Marsh’s line has no dates written after today, so it is not forecast.')
    const f = cashForecast(seller({ running: [line({ rateMinor: null })] }), 'week', TODAY)
    expect(f.says).toContain('Helena Marsh’s line has no rate, so it is not forecast.')
    expect(f.currencies).toEqual([])
  })

  it('a line paid a share rather than an hourly rate is not forecast, and says so', () => {
    const f = cashForecast(seller({
      payroll: { pending: [], lines: [line({ name: 'Ravi Kalathil', refused: 'Ravi Kalathil is paid a share, not an hourly rate, so the line is not forecast.' })] },
    }), 'week', TODAY)
    expect(f.says).toContain('Ravi Kalathil is paid a share, not an hourly rate, so the line is not forecast.')
  })

  it('a bill already past its due day is not put on a day ahead, and is said', () => {
    const f = cashForecast(seller({ billsDue: [{ currency: 'USD', at: d('2026-11-01'), minor: 520_000 }] }), 'week', TODAY)
    expect(f.currencies).toEqual([])
    expect(f.says.join(' ')).toContain('1 bill is already past due')
  })
})

describe('what is expected out', () => {
  it('an invoice receipt still owed is expected on its due day', () => {
    const f = cashForecast(seller({ receiptsDue: [{ currency: 'USD', at: d('2026-12-02'), minor: 448_000 }] }), 'week', TODAY)
    const row = f.currencies[0].rows.find((r) => r.key === '2026-11-29')!
    expect(row.figures.receiptsDue).toBe(448_000)
    expect(row.expectedOut).toBe(448_000)
  })

  it('a sub-vendor’s invoice is expected at its line’s rate and hours on its receipt dates, due on the line’s terms', () => {
    const sub = line({ name: 'Priya Raman', rateMinor: 8_000, cycleDates: [d('2026-11-23')], terms: { anchor: 'INVOICE_DATE', days: 15 } })
    const f = cashForecast(seller({ subVendors: [sub] }), 'week', TODAY)
    const row = f.currencies[0].rows.find((r) => r.key === '2026-12-06')!
    expect(row.figures.subVendors).toBe(40 * 8_000)
  })

  it('payroll’s first pay day is the Payroll page’s own figure, and the line is carried only after it', () => {
    const pending: Expected = { currency: 'USD', at: d('2026-11-27'), minor: 336_000 }
    const pay = line({
      rateMinor: 4_500,
      // The page shows the period through Saturday Nov 21, paid Friday Nov 27.
      from: d('2026-11-22'),
      datesAfter: d('2026-11-27'),
      cycleDates: [d('2026-11-27'), d('2026-12-11')],
      terms: null,
    })
    const f = cashForecast(seller({ payroll: { pending: [pending], lines: [pay] } }), 'week', TODAY)
    const usd = f.currencies[0]
    expect(usd.rows.find((r) => r.key === '2026-11-22')!.figures.payroll).toBe(336_000)
    // Dec 11 carries Nov 22 to Dec 10: fourteen working days at eight hours and $45.
    expect(usd.rows.find((r) => r.key === '2026-12-06')!.figures.payroll).toBe(14 * 8 * 4_500)
  })
})

describe('the forecast as a whole', () => {
  it('expected in less expected out is the net, per period', () => {
    const f = cashForecast(seller({
      billsDue: [{ currency: 'USD', at: d('2026-12-01'), minor: 500_000 }],
      receiptsDue: [{ currency: 'USD', at: d('2026-12-02'), minor: 300_000 }],
    }), 'week', TODAY)
    const row = f.currencies[0].rows.find((r) => r.key === '2026-11-29')!
    expect(row.expectedIn).toBe(500_000)
    expect(row.expectedOut).toBe(300_000)
    expect(row.net).toBe(200_000)
    expect(f.currencies[0].totals.net).toBe(200_000)
  })

  it('rupees and dollars are never added: each currency is its own forecast', () => {
    const f = cashForecast(seller({
      billsDue: [
        { currency: 'USD', at: d('2026-12-01'), minor: 500_000 },
        { currency: 'INR', at: d('2026-12-01'), minor: 9_000_000 },
      ],
    }), 'month', TODAY)
    expect(f.currencies.map((c) => [c.currency, c.totals.expectedIn])).toEqual([['INR', 9_000_000], ['USD', 500_000]])
  })

  it('an amount nobody could price blanks its column and the net for that period, never a nought', () => {
    const f = cashForecast(seller({
      billsDue: [{ currency: 'USD', at: d('2026-12-01'), minor: 500_000 }],
      toBill: [{ currency: 'USD', at: d('2026-12-02'), minor: null }],
    }), 'week', TODAY)
    const row = f.currencies[0].rows.find((r) => r.key === '2026-11-29')!
    expect(row.figures.toBill).toBeNull()
    expect(row.expectedIn).toBeNull()
    expect(row.net).toBeNull()
    expect(f.currencies[0].totals.net).toBeNull()
  })

  it('a seat without payroll gets no payroll column and no net, with the reason', () => {
    const f = cashForecast(seller({ payroll: null, billsDue: [{ currency: 'USD', at: d('2026-12-01'), minor: 500_000 }] }), 'week', TODAY)
    expect(f.figures).not.toContain('payroll')
    expect(f.currencies[0].totals.net).toBeNull()
    expect(f.says.join(' ')).toContain('your role does not read payroll')
  })

  it('a client’s forecast shows what it will owe and no margin', () => {
    const f = cashForecast({
      side: 'CLIENT',
      billsDue: [{ currency: 'USD', at: d('2026-12-01'), minor: 999_999 }],
      toBill: [], running: [line()],
      receiptsDue: [{ currency: 'USD', at: d('2026-12-02'), minor: 300_000 }],
      subVendors: [line({ name: 'Omar Haddad', cycleDates: [d('2026-11-23')] })],
      payroll: { pending: [], lines: [] },
    }, 'week', TODAY)
    expect(f.figures).toEqual(['receiptsDue', 'subVendors'])
    const usd = f.currencies[0]
    expect(usd.totals.expectedIn).toBeNull()
    expect(usd.totals.expectedOut).toBe(300_000 + 400_000)
    expect(JSON.stringify(f)).not.toMatch(/margin|billsDue|"running"/i)
  })

  it('the forecast says its assumptions once, in plain words', () => {
    const f = cashForecast(seller(), 'week', TODAY)
    expect(f.assumptions).toEqual(expect.arrayContaining([
      'Each running line works the hours a week its job says, or 40 where the job says none.',
      'No overtime: every expected hour is at the line’s own rate.',
      'Every bill and invoice receipt is paid on the day it is due.',
      'Nothing new starts, and each line runs to its own last day.',
    ]))
    expect(new Set(f.assumptions).size).toBe(f.assumptions.length)
  })

  it('the forecast never changes the actuals’ totals', () => {
    const actualsIn: CashInputs = {
      side: 'SELLER',
      billed: [{ currency: 'USD', at: d('2026-11-03'), minor: 520_000 }],
      received: [{ currency: 'USD', at: d('2026-11-10'), minor: 100_000 }],
      receiptsDue: [{ currency: 'USD', at: d('2026-11-25'), minor: 300_000 }],
      receiptsPaid: [], payrollDue: [], payrollPaid: [], owedToUs: [], weOwe: [],
    }
    const before = JSON.stringify(cashFlow(actualsIn, 'month', 'week', TODAY))
    const forecast = cashForecast(seller({
      receiptsDue: actualsIn.receiptsDue,
      running: [line()],
      billsDue: [{ currency: 'USD', at: d('2026-11-30'), minor: 420_000 }],
    }), 'week', TODAY)
    expect(forecast.currencies.length).toBe(1)
    expect(JSON.stringify(cashFlow(actualsIn, 'month', 'week', TODAY))).toBe(before)
    // The route returns the forecast beside the actuals, never spread into them.
    const route = read('src/app/api/ap/cash-flow.ts')
    expect(route).toContain('...actuals, forecast }')
    expect(route.indexOf('const actuals = cashFlow(')).toBeLessThan(route.indexOf('const forecast = cashForecast('))
  })
})

describe('the forecast is read through the money pages’ own readers', () => {
  const src = read('src/app/api/ap/cash-forecast.ts')

  it('a week signed and not billed is priced by the Bills page’s generator, never re-priced', () => {
    expect(src).toContain('generateBill(')
    expect(src).toContain('{ dryRun: true }')
    expect(src).toContain('billingDateOf(p)')
    expect(src).toContain('periodOfWeek(w, terms)')
  })

  it('a bill’s due date is the agreement’s, through the one door every bill is dated by', () => {
    expect(src).toContain('billDue({')
    expect(src).toContain('dueIfSentOn(')
    expect(src).toContain("moneyTermsFor('BUY'")
  })

  it('a running line carries the dates the cycle generator already wrote, never dates of its own', () => {
    expect(src).toContain("kind: 'INVOICE_GENERATE'")
    expect(src).toContain("'VENDOR_BILL_GENERATE', 'SALARY_PAY'")
    expect(src).toContain('cycleDates:')
  })

  it('a client reads only the lines billed to it, at the rate it pays, never a rung below', () => {
    expect(src).toContain('a.client ? { clientCompanyId: companyId } : { companyId }')
    expect(src).toContain('if (a.client) return input')
  })
})

describe('the Forecast half on the Cash flow tab', () => {
  const page = read('src/app/dashboard/reports/page.tsx')

  it('the Forecast is drawn under the actuals, as a table or a feed, one per currency, with its assumptions said once', () => {
    expect(page).toContain('<ForecastHalf forecast={data.forecast}')
    expect(page).toContain('name={`reports-cash-forecast-${cur}`}')
    expect(page).toContain('<ListSurface<ForecastRow>')
    expect(page).toContain('What this assumes')
    expect(page).toContain('It is never added to the figures above.')
  })

  it('a client’s forecast draws no expected-in column and no net', () => {
    expect(page).toContain("...(client ? [] : [{\n      key: 'in'")
    expect(page).toContain("...(client ? [] : [{\n      key: 'net'")
  })
})
