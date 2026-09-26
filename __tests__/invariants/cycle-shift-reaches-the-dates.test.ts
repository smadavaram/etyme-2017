import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { generateCycles, localKey, type CycleDefinition } from '@/lib/cycle-generator'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { DEFAULT_CYCLE_SHIFT, localDayKey, policyFrom } from '@/lib/cycle-shift'

/**
 * The company's calendar setting, in the dates that are actually written.
 *
 * `lib/cycle-shift` and the settings screen shipped on 2026-09-17 and
 * nothing read them: a company could choose a direction, see it saved,
 * and no generated date changed. A column is not a feature.
 *
 * Every date below is a real day. July 2026: the 3rd is a Friday, the
 * 4th a Saturday, the 5th a Sunday, the 6th a Monday. A test that
 * asserted a direction constant would pass while paying somebody on the
 * wrong day.
 */

const JULY = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31) }

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const day = (d: Date) => localDayKey(d)

/** A monthly cycle of one kind, landing on one day of July. */
const monthly = (kind: string, dayOfMonth: number): CycleDefinition => ({
  kind,
  frequency: 'MONTHLY',
  dayOfMonth,
})

/** The one date a single-kind July run produces. */
function julyDate(
  kind: string,
  dayOfMonth: number,
  company: Record<string, string>,
  holidays: string[] = []
): string {
  const cycles = generateCycles(
    JULY.start,
    JULY.end,
    [monthly(kind, dayOfMonth)],
    holidays,
    new Map(),
    { policy: policyFrom(company) }
  )
  expect(cycles).toHaveLength(1)
  return day(cycles[0].dueOn)
}

describe('which way a generated date moves is the company’s answer, not the engine’s', () => {

  it('a company that asked to be paid after the weekend has its pay day generated on the Monday', () => {
    expect(julyDate('SALARY_PAY', 4, { cycleShiftPay: 'AFTER' })).toBe('2026-07-06')
  })

  it('a company whose terms are calendar days has a pay day generated on the Saturday it falls on', () => {
    expect(julyDate('SALARY_PAY', 4, { cycleShiftPay: 'NONE' })).toBe('2026-07-04')
  })

  it('a company that has said nothing is still paid on the Friday before, so no existing company’s pay day moves', () => {
    expect(julyDate('SALARY_PAY', 4, {})).toBe('2026-07-03')
    expect(policyFrom({})).toEqual(DEFAULT_CYCLE_SHIFT)
  })

  it('a company that asked to bill before the weekend has its invoice date generated on the Friday', () => {
    expect(julyDate('INVOICE_GENERATE', 4, { cycleShiftBill: 'BEFORE' })).toBe('2026-07-03')
    // And the company that said nothing still raises it on the Monday.
    expect(julyDate('INVOICE_GENERATE', 4, {})).toBe('2026-07-06')
  })

  it('a company that leaves its hours where they fall has an hours-due date generated on the Sunday', () => {
    expect(julyDate('TIMESHEET_SUBMIT', 5, { cycleShiftHours: 'NONE' })).toBe('2026-07-05')
    expect(julyDate('TIMESHEET_SUBMIT', 5, {})).toBe('2026-07-06')
  })

  it('the answer a company gave about pay does not change the day its invoices are raised', () => {
    const company = { cycleShiftPay: 'NONE' }
    expect(julyDate('SALARY_PAY', 4, company)).toBe('2026-07-04')
    expect(julyDate('INVOICE_GENERATE', 4, company)).toBe('2026-07-06')
  })

  it('a firm that pays before the weekend and bills after it gets both answers in one generation run', () => {
    const cycles = generateCycles(
      JULY.start,
      JULY.end,
      [monthly('SALARY_PAY', 4), monthly('INVOICE_GENERATE', 4)],
      [],
      new Map(),
      { policy: policyFrom({ cycleShiftPay: 'BEFORE', cycleShiftBill: 'AFTER' }) }
    )
    const byKind = Object.fromEntries(cycles.map((c) => [c.kind, day(c.dueOn)]))
    expect(byKind.SALARY_PAY).toBe('2026-07-03')
    expect(byKind.INVOICE_GENERATE).toBe('2026-07-06')
  })

  it('a pay day on a company holiday moves the way that company asked, and skips the weekend behind it', () => {
    // Friday 3 July observed. A company that pays early lands on the
    // Thursday; one that pays late lands on the Monday.
    expect(julyDate('SALARY_PAY', 3, {}, ['2026-07-03'])).toBe('2026-07-02')
    expect(julyDate('SALARY_PAY', 3, { cycleShiftPay: 'AFTER' }, ['2026-07-03'])).toBe('2026-07-06')
  })

  it('a company that shifts nothing keeps a date that lands on its own holiday', () => {
    expect(julyDate('SALARY_PAY', 3, { cycleShiftPay: 'NONE' }, ['2026-07-03'])).toBe('2026-07-03')
  })

  it('a holiday on one company’s calendar does not move another company’s generated dates', () => {
    // The calendar is loaded per company, so a day off at one firm is not
    // in the other firm's set at all. Same policy, same kind, same month:
    // only the calendar differs.
    const theirs = julyDate('INVOICE_GENERATE', 7, {}, ['2026-07-07'])
    const ours = julyDate('INVOICE_GENERATE', 7, {}, [])
    expect(theirs).toBe('2026-07-08')
    expect(ours).toBe('2026-07-07')
  })

  it('a date that is already a working day is generated where it falls, whatever the company asked for', () => {
    for (const direction of ['BEFORE', 'AFTER', 'NONE']) {
      expect(julyDate('SALARY_PAY', 7, { cycleShiftPay: direction })).toBe('2026-07-07')
    }
  })

  it('a direction the generator does not recognize generates the day the company was already being paid on', () => {
    // Refuse rather than invent: an unreadable column is the shipped
    // default, never a third behavior nobody chose.
    expect(julyDate('SALARY_PAY', 4, { cycleShiftPay: 'SIDEWAYS' })).toBe('2026-07-03')
  })
})

