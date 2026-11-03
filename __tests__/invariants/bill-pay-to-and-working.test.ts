import { describe, it, expect } from 'vitest'
import { payToFor } from '@/lib/money/bill-generate'
import { payToSays } from '@/lib/money/pay-to-words'
import { readReceipt } from '@/lib/money/receipt-read'

/**
 * The screen walk, 2026-11-03: a bill generated from Bills carried no
 * pay-to, and a 44-hour week with four hours at a premium read
 * "44 h × $98/hr = $4,508.00", a sum that does not add up.
 */
describe('a bill says where it is paid and how each line was priced', () => {
  it('a bill names the firm’s payment details its payer checked, else the checked default, and none where nothing is checked', () => {
    const remits = [
      { id: 'default', isDefault: true, verifiedByCompanyId: 'other' },
      { id: 'northbend', isDefault: false, verifiedByCompanyId: 'northbend' },
    ]
    expect(payToFor(remits, 'northbend')).toBe('northbend')
    expect(payToFor(remits, 'cavanaugh')).toBe('default')
    expect(payToFor([], 'northbend')).toBeNull()
  })

  it('the pay-to reads as the name on the account, the bank and four digits, and says so where none is checked', () => {
    expect(payToSays({ legalName: 'Brightmoor Staffing LLC', accountName: null, bankName: 'Chase', accountLast4: '4821', paymentMethod: 'ACH' }))
      .toBe('Pay to Brightmoor Staffing LLC, Chase, account ending 4821, by ACH.')
    expect(payToSays(null)).toBe('No checked payment details are on this bill yet.')
  })

  it('a line with overtime at a premium never prints a multiplication that does not add up, and says how it was priced', () => {
    const line = {
      lineId: 'l', kind: 'HOURS' as const, personName: 'Lucía Fernández', jobTitle: null, periodStart: null, periodEnd: null,
      hoursBilled: 44, hoursSigned: 44, rateCents: 9_800, contractRateCents: 9_800, amountCents: 450_800,
    }
    const premium = readReceipt({ matched: true, checks: [], currency: 'USD', lines: [{ ...line, working: '40h at the usual rate, 4h at time and a half' }] })
    expect(premium.lines[0].says).toBe('44 h signed: 40h at the usual rate, 4h at time and a half, from $98/hr = $4,508.00')
    expect(premium.lines[0].says).not.toContain('×')
    const plain = readReceipt({ matched: true, checks: [], currency: 'USD', lines: [{ ...line, amountCents: 431_200 }] })
    expect(plain.lines[0].says).toBe('44 h signed × $98/hr = $4,312.00')
  })
})
