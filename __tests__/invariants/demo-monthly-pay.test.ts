import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { writeCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { getTemplatePack } from '@/lib/template-packs'
import { usFederalHolidays } from '@/lib/holidays'
import { federalHolidays } from '@/lib/seed-calendar'

/**
 * The demo's employers pay monthly, and a pay day never comes before the
 * hours it pays.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The seeded payroll runs pay calendar months (`lib/seed-payroll-runs`),
 * while the US pack every seeded line is generated on pays fortnightly on
 * a Friday. So on a worker's page the pay days and the paid periods never
 * lined up. The founder approved, on 2026-09-30, that the demo firms pay
 * monthly. That is a choice for the seeded world and nobody else: US state
 * law decides how often a real employee must be paid, and some states do
 * not allow monthly pay for hourly workers. So the monthly rhythm is a
 * named set the seed passes in, and no pack ships it.
 *
 * ── The offsets were measured, not chosen ────────────────────────────
 *
 * A pay date is a PAY kind and moves to the working day BEFORE a weekend
 * or a holiday. Measured over every month from 2024 to 2035 on the US
 * federal calendar:
 *
 * - Calculate on month-end + 3 and pay on month-end + 5, the first
 *   proposal, can pay on the same day it calculates (June 2026: 5 July is
 *   a Sunday, so pay moves back to 3 July, the calculation day), and a
 *   Monday holiday moves the calculation back onto the month-end itself,
 *   before the last day's hours are in.
 * - Month-end + 4 and + 9 is the smallest pair where the calculation is
 *   always at least a day after the month ends and the pay day always at
 *   least two days after the calculation. The latest pay day it gives is
 *   nine days after the month ends.
 */

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
/** The last day of month `m` (0-based) of year `y`; `m` may run past 11. */
const monthEnd = (y: number, m: number) => utc(y, m + 1, 0)
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)

/** Both calendars a seeded firm could be generated against: the seed's own eleven days, and the library's. */
function calendars(): { name: string; days: string[] }[] {
  const seed: string[] = []
  const lib: string[] = []
  for (let y = 2023; y <= 2037; y++) {
    seed.push(...federalHolidays(y).map((h) => iso(h.date)))
    lib.push(...usFederalHolidays(y).map((h) => h.date))
  }
  return [
    { name: 'weekends only', days: [] },
    { name: 'the seeded calendar', days: seed },
    { name: 'the US federal calendar', days: lib },
    { name: 'both at once', days: [...seed, ...lib] },
  ]
}

/** A stand-in for the database: records what is written, and answers the policy read with the shipped default. */
function stubDb() {
  const written: { sellContractId?: string; buyContractId?: string; kind: string; dueOn: Date }[] = []
  return {
    written,
    client: {
      cycle: { createMany: async ({ data }: any) => { written.push(...data); return { count: data.length } } },
      sellContract: { findUnique: async () => ({ company: {} }) },
    } as any,
  }
}

/** Their own W-2, so the pay cycles are payroll rather than a supplier's invoice. */
const W2 = { id: 'buy-1', contractType: 'W2', vendorCompanyId: null }
/** Bought from a supplier, so what is paid is the supplier's invoice. */
const FROM_SUPPLIER = { id: 'buy-2', contractType: 'C2C', vendorCompanyId: 'supplier-1' }

async function write(
  start: Date,
  end: Date,
  opts: { pay?: any; buy?: typeof W2 | typeof FROM_SUPPLIER; holidays?: string[]; existing?: Map<string, Set<string>> } = {}
) {
  const stub = stubDb()
  await writeCyclesFor(stub.client, {
    sell: { id: 'sell-1', startDate: start, endDate: end },
    buy: opts.buy ?? W2,
    packId: 'US_IT',
    holidays: opts.holidays ?? [],
    existing: opts.existing,
    ...(opts.pay ? { pay: opts.pay } : {}),
  })
  return stub.written
}

