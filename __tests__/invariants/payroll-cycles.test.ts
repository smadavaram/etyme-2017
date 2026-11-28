import { describe, it, expect } from 'vitest'
import { writeCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { generatePayCycles } from '@/lib/cycle-generator'
import { DEFAULT_PAY_RHYTHM, type PayRhythm } from '@/lib/pay-dates'

/**
 * Payroll is the company's choice, and the recommendation is the default.
 *
 * The founder, 2026-10-07: "Give choice to businesses when they want to
 * configure payroll." The setting is `lib/payroll-settings`; these are the
 * sentences that say the cycle generator writes a payroll line's pay dates
 * from it — and that a company that never answered is paid exactly as the
 * pack always paid it, so no seeded date moves.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Row = { sellContractId?: string; buyContractId?: string; kind: string; dueOn: Date }

/** A stand-in for the database: records what is written, and answers the company read with `company`. */
function stubDb(company: Record<string, unknown>) {
  const written: Row[] = []
  return {
    written,
    client: {
      cycle: { createMany: async ({ data }: any) => { written.push(...data); return { count: data.length } } },
      sellContract: { findUnique: async () => ({ company }) },
    } as any,
  }
}

/** Their own W-2: the firm pays the person, so the buy line is payroll. */
const W2 = { id: 'buy-1', contractType: 'W2', vendorCompanyId: null }
/** Bought from a supplier: what is paid is the supplier's invoice, not payroll. */
const FROM_SUPPLIER = { id: 'buy-2', contractType: 'C2C', vendorCompanyId: 'supplier-1' }

/** A company row as somebody left it on the settings screen. */
function chose(r: Partial<PayRhythm>, extra: Record<string, unknown> = {}) {
  return { ...DEFAULT_PAY_RHYTHM, ...r, paySettingsSetAt: day('2026-10-07'), paySettingsSetById: 'person-1', ...extra }
}

async function write(
  company: Record<string, unknown>,
  start: string,
  end: string,
  opts: {
    packId?: string
    buy?: typeof W2 | typeof FROM_SUPPLIER
    holidays?: string[]
    pay?: any
    existing?: Map<string, Set<string>>
    onlyPeriodsAfter?: Date
  } = {}
) {
  const stub = stubDb(company)
  await writeCyclesFor(stub.client, {
    sell: { id: 'sell-1', startDate: day(start), endDate: day(end) },
    buy: opts.buy ?? W2,
    packId: opts.packId ?? 'US_IT',
    holidays: opts.holidays ?? [],
    existing: opts.existing,
    onlyPeriodsAfter: opts.onlyPeriodsAfter,
    ...(opts.pay ? { pay: opts.pay } : {}),
  })
  return stub.written
}

const of = (rows: Row[], kind: string) =>
  rows.filter((r) => r.kind === kind).map((r) => iso(r.dueOn)).sort()
const sellSide = (rows: Row[]) =>
  rows.filter((r) => r.sellContractId).map((r) => `${r.kind} ${iso(r.dueOn)}`).sort()
const buySide = (rows: Row[]) =>
  rows.filter((r) => r.buyContractId).map((r) => `${r.kind} ${iso(r.dueOn)}`).sort()

describe('payroll is the company’s choice, and the pack is the default', () => {
  it('a company with nothing set gets the pack’s dates: worked out the Wednesday and paid the Friday after each period’s Saturday', async () => {
    // Nothing on the row at all, and the row as the schema fills it with
    // nobody having answered: the columns' defaults are not an answer.
    const blank = await write({}, '2026-11-02', '2027-01-29')
    const defaults = await write(
      { ...DEFAULT_PAY_RHYTHM, paySettingsSetAt: null, paySettingsSetById: null },
      '2026-11-02',
      '2027-01-29'
    )
    expect(buySide(defaults)).toEqual(buySide(blank))
    expect(sellSide(defaults)).toEqual(sellSide(blank))

    const calc = of(blank, 'SALARY_CALCULATE')
    const pay = of(blank, 'SALARY_PAY')
    expect(pay.length).toBeGreaterThan(0)
    expect(calc.length).toBe(pay.length)
    for (const d of calc) expect(WEEKDAY[day(d).getUTCDay()]).toBe('Wed')
    for (const d of pay) expect(WEEKDAY[day(d).getUTCDay()]).toBe('Fri')
    // The pack's own fortnights, to the day: the Friday on or after the
    // start, then every fourteen days, worked out +5 and paid +7.
    expect(calc).toEqual(['2026-11-11', '2026-11-25', '2026-12-09', '2026-12-23', '2027-01-06', '2027-01-20', '2027-02-03'])
    expect(pay).toEqual(['2026-11-13', '2026-11-27', '2026-12-11', '2026-12-25', '2027-01-08', '2027-01-22', '2027-02-05'])
  })

  it('a company with nothing set on a monthly pack is still worked out on the 25th and paid at month end', async () => {
    const rows = await write({}, '2027-01-01', '2027-03-31', { packId: 'UK' })
    expect(of(rows, 'SALARY_CALCULATE')).toEqual(['2027-01-25', '2027-02-25', '2027-03-25'])
    // 31 January and 28 February 2027 are Sundays, so pay moves back to the Friday.
    expect(of(rows, 'SALARY_PAY')).toEqual(['2027-01-29', '2027-02-26', '2027-03-31'])
  })

  it('a company that pays weekly gets a calc and a pay date every week', async () => {
    const rows = await write(chose({ payPeriod: 'WEEKLY' }), '2026-11-02', '2026-11-27')
    // Weeks ending Saturday 7, 14, 21 and 28 November: the last kept
    // because the placement's last day is that week's Friday.
    expect(of(rows, 'SALARY_CALCULATE')).toEqual(['2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02'])
    expect(of(rows, 'SALARY_PAY')).toEqual(['2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04'])
  })

  it('a company that pays every other week gets its fortnights counted from the Sunday on or before the contract start', async () => {
    // Started Monday 2 November; the Sunday before is 1 November, so the
    // fortnights end on Saturday 14 and 28 November, 12 and 26 December —
    // the periods lib/periods pays and the payroll export reads.
    const rows = await write(chose({ payPeriod: 'BIWEEKLY' }), '2026-11-02', '2026-12-25')
    expect(of(rows, 'SALARY_CALCULATE')).toEqual(['2026-11-18', '2026-12-02', '2026-12-16', '2026-12-30'])
    expect(of(rows, 'SALARY_PAY')).toEqual(['2026-11-20', '2026-12-04', '2026-12-18', '2027-01-01'])
  })

  it('a contract starting on a Saturday has that day paid in the week that ends on it', () => {
    const rows = generatePayCycles(day('2026-11-07'), day('2026-11-20'), { ...DEFAULT_PAY_RHYTHM, payPeriod: 'WEEKLY' })
    expect(of(rows, 'SALARY_PAY')).toEqual(['2026-11-13', '2026-11-20', '2026-11-27'])
  })

  it('a company that pays twice a month gets pay dates on the 15th and month end, worked out three days before each', async () => {
    const rows = await write(
      chose({ payPeriod: 'SEMIMONTHLY', payDaysOfMonth: [15, 28], payCalcDaysBefore: 3 }),
      '2027-01-01',
      '2027-03-31'
    )
    // Three days before the 15th is the 12th; three before month end,
    // counted from the 28th the company picked, is the 25th.
    expect(of(rows, 'SALARY_CALCULATE')).toEqual([
      '2027-01-12', '2027-01-25', '2027-02-12', '2027-02-25', '2027-03-12', '2027-03-25',
    ])
    // A Sunday month end is paid on the Friday before: 31 Jan, 28 Feb.
    expect(of(rows, 'SALARY_PAY')).toEqual([
      '2027-01-15', '2027-01-29', '2027-02-15', '2027-02-26', '2027-03-15', '2027-03-31',
    ])
  })

  it('a company that pays once a month at month end is worked out on the 25th of every month, February in a leap year included', async () => {
    const rows = await write(chose({ payPeriod: 'MONTHLY', payDaysOfMonth: [28] }), '2028-01-01', '2028-04-30')
    // 25 March 2028 is a Saturday, so the calculation moves back to Friday 24.
    expect(of(rows, 'SALARY_CALCULATE')).toEqual(['2028-01-25', '2028-02-25', '2028-03-24', '2028-04-25'])
    // 29 February is the month end; 30 April is a Sunday, paid Friday 28.
    expect(of(rows, 'SALARY_PAY')).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-28'])
  })

  it('a company that pays on the Thursday after the period gets Thursday, shifted around its own days off', async () => {
    const thursday = { payPeriod: 'WEEKLY' as const, payCalcOffsetDays: 3, payDayOffsetDays: 5 }
    // Thanksgiving, Thursday 26 November, moves that week's pay back to the Wednesday.
    const usual = await write(chose(thursday), '2026-11-02', '2026-11-27', { holidays: ['2026-11-26'] })
    expect(of(usual, 'SALARY_PAY')).toEqual(['2026-11-12', '2026-11-19', '2026-11-25', '2026-12-03'])
    expect(of(usual, 'SALARY_CALCULATE')).toEqual(['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01'])

    // A company whose own week has Thursday and Friday off is paid the Wednesday before.
    const offThuFri = await write(chose(thursday, { daysOff: [4, 5] }), '2026-11-02', '2026-11-27')
    expect(of(offThuFri, 'SALARY_PAY')).toEqual(['2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02'])
  })

  it('the pack’s salary lines are the default and never win over a company’s choice', async () => {
    const weekly = chose({ payPeriod: 'WEEKLY' })
    const direct = generatePayCycles(day('2026-11-02'), day('2027-01-29'), { ...DEFAULT_PAY_RHYTHM, payPeriod: 'WEEKLY' })
    const expected = direct.map((c) => `${c.kind} ${iso(c.dueOn)}`).sort()
    // A fortnightly pack and a monthly pack alike: only the company's weeks.
    for (const packId of ['US_IT', 'UK']) {
      const rows = await write(weekly, '2026-11-02', '2027-01-29', { packId })
      const pay = buySide(rows).filter((r) => r.startsWith('SALARY_'))
      expect(pay).toEqual(expected)
    }
  })

  it('a company’s choice wins over the demo’s monthly pay, and a demo firm that chose nothing keeps the demo’s rhythm', async () => {
    const chosen = await write(chose({ payPeriod: 'WEEKLY' }), '2026-11-02', '2026-11-27', { pay: DEMO_MONTHLY_PAY })
    expect(of(chosen, 'SALARY_PAY')).toEqual(['2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04'])

    const demo = await write({}, '2026-11-01', '2026-12-31', { pay: DEMO_MONTHLY_PAY })
    // Month end + 9: 9 December (Wednesday) for November.
    expect(of(demo, 'SALARY_PAY')).toContain('2026-12-09')
  })

  it('a sub-vendor’s invoice cycles do not move when payroll settings change', async () => {
    const before = await write({}, '2026-11-02', '2027-03-31', { packId: 'UK', buy: FROM_SUPPLIER })
    const after = await write(chose({ payPeriod: 'WEEKLY' }), '2026-11-02', '2027-03-31', { packId: 'UK', buy: FROM_SUPPLIER })
    expect(of(before, 'VENDOR_BILL_GENERATE').length).toBeGreaterThan(0)
    expect(buySide(after)).toEqual(buySide(before))
    expect(after.some((r) => r.kind.startsWith('SALARY_'))).toBe(false)
  })

  it('hours and bill dates do not move when payroll settings change', async () => {
    const before = await write({}, '2026-11-02', '2027-01-29')
    const after = await write(chose({ payPeriod: 'SEMIMONTHLY', payDaysOfMonth: [15, 28] }), '2026-11-02', '2027-01-29')
    expect(sellSide(after)).toEqual(sellSide(before))
    expect(sellSide(after).length).toBeGreaterThan(0)
  })

  it('an extension under a company’s payroll writes only the weeks after the old end, and running it twice writes nothing more', async () => {
    const weekly = chose({ payPeriod: 'WEEKLY' })
    const first = await write(weekly, '2026-11-02', '2026-11-27')
    const existing = new Map<string, Set<string>>()
    for (const r of first) {
      const set = existing.get(r.kind) ?? new Set<string>()
      set.add(iso(r.dueOn))
      existing.set(r.kind, set)
    }
    const added = await write(weekly, '2026-11-02', '2026-12-11', { existing, onlyPeriodsAfter: day('2026-11-27') })
    expect(of(added, 'SALARY_PAY')).toEqual(['2026-12-11', '2026-12-18'])
    expect(of(added, 'SALARY_CALCULATE')).toEqual(['2026-12-09', '2026-12-16'])

    for (const r of added) existing.get(r.kind)?.add(iso(r.dueOn)) ?? existing.set(r.kind, new Set([iso(r.dueOn)]))
    const again = await write(weekly, '2026-11-02', '2026-12-11', { existing, onlyPeriodsAfter: day('2026-11-27') })
    expect(again.filter((r) => r.kind.startsWith('SALARY_'))).toEqual([])
  })
})
