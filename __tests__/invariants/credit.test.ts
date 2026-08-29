/**
 * How much of this customer we are actually carrying.
 *
 * A client that owes £100,000 and has four contractors on site for
 * another six months is not exposed for £100,000. Almost every system in
 * this industry reports the first number and calls it exposure. These
 * tests are the reason this one does not.
 */

import { describe, it, expect } from 'vitest'
import {
  committedOf, exposureOf, assess, overrideAcceptable,
  COMMITMENT_HORIZON_DAYS, ASSUMED_HOURS_PER_WEEK, APPROACHING_BPS,
  type RunningAssignment, type CreditLimit,
} from '@/lib/credit'

const NOW = new Date('2026-08-29T00:00:00Z')
const DAY = 86_400_000
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY)

const assignment = (over: Partial<RunningAssignment> = {}): RunningAssignment => ({
  contractId: 'sc1',
  personName: 'Vinay Rao',
  billRateMinor: 11_000, // £110/hr
  currency: 'GBP',
  endDate: inDays(180),
  observedHoursPerWeek: 40,
  ...over,
})

const committedNone = committedOf([], NOW)

// ── Committed work ───────────────────────────────────────────────────

describe('Work promised is exposure even though no invoice exists for it yet', () => {

  it('four contractors running for six months is exposure even though no invoice exists for it yet', () => {
    const c = committedOf(
      Array.from({ length: 4 }, (_, n) =>
        assignment({ contractId: `sc${n}`, endDate: inDays(180) })
      ),
      NOW
    )
    // 4 people × £110/hr × 40 hrs × 180/7 weeks ≈ £452,571
    expect(c.minor).toBe(4 * Math.round(11_000 * 40 * (180 / 7)))
    expect(c.contracts).toBe(4)
    expect(c.basis).toBe('OBSERVED')
  })

  it('an assignment with no end date is named rather than guessed at, and is not folded into the figure', () => {
    const c = committedOf([assignment({ endDate: null })], NOW)
    expect(c.minor).toBe(0)
    expect(c.openEndedCount).toBe(1)
    expect(c.openEndedMinor).toBeGreaterThan(0)
    expect(c.says).toContain('no end date')
    expect(c.says).toContain('guessing')
  })

  it('a two-year placement is counted to a stated horizon, not at its face value', () => {
    expect(COMMITMENT_HORIZON_DAYS).toBe(180)
    const long = committedOf([assignment({ endDate: inDays(730) })], NOW)
    const short = committedOf([assignment({ endDate: inDays(180) })], NOW)
    expect(long.minor).toBe(short.minor)
    expect(long.horizonDays).toBe(180)
    expect(long.says).toContain('6 months')
  })

  it('hours nobody has approved yet are an assumption, and the figure says so', () => {
    const c = committedOf([assignment({ observedHoursPerWeek: null })], NOW)
    expect(ASSUMED_HOURS_PER_WEEK).toBe(40)
    expect(c.basis).toBe('ASSUMED_FULL_TIME')
    expect(c.says).toContain('part-time assignment is overstated')
  })

  it('an assignment that has already ended commits nothing', () => {
    expect(committedOf([assignment({ endDate: inDays(-5) })], NOW).minor).toBe(0)
  })
})

// ── Exposure ─────────────────────────────────────────────────────────

describe('Exposure is three numbers, and the smallest of them is the invoices', () => {

  const base = {
    customerId: 'cus-nike',
    customerName: 'Nike',
    currency: 'GBP',
  }

  it('exposure counts work already done and not yet billed, not only what has been invoiced', () => {
    const e = exposureOf({
      ...base,
      receivableMinor: 10_000_000, // £100k billed and unpaid
      unbilledMinor: 3_000_000, // £30k delivered, not yet on an invoice
      committed: committedOf([assignment(), assignment({ contractId: 'sc2' })], NOW),
    })

    expect(e.minor).toBeGreaterThan(10_000_000)
    expect(e.parts.map((p) => p.key)).toEqual(['RECEIVABLE', 'UNBILLED', 'COMMITTED'])
    expect(e.minor).toBe(10_000_000 + 3_000_000 + e.parts[2].minor!)
    expect(e.complete).toBe(true)
  })

  it('a ledger nobody read leaves unbilled null, never zero, because zero is a claim', () => {
    const e = exposureOf({
      ...base,
      receivableMinor: 10_000_000,
      unbilledMinor: null,
      committed: committedNone,
    })
    expect(e.parts[1].minor).toBeNull()
    expect(e.complete).toBe(false)
    expect(e.gaps[0]).toContain('could not be read')
    expect(e.says).toContain('At least this much')
  })

  it('open-ended assignments keep the headline figure honest by staying outside it', () => {
    const e = exposureOf({
      ...base,
      receivableMinor: 0,
      unbilledMinor: 0,
      committed: committedOf([assignment({ endDate: null })], NOW),
    })
    expect(e.minor).toBe(0)
    expect(e.withOpenEndedMinor).toBeGreaterThan(0)
    expect(e.complete).toBe(false)
  })
})

