import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, freshWorld } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { generateBill } from '@/lib/money/bill-generate'
import { GET as contractsGet } from '@/app/api/contracts/route'
import { GET as expensesGet } from '@/app/api/expenses/route'
import { GET as expenseAcceptGet } from '@/app/api/expenses/[id]/accept/route'

/**
 * Member lines of a sold team: who reads them, and what they bill (record 120, pods).
 * Calls the real routes as the client's seat and as the selling firm's.
 */
const D = '@demo.etyme.local'
const SELLER_OWNER = `world-brightmoor${D}`
const s: Record<string, any> = {}
const sale = (tx: Prisma.TransactionClient, o: Partial<SellPodInput> = {}) => sellPod(tx, { ...s.input, ...o })
const contractsAs = async (email: string) => { as(email); return json(await contractsGet(req('GET', '/api/contracts?limit=200'))) }
const NAMES = ['Ada Quillfeather', 'Bram Oakhollow']

describe('a team sold as outcome work is never the client’s to read, and an on-site team is read as any contractor on site', () => {
  beforeAll(async () => {
    await freshWorld()
    const seller = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })
    s.seller = seller.id
    s.client = client.id
    const acceptor = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran', contexts: { some: { companyId: client.id, revokedAt: null } } }, select: { id: true, primaryEmail: true } })
    s.acceptor = acceptor.id
    s.clientEmail = acceptor.primaryEmail
    const people: string[] = []
    for (const name of NAMES) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.tl@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      people.push(p.id)
    }
    s.people = people
    const pod = await prisma.pod.create({
      data: {
        companyId: seller.id, name: 'Data platform team', pricing: 'RATE_CARD', currency: 'USD',
        roles: { create: [
          { title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: people[0] } } },
          { title: 'Analyst', headcount: 1, rateCents: 9_000, sortOrder: 1, members: { create: { personId: people[1] } } },
        ] },
      },
      select: { id: true },
    })
    s.input = {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id,
      projectName: 'Data platform build', kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD', decidedBy: acceptor.id,
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.UTC(2027, 2, n * 7)) })),
    } satisfies SellPodInput
  }, 240_000)

  it('a sale not marked on site writes a project with onSite false', async () => {
    const r = await prisma.$transaction((tx) => sale(tx))
    expect(r.ok, JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    s.outcome = r
    expect((await prisma.podProject.findUniqueOrThrow({ where: { id: r.podProjectId } })).onSite).toBe(false)
  })

  it('the invented reference rate is gone from every line a milestone sale wrote', async () => {
    const lines = await prisma.sellContract.findMany({ where: { projectOrderId: s.outcome.projectOrderId }, select: { billRate: true } })
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.billRate === 0)).toBe(true)
  })

  it('the plan as sold is written once on every deliverable: its due date and its amount', async () => {
    const rows = await prisma.podDeliverable.findMany({ where: { podProjectId: s.outcome.podProjectId }, include: { milestone: true } })
    expect(rows).toHaveLength(3)
    for (const d of rows) {
      expect(d.baselineAmountCents).toBe(1_000_000)
      expect(d.baselineDueOn?.toISOString()).toBe(d.milestone.dueOn?.toISOString())
    }
  })

  it('a team sale’s log line says the price in its own currency', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'POD_SOLD', companyId: s.seller } })
    expect(log.summary).toContain('$30,000.00')
    expect(log.summary).not.toMatch(/cents/)
  })

  it('a team sold as outcome work shows no member name, id or rate on the client’s Contracts', async () => {
    const r = await contractsAs(s.clientEmail)
    expect(r.status).toBe(200)
    const text = JSON.stringify(r.body)
    for (const n of NAMES) expect(text).not.toContain(n)
    for (const id of s.people) expect(text).not.toContain(id)
    expect(r.body.data.contracts.some((c: any) => c.masterContract?.id === s.outcome.projectOrderId)).toBe(false)
  })

  it('the selling firm reads its own member lines, with no rate of zero per hour', async () => {
    const r = await contractsAs(SELLER_OWNER)
    const mine = r.body.data.contracts.filter((c: any) => NAMES.includes(c.person?.name))
    expect(mine).toHaveLength(2)
    for (const c of mine) {
      expect(c.billRate).toBeNull()
      expect(c.billedByDeliverable).toBe(true)
      expect(c.masterContract).not.toHaveProperty('podProject')
    }
  })

  it('a member’s hours on outcome work never raise a bill line, and her expense is left off the client’s bill', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({ where: { projectOrderId: s.outcome.projectOrderId, personId: s.people[0] } })
    await prisma.sellContract.updateMany({ where: { projectOrderId: s.outcome.projectOrderId }, data: { state: 'IN_PROGRESS' } })
    const now = new Date()
    const ts = await prisma.timesheet.create({
      data: {
        sellContractId: line.id, personId: s.people[0], periodStart: new Date(Date.UTC(2027, 0, 3)), periodEnd: new Date(Date.UTC(2027, 0, 9)),
        days: { '2027-01-04': 8 }, totalHours: 8, status: 'APPROVED', submittedAt: now, clientApprovedAt: now, employerAcceptedAt: now,
      },
    })
    const expense = await prisma.expense.create({
      data: {
        companyId: s.seller, sellContractId: line.id, personId: s.people[0], category: 'TRAVEL', billable: true, description: 'Train',
        periodStart: new Date(Date.UTC(2027, 0, 4)), periodEnd: new Date(Date.UTC(2027, 0, 4)), items: [], total: 40, currency: 'USD', status: 'APPROVED', approvedAt: now,
      },
    })
    s.timesheet = ts.id
    s.expense = expense.id
    await prisma.orderMilestone.updateMany({ where: { orderId: s.outcome.workOrderId }, data: { status: 'ACCEPTED', acceptedAt: now } })
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made: any = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.outcome.engagementId }, { status: 'DRAFT' })
    expect(made.ok, JSON.stringify(made.body)).toBe(true)
    const lines = await prisma.invoiceLine.findMany({ where: { invoice: { engagementId: s.outcome.engagementId } }, select: { timesheetId: true, expenseId: true, milestoneId: true, personId: true, sellContractId: true } })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.milestoneId !== null && l.timesheetId === null && l.expenseId === null && l.personId === null)).toBe(true)
  })

  it('the client’s expense book never lists a member’s expense on outcome work, and its acceptance route says there is none', async () => {
    as(s.clientEmail)
    const book = await json(await expensesGet(req('GET', '/api/expenses')))
    expect(JSON.stringify(book.body)).not.toContain(s.expense)
    expect(JSON.stringify(book.body)).not.toContain(NAMES[0])
    const one = await json(await expenseAcceptGet(req('GET', `/api/expenses/${s.expense}/accept`), { params: Promise.resolve({ id: s.expense }) } as any))
    expect(one.status).toBe(404)
  })

  it('a member’s expense on outcome work has no client step: the selling firm’s own approval is the top', async () => {
    as(SELLER_OWNER)
    const one = await json(await expenseAcceptGet(req('GET', `/api/expenses/${s.expense}/accept`), { params: Promise.resolve({ id: s.expense }) } as any))
    expect(one.status).toBe(200)
    expect(JSON.stringify(one.body)).not.toContain('Northbend')
  })

  it('an offer marked on site writes a project with onSite true, and the client reads the members by name and never a rate', async () => {
    const r = await prisma.$transaction((tx) => sale(tx, { onSite: true, projectName: 'Data platform on site' }))
    expect(r.ok, JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    expect((await prisma.podProject.findUniqueOrThrow({ where: { id: r.podProjectId } })).onSite).toBe(true)
    const got = await contractsAs(s.clientEmail)
    const seen = got.body.data.contracts.filter((c: any) => NAMES.includes(c.person?.name))
    expect(seen).toHaveLength(2)
    for (const c of seen) expect(c.billRate).toBeNull()
    expect(JSON.stringify(got.body)).not.toMatch(/podProject|onSite/)
  })
})
