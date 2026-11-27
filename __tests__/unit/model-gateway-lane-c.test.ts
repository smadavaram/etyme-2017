import { describe, it, expect } from 'vitest'
import { laneCRefusal, laneCIn } from '@/lib/model-gateway/lane-c'

describe('Lane C never reaches a model', () => {
  it.each(['W4', 'W-9', 'voided check', 'VOIDED_CHECK', 'SSA card', 'I-9', 'passport', "Driver's License"])(
    'a %s is never sent to any model, by its type, whatever its text holds', (t) => {
      const v = laneCRefusal({ documentType: t, texts: ['plain harmless words'] })
      expect(v).toMatchObject({ refused: true, by: 'TYPE' })
    })
  it('a paper of an ordinary type with clean text may be read', () => {
    expect(laneCRefusal({ documentType: 'RESUME', texts: ['Java developer, nine years'] })).toEqual({ refused: false })
  })
  it('text with a social security number is refused before sending, and the refusal never repeats the number', () => {
    const v = laneCRefusal({ texts: ['Her SSN is 123-45-6789 on the form'] })
    expect(v).toMatchObject({ refused: true, by: 'PATTERN', found: ['SOCIAL_SECURITY'] })
    expect(JSON.stringify(v)).not.toContain('6789')
  })
  it('text with a bank account or routing number is refused before sending', () => {
    expect(laneCIn('Routing number: 021000021 and account 123456789012')).toContain('BANK_DETAILS')
    expect(laneCIn('IBAN GB82 WEST 1234 5698 7654 32')).toContain('BANK_DETAILS')
  })
  it('text with a tax ID is refused before sending', () => {
    expect(laneCIn('EIN 12-3456789')).toEqual(['TAX_ID'])
    expect(laneCIn('Tax ID: 98-7654321')).toContain('TAX_ID')
  })
  it('ordinary business text with dates, rates and order numbers is not refused', () => {
    expect(laneCIn('Order PO-2026-114 starts 2026-11-02 at $98.00/hr for 40 hours, ledger account 4100')).toEqual([])
  })
  it('every piece that would leave is read, not only the first', () => {
    const v = laneCRefusal({ texts: ['fine', 'second part has 987-65-4321'] })
    expect(v.refused).toBe(true)
  })
})
