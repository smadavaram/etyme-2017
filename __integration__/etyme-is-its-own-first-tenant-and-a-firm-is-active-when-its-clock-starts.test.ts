import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { markSent } from '@/lib/money/bill-send'
import { ensureEtymeTenant, etymeTenantId, seatStaff, ETYME_TENANT_SLUG } from '@/lib/money/etyme-tenant'
import { rememberReferral, startTrialClockIfRunning } from '@/lib/money/affiliate-activation'
import { activateTenant, createAffiliate, setPayoutDetails } from '@/lib/money/affiliate-registry'
import { markSubscriptionPaid } from '@/lib/money/affiliate-receipts'
import { closeStatement, draftPayout } from '@/lib/money/affiliate-payout'
import { createCompany } from '@/lib/company-create'
import { usageCount } from '@/lib/record-ledger'

/**
 * Pax, 2026-11-28: Etyme is its own first tenant (tenant #0), and a firm is
 * active when its trial clock starts, which is when it begins running its
 * own business. Every name here is made up.
 */

const D = (iso: string) => new Date(`${iso}T00:00:00Z`)
const ENV = { ETYME_DATA_SEAL_KEY: 'a'.repeat(64) }
const DAY = 86_400_000

let staffId: string
let staff: { personId: string; staff: true }
let founderId: string

async function shell(name: string, slug: string, kind: 'VENDOR' | 'CLIENT' = 'VENDOR') {
  const c = await createCompany({ name, kind, slug, domain: null, byPersonId: founderId, seatAsOwner: true, claimDomain: false, startsSetup: false })
  return c.company.id
}

