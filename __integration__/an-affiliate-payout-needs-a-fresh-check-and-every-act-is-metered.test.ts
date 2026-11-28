import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import type { SpentCheck } from '@/lib/identity/second-check'
import { activateTenant, createAffiliate, correctAttribution, setPayoutDetails } from '@/lib/money/affiliate-registry'
import { markSubscriptionPaid, markReversal } from '@/lib/money/affiliate-receipts'
import { closeStatement, draftPayout, approvePayout, AFFILIATE_PAYOUT_ACT } from '@/lib/money/affiliate-payout'
import { usageCount } from '@/lib/record-ledger'

/**
 * Two faults in the affiliate engine's last check, on a real Postgres:
 * the payout gate believed any security event, and no act was metered.
 * Every name is made up.
 */

const D = (iso: string) => new Date(`${iso}T00:00:00Z`)
const NOW = D('2027-03-10')
const ENV = { ETYME_DATA_SEAL_KEY: 'a'.repeat(64) }
const ok = { ok: true } as const

let staffId: string
let ownerId: string
let staff: { personId: string; staff: true }
let owner: { personId: string; staff: false }

/** A second check as the security log holds it once spent: passed, then used, for one act and one subject. */
async function spentCheck(personId: string, subjectId: string, o: { act?: string; at?: Date } = {}): Promise<SpentCheck> {
  const act = o.act ?? AFFILIATE_PAYOUT_ACT
  const id = `chk_${Math.random().toString(36).slice(2)}`
  const at = o.at ?? NOW
  await prisma.securityEvent.create({ data: { id, at, event: 'SECOND_CHECK_PASSED', surface: 'WEB', actorPersonId: personId, targetKind: act, targetId: subjectId, says: 'passed' } })
  await prisma.securityEvent.create({ data: { id: `used_${id}`, at, event: 'SECOND_CHECK_USED', surface: 'WEB', actorPersonId: personId, targetKind: act, targetId: subjectId, says: 'used' } })
  return { passedId: id, act, subjectId, method: 'AUTHENTICATOR_APP' } as unknown as SpentCheck
}

