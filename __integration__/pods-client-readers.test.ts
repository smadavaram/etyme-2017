import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, resetDatabase } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { GET as programGet } from '@/app/api/program/route'
import { GET as decisionsGet } from '@/app/api/decisions/route'
import { GET as timesheetsGet } from '@/app/api/timesheets/route'
import { GET as peopleGet } from '@/app/api/people/route'
import { GET as personGet } from '@/app/api/people/[id]/route'
import { GET as requisitionsGet } from '@/app/api/requisitions/route'
import { GET as tenureGet } from '@/app/api/tenure/route'
import { GET as horizonGet } from '@/app/api/governance/horizon/route'
import { GET as alumniGet } from '@/app/api/alumni/route'
import { GET as budgetGet } from '@/app/api/program/budget/route'
import { GET as orgGet } from '@/app/api/program/org/route'
import { GET as regionsGet } from '@/app/api/program/regions/route'
import { GET as identityGet } from '@/app/api/identity/route'
import { GET as complianceGet } from '@/app/api/compliance/route'
import { GET as contractsGet } from '@/app/api/contracts/route'
import { GET as suppliersGet } from '@/app/api/suppliers/route'
import { GET as whyGet } from '@/app/api/why/[type]/[id]/route'
import { POST as startIdentityPost } from '@/app/api/program/start-identity/route'
import { POST as approvePost } from '@/app/api/timesheets/[id]/approve/route'
import { POST as decidePost } from '@/app/api/program/milestones/[id]/decide/route'
import { POST as deliverPost } from '@/app/api/program/milestones/[id]/deliver/route'

/**
 * Every client reader of a sold team, called as the client's own seat
 * (record 120, "Pods: member lines and the client"). A team sold as outcome
 * work is never read by the client: no member name, id or rate on any page.
 * A team marked on site is read as any contractor on the client's site: by
 * name, never a rate. The seller's own seat reads its lines as before.
 */
const CLIENT = 'pcr-client@client.example'
const SELLER = 'pcr-owner@seller.example'
const s: Record<string, any> = {}
const OUTCOME = ['Ada Quillfeather', 'Bram Oakhollow']
const ONSITE = ['Cleo Fenwhistle', 'Dov Marlowe']
const get = async (fn: any, url: string, email = CLIENT) => { as(email); return json(await fn(req('GET', url))) }
const idRoute = async (fn: any, email: string, id: string, body?: unknown) => { as(email); return json(await fn(req('POST', '/x', body ?? {}), { params: Promise.resolve({ id }) })) }
const mention = (body: unknown, needles: string[]) => needles.filter((n) => JSON.stringify(body).includes(n))

