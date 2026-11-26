import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, freshWorld } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { GET as picker } from '@/app/api/invoices/generate/route'
import { generateBill } from '@/lib/money/bill-generate'

/** Accepted deliverables of a sold team, and the member start they wait for (record 120). */
const D = '@demo.etyme.local'
const SELLER_OWNER = `world-brightmoor${D}`
const s: Record<string, any> = {}
const idRoute = async (fn: any, id: string, body?: unknown) => json(await fn(req('POST', '/x', body ?? {}), { params: Promise.resolve({ id }) }))
const sale = (tx: Prisma.TransactionClient, o: Partial<SellPodInput> = {}) => sellPod(tx, { ...s.input, ...o })
const rowCounts = async () => ({
  engagements: await prisma.engagement.count(),
  workOrders: await prisma.workOrder.count(),
  projects: await prisma.projectOrder.count(),
  lines: await prisma.sellContract.count({ where: { projectOrderId: { not: null } } }),
  milestones: await prisma.orderMilestone.count(),
  podProjects: await prisma.podProject.count(),
  deliverables: await prisma.podDeliverable.count(),
})

describe('an accepted deliverable says the step it waits on until a team member has started', () => {
  beforeAll(async () => {
    await freshWorld()
    const seller = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    s.seller = seller.id
    s.client = client.id
    // The client's named acceptor: a person with a seat at the client.
    const acceptor = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran', contexts: { some: { companyId: client.id, revokedAt: null } } }, select: { id: true, primaryEmail: true } })
    s.acceptor = acceptor.id
    s.acceptorEmail = acceptor.primaryEmail
    // Two of the seller's own employees: the employment is the consent.
    const people = []
    for (const name of ['Ada Quillfeather', 'Bram Oakhollow']) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.pods@seed.etyme.invalid` } })
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
    s.pod = pod.id
    s.input = {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id,
      projectName: 'Data platform build',
      kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD', decidedBy: acceptor.id,
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.now() + n * 14 * 86_400_000) })),
    } satisfies SellPodInput
  }, 240_000)

  it('the picker lists the project as waiting for a start, naming the people to the supplier, and does not offer it as a bill', async () => {
    const r = await prisma.$transaction((tx) => sale(tx))
    expect(r.ok, JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    Object.assign(s, r)
    await prisma.orderMilestone.updateMany({ where: { orderId: r.workOrderId }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    as(SELLER_OWNER)
    const got = await json(await picker(req('GET', '/api/invoices/generate')))
    expect(got.status).toBe(200)
    expect(got.body.data.engagements.map((e: any) => e.id)).not.toContain(r.engagementId)
    const w = got.body.data.waiting.find((x: any) => x.id === r.engagementId)
    expect(w.says).toContain("Waiting for a team member's start to be confirmed")
    expect(w.says).toContain('Ada Quillfeather')
    expect(w.link.href).toBe('/dashboard/contracts')
  })

  it('pressing Generate on it is refused with the waiting step and a link to where it is done, not "nobody is placed"', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made: any = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.engagementId }, { status: 'DRAFT' })
    expect(made.ok).toBe(false)
    expect(made.body.error.code).toBe('WAITING_FOR_A_START')
    expect(made.body.error.message).not.toContain('Nobody is placed')
    expect(made.body.error.link.href).toBe('/dashboard/contracts')
  })

  it('once one member is running the project is offered as a bill and bills its accepted deliverables', async () => {
    await prisma.sellContract.updateMany({ where: { projectOrderId: s.projectOrderId, personId: s.people[0] }, data: { state: 'IN_PROGRESS' } })
    as(SELLER_OWNER)
    const got = await json(await picker(req('GET', '/api/invoices/generate')))
    expect(got.body.data.engagements.map((e: any) => e.id)).toContain(s.engagementId)
    expect((got.body.data.waiting ?? []).map((x: any) => x.id)).not.toContain(s.engagementId)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made: any = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.engagementId }, { status: 'DRAFT' })
    expect(made.ok, JSON.stringify(made.body)).toBe(true)
  })
})
