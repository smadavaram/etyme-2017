import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The firm's Today page prices every signed week from one read.
 *
 * "Signed and not yet billed" prices each week through the Bills page's
 * own generator, one dry run per engagement and billing period. Measured
 * 2026-11-02 on a copy of the scale world: at Brightmoor six runs each
 * walked the chain, read the signed weeks, the expenses, the receipts the
 * payers hold and both firms' sites again, 215 statements for 23 weeks,
 * and forty Today pages at once took 6.3 s at the 95th percentile. The
 * runs now share one read of each: 115 statements, 3.2 s for forty, and
 * the answer identical, word for word, at all 27 selling firms compared.
 *
 * What makes the answer identical is that each run keeps from the shared
 * read exactly the rows its own query would have asked for, by the same
 * conditions. These sentences hold those conditions.
 */

vi.mock('@/lib/db', () => ({ prisma: {} }))

const { weeksFromShared, expensesFromShared } = await import('@/lib/money/bill-generate')

const day = (d: string) => new Date(`${d}T00:00:00Z`)
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

type Week = Parameters<typeof weeksFromShared>[0][number]
type Spent = Parameters<typeof expensesFromShared>[0][number]

const week = (id: string, sellContractId: string, from: string, to: string, billedOn: string[] = []): Week =>
  ({ id, sellContractId, periodStart: day(from), periodEnd: day(to), invoiceLines: billedOn.map((s) => ({ sellContractId: s })) }) as unknown as Week

const spent = (id: string, sellContractId: string, status: string, invoiceId: string | null, from: string, to: string, billedOn: string[] = []): Spent =>
  ({ id, sellContractId, status, invoiceId, periodStart: day(from), periodEnd: day(to), invoiceLines: billedOn.map((s) => ({ sellContractId: s })) }) as unknown as Spent

const october = { start: day('2026-10-01'), end: day('2026-10-31') }

describe('a run keeps from the shared read exactly the weeks its own query would return', () => {
  it('a week filed on a line this engagement bills from is kept, and one on another engagement’s line is not', () => {
    const kept = weeksFromShared([week('a', 'sub-1', '2026-10-04', '2026-10-10'), week('b', 'other', '2026-10-04', '2026-10-10')],
      { contractIds: ['sub-1'], ownIds: ['ours-1'], asked: october })
    expect(kept.map((w) => w.id)).toEqual(['a'])
  })

  it('a week already on a bill line of this engagement’s own is left out, and one billed only on another of the firm’s lines is kept', () => {
    const kept = weeksFromShared([
      week('billed-here', 'sub-1', '2026-10-04', '2026-10-10', ['ours-1']),
      week('billed-elsewhere', 'sub-1', '2026-10-11', '2026-10-17', ['ours-2']),
    ], { contractIds: ['sub-1'], ownIds: ['ours-1'], asked: october })
    expect(kept.map((w) => w.id)).toEqual(['billed-elsewhere'])
  })

  it('a week that touches the days asked by one day is kept, and one wholly outside them is not', () => {
    const kept = weeksFromShared([
      week('grazes', 'sub-1', '2026-09-27', '2026-10-03'),
      week('before', 'sub-1', '2026-09-20', '2026-09-26'),
      week('after', 'sub-1', '2026-11-01', '2026-11-07'),
    ], { contractIds: ['sub-1'], ownIds: ['ours-1'], asked: october })
    expect(kept.map((w) => w.id)).toEqual(['grazes'])
  })

  it('the bill lines read to decide that are not handed on, so a week reads to the run as its own query would give it', () => {
    const [w] = weeksFromShared([week('a', 'sub-1', '2026-10-04', '2026-10-10', ['ours-2'])],
      { contractIds: ['sub-1'], ownIds: ['ours-1'], asked: october })
    expect('invoiceLines' in w).toBe(false)
  })

  it('the order of the shared read is kept, the earliest week first', () => {
    const kept = weeksFromShared([week('first', 'sub-1', '2026-10-04', '2026-10-10'), week('second', 'sub-2', '2026-10-11', '2026-10-17')],
      { contractIds: ['sub-1', 'sub-2'], ownIds: ['ours-1'], asked: october })
    expect(kept.map((w) => w.id)).toEqual(['first', 'second'])
  })
})