async function team(companyId: string, names: string[]) {
  const ids: string[] = []
  for (const name of names) {
    const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.pcr@seed.etyme.invalid` } })
    await prisma.context.create({ data: { personId: p.id, companyId, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    ids.push(p.id)
  }
  const pod = await prisma.pod.create({
    data: {
      companyId, name: `${names[0]} team`, pricing: 'RATE_CARD', currency: 'USD',
      roles: { create: names.map((_, i) => ({ title: ['Data engineer', 'Analyst'][i], headcount: 1, rateCents: 15_000 - i * 6_000, sortOrder: i, members: { create: { personId: ids[i] } } })) },
    },
    select: { id: true },
  })
  return { ids, podId: pod.id }
}

describe('a team sold as outcome work is never the client’s to read, and a team on site is read as any contractor on its site', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'pcr-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'pcr-seller', kind: 'VENDOR', currency: 'USD' } })
    Object.assign(s, { client: client.id, seller: seller.id })
    const cRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    const sRole = await prisma.role.create({ data: { companyId: seller.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    for (const [email, name, companyId, roleId, type] of [
      [CLIENT, 'Imogen Daleford', client.id, cRole.id, 'CLIENT_CONTACT'],
      [SELLER, 'Mira Osei', seller.id, sRole.id, 'EMPLOYEE'],
    ] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type, companyId, roleId } })
    }
    const sale = (tx: Prisma.TransactionClient, t: { podId: string }, o: Partial<SellPodInput>) => sellPod(tx, {
      podId: t.podId, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: s[CLIENT], decidedBy: s[CLIENT],
      projectName: 'Data platform build', kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD',
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.now() + n * 14 * 86_400_000) })),
      ...o,
    })
    const a = await team(seller.id, OUTCOME)
    const b = await team(seller.id, ONSITE)
    s.outcomeIds = a.ids
    s.onSiteIds = b.ids
    const one = await prisma.$transaction((tx) => sale(tx, a, {}))
    const two = await prisma.$transaction((tx) => sale(tx, b, { projectName: 'Platform on site', onSite: true }))
    if (!one.ok || !two.ok) throw new Error(JSON.stringify([one, two]))
    s.one = one
    s.two = two
    // Both teams have started, a month ago, and each member filed a week.
    const start = new Date(Date.now() - 35 * 86_400_000)
    await prisma.sellContract.updateMany({ where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } }, data: { state: 'IN_PROGRESS', startDate: start, startConfirmedAt: start } })
    s.lines = await prisma.sellContract.findMany({ where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } }, select: { id: true, personId: true, projectOrderId: true } })
    const weekEnd = new Date(Date.now() - 3 * 86_400_000)
    weekEnd.setUTCHours(0, 0, 0, 0)
    weekEnd.setUTCDate(weekEnd.getUTCDate() - weekEnd.getUTCDay() - 1)
    const weekStart = new Date(weekEnd.getTime() - 6 * 86_400_000)
    s.sheets = {}
    for (const l of s.lines) {
      const ts = await prisma.timesheet.create({
        data: {
          sellContractId: l.id, personId: l.personId, periodStart: weekStart, periodEnd: weekEnd,
          days: { [weekStart.toISOString().slice(0, 10)]: 8 }, totalHours: 8, status: 'SUBMITTED', submittedAt: new Date(),
        },
      })
      s.sheets[l.personId] = ts.id
    }
  }, 240_000)

  const readers: [string, any, string][] = [
    ['Program', programGet, '/api/program'],
    ['Decisions', decisionsGet, '/api/decisions'],
    ['Timesheets', timesheetsGet, '/api/timesheets'],
    ['People', peopleGet, '/api/people'],
    ['Requisitions', requisitionsGet, '/api/requisitions'],
    ['Tenure ledger', tenureGet, '/api/tenure'],
    ['Governance horizon', horizonGet, '/api/governance/horizon'],
    ['Alumni', alumniGet, '/api/alumni'],
    ['Budget', budgetGet, '/api/program/budget'],
    ['Team structure', orgGet, '/api/program/org'],
    ['Regions', regionsGet, '/api/program/regions'],
    ['Identity checks', identityGet, '/api/identity'],
    ['Compliance', complianceGet, '/api/compliance'],
    ['Contracts', contractsGet, '/api/contracts?limit=200'],
  ]

  for (const [label, fn, url] of readers) {
    it(`the client’s ${label} never shows a member of a team sold as outcome work: no name, no id`, async () => {
      const r = await get(fn, url)
      expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(500)
      const body = r.body
      expect(mention(body, OUTCOME)).toEqual([])
      expect(mention(body, s.outcomeIds)).toEqual([])
      expect(mention(body, s.lines.filter((l: any) => l.projectOrderId === s.one.projectOrderId).map((l: any) => l.id))).toEqual([])
    })
  }

  it('the client’s timesheet list never shows the week of a member on outcome work, and a member on site is there by name', async () => {
    const r = await get(timesheetsGet, '/api/timesheets')
    expect(mention(r.body, Object.entries(s.sheets).filter(([p]) => s.outcomeIds.includes(p)).map(([, id]) => id as string))).toEqual([])
    expect(mention(r.body, ONSITE).length).toBeGreaterThan(0)
  })

  it('the client’s Decisions asks it to approve the hours of a member on site and never of a member on outcome work', async () => {
    const r = await get(decisionsGet, '/api/decisions')
    expect(mention(r.body, OUTCOME)).toEqual([])
    expect(mention(r.body, ONSITE).length).toBeGreaterThan(0)
  })

  it('a member on site is read by the client by name and standing, as any contractor on its site, and never with a rate', async () => {
    const r = await get(programGet, '/api/program')
    expect(mention(r.body, ONSITE).length).toBeGreaterThan(0)
    // Every key that names a rate is empty on the client's page, never the reference figure.
    const rates: unknown[] = []
    JSON.parse(JSON.stringify(r.body), (k, v) => { if (/rate/i.test(k) && v !== null && typeof v !== 'object') rates.push(v); return v })
    expect(rates.filter((v) => typeof v === 'number' && v > 0)).toEqual([])
  })

  it('a member on site counts toward the client’s tenure from her start day, and a member on outcome work gives none', async () => {
    const r = await get(tenureGet, '/api/tenure')
    expect(mention(r.body, ONSITE).length).toBeGreaterThan(0)
    expect(mention(r.body, OUTCOME)).toEqual([])
  })

  it('the client’s people list reads one member on site and refuses to open a member of outcome work', async () => {
    as(CLIENT)
    const open = async (id: string) => json(await personGet(req('GET', `/api/people/${id}`), { params: Promise.resolve({ id }) } as any))
    expect((await open(s.outcomeIds[0])).status).toBeGreaterThanOrEqual(400)
    expect((await open(s.onSiteIds[0])).status).toBe(200)
  })

  it('the client cannot ask why of a member line of outcome work, nor answer her start card, and both read as not found', async () => {
    const line = s.lines.find((l: any) => l.projectOrderId === s.one.projectOrderId)
    as(CLIENT)
    const why = await json(await whyGet(req('GET', `/api/why/contract/${line.id}`), { params: Promise.resolve({ type: 'contract', id: line.id }) } as any))
    expect(why.status).toBe(404)
    expect(JSON.stringify(why.body)).not.toContain(OUTCOME[0])
    const card = await json(await startIdentityPost(req('POST', '/api/program/start-identity', { contractId: line.id, confirmed: true })))
    expect(card.status).toBe(404)
    const onSite = s.lines.find((l: any) => l.projectOrderId === s.two.projectOrderId)
    as(CLIENT)
    const open = await json(await whyGet(req('GET', `/api/why/contract/${onSite.id}`), { params: Promise.resolve({ type: 'contract', id: onSite.id }) } as any))
    expect(open.status).toBe(200)
  })

  it('the client’s suppliers list does not count the member lines of outcome work as people here', async () => {
    const r = await get(suppliersGet, '/api/suppliers')
    expect(r.status).toBe(200)
    expect(mention(r.body, OUTCOME)).toEqual([])
  })

  it('the selling firm still reads its own member of outcome work in its Timesheets', async () => {
    const r = await get(timesheetsGet, '/api/timesheets', SELLER)
    expect(mention(r.body, OUTCOME).length).toBeGreaterThan(0)
  })

  it('a member’s week on outcome work is accepted at the top by the selling firm, with no step for the client', async () => {
    const id = s.sheets[s.outcomeIds[0]]
    const byClient = await idRoute(approvePost, CLIENT, id)
    expect(byClient.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(byClient.body)).not.toContain(OUTCOME[0])
    const bySeller = await idRoute(approvePost, SELLER, id)
    expect(bySeller.status, JSON.stringify(bySeller.body)).toBe(200)
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id } })
    expect(row.employerAcceptedAt).not.toBeNull()
    expect(row.clientApprovedAt).not.toBeNull()
    expect(row.status).toBe('APPROVED')
  })

  it('nobody accepts their own week on a team line', async () => {
    const member = await prisma.person.update({ where: { id: s.outcomeIds[1] }, data: { primaryEmail: 'bram.self@seller.example' } })
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { companyId: s.seller, name: 'Owner' } })
    await prisma.context.updateMany({ where: { personId: member.id, companyId: s.seller }, data: { roleId: ownerRole.id } })
    const r = await idRoute(approvePost, 'bram.self@seller.example', s.sheets[s.outcomeIds[1]])
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.body)).toContain('own')
  })

  it('the client approves the hours of a member on site, as for any contractor on its site', async () => {
    const id = s.sheets[s.onSiteIds[0]]
    const r = await idRoute(approvePost, CLIENT, id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id } })).clientApprovedAt).not.toBeNull()
  })

  it('a deliverable accepted before any member has started reads “<name> accepted.” to the client and tells the supplier the step it waits on', async () => {
    const fresh = await prisma.sellContract.findMany({ where: { projectOrderId: s.one.projectOrderId }, select: { id: true } })
    await prisma.sellContract.updateMany({ where: { id: { in: fresh.map((f) => f.id) } }, data: { state: 'DRAFT' } })
    const [first] = s.one.milestoneIds
    const delivered = await idRoute(deliverPost, SELLER, first)
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200)
    const accepted = await idRoute(decidePost, CLIENT, first, { accept: true })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    expect(accepted.body.data.says).toBe('Stage 1 accepted.')
    const told = await prisma.notification.findFirst({ where: { companyId: s.seller, personId: s[SELLER], title: { contains: 'Stage 1' } } })
    expect(told?.body).toContain('Waiting for a team member')
    expect(JSON.stringify(told?.data)).toContain('/dashboard/contracts')
  })
})
