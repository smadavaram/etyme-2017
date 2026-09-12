import { describe, it, expect } from 'vitest'
import {
  REJECTION_REASONS,
  acceptanceGap,
  decodeRejection,
  encodeRejection,
  humanNote,
  isRejectionReason,
  lateness,
  mayDecide,
  mayDecideAs,
  mayDeliver,
  mayDeliverAs,
  standing,
  type Milestone,
} from '@/app/api/program/milestones/acceptance'
import { mayBill } from '@/lib/billing-plan'

function ms(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm1',
    name: 'Phase two sign-off',
    amountCents: 4_000_000,
    dueOn: new Date('2026-03-31'),
    acceptedAt: null,
    deliveredAt: null,
    status: 'PENDING',
    ...over,
  }
}

const NOW = new Date('2026-04-15')

// ── Handing it over ───────────────────────────────────────────────────

describe('Submitting a deliverable for acceptance', () => {
  it('a milestone nobody has handed over yet can be submitted for acceptance', () => {
    const move = mayDeliver(ms())
    expect(move.ok).toBe(true)
    expect(move.status).toBe('DELIVERED')
  })

  it('a milestone already submitted for acceptance cannot be submitted again', () => {
    const move = mayDeliver(ms({ status: 'DELIVERED' }))
    expect(move.ok).toBe(false)
    expect(move.says).toContain('already with the client')
  })

  it('a cancelled milestone cannot be submitted as delivered', () => {
    expect(mayDeliver(ms({ status: 'CANCELLED' })).ok).toBe(false)
  })

  it('an invoiced milestone cannot be delivered, accepted or rejected again', () => {
    expect(mayDeliver(ms({ status: 'INVOICED' })).ok).toBe(false)
    expect(mayDecide(ms({ status: 'INVOICED' }), { accept: true }).ok).toBe(false)
    expect(
      mayDecide(ms({ status: 'INVOICED' }), { accept: false, reason: 'QUALITY' }).ok
    ).toBe(false)
  })

  it('a rejected milestone can be delivered again', () => {
    const move = mayDeliver(ms({ status: 'REJECTED' }))
    expect(move.ok).toBe(true)
    expect(move.status).toBe('DELIVERED')
  })
})

// ── The client's answer ───────────────────────────────────────────────

describe('The client accepting or rejecting what was delivered', () => {
  it('a milestone can only be accepted after somebody said it was delivered', () => {
    const move = mayDecide(ms({ status: 'PENDING' }), { accept: true })
    expect(move.ok).toBe(false)
    expect(move.says).toContain('not been submitted for acceptance')
  })

  it('a delivered milestone is accepted and becomes billable from that day', () => {
    const move = mayDecide(ms({ status: 'DELIVERED' }), { accept: true })
    expect(move.ok).toBe(true)
    expect(move.status).toBe('ACCEPTED')
  })

  it('a rejection with no reason code is refused, because a rejection with no reason is a state change carrying no information', () => {
    const move = mayDecide(ms({ status: 'DELIVERED' }), { accept: false })
    expect(move.ok).toBe(false)
    expect(move.says).toContain('Say why')
  })

  it('a rejection reason outside the closed list is refused', () => {
    const move = mayDecide(ms({ status: 'DELIVERED' }), { accept: false, reason: 'DID_NOT_LIKE_IT' })
    expect(move.ok).toBe(false)
    expect(move.says).toContain('not one of the reasons')
  })

  it('a rejection with a reason from the list is recorded and names it', () => {
    const move = mayDecide(ms({ status: 'DELIVERED' }), { accept: false, reason: 'EVIDENCE_MISSING' })
    expect(move.ok).toBe(true)
    expect(move.status).toBe('REJECTED')
    expect(move.says).toContain('no evidence')
  })

  it('an accepted milestone is not reversed by a rejection, because that is a credit note', () => {
    const move = mayDecide(ms({ status: 'ACCEPTED', acceptedAt: NOW }), {
      accept: false,
      reason: 'QUALITY',
    })
    expect(move.ok).toBe(false)
    expect(move.says).toContain('credit note')
  })

  it('every rejection reason offered is one the checker accepts', () => {
    for (const r of REJECTION_REASONS) expect(isRejectionReason(r.code)).toBe(true)
    expect(isRejectionReason('WHATEVER')).toBe(false)
  })
})

