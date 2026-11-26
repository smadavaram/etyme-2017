import { describe, it, expect } from 'vitest'
import { saleRefusal, type SaleFacts, type SellPodInput } from '@/lib/money/pod-sale'

/** Record 120, pods: the sale's refusals, one sentence each, no database. */

const input = (o: Partial<SellPodInput> = {}): SellPodInput => ({
  podId: 'pod1', sellerCompanyId: 'seller', clientCompanyId: 'client', acceptorPersonId: 'acc', projectName: 'Data platform build', kind: 'MILESTONE',
  priceCents: 3_000_000, currency: 'USD', decidedBy: 'acc',
  deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date('2027-01-15') })),
  ...o,
})
const facts = (o: Partial<SaleFacts> = {}): SaleFacts => ({
  pod: { companyId: 'seller', name: 'Data team', currency: 'USD', archivedAt: null },
  members: [{ personId: 'm1', name: 'Ada', verdict: { ok: true, kind: 'EMPLOYEE' } }],
  acceptor: { name: 'Marcus', atClient: true, atSeller: false, onTheTeam: false },
  decidedByAtClient: true,
  ...o,
})

describe('a team sale is written only when every rule holds', () => {
  it('a milestone sale of three deliverables adding up to the price is allowed', () => {
    expect(saleRefusal(input(), facts())).toBeNull()
  })
  it('a fixed price may be one deliverable that is the whole price', () => {
    expect(saleRefusal(input({ kind: 'FIXED_PRICE', deliverables: [{ name: 'The whole job', amountCents: 3_000_000, dueOn: null }] }), facts())).toBeNull()
  })
  it('deliverables that do not add up to the price are refused, naming both figures', () => {
    const r = saleRefusal(input({ deliverables: [{ name: 'Stage 1', amountCents: 1_000_000, dueOn: null }] }), facts())
    expect(r?.says).toContain('1000000 cents')
    expect(r?.says).toContain('3000000 cents')
  })
  it('a deliverable worth nothing is refused', () => {
    expect(saleRefusal(input({ deliverables: [{ name: 'A', amountCents: 0, dueOn: null }, { name: 'B', amountCents: 3_000_000, dueOn: null }] }), facts())?.field).toBe('deliverables')
  })
  it('a milestone sale with no deliverables is refused', () => {
    expect(saleRefusal(input({ deliverables: [] }), facts())?.says).toBe('Add at least one deliverable.')
  })
  it('a time-and-materials sale that lists deliverables is refused with a sentence', () => {
    const r = saleRefusal(input({ kind: 'TIME_AND_MATERIALS' }), facts())
    expect(r?.says).toBe('A time-and-materials team bills hours and has no deliverables. Sell it on milestones or a fixed price to list deliverables.')
  })
  it('a time-and-materials sale with no deliverables is allowed', () => {
    expect(saleRefusal(input({ kind: 'TIME_AND_MATERIALS', deliverables: [] }), facts())).toBeNull()
  })
  it('a price that is not whole cents above zero is refused', () => {
    expect(saleRefusal(input({ priceCents: 10.5 }), facts())?.field).toBe('priceCents')
    expect(saleRefusal(input({ priceCents: 0 }), facts())?.field).toBe('priceCents')
  })
  it('a sale in another currency than the team is priced in is refused, so two currencies never mix', () => {
    expect(saleRefusal(input({ currency: 'INR' }), facts())?.says).toContain('Two currencies are never mixed')
  })
  it('a team that is not the seller’s own is refused', () => {
    expect(saleRefusal(input(), facts({ pod: { companyId: 'other', name: 'X', currency: 'USD', archivedAt: null } }))?.field).toBe('podId')
  })
  it('a deactivated team is refused', () => {
    expect(saleRefusal(input(), facts({ pod: { companyId: 'seller', name: 'Data team', currency: 'USD', archivedAt: new Date() } }))?.says).toContain('deactivated')
  })
  it('a team with nobody on it is refused', () => {
    expect(saleRefusal(input(), facts({ members: [] }))?.says).toContain('nobody on it')
  })
  it('a member who no longer passes the roster rule stops the sale, in the roster rule’s own sentence', () => {
    const r = saleRefusal(input(), facts({ members: [{ personId: 'm1', name: 'Ada', verdict: { ok: false, says: 'Ada took her bench listing back, so she cannot join a team.' } }] }))
    expect(r?.says).toBe('Ada took her bench listing back, so she cannot join a team.')
  })
  it('an acceptor who is on the team is refused', () => {
    expect(saleRefusal(input(), facts({ acceptor: { name: 'Ada', atClient: true, atSeller: false, onTheTeam: true } }))?.says).toContain('is on the team')
  })
  it('an acceptor who holds a seat at the selling firm is refused', () => {
    expect(saleRefusal(input(), facts({ acceptor: { name: 'Sam', atClient: true, atSeller: true, onTheTeam: false } }))?.says).toContain('selling firm')
  })
  it('an acceptor with no seat at the client is refused', () => {
    expect(saleRefusal(input(), facts({ acceptor: { name: 'Pat', atClient: false, atSeller: false, onTheTeam: false } }))?.says).toContain('does not hold a seat at the client')
  })
  it('a yes from somebody who is not at the client is refused', () => {
    expect(saleRefusal(input(), facts({ decidedByAtClient: false }))?.field).toBe('decidedBy')
  })
  it('a firm cannot sell a team to itself', () => {
    expect(saleRefusal(input({ clientCompanyId: 'seller' }), facts())?.says).toBe('A firm cannot sell a team to itself.')
  })
  it('a sale with no project name is refused with the sentence that shows how to name it', () => {
    for (const projectName of ['', '   ']) {
      const r = saleRefusal(input({ projectName }), facts())
      expect(r?.field).toBe('projectName')
      expect(r?.says).toContain('Name the project as your client would')
      expect(r?.says).toContain('Data platform build')
    }
  })
  it('a project name that contains the word pod is refused, in any case, alone or plural', () => {
    for (const projectName of ['Data pod', 'The POD for Nike', 'Pods build']) {
      expect(saleRefusal(input({ projectName }), facts())?.field).toBe('projectName')
    }
  })
  it('a project name that merely contains the letters pod inside another word is allowed', () => {
    expect(saleRefusal(input({ projectName: 'Podium analytics build' }), facts())).toBeNull()
  })
})
