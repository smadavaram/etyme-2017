import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { sellPod } from '@/lib/money/pod-sale'
import { PATCH as switchPlugin } from '@/app/api/settings/plugins/route'
import { GET as clientView } from '@/app/api/program/pods/route'
import { GET as milestoneList } from '@/app/api/program/milestones/route'
import { POST as deliver } from '@/app/api/program/milestones/[id]/deliver/route'
import { POST as decide } from '@/app/api/program/milestones/[id]/decide/route'

/**
 * The client's side of a sold team, on a world of its own (record 120, pods).
 *
 * NOT COVERED HERE: the proposal and the card for the acceptor. The one
 * approval route (POST /api/twin/approvals/[id]) can carry such a card only
 * with an act kind and a performer in lib/twin and lib/autonomy, which are
 * the architect's. Until they exist the acceptor's yes is stood in for by
 * calling `sellPod` in a transaction, the way the performer will.
 */

const ACCEPTOR = 'pc-acceptor@client.example'
const COLLEAGUE = 'pc-colleague@client.example'
const SELLER = 'pc-owner@seller.example'
const s: Record<string, any> = {}
const idRoute = async (fn: any, email: string, id: string, body?: unknown) => { as(email); return json(await fn(req('POST', '/x', body ?? {}), { params: Promise.resolve({ id }) })) }
const view = async (email: string) => { as(email); return json(await clientView(req('GET', '/api/program/pods'))) }
const states = async (email = ACCEPTOR) => Object.fromEntries((await view(email)).body.data.projects[0].deliverables.map((d: any) => [d.name, d.state]))