const of = (rows: { kind: string; dueOn: Date }[], kind: string) =>
  rows.filter((r) => r.kind === kind).map((r) => r.dueOn).sort((a, b) => a.getTime() - b.getTime())

describe('the demo pays monthly, and only the demo', () => {
  it('a placement with no override is paid on its pack’s rhythm exactly as before', async () => {
    const start = utc(2026, 0, 1)
    const end = utc(2026, 11, 31)
    const pay = of(await write(start, end), 'SALARY_PAY')
    // US_IT pays every other Friday: about twenty-six a year, fourteen days apart.
    expect(pay.length).toBeGreaterThanOrEqual(25)
    for (let i = 1; i < pay.length; i++) {
      const gap = daysBetween(pay[i - 1], pay[i])
      expect(gap).toBeGreaterThanOrEqual(12)
      expect(gap).toBeLessThanOrEqual(16)
    }
  })

  it('no real company’s pack pays on the demo’s monthly rhythm', () => {
    for (const id of ['US_IT', 'US_SAP']) {
      const defs = getTemplatePack(id)!.cycleDefinitions
      for (const kind of ['SALARY_CALCULATE', 'SALARY_PAY']) {
        expect(defs.find((d) => d.kind === kind)?.frequency).toBe('BIWEEKLY')
      }
    }
  })

  it('the demo’s monthly pay moves only the pay dates — the hours and the bill dates stay the pack’s', async () => {
    const start = utc(2026, 3, 1)
    const end = utc(2026, 8, 30)
    const plain = await write(start, end)
    const demo = await write(start, end, { pay: DEMO_MONTHLY_PAY })
    for (const kind of ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE']) {
      expect(of(demo, kind).map(iso)).toEqual(of(plain, kind).map(iso))
    }
    expect(of(demo, 'SALARY_PAY').map(iso)).not.toEqual(of(plain, 'SALARY_PAY').map(iso))
  })

  it('the demo’s pay dates are written on the pay line and never on the bill line', async () => {
    const rows = await write(utc(2026, 3, 1), utc(2026, 5, 30), { pay: DEMO_MONTHLY_PAY })
    const salary = rows.filter((r) => r.kind.startsWith('SALARY_'))
    expect(salary.length).toBe(6)
    for (const r of salary) {
      expect(r.buyContractId).toBe('buy-1')
      expect(r.sellContractId).toBeUndefined()
    }
  })

  it('a line bought from a supplier keeps its supplier invoice dates and is given no pay days', async () => {
    const start = utc(2026, 3, 1)
    const end = utc(2026, 8, 30)
    const plain = await write(start, end, { buy: FROM_SUPPLIER })
    const demo = await write(start, end, { buy: FROM_SUPPLIER, pay: DEMO_MONTHLY_PAY })
    expect(of(demo, 'SALARY_PAY')).toEqual([])
    expect(of(demo, 'SALARY_CALCULATE')).toEqual([])
    expect(of(demo, 'VENDOR_BILL_GENERATE').map(iso)).toEqual(of(plain, 'VENDOR_BILL_GENERATE').map(iso))
  })
})

