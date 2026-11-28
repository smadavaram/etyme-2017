import { describe, it, expect } from 'vitest'
import { bankAccountToWrite, SENSITIVE_FIELDS, isSensitiveField } from '@/lib/sensitive'
import { tenantSentence } from '@/lib/money/affiliate-metering'

const ENV = { ETYME_DATA_SEAL_KEY: 'b'.repeat(64) }

describe('a bank account number is sealed on its own and never written as a tax ID', () => {
  it('seals the account number and keeps only its last four in the clear', () => {
    const r = bankAccountToWrite('000123456789', ENV)
    if (!r.ok) throw new Error(r.says)
    expect(r.data.last4).toBe('6789')
    expect(r.data.sealed).not.toContain('000123456789')
    expect(r.data.sealed.length).toBeGreaterThan(20)
  })
  it('refuses, in a sentence, where the deployment has no data key', () => {
    const r = bankAccountToWrite('000123456789', {})
    expect(r).toMatchObject({ ok: false })
    expect((r as { says: string }).says).toMatch(/cannot lock a bank account number/)
  })
  it('refuses an empty account number', () => {
    expect(bankAccountToWrite('  ', ENV).ok).toBe(false)
  })
  it('names an affiliate’s payout account as its own sensitive field', () => {
    expect(isSensitiveField('AFFILIATE_PAYOUT_ACCOUNT')).toBe(true)
    expect(SENSITIVE_FIELDS.AFFILIATE_PAYOUT_ACCOUNT).toMatch(/payout account/)
  })
})

describe('what a referred tenant reads on its own ledger about an affiliate act', () => {
  it('names the kind of act and never an affiliate or an amount', () => {
    for (const action of ['ATTRIBUTED', 'ATTRIBUTION_CORRECTED', 'SUBSCRIPTION_PAID', 'SUBSCRIPTION_REVERSED', 'COMMISSION_ACCRUED', 'COMMISSION_CLAWED_BACK', 'COMMISSION_NOT_EARNED', 'ANYTHING_ELSE']) {
      expect(tenantSentence({ action })).not.toMatch(/\d|cents|affiliate/i)
    }
  })
})
