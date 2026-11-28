import { describe, it, expect } from 'vitest'
import {
  datePaidWages, yearEndPack, blankShortWages,
  type DatablePosting, type RunPaidHours,
} from '@/lib/payroll-export'

/**
 * Every dollar a payroll run pays has a wage posting behind it, once.
 *
 * Walked 2026-11-14 at Brightmoor Staffing: after "Not exempt" was
 * recorded, Process paid Marisol Quintero's 46-hour week at $45 an hour
 * 40 x $45 + 6 x $67.50 = $2,205.00. The W-2 figures then read "Payroll
 * runs paid Marisol Quintero $4,005.00 USD in 2026, and only $3,870.00
 * has a wage posting behind it". $4,005 - $3,870 = $135 = 6 x $22.50, the
 * premium: the week had posted 46 x $45 = $2,070 of pay when it was
 * accepted, before anybody said she was not exempt, and the W-2 read only
 * pay postings, never the premium beside them.
 *
 * Now the premium is posted when the answer is recorded (lib/order-postings,
 * `repostPayFor`), and the W-2 reads it as wages, dated by the run that
 * paid it. These are the arithmetic, with no database.
 */

const D = (s: string) => new Date(`${s}T00:00:00Z`)

const posting = (over: Partial<DatablePosting>): DatablePosting => ({
  id: 'p', kind: 'PAY', personId: 'marisol', personName: 'Marisol Quintero', hasTaxId: false,
  contractType: 'W2', amountCents: -180_000, currency: 'USD', postedAt: D('2026-10-11'),
  source: 'TIMESHEET', sourceId: 'sig', buyContractId: 'bc', timesheetId: 'ts', acceptedHours: 40,
  ...over,
})

/** One run line: a day's straight hours and the premium on its overtime hours. */
const ran = (day: string, paidOn: string, hours: number, premiumCents = 0, timesheetId = 'ts'): RunPaidHours => ({
  buyContractId: 'bc', personId: 'marisol', timesheetId, hours, paidAt: D(paidOn), premiumCents,
})

/** What the runs paid, as the W-2 check reads them: straight time at the rate plus the premium. */
const runTotal = (lines: RunPaidHours[], rateCents: number) =>
  lines.reduce((n, l) => n + l.hours * rateCents + (l.premiumCents ?? 0), 0)

const w2 = (postings: DatablePosting[], runs: RunPaidHours[], rateCents: number) => {
  const dated = datePaidWages(postings, runs, new Set())
  const pack = yearEndPack(dated.postings, 2026)
  const out = blankShortWages(pack, [
    { personId: 'marisol', personName: 'Marisol Quintero', currency: 'USD', paidCents: runTotal(runs, rateCents) },
  ])
  return { dated, gross: out.pack.summaries[0]?.grossCents ?? null, short: out.short }
}

/** Monday to Saturday of the week of Oct 18, 2026: 10, 9, 9, 9, 9 hours is 46. */
const FORTY_SIX = [['2026-10-19', 10], ['2026-10-20', 9], ['2026-10-21', 9], ['2026-10-22', 9], ['2026-10-23', 9]] as const

