import { describe, it, expect } from 'vitest'
import { writeCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { usFederalHolidays } from '@/lib/holidays'
import { shiftToWorkingDay } from '@/lib/cycle-shift'
import { paidOnDay } from '@/lib/money/pay-day-period'
import { hoursInMonth } from '@/lib/periods'
import { workerPaidAs, ownCompanyBillsSays } from '@/lib/money/paid-through'

/**
 * Three things two testers found on a worker's own page, 2026-09-30.
 *
 * 1. August's pay read "paid on Sat, Sep 5" and a last day of August
 *    "paid Mon, Sep 7" — Labor Day. The pay days themselves were right
 *    (9 September); the page read the day the payroll run was pressed as
 *    the day the money arrived.
 * 2. "Hours this month" counted the weeks that started in the month, so
 *    a week from 31 August lost September its first four days.
 * 3. A nurse paid through her own company was told Halcyon owed her
 *    wages. Her company bills Halcyon; nobody owes her a wage.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const at = (s: string) => new Date(s)

function federal(from: number, to: number): string[] {
  const out: string[] = []
  for (let y = from; y <= to; y++) out.push(...usFederalHolidays(y).map((h) => h.date))
  return out
}

async function demoPayDays(start: Date, end: Date, holidays: string[]): Promise<Date[]> {
  const written: { kind: string; dueOn: Date }[] = []
  await writeCyclesFor(
    {
      cycle: { createMany: async ({ data }: any) => { written.push(...data); return { count: data.length } } },
      sellContract: { findUnique: async () => ({ company: {} }) },
    } as any,
    {
      sell: { id: 's', startDate: start, endDate: end },
      buy: { id: 'b', contractType: 'W2', vendorCompanyId: null },
      packId: 'US_IT',
      holidays,
      pay: DEMO_MONTHLY_PAY,
    }
  )
  return written.filter((r) => r.kind === 'SALARY_PAY').map((r) => r.dueOn)
}

describe('a pay day that falls on a weekend or a holiday moves to the working day before', () => {
  it('a pay day on a Saturday is paid on the Friday before', () => {
    // 5 September 2026 is a Saturday.
    expect(iso(shiftToWorkingDay(utc(2026, 8, 5), new Set(), 'BEFORE'))).toBe('2026-09-04')
  })

  it('a pay day on Labor Day is paid on the Friday before it', () => {
    // 7 September 2026 is Labor Day, a Monday.
    const holidays = new Set(federal(2026, 2026))
    expect(holidays.has('2026-09-07')).toBe(true)
    expect(iso(shiftToWorkingDay(utc(2026, 8, 7), holidays, 'BEFORE'))).toBe('2026-09-04')
  })

  it('no demo pay day from 2024 to 2035 falls on a Saturday, a Sunday or a federal holiday', async () => {
    const holidays = federal(2023, 2037)
    const off = new Set(holidays)
    for (let y = 2024; y <= 2035; y++) {
      const days = await demoPayDays(utc(y, 0, 1), utc(y, 11, 31), holidays)
      expect(days.length).toBe(12)
      for (const d of days) {
        expect([0, 6], `${iso(d)} is a weekend`).not.toContain(d.getUTCDay())
        expect(off.has(iso(d)), `${iso(d)} is a federal holiday`).toBe(false)
      }
    }
  })

  it('August 2026’s demo pay day is Wednesday 9 September, not the Saturday before', async () => {
    const days = await demoPayDays(utc(2026, 5, 1), utc(2026, 8, 30), federal(2026, 2026))
    expect(days.map(iso)).toContain('2026-09-09')
    expect(days.map(iso)).not.toContain('2026-09-05')
  })
})

describe('a week paid by a run is paid on the pay day the run settled, not the day it was pressed', () => {
  const augustPayDay = { dueOn: utc(2026, 8, 9), completedAt: at('2026-09-05T17:00:00.000Z') }

  it('a run pressed on Saturday 5 September pays on the pay day it settled, Wednesday 9 September', () => {
    expect(paidOnDay(at('2026-09-05T17:00:00.000Z'), [augustPayDay])).toBe('2026-09-09')
  })

  it('a run pressed on Labor Day for August pays on the pay day, not on the holiday', () => {
    const payDay = { dueOn: utc(2026, 8, 9), completedAt: at('2026-09-07T18:00:00.000Z') }
    expect(paidOnDay(at('2026-09-07T18:00:00.000Z'), [payDay])).toBe('2026-09-09')
  })

  it('a run pressed after the pay day paid late, on the day it ran, and never claims the earlier date', () => {
    const payDay = { dueOn: utc(2026, 8, 9), completedAt: at('2026-09-14T15:00:00.000Z') }
    expect(paidOnDay(at('2026-09-14T15:00:00.000Z'), [payDay])).toBe('2026-09-14')
  })

  it('a pay day settled by another run is not this run’s pay day', () => {
    const july = { dueOn: utc(2026, 7, 7), completedAt: at('2026-08-05T17:00:00.000Z') }
    expect(paidOnDay(at('2026-09-05T17:00:00.000Z'), [july, augustPayDay])).toBe('2026-09-09')
    expect(paidOnDay(at('2026-08-05T17:00:00.000Z'), [july, augustPayDay])).toBe('2026-08-07')
  })

  it('an off-cycle payment that settled no pay day was paid the day it was made', () => {
    expect(paidOnDay(at('2026-09-22T10:00:00.000Z'), [augustPayDay])).toBe('2026-09-22')
  })
})

describe('hours this month count the days of the month, not the weeks that start in it', () => {
  const week = (id: string, from: string, days: Record<string, number>) => {
    const keys = Object.keys(days).sort()
    return {
      id,
      periodStart: new Date(`${from}T00:00:00Z`),
      periodEnd: new Date(`${keys[keys.length - 1]}T00:00:00Z`),
      days,
      totalHours: Object.values(days).reduce((a, b) => a + b, 0),
    }
  }
  const eights = (from: number, to: number, month = '09') =>
    Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`2026-${month}-${String(from + i).padStart(2, '0')}`, 8]))

  // Helena Marsh's September: a week from Monday 31 August, then three whole weeks.
  const helena = [
    week('aug31', '2026-08-31', { '2026-08-31': 8, ...eights(1, 4) }),
    week('sep7', '2026-09-07', eights(7, 11)),
    week('sep14', '2026-09-14', eights(14, 18)),
    week('sep21', '2026-09-21', eights(21, 25)),
  ]

  it('a week that began on 31 August gives September its first four days: Helena’s September is 152 hours, not 120', () => {
    expect(hoursInMonth(helena, utc(2026, 8, 30)).hours).toBe(152)
  })

  it('the same week gives August only its one day', () => {
    expect(hoursInMonth(helena, utc(2026, 7, 15)).hours).toBe(8)
  })

  it('Colleen’s September is 132 hours: three days of the week from 31 August, then three 36-hour weeks', () => {
    const twelves = (d: number[]) => Object.fromEntries(d.map((n) => [`2026-09-${String(n).padStart(2, '0')}`, 12]))
    const colleen = [
      week('a', '2026-08-31', { '2026-08-31': 12, ...Object.fromEntries([2, 3, 4].map((n) => [`2026-09-0${n}`, 8])) }),
      week('b', '2026-09-07', twelves([8, 9, 10])),
      week('c', '2026-09-14', twelves([15, 16, 17])),
      week('d', '2026-09-21', twelves([22, 23, 24])),
    ]
    expect(hoursInMonth(colleen, utc(2026, 8, 30)).hours).toBe(132)
  })

  it('a week crossing the month with no daily hours counts where it ends, and says it did', () => {
    const lump = { id: 'x', periodStart: utc(2026, 7, 31), periodEnd: utc(2026, 8, 4), days: {}, totalHours: 40 }
    const got = hoursInMonth([lump], utc(2026, 8, 10))
    expect(got.hours).toBe(40)
    expect(got.unsplit).toBe(1)
    expect(hoursInMonth([lump], utc(2026, 7, 10)).hours).toBe(0)
  })
})

describe('a person paid through her own company sees her company’s bill, never wages owed', () => {
  const OWN = 'byrne-critical-care'

  it('a corp-to-corp line bought from her own company is her company billing, not wages', () => {
    expect(workerPaidAs({ contractType: 'C2C', vendorCompanyId: OWN }, [OWN])).toBe('OWN_COMPANY_BILLS')
  })

  it('a W2 line with nobody between is wages', () => {
    expect(workerPaidAs({ contractType: 'W2', vendorCompanyId: null }, [OWN])).toBe('WAGES')
  })

  it('a line bought from a firm that is not hers pays that firm, not her', () => {
    expect(workerPaidAs({ contractType: 'C2C', vendorCompanyId: 'some-supplier' }, [OWN])).toBe('THROUGH_SUPPLIER')
    expect(workerPaidAs({ contractType: 'W2', vendorCompanyId: null, supplierSellContractId: 'below' }, [])).toBe('THROUGH_SUPPLIER')
  })

  it('a line with no contract type is unknown, never read as wages', () => {
    expect(workerPaidAs({ contractType: null }, [])).toBe('UNKNOWN')
  })

  it('the sentence says her company bills and the buyer pays her company’s invoice, and never says owed to you or pay date', () => {
    const says = ownCompanyBillsSays({
      companyName: 'Byrne Critical Care LLC', buyerName: 'Halcyon Talent', weeks: 3, hours: 108, paymentTermsDays: 30,
    })
    expect(says).toBe(
      '3 weeks, 108 hours, accepted by Halcyon Talent and ready for Byrne Critical Care LLC to bill. ' +
        'Halcyon Talent pays Byrne Critical Care LLC’s invoice, net 30 days; it does not pay you wages.'
    )
    expect(says).not.toMatch(/owed to you|pay date|pay day/i)
    expect(says).not.toMatch(/\$/)
  })
})