describe('Etyme is its own first tenant', () => {
  let hq: string

  beforeAll(async () => {
    await freshWorld()
    staffId = (await prisma.person.create({ data: { name: 'Etyme Staff', primaryEmail: 'staff@tenant-zero.example' } })).id
    founderId = (await prisma.person.create({ data: { name: 'Some Founder', primaryEmail: 'founder@tenant-zero.example' } })).id
    staff = { personId: staffId, staff: true }
  }, 600_000)

  describe('the record itself', () => {
    it('Etyme’s own tenant is made once however many times it is asked for', async () => {
      const first = await ensureEtymeTenant(prisma, staffId)
      const second = await ensureEtymeTenant(prisma, staffId)
      const third = await ensureEtymeTenant(prisma, founderId)
      hq = first.id
      expect(first.created).toBe(true)
      expect(second).toEqual({ id: hq, created: false })
      expect(third.id).toBe(hq)
      expect(await prisma.company.count({ where: { slug: ETYME_TENANT_SLUG } })).toBe(1)
      expect(await etymeTenantId(prisma)).toBe(hq)
    })

    it('it is made through the normal company path, so it has roles, a head office and a country like any firm', async () => {
      const c = await prisma.company.findUniqueOrThrow({ where: { id: hq }, include: { roles: true } })
      expect(c.roles.map((r) => r.name)).toContain('Admin')
      expect(c.country).toBe('US')
      expect(c.slug).not.toBe('etyme')
    })

    it('it is billing exempt, so no 60 days run on it and day 61 never locks it', async () => {
      const c = await prisma.company.findUniqueOrThrow({ where: { id: hq } })
      expect(c.billingExempt).toBe(true)
      expect(c.activatedAt).toBeNull()
    })

    it('it holds no domain, is not a demo, and no real customer domain is anywhere on it', async () => {
      const c = await prisma.company.findUniqueOrThrow({ where: { id: hq } })
      expect(c.domain).toBeNull()
      expect(c.isDemo).toBe(false)
      expect(await prisma.companyDomain.count({ where: { companyId: hq } })).toBe(0)
    })

    it('it is on nobody’s supplier or customer list, because no register row names it either way', async () => {
      expect(await prisma.counterparty.count({ where: { OR: [{ companyId: hq }, { otherCompanyId: hq }] } })).toBe(0)
    })

    it('it is never attributed, never activated by hand and never given a trial clock', async () => {
      const r = await activateTenant({ tenantCompanyId: hq, activatedAt: D('2026-12-01') }, staff)
      expect(r).toMatchObject({ ok: false })
      expect((r as { says: string }).says).toMatch(/not billed/)
      expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: hq } })).toBe(0)
      expect((await prisma.company.findUniqueOrThrow({ where: { id: hq } })).activatedAt).toBeNull()
    })

    it('staff are seated there, and a person who is not staff is refused', async () => {
      const ok = await seatStaff(staffId, staff, prisma)
      expect(ok).toEqual({ ok: true, seated: true })
      expect(await seatStaff(staffId, staff, prisma)).toEqual({ ok: true, seated: false })
      const no = await seatStaff(founderId, { personId: founderId, staff: false }, prisma)
      expect(no).toMatchObject({ ok: false })
      expect(await prisma.context.count({ where: { companyId: hq } })).toBe(1)
    })
  })

  describe('the registry, statement and payout acts', () => {
    let affiliateId: string
    let tenant: string

    beforeAll(async () => {
      const a = await createAffiliate({ kind: 'PERSON', name: 'Zero Referrer', contactEmail: 'zero@referrer.example' }, staff)
      if (!a.ok) throw new Error(a.says)
      affiliateId = a.affiliateId
      expect(a.acts[0]).toMatchObject({ action: 'REGISTERED', metered: true })
      await setPayoutDetails(affiliateId, { bankName: 'Example Bank', accountName: 'Zero Referrer', accountNumber: '000987654321' }, staff, ENV)
      tenant = await shell('Zero Tenant', 'zero-tenant', 'CLIENT')
      await activateTenant({ tenantCompanyId: tenant, code: a.code, activatedAt: D('2026-12-15') }, staff)
      await markSubscriptionPaid({ tenantCompanyId: tenant, periodStart: D('2027-02-14'), periodEnd: D('2027-03-14'), contractorCents: 10000, platformFeeCents: 0, paidAt: D('2027-03-01'), reason: 'Bank file matched' }, staff, D('2027-03-10'))
    })

    it('registering an affiliate is a row on Etyme’s own tenant, under the affiliate agent key, naming who did it', async () => {
      const row = await prisma.recordAction.findFirstOrThrow({ where: { companyId: hq, action: 'REGISTERED' } })
      expect(row).toMatchObject({ agentKey: 'affiliate', personId: staffId, heldAs: 'Etyme staff', recordType: 'Affiliate', recordId: affiliateId })
    })

    it('setting payout details, closing a statement and drafting a payout are each a row on Etyme’s own tenant', async () => {
      const s = await closeStatement({ affiliateId, month: '2027-03' }, staff, D('2027-04-02'))
      if (!s.ok) throw new Error(s.says)
      expect(s.acts[0]).toMatchObject({ action: 'STATEMENT_CLOSED', metered: true })
      const d = await draftPayout({ month: '2027-03' }, staff)
      if (!d.ok) throw new Error(d.says)
      expect(d.acts[0]).toMatchObject({ action: 'PAYOUT_DRAFTED', metered: true })
      const held = (await prisma.recordAction.findMany({ where: { companyId: hq } })).map((r) => r.action).sort()
      expect(held).toEqual(['PAYOUT_DETAILS_SET', 'PAYOUT_DRAFTED', 'REGISTERED', 'STATEMENT_CLOSED'].sort())
    })

    it('the affiliate agent key is counted on Etyme’s own tenant for the usage reading', async () => {
      const n = await usageCount(hq, new Date(Date.now() - DAY), new Date(Date.now() + DAY))
      expect(n.find((x) => x.agentKey === 'affiliate')?.count).toBe(4)
    })

    it('an act about a referred tenant still goes on that tenant’s ledger and never on Etyme’s own', async () => {
      const onTenant = (await prisma.recordAction.findMany({ where: { companyId: tenant } })).map((r) => r.action).sort()
      expect(onTenant).toEqual(['ATTRIBUTED', 'COMMISSION_ACCRUED', 'SUBSCRIPTION_PAID'])
      expect(await prisma.recordAction.count({ where: { companyId: hq, action: { in: ['ATTRIBUTED', 'SUBSCRIPTION_PAID', 'COMMISSION_ACCRUED'] } } })).toBe(0)
    })

    it('a payout still has no route and nothing here moves money', async () => {
      expect(await prisma.affiliatePayoutBatch.count({ where: { status: { notIn: ['DRAFT'] } } })).toBe(0)
    })
  })
})