describe('a company changing its answer does not rewrite the dates it already has', () => {

  const WEEKLY_PAY: CycleDefinition = { kind: 'SALARY_PAY', frequency: 'WEEKLY' }

  it('extending a contract writes the added months and never a second copy of a month already generated', () => {
    const paysEarly = { policy: policyFrom({ cycleShiftPay: 'BEFORE' }) }
    const first = generateCycles(on(2026, 1, 1), on(2026, 3, 31), [WEEKLY_PAY], [], new Map(), paysEarly)
    expect(first.length).toBeGreaterThan(10)

    // The firm then tells us to pay after the weekend instead, and the
    // contract is extended by three months. Every January date would
    // regenerate onto a different day and so match nothing already
    // written — which is how one fortnight gets two pay days.
    const already = new Map([['SALARY_PAY', new Set(first.map((c) => day(c.dueOn)))]])
    const added = generateCycles(
      on(2026, 1, 1),
      on(2026, 6, 30),
      [WEEKLY_PAY],
      [],
      already,
      { policy: policyFrom({ cycleShiftPay: 'AFTER' }), onlyPeriodsAfter: on(2026, 3, 31) }
    )

    expect(added.length).toBeGreaterThan(10)
    for (const c of added) expect(c.dueOn > on(2026, 3, 31)).toBe(true)
  })

  it('a company that changes its weekend rule keeps every pay day it had already generated', () => {
    const first = generateCycles(on(2026, 1, 1), on(2026, 3, 31), [WEEKLY_PAY], [], new Map(), {
      policy: policyFrom({ cycleShiftPay: 'BEFORE' }),
    })
    const already = new Map([['SALARY_PAY', new Set(first.map((c) => day(c.dueOn)))]])
    const added = generateCycles(on(2026, 1, 1), on(2026, 6, 30), [WEEKLY_PAY], [], already, {
      policy: policyFrom({ cycleShiftPay: 'AFTER' }),
      onlyPeriodsAfter: on(2026, 3, 31),
    })
    // Nothing from the first run comes back, under any date.
    const old = new Set(first.map((c) => day(c.dueOn)))
    for (const c of added) expect(old.has(day(c.dueOn))).toBe(false)
  })

  it('the months added still fall on the weeks the original contract was anchored to', () => {
    const defs: CycleDefinition[] = [{ kind: 'SALARY_PAY', frequency: 'BIWEEKLY' }]
    const first = generateCycles(on(2026, 1, 1), on(2026, 3, 31), defs)
    const already = new Map([['SALARY_PAY', new Set(first.map((c) => day(c.dueOn)))]])
    const added = generateCycles(on(2026, 1, 1), on(2026, 6, 30), defs, [], already, {
      onlyPeriodsAfter: on(2026, 3, 31),
    })
    const gap = (added[0].dueOn.getTime() - first[first.length - 1].dueOn.getTime()) / 86_400_000
    expect(gap).toBe(14)
  })

  it('the route that extends a placement generates only the months it added', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/contracts/[id]/extend/route.ts'),
      'utf8'
    )
    expect(route).toContain('onlyPeriodsAfter: oldEnd')
  })
})

