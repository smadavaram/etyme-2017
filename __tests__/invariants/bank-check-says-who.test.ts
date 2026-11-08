import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bankGate, bankNotChecked } from '@/lib/setup-gate-rules'

/**
 * A payment held for an unchecked bank says who checks it at the paying
 * firm, by name, from money's own reader (the founder's tester,
 * 2026-11-08: a firm with no Finance seat was told its Finance team checks).
 */
describe('a payment held for an unchecked bank says who checks it', () => {
  it('at a firm with a Finance seat, the refusal names the Finance person', () => {
    expect(bankNotChecked('Fenwick Staffing', { by: 'FINANCE', names: 'Imelda Santoro', payer: 'Brightmoor Staffing' }))
      .toBe('Pay Fenwick Staffing once its bank details are checked. Fenwick Staffing enters them under Setup → Bank details, and Imelda Santoro checks them before anybody pays.')
  })

  it('at a firm with no Finance seat, the refusal names the seat that pays, never a Finance team it does not have', () => {
    const says = bankNotChecked('Fenwick Staffing', { by: 'FALLBACK', names: 'Desmond Achebe or Jenna Okafor', payer: 'Brightmoor Staffing' })
    expect(says).toContain('Desmond Achebe or Jenna Okafor checks them')
    expect(says).not.toContain('Finance team')
  })

  it('at a firm where nobody pays suppliers yet, the refusal says which role to give', () => {
    const says = bankNotChecked('Fenwick Staffing', { by: 'NOBODY', names: 'Nobody', payer: 'Tapin' })
    expect(says).toContain('Nobody at Tapin pays suppliers yet')
    expect(says).toContain('AP Clerk or Finance role')
  })

  it('the gate carries the names into its sentence, and the payment gate asks money’s reader for them on a refusal', () => {
    expect(bankGate({ payee: 'Fenwick', remitVerified: false, walkBankState: null, who: { by: 'FINANCE', names: 'Imelda Santoro', payer: 'B' } }))
      .toMatchObject({ ok: false, step: 'BANK' })
    const src = readFileSync('src/lib/setup-gates.ts', 'utf8')
    expect(src).toContain("import('@/lib/money/bank-check-read')")
    expect(src).toContain('bankCheckers(await payerSeats(payerCompanyId))')
  })
})