describe('an affiliate payout and the metering of every affiliate act', () => {
  let affId: string
  let affCode: string
  let tenantId: string

  beforeAll(async () => {
    await resetDatabase()
    staffId = (await prisma.person.create({ data: { name: 'Etyme Staff', primaryEmail: 'staff@etyme.example' } })).id
    ownerId = (await prisma.person.create({ data: { name: 'Payout Owner', primaryEmail: 'owner@etyme.example' } })).id
    staff = { personId: staffId, staff: true }
    owner = { personId: ownerId, staff: false }
  })

  describe('the second check on a payout', () => {
    let batchA: string
    let batchB: string

    beforeAll(async () => {
      const a = await createAffiliate({ kind: 'PERSON', name: 'Pay Referrer', contactEmail: 'pay@referrer.example' }, staff)
      if (!a.ok) throw new Error(a.says)
      affId = a.affiliateId; affCode = a.code
      await setPayoutDetails(affId, { bankName: 'Example Bank', accountName: 'Pay Referrer', accountNumber: '000987654321' }, staff, ENV)
      tenantId = (await prisma.company.create({ data: { name: 'Payout Tenant', slug: 'payout-tenant', kind: 'CLIENT' } })).id
      await activateTenant({ tenantCompanyId: tenantId, code: affCode, activatedAt: D('2026-12-15') }, staff)
      await markSubscriptionPaid({ tenantCompanyId: tenantId, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, staff, NOW)
      await closeStatement({ affiliateId: affId, month: '2027-03' }, staff, D('2027-04-02'))
      const d = await draftPayout({ month: '2027-03' }, staff)
      if (!d.ok) throw new Error(d.says)
      batchA = d.batchId
      await markSubscriptionPaid({ tenantCompanyId: tenantId, periodStart: D('2027-03-14'), periodEnd: D('2027-04-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-04-05'), reason: 'Bank file matched' }, staff, D('2027-04-10'))
      await closeStatement({ affiliateId: affId, month: '2027-04' }, staff, D('2027-05-02'))
      const d2 = await draftPayout({ month: '2027-04' }, staff)
      if (!d2.ok) throw new Error(d2.says)
      batchB = d2.batchId
    })

    it('refuses an approval on a second check made a day before it', async () => {
      const old = await spentCheck(ownerId, batchB, { at: D('2027-03-09') })
      const r = await approvePayout({ batchId: batchB, gate: ok, check: old }, owner, NOW)
      expect(r).toMatchObject({ ok: false })
      expect((r as { says: string }).says).toMatch(/minutes old/)
      expect((await prisma.affiliatePayoutBatch.findUniqueOrThrow({ where: { id: batchB } })).status).toBe('DRAFT')
    })

    it('refuses an approval on a second check made for another act', async () => {
      const other = await spentCheck(ownerId, batchB, { act: 'sensitive.reveal' })
      const r = await approvePayout({ batchId: batchB, gate: ok, check: other }, owner, NOW)
      expect(r).toMatchObject({ ok: false })
      expect((r as { says: string }).says).toMatch(/made for something else/)
    })

    it('refuses an approval on a second check that was passed but never spent', async () => {
      const id = `chk_unspent_${Math.random().toString(36).slice(2)}`
      await prisma.securityEvent.create({ data: { id, at: NOW, event: 'SECOND_CHECK_PASSED', surface: 'WEB', actorPersonId: ownerId, targetKind: AFFILIATE_PAYOUT_ACT, targetId: batchB, says: 'passed' } })
      const r = await approvePayout({ batchId: batchB, gate: ok, check: { passedId: id, act: AFFILIATE_PAYOUT_ACT, subjectId: batchB } as unknown as SpentCheck }, owner, NOW)
      expect((r as { says: string }).says).toMatch(/never spent/)
    })

    it('refuses an approval on a second check some other person made', async () => {
      const theirs = await spentCheck(staffId, batchB)
      expect((await approvePayout({ batchId: batchB, gate: ok, check: theirs }, owner, NOW)).ok).toBe(false)
    })

    it('refuses to let one second check approve two payouts', async () => {
      const first = await spentCheck(ownerId, batchB)
      expect((await approvePayout({ batchId: batchB, gate: ok, check: first }, owner, NOW)).ok).toBe(true)
      const again = await approvePayout({ batchId: batchA, gate: ok, check: first }, owner, NOW)
      expect(again).toMatchObject({ ok: false })
      expect((await prisma.affiliatePayoutBatch.findUniqueOrThrow({ where: { id: batchA } })).approvedByPersonId).toBeNull()
    })

    it('keeps the check on the batch it approved', async () => {
      const b = await prisma.affiliatePayoutBatch.findUniqueOrThrow({ where: { id: batchB } })
      expect(b.status).toBe('APPROVED')
      const ev = await prisma.securityEvent.findUniqueOrThrow({ where: { id: b.secondCheckEventId! } })
      expect(ev).toMatchObject({ targetKind: AFFILIATE_PAYOUT_ACT, targetId: batchB, actorPersonId: ownerId })
    })
  })

  describe('an affiliate whose person takes a seat after activation', () => {
    it('earns nothing on a receipt paid after the seat, says why, and keeps what it earned before', async () => {
      const person = await prisma.person.create({ data: { name: 'Late Seat', primaryEmail: 'late@seat.example' } })
      const t = (await prisma.company.create({ data: { name: 'Late Seat Tenant', slug: 'late-seat', kind: 'CLIENT' } })).id
      const a = await createAffiliate({ kind: 'PERSON', name: 'Late Seat', contactEmail: 'late@seat.example', accountPersonId: person.id }, staff)
      if (!a.ok) throw new Error(a.says)
      await activateTenant({ tenantCompanyId: t, code: a.code, activatedAt: D('2026-12-15') }, staff)
      const before = await markSubscriptionPaid({ tenantCompanyId: t, periodStart: D('2027-01-14'), periodEnd: D('2027-02-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-02-01'), reason: 'Bank file matched' }, staff, D('2027-02-02'))
      expect(before).toMatchObject({ ok: true, commissionCents: 4000 })

      await prisma.context.create({ data: { personId: person.id, companyId: t, type: 'EMPLOYEE' } })
      const after = await markSubscriptionPaid({ tenantCompanyId: t, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, staff, NOW)
      expect(after).toMatchObject({ ok: true, commissionCents: null })
      expect((after as { commissionNote: string }).commissionNote).toMatch(/now holds a seat/)
      const receipt = (after as { receiptId: string }).receiptId
      expect(await prisma.affiliateCommissionEntry.count({ where: { receiptId: receipt } })).toBe(0)
      expect(await prisma.affiliateCommissionEntry.count({ where: { tenantCompanyId: t } })).toBe(1)
      const row = await prisma.recordAction.findFirstOrThrow({ where: { companyId: t, recordId: receipt, action: 'COMMISSION_NOT_EARNED' } })
      expect(row.agentKey).toBe('affiliate')
      expect(await prisma.subscriptionReceipt.count({ where: { id: receipt } })).toBe(1)
    })
  })

  describe('metering', () => {
    let t: string
    let affiliate: string
    let receipt: string

    beforeAll(async () => {
      t = (await prisma.company.create({ data: { name: 'Metered Tenant', slug: 'metered', kind: 'CLIENT' } })).id
      const a = await createAffiliate({ kind: 'PERSON', name: 'Metered Referrer', contactEmail: 'm@referrer.example' }, staff)
      if (!a.ok) throw new Error(a.says)
      affiliate = a.affiliateId
      await activateTenant({ tenantCompanyId: t, code: a.code, activatedAt: D('2026-12-15') }, staff)
    })

    it('writes an attribution, a paid receipt, an accrual and a clawback on the referred tenant’s ledger under the affiliate key', async () => {
      const paid = await markSubscriptionPaid({ tenantCompanyId: t, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, staff, NOW)
      if (!paid.ok) throw new Error(paid.says)
      receipt = paid.receiptId
      expect(paid.acts.map((x) => [x.action, x.metered])).toEqual([['SUBSCRIPTION_PAID', true], ['COMMISSION_ACCRUED', true]])
      const rev = await markReversal({ receiptId: receipt, kind: 'REFUND', contractorCents: 10000, platformFeeCents: 0, reason: 'Refunded', reversedAt: D('2027-03-05') }, staff, NOW)
      if (!rev.ok) throw new Error(rev.says)
      expect(rev.acts.map((x) => x.metered)).toEqual([true, true])
      const rows = await prisma.recordAction.findMany({ where: { companyId: t } })
      expect(rows.map((r) => r.action).sort()).toEqual(['ATTRIBUTED', 'COMMISSION_ACCRUED', 'COMMISSION_CLAWED_BACK', 'SUBSCRIPTION_PAID', 'SUBSCRIPTION_REVERSED'])
      expect(rows.every((r) => r.agentKey === 'affiliate' && r.heldAs === 'Etyme staff' && r.personId === staffId)).toBe(true)
    })

    it('counts those acts for the plugin usage reading', async () => {
      const n = await usageCount(t, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000))
      expect(n.find((x) => x.agentKey === 'affiliate')?.count).toBe(5)
    })

    it('writes nothing on the tenant’s ledger that names the affiliate or a commission amount', async () => {
      const text = (await prisma.recordAction.findMany({ where: { companyId: t } })).map((r) => r.summary).join(' ')
      expect(text).not.toMatch(/Metered Referrer/)
      expect(text).not.toMatch(/\d+ cents/)
    })

    it('meters a correction on the tenant it moves', async () => {
      const b = await createAffiliate({ kind: 'PERSON', name: 'Next Referrer', contactEmail: 'n@referrer.example' }, staff)
      if (!b.ok) throw new Error(b.says)
      const c = await correctAttribution({ tenantCompanyId: t, toAffiliateId: b.affiliateId, reason: 'Introduced by Next' }, staff)
      if (!c.ok) throw new Error(c.says)
      expect(c.acts[0]).toMatchObject({ action: 'ATTRIBUTION_CORRECTED', metered: true })
      expect(await prisma.recordAction.count({ where: { companyId: t, action: 'ATTRIBUTION_CORRECTED' } })).toBe(1)
    })

    it('returns a registry act unwritten and says it waits for a ruling on the platform record', async () => {
      const before = await prisma.recordAction.count()
      const r = await createAffiliate({ kind: 'PERSON', name: 'Unmetered One', contactEmail: 'u@referrer.example' }, staff)
      if (!r.ok) throw new Error(r.says)
      expect(r.acts[0]).toMatchObject({ action: 'REGISTERED', metered: false })
      expect(r.acts[0].unmeteredWhy).toMatch(/platform record/)
      expect(await prisma.recordAction.count()).toBe(before)
    })

    it('returns a statement act unwritten as well, because a statement belongs to no tenant', async () => {
      const s = await closeStatement({ affiliateId: affiliate, month: '2027-03' }, staff, D('2027-04-02'))
      if (!s.ok) throw new Error(s.says)
      expect(s.acts[0]).toMatchObject({ action: 'STATEMENT_CLOSED', metered: false })
    })

    it('still records a receipt when the person who marked it is not on record, and says it was not metered', async () => {
      const t2 = (await prisma.company.create({ data: { name: 'Unmetered Tenant', slug: 'unmetered', kind: 'CLIENT' } })).id
      await activateTenant({ tenantCompanyId: t2, activatedAt: D('2026-12-15') }, staff)
      const r = await markSubscriptionPaid({ tenantCompanyId: t2, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, { personId: 'not-a-person', staff: true }, NOW)
      if (!r.ok) throw new Error(r.says)
      expect(r.acts[0]).toMatchObject({ metered: false })
      expect(await prisma.subscriptionReceipt.count({ where: { tenantCompanyId: t2 } })).toBe(1)
    })

    it('does not block a receipt on a tenant with several legal entities that was not told which one', async () => {
      const t3 = (await prisma.company.create({ data: { name: 'Two Entity Tenant', slug: 'two-entity', kind: 'CLIENT' } })).id
      await prisma.legalEntity.create({ data: { companyId: t3, name: 'Entity A', country: 'US', currency: 'USD' } })
      await prisma.legalEntity.create({ data: { companyId: t3, name: 'Entity B', country: 'US', currency: 'USD' } })
      await activateTenant({ tenantCompanyId: t3, activatedAt: D('2026-12-15') }, staff)
      const r = await markSubscriptionPaid({ tenantCompanyId: t3, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, staff, NOW)
      if (!r.ok) throw new Error(r.says)
      expect(r.acts[0]).toMatchObject({ metered: false })
      expect(r.acts[0].unmeteredWhy).toMatch(/legal entit/)
    })
  })
})
