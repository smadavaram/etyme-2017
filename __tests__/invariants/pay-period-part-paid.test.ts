import { describe, it, expect } from 'vitest'
import { writeCyclesFor, lineKeepsItsWeeks } from '@/lib/contract-cycles'
import { generatePayCycles } from '@/lib/cycle-generator'
import { DEFAULT_PAY_RHYTHM, payPeriodHolding, type PayRhythm } from '@/lib/pay-dates'
import { payLeftInPeriod, partPaidSays, owedOnRow } from '@/lib/money/period-pay-left'
import { payFileCsv, periodHolding, periodsAround, pickerPeriods, unpaidPeriodWords, type PayFileRow } from '@/lib/money/pay-periods'
import { paidKey, type PaidBook } from '@/lib/payroll-paid'
import { amount } from '@/lib/money-display'

/**
 * Three faults a reader found by hand in the company's own pay periods
 * (2026-11-14), for the founder's firm: "W2 first, outside payroll
 * provider, biweekly". He has not said which Sunday starts the first
 * period, so every sentence here is held for all three he may choose.
 *
 *   1. A period part paid showed, filed and counted the whole period.
 *   2. A W-2 line's own pay days were counted from its own start, not
 *      from the company's first period.
 *   3. The picker went back about twelve weeks, so older unpaid hours
 *      sat in a period nobody could open.
 */

