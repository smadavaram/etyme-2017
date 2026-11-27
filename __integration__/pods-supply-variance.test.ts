import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { GET as varianceGet } from '@/app/api/pods/projects/[id]/variance/route'
import { GET as podsGet } from '@/app/api/pods/route'

/**
 * Planned against actual on a sold team (records 120, 123), read through the
 * real routes as each seat that may or may not read it.
 */

const D = '@demo.etyme.local'
const SELLER_OWNER = `world-brightmoor${D}`
const s: Record<string, any> = {}
const variance = async (id: string) => json(await varianceGet(req('GET', `/api/pods/projects/${id}/variance`), { params: Promise.resolve({ id }) }))
const list = async () => json(await podsGet(req('GET', '/api/pods')))
const seat = async (name: string, email: string, permissions: string[]) => {
  const role = await prisma.role.create({ data: { companyId: s.sellerId, name, permissions, isDefault: false } })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId: s.sellerId, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Employee' } })
}

describe('a sold team: plan against actual', () => {
  beforeAll(async () => {
    await freshWorld()
    const seller = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })
    s.sellerId = seller.id
    await prisma.company.update({ where: { id: seller.id }, data: { pluginsOn: ['PODS'] } })
    const acceptor = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran', contexts: { some: { companyId: client.id, revokedAt: null } } }, select: { id: true, primaryEmail: true } })
    s.clientEmail = acceptor.primaryEmail
    const people: string[] = []
    for (const name of ['Cora Pennywhistle', 'Dov Ashgrove']) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.variance@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      people.push(p.id)
    }
    const pod = await prisma.pod.create({
      data: {
        companyId: seller.id, name: 'Variance team', pricing: 'RATE_CARD', currency: 'USD',
        roles: { create: [
          { title: 'Engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: people[0] } } },
          { title: 'Analyst', headcount: 1, rateCents: 9_000, sortOrder: 1, members: { create: { personId: people[1] } } },
        ] },
      },
      select: { id: true },
    })
    const input = {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id,
      projectName: 'Variance build', kind: 'MILESTONE', priceCents: 2_000_000, currency: 'USD', decidedBy: acceptor.id,
      deliverables: [
        { name: 'Stage 1', amountCents: 1_000_000, dueOn: new Date('2020-01-15T00:00:00Z') },
        { name: 'Stage 2', amountCents: 1_000_000, dueOn: new Date('2020-02-01T00:00:00Z') },
      ],
    } satisfies SellPodInput
    const r = await prisma.$transaction((tx) => sellPod(tx, input))
    if (!r.ok) throw new Error(JSON.stringify(r))
    s.project = r.podProjectId
    s.orderId = r.workOrderId
    s.projectOrderId = r.projectOrderId
    s.people = people
    await prisma.orderMilestone.updateMany({ where: { orderId: r.workOrderId, name: 'Stage 1' }, data: { status: 'ACCEPTED', acceptedAt: new Date('2020-01-20T00:00:00Z') } })
    const post = (personId: string, amountCents: number, n: string) => prisma.orderPosting.create({
      data: { projectOrderId: r.projectOrderId, companyId: seller.id, kind: 'PAY', amountCents, currency: 'USD', txCurrency: 'USD', txAmountCents: amountCents, postedAt: new Date(), source: 'MANUAL', sourceId: `variance-${n}`, says: 'Pay, written for this test.', personId },
    })
    await post(people[0], -600_000, 'a')
    await post(people[1], -400_000, 'b')
    await seat('Finance only', 'finance.variance@seed.etyme.invalid', ['margin.read'])
    await seat('Jobs only', 'jobs.variance@seed.etyme.invalid', ['requirements.read'])
    await seat('Nothing here', 'nothing.variance@seed.etyme.invalid', ['timesheets.read'])
  }, 240_000)

  it('the supplier’s Owner reads planned value, earned value, schedule variance and index from the plan taken at the sale', async () => {
    as(SELLER_OWNER)
    const r = await variance(s.project)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.variance.schedule).toMatchObject({ pvCents: 2_000_000, evCents: 1_000_000, svCents: -1_000_000, spi: 0.5 })
  })

  it('a deliverable accepted five days after its planned date reads five days late', async () => {
    as(SELLER_OWNER)
    const d = (await variance(s.project)).body.data.variance.deliverables
    expect(d[0]).toMatchObject({ name: 'Stage 1', plannedOn: '2020-01-15', actualOn: '2020-01-20', daysVariance: 5, basis: 'ACCEPTED' })
  })

  it('a deliverable past its date and not accepted reads days overdue and no actual date', async () => {
    as(SELLER_OWNER)
    const d = (await variance(s.project)).body.data.variance.deliverables
    expect(d[1]).toMatchObject({ name: 'Stage 2', plannedOn: '2020-02-01', actualOn: null, basis: 'OVERDUE' })
    expect(d[1].daysVariance).toBeGreaterThan(1000)
  })

  it('actual cost, cost variance and the cost index reach a seat that reads margin', async () => {
    as(SELLER_OWNER)
    const c = (await variance(s.project)).body.data.variance.cost
    expect(c).toMatchObject({ acCents: 1_000_000, cvCents: 0, cpi: 1 })
  })

  it('a seat that reads jobs and not margin gets the schedule and no cost figure', async () => {
    as('jobs.variance@seed.etyme.invalid')
    const r = await variance(s.project)
    expect(r.status).toBe(200)
    expect(r.body.data.variance.schedule.pvCents).toBe(2_000_000)
    expect(r.body.data.variance.cost).toBeNull()
    expect(JSON.stringify(r.body)).not.toContain('acCents')
  })

  it('a Finance seat with margin.read can open the projects page and reads no member or client', async () => {
    as('finance.variance@seed.etyme.invalid')
    const r = await list()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.view).toBe('PROJECTS')
    expect(r.body.data.projects).toEqual([expect.objectContaining({ id: s.project, name: 'Variance build' })])
    const text = JSON.stringify(r.body)
    for (const hidden of ['Cora', 'Dov', 'Marcus', 'Northbend', 'clientName', 'teams', 'people']) expect(text).not.toContain(hidden)
    expect(r.body.data.mayWrite).toBe(false)
  })

  it('a Finance seat reads cost and schedule on a project it opened', async () => {
    as('finance.variance@seed.etyme.invalid')
    const r = await variance(s.project)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.variance.cost.acCents).toBe(1_000_000)
  })

  it('a seat that reads neither jobs nor margin is refused on the page and on the plan', async () => {
    as('nothing.variance@seed.etyme.invalid')
    expect((await list()).status).toBe(403)
    expect((await variance(s.project)).status).toBe(403)
  })

  it('the supplier’s Owner still reads the whole teams page', async () => {
    as(SELLER_OWNER)
    const r = await list()
    expect(r.body.data.view).toBe('TEAMS')
    expect(r.body.data.teams).toHaveLength(1)
  })

  it('a client is never served the plan against actual and sees none of its figures', async () => {
    as(s.clientEmail)
    const r = await variance(s.project)
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.body)).not.toContain('pvCents')
    expect((await list()).status).toBe(403)
  })

  it('a project at another firm is not found', async () => {
    as(SELLER_OWNER)
    expect((await variance('no-such-project')).status).toBe(404)
  })

  it('a deliverable sold before plans were kept reads blank figures with the reason, never a zero', async () => {
    await prisma.podDeliverable.updateMany({ where: { podProjectId: s.project }, data: { baselineAmountCents: null, baselineDueOn: null } })
    as(SELLER_OWNER)
    const v = (await variance(s.project)).body.data.variance
    expect(v.schedule).toMatchObject({ pvCents: null, evCents: null, svCents: null, spi: null })
    expect(v.schedule.unknowns[0]).toContain('no plan was saved')
    expect(v.cost.cvCents).toBeNull()
  })
})