describe('a firm is active when its trial clock starts', () => {
  let affCode: string
  let affId: string

  beforeAll(async () => {
    await freshWorld()
    staffId = (await prisma.person.create({ data: { name: 'Etyme Staff', primaryEmail: 'staff@clock.example' } })).id
    founderId = (await prisma.person.create({ data: { name: 'Clock Founder', primaryEmail: 'founder@clock.example' } })).id
    staff = { personId: staffId, staff: true }
    const a = await createAffiliate({ kind: 'PERSON', name: 'Clock Referrer', contactEmail: 'clock@referrer.example' }, staff)
    if (!a.ok) throw new Error(a.says)
    affCode = a.code; affId = a.affiliateId
  }, 600_000)

  it('a firm that has nothing running and has issued no bill is not activated, however long it has been signed up', async () => {
    const id = await shell('Idle Firm', 'idle-firm')
    await rememberReferral(id, affCode)
    const r = await startTrialClockIfRunning({ companyId: id, now: D('2027-01-10') })
    expect(r).toMatchObject({ started: false, already: false })
    expect((r as { says: string }).says).toMatch(/60 days have not started/)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).activatedAt).toBeNull()
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: id } })).toBe(0)
  })

  it('a firm that only uses another firm’s record is never activated', async () => {
    const supplier = await shell('Seller Firm', 'seller-firm')
    const client = await shell('Buyer Firm', 'buyer-firm', 'CLIENT')
    const person = (await prisma.person.create({ data: { name: 'Placed Person', primaryEmail: 'placed@clock.example' } })).id
    await prisma.sellContract.create({ data: { companyId: supplier, clientCompanyId: client, personId: person, state: 'IN_PROGRESS', billRate: 5000, billCurrency: 'USD', startDate: D('2027-01-01') } as never })
    const r = await startTrialClockIfRunning({ companyId: client, now: D('2027-01-10') })
    expect(r).toMatchObject({ started: false })
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: client } })).toBe(0)
  })

  it('a firm’s first placement as the supplier starts its clock and writes who referred it, once', async () => {
    const supplier = await shell('Placing Firm', 'placing-firm')
    const client = await shell('Placed At Firm', 'placed-at-firm', 'CLIENT')
    const person = (await prisma.person.create({ data: { name: 'Another Person', primaryEmail: 'another@clock.example' } })).id
    await rememberReferral(supplier, affCode)
    await prisma.sellContract.create({ data: { companyId: supplier, clientCompanyId: client, personId: person, state: 'IN_PROGRESS', billRate: 5000, billCurrency: 'USD', startDate: D('2027-01-01') } as never })
    const r = await startTrialClockIfRunning({ companyId: supplier, byPersonId: founderId, now: D('2027-01-12') })
    expect(r).toMatchObject({ started: true, affiliateId: affId })
    const c = await prisma.company.findUniqueOrThrow({ where: { id: supplier } })
    expect(c.activatedAt?.toISOString()).toBe(D('2027-01-12').toISOString())
    const att = await prisma.affiliateAttribution.findUniqueOrThrow({ where: { tenantCompanyId: supplier } })
    expect(att).toMatchObject({ affiliateId: affId, source: 'CODE', recordedByPersonId: founderId })
    expect(att.activatedAt.toISOString()).toBe(D('2027-01-12').toISOString())
  })

  it('a second start changes nothing: the date and the attribution stay as they were', async () => {
    const id = await shell('Twice Firm', 'twice-firm')
    const client = await shell('Twice Client', 'twice-client', 'CLIENT')
    const person = (await prisma.person.create({ data: { name: 'Twice Person', primaryEmail: 'twice@clock.example' } })).id
    await rememberReferral(id, affCode)
    await prisma.sellContract.create({ data: { companyId: id, clientCompanyId: client, personId: person, state: 'IN_PROGRESS', billRate: 5000, billCurrency: 'USD', startDate: D('2027-01-01') } as never })
    await startTrialClockIfRunning({ companyId: id, now: D('2027-01-12') })
    const again = await startTrialClockIfRunning({ companyId: id, now: D('2027-03-01') })
    expect(again).toMatchObject({ started: false, already: true })
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: id } })).toBe(1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).activatedAt?.toISOString()).toBe(D('2027-01-12').toISOString())
    expect(await prisma.recordAction.count({ where: { companyId: id, action: 'ATTRIBUTED' } })).toBe(1)
  })

  it('a code that is not on the registry sends the firm to the house, and says why', async () => {
    const id = await shell('House Firm', 'house-firm')
    const client = await shell('House Client', 'house-client', 'CLIENT')
    const person = (await prisma.person.create({ data: { name: 'House Person', primaryEmail: 'house@clock.example' } })).id
    await rememberReferral(id, 'no-such-code')
    await prisma.sellContract.create({ data: { companyId: id, clientCompanyId: client, personId: person, state: 'IN_PROGRESS', billRate: 5000, billCurrency: 'USD', startDate: D('2027-01-01') } as never })
    const r = await startTrialClockIfRunning({ companyId: id, now: D('2027-01-12') })
    expect(r).toMatchObject({ started: true, affiliateId: null })
    expect((r as { note: string }).note).toMatch(/not on the registry/)
    expect((await prisma.affiliateAttribution.findUniqueOrThrow({ where: { tenantCompanyId: id } })).source).toBe('HOUSE')
  })

  it('a firm with no code at all belongs to the house', async () => {
    const id = await shell('No Code Firm', 'no-code-firm')
    const client = await shell('No Code Client', 'no-code-client', 'CLIENT')
    const person = (await prisma.person.create({ data: { name: 'No Code Person', primaryEmail: 'nocode@clock.example' } })).id
    await prisma.sellContract.create({ data: { companyId: id, clientCompanyId: client, personId: person, state: 'IN_PROGRESS', billRate: 5000, billCurrency: 'USD', startDate: D('2027-01-01') } as never })
    const r = await startTrialClockIfRunning({ companyId: id, now: D('2027-01-12') })
    expect(r).toMatchObject({ started: true, affiliateId: null })
  })

  it('a billing-exempt firm is never activated, even running its own business', async () => {
    const id = await shell('Exempt Firm', 'exempt-firm')
    await prisma.company.update({ where: { id }, data: { billingExempt: true } })
    const client = await shell('Exempt Client', 'exempt-client', 'CLIENT')
    const person = (await prisma.person.create({ data: { name: 'Exempt Person', primaryEmail: 'exempt@clock.example' } })).id
    await prisma.sellContract.create({ data: { companyId: id, clientCompanyId: client, personId: person, state: 'IN_PROGRESS', billRate: 5000, billCurrency: 'USD', startDate: D('2027-01-01') } as never })
    expect(await startTrialClockIfRunning({ companyId: id, now: D('2027-01-12') })).toMatchObject({ started: false })
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: id } })).toBe(0)
  })

  it('the code a firm arrived with is kept once, and cannot be changed after its clock has started', async () => {
    const id = await shell('Code Keeper', 'code-keeper')
    expect(await rememberReferral(id, '  ' + affCode.toUpperCase() + ' ')).toEqual({ ok: true, kept: true })
    expect(await rememberReferral(id, 'something-else')).toEqual({ ok: true, kept: false })
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).referredByCode).toBe(affCode)
    await prisma.company.update({ where: { id }, data: { activatedAt: D('2027-01-12') } })
    const late = await rememberReferral(id, 'late-code')
    expect(late).toMatchObject({ ok: false })
    expect((late as { says: string }).says).toMatch(/already written/)
  })

  it('staff may still mark a firm active by hand, and it is ledgered on the firm like the event', async () => {
    const id = await shell('Hand Marked', 'hand-marked')
    const r = await activateTenant({ tenantCompanyId: id, code: affCode, activatedAt: D('2027-01-20') }, staff)
    expect(r).toMatchObject({ ok: true, affiliateId: affId })
    expect(await prisma.recordAction.count({ where: { companyId: id, action: 'ATTRIBUTED', heldAs: 'Etyme staff' } })).toBe(1)
    const nonStaff = await activateTenant({ tenantCompanyId: id, activatedAt: D('2027-01-21') }, { personId: founderId, staff: false })
    expect(nonStaff).toMatchObject({ ok: false })
  })

  it('a firm’s own start pays nobody: no commission entry exists until a receipt is marked paid', async () => {
    expect(await prisma.affiliateCommissionEntry.count()).toBe(0)
  })

  it('sending the first bill a firm raises starts its clock, and the bill is still raised', async () => {
    const bm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const nb = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: bm.id } })).toBe(0)
    await prisma.company.update({ where: { id: bm.id }, data: { activatedAt: null, referredByCode: affCode } })
    const order = await prisma.workOrder.findFirstOrThrow({ where: { issuedById: nb.id, issuedToId: bm.id }, orderBy: { startDate: 'asc' }, select: { id: true, currency: true } })
    const line = await prisma.sellContract.findFirstOrThrow({ where: { workOrderId: order.id, engagementId: { not: null } }, orderBy: { startDate: 'asc' }, select: { id: true, personId: true, engagementId: true } })
    const inv = await prisma.invoice.create({
      data: {
        engagementId: line.engagementId!, workOrderId: order.id, number: 'IN-CLOCK-1', currency: order.currency,
        total: '1120.00', periodStart: D('2026-03-01'), periodEnd: D('2026-03-28'), dueAt: D('2026-04-27'), status: 'ISSUED',
        invoiceLines: { create: [{ sellContractId: line.id, personId: line.personId, hours: '10.00', rateCents: 11_200, amountCents: 112_000 }] },
      },
      select: { id: true },
    })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: bm.id } })).activatedAt).toBeNull()
    const person = await prisma.person.findFirstOrThrow({ where: { contexts: { some: { companyId: bm.id } } }, select: { id: true, name: true } })
    await prisma.$transaction((tx) => markSent(tx, { invoiceId: inv.id, companyId: bm.id, by: { personId: person.id, name: person.name }, now: D('2027-02-01') }))
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('SUBMITTED')
    const c = await prisma.company.findUniqueOrThrow({ where: { id: bm.id } })
    expect(c.activatedAt).not.toBeNull()
    expect(await prisma.affiliateAttribution.findUniqueOrThrow({ where: { tenantCompanyId: bm.id } })).toMatchObject({ affiliateId: affId })
  })
})