describe('every dollar a payroll run pays has its wage posting, once', () => {
  it('a 40-hour week at $45 posts $1,800 and the run pays $1,800 (40 x 45), so the W-2 reads $1,800 with nothing short', () => {
    const runs = [8, 8, 8, 8, 8].map((h, i) => ran(`2026-10-1${2 + i}`, '2026-10-30', h))
    const { gross, short } = w2([posting({})], runs, 4_500)
    expect(runTotal(runs, 4_500)).toBe(180_000)
    expect(gross).toBe(180_000)
    expect(short).toEqual([])
  })

  it('a 46-hour week not exempt, paid in one run: $2,070 of pay (46 x 45) and a $135 premium (6 x 22.50) are posted, $2,205 is paid, and the W-2 reads $2,205', () => {
    // The run pays straight time on all 46 hours and the premium on the 6
    // over 40, which fall on the last day.
    const runs = FORTY_SIX.map(([day, h]) => ran(day, '2026-10-30', h, day === '2026-10-23' ? 6 * 2_250 : 0))
    expect(runTotal(runs, 4_500)).toBe(46 * 4_500 + 6 * 2_250) // 207,000 + 13,500 = 220,500
    const { gross, short, dated } = w2([
      posting({ id: 'pay', amountCents: -207_000, acceptedHours: 46 }),
      posting({ id: 'prem', kind: 'PREMIUM', amountCents: -13_500, acceptedHours: 46 }),
    ], runs, 4_500)
    expect(gross).toBe(220_500)
    expect(short).toEqual([])
    expect(dated.unpaid).toEqual([])
  })

  it('the walker’s year at Brightmoor: $1,800 and then $2,205 paid, $4,005 posted (1,800 + 2,070 + 135), and no W-2 figure is blanked', () => {
    const forty = [8, 8, 8, 8, 8].map((h, i) => ran(`2026-10-1${2 + i}`, '2026-10-30', h, 0, 'week1'))
    const fortySix = FORTY_SIX.map(([day, h]) => ran(day, '2026-11-13', h, day === '2026-10-23' ? 13_500 : 0, 'week2'))
    const runs = [...forty, ...fortySix]
    expect(runTotal(runs, 4_500)).toBe(400_500)
    const { gross, short } = w2([
      posting({ id: 'a', timesheetId: 'week1', amountCents: -180_000 }),
      posting({ id: 'b', timesheetId: 'week2', amountCents: -207_000, acceptedHours: 46 }),
      posting({ id: 'c', timesheetId: 'week2', kind: 'PREMIUM', amountCents: -13_500, acceptedHours: 46 }),
    ], runs, 4_500)
    expect(gross).toBe(400_500)
    expect(short).toEqual([])
  })

  it('before the fix, the same year with the premium unposted reads $3,870 against $4,005 paid, and the figure is blanked, never shown short', () => {
    const forty = [8, 8, 8, 8, 8].map((h, i) => ran(`2026-10-1${2 + i}`, '2026-10-30', h, 0, 'week1'))
    const fortySix = FORTY_SIX.map(([day, h]) => ran(day, '2026-11-13', h, day === '2026-10-23' ? 13_500 : 0, 'week2'))
    const { gross, short } = w2([
      posting({ id: 'a', timesheetId: 'week1', amountCents: -180_000 }),
      posting({ id: 'b', timesheetId: 'week2', amountCents: -207_000, acceptedHours: 46 }),
    ], [...forty, ...fortySix], 4_500)
    expect(gross).toBeNull()
    expect(short[0].says).toBe(
      'Payroll runs paid Marisol Quintero $4,005.00 USD in 2026, and only $3,870.00 has a wage posting behind it, ' +
        'so no W-2 figure is shown until the postings are complete.'
    )
  })

  it('46 hours at $96 paid at straight time first ($4,416 = 46 x 96), then the $288 premium (6 x 48) by a second run: $4,704 posted and paid, the premium dated by the second run', () => {
    const first = FORTY_SIX.map(([day, h]) => ran(day, '2026-06-30', h))
    // The second run pays no straight hours, only the premium still owed.
    const second = [ran('2026-10-23', '2026-07-15', 0, 6 * 4_800)]
    const runs = [...first, ...second]
    expect(runTotal(runs, 9_600)).toBe(441_600 + 28_800) // 470,400
    const pay = posting({ id: 'pay', amountCents: -441_600, acceptedHours: 46 })
    const prem = posting({ id: 'prem', kind: 'PREMIUM', amountCents: -28_800, acceptedHours: 46 })
    const dated = datePaidWages([pay, prem], runs, new Set())
    // Straight time is dated by the first run, the premium by the second.
    expect(dated.postings.map((p) => [p.amountCents, p.postedAt.toISOString().slice(0, 10)])).toEqual([
      [-441_600, '2026-06-30'],
      [-28_800, '2026-07-15'],
    ])
    const { gross, short } = w2([pay, prem], runs, 9_600)
    expect(gross).toBe(470_400)
    expect(short).toEqual([])
  })

  it('a premium posted and not yet paid by any run is in no year: it is set aside as accepted and not yet paid, $288', () => {
    const first = FORTY_SIX.map(([day, h]) => ran(day, '2026-06-30', h))
    const dated = datePaidWages([
      posting({ id: 'pay', amountCents: -441_600, acceptedHours: 46 }),
      posting({ id: 'prem', kind: 'PREMIUM', amountCents: -28_800, acceptedHours: 46 }),
    ], first, new Set())
    expect(dated.postings.reduce((n, p) => n + p.amountCents, 0)).toBe(-441_600)
    expect(dated.unpaid).toEqual([{ personId: 'marisol', personName: 'Marisol Quintero', amountCents: 28_800, currency: 'USD' }])
  })

  it('a held week released: while it was held nothing of it is dated ($2,205 waiting), and once one run pays it both postings are dated by that run', () => {
    const postings = [
      posting({ id: 'pay', amountCents: -207_000, acceptedHours: 46 }),
      posting({ id: 'prem', kind: 'PREMIUM', amountCents: -13_500, acceptedHours: 46 }),
    ]
    const held = datePaidWages(postings, [], new Set())
    expect(held.postings).toEqual([])
    expect(held.unpaid.reduce((n, a) => n + a.amountCents, 0)).toBe(220_500)

    const runs = FORTY_SIX.map(([day, h]) => ran(day, '2026-11-13', h, day === '2026-10-23' ? 13_500 : 0))
    const released = datePaidWages(postings, runs, new Set())
    expect(released.unpaid).toEqual([])
    expect(released.postings.every((p) => p.postedAt.toISOString().slice(0, 10) === '2026-11-13')).toBe(true)
    expect(released.postings.reduce((n, p) => n + p.amountCents, 0)).toBe(-220_500)
  })

  it('a premium split across two runs is dated by the cents each paid: $90 on the first, $45 on the second, never all on one', () => {
    const runs = [ran('2026-10-22', '2026-10-30', 0, 9_000), ran('2026-10-23', '2026-11-13', 0, 4_500)]
    const dated = datePaidWages([posting({ id: 'prem', kind: 'PREMIUM', amountCents: -13_500, acceptedHours: 46 })], runs, new Set())
    expect(dated.postings.map((p) => [p.amountCents, p.postedAt.toISOString().slice(0, 10)])).toEqual([
      [-9_000, '2026-10-30'],
      [-4_500, '2026-11-13'],
    ])
  })

  it('a premium on a line whose earlier run recorded no lines, and no run that paid it, is undated and in no year', () => {
    const dated = datePaidWages([posting({ id: 'prem', kind: 'PREMIUM', amountCents: -13_500 })], [], new Set(['bc']))
    expect(dated.postings).toEqual([])
    expect(dated.undated).toHaveLength(1)
    expect(dated.undated[0].amountCents).toBe(13_500)
  })
})
