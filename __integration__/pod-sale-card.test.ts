import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { raisePodSaleCard, type PodSaleCardInput } from '@/lib/twin/pod-sale-card'
import { POST as decideRoute } from '@/app/api/twin/approvals/[id]/route'
import { GET as approvalsList } from '@/app/api/twin/approvals/route'
import { GET as decisionsGet } from '@/app/api/decisions/route'

/**
 * A team is sold on the one approval route (record 120, pods): the seller
 * raises a card, only the named acceptor at the client answers it, and the
 * acceptor's yes makes the project. Own world, plugin tables empty.
 */

const ACCEPTOR = 'psc-acceptor@client.example'
const COLLEAGUE = 'psc-colleague@client.example'
const SELLER = 'psc-owner@seller.example'
const s: Record<string, any> = {}
const answer = (email: string, id: string, body: unknown) => {
  as(email)
  return decideRoute(req('POST', `/api/twin/approvals/${id}`, body), { params: Promise.resolve({ id }) } as any).then(json)
}
const counts = async () => ({
  projects: await prisma.podProject.count(),
  orders: await prisma.workOrder.count(),
  milestones: await prisma.orderMilestone.count(),
})
const raise = (o: Partial<PodSaleCardInput> = {}) => prisma.$transaction((tx) => raisePodSaleCard(tx, { ...s.input, ...o }))
const queue = async (email: string) => { as(email); return (await json(await approvalsList(req('GET', '/api/twin/approvals')))).body.data.questions as any[] }

