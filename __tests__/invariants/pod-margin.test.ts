import { describe, it, expect } from 'vitest'
import { podMargin, type PodMarginFacts } from '@/lib/money/pod-margin'

/** Record 120, pods: earned margin is accepted revenue less pay, burden and premium. Null when any link is missing. */

const facts = (o: Partial<PodMarginFacts> = {}): PodMarginFacts => ({
  currency: 'USD',
  milestones: [
    { amountCents: 1_000_000, status: 'ACCEPTED' },
    { amountCents: 1_000_000, status: 'INVOICED' },
    { amountCents: 1_000_000, status: 'PENDING' },
  ],
  members: [{ personId: 'a', name: 'Ada' }, { personId: 'b', name: 'Bram' }],
  postings: [
    { personId: 'a', kind: 'PAY', amountCents: -600_000, currency: 'USD' },
    { personId: 'a', kind: 'BURDEN', amountCents: -60_000, currency: 'USD' },
    { personId: 'b', kind: 'PAY', amountCents: -400_000, currency: 'USD' },
    { personId: 'b', kind: 'PREMIUM', amountCents: -40_000, currency: 'USD' },
  ],
  ...o,
})

describe('earned margin on a sold team', () => {
  it('is accepted and invoiced deliverables less pay, burden and premium, and a pending one earns nothing', () => {
    const m = podMargin(facts())
    expect(m.earnedRevenueCents).toBe(2_000_000)
    expect(m.costCents).toBe(1_100_000)
    expect(m.marginCents).toBe(900_000)
    expect(m.unknowns).toEqual([])
  })
  it('ignores revenue, expense and commission postings, which are not the team’s cost', () => {
    const m = podMargin(facts({ postings: [...facts().postings, { personId: null, kind: 'REVENUE', amountCents: 2_000_000, currency: 'USD' }, { personId: 'a', kind: 'COMMISSION', amountCents: -50_000, currency: 'USD' }] }))
    expect(m.marginCents).toBe(900_000)
  })
  it('counts a reversal against the posting it cancels', () => {
    const m = podMargin(facts({ postings: [...facts().postings, { personId: 'b', kind: 'PREMIUM', amountCents: 40_000, currency: 'USD' }] }))
    expect(m.costCents).toBe(1_060_000)
  })
  it('is null before anything is accepted, and says so', () => {
    const m = podMargin(facts({ milestones: [{ amountCents: 1_000_000, status: 'PENDING' }, { amountCents: 500_000, status: 'DELIVERED' }, { amountCents: 500_000, status: 'REJECTED' }] }))
    expect(m.marginCents).toBeNull()
    expect(m.unknowns).toEqual(['No deliverable has been accepted yet, so nothing is earned.'])
  })
  it('is null when a member has no pay record, naming her', () => {
    const m = podMargin(facts({ postings: facts().postings.filter((p) => p.personId !== 'b') }))
    expect(m.marginCents).toBeNull()
    expect(m.costCents).toBeNull()
    expect(m.unknowns).toEqual(['Bram has no pay record on this project, so her cost is not known.'])
  })
  it('treats a pay record that was reversed to nothing as no pay record', () => {
    const m = podMargin(facts({ postings: [...facts().postings, { personId: 'b', kind: 'PAY', amountCents: 400_000, currency: 'USD' }] }))
    expect(m.marginCents).toBeNull()
  })
  it('is null when the cost is zero, because a hundred per cent margin is a missing link', () => {
    const m = podMargin(facts({ members: [], postings: [] }))
    expect(m.marginCents).toBeNull()
    expect(m.unknowns[0]).toContain('cost of this project is zero')
  })
  it('is null when costs are posted in another currency, since rupees and dollars are never added', () => {
    const m = podMargin(facts({ postings: [...facts().postings, { personId: 'b', kind: 'PAY', amountCents: -100, currency: 'INR' }] }))
    expect(m.marginCents).toBeNull()
    expect(m.unknowns[0]).toContain('two currencies are never added')
  })
  it('names every unknown at once rather than the first', () => {
    const m = podMargin(facts({ milestones: [], postings: [] }))
    expect(m.unknowns.length).toBe(3)
  })
  it('keeps the accepted revenue as a fact even where the margin is null', () => {
    expect(podMargin(facts({ postings: [] })).earnedRevenueCents).toBe(2_000_000)
  })
})
