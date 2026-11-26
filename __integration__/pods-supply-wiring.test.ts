import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { GET as marginGet } from '@/app/api/pods/projects/[id]/margin/route'
import { GET as teamsGet } from '@/app/api/pods/route'
import { PATCH as teamPatch, POST as teamPost, DELETE as teamDelete } from '@/app/api/pods/[id]/route'

/**
 * A sold team, from the supplier's side (record 120, pods): who reads what
 * it earned, and what can no longer be changed under the client.
 */

const D = '@demo.etyme.local'
const SELLER_OWNER = `world-brightmoor${D}`
const s: Record<string, any> = {}
const margin = async (id: string) => json(await marginGet(req('GET', `/api/pods/projects/${id}/margin`), { params: Promise.resolve({ id }) }))
const one = async (fn: any, method: string, body?: unknown, qs = '') => json(await fn(req(method, `/api/pods/${s.pod}${qs}`, body), { params: Promise.resolve({ id: s.pod }) }))
const refusalRows = () => prisma.accessLog.count({ where: { action: 'CONTRACT_VIEW', reason: { contains: "sold team's margin" } } })

describe('a sold team: its margin is the supplier’s, and the team stands still while the project is open', () => {
  beforeAll(async () => {
    await freshWorld()
    const seller = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    await prisma.company.update({ where: { id: seller.id }, data: { pluginsOn: ['PODS'] } })
    const acceptor = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran', contexts: { some: { companyId: client.id, revokedAt: null } } }, select: { id: true, primaryEmail: true } })
    s.clientEmail = acceptor.primaryEmail
    const people: string[] = []
    for (const name of ['Ada Quillfeather', 'Bram Oakhollow']) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.wiring@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      people.push(p.id)
      s[name] = p.primaryEmail
    }
    const pod = await prisma.pod.create({
      data: {
        companyId: seller.id, name: 'Data platform team', pricing: 'RATE_CARD', currency: 'USD',
        roles: { create: [
          { title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: people[0] } } },
          { title: 'Analyst', headcount: 1, rateCents: 9_000, sortOrder: 1, members: { create: { personId: people[1] } } },
        ] },
      },
      select: { id: true, roles: { select: { id: true, title: true, members: { select: { id: true } } } } },
    })
    s.pod = pod.id
    s.roles = pod.roles
    const input = {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id,
      projectName: 'Data platform build',
      kind: 'MILESTONE', priceCents: 2_000_000, currency: 'USD', decidedBy: acceptor.id,
      deliverables: [1, 2].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: null })),
    } satisfies SellPodInput
    const r = await prisma.$transaction((tx) => sellPod(tx, input))
    if (!r.ok) throw new Error(JSON.stringify(r))
    s.project = r.podProjectId
    s.orderId = r.workOrderId
  }, 240_000)

  it('the supplier’s Owner reads the margin and, before anything is accepted, is told why it is blank', async () => {
    as(SELLER_OWNER)
    const r = await margin(s.project)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.margin.marginCents).toBeNull()
    expect(r.body.data.unknownSays[0]).toBe('Margin shows once a deliverable is accepted')
  })

  it('the project row on the supplier’s list names the client and says it is still open', async () => {
    as(SELLER_OWNER)
    const r = await json(await teamsGet(req('GET', '/api/pods')))
    expect(r.body.data.projects).toEqual([expect.objectContaining({ id: s.project, clientName: expect.any(String), open: true })])
  })

  it('a client is never served the margin, and is told no module of this kind is offered', async () => {
    as(s.clientEmail)
    const r = await margin(s.project)
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.body)).not.toContain('earnedRevenueCents')
  })

  it('a member of the team is never served the margin', async () => {
    as(s['Ada Quillfeather'])
    const r = await margin(s.project)
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.body)).not.toContain('earnedRevenueCents')
  })

  it('a seat at the supplier without margin.read is refused and the refusal is on the log', async () => {
    const role = await prisma.role.create({ data: { companyId: s.sellerId ?? (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })).id, name: 'Reader only', permissions: ['requirements.read'], isDefault: false } })
    const p = await prisma.person.create({ data: { name: 'Rhea Plainfield', primaryEmail: 'rhea.wiring@seed.etyme.invalid' } })
    await prisma.context.create({ data: { personId: p.id, companyId: role.companyId, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Employee' } })
    const before = await refusalRows()
    as('rhea.wiring@seed.etyme.invalid')
    const r = await margin(s.project)
    expect(r.status).toBe(403)
    expect(await refusalRows()).toBe(before + 1)
  })

  it('a project at another firm is not found, never read', async () => {
    as(SELLER_OWNER)
    expect((await margin('no-such-project')).status).toBe(404)
  })

  it('taking a member off a sold team is refused in the sentence naming the client', async () => {
    as(SELLER_OWNER)
    const memberId = s.roles[0].members[0].id
    const r = await one(teamDelete, 'DELETE', undefined, `?memberId=${memberId}`)
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/^Data platform team is sold to .+; change the project, not the team\.$/)
    expect(await prisma.podMember.count({ where: { id: memberId } })).toBe(1)
  })

  it('removing a role, archiving the team and editing its price are refused too, and nothing changes', async () => {
    as(SELLER_OWNER)
    const emptyRole = await prisma.podRole.create({ data: { podId: s.pod, title: 'Spare', headcount: 1, rateCents: 100, sortOrder: 9 }, select: { id: true } })
    const rm = await one(teamDelete, 'DELETE', undefined, `?roleId=${emptyRole.id}`)
    const arch = await one(teamPatch, 'PATCH', { archived: true })
    const price = await one(teamPatch, 'PATCH', { role: { id: s.roles[0].id, rateCents: 99_999 } })
    for (const r of [rm, arch, price]) { expect(r.status).toBe(409); expect(r.body.error.message).toContain('is sold to') }
    const pod = await prisma.pod.findUniqueOrThrow({ where: { id: s.pod }, select: { archivedAt: true } })
    expect(pod.archivedAt).toBeNull()
    expect((await prisma.podRole.findUniqueOrThrow({ where: { id: s.roles[0].id } })).rateCents).toBe(15_000)
    expect(await prisma.podRole.count({ where: { id: emptyRole.id } })).toBe(1)
  })

  it('renaming a sold team is still allowed, because the project carries the deal', async () => {
    as(SELLER_OWNER)
    const r = await one(teamPatch, 'PATCH', { description: 'Platform and analytics' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })

  it('once every deliverable is accepted the team is free to change again', async () => {
    await prisma.orderMilestone.updateMany({ where: { orderId: s.orderId }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    as(SELLER_OWNER)
    const m = await margin(s.project)
    expect(m.body.data.unknownSays.join(' ')).toContain('has no pay record yet')
    const r = await one(teamPatch, 'PATCH', { archived: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })
})
