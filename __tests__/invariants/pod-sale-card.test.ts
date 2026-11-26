import { describe, it, expect } from 'vitest'
import { TWIN_ACTS, isActOf } from '@/lib/autonomy'
import { defaultContractFor, tierIn } from '@/lib/twin/role-contract'
import { namedPersonOf } from '@/lib/twin/ledger'
import { PERFORMERS } from '@/lib/twin/performers'
import { SALE_KINDS } from '@/lib/money/pod-sale'
import { podSaleFromPayload, CARD_SALE_KINDS } from '@/lib/twin/pod-sale-card'

const payload = {
  podId: 'p1', sellerCompanyId: 's1', clientCompanyId: 'c1', acceptorPersonId: 'a1', currency: 'USD', kind: 'MILESTONE', priceCents: 200,
  deliverables: [{ name: 'Stage 1', amountCents: 100, dueOn: '2026-12-01T00:00:00.000Z' }, { name: 'Stage 2', amountCents: 100, dueOn: null }],
}

describe('the team sale card on the one approval route', () => {
  it('accepting a sold team is an act the client’s twin asks about and the supplier’s twin never does', () => {
    expect(isActOf('PROGRAM_MANAGER', 'pod.sale.accept')).toBe(true)
    expect(isActOf('SUPPLIER', 'pod.sale.accept')).toBe(false)
  })
  it('accepting a sold team needs a person’s yes on the shipped contract and can never be done alone', () => {
    expect(tierIn(defaultContractFor('PROGRAM_MANAGER'), 'pod.sale.accept')).toBe('NEEDS_APPROVAL')
    expect(TWIN_ACTS['pod.sale.accept']).toMatchObject({ money: true, external: true, floor: false })
  })
  it('the act names the one person who answers it, and that act has a performer that checks who is answering', () => {
    expect(TWIN_ACTS['pod.sale.accept'].namedPerson).toBe('acceptorPersonId')
    expect(PERFORMERS['pod.sale.accept'].checkWho).toBeTypeOf('function')
  })
  it('a question names her only where the act names a person, and a card with no person named is nobody’s', () => {
    expect(namedPersonOf('pod.sale.accept', payload)).toBe('a1')
    expect(namedPersonOf('pod.sale.accept', {})).toBe('')
    expect(namedPersonOf('invoice_receipt.pay', payload)).toBeNull()
  })
  it('the sale a card asks for is read back whole, with its due dates as dates', () => {
    const sale = podSaleFromPayload(payload)
    expect(sale).toMatchObject({ podId: 'p1', acceptorPersonId: 'a1', priceCents: 200 })
    expect(sale?.deliverables[0].dueOn).toEqual(new Date('2026-12-01T00:00:00.000Z'))
    expect(sale?.deliverables[1].dueOn).toBeNull()
  })
  it('the card offers exactly the kinds of sale the sale writer knows', () => {
    expect([...CARD_SALE_KINDS]).toEqual([...SALE_KINDS])
  })
  it('a card with a missing field or a broken deliverable is not read as a sale', () => {
    expect(podSaleFromPayload({ ...payload, podId: undefined })).toBeNull()
    expect(podSaleFromPayload({ ...payload, priceCents: 0 })).toBeNull()
    expect(podSaleFromPayload({ ...payload, deliverables: [{ name: 'x', amountCents: 'a' }] })).toBeNull()
    expect(podSaleFromPayload(null)).toBeNull()
  })
})
