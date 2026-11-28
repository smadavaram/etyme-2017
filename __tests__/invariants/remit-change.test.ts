import { describe, it, expect } from 'vitest'
import { bankChange, BANK_CHANGED_SAYS } from '@/lib/money/remit-change'

const stored = { bankName: 'First Ohio Bank', accountName: 'Brightmoor Staffing LLC', accountLast4: '4471', routingLast4: '0210' }

describe('a payer’s check on a firm’s bank details', () => {
  it('changing the bank clears the check, and changing the label does not', () => {
    for (const after of [
      { bankName: 'Second Ohio Bank' },
      { accountName: 'Brightmoor Holdings LLC' },
      { accountLast4: '9902' },
      { routingLast4: '0311' },
    ]) {
      const c = bankChange(stored, after)
      expect(c.cleared, JSON.stringify(after)).toBe(true)
      if (c.cleared) {
        expect(c.data).toEqual({ verifiedAt: null, verifiedById: null, verifiedByCompanyId: null })
        expect(c.says).toBe('Bank details changed; your client’s Finance checks them again before paying.')
      }
    }
    // A label, an address or a field left untouched is not a change to the bank.
    expect(bankChange(stored, {})).toEqual({ cleared: false })
    expect(bankChange(stored, { bankName: ' First Ohio Bank ' })).toEqual({ cleared: false })
  })

  it('details entered for the first time have nothing checked to keep, so they are unchecked', () => {
    expect(bankChange(null, { bankName: 'First Ohio Bank' })).toMatchObject({ cleared: true, says: BANK_CHANGED_SAYS })
  })

  it('a blank and a missing value are the same fact, so clearing an empty field changes nothing', () => {
    expect(bankChange({ ...stored, routingLast4: null }, { routingLast4: '' })).toEqual({ cleared: false })
  })
})
