import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Record 129 and 127: the affiliate tables, read from the schema. An
 * affiliate refers and earns on subscription receipts; placement is a
 * separate engine and no affiliate table may touch it.
 */

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
const sql = readFileSync(join(process.cwd(), 'prisma/sql/append-only.sql'), 'utf8')

const AFFILIATE_MODELS = [
  'Affiliate', 'AffiliateAttribution', 'AffiliateAttributionCorrection', 'SubscriptionReceipt',
  'SubscriptionReceiptReversal', 'AffiliateCommissionEntry', 'AffiliateStatement',
  'AffiliatePayoutBatch', 'AffiliatePayoutItem',
]
const APPEND_ONLY = [
  'AffiliateAttribution', 'AffiliateAttributionCorrection', 'SubscriptionReceipt',
  'SubscriptionReceiptReversal', 'AffiliateCommissionEntry', 'AffiliateStatement',
]

function body(name: string): string {
  const m = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))
  expect(m, `model ${name} should exist`).not.toBeNull()
  return m![1]
}

describe('the affiliate tables', () => {
  it('guard every ledger table against change, delete and empty in the database', () => {
    for (const t of APPEND_ONLY) expect(sql, t).toContain(`'${t}'`)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON %I FOR EACH ROW/)
    expect(sql).toMatch(/BEFORE TRUNCATE ON %I FOR EACH STATEMENT/)
  })

  it('never name a sell line, a buy line, a margin or a placement', () => {
    for (const m of AFFILIATE_MODELS) {
      expect(body(m), m).not.toMatch(/sellContract|buyContract|margin|placement|assignment|commissionPlan|ContractCommission/i)
    }
  })

  it('hold money only as whole cents', () => {
    for (const m of AFFILIATE_MODELS) {
      for (const line of body(m).split('\n')) {
        if (/Cents\b/.test(line.trim().split(/\s+/)[0] ?? '')) expect(line, `${m}: ${line}`).toMatch(/\bInt\b/)
      }
    }
  })

  it('keep a payout account number only sealed, with four digits in the clear', () => {
    const a = body('Affiliate')
    expect(a).toMatch(/payoutSealed\s+String\?/)
    expect(a).toMatch(/payoutLast4\s+String\?/)
    expect(a).not.toMatch(/payoutAccountNumber|payoutNumber\b/)
  })

  it('give a tenant one attribution, one affiliate code, and one commission entry per source', () => {
    expect(body('AffiliateAttribution')).toMatch(/tenantCompanyId\s+String\s+@unique/)
    expect(body('Affiliate')).toMatch(/code\s+String\s+@unique/)
    expect(body('AffiliateCommissionEntry')).toMatch(/sourceKey\s+String\s+@unique/)
  })

  it('pay one statement only once', () => {
    expect(body('AffiliatePayoutItem')).toMatch(/statementId\s+String\s+@unique/)
  })
})