const SUNDAYS = ['2026-12-06', '2026-12-13', '2026-12-27'] as const
const HOLIDAYS = ['2026-12-25', '2027-01-01']
const DAY = 86_400_000
const plus = (k: string, n: number) => new Date(Date.parse(`${k}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const biweekly = (first: string | null): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: [28], payFirstPeriodStart: first })

function bookOf(paid: Array<{ key: string; hours: number; rateCents: number; overtimeHours?: number; premiumCents?: number }>): PaidBook {
  const b: PaidBook = { paid: new Map(), premiumHours: new Map(), entries: new Map(), unrecorded: new Map() }
  for (const l of paid) {
    b.paid.set(l.key, (b.paid.get(l.key) ?? 0) + l.hours)
    if (l.overtimeHours) b.premiumHours.set(l.key, (b.premiumHours.get(l.key) ?? 0) + l.overtimeHours)
    b.entries.set(l.key, {
      hours: l.hours, straightCents: l.hours * l.rateCents, premiumHours: l.overtimeHours ?? 0,
      premiumCents: l.premiumCents ?? 0, premiumRecorded: true,
    })
  }
  return b
}

/** Five eight-hour weekdays from a Sunday, priced at one rate, keyed the way the paid book keys them. */
function weekDays(sheet: string, sunday: string, rateCents: number) {
  return [1, 2, 3, 4, 5].map((i) => ({ key: paidKey('buy-1', 'p-1', sheet, plus(sunday, i)), hours: 8, rateCents }))
}

for (const S of SUNDAYS) {
  describe(`with the first pay period starting on ${S}`, () => {
    const rhythm = biweekly(S)
    const p = periodHolding(S, rhythm, { holidays: HOLIDAYS })!
    // Week one paid at $20 an hour, $800; week two accepted late at $27.50, $1,100.
    const one = weekDays('ts-1', S, 2_000)
    const two = weekDays('ts-2', plus(S, 7), 2_750)
    const book = bookOf(one)
    const left = payLeftInPeriod([...one, ...two], [], book)

    it('a period with its first week paid says $800 was paid already and $1,100 is still to pay', () => {
      expect(left.paid).toEqual({ hours: 40, grossCents: 80_000 })
      expect(left.toPay.hours).toBe(40)
      expect(left.toPay.grossCents).toBe(110_000)
      expect(left.part).toBe(true)
      expect(partPaidSays(left, (c) => amount(c, 'USD'))).toBe('Paid already: $800.00 for 40 hours. Still to pay: $1,100.00 for 40 hours.')
    })

    it('the pay file for a period part paid carries only what is still to pay, with what was paid already beside it', () => {
      const row: PayFileRow = {
        person: { name: 'Ines Varga' }, totalApprovedHours: 80, payRate: 2_750,
        rates: [{ rateCents: 2_000, hours: 40 }, { rateCents: 2_750, hours: 40 }],
        overtimeHours: 0, premiumCents: 0, grossPay: 190_000, payCurrency: 'USD', payStatus: 'CALCULATED',
        paidSoFar: left.paid, toPay: left.toPay,
      }
      const [, line] = payFileCsv([row], p).trim().split('\n')
      expect(line).toBe(`Ines Varga,40,27.50,0,0.00,1100.00,800.00,USD,${p.start},${p.end},${p.payOn},Part paid`)
    })

    it('a period paid in full is on the pay file with nothing left to pay, so a provider paying from it pays nobody twice', () => {
      const all = payLeftInPeriod([...one, ...two], [], bookOf([...one, ...two]))
      expect(all.part).toBe(false)
      const row: PayFileRow = {
        person: { name: 'Ines Varga' }, totalApprovedHours: 80, payRate: 2_750, grossPay: 190_000,
        payCurrency: 'USD', payStatus: 'PROCESSED', paidSoFar: all.paid, toPay: all.toPay,
      }
      const [, line] = payFileCsv([row], p).trim().split('\n')
      expect(line).toBe(`Ines Varga,0,27.50,0,0.00,0.00,1900.00,USD,${p.start},${p.end},${p.payOn},Paid`)
    })

    it('cash flow counts only what is still to pay on a row, never the week paid already', () => {
      expect(owedOnRow({ grossPay: 190_000, toPay: left.toPay })).toBe(110_000)
      expect(owedOnRow({ grossPay: 190_000 })).toBe(190_000)
    })

    it('a person starting in the second week of a period is paid on the day the Payroll page pays that period', async () => {
      // Her own Sunday is a week after the company's, so counting from it
      // put her first pay day a week late.
      const start = plus(S, 8)
      const rows: any[] = []
      await writeCyclesFor(
        {
          cycle: { createMany: async ({ data }: any) => { rows.push(...data); return { count: data.length } }, findMany: async () => [] },
          sellContract: { findUnique: async () => ({ company: { ...rhythm, paySettingsSetAt: day('2026-11-14'), paySettingsSetById: 'owner' } }) },
        } as any,
        { sell: { id: 'sell-1', startDate: day(start), endDate: day(plus(S, 83)) }, buy: { id: 'buy-1', contractType: 'W2', vendorCompanyId: null }, packId: 'US_IT', holidays: HOLIDAYS },
      )
      const pay = rows.filter((r) => r.kind === 'SALARY_PAY').sort((a, b) => +a.dueOn - +b.dueOn)
      expect(pay.length).toBeGreaterThan(3)
      expect(iso(pay[0].dueOn)).toBe(p.payOn)
      expect(iso(pay[0].periodStart)).toBe(start)
      expect(iso(pay[0].periodEnd)).toBe(p.end)
      for (const r of pay) {
        const own = payPeriodHolding(iso(r.periodStart), rhythm, { holidays: HOLIDAYS })!
        expect(iso(r.dueOn), iso(r.periodStart)).toBe(own.payOn)
      }
    })

    it('a line whose pay days were written before the first day was set keeps its weeks on an extension', () => {
      const start = day(plus(S, 8))
      const end = day(plus(S, 83))
      const own = generatePayCycles(start, end, biweekly(null)).filter((c) => c.kind === 'SALARY_PAY')
      const company = generatePayCycles(start, end, rhythm).filter((c) => c.kind === 'SALARY_PAY')
      expect(lineKeepsItsWeeks(own, start, end, rhythm)).toBe(true)
      expect(lineKeepsItsWeeks(company, start, end, rhythm)).toBe(false)
      expect(lineKeepsItsWeeks([], start, end, rhythm)).toBe(false)
      // Asked to keep them, the generator writes the line's own weeks.
      expect(generatePayCycles(start, end, rhythm, [], new Map(), { countWeeksFrom: 'LINE' }).map((c) => iso(c.dueOn)))
        .toEqual(generatePayCycles(start, end, biweekly(null)).map((c) => iso(c.dueOn)))
    })

    it('the picker offers every earlier period that still holds accepted hours nobody paid, however far back', () => {
      const today = plus(S, 200)
      const around = periodsAround(today, rhythm, { holidays: HOLIDAYS })!
      const oldest = around[around.length - 1]
      const far = plus(S, 3) // the Wednesday of the first period, far behind today
      expect(far < oldest.start).toBe(true)
      const list = pickerPeriods(around, [far], rhythm, { holidays: HOLIDAYS })
      expect(list.slice(0, around.length).map((x) => x.start)).toEqual(around.map((x) => x.start))
      const extra = list[list.length - 1]
      expect(extra).toMatchObject({ start: S, end: plus(S, 13), payOn: p.payOn, unpaid: true })
      expect(unpaidPeriodWords(extra)).toMatch(/ · accepted hours not paid$/)
    })
  })
}

describe('what is still to pay in a period, worked the way the run works it', () => {
  it('a premium paid already on a day is not counted again, and the rest of it is', () => {
    const key = paidKey('buy-1', 'p-1', 'ts-1', '2026-12-11')
    const left = payLeftInPeriod(
      [{ key, hours: 10, rateCents: 2_000 }],
      [{ key, hours: 2, premiumCents: 2_000 }],
      bookOf([{ key, hours: 10, rateCents: 2_000, overtimeHours: 1, premiumCents: 1_000 }]),
    )
    expect(left.toPay).toMatchObject({ hours: 0, overtimeHours: 1, premiumCents: 1_000, grossCents: 1_000 })
    expect(left.paid).toEqual({ hours: 10, grossCents: 21_000 })
  })

  it('a period nobody paid has nothing paid already and its whole gross still to pay', () => {
    const days = weekDays('ts-1', '2026-12-06', 4_500)
    const left = payLeftInPeriod(days, [], bookOf([]))
    expect(left.paid).toBeNull()
    expect(left.part).toBe(false)
    expect(left.toPay).toMatchObject({ hours: 40, grossCents: 180_000, rateCents: 4_500, rates: null })
    expect(partPaidSays(left, (c) => amount(c, 'USD'))).toBeNull()
  })
})