// ── The limit ────────────────────────────────────────────────────────

describe('A credit limit warns, and never blocks, and is never silently permitted', () => {

  const exposure = (minor: number, complete = true) => ({
    customerId: 'cus-nike',
    customerName: 'Nike',
    currency: 'GBP',
    minor,
    withOpenEndedMinor: minor,
    parts: [],
    complete,
    gaps: complete ? [] : ['something could not be counted'],
    says: '',
  })

  /** A limit as somebody set it — number, currency, reasoning, review date. */
  const limit = (minor: number, over: Partial<CreditLimit> = {}): CreditLimit => ({
    limitMinor: minor,
    currency: 'GBP',
    basis: 'Two years of filings and a clean payment record.',
    reviewBy: new Date('2027-01-01T00:00:00Z'),
    ...over,
  })

  it('a credit limit nobody has set cannot be breached, and it says so instead of showing a green tick', () => {
    const v = assess(exposure(50_000_000), null)
    expect(v.outcome).toBe('NO_LIMIT_SET')
    expect(v.usedBps).toBeNull()
    expect(v.says).toContain('nothing here has been checked')
    expect(v.says).toContain('not the same as being within')
  })

  it('breaching a credit limit warns, names who must approve, and demands a reason — it never blocks', () => {
    const v = assess(exposure(15_000_000), limit(10_000_000))
    expect(v.outcome).toBe('BREACHED')
    expect(v.action).toBe('WARN')
    expect(v.reasonRequired).toBe(true)
    expect(v.approver).toBeTruthy()
    expect(v.headroomMinor).toBe(-5_000_000)
    expect(v.says).toContain('does not stop anything')
    expect(v.says).toContain('commercial judgement')
  })

  it('a breach is never silently permitted — proceeding needs a name and a readable reason', () => {
    const v = assess(exposure(15_000_000), limit(10_000_000))

    expect(overrideAcceptable(v, { byPersonId: null, reason: 'Big client' }).ok).toBe(false)
    expect(overrideAcceptable(v, { byPersonId: 'p1', reason: 'Approved' }).ok).toBe(false)
    expect(
      overrideAcceptable(v, {
        byPersonId: 'p1',
        reason: 'CFO signed off pending the Q3 PO, expected 15 September.',
      }).ok
    ).toBe(true)
  })

  it('eighty per cent of the limit warns without demanding a reason', () => {
    expect(APPROACHING_BPS).toBe(8_000)
    const v = assess(exposure(8_500_000), limit(10_000_000))
    expect(v.outcome).toBe('APPROACHING')
    expect(v.action).toBe('WARN')
    expect(v.reasonRequired).toBe(false)
    expect(v.says).toContain('85% of the limit')
  })

  it('well inside the limit proceeds and says nothing dramatic', () => {
    const v = assess(exposure(2_000_000), limit(10_000_000))
    expect(v.outcome).toBe('WITHIN')
    expect(v.action).toBe('PROCEED')
    expect(v.approver).toBeNull()
  })

  it('a customer with a limit set is measured against it rather than reported as unchecked', () => {
    const v = assess(exposure(4_000_000), limit(10_000_000), { now: NOW })
    expect(v.outcome).toBe('WITHIN')
    expect(v.limitMinor).toBe(10_000_000)
    expect(v.usedBps).toBe(4_000)
    expect(v.headroomMinor).toBe(6_000_000)
  })

  it('the reasoning behind the number travels with the verdict, so somebody can defend it on a Friday', () => {
    const v = assess(exposure(4_000_000), limit(10_000_000), { now: NOW })
    expect(v.basis).toContain('filings')
  })

  it('a limit whose review date has passed is still applied, and says it is out of date', () => {
    const v = assess(exposure(15_000_000), limit(10_000_000, { reviewBy: new Date('2026-01-01T00:00:00Z') }), { now: NOW })
    expect(v.stale).toBe(true)
    expect(v.outcome).toBe('BREACHED')
    expect(v.limitMinor).toBe(10_000_000)
    expect(v.says).toContain('an out-of-date limit is not a removed one')
  })

  it('a limit with no review date is not treated as stale', () => {
    const v = assess(exposure(4_000_000), limit(10_000_000, { reviewBy: null }), { now: NOW })
    expect(v.stale).toBe(false)
    expect(v.says).not.toContain('due for review')
  })

  it('a limit set in one currency is not applied to exposure in another', () => {
    const v = assess(exposure(15_000_000), limit(10_000_000, { currency: 'USD' }), { now: NOW })
    expect(v.outcome).toBe('NO_LIMIT_SET')
    expect(v.limitMinor).toBeNull()
    expect(v.says).toContain('two unrelated numbers')
  })

  it('a limit of zero is nobody having set one, not a limit of nothing', () => {
    const v = assess(exposure(1), limit(0), { now: NOW })
    expect(v.outcome).toBe('NO_LIMIT_SET')
  })

  it('a breach computed on an incomplete exposure says the real number is worse', () => {
    const v = assess(exposure(15_000_000, false), limit(10_000_000))
    expect(v.says).toContain('a floor')
  })
})
