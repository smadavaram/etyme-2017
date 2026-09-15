import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { matchInvoice } from '@/lib/invoice-match'
import { POST as replace } from '@/app/api/placements/[id]/replace/route'
import { POST as commissions } from '@/app/api/payroll/commissions/route'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { GET as decisions } from '@/app/api/decisions/route'

/**
 * Pinnacle replaces Lucía with Tariq on the Nike seat; a recruiter on a
 * capped commission is paid for two periods; a milestone Nike accepted
 * bills on the next invoice; a bill that did not match sits on Nike's
 * AP desk as a decision.
 */

const D = '@demo.etyme.local'
const PINNACLE = `world-pinnacle${D}`
const NIKE_AP = `world-nike-ap${D}`
const WORKER = 'tariq.al.amin@seed.etyme.invalid'
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const co: Record<string, string> = {}
const it_: Record<string, any> = {}

describe('the last money moves', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-pinnacle']) co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    const tariq = await prisma.person.create({ data: { name: 'Tariq Al-Amin', primaryEmail: WORKER } })
    it_.worker = tariq.id
    const profile = await prisma.consultantProfile.create({ data: { personId: tariq.id, skills: ['Power BI'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) } })
    await prisma.context.create({ data: { personId: tariq.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } })

    const omar = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co['world-pinnacle'], clientCompanyId: co['world-nike'], state: 'IN_PROGRESS', person: { name: 'Lucía Fernández' } },
      include: { buyLinks: true },
    })
    it_.omar = omar
    expect(omar.engagementId).not.toBeNull()
    expect(omar.buyLinks.length).toBeGreaterThan(0)
  }, 240_000)

  it("Tariq takes over Lucía's seat from today: Lucía's contract ended yesterday, a new one on the same terms runs from today, the buy side follows", async () => {
    as(PINNACLE)
    const r = await call(replace, 'POST', `/api/placements/${it_.omar.id}/replace`, it_.omar.id, { personId: it_.worker, from: day(0).toISOString().slice(0, 10) })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.next = r.body.data.id
    const old = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.omar.id } })
    expect(old.state).toBe('ENDED')
    const next = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.next }, include: { buyLinks: true } })
    expect([next.personId, next.state, next.billRate, next.clientCompanyId]).toEqual([it_.worker, 'IN_PROGRESS', it_.omar.billRate, co['world-nike']])
    expect(next.buyLinks.length).toBe(1)
    const cands = await prisma.buyContractCandidate.findMany({ where: { buyContractId: next.buyLinks[0].buyContractId }, orderBy: { createdAt: 'asc' } })
    expect(cands.map((c) => c.state).sort()).toEqual(['ACTIVE', 'REPLACED'])
    expect(await prisma.cycle.count({ where: { sellContractId: it_.next } })).toBeGreaterThan(0)
  })

  it('a recruiter on a fixed commission with a cap is paid for one period, not twice, and the cap holds the second', async () => {
    const recruiter = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PINNACLE }, select: { id: true } })
    const agent = await prisma.buyContract.create({
      data: {
        companyId: co['world-pinnacle'], contractType: 'IND_1099', payCurrency: 'USD', state: 'IN_PROGRESS', startDate: day(-30),
        commissionType: 'FIXED_PER_PERIOD', commissionRate: 50_000, commissionCap: 80_000,
        candidates: { create: { personId: recruiter.id, payRate: 0, payCurrency: 'USD', startDate: day(-30) } },
        sellLinks: { create: { sellContractId: it_.next, effectiveFrom: day(-30) } },
      },
      select: { id: true },
    })
    as(PINNACLE)
    const first = await json(await commissions(req('POST', '/api/payroll/commissions', { periodStart: day(-30).toISOString(), periodEnd: day(0).toISOString() })))
    expect(first.body?.error, JSON.stringify(first.body)).toBeUndefined()
    expect(first.body.data.posted.map((p: any) => p.amountCents)).toEqual([50_000])
    const again = await json(await commissions(req('POST', '/api/payroll/commissions', { periodStart: day(-30).toISOString(), periodEnd: day(0).toISOString() })))
    expect(again.body?.error, JSON.stringify(again.body)).toBeUndefined()
    expect(await prisma.orderPosting.count({ where: { buyContractId: agent.id, kind: 'COMMISSION' } })).toBe(1)
    const second = await json(await commissions(req('POST', '/api/payroll/commissions', { periodStart: day(1).toISOString(), periodEnd: day(30).toISOString() })))
    expect(second.body.data.posted[0]).toMatchObject({ amountCents: 30_000 })
    expect(second.body.data.posted[0].says).toContain('cap is reached')
  })

  it('a milestone Nike accepted bills on the next invoice as a line with the acceptance behind it, and the match takes it as the receipt', async () => {
    const order = await prisma.salesOrder.create({
      data: { companyId: co['world-pinnacle'], engagementId: it_.omar.engagementId!, number: 'SO-NIKE-01', title: 'Analytics phase one', soldToId: co['world-nike'], status: 'OPEN', startDate: day(-30) },
      select: { id: true },
    })
    const m = await prisma.orderMilestone.create({ data: { orderId: order.id, name: 'Data model signed off', amountCents: 500_000, status: 'ACCEPTED', acceptedAt: day(-2) }, select: { id: true } })
    as(PINNACLE)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.omar.engagementId })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const line = await prisma.invoiceLine.findFirst({ where: { milestoneId: m.id } })
    expect(line?.amountCents).toBe(500_000)
    expect(line?.invoiceId).toBe(r.body.data.invoice.id)
    expect((await prisma.orderMilestone.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('INVOICED')
    const match = await matchInvoice(r.body.data.invoice.id)
    const receipt = match!.checks.find((c) => c.code === 'RECEIPT')!
    expect(receipt.lines ?? []).not.toContain(line!.id)
  })

  it("a bill that did not match sits on Nike's AP desk as a decision, held out of payment runs", async () => {
    const bill = await prisma.vendorBill.create({
      data: { companyId: co['world-nike'], vendorCompanyId: co['world-pinnacle'], number: 'PIN-9001', totalCents: 123_400, receivedAt: day(-1), dueAt: day(29), status: 'DISPUTED' },
      select: { id: true },
    })
    as(NIKE_AP)
    const r = await json(await decisions(req('GET', '/api/decisions')))
    const mine = r.body.data.decisions.find((d: any) => d.type === 'BILL_DISPUTED' && d.entityId === bill.id)
    expect(mine?.title).toBe('Bill PIN-9001 from Pinnacle Resourcing does not match')
    expect(mine?.actionUrl).toBe('/dashboard/ap')
  })
})
