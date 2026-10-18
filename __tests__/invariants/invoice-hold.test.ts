import { describe, it, expect } from 'vitest'
import { holdInvoice, supplierToldSays } from '@/lib/money/invoice-hold'

/**
 * The payer's desk may hold an invoice receipt while it asks the supplier
 * something, with a reason, and nobody pays through the hold.
 */

const base = { payer: true, status: 'SUBMITTED', number: 'IN-JCFS6O-20260901', release: false, reason: 'Two days look like training', by: 'Dana Reyes' }

describe('an invoice receipt held with a reason cannot be paid until the hold is lifted, and the supplier is told why', () => {
  it('the payer holds a submitted invoice, and the sentence carries the reason', () => {
    const v = holdInvoice(base)
    expect(v).toEqual({ ok: true, to: 'HELD', reason: 'Two days look like training', says: 'Dana Reyes put invoice IN-JCFS6O-20260901 on hold: Two days look like training' })
  })

  it('a hold with no reason is refused, because the supplier and the next person on the desk will read it', () => {
    const v = holdInvoice({ ...base, reason: '   ' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('REASON_REQUIRED')
  })

  it('only the firm that pays may hold an invoice', () => {
    const v = holdInvoice({ ...base, payer: false })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toBe('Only the firm that pays invoice IN-JCFS6O-20260901 may hold it.')
  })

  it('an invoice not yet submitted, or already paid, cannot be held, and says why', () => {
    const early = holdInvoice({ ...base, status: 'ISSUED' })
    const paid = holdInvoice({ ...base, status: 'PAID' })
    expect(!early.ok && early.says).toBe('Invoice IN-JCFS6O-20260901 cannot be held: it has not been submitted, so nothing is due on it yet.')
    expect(!paid.ok && paid.says).toBe('Invoice IN-JCFS6O-20260901 cannot be held: it is already paid.')
  })

  it('lifting a hold returns the invoice to submitted, and lifting one that is not held is refused', () => {
    expect(holdInvoice({ ...base, status: 'HELD', release: true, reason: null })).toMatchObject({ ok: true, to: 'SUBMITTED' })
    expect(holdInvoice({ ...base, status: 'SUBMITTED', release: true })).toMatchObject({ ok: false, code: 'NOT_HELD' })
  })

  it('the supplier is told who held its bill and why, and that nothing is paid until the hold is lifted', () => {
    const t = supplierToldSays({ payerName: 'Northbend Athletic', number: 'IN-1', to: 'HELD', reason: 'Two days look like training' })
    expect(t.title).toBe('Northbend Athletic put bill IN-1 on hold')
    expect(t.body).toBe('Northbend Athletic put bill IN-1 on hold: Two days look like training. Nothing is paid on it until they lift the hold.')
  })

  it('the supplier reads the held document as its own bill, because the supplier issued it, and the lifted hold the same way', () => {
    const lifted = supplierToldSays({ payerName: 'Northbend Athletic', number: 'IN-1', to: 'SUBMITTED', reason: 'Supplier confirmed the days' })
    expect(lifted.title).toBe('Northbend Athletic lifted the hold on bill IN-1')
    expect(lifted.body).toBe('Northbend Athletic lifted the hold on bill IN-1: Supplier confirmed the days. It can be paid once it clears the check.')
    const held = supplierToldSays({ payerName: 'Northbend Athletic', number: 'IN-1', to: 'HELD', reason: 'x' })
    expect(`${held.title} ${held.body} ${lifted.title} ${lifted.body}`).not.toMatch(/invoice/i)
  })
})
