import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { activateTenant, correctAttribution, createAffiliate, setPayoutDetails, readOwnAffiliate } from '@/lib/money/affiliate-registry'
import { markSubscriptionPaid, markReversal } from '@/lib/money/affiliate-receipts'
import { closeStatement, draftPayout, approvePayout, issuePayoutFile, confirmPayout } from '@/lib/money/affiliate-payout'

/**
 * Record 129 on a real Postgres: attribution once at activation, commission
 * only on subscriptions a tenant paid, clawback, statements, and a payout
 * that is only ever a file. Every name here is made up.
 */

const staff = { personId: 'staff-1', staff: true }
const nobody = { personId: 'someone', staff: false }
const D = (iso: string) => new Date(`${iso}T00:00:00Z`)
const NOW = D('2027-03-10')
const ENV = { ETYME_DATA_SEAL_KEY: 'a'.repeat(64) }

async function tenant(slug: string) {
  return prisma.company.create({ data: { name: `Tenant ${slug}`, slug, kind: 'CLIENT' } })
}

describe('affiliates on a real database', () => {
  let aff: string
  let affCode: string
  let t1: string
  let receiptId: string

  beforeAll(async () => {
    await resetDatabase()
    const a = await createAffiliate({ kind: 'PERSON', name: 'Dana Referrer', contactEmail: 'dana@referrer.example' }, staff)
    if (!a.ok) throw new Error(a.says)
    aff = a.affiliateId; affCode = a.code
    t1 = (await tenant('t-one')).id
  })

  it('lets only Etyme staff register an affiliate', async () => {
    const r = await createAffiliate({ kind: 'PERSON', name: 'X', contactEmail: 'x@x.example' }, nobody)
    expect(r.ok).toBe(false)
  })

  it('writes the activation day and who referred the tenant, once, in one act', async () => {
    const r = await activateTenant({ tenantCompanyId: t1, code: affCode, activatedAt: D('2026-12-15') }, staff)
    expect(r).toMatchObject({ ok: true, affiliateId: aff, alreadyWritten: false })
    const c = await prisma.company.findUniqueOrThrow({ where: { id: t1 } })
    expect(c.activatedAt?.toISOString()).toBe('2026-12-15T00:00:00.000Z')
  })

  it('leaves an attribution exactly as written when the tenant is activated again with another code', async () => {
    const other = await createAffiliate({ kind: 'PERSON', name: 'Second Referrer', contactEmail: 's@referrer.example' }, staff)
    if (!other.ok) throw new Error()
    const r = await activateTenant({ tenantCompanyId: t1, code: other.code }, staff)
    expect(r).toMatchObject({ ok: true, alreadyWritten: true, affiliateId: aff })
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: t1 } })).toBe(1)
  })

  it('gives a tenant with no referral code to the house, and pays no commission on it', async () => {
    const h = (await tenant('t-house')).id
    const r = await activateTenant({ tenantCompanyId: h, activatedAt: D('2026-12-15') }, staff)
    expect(r).toMatchObject({ ok: true, affiliateId: null })
    expect((await prisma.affiliateAttribution.findUniqueOrThrow({ where: { tenantCompanyId: h } })).source).toBe('HOUSE')
    const p = await markSubscriptionPaid({ tenantCompanyId: h, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 29985, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, staff, NOW)
    expect(p).toMatchObject({ ok: true, commissionCents: null })
    expect(await prisma.affiliateCommissionEntry.count({ where: { tenantCompanyId: h } })).toBe(0)
  })

  it('never lets an affiliate earn on a company it owns', async () => {
    const mine = (await tenant('t-mine')).id
    const own = await createAffiliate({ kind: 'COMPANY', name: 'Own Co', contactEmail: 'o@own.example', ownCompanyId: mine }, staff)
    if (!own.ok) throw new Error()
    const r = await activateTenant({ tenantCompanyId: mine, code: own.code, activatedAt: D('2026-12-15') }, staff)
    expect(r).toMatchObject({ ok: true, affiliateId: null })
    expect((r as { note: string }).note).toMatch(/never earns on its own tenant/)
  })

  it('never lets an affiliate earn on a tenant where its own person holds a seat', async () => {
    const person = await prisma.person.create({ data: { name: 'Seat Holder', primaryEmail: 'seat@holder.example' } })
    const seated = (await tenant('t-seated')).id
    await prisma.context.create({ data: { personId: person.id, companyId: seated, type: 'EMPLOYEE' } as never })
    const a = await createAffiliate({ kind: 'PERSON', name: 'Seat Holder', contactEmail: 'seat@holder.example', accountPersonId: person.id }, staff)
    if (!a.ok) throw new Error()
    const r = await activateTenant({ tenantCompanyId: seated, code: a.code, activatedAt: D('2026-12-15') }, staff)
    expect(r).toMatchObject({ ok: true, affiliateId: null })
  })

  it('records no subscription as paid without a reason, in dollars, for a date that has happened', async () => {
    const base = { tenantCompanyId: t1, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 29985, platformFeeCents: 0, paidAt: D('2027-03-01') }
    expect((await markSubscriptionPaid({ ...base, reason: '' }, staff, NOW)).ok).toBe(false)
    expect((await markSubscriptionPaid({ ...base, reason: 'ok then', currency: 'INR' }, staff, NOW)).ok).toBe(false)
    expect((await markSubscriptionPaid({ ...base, reason: 'ok then', paidAt: D('2027-04-01') }, staff, NOW)).ok).toBe(false)
    expect((await markSubscriptionPaid({ ...base, reason: 'ok then' }, nobody, NOW)).ok).toBe(false)
    expect(await prisma.subscriptionReceipt.count({ where: { tenantCompanyId: t1 } })).toBe(0)
  })

  it('pays no commission until a receipt is paid', async () => {
    expect(await prisma.affiliateCommissionEntry.count({ where: { affiliateId: aff } })).toBe(0)
  })

  it('earns 40 percent to the cent on a paid month-2 receipt and moves paidThrough in the same act', async () => {
    const r = await markSubscriptionPaid({ tenantCompanyId: t1, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 29985, platformFeeCents: 100000, paidAt: D('2027-03-01'), reference: 'WIRE-1', reason: 'Bank file matched' }, staff, NOW)
    expect(r).toMatchObject({ ok: true, commissionCents: 51994 })
    receiptId = (r as { receiptId: string }).receiptId
    const e = await prisma.affiliateCommissionEntry.findUniqueOrThrow({ where: { sourceKey: `receipt:${receiptId}` } })
    expect(e).toMatchObject({ basisCents: 129985, rateBp: 4000, monthFromActivation: 2, commissionCents: 51994, statementMonth: '2027-03' })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: t1 } })).paidThrough?.toISOString()).toBe('2027-03-14T00:00:00.000Z')
  })

  it('refuses a second receipt for the same period', async () => {
    const r = await markSubscriptionPaid({ tenantCompanyId: t1, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 1, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'again' }, staff, NOW)
    expect(r.ok).toBe(false)
    expect(await prisma.affiliateCommissionEntry.count({ where: { receiptId } })).toBe(1)
  })

  it('earns 20 percent on a receipt from month 13 counted from activation', async () => {
    const r = await markSubscriptionPaid({ tenantCompanyId: t1, periodStart: D('2028-01-15'), periodEnd: D('2028-02-15'), contractorCents: 29985, platformFeeCents: 0, paidAt: D('2028-01-20'), reason: 'Bank file matched' }, staff, D('2028-01-25'))
    expect(r).toMatchObject({ ok: true, commissionCents: 5997 })
  })

  it('claws back exactly what the receipt paid when it is fully refunded, as a negative row', async () => {
    const r = await markReversal({ receiptId, kind: 'REFUND', contractorCents: 29985, platformFeeCents: 100000, reason: 'Refunded in full', reversedAt: D('2027-03-05') }, staff, NOW)
    expect(r).toMatchObject({ ok: true, clawbackCents: 51994 })
    const rows = await prisma.affiliateCommissionEntry.findMany({ where: { receiptId } })
    expect(rows.reduce((s, x) => s + x.commissionCents, 0)).toBe(0)
  })

  it('refuses a refund larger than what the receipt held', async () => {
    const r = await markReversal({ receiptId, kind: 'REFUND', contractorCents: 1, platformFeeCents: 0, reason: 'too much', reversedAt: D('2027-03-06') }, staff, NOW)
    expect(r.ok).toBe(false)
  })

  it('moves commission to another affiliate only by a new correction row with a reason, from that day on', async () => {
    const b = await createAffiliate({ kind: 'PERSON', name: 'Third Referrer', contactEmail: 't@referrer.example' }, staff)
    if (!b.ok) throw new Error()
    expect((await correctAttribution({ tenantCompanyId: t1, toAffiliateId: b.affiliateId, reason: '' }, staff)).ok).toBe(false)
    expect((await correctAttribution({ tenantCompanyId: t1, toAffiliateId: b.affiliateId, reason: 'Introduction was Third’s' }, nobody)).ok).toBe(false)
    expect((await correctAttribution({ tenantCompanyId: t1, toAffiliateId: b.affiliateId, reason: 'Introduction was Third’s' }, staff)).ok).toBe(true)
    expect((await prisma.affiliateAttribution.findUniqueOrThrow({ where: { tenantCompanyId: t1 } })).affiliateId).toBe(aff)
    const r = await markSubscriptionPaid({ tenantCompanyId: t1, periodStart: D('2027-03-14'), periodEnd: D('2027-04-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-09'), reason: 'Bank file matched' }, staff, NOW)
    expect(r).toMatchObject({ ok: true, commissionCents: 4000 })
    expect((await prisma.affiliateCommissionEntry.findFirstOrThrow({ where: { receiptId: (r as { receiptId: string }).receiptId } })).affiliateId).toBe(b.affiliateId)
  })

  describe('statements and payout', () => {
    it('closes a month once, carries nothing in the first month, and refuses to close a month that has not ended', async () => {
      expect((await closeStatement({ affiliateId: aff, month: '2027-03' }, staff, NOW)).ok).toBe(false)
      const s = await closeStatement({ affiliateId: aff, month: '2027-03' }, staff, D('2027-04-02'))
      expect(s).toMatchObject({ ok: true, netCents: 0, alreadyClosed: false })
      expect(await closeStatement({ affiliateId: aff, month: '2027-03' }, staff, D('2027-04-02'))).toMatchObject({ alreadyClosed: true })
    })

    it('will not draft a payout for an affiliate with no payout details and says why', async () => {
      const b = await prisma.affiliate.findFirstOrThrow({ where: { name: 'Third Referrer' } })
      await closeStatement({ affiliateId: b.id, month: '2027-03' }, staff, D('2027-04-02'))
      const r = await draftPayout({ month: '2027-03' }, staff)
      expect(r.ok).toBe(false)
      expect((r as { says: string }).says).toMatch(/No payout details/)
    })

    it('keeps the account number sealed and returns only its last four', async () => {
      const b = await prisma.affiliate.findFirstOrThrow({ where: { name: 'Third Referrer' } })
      const r = await setPayoutDetails(b.id, { bankName: 'Example Bank', accountName: 'Third Referrer', accountNumber: '000123456789' }, staff, ENV)
      expect(r).toMatchObject({ ok: true, last4: '6789' })
      const row = await prisma.affiliate.findUniqueOrThrow({ where: { id: b.id } })
      expect(JSON.stringify(row)).not.toContain('000123456789')
      expect(row.payoutSealed).toBeTruthy()
    })

    it('refuses to approve a payout without a verified Owner, then without a fresh second check, and only ever writes a file', async () => {
      const d = await draftPayout({ month: '2027-03' }, staff)
      if (!d.ok) throw new Error(d.says)
      expect(d).toMatchObject({ totalCents: 4000, items: 1 })
      const waits = await approvePayout({ batchId: d.batchId, gate: { ok: false, says: 'Paying a firm waits until Etyme has a verified Owner.', href: '/x', step: 'OWNERSHIP' }, check: { passedId: 'x' } }, { personId: 'owner-1', staff: false })
      expect(waits.ok).toBe(false)
      const noCheck = await approvePayout({ batchId: d.batchId, gate: { ok: true }, check: null }, { personId: 'owner-1', staff: false })
      expect((noCheck as { says: string }).says).toMatch(/fresh second check/)
      const someoneElses = await prisma.securityEvent.create({ data: { event: 'SECOND_CHECK_PASSED', surface: 'WEB', actorPersonId: 'other', says: 'passed' } })
      expect((await approvePayout({ batchId: d.batchId, gate: { ok: true }, check: { passedId: someoneElses.id } }, { personId: 'owner-1', staff: false })).ok).toBe(false)
      expect((await issuePayoutFile(d.batchId, staff)).ok).toBe(false)

      const mine = await prisma.securityEvent.create({ data: { event: 'SECOND_CHECK_PASSED', surface: 'WEB', actorPersonId: 'owner-1', says: 'passed' } })
      expect((await approvePayout({ batchId: d.batchId, gate: { ok: true }, check: { passedId: mine.id } }, { personId: 'owner-1', staff: false })).ok).toBe(true)
      const f = await issuePayoutFile(d.batchId, staff, D('2027-04-03'))
      if (!f.ok) throw new Error(f.says)
      expect(f.csv).toContain('40.00')
      expect(f.csv).toContain('6789')
      expect(f.csv).not.toContain('000123456789')
      expect(f.csv).toContain('ETY-AFF-')
      const batch = await prisma.affiliatePayoutBatch.findUniqueOrThrow({ where: { id: d.batchId } })
      expect(batch).toMatchObject({ status: 'FILE_ISSUED', fileHash: f.fileHash })
      expect((await confirmPayout({ batchId: d.batchId, paidOn: D('2027-05-01'), payerReference: 'BK-1' }, staff, D('2027-04-04'))).ok).toBe(false)
      expect((await confirmPayout({ batchId: d.batchId, paidOn: D('2027-04-04'), payerReference: 'BK-1' }, staff, D('2027-04-05'))).ok).toBe(true)
    })

    it('does not pay the same statement twice', async () => {
      const r = await draftPayout({ month: '2027-03' }, staff)
      expect(r.ok).toBe(false)
    })

    it('carries a clawback after payout into the next statement as a negative balance', async () => {
      const b = await prisma.affiliate.findFirstOrThrow({ where: { name: 'Third Referrer' } })
      const rec = await prisma.subscriptionReceipt.findFirstOrThrow({ where: { tenantCompanyId: t1, periodStart: D('2027-03-14') } })
      await markReversal({ receiptId: rec.id, kind: 'CHARGEBACK', contractorCents: 10000, platformFeeCents: 0, reason: 'Card chargeback', reversedAt: D('2027-04-06') }, staff, D('2027-04-10'))
      const s = await closeStatement({ affiliateId: b.id, month: '2027-04' }, staff, D('2027-05-02'))
      expect(s).toMatchObject({ ok: true, netCents: -4000 })
    })
  })

  describe('the affiliate’s own view', () => {
    it('shows an affiliate its own referrals, earnings and statements and nobody else’s', async () => {
      const person = await prisma.person.create({ data: { name: 'Viewer', primaryEmail: 'viewer@referrer.example' } })
      const v = await createAffiliate({ kind: 'PERSON', name: 'Viewer', contactEmail: 'viewer@referrer.example', accountPersonId: person.id }, staff)
      if (!v.ok) throw new Error()
      const view = await readOwnAffiliate(person.id, NOW)
      expect(view?.affiliate.name).toBe('Viewer')
      expect(view?.referrals).toEqual([])
      expect(view?.totalEarnedCents).toBe(0)
      expect(JSON.stringify(view)).not.toMatch(/payoutSealed/)
    })
    it('shows nothing to a person who is not an affiliate', async () => {
      expect(await readOwnAffiliate('nobody-at-all', NOW)).toBeNull()
    })
  })
})