describe('whose answer applies to a placement', () => {

  /** A stand-in for the database: one contract pair, one selling firm. */
  function db(company: Record<string, string> | null) {
    const written: { kind: string; dueOn: Date }[] = []
    return {
      written,
      client: {
        cycle: { createMany: async ({ data }: any) => { written.push(...data); return { count: data.length } } },
        sellContract: {
          findUnique: async () => (company === null ? null : { company }),
        },
      } as any,
    }
  }

  const sell = { id: 'sell-1', startDate: on(2026, 1, 1), endDate: on(2026, 12, 31) }
  /** Their own W-2, so the pay cycles are payroll rather than a supplier's invoice. */
  const buy = { id: 'buy-1', contractType: 'W2', vendorCompanyId: null }

  async function payDays(
    company: Record<string, string> | null,
    holidays: string[] = []
  ): Promise<string[]> {
    const stub = db(company)
    await writeCyclesFor(stub.client, { sell, buy, packId: 'US_IT', holidays })
    return stub.written.filter((c) => c.kind === 'SALARY_PAY').map((c) => day(c.dueOn))
  }

  it('a placement is generated on the policy of the firm that holds the contract, without the caller passing it', async () => {
    // Four routes and three seeds write cycles and none of them knew a
    // policy existed. Reading it off the sell contract is how the setting
    // reaches a placement made by any of them.
    // The default pack's pay days are weekdays already, so a day nobody
    // works has to exist for a direction to be visible at all: the firm
    // closes on its own first pay day of the year.
    const ordinary = await payDays({})
    expect(ordinary.length).toBeGreaterThan(0)
    const shut = ordinary[0]

    const early = await payDays({ cycleShiftPay: 'BEFORE' }, [shut])
    const late = await payDays({ cycleShiftPay: 'AFTER' }, [shut])

    expect(early[0] < shut).toBe(true)
    expect(late[0] > shut).toBe(true)
    expect(await payDays({ cycleShiftPay: 'NONE' }, [shut])).toEqual(ordinary)
  })

  it('a contract pair whose company cannot be read is generated on the shipped default, not on no answer at all', async () => {
    expect(await payDays(null)).toEqual(await payDays({}))
  })

  it('a firm that was asked nothing is generated exactly as it was before any of this existed', async () => {
    const before = await payDays({})
    const shipped = await payDays({ cycleShiftPay: DEFAULT_CYCLE_SHIFT.pay })
    expect(before).toEqual(shipped)
  })
})

describe('one copy of the day-key arithmetic', () => {
  it('the generator and the company’s calendar read a date as the same day', () => {
    // Two copies of a timezone fix is one copy waiting to be missed: the
    // generator's own `localKey` is now the calendar's `localDayKey`.
    expect(localKey).toBe(localDayKey)
  })

  it('a holiday shifts a generated date whatever timezone the server is in', () => {
    const tz = process.env.TZ
    for (const zone of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
      try {
        process.env.TZ = zone
        expect(julyDate('INVOICE_GENERATE', 6, {}, ['2026-07-06']), `under ${zone}`).toBe('2026-07-07')
      } finally {
        process.env.TZ = tz
      }
    }
  })
})