// ── Who may do what ───────────────────────────────────────────────────

describe('The two sides of a milestone', () => {
  const sides = { sellerCompanyId: 'vendor', clientCompanyIds: ['client', 'shared-services'] }

  it('only the firm doing the work may hand a milestone over', () => {
    expect(mayDeliverAs('vendor', sides).ok).toBe(true)
    expect(mayDeliverAs('client', sides).ok).toBe(false)
    expect(mayDeliverAs(null, sides).ok).toBe(false)
  })

  it('only the client paying for it may accept or reject it, because an acceptance signed by the seller is worth nothing', () => {
    expect(mayDecideAs('client', sides).ok).toBe(true)
    const seller = mayDecideAs('vendor', sides)
    expect(seller.ok).toBe(false)
    expect(seller.says).toContain('worth nothing')
  })

  it('a client billed through a shared service centre is still the client', () => {
    expect(mayDecideAs('shared-services', sides).ok).toBe(true)
  })

  it('a firm that is neither side of the order is told so plainly', () => {
    expect(mayDecideAs('somebody-else', sides).says).toContain('not a party')
  })
})

// ── Billability ───────────────────────────────────────────────────────

describe('What makes a milestone billable', () => {
  it('acceptance is what makes a milestone billable, not the date it was due', () => {
    const overdueAndUnaccepted = mayBill(
      { id: 'm1', name: 'Phase two', amountCents: 1000, dueOn: new Date('2026-01-01'), acceptedAt: null, status: 'DELIVERED' },
      NOW
    )
    expect(overdueAndUnaccepted.ok).toBe(false)
    expect(overdueAndUnaccepted.says).toContain('Late, not billable')

    const accepted = mayBill(
      { id: 'm1', name: 'Phase two', amountCents: 1000, dueOn: new Date('2026-05-01'), acceptedAt: new Date('2026-04-02'), status: 'ACCEPTED' },
      NOW
    )
    expect(accepted.ok).toBe(true)
  })
})

// ── The gap ───────────────────────────────────────────────────────────

describe('The gap between handing it over and being paid attention to', () => {
  it('the gap between delivery and acceptance is counted in days once both are known', () => {
    const g = acceptanceGap(
      ms({ status: 'ACCEPTED', deliveredAt: new Date('2026-04-01'), acceptedAt: new Date('2026-04-25') }),
      NOW
    )
    expect(g.days).toBe(24)
    expect(g.unknowns).toEqual([])
    expect(g.says).toContain('24 days')
  })

  it('a milestone delivered and unanswered keeps counting up to today', () => {
    const g = acceptanceGap(ms({ status: 'DELIVERED', deliveredAt: new Date('2026-04-01') }), NOW)
    expect(g.days).toBe(14)
    expect(g.says).toContain('with the client 14 days')
  })

  it('the gap is returned as null, with the reason stated, while no delivery date is stored', () => {
    const g = acceptanceGap(ms({ status: 'DELIVERED', deliveredAt: null }), NOW)
    expect(g.days).toBeNull()
    expect(g.unknowns).toEqual(['No delivery date is stored, so the wait cannot be measured.'])
  })

  it('a milestone nobody handed over has no wait to report and no missing data to complain about', () => {
    const g = acceptanceGap(ms({ status: 'PENDING' }), NOW)
    expect(g.days).toBeNull()
    expect(g.unknowns).toEqual([])
    expect(g.says).toContain('not been handed over')
  })

  it('an acceptance backdated behind the delivery reads as no wait rather than a negative one', () => {
    const g = acceptanceGap(
      ms({ status: 'ACCEPTED', deliveredAt: new Date('2026-04-10'), acceptedAt: new Date('2026-04-02') }),
      NOW
    )
    expect(g.days).toBe(0)
  })
})

// ── Where the money is ────────────────────────────────────────────────