describe('the client reads and decides a sold team, through to every deliverable decided', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'pc-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'pc-seller', kind: 'VENDOR', currency: 'USD' } })
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
    s.members = []
    for (const name of ['Ada Quillfeather', 'Bram Oakhollow']) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.pc@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      s.members.push({ id: p.id, name })
    }
    const pod = await prisma.pod.create({
      data: {
        companyId: seller.id, name: 'Data platform team', pricing: 'RATE_CARD', currency: 'USD',
        roles: { create: [
          { title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: s.members[0].id } } },
          { title: 'Analyst', headcount: 1, rateCents: 9_000, sortOrder: 1, members: { create: { personId: s.members[1].id } } },
        ] },
      },
      select: { id: true },
    })
    const sold = await prisma.$transaction((tx) => sellPod(tx, {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: s[ACCEPTOR], decidedBy: s[ACCEPTOR], projectName: 'Data platform build',
      kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD',
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.now() + n * 14 * 86_400_000) })),
    }))
    if (!sold.ok) throw new Error(sold.says)
    s.ms = sold.milestoneIds
    s.order = sold.workOrderId
  }, 240_000)

  it('before anything is handed over the client reads one project with three planned deliverables, its team by role, and who decides', async () => {
    const r = await view(COLLEAGUE)
    expect(r.status).toBe(200)
    const [p] = r.body.data.projects
    expect(p).toMatchObject({ name: 'Data platform build', headcount: 2, fulfilled: false, acceptor: { name: 'Imogen Daleford', isYou: false } })
    expect(p.roles).toEqual([{ title: 'Data engineer', headcount: 1 }, { title: 'Analyst', headcount: 1 }])
    expect(p.deliverables.map((d: any) => [d.name, d.state, d.mayDecide])).toEqual([['Stage 1', 'planned', false], ['Stage 2', 'planned', false], ['Stage 3', 'planned', false]])
    expect(p.deliverables.every((d: any) => d.dueOn)).toBe(true)
  })

  it('the selling firm reads nothing from the client view, because it is not the client', async () => {
    const r = await view(SELLER)
    expect(r.status).toBe(200)
    expect(r.body.data.projects).toEqual([])
  })

  it('the supplier submits all three deliverables for acceptance', async () => {
    for (const id of s.ms) {
      const r = await idRoute(deliver, SELLER, id)
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    expect(await states()).toEqual({ 'Stage 1': 'submitted', 'Stage 2': 'submitted', 'Stage 3': 'submitted' })
  })

  it('a colleague of the acceptor cannot accept a deliverable, is told who decides, and the refusal is logged first', async () => {
    const before = await prisma.accessLog.count({ where: { actorPersonId: s[COLLEAGUE], allowed: false } })
    const r = await idRoute(decide, COLLEAGUE, s.ms[0], { accept: true })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Imogen Daleford was named on this deal as the one who accepts or rejects its deliverables. Ask Imogen Daleford to decide.')
    expect(await prisma.accessLog.count({ where: { actorPersonId: s[COLLEAGUE], allowed: false } })).toBe(before + 1)
    expect(await prisma.accessLog.count({ where: { actorPersonId: s[COLLEAGUE], allowed: false, action: 'DELIVERABLE_DECIDE_REFUSED' } })).toBe(1)
    expect((await prisma.orderMilestone.findUniqueOrThrow({ where: { id: s.ms[0] } })).status).toBe('DELIVERED')
  })

  it('a colleague cannot reject a deliverable either', async () => {
    const r = await idRoute(decide, COLLEAGUE, s.ms[0], { accept: false, reason: 'QUALITY' })
    expect(r.status).toBe(403)
    expect((await prisma.orderMilestone.findUniqueOrThrow({ where: { id: s.ms[0] } })).status).toBe('DELIVERED')
  })

  it('the seller cannot accept its own deliverable', async () => {
    const r = await idRoute(decide, SELLER, s.ms[0], { accept: true })
    expect(r.status).toBe(403)
    expect((await prisma.orderMilestone.findUniqueOrThrow({ where: { id: s.ms[0] } })).status).toBe('DELIVERED')
  })

  it('the client’s own buttons are drawn only for the acceptor', async () => {
    expect((await view(COLLEAGUE)).body.data.projects[0].deliverables.some((d: any) => d.mayDecide)).toBe(false)
    expect((await view(ACCEPTOR)).body.data.projects[0].deliverables.map((d: any) => d.mayDecide)).toEqual([true, true, true])
    as(COLLEAGUE)
    const list = await json(await milestoneList(req('GET', '/api/program/milestones')))
    expect(list.body.data.orders[0].milestones.map((m: any) => m.decider)).toEqual(Array(3).fill({ name: 'Imogen Daleford', isYou: false }))
  })

  it('the acceptor accepts two, and rejecting the third without a reason is refused', async () => {
    for (const id of [s.ms[0], s.ms[1]]) {
      const r = await idRoute(decide, ACCEPTOR, id, { accept: true })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const none = await idRoute(decide, ACCEPTOR, s.ms[2], { accept: false })
    expect(none.status).toBe(409)
    expect((await prisma.orderMilestone.findUniqueOrThrow({ where: { id: s.ms[2] } })).status).toBe('DELIVERED')
  })

  it('the acceptor rejects the third with a reason and the client reads two accepted, one rejected and why', async () => {
    const r = await idRoute(decide, ACCEPTOR, s.ms[2], { accept: false, reason: 'EVIDENCE_MISSING' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await states(COLLEAGUE)).toEqual({ 'Stage 1': 'accepted', 'Stage 2': 'accepted', 'Stage 3': 'rejected' })
    const [p] = (await view(COLLEAGUE)).body.data.projects
    const byName = Object.fromEntries(p.deliverables.map((d: any) => [d.name, d]))
    expect(byName['Stage 3'].reason).toBe('No evidence')
    expect(byName['Stage 1'].acceptedAt).toBeTruthy()
    expect(byName['Stage 3'].acceptedAt).toBeNull()
    expect(p.fulfilled).toBe(false)
  })

  it('the client view holds no member name or id, no rate or cost, no seller or company id, and never the word pod', async () => {
    const text = JSON.stringify((await view(COLLEAGUE)).body)
    for (const m of s.members) { expect(text).not.toContain(m.name); expect(text).not.toContain(m.id) }
    expect(text).not.toContain('Quillbrook')
    expect(text).not.toContain(s.seller)
    expect(text).not.toContain(s.client)
    expect(text).not.toContain(s.order)
    expect(text).not.toMatch(/15000|9000|3000000|1000000|rate|cost|margin|amount/i)
    expect(text).not.toMatch(/pod/i)
    expect(text.toLowerCase()).not.toContain('plugin')
  })

  it('a milestone that is not a team’s deliverable is still decided by any seat at the client', async () => {
    const order = await prisma.workOrder.create({
      data: { number: 'PC-PLAIN-1', title: 'Plain order', issuedById: s.client, issuedToId: s.seller, recordedById: s.client, amount: 500, currency: 'USD', billingBasis: 'MILESTONE', status: 'OPEN', startDate: new Date() },
      select: { id: true },
    })
    const m = await prisma.orderMilestone.create({ data: { orderId: order.id, name: 'Plain stage', amountCents: 50_000, sortOrder: 0, status: 'PENDING' }, select: { id: true } })
    expect((await idRoute(deliver, SELLER, m.id)).status).toBe(200)
    const r = await idRoute(decide, COLLEAGUE, m.id, { accept: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })

  it('the supplier switches the plugin off and the client still reads the project and the acceptor still decides', async () => {
    as(SELLER)
    const off = await json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PODS', on: false })))
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    expect(await states()).toEqual({ 'Stage 1': 'accepted', 'Stage 2': 'accepted', 'Stage 3': 'rejected' })
    // The supplier fixes the third and hands it over again; the plugin does not touch the deliver route.
    expect((await idRoute(deliver, SELLER, s.ms[2])).status).toBe(200)
    expect((await view(COLLEAGUE)).body.data.projects[0].deliverables.map((d: any) => d.mayDecide)).toEqual([false, false, false])
    expect((await idRoute(decide, COLLEAGUE, s.ms[2], { accept: true })).status).toBe(403)
    const yes = await idRoute(decide, ACCEPTOR, s.ms[2], { accept: true })
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    const [p] = (await view(ACCEPTOR)).body.data.projects
    expect(p.fulfilled).toBe(true)
    expect(p.deliverables.map((d: any) => d.state)).toEqual(['accepted', 'accepted', 'accepted'])
  })
})
