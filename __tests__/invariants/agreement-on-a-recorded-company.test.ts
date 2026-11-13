import { describe, it, expect } from 'vitest'
import { mayRecordAgreement, AGREEMENT_UNKNOWN_FIRM_SAYS } from '@/lib/money/agreement-record'
import { mayWriteOrder } from '@/lib/off-system'
import type { HeldWith } from '@/lib/counterparty'

/**
 * A company recorded on a firm's Companies list (founder, 2026-11-12) is
 * that firm's own note of a company. An agreement names a client and a
 * supplier, so it is one more place a position can be given; it reads the
 * register the way a contract line and an order do (review, 2026-11-13).
 */

const me = { id: 'tapin', name: 'Tapin' }
const at = new Date('2026-01-04')

/** A company the caller recorded itself, given a Kind later and no position. */
const recorded = { id: 'lumen', name: 'Lumen Freight', claimedAt: null, listedById: 'tapin', kind: 'CLIENT' }
const noPosition: HeldWith = { positions: [], notClassified: true, recorded: true }
const asCustomer: HeldWith = { positions: ['CUSTOMER'], notClassified: false, recorded: true }
const asSupplier: HeldWith = { positions: ['SUPPLIER'], notClassified: false, recorded: true }

describe('an agreement on a company somebody recorded', () => {
  it('an agreement is never recorded against another firm’s record of a company', () => {
    const theirs = { id: 'quarry', name: 'Quarry Logistics', claimedAt: null, listedById: 'brightmoor', kind: 'VENDOR' }
    const v = mayRecordAgreement({
      caller: me, other: theirs, callerSells: true, relationshipExists: false, worksTogether: false, held: null, existing: null,
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      // The sentence an id that is not on Etyme at all gets: nothing in it
      // says another firm holds a record of this company, or its name.
      expect(v.says).toBe(AGREEMENT_UNKNOWN_FIRM_SAYS)
      expect(v.unknown).toBe(true)
      expect(v.says).not.toContain('Quarry')
      expect(v.says).not.toMatch(/another firm|register/i)
    }
    const nobody = mayRecordAgreement({ caller: me, other: null, callerSells: true, relationshipExists: false, existing: null })
    expect(!nobody.ok && nobody.says).toBe(AGREEMENT_UNKNOWN_FIRM_SAYS)

    // Even where the caller wrote its own register row naming it: a row
    // one firm writes alone is not work between the two.
    const ownRowOnly = mayRecordAgreement({
      caller: me, other: theirs, callerSells: false, relationshipExists: true, worksTogether: false, held: null, existing: null,
    })
    expect(ownRowOnly.ok).toBe(false)

    // Where real work lies between them (an agreement, an order, a line, a
    // job sent, a link the other side said yes to), it is recorded as before.
    const trading = mayRecordAgreement({
      caller: me, other: theirs, callerSells: true, relationshipExists: true, worksTogether: true, held: null, existing: null,
    })
    expect(trading.ok).toBe(true)
  })

  it('a company not classified yet is named on an agreement only once it is extended, and the refusal names the step', () => {
    const unclassified = { ...recorded, kind: 'UNCLASSIFIED' }
    const asClient = mayRecordAgreement({
      caller: me, other: unclassified, callerSells: true, relationshipExists: false, held: noPosition, existing: null,
    })
    expect(asClient.ok).toBe(false)
    if (!asClient.ok) {
      expect(asClient.says).toBe('Lumen Freight is on your Companies list and is not classified yet. Extend it to Customer first.')
      expect(asClient.unknown).toBeFalsy()
    }
    const asSeller = mayRecordAgreement({
      caller: me, other: unclassified, callerSells: false, relationshipExists: false, held: noPosition, existing: null,
    })
    expect(!asSeller.ok && asSeller.says).toBe('Lumen Freight is on your Companies list and is not classified yet. Extend it to Supplier first.')

    // A Kind given since is not a position: the register decides.
    const givenAKind = mayRecordAgreement({
      caller: me, other: recorded, callerSells: true, relationshipExists: false, held: noPosition, existing: null,
    })
    expect(givenAKind.ok).toBe(false)

    // Extended to Customer: it may be the client on an agreement, and not
    // yet the supplier on one.
    const extended = mayRecordAgreement({
      caller: me, other: unclassified, callerSells: true, relationshipExists: true, held: asCustomer, existing: null,
    })
    expect(extended.ok).toBe(true)
    const wrongWay = mayRecordAgreement({
      caller: me, other: unclassified, callerSells: false, relationshipExists: true, held: asCustomer, existing: null,
    })
    expect(!wrongWay.ok && wrongWay.says).toBe('Lumen Freight is on your Companies list but is not your supplier yet. Extend it to Supplier first.')

    // Extended to Supplier: it may be the supplier.
    const supplier = mayRecordAgreement({
      caller: me, other: unclassified, callerSells: false, relationshipExists: true, held: asSupplier, existing: null,
    })
    expect(supplier.ok).toBe(true)
  })

  it('a firm on Etyme keeps the rule it had: an agreement only where the two already trade', () => {
    const onEtyme = { id: 'cs', name: 'Computer Systems', claimedAt: at, listedById: null, kind: 'VENDOR' }
    const v = mayRecordAgreement({ caller: me, other: onEtyme, callerSells: true, relationshipExists: false, held: null, existing: null })
    expect(!v.ok && v.says).toContain('do not trade here yet')
    const trading = mayRecordAgreement({ caller: me, other: onEtyme, callerSells: true, relationshipExists: true, held: null, existing: null })
    expect(trading.ok).toBe(true)
  })
})

describe('an order naming a company somebody recorded', () => {
  it('a recorded company given a Kind and no position is refused as the buyer and as the seller of an order', () => {
    // The caller sells, recording the order the company handed it.
    const asBuyer = mayWriteOrder({ callerCompanyId: me.id, buyer: recorded, seller: { ...me, kind: 'VENDOR', claimedAt: at, listedById: null }, buyerHeld: noPosition })
    expect(asBuyer.ok).toBe(false)
    expect(asBuyer.says).toBe('Lumen Freight is on your Companies list and is not classified yet. Extend it to Customer first.')

    // The caller buys, raising its own order to the company.
    const vendorKind = { ...recorded, kind: 'VENDOR' }
    const asSeller = mayWriteOrder({
      callerCompanyId: me.id, buyer: { ...me, kind: 'CLIENT', claimedAt: at, listedById: null }, seller: vendorKind,
      sellerStanding: 'SUPPLIER', sellerHeld: noPosition,
    })
    expect(asSeller.ok).toBe(false)
    expect(asSeller.says).toBe('Lumen Freight is on your Companies list and is not classified yet. Extend it to Supplier first.')

    // Extended, each goes through.
    const extendedBuyer = mayWriteOrder({ callerCompanyId: me.id, buyer: recorded, seller: { ...me, kind: 'VENDOR', claimedAt: at, listedById: null }, buyerHeld: asCustomer })
    expect(extendedBuyer.ok).toBe(true)
    const extendedSeller = mayWriteOrder({
      callerCompanyId: me.id, buyer: { ...me, kind: 'CLIENT', claimedAt: at, listedById: null }, seller: vendorKind,
      sellerStanding: 'SUPPLIER', sellerHeld: asSupplier,
    })
    expect(extendedSeller.ok).toBe(true)
  })
})
