import { describe, it, expect } from 'vitest'
import { offerRule, offerStateSays } from '@/lib/pods'

const good = {
  clientCompanyId: 'c1', acceptorEmail: ' Imogen@Client.Example ', kind: 'MILESTONE', priceCents: 3_000_000, currency: 'usd', projectName: 'Data platform build',
  deliverables: [{ name: 'Stage 1', amountCents: 1_000_000, dueOn: '2027-01-15' }, { name: 'Stage 2', amountCents: 2_000_000 }],
}
const says = (o: object) => { const r = offerRule({ ...good, ...o }); return r.ok ? null : `${r.field}: ${r.says}` }

describe('the supplier’s proposal, before any card is raised', () => {
  it('a whole proposal is read, with the address lowered and the currency capitalized', () => {
    const r = offerRule(good)
    expect(r.ok && r.offer).toMatchObject({ acceptorEmail: 'imogen@client.example', currency: 'USD', kind: 'MILESTONE' })
  })
  it('a proposal with no client is refused', () => { expect(says({ clientCompanyId: '' })).toMatch(/^clientCompanyId: Choose the client/) })
  it('a proposal that names no acceptor at the client is refused', () => { expect(says({ acceptorEmail: 'imogen' })).toMatch(/^acceptorEmail:/) })
  it('a proposal with a kind nobody sells is refused', () => { expect(says({ kind: 'RETAINER' })).toMatch(/^kind:/) })
  it('a price that is not whole cents above zero is refused', () => {
    expect(says({ priceCents: 10.5 })).toMatch(/^priceCents:/)
    expect(says({ priceCents: 0 })).toMatch(/^priceCents:/)
  })
  it('a project name that says pod is refused, because the client never reads that word', () => { expect(says({ projectName: 'Our pod build' })).toMatch(/^projectName:/) })
  it('deliverables that do not add up to the price are refused, with both figures', () => {
    expect(says({ priceCents: 3_000_001 })).toContain('add up to $30,000.00, and the price is $30,000.01')
  })
  it('a fixed price with no deliverable is refused', () => { expect(says({ kind: 'FIXED_PRICE', deliverables: [] })).toContain('Add at least one deliverable') })
  it('a fixed price may be one deliverable carrying the whole price', () => {
    expect(offerRule({ ...good, kind: 'FIXED_PRICE', deliverables: [{ name: 'The build', amountCents: 3_000_000 }] }).ok).toBe(true)
  })
  it('a time-and-materials proposal with deliverables is refused', () => { expect(says({ kind: 'TIME_AND_MATERIALS' })).toMatch(/^deliverables: A time-and-materials team bills hours/) })
  it('a time-and-materials proposal with none is read as it is', () => {
    expect(offerRule({ ...good, kind: 'TIME_AND_MATERIALS', deliverables: [] }).ok).toBe(true)
  })
  it('a due date that is not a date is refused', () => {
    expect(says({ deliverables: [{ name: 'Stage 1', amountCents: 3_000_000, dueOn: 'soon' }] })).toContain('not a date')
  })
})

describe('what the team’s row says about its offer', () => {
  it('an offer waiting reads offered to the client, waiting for the acceptor', () => {
    expect(offerStateSays({ client: 'Harrowgate Foods', acceptor: 'Imogen Daleford', decision: 'PENDING' })).toBe('Offered to Harrowgate Foods, waiting for Imogen Daleford')
  })
  it('a yes reads sold, and a no reads declined', () => {
    expect(offerStateSays({ client: 'Harrowgate Foods', acceptor: 'I', decision: 'APPROVED' })).toBe('Sold to Harrowgate Foods')
    expect(offerStateSays({ client: 'Harrowgate Foods', acceptor: 'I', decision: 'REJECTED' })).toBe('Declined by Harrowgate Foods')
  })
  it('a team never offered says nothing', () => { expect(offerStateSays(null)).toBeNull() })
})