describe('a run keeps from the shared read exactly the expenses its own query would return', () => {
  const lines = { ownIds: ['ours-1'], belowIds: ['sub-1'], asked: october }

  it('on the firm’s own line, an expense is kept only while it is approved and on no bill', () => {
    const kept = expensesFromShared([
      spent('approved', 'ours-1', 'APPROVED', null, '2026-10-04', '2026-10-10'),
      spent('on-a-bill', 'ours-1', 'APPROVED', 'inv-1', '2026-10-04', '2026-10-10'),
      spent('invoiced', 'ours-1', 'INVOICED', null, '2026-10-04', '2026-10-10'),
    ], lines)
    expect(kept.map((e) => e.id)).toEqual(['approved'])
  })

  it('on a line below the firm’s, an expense the employer approved, billed or paid is kept, and one only submitted is not', () => {
    const kept = expensesFromShared([
      spent('approved', 'sub-1', 'APPROVED', null, '2026-10-04', '2026-10-10'),
      spent('billed-below', 'sub-1', 'INVOICED', 'inv-9', '2026-10-04', '2026-10-10'),
      spent('paid-below', 'sub-1', 'PAID', 'inv-9', '2026-10-04', '2026-10-10'),
      spent('submitted', 'sub-1', 'SUBMITTED', null, '2026-10-04', '2026-10-10'),
    ], lines)
    expect(kept.map((e) => e.id)).toEqual(['approved', 'billed-below', 'paid-below'])
  })

  it('an expense on a line of neither, already on a bill line of the firm’s own, or outside the days asked is left out', () => {
    const kept = expensesFromShared([
      spent('elsewhere', 'other', 'APPROVED', null, '2026-10-04', '2026-10-10'),
      spent('billed-by-us', 'sub-1', 'INVOICED', 'inv-9', '2026-10-04', '2026-10-10', ['ours-1']),
      spent('september', 'sub-1', 'APPROVED', null, '2026-09-01', '2026-09-07'),
    ], lines)
    expect(kept).toEqual([])
  })
})

describe('only a dry run shares, and only inside what was read', () => {
  const gen = read('src/lib/money/bill-generate.ts')

  it('a bill that is written always reads for itself: the shared reads are taken only on a dry run', () => {
    expect(gen).toMatch(/const shared = opts\.dryRun && opts\.shared && ownIds\.every\(\(id\) => opts\.shared!\.lineIds\.has\(id\)\) \? opts\.shared : null/)
  })

  it('a run whose days reach past the days read, or that names no days, reads its own weeks and expenses', () => {
    expect(gen).toMatch(/const sharedDays = shared && asked\.start && asked\.end\s+&& asked\.start\.getTime\(\) >= shared\.from\.getTime\(\) && asked\.end\.getTime\(\) <= shared\.to\.getTime\(\)/)
  })

  it('the shared week read and a run’s own read ask for the same fields, from one include', () => {
    expect(gen.match(/include: BILL_WEEK_INCLUDE/g)?.length).toBe(1)
    expect(gen).toMatch(/\.\.\.BILL_WEEK_INCLUDE,\s+invoiceLines:/)
    expect(gen.match(/include: BILL_EXPENSE_INCLUDE/g)?.length).toBe(1)
    expect(gen).toMatch(/\.\.\.BILL_EXPENSE_INCLUDE,\s+invoiceLines:/)
  })

  it('the Today page knows every period before any run starts, so one read covers the first day and the last', () => {
    const today = read('src/lib/money/firm-today.ts')
    expect(today).toMatch(/shareBillReads\(\{\s+lineIds: ownIds,\s+rungs,/)
    expect(today).toMatch(/\{ dryRun: true, shared \}/)
  })
})
