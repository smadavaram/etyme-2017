import { describe, it, expect } from 'vitest'
import { AUDIENCES, buildAudience, heldSays, type AudienceInput, type PoolContact } from '@/lib/outreach/audience-rules'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const company = (id: string, name: string, side: 'CUSTOMER' | 'SUPPLIER', standing: 'ACTIVE' | 'DORMANT' = 'DORMANT') =>
  ({ id, name, side, standing, lastActivity: d('2026-06-01') })
const person = (id: string, atCompanyId: string, o: Partial<PoolContact> = {}): PoolContact =>
  ({ id, atCompanyId, name: `Person ${id}`, email: `${id}@${atCompanyId}.example`, kind: 'OTHER', outreachOptOutAt: null, ...o })
const input = (o: Partial<AudienceInput> = {}): AudienceInput => ({
  audience: 'DORMANT_CUSTOMERS', contactKind: null, today: d('2026-11-25'),
  register: [company('orchid', 'Orchid Foods', 'CUSTOMER')], notClassified: [], contacts: [person('mina', 'orchid')],
  bounced: new Set(), lastWrittenTo: new Map(), ...o,
})

describe('who is in an outreach audience', () => {
  it('the audiences are dormant customers, all customers, dormant suppliers and all suppliers, each read from the firm’s own record', () => {
    expect([...AUDIENCES]).toEqual(['DORMANT_CUSTOMERS', 'ALL_CUSTOMERS', 'DORMANT_SUPPLIERS', 'ALL_SUPPLIERS'])
  })
  it('dormant customers leaves out customers with recent work and every supplier', () => {
    const out = buildAudience(input({
      register: [company('orchid', 'Orchid Foods', 'CUSTOMER'), company('busy', 'Busy Co', 'CUSTOMER', 'ACTIVE'), company('sup', 'Sup Ltd', 'SUPPLIER')],
      contacts: [person('mina', 'orchid'), person('bo', 'busy'), person('su', 'sup')],
    }))
    expect(out.to.map((t) => t.companyName)).toEqual(['Orchid Foods'])
  })
  it('a company marked Not classified is never in an outreach audience, and is listed as held with the step that fixes it', () => {
    const out = buildAudience(input({ audience: 'ALL_CUSTOMERS', notClassified: [{ id: 'maybe', name: 'Maybe Co' }], contacts: [person('mina', 'orchid'), person('mo', 'maybe')] }))
    expect(out.to.map((t) => t.atCompanyId)).toEqual(['orchid'])
    expect(out.held).toEqual([expect.objectContaining({ atCompanyId: 'maybe', reason: 'NOT_CLASSIFIED' })])
    expect(out.held[0].says).toMatch(/Not classified/)
    expect(out.held[0].says).toMatch(/Companies/)
  })
  it('a contact at a company not on the firm’s own register is never in an outreach audience', () => {
    const out = buildAudience(input({ contacts: [person('mina', 'orchid'), person('stray', 'elsewhere')] }))
    expect(out.to.map((t) => t.contactId)).toEqual(['mina'])
    expect(out.held).toEqual([])
  })
  it('one company gets one letter per batch however many contacts it has', () => {
    const out = buildAudience(input({ contacts: [person('a', 'orchid'), person('b', 'orchid'), person('c', 'orchid')] }))
    expect(out.to).toHaveLength(1)
  })
  it('a contact who unsubscribed is held with the reason “asked for no more outreach” and gets no letter', () => {
    const out = buildAudience(input({ contacts: [person('mina', 'orchid', { outreachOptOutAt: d('2026-10-01') })] }))
    expect(out.to).toEqual([])
    expect(out.held[0]).toMatchObject({ reason: 'OPTED_OUT' })
    expect(out.held[0].says).toMatch(/asked for no more outreach/)
  })
  it('a contact whose last letter bounced is held until a new address is recorded', () => {
    const out = buildAudience(input({ bounced: new Set(['mina@orchid.example']) }))
    expect(out.held[0]).toMatchObject({ reason: 'BOUNCED' })
    expect(out.held[0].says).toMatch(/new address/)
    const fixed = buildAudience(input({ bounced: new Set(['mina@orchid.example']), contacts: [person('mina', 'orchid', { email: 'mina@orchid-new.example' })] }))
    expect(fixed.to).toHaveLength(1)
  })
  it('a company with nobody recorded who has an email is held and told to add a contact', () => {
    const out = buildAudience(input({ contacts: [person('mina', 'orchid', { email: null })] }))
    expect(out.held[0]).toMatchObject({ reason: 'NO_CONTACT' })
    expect(out.held[0].says).toMatch(/Contacts/)
  })
  it('a company written to in the last 180 days is held with its last send date, and one written to 180 days ago is not', () => {
    const held = buildAudience(input({ lastWrittenTo: new Map([['orchid', d('2026-06-01')]]) }))
    expect(held.to).toEqual([])
    expect(held.held[0]).toMatchObject({ reason: 'COOLING_OFF', lastOn: d('2026-06-01') })
    expect(held.held[0].says).toMatch(/June 1, 2026/)
    expect(buildAudience(input({ lastWrittenTo: new Map([['orchid', d('2026-05-29')]]) })).to).toHaveLength(1)
  })
  it('narrowing to one kind of contact writes only to that kind, and holds a company that has none', () => {
    const out = buildAudience(input({ contactKind: 'PROCUREMENT', contacts: [person('a', 'orchid', { kind: 'HIRING_MANAGER' })] }))
    expect(out.to).toEqual([])
    expect(out.held[0]).toMatchObject({ reason: 'NO_CONTACT' })
    expect(buildAudience(input({ contactKind: 'PROCUREMENT', contacts: [person('a', 'orchid', { kind: 'PROCUREMENT' })] })).to).toHaveLength(1)
  })
  it('the sentence for each hold names the firm’s own next step', () => {
    for (const r of ['OPTED_OUT', 'BOUNCED', 'NO_CONTACT', 'NOT_CLASSIFIED', 'COOLING_OFF', 'NO_ADDRESS', 'NO_LINK'] as const) {
      expect(heldSays(r, 'Orchid Foods', null).length).toBeGreaterThan(20)
    }
  })
})
