import { describe, it, expect } from 'vitest'

import {
  datePaidWages, receiptPayments, type ReceiptForYear, offCyclePaidOn, dropReversed, yearEndPack, WAGES_YEAR_PAID,
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

  it('a 1099 or corp-to-corp posting from accepted hours is left to its invoice receipt, never counted by its posting date', () => {
    for (const contractType of ['IND_1099', 'C2C']) {
      const out = datePaidWages([posting({ contractType })], [], new Set(['bc']))
      expect(out.postings).toHaveLength(0)
      expect(out.unpaid).toHaveLength(0)
      expect(out.undated).toHaveLength(0)
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

describe('1099 and corp-to-corp payments count in the year they were paid', () => {
  const receipt = (over: Partial<ReceiptForYear> = {}): ReceiptForYear => ({
    id: 'vb1', number: 'INV-12', contractType: 'IND_1099',
    payeeId: 'p1', payeeName: 'Dana Ruiz', currency: 'USD',
    totalCents: 800_000, paidCents: 800_000, paidAt: D('2027-01-06'), status: 'PAID',
    runPayments: [],
    ...over,
  })

  it('a contractor’s December invoice paid in January counts toward the next year’s 1099', () => {
    const out = receiptPayments([receipt()])
    expect(yearEndPack(out.postings, 2026).necCount).toBe(0)
    const next = yearEndPack(out.postings, 2027)
    expect(next.necCount).toBe(1)
    expect(next.summaries[0].grossCents).toBe(800_000)
  })

  it('a corp-to-corp supplier’s invoice paid in the year counts in that year, and still gets no form', () => {
    const out = receiptPayments([receipt({ contractType: 'C2C', payeeName: 'Consultis', paidAt: D('2026-08-14') })])
    const pack = yearEndPack(out.postings, 2026)
    expect(pack.necCount).toBe(0)
    expect(pack.noForm[0].grossCents).toBe(800_000)
  })

  it('an invoice receipt not yet paid counts in no year, and is said as waiting', () => {
    const out = receiptPayments([receipt({ paidCents: 0, paidAt: null, status: 'APPROVED' })])
    expect(out.postings).toHaveLength(0)
    expect(out.waiting).toEqual([{ personId: 'p1', personName: 'Dana Ruiz', amountCents: 800_000, currency: 'USD' }])
  })

  it('an invoice paid in two payment runs counts each part in the year its run paid it', () => {
    const out = receiptPayments([receipt({
      runPayments: [{ amountCents: 300_000, paidAt: D('2026-12-30') }, { amountCents: 500_000, paidAt: D('2027-01-06') }],
    })])
    expect(yearEndPack(out.postings, 2026).summaries[0].grossCents).toBe(300_000)
    expect(yearEndPack(out.postings, 2027).summaries[0].grossCents).toBe(500_000)
  })

  it('a part payment recorded with no date is named rather than put in a year, and the rest is waiting', () => {
    const out = receiptPayments([receipt({ paidCents: 200_000, paidAt: null, status: 'APPROVED' })])
    expect(out.postings).toHaveLength(0)
    expect(out.undated[0].amountCents).toBe(200_000)
    expect(out.waiting[0].amountCents).toBe(600_000)
  })

  it('a cancelled invoice receipt counts nowhere', () => {
    const out = receiptPayments([receipt({ status: 'CANCELLED' })])
    expect(out.postings).toHaveLength(0)
    expect(out.waiting).toHaveLength(0)
  })

  it('an invoice receipt on a W-2 line is payroll’s, and never counted here', () => {
    expect(receiptPayments([receipt({ contractType: 'W2' })]).postings).toHaveLength(0)
  })
})
