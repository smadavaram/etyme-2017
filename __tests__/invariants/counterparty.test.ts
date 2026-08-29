/**
 * Who a firm works with, and as what.
 *
 * Partnership — the model this replaces — was symmetric, untyped, and
 * never written by anything in the product's life. These tests pin the
 * replacement to the reasons it exists.
 */

import { describe, it, expect } from 'vitest'
import { register, mayRemove, RELATIONSHIPS } from '@/lib/counterparty'

describe('The register is typed, because Wipro is not a fact about a relationship', () => {

  it('carries what each relationship means, in one sentence', () => {
    expect(RELATIONSHIPS.PRIME.means).toContain('our work flows through them')
    expect(RELATIONSHIPS.CLIENT.means).toContain('Our invoices go to them')
  })

  it('one firm may be a client and a prime at once, as two rows', () => {
    const rows = register('me', [
      { otherCompanyId: 'infosys', otherCompanyName: 'Infosys', relationship: 'CLIENT', status: 'ACTIVE' },
      { otherCompanyId: 'infosys', otherCompanyName: 'Infosys', relationship: 'PRIME', status: 'ACTIVE' },
    ], [])
    expect(rows).toHaveLength(2)
  })
})

describe('Agreements prove relationships, the register does not repeat them', () => {

  it('an MSA where we are the vendor makes the other side a client', () => {
    const rows = register('me', [], [{ vendorId: 'me', clientId: 'terumo', otherName: 'Terumo' }])
    expect(rows[0].relationship).toBe('CLIENT')
    expect(rows[0].hasAgreement).toBe(true)
  })

  it('an MSA where we are the client makes the other side a supplier', () => {
    const rows = register('me', [], [{ vendorId: 'acme', clientId: 'me', otherName: 'Acme' }])
    expect(rows[0].relationship).toBe('SUPPLIER')
  })

  it('a prospect exists on the register before any agreement does', () => {
    // Requiring an MSA first would mean the register only records
    // relationships after they stop needing recording.
    const rows = register('me', [
      { otherCompanyId: 'nike', otherCompanyName: 'Nike', relationship: 'CLIENT', status: 'PROSPECT' },
    ], [])
    expect(rows[0].says).toContain('no agreement yet')
  })

  it('a register row and an agreement for the same pair are one row, not two', () => {
    const rows = register('me',
      [{ otherCompanyId: 'terumo', otherCompanyName: 'Terumo', relationship: 'CLIENT', status: 'ACTIVE' }],
      [{ vendorId: 'me', clientId: 'terumo', otherName: 'Terumo' }])
    expect(rows).toHaveLength(1)
    expect(rows[0].hasAgreement).toBe(true)
  })

  it('BLOCKED on the register blocks, agreement or no agreement', () => {
    // An agreement proves you trade, not that you still want to.
    const rows = register('me',
      [{ otherCompanyId: 'terumo', otherCompanyName: 'Terumo', relationship: 'CLIENT', status: 'BLOCKED' }],
      [{ vendorId: 'me', clientId: 'terumo', otherName: 'Terumo' }])
    expect(rows[0].status).toBe('BLOCKED')
    expect(rows[0].says).toContain('Nothing moves between you')
  })
})

describe('A counterparty with anything live between you cannot be removed', () => {

  it('live contracts block removal and say what to do instead', () => {
    const v = mayRemove(3, 0)
    expect(v.may).toBe(false)
    expect(v.says).toContain('removing the register row would only hide them')
  })

  it('unpaid invoices block it too', () => {
    expect(mayRemove(0, 2).says).toContain('Settle or write off')
  })

  it('a clean pair may be removed, and dormant is offered as the history-keeping way', () => {
    const v = mayRemove(0, 0)
    expect(v.may).toBe(true)
    expect(v.says).toContain('DORMANT')
  })
})