describe('a team sale is decided on the one approval route, by the one named person', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'psc-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'psc-seller', kind: 'VENDOR', currency: 'USD' } })
    Object.assign(s, { client: client.id, seller: seller.id })
    const cRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    const sRole = await prisma.role.create({ data: { companyId: seller.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    for (const [email, name, companyId, roleId, type] of [
      [ACCEPTOR, 'Imogen Daleford', client.id, cRole.id, 'CLIENT_CONTACT'],
      [COLLEAGUE, 'Tobias Wrenfield', client.id, cRole.id, 'CLIENT_CONTACT'],
      [SELLER, 'Mira Osei', seller.id, sRole.id, 'EMPLOYEE'],
    ] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type, companyId, roleId } })
    }
    const people: string[] = []
    for (const name of ['Ada Quillfeather', 'Bram Oakhollow']) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.psc@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      people.push(p.id)
    }
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
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: s[ACCEPTOR], proposedByPersonId: s[SELLER],
      projectName: 'Data platform team', sellerName: 'Quillbrook Staffing',
      kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD',
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.now() + n * 14 * 86_400_000) })),
    } satisfies PodSaleCardInput
  }, 240_000)

  it('a card whose deliverables do not add up to the price is refused with a sentence and no card is raised', async () => {
    const r = await raise({ priceCents: 2_999_999 })
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.says).toMatch(/\S/)
    expect(await prisma.twinApproval.count()).toBe(0)
  })

  it('a card naming somebody who holds no seat at the client is refused and no card is raised', async () => {
    const r = await raise({ acceptorPersonId: s[SELLER] })
    expect(r).toMatchObject({ ok: false, field: 'acceptorPersonId' })
    expect(await prisma.twinApproval.count()).toBe(0)
  })

  it('a card raised inside a transaction that rolls back leaves no card behind', async () => {
    await expect(prisma.$transaction(async (tx) => {
      const r = await raisePodSaleCard(tx, s.input)
      expect(r.ok).toBe(true)
      throw new Error('the supplier’s own save failed')
    })).rejects.toThrow('save failed')
    expect(await prisma.twinApproval.count()).toBe(0)
    expect(await prisma.twinAction.count({ where: { action: 'pod.sale.accept' } })).toBe(0)
  })

  it('the supplier raises the card at the client, waiting on the named acceptor, and nothing is sold yet', async () => {
    const before = await counts()
    const r = await raise()
    expect(r.ok, JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    s.approval = r.approvalId
    const row = await prisma.twinApproval.findUniqueOrThrow({ where: { id: r.approvalId }, include: { twinAction: true } })
    expect(row).toMatchObject({ companyId: s.client, decision: 'PENDING' })
    expect(row.twinAction).toMatchObject({ action: 'pod.sale.accept', outcome: 'AWAITING_APPROVAL', companyId: s.client, authorityPersonId: null })
    expect(row.twinAction.partyCompanyIds.sort()).toEqual([s.client, s.seller].sort())
    expect(row.twinAction.payload).toMatchObject({ acceptorPersonId: s[ACCEPTOR], clientCompanyId: s.client, sellerCompanyId: s.seller, proposedByPersonId: s[SELLER] })
    expect(await counts()).toEqual(before)
  })

  it('a second card for the same team while the first waits is refused', async () => {
    const r = await raise()
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.says).toContain('already waiting')
    expect(await prisma.twinApproval.count()).toBe(1)
  })

  it('the acceptor reads the card in the questions waiting on her and in the decision queue, as hers to answer', async () => {
    const q = (await queue(ACCEPTOR)).find((x) => x.id === s.approval)
    expect(q).toMatchObject({ action: 'pod.sale.accept', mayDecide: true, own: false })
    as(ACCEPTOR)
    const d = (await json(await decisionsGet(req('GET', '/api/decisions')))).body
    const items = (d.data?.decisions ?? d.decisions ?? []) as any[]
    expect(items.some((i) => i.type === 'TWIN_QUESTION' && i.entityId === s.approval)).toBe(true)
  })

  it('nobody else at the client sees the card as theirs, not even an Owner who holds every permission', async () => {
    expect((await queue(COLLEAGUE)).some((x) => x.id === s.approval)).toBe(false)
    as(COLLEAGUE)
    const d = (await json(await decisionsGet(req('GET', '/api/decisions')))).body
    const items = (d.data?.decisions ?? d.decisions ?? []) as any[]
    expect(items.some((i) => i.entityId === s.approval)).toBe(false)
  })

  it('the selling firm does not see the card in its own questions either', async () => {
    expect((await queue(SELLER)).some((x) => x.id === s.approval)).toBe(false)
  })

  it('a colleague of the acceptor cannot say yes, is told who decides, nothing is sold and the refusal is on the ledger', async () => {
    const before = await counts()
    const r = await answer(COLLEAGUE, s.approval, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Imogen Daleford')
    expect(await counts()).toEqual(before)
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.approval } })).decision).toBe('PENDING')
    expect(await prisma.twinAction.count({ where: { approvalId: s.approval, outcome: 'REFUSED', actorId: s[COLLEAGUE] } })).toBe(1)
  })

  it('a colleague of the acceptor cannot say no either, and the card stays open', async () => {
    const r = await answer(COLLEAGUE, s.approval, { decision: 'REJECTED', reason: 'Not for us', surface: 'WEB' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Imogen Daleford')
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.approval } })).decision).toBe('PENDING')
    expect(await prisma.twinAction.count({ where: { approvalId: s.approval, outcome: 'REJECTED' } })).toBe(0)
  })

  it('the seller cannot answer its own card, because the card is not at its company', async () => {
    const r = await answer(SELLER, s.approval, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status).toBe(404)
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.approval } })).decision).toBe('PENDING')
  })

  it('an acceptor whose seat has ended cannot answer, even though her name is on the card', async () => {
    await prisma.context.updateMany({ where: { personId: s[ACCEPTOR], companyId: s.client }, data: { revokedAt: new Date() } })
    const r = await answer(ACCEPTOR, s.approval, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status).toBe(403)
    await prisma.context.updateMany({ where: { personId: s[ACCEPTOR], companyId: s.client }, data: { revokedAt: null } })
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.approval } })).decision).toBe('PENDING')
  })

  it('a yes the sale itself refuses is told in the sale’s own sentence, writes nothing and leaves the card open', async () => {
    await prisma.pod.update({ where: { id: s.pod }, data: { archivedAt: new Date() } })
    const before = await counts()
    const r = await answer(ACCEPTOR, s.approval, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('is deactivated')
    expect(await counts()).toEqual(before)
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.approval } })).decision).toBe('PENDING')
    await prisma.pod.update({ where: { id: s.pod }, data: { archivedAt: null } })
  })

  it('the acceptor’s yes makes the project, its order, lines, milestones and deliverables in one transaction, on the ledger under her name', async () => {
    const r = await answer(ACCEPTOR, s.approval, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.outcome).toBe('PERFORMED')
    const pp = await prisma.podProject.findFirstOrThrow({ where: { podId: s.pod } })
    expect(pp.acceptorPersonId).toBe(s[ACCEPTOR])
    expect(await prisma.podDeliverable.count({ where: { podProjectId: pp.id } })).toBe(3)
    const order = await prisma.workOrder.findFirstOrThrow({ where: { issuedById: s.client, issuedToId: s.seller } })
    expect(await prisma.orderMilestone.count({ where: { orderId: order.id } })).toBe(3)
    const entry = await prisma.twinAction.findFirstOrThrow({ where: { approvalId: s.approval, outcome: 'PERFORMED' } })
    expect(entry).toMatchObject({ actorType: 'PERSON', actorId: s[ACCEPTOR], companyId: s.client, action: 'pod.sale.accept' })
    const approval = await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.approval } })
    expect(approval).toMatchObject({ decision: 'APPROVED', approverPersonId: s[ACCEPTOR] })
    expect(await prisma.automationLog.count({ where: { action: 'POD_SOLD', companyId: s.seller } })).toBe(1)
  })

  it('a second yes on the same card is told somebody already answered and sells nothing twice', async () => {
    const r = await answer(ACCEPTOR, s.approval, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status).toBe(409)
    expect(await prisma.podProject.count({ where: { podId: s.pod } })).toBe(1)
  })

  it('the acceptor’s no needs a reason, is recorded under her name and sells nothing', async () => {
    const again = await prisma.$transaction((tx) => raisePodSaleCard(tx, { ...s.input, deliverables: s.input.deliverables.slice(0, 3) }))
    expect(again.ok, JSON.stringify(again)).toBe(true)
    if (!again.ok) return
    const noReason = await answer(ACCEPTOR, again.approvalId, { decision: 'REJECTED', surface: 'WEB' })
    expect(noReason.status).toBe(422)
    const before = await counts()
    const no = await answer(ACCEPTOR, again.approvalId, { decision: 'REJECTED', reason: 'Not this quarter', surface: 'WEB' })
    expect(no.status, JSON.stringify(no.body)).toBe(200)
    expect(no.body.data.outcome).toBe('REJECTED')
    expect(await counts()).toEqual(before)
    expect(await prisma.twinAction.count({ where: { approvalId: again.approvalId, outcome: 'REJECTED', actorId: s[ACCEPTOR] } })).toBe(1)
  })
})
