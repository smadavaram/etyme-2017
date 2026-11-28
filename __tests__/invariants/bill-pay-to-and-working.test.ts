import { describe, it, expect } from 'vitest'
import { printedOnBill, firstPerFirm, PAY_TO_ORDER } from '@/lib/money/pay-to'
import { payToSays, PAY_TO_BEING_CONFIRMED, PAY_TO_NONE } from '@/lib/money/pay-to-words'
import { readReceipt } from '@/lib/money/receipt-read'

/**
 * The screen walk, 2026-11-03: a bill generated from Bills carried no
 * pay-to, and a 44-hour week with four hours at a premium read
 * "44 h × $98/hr = $4,508.00", a sum that does not add up.
 */
describe('a bill says where it is paid and how each line was priced', () => {
  it('a bill prints the firm’s default payment details only where they are checked, and never an older checked row in their place', () => {
    const at = new Date('2026-01-05T00:00:00Z')
    // Already in the pay-to order: the default first, then the first entered.
    const rows = [
      { companyId: 'f', id: 'new-default', isDefault: true, verifiedAt: null },
      { companyId: 'f', id: 'older-checked', isDefault: false, verifiedAt: at },
    ]
    expect(PAY_TO_ORDER[0]).toEqual({ isDefault: 'desc' })
    const row = firstPerFirm(rows).get('f') ?? null
    expect(row?.id).toBe('new-default')
    expect(printedOnBill(row)).toBeNull()
    expect(printedOnBill({ ...rows[0], verifiedAt: at })?.id).toBe('new-default')
    expect(printedOnBill(null)).toBeNull()
  })

  it('the pay-to reads as the name on the account, the bank and four digits, says the details are being confirmed where they are not checked, and says none are on the bill where none were given', () => {
    expect(payToSays({ legalName: 'Brightmoor Staffing LLC', accountName: null, bankName: 'Chase', accountLast4: '4821', paymentMethod: 'ACH' }))
      .toBe('Pay to Brightmoor Staffing LLC, Chase, account ending 4821, by ACH.')
    expect(payToSays(null, true)).toBe(PAY_TO_BEING_CONFIRMED)
    expect(PAY_TO_BEING_CONFIRMED).toBe('Payment details are being confirmed, so no account is printed on this bill yet.')
    expect(payToSays(null)).toBe(PAY_TO_NONE)
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
