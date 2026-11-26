import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, freshWorld } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { readPodMargin } from '@/lib/money/pod-margin-read'
import { generateBill } from '@/lib/money/bill-generate'
import { POST as deliver } from '@/app/api/program/milestones/[id]/deliver/route'
import { POST as decide } from '@/app/api/program/milestones/[id]/decide/route'

/**
 * A team sold as a project, from the sale to the milestone bill (record 120, pods).
 *
 * Three deliverables of 10,000.00 each, sold on milestones to a client whose
 * named acceptor says yes. The sale writes every row in one transaction; the
 * existing deliver and decide routes and the existing bill run do the rest.
 * The demand route that calls `sellPod` from the acceptor's yes comes next,
 * so the sale is called directly here, inside a transaction, the way it will be.
 */

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

describe('a team sold as a project, billed on the deliverables the client accepts', () => {
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

  it('a time-and-materials sale that lists deliverables is refused with a sentence and writes nothing', async () => {
    const before = await rowCounts()
    const r = await prisma.$transaction((tx) => sale(tx, { kind: 'TIME_AND_MATERIALS' }))
    expect(r).toMatchObject({ ok: false, field: 'deliverables' })
    expect((r as any).says).toContain('has no deliverables')
    expect(await rowCounts()).toEqual(before)
  })

  it('an acceptor who is on the team is refused and nothing is written', async () => {
    const before = await rowCounts()
    const r = await prisma.$transaction((tx) => sale(tx, { acceptorPersonId: s.people[0] }))
    expect(r).toMatchObject({ ok: false, field: 'acceptorPersonId' })
    expect(await rowCounts()).toEqual(before)
  })

  it('a member who took her bench listing back since the team was built stops the sale', async () => {
    // Ada is an employee, so she passes; Cleo, a bench person who never said yes, does not.
    const cleo = await prisma.person.create({ data: { name: 'Cleo Marshwick', primaryEmail: 'cleo.pods@seed.etyme.invalid' } })
    const role = await prisma.podRole.findFirstOrThrow({ where: { podId: s.pod, title: 'Analyst' }, select: { id: true } })
    const member = await prisma.podMember.create({ data: { podRoleId: role.id, personId: cleo.id } })
    const before = await rowCounts()
    const r = await prisma.$transaction((tx) => sale(tx))
    expect(r).toMatchObject({ ok: false })
    expect((r as any).says).toContain('Cleo Marshwick is not on your bench')
    expect(await rowCounts()).toEqual(before)
    await prisma.podMember.delete({ where: { id: member.id } })
  })

  it('every row of a sale is rolled back when the last write fails', async () => {
    const before = await rowCounts()
    const failing = (tx: Prisma.TransactionClient) =>
      new Proxy(tx, { get: (t, k) => (k === 'podDeliverable' ? { create: () => { throw new Error('the last write failed') } } : (t as any)[k]) }) as Prisma.TransactionClient
    await expect(prisma.$transaction((tx) => sale(failing(tx)))).rejects.toThrow('the last write failed')
    expect(await rowCounts()).toEqual(before)
  })

  it('the client acceptor’s yes writes the engagement, order, project, member lines, milestones and deliverables together', async () => {
    const r = await prisma.$transaction((tx) => sale(tx))
    expect(r.ok, JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    Object.assign(s, r)

    const project = await prisma.projectOrder.findUniqueOrThrow({ where: { id: r.projectOrderId } })
    expect(project).toMatchObject({ kind: 'MILESTONE', clientCompanyId: s.client, companyId: s.seller, budgetCents: 3_000_000, currency: 'USD', engagementId: r.engagementId })

    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: r.workOrderId } })
    expect(order).toMatchObject({ billingBasis: 'MILESTONE', issuedById: s.client, issuedToId: s.seller, engagementId: r.engagementId, currency: 'USD' })
    expect(Number(order.amount)).toBe(30_000)

    const pp = await prisma.podProject.findUniqueOrThrow({ where: { id: r.podProjectId } })
    expect(pp).toMatchObject({ podId: s.pod, projectOrderId: r.projectOrderId, acceptorPersonId: s.acceptor, fulfilledAt: null })

    const lines = await prisma.sellContract.findMany({ where: { projectOrderId: r.projectOrderId }, orderBy: { billRate: 'desc' } })
    expect(lines.map((l) => l.personId)).toEqual(s.people)
    expect(lines.map((l) => l.billRate)).toEqual([15_000, 9_000])
    expect(lines.every((l) => l.state === 'DRAFT' && l.workOrderId === r.workOrderId && l.clientCompanyId === s.client)).toBe(true)

    const milestones = await prisma.orderMilestone.findMany({ where: { orderId: r.workOrderId }, orderBy: { sortOrder: 'asc' } })
    expect(milestones.map((m) => [m.name, m.amountCents, m.status])).toEqual([['Stage 1', 1_000_000, 'PENDING'], ['Stage 2', 1_000_000, 'PENDING'], ['Stage 3', 1_000_000, 'PENDING']])
    expect(milestones.reduce((n, m) => n + m.amountCents, 0)).toBe(project.budgetCents)
    expect(await prisma.podDeliverable.count({ where: { podProjectId: r.podProjectId } })).toBe(3)
    expect(await prisma.automationLog.count({ where: { action: 'POD_SOLD', companyId: s.seller } })).toBe(1)
  })

  it('the client reads the project name the seller gave, and never the team’s own name, on the engagement, the order and the project', async () => {
    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: s.engagementId }, select: { title: true } })
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: s.workOrderId }, select: { title: true } })
    const project = await prisma.projectOrder.findUniqueOrThrow({ where: { id: s.projectOrderId }, select: { name: true } })
    expect([eng.title, order.title, project.name]).toEqual(['Data platform build', 'Data platform build', 'Data platform build'])
    expect([eng.title, order.title, project.name]).not.toContain('Data platform team')
  })

  it('a sale with a project name containing pod is refused and writes nothing', async () => {
    const before = await rowCounts()
    const r = await prisma.$transaction((tx) => sale(tx, { projectName: 'Data pod' }))
    expect(r).toMatchObject({ ok: false, field: 'projectName' })
    expect(await rowCounts()).toEqual(before)
  })

  it('margin is not known before anything is accepted, and says so', async () => {
    const m = await readPodMargin({ companyId: s.seller, personId: s.people[0] }, { scope: 'COMPANY', unitIds: [] }, s.podProjectId)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.margin.marginCents).toBeNull()
    expect(m.margin.unknowns).toContain('No deliverable has been accepted yet, so nothing is earned.')
  })

  it('the seller hands over all three and the client accepts two, through the existing routes', async () => {
    for (const id of s.milestoneIds) {
      as(SELLER_OWNER)
      const d = await idRoute(deliver, id)
      expect(d.status, JSON.stringify(d.body)).toBe(200)
    }
    as(s.acceptorEmail)
    for (const id of s.milestoneIds.slice(0, 2)) {
      const a = await idRoute(decide, id, { accept: true })
      expect(a.status, JSON.stringify(a.body)).toBe(200)
    }
    const states = await prisma.orderMilestone.findMany({ where: { orderId: s.workOrderId }, orderBy: { sortOrder: 'asc' }, select: { status: true, acceptedById: true } })
    expect(states.map((x) => x.status)).toEqual(['ACCEPTED', 'ACCEPTED', 'DELIVERED'])
    expect(states[0].acceptedById).toBe(s.acceptor)
  })

  it('a member starts through her papers and files a week the client signed, which is not billable on a milestone sale', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({ where: { projectOrderId: s.projectOrderId, personId: s.people[0] } })
    // The line has been through its papers and is running. Until one is, nobody is placed and nothing bills.
    await prisma.sellContract.update({ where: { id: line.id }, data: { state: 'IN_PROGRESS' } })
    const end = new Date(); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() - end.getUTCDay() - 1)
    const start = new Date(end.getTime() - 6 * 86_400_000)
    const days: Record<string, number> = {}
    for (let i = 1; i <= 5; i++) days[new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)] = 8
    const sheet = await prisma.timesheet.create({ data: { sellContractId: line.id, personId: line.personId, periodStart: start, periodEnd: end, days, totalHours: 40, status: 'APPROVED', clientApprovedById: s.acceptor, clientApprovedAt: new Date() }, select: { id: true } })
    await prisma.workAssertion.create({ data: { timesheetId: sheet.id, companyId: s.client, role: 'CLIENT_APPROVAL', hours: 40, rateCents: line.billRate, state: 'LIVE', byId: s.acceptor } })
    s.sheet = sheet.id
  })

  it('a milestone project with nobody started bills nothing, and says nobody is placed', async () => {
    // Asked of the same engagement before any line runs would be the same refusal; here a second project proves it.
    const other = await prisma.$transaction((tx) => sale(tx, { deliverables: [{ name: 'Only stage', amountCents: 3_000_000, dueOn: null }], kind: 'FIXED_PRICE' }))
    expect(other.ok, JSON.stringify(other)).toBe(true)
    if (!other.ok) return
    await prisma.orderMilestone.updateMany({ where: { orderId: other.workOrderId }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: other.engagementId }, { status: 'DRAFT' })
    expect(made.ok).toBe(false)
    expect(JSON.stringify((made as any).body)).toContain('Nobody is placed')
  })

  it('the bill run bills only the two accepted deliverables, marks them invoiced, and bills none of the member\u2019s hours', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.engagementId }, { status: 'DRAFT' })
    expect(made.ok, JSON.stringify((made as any).body)).toBe(true)
    const invoiceId = (made as { invoiceId: string }).invoiceId
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId }, select: { milestoneId: true, amountCents: true, timesheetId: true } })
    expect(lines.map((l) => l.milestoneId).sort()).toEqual([...s.milestoneIds.slice(0, 2)].sort())
    expect(lines.reduce((n, l) => n + (l.amountCents ?? 0), 0)).toBe(2_000_000)
    expect(lines.every((l) => l.timesheetId === null)).toBe(true)
    const states = await prisma.orderMilestone.findMany({ where: { orderId: s.workOrderId }, orderBy: { sortOrder: 'asc' }, select: { status: true } })
    expect(states.map((x) => x.status)).toEqual(['INVOICED', 'INVOICED', 'DELIVERED'])
    expect(await prisma.invoiceLine.count({ where: { timesheetId: s.sheet } })).toBe(0)
  })

  it('the same hours do bill once the project is sold on time and materials, so the milestone sale is what held them back', async () => {
    await prisma.projectOrder.update({ where: { id: s.projectOrderId }, data: { kind: 'TIME_AND_MATERIALS' } })
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.engagementId }, { status: 'DRAFT' })
    expect(made.ok, JSON.stringify((made as any).body)).toBe(true)
    expect(await prisma.invoiceLine.count({ where: { timesheetId: s.sheet } })).toBe(1)
    await prisma.projectOrder.update({ where: { id: s.projectOrderId }, data: { kind: 'MILESTONE' } })
  })

  const post = (personId: string | null, kind: 'PAY' | 'BURDEN', amountCents: number, n: string) =>
    prisma.orderPosting.create({
      data: {
        projectOrderId: s.projectOrderId, companyId: s.seller, kind, amountCents, currency: 'USD', txCurrency: 'USD', txAmountCents: amountCents,
        postedAt: new Date(), source: 'MANUAL', sourceId: `pods-sale-${n}`, says: 'Pay on the project, written for this test.', personId,
      },
    })

  it('margin stays unknown while one member has no pay record, and names her', async () => {
    await post(s.people[0], 'PAY', -600_000, 'a')
    const m = await readPodMargin({ companyId: s.seller, personId: s.people[0] }, { scope: 'COMPANY', unitIds: [] }, s.podProjectId)
    if (!m.ok) throw new Error(m.says)
    expect(m.margin.marginCents).toBeNull()
    expect(m.margin.unknowns).toEqual(['Bram Oakhollow has no pay record on this project, so her cost is not known.'])
  })

  it('margin is the two accepted deliverables less pay and burden once every member has a pay record', async () => {
    await post(s.people[1], 'PAY', -400_000, 'b')
    await post(s.people[0], 'BURDEN', -50_000, 'c')
    const m = await readPodMargin({ companyId: s.seller, personId: s.people[0] }, { scope: 'COMPANY', unitIds: [] }, s.podProjectId)
    if (!m.ok) throw new Error(m.says)
    expect(m.margin).toMatchObject({ earnedRevenueCents: 2_000_000, costCents: 1_050_000, marginCents: 950_000, unknowns: [] })
  })

  it('a reader whose reach holds none of the project’s lines is refused, and another firm never reads it', async () => {
    const narrow = await readPodMargin({ companyId: s.seller, personId: s.acceptor }, { scope: 'PERSON', unitIds: [] }, s.podProjectId)
    expect(narrow).toMatchObject({ ok: false, status: 403 })
    const client = await readPodMargin({ companyId: s.client, personId: s.acceptor }, { scope: 'COMPANY', unitIds: [] }, s.podProjectId)
    expect(client).toMatchObject({ ok: false, status: 404 })
  })
})