describe('a pay day never comes before the hours it pays', () => {
  it('every demo worker is paid monthly, on a day after the month’s hours', async () => {
    // Every start month from 2024 to 2035, a year long each, on every calendar.
    for (const cal of calendars()) {
      for (let y = 2024; y <= 2035; y++) {
        for (let m = 0; m < 12; m++) {
          const rows = await write(utc(y, m, 1), monthEnd(y, m + 11), { pay: DEMO_MONTHLY_PAY, holidays: cal.days })
          const pay = of(rows, 'SALARY_PAY')
          expect(pay.length, `${cal.name}, starting ${y}-${m + 1}`).toBe(12)
          pay.forEach((p, i) => {
            const end = monthEnd(y, m + i)
            const after = daysBetween(end, p)
            // Strictly after the last day of the month it pays, and inside the month after.
            expect(after, `${cal.name}: ${iso(p)} pays the month ending ${iso(end)}`).toBeGreaterThanOrEqual(3)
            expect(after).toBeLessThanOrEqual(9)
          })
        }
      }
    }
  })

  it('a demo month is worked out after the month ends and at least two days before it is paid, even after a weekend or a holiday moves both back', async () => {
    for (const cal of calendars()) {
      for (let y = 2024; y <= 2035; y++) {
        const rows = await write(utc(y, 0, 1), utc(y, 11, 31), { pay: DEMO_MONTHLY_PAY, holidays: cal.days })
        const calc = of(rows, 'SALARY_CALCULATE')
        const pay = of(rows, 'SALARY_PAY')
        expect(calc.length).toBe(12)
        calc.forEach((c, i) => {
          const end = monthEnd(y, i)
          expect(daysBetween(end, c), `${cal.name}: calculated ${iso(c)} for ${iso(end)}`).toBeGreaterThanOrEqual(1)
          expect(daysBetween(c, pay[i]), `${cal.name}: calculated ${iso(c)}, paid ${iso(pay[i])}`).toBeGreaterThanOrEqual(2)
        })
      }
    }
  })

  it('the first proposal, three and five days after month-end, would have paid on the day it calculated in July 2026', async () => {
    // Kept as a sentence so nobody "simplifies" the offsets back to it.
    const proposal = [
      { kind: 'SALARY_CALCULATE', frequency: 'MONTHLY' as const, dayOfMonth: 28, offsetDays: 3 },
      { kind: 'SALARY_PAY', frequency: 'MONTHLY' as const, dayOfMonth: 28, offsetDays: 5 },
    ]
    const rows = await write(utc(2026, 5, 1), utc(2026, 5, 30), { pay: proposal })
    expect(of(rows, 'SALARY_CALCULATE').map(iso)).toEqual(['2026-07-03'])
    expect(of(rows, 'SALARY_PAY').map(iso)).toEqual(['2026-07-03'])
  })
})

describe('a three-month placement', () => {
  it('Karthik’s placement runs three months, every month of it has a pay day, and no pay day comes before the hours it pays', async () => {
    // Any three whole calendar months: the 1st of one month to the last day of the third.
    for (const cal of calendars()) {
      for (let y = 2024; y <= 2035; y++) {
        for (let m = 0; m < 12; m++) {
          const start = utc(y, m, 1)
          const end = monthEnd(y, m + 2)
          const pay = of(await write(start, end, { pay: DEMO_MONTHLY_PAY, holidays: cal.days }), 'SALARY_PAY')
          expect(pay.length, `${cal.name}: ${iso(start)} to ${iso(end)}`).toBe(3)
          pay.forEach((p, i) => {
            expect(p.getTime()).toBeGreaterThan(monthEnd(y, m + i).getTime())
            // Each pay day falls in the month after the one it pays, so no two months share one.
            expect(p.getUTCMonth()).toBe(utc(y, m + i + 1, 1).getUTCMonth())
          })
          // The last month is paid, which necessarily means after the placement ends.
          expect(pay[2].getTime()).toBeGreaterThan(end.getTime())
        }
      }
    }
  })

  it('a placement that stops in the middle of a month leaves its last days with no pay day, so a three-month demo placement has to end on a month-end', async () => {
    // The generator writes no short final period ("The cycle engine,
    // honestly", item 2). Written down so the seed ends Karthik's
    // placement on a month-end rather than on a day counted from today.
    const pay = of(await write(utc(2026, 5, 10), utc(2026, 8, 9), { pay: DEMO_MONTHLY_PAY }), 'SALARY_PAY')
    expect(pay.length).toBe(3)
    // June's stub, July and August are paid; 1 to 9 September has no pay day.
    expect(pay.every((p) => p.getTime() < utc(2026, 9, 1).getTime())).toBe(true)
    expect(pay.some((p) => p.getUTCMonth() === 9)).toBe(false)
  })

  it('seeding the same placement twice writes its pay days once', async () => {
    const start = utc(2026, 5, 1)
    const end = utc(2026, 7, 31)
    const first = await write(start, end, { pay: DEMO_MONTHLY_PAY })
    const existing = new Map<string, Set<string>>()
    for (const r of first) {
      if (!existing.has(r.kind)) existing.set(r.kind, new Set())
      existing.get(r.kind)!.add(iso(r.dueOn))
    }
    const second = await write(start, end, { pay: DEMO_MONTHLY_PAY, existing })
    expect(second).toEqual([])
  })
})