describe('Where the money on an order is actually sitting', () => {
  const set: Milestone[] = [
    ms({ id: 'a', amountCents: 1_000_000, status: 'ACCEPTED', acceptedAt: new Date('2026-04-02'), deliveredAt: new Date('2026-03-20') }),
    ms({ id: 'b', amountCents: 2_000_000, status: 'DELIVERED', deliveredAt: new Date('2026-04-05') }),
    ms({ id: 'c', amountCents: 3_000_000, status: 'PENDING' }),
    ms({ id: 'd', amountCents: 500_000, status: 'REJECTED' }),
    ms({ id: 'e', amountCents: 900_000, status: 'CANCELLED' }),
    ms({ id: 'f', amountCents: 700_000, status: 'INVOICED', acceptedAt: new Date('2026-02-01') }),
  ]

  it('money waiting on somebody s signature is totalled apart from money nobody has delivered', () => {
    const s = standing(set, NOW)
    expect(s.awaitingAcceptanceCents).toBe(2_000_000)
    expect(s.notDeliveredCents).toBe(3_000_000)
    expect(s.billableCents).toBe(1_000_000)
    expect(s.rejectedCents).toBe(500_000)
  })

  it('cancelled and already invoiced milestones are counted nowhere', () => {
    const s = standing(set, NOW)
    const totalled =
      s.awaitingAcceptanceCents + s.notDeliveredCents + s.billableCents + s.rejectedCents
    expect(totalled).toBe(6_500_000)
  })

  it('the average wait is stated where a delivery date exists and left null where none does', () => {
    expect(standing(set, NOW).averageWaitDays).toBe(10)
    const blind = standing([ms({ status: 'DELIVERED', deliveredAt: null })], NOW)
    expect(blind.averageWaitDays).toBeNull()
    expect(blind.says).toContain('nothing records')
  })

  it('an order with nothing outstanding says so rather than showing four zeroes', () => {
    expect(standing([], NOW).says).toBe('Nothing outstanding on this order.')
  })
})

// ── Lateness ──────────────────────────────────────────────────────────

describe('Whose fault a late milestone is', () => {
  it('a milestone past its due date that nobody delivered is late on us, not on the client', () => {
    const l = lateness(ms({ status: 'PENDING', dueOn: new Date('2026-04-01') }), NOW)
    expect(l.late).toBe(true)
    expect(l.onUs).toBe(true)
    expect(l.days).toBe(14)
    expect(l.says).toContain('nobody has handed it over')
  })

  it('a milestone delivered on time and sitting with the client is late on them', () => {
    const l = lateness(ms({ status: 'DELIVERED', dueOn: new Date('2026-04-01') }), NOW)
    expect(l.late).toBe(true)
    expect(l.onUs).toBe(false)
    expect(l.says).toContain('sitting with the client')
  })

  it('a milestone already accepted is never late, whatever its date said', () => {
    const l = lateness(ms({ status: 'ACCEPTED', acceptedAt: NOW, dueOn: new Date('2026-01-01') }), NOW)
    expect(l.late).toBe(false)
  })

  it('a milestone with no due date cannot be late', () => {
    expect(lateness(ms({ dueOn: null }), NOW).late).toBe(false)
  })
})

// ── The stopgap, named ────────────────────────────────────────────────

describe('The rejection reason, until OrderMilestone has a column for it', () => {
  it('a rejection reason survives a round trip through the note field until the column exists', () => {
    const encoded = encodeRejection('SCOPE_INCOMPLETE', 'Section 4 of the report is missing.')
    const back = decodeRejection(encoded)
    expect(back?.reason).toBe('SCOPE_INCOMPLETE')
    expect(back?.note).toBe('Section 4 of the report is missing.')
  })

  it('a rejection reason with no note beside it still reads back', () => {
    expect(decodeRejection(encodeRejection('LATE', null))?.reason).toBe('LATE')
    expect(decodeRejection(encodeRejection('LATE', '  '))?.note).toBeNull()
  })

  it('a note written by a human is not mistaken for a rejection reason', () => {
    expect(decodeRejection('Client asked for an extra week.')).toBeNull()
    expect(decodeRejection('[REJECTED:NOT_A_REAL_CODE] whatever')).toBeNull()
    expect(decodeRejection(null)).toBeNull()
  })

  it('the human part of a note is shown without the machine prefix in front of it', () => {
    expect(humanNote(encodeRejection('QUALITY', 'Two defects open.'))).toBe('Two defects open.')
    expect(humanNote('Just a note.')).toBe('Just a note.')
    expect(humanNote(encodeRejection('QUALITY', null))).toBeNull()
    expect(humanNote(null)).toBeNull()
  })
})
