import { describe, it, expect } from 'vitest'
import { payerStanding, payerHeldSays, PAYMENT_WAITS_HOURS, type PayerRowRead, type OwnCheck } from '@/lib/money/pay-gate'

/**
 * Records 86 and 87, the rule with no database: a payer pays only the
 * account it pays and only on its own confirmation; a bank change waits
 * for this payer's call back and 72 hours after it. Made-up firms.
 */

const A = 'harborline-tech'
const B = 'eastfield-ops'
const FACTS = { bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC', accountLast4: '7730', routingLast4: '0021' }
const H = 60 * 60 * 1000

const own = (over: Partial<OwnCheck> = {}): OwnCheck => ({
  payerCompanyId: A, ...FACTS, checkedAt: new Date('2026-11-13T10:00:00Z'),
  callbackAt: null, callbackOutcome: null, bankChangeRequestId: null, ...over,
})
const read = (over: Partial<PayerRowRead> = {}): PayerRowRead => ({
  facts: { ...FACTS, verifiedAt: null, verifiedByCompanyId: null }, own: null, latestChange: null, ...over,
})

describe('whose check opens payment', () => {
  it("one customer's confirmation never lets another customer pay", () => {
    const r = read({ own: own() })
    expect(payerStanding(A, r, new Date())).toEqual({ open: true })
    // The same row, read for B: A's check is not B's.
    expect(payerStanding(B, r, new Date())).toEqual({ open: false, why: 'NOT_CHECKED' })
  })

  it('a supplier checked before today by a named customer is still paid by that customer', () => {
    const r = read({ facts: { ...FACTS, verifiedAt: new Date('2026-10-01T00:00:00Z'), verifiedByCompanyId: A } })
    expect(payerStanding(A, r, new Date())).toEqual({ open: true })
    expect(payerStanding(B, r, new Date())).toEqual({ open: false, why: 'NOT_CHECKED' })
  })

  it('an old check that names no customer lets nobody pay', () => {
    const r = read({ facts: { ...FACTS, verifiedAt: new Date('2026-10-01T00:00:00Z'), verifiedByCompanyId: null } })
    expect(payerStanding(A, r, new Date())).toEqual({ open: false, why: 'NOT_CHECKED' })
    expect(payerStanding(B, r, new Date())).toEqual({ open: false, why: 'NOT_CHECKED' })
  })

  it('a check of details that have since changed no longer opens payment', () => {
    expect(payerStanding(A, read({ own: own({ accountLast4: '4821' }) }), new Date())).toEqual({ open: false, why: 'NOT_CHECKED' })
  })
})

describe('a bank change', () => {
  const change = { id: 'chg-1', state: 'ENTERED' as const }
  const callback = new Date('2026-11-13T15:00:00Z') // a Friday, 3 PM

  it('a bank change holds payment until this customer confirms it and for 72 hours after', () => {
    // Entered, and nobody confirmed it.
    expect(payerStanding(A, read({ latestChange: change }), callback)).toEqual({ open: false, why: 'CHANGE_NOT_CONFIRMED' })
    // An old check of this payer's that answers no change does not confirm it.
    expect(payerStanding(A, read({ latestChange: change, own: own() }), callback)).toEqual({ open: false, why: 'CHANGE_NOT_CONFIRMED' })
    // Confirmed by call back: held for 72 hours, open from the 72nd.
    const confirmed = read({ latestChange: change, own: own({ bankChangeRequestId: change.id, callbackAt: callback, callbackOutcome: 'CONFIRMED' }) })
    const opens = new Date(callback.getTime() + 72 * H)
    expect(payerStanding(A, confirmed, new Date(opens.getTime() - 1))).toEqual({ open: false, why: 'WAITING_72_HOURS', payableFrom: opens })
    expect(payerStanding(A, confirmed, opens)).toEqual({ open: true })
    // B, which confirmed nothing, is still held.
    expect(payerStanding(B, confirmed, opens)).toEqual({ open: false, why: 'CHANGE_NOT_CONFIRMED' })
  })

  it('the 72 hours run on the clock from the recorded call back, so a Friday 3 PM call back opens payment Monday at 3 PM', () => {
    expect(PAYMENT_WAITS_HOURS).toBe(72)
    // The check was written a day before the call back; the call back decides.
    const r = read({ latestChange: change, own: own({ checkedAt: new Date('2026-11-12T15:00:00Z'), bankChangeRequestId: change.id, callbackAt: callback, callbackOutcome: 'CONFIRMED' }) })
    const s = payerStanding(A, r, callback)
    expect(s).toEqual({ open: false, why: 'WAITING_72_HOURS', payableFrom: new Date('2026-11-16T15:00:00Z') })
    expect(new Date('2026-11-16T15:00:00Z').getUTCDay()).toBe(1)
  })

  it('a check that answers a change without a call back that confirmed does not open payment', () => {
    for (const outcome of [null, 'DID_NOT_MATCH', 'NOT_REACHED'] as const) {
      const r = read({ latestChange: change, own: own({ bankChangeRequestId: change.id, callbackAt: callback, callbackOutcome: outcome }) })
      expect(payerStanding(A, r, new Date(callback.getTime() + 100 * H))).toMatchObject({ open: false })
    }
  })

  it("a change the supplier's Owner said was not theirs holds payment even where a customer confirmed it", () => {
    const r = read({ latestChange: { id: change.id, state: 'DISOWNED' }, own: own({ bankChangeRequestId: change.id, callbackAt: callback, callbackOutcome: 'CONFIRMED' }) })
    expect(payerStanding(A, r, new Date(callback.getTime() + 100 * H))).toEqual({ open: false, why: 'CHANGE_DISOWNED' })
  })
})

describe('what a held payment says', () => {
  const who = { by: 'FINANCE' as const, names: 'Imelda Santoro', payer: 'Harborline Tech' }

  it('a held change names who confirms it and that payment opens 72 hours after the call back', () => {
    expect(payerHeldSays('Northwind Staffing', { open: false, why: 'CHANGE_NOT_CONFIRMED' }, who)).toBe(
      'Northwind Staffing changed its bank details, so payment to Northwind Staffing is held. Imelda Santoro confirms the change with a call back. Payment opens 72 hours after that call back.',
    )
  })

  it('a confirmed change says the moment payment opens', () => {
    const says = payerHeldSays('Northwind Staffing', { open: false, why: 'WAITING_72_HOURS', payableFrom: new Date('2026-11-16T15:00:00Z') }, who)
    expect(says).toContain('Harborline Tech confirmed Northwind Staffing’s new bank details by call back.')
    expect(says).toContain('Nov 16')
    expect(says).toContain('3:00 PM UTC')
  })

  it('a firm with nobody who pays suppliers is told which role to give', () => {
    expect(payerHeldSays('Northwind Staffing', { open: false, why: 'CHANGE_NOT_CONFIRMED' }, { by: 'NOBODY', names: '', payer: 'Harborline Tech' }))
      .toContain('give a seat the AP Clerk or Finance role')
  })
})
