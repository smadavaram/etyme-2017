import { describe, it, expect } from 'vitest'

import {
  datePaidWages, offCyclePaidOn, dropReversed, yearEndPack, WAGES_YEAR_PAID,
  type DatablePosting, type RunPaidHours,
} from '@/lib/payroll-export'

/**
 * Wages count in the year they were paid.
 *
 * US law puts wages on the W-2 for the year they are paid, not the year
 * they were worked. The founder's standing rule is to follow US law as
 * the recommendation, so a week worked in December and paid in January
 * belongs to January's year. The year-end figures dated each wage by
 * the week the hours were posted; they now date it by the day the
 * payroll run paid it (the run's processed date).
 */

const D = (s: string) => new Date(`${s}T00:00:00Z`)

const posting = (over: Partial<DatablePosting> = {}): DatablePosting => ({
  id: 'p1',
  personId: 'k',
  personName: 'Karthik Menon',
  hasTaxId: false,
  contractType: 'W2',
  amountCents: -320_00 * 10,
  currency: 'USD',
  postedAt: D('2026-12-28'),
  source: 'TIMESHEET',
  sourceId: 'a1',
  buyContractId: 'bc',
  timesheetId: 't1',
  acceptedHours: 40,
  ...over,
})

const run = (paidAt: string, hours: number, over: Partial<RunPaidHours> = {}): RunPaidHours => ({
  buyContractId: 'bc', personId: 'k', timesheetId: 't1', hours, paidAt: D(paidAt), ...over,
})

describe('wages count in the year they were paid', () => {
  it('December hours paid in January count toward the next year’s W-2', () => {
    const out = datePaidWages([posting()], [run('2027-01-08', 40)], new Set())
    expect(yearEndPack(out.postings, 2026).w2Count).toBe(0)
    const next = yearEndPack(out.postings, 2027)
    expect(next.w2Count).toBe(1)
    expect(next.summaries[0].grossCents).toBe(320_000)
  })

  it('a pay run’s wages count once, in the year it paid them', () => {
    const out = datePaidWages(
      [posting({ postedAt: D('2026-07-27') })],
      [run('2026-08-10', 40)],
      new Set()
    )
    expect(out.postings).toHaveLength(1)
    expect(out.postings[0].postedAt.toISOString().slice(0, 10)).toBe('2026-08-10')
    const total = [2025, 2026, 2027].reduce((n, y) => n + (yearEndPack(out.postings, y).summaries[0]?.grossCents ?? 0), 0)
    expect(total).toBe(320_000)
  })

  it('a week paid by two runs in two years counts each part in the year its run paid it, to the cent', () => {
    const out = datePaidWages(
      [posting({ amountCents: -100_001 })],
      [run('2026-12-31', 16), run('2027-01-08', 24)],
      new Set()
    )
    const a = yearEndPack(out.postings, 2026).summaries[0].grossCents!
    const b = yearEndPack(out.postings, 2027).summaries[0].grossCents!
    expect(a).toBe(40_000)
    expect(a + b).toBe(100_001)
  })

  it('W-2 hours accepted and not yet paid count in no year, and are said as waiting', () => {
    const out = datePaidWages([posting()], [run('2026-12-31', 30)], new Set())
    expect(out.unpaid).toHaveLength(1)
    expect(out.unpaid[0].amountCents).toBe(80_000)
    expect(yearEndPack(out.postings, 2026).summaries[0].grossCents).toBe(240_000)
  })

  it('a week behind a run that recorded no lines has no paid date, and is named rather than put in a year', () => {
    const out = datePaidWages([posting()], [], new Set(['bc']))
    expect(out.postings).toHaveLength(0)
    expect(out.undated).toHaveLength(1)
    expect(out.unpaid).toHaveLength(0)
  })

  it('hours paid twice over do not count the posting twice', () => {
    const out = datePaidWages([posting()], [run('2026-08-10', 40), run('2026-09-10', 40)], new Set())
    const sum = out.postings.reduce((n, p) => n + Math.abs(p.amountCents), 0)
    expect(sum).toBe(320_000)
  })

  it('another person’s run, or another contract’s, never dates this posting', () => {
    const out = datePaidWages(
      [posting()],
      [run('2026-08-10', 40, { personId: 'x' }), run('2026-08-10', 40, { buyContractId: 'other' })],
      new Set()
    )
    expect(out.postings).toHaveLength(0)
    expect(out.unpaid).toHaveLength(1)
  })

  it('an off-cycle payment counts in the year of its pay day, not the period it belongs to', () => {
    const out = datePaidWages(
      [posting({ source: 'PAYROLL', sourceId: 'offcycle:s1:k:2027-01-05:final settlement', postedAt: D('2026-12-01'), timesheetId: null })],
      [],
      new Set()
    )
    expect(out.postings[0].postedAt.toISOString().slice(0, 10)).toBe('2027-01-05')
    expect(offCyclePaidOn('offcycle:s1:k:2027-01-05:a: reason with: colons')?.toISOString().slice(0, 10)).toBe('2027-01-05')
    expect(offCyclePaidOn('something-else')).toBeNull()
  })

  it('a 1099 or corp-to-corp payment keeps its posting date, unchanged', () => {
    for (const contractType of ['IND_1099', 'C2C']) {
      const out = datePaidWages([posting({ contractType })], [], new Set(['bc']))
      expect(out.postings).toHaveLength(1)
      expect(out.postings[0].postedAt.toISOString().slice(0, 10)).toBe('2026-12-28')
    }
  })

  it('a reversed wage posting is not counted, and neither is its reversal', () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }]
    expect(dropReversed(rows, new Set(['p1'])).map((r) => r.id)).toEqual(['p2'])
  })

  it('the screen says in one line that wages count in the year they were paid', () => {
    expect(WAGES_YEAR_PAID).toBe('Wages count in the year they were paid.')
  })
})
