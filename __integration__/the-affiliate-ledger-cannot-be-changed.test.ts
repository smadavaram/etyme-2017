import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'

/**
 * Record 129: the affiliate ledger, at the database. On a real Postgres
 * copied from the template, which carries the guard in
 * prisma/sql/append-only.sql. Nothing here is a real person or firm.
 */

async function refused(sql: string): Promise<string> {
  try {
    await prisma.$executeRawUnsafe(sql)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  return 'the database allowed it'
}

const TABLES = [
  'AffiliateAttribution', 'AffiliateAttributionCorrection', 'SubscriptionReceipt',
  'SubscriptionReceiptReversal', 'AffiliateCommissionEntry', 'AffiliateStatement',
]

describe('the affiliate ledger, at the database', () => {
  let attributionId: string
  let receiptId: string

  beforeAll(async () => {
    await resetDatabase()
    attributionId = (await prisma.affiliateAttribution.create({
      data: { tenantCompanyId: 'tenant-a', affiliateId: null, source: 'HOUSE', activatedAt: new Date('2026-12-01'), recordedByPersonId: 'staff-1' },
    })).id
    receiptId = (await prisma.subscriptionReceipt.create({
      data: { tenantCompanyId: 'tenant-a', periodStart: new Date('2027-01-01'), periodEnd: new Date('2027-01-31'), contractorCents: 40000, platformFeeCents: 100000, paidAt: new Date('2027-02-02'), reason: 'Bank file matched', markedByPersonId: 'staff-1' },
    })).id
  })

  it('refuses to change an attribution once it is written', async () => {
    expect(await refused(`UPDATE "AffiliateAttribution" SET "affiliateId" = 'x' WHERE id = '${attributionId}'`)).toMatch(/append-only/)
  })

  it('refuses to delete an attribution', async () => {
    expect(await refused(`DELETE FROM "AffiliateAttribution" WHERE id = '${attributionId}'`)).toMatch(/append-only/)
  })

  it('refuses to change or delete a paid subscription receipt', async () => {
    expect(await refused(`UPDATE "SubscriptionReceipt" SET "contractorCents" = 1 WHERE id = '${receiptId}'`)).toMatch(/append-only/)
    expect(await refused(`DELETE FROM "SubscriptionReceipt" WHERE id = '${receiptId}'`)).toMatch(/append-only/)
  })

  it('refuses to empty any table of the affiliate ledger', async () => {
    for (const t of TABLES) expect(await refused(`TRUNCATE "${t}"`), t).toMatch(/append-only/)
  })

  it('takes a correction as a new row with a reason, leaving the attribution as it was', async () => {
    await prisma.affiliateAttributionCorrection.create({
      data: { attributionId, tenantCompanyId: 'tenant-a', fromAffiliateId: null, toAffiliateId: 'aff-1', reason: 'Referral confirmed by email', correctedByPersonId: 'owner-1' },
    })
    const row = await prisma.affiliateAttribution.findUniqueOrThrow({ where: { id: attributionId } })
    expect(row.affiliateId).toBeNull()
    expect(await prisma.affiliateAttributionCorrection.count({ where: { attributionId } })).toBe(1)
  })

  it('never writes the same subscription period twice for one tenant', async () => {
    await expect(prisma.subscriptionReceipt.create({
      data: { tenantCompanyId: 'tenant-a', periodStart: new Date('2027-01-01'), periodEnd: new Date('2027-01-31'), contractorCents: 1, platformFeeCents: 1, paidAt: new Date('2027-02-03'), reason: 'again', markedByPersonId: 'staff-1' },
    })).rejects.toThrow()
  })

  it('never accrues commission twice for one receipt', async () => {
    const data = { affiliateId: 'aff-1', attributionId, tenantCompanyId: 'tenant-a', kind: 'EARNED' as const, sourceKey: `receipt:${receiptId}`, receiptId, basisCents: 140000, rateBp: 4000, commissionCents: 56000, monthFromActivation: 2, statementMonth: '2027-02' }
    await prisma.affiliateCommissionEntry.create({ data })
    await expect(prisma.affiliateCommissionEntry.create({ data })).rejects.toThrow()
  })
})