describe('what the override may be asked to do', () => {
  it('the override can only move pay dates — asking it to move an hours date or a bill date is refused', async () => {
    await expect(
      write(utc(2026, 0, 1), utc(2026, 2, 31), {
        pay: [
          ...DEMO_MONTHLY_PAY,
          { kind: 'INVOICE_GENERATE', frequency: 'MONTHLY', dayOfMonth: 28 },
        ],
      })
    ).rejects.toThrow(/only pay dates/i)
  })

  it('an override that moves the pay day without the pay calculation, or the other way round, is refused', async () => {
    const [calc, pay] = [
      DEMO_MONTHLY_PAY.find((d) => d.kind === 'SALARY_CALCULATE')!,
      DEMO_MONTHLY_PAY.find((d) => d.kind === 'SALARY_PAY')!,
    ]
    await expect(write(utc(2026, 0, 1), utc(2026, 2, 31), { pay: [pay] })).rejects.toThrow(/both/i)
    await expect(write(utc(2026, 0, 1), utc(2026, 2, 31), { pay: [calc] })).rejects.toThrow(/both/i)
  })

  it('the demo’s monthly pay is one monthly calculation and one monthly pay day, each after the month-end', () => {
    expect(DEMO_MONTHLY_PAY.map((d) => d.kind).sort()).toEqual(['SALARY_CALCULATE', 'SALARY_PAY'])
    for (const d of DEMO_MONTHLY_PAY) {
      expect(d.frequency).toBe('MONTHLY')
      expect(d.dayOfMonth).toBeGreaterThanOrEqual(28)
    }
    expect(Object.isFrozen(DEMO_MONTHLY_PAY)).toBe(true)
  })

  it('only the seed may pass the demo’s monthly pay; no route or screen writes it for a real company', () => {
    const SRC = join(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx?$/.test(e)) files.push(full)
      }
    }
    walk(SRC)
    const offenders: string[] = []
    for (const full of files) {
      const rel = relative(process.cwd(), full)
      if (rel === 'src/lib/contract-cycles.ts') continue
      if (/^src\/lib\/(seed-|demo-)/.test(rel)) continue
      const text = readFileSync(full, 'utf8')
      // An import, not a mention: the matrix's own row may say the name in prose.
      if (/import[^;]*\bDEMO_MONTHLY_PAY\b[^;]*from/s.test(text)) offenders.push(`${rel} imports DEMO_MONTHLY_PAY`)
      // A writeCyclesFor call handing in its own pay rhythm, parentheses balanced.
      for (const m of text.matchAll(/writeCyclesFor\(/g)) {
        let depth = 0
        let i = m.index! + 'writeCyclesFor'.length
        for (; i < text.length; i++) {
          if (text[i] === '(') depth++
          else if (text[i] === ')' && --depth === 0) break
        }
        const call = text.slice(m.index!, i + 1)
        if (/[{,]\s*pay\s*[:,}]/.test(call)) offenders.push(`${rel}: ${call.slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('a malformed override on a line with no end', () => {
  it('a pay override that names a bill date is refused even on an open-ended line that writes no dates', async () => {
    const stub = stubDb()
    await expect(
      writeCyclesFor(stub.client, {
        sell: { id: 'sell-1', startDate: utc(2026, 0, 1), endDate: null },
        buy: W2,
        packId: 'US_IT',
        pay: [{ kind: 'INVOICE_GENERATE', frequency: 'MONTHLY', dayOfMonth: 28 }],
      })
    ).rejects.toThrow(/only pay dates/i)
  })
})
