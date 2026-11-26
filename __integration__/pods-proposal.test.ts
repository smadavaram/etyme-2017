import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { PATCH as switchPlugin } from '@/app/api/settings/plugins/route'
import { GET as teamsGet } from '@/app/api/pods/route'
import { POST as offerRoute } from '@/app/api/pods/[id]/offer/route'
import { POST as decideCard } from '@/app/api/twin/approvals/[id]/route'
import { GET as clientView } from '@/app/api/program/pods/route'
import { POST as deliver } from '@/app/api/program/milestones/[id]/deliver/route'
import { POST as decide } from '@/app/api/program/milestones/[id]/decide/route'
import { generateBill } from '@/lib/money/bill-generate'

/**
 * The supplier's proposal, the whole path through the card (record 120, pods).
 *
 * The supplier offers a team to a client it works with, naming one person
 * there. The route raises one card and writes nothing else on the client's
 * side. A colleague cannot answer it; the named person's yes makes the
 * project through the one approval route; the supplier hands over three
 * deliverables, the named person accepts two and rejects one, and after one
 * member has started the bill run bills the two accepted. Own world.
 */

const ACCEPTOR = 'pp-acceptor@client.example'
const COLLEAGUE = 'pp-colleague@client.example'
const SELLER = 'pp-owner@seller.example'
const READER = 'pp-reader@seller.example'
const s: Record<string, any> = {}
const offerTo = async (email: string, podId: string, body: unknown) => { as(email); return json(await offerRoute(req('POST', `/api/pods/${podId}/offer`, body), { params: Promise.resolve({ id: podId }) })) }
const answer = async (email: string, id: string, body: unknown) => { as(email); return json(await decideCard(req('POST', `/api/twin/approvals/${id}`, body), { params: Promise.resolve({ id }) } as any)) }
const idRoute = async (fn: any, email: string, id: string, body?: unknown) => { as(email); return json(await fn(req('POST', '/x', body ?? {}), { params: Promise.resolve({ id }) })) }
const offers = async (email = SELLER) => { as(email); return (await json(await teamsGet(req('GET', '/api/pods')))).body.data }
const cards = () => prisma.twinAction.count({ where: { action: 'pod.sale.accept', entityId: s.pod } })
const clientRows = async () => ({ projects: await prisma.podProject.count(), orders: await prisma.workOrder.count(), milestones: await prisma.orderMilestone.count(), lines: await prisma.sellContract.count() })
const offer = (o: Record<string, unknown> = {}) => ({
  clientCompanyId: s.client, acceptorEmail: ACCEPTOR, kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD', projectName: 'Data platform build',
  deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: '2027-03-01' })), ...o,
})

describe('the supplier offers a team to a client, and it is sold only by the named person’s yes', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'pp-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'pp-seller', kind: 'VENDOR', currency: 'USD' } })
    const stranger = await prisma.company.create({ data: { name: 'Marlowe Logistics', slug: 'pp-stranger', kind: 'CLIENT', currency: 'USD' } })
    Object.assign(s, { client: client.id, seller: seller.id, stranger: stranger.id })
    // The two work under one agreement, so an offer may go.
    await prisma.masterAgreement.create({ data: { vendorId: seller.id, clientId: client.id, paymentTerms: 30 } })
    const cRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    const sRole = await prisma.role.create({ data: { companyId: seller.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const rRole = await prisma.role.create({ data: { companyId: seller.id, name: 'Reader', permissions: ['requirements.read'] } })
    for (const [email, name, companyId, roleId, type] of [
      [ACCEPTOR, 'Imogen Daleford', client.id, cRole.id, 'CLIENT_CONTACT'],
      [COLLEAGUE, 'Tobias Wrenfield', client.id, cRole.id, 'CLIENT_CONTACT'],
      [SELLER, 'Mira Osei', seller.id, sRole.id, 'EMPLOYEE'],
      [READER, 'Rui Okafor', seller.id, rRole.id, 'EMPLOYEE'],
    ] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type, companyId, roleId } })
    }
    const team = async (name: string, who: string[]) => {
      const ids: string[] = []
      for (const n of who) {
        const p = await prisma.person.create({ data: { name: n, primaryEmail: `${n.split(' ')[0].toLowerCase()}.pp@seed.etyme.invalid` } })
        await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
        ids.push(p.id)
      }
      const pod = await prisma.pod.create({
        data: { companyId: seller.id, name, pricing: 'RATE_CARD', currency: 'USD', roles: { create: ids.map((id, i) => ({ title: `Role ${i + 1}`, headcount: 1, rateCents: 12_000, sortOrder: i, members: { create: { personId: id } } })) } },
        select: { id: true },
      })
      return { id: pod.id, people: ids }
    }
    const a = await team('Data platform team', ['Ada Quillfeather', 'Bram Oakhollow'])
    const b = await team('Reporting team', ['Cleo Ashgrove'])
    Object.assign(s, { pod: a.id, people: a.people, pod2: b.id })
  }, 240_000)

  it('while the plugin is off the offer is refused in one sentence and no card is raised', async () => {
    const r = await offerTo(SELLER, s.pod, offer())
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('PLUGIN_OFF')
    expect(await cards()).toBe(0)
    as(SELLER)
    expect((await json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PODS', on: true })))).status).toBe(200)
  })

  it('a seat that may read jobs but not write them cannot make an offer', async () => {
    const r = await offerTo(READER, s.pod, offer())
    expect(r.status).toBe(403)
    expect(await cards()).toBe(0)
  })

  it('an offer to a firm the seller does not work with is refused and no card is raised', async () => {
    const r = await offerTo(SELLER, s.pod, offer({ clientCompanyId: s.stranger }))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('not a firm you work with yet')
    expect(await cards()).toBe(0)
  })

  it('an address nobody at the client holds as a seat is refused without naming anybody, and no card is raised', async () => {
    const r = await offerTo(SELLER, s.pod, offer({ acceptorEmail: 'nobody@client.example' }))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('acceptorEmail')
    expect(r.body.error.message).toContain('Nobody at Harrowgate Foods holds that address')
    expect(await cards()).toBe(0)
  })

  it('a person with a seat at the seller, not at the client, is refused the same way', async () => {
    const r = await offerTo(SELLER, s.pod, offer({ acceptorEmail: READER }))
    expect(r.status).toBe(422)
    expect(r.body.error.message).not.toContain('Rui')
    expect(await cards()).toBe(0)
  })

  it('deliverables that do not add up to the price are refused and no card is raised', async () => {
    const r = await offerTo(SELLER, s.pod, offer({ priceCents: 3_000_001 }))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('must match exactly')
    expect(await cards()).toBe(0)
  })

  it('a time-and-materials offer that lists deliverables is refused', async () => {
    const r = await offerTo(SELLER, s.pod, offer({ kind: 'TIME_AND_MATERIALS' }))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('deliverables')
    expect(await cards()).toBe(0)
  })

  it('an offer in a currency the team is not priced in is refused', async () => {
    const r = await offerTo(SELLER, s.pod, offer({ currency: 'EUR' }))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('currency')
  })

  it('the supplier lists the firms it may offer to, and the stranger is not one', async () => {
    const d = await offers()
    expect(d.clients.map((c: any) => c.name)).toEqual(['Harrowgate Foods'])
  })

  it('a good offer raises one card for the named person and writes nothing else on the client’s side', async () => {
    const before = await clientRows()
    const r = await offerTo(SELLER, s.pod, offer())
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.card = r.body.data.approvalId
    expect(await cards()).toBe(1)
    expect(await clientRows()).toEqual(before)
    const row = await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.card }, select: { companyId: true, decision: true } })
    expect(row).toEqual({ companyId: s.client, decision: 'PENDING' })
  })

  it('the team reads offered to the client, waiting for the person named', async () => {
    const d = await offers()
    expect(d.offers[s.pod]).toEqual({ client: 'Harrowgate Foods', acceptor: 'Imogen Daleford', decision: 'PENDING', says: 'Offered to Harrowgate Foods, waiting for Imogen Daleford' })
  })

  it('a second offer of the same team while the first waits is refused', async () => {
    const r = await offerTo(SELLER, s.pod, offer())
    expect(r.status).toBe(409)
    expect(await cards()).toBe(1)
  })

  it('a colleague of the named person is refused yes and refused no, and the card stays open', async () => {
    const yes = await answer(COLLEAGUE, s.card, { decision: 'APPROVED', surface: 'WEB' })
    expect(yes.status).toBe(403)
    const no = await answer(COLLEAGUE, s.card, { decision: 'REJECTED', reason: 'No', surface: 'WEB' })
    expect(no.status).toBe(403)
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.card } })).decision).toBe('PENDING')
    expect(await prisma.podProject.count()).toBe(0)
  })

  it('the seller cannot answer its own card, because the card is not at its company', async () => {
    expect((await answer(SELLER, s.card, { decision: 'APPROVED', surface: 'WEB' })).status).toBe(404)
    expect(await prisma.podProject.count()).toBe(0)
  })

  it('the named person’s yes makes the project, its order, three deliverables and its lines in one act', async () => {
    const r = await answer(ACCEPTOR, s.card, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const project = await prisma.podProject.findFirstOrThrow({ where: { podId: s.pod }, select: { id: true, projectOrder: { select: { id: true, name: true, kind: true } }, deliverables: { select: { milestoneId: true } } } })
    expect(project.projectOrder).toMatchObject({ name: 'Data platform build', kind: 'MILESTONE' })
    expect(project.deliverables).toHaveLength(3)
    const order = await prisma.workOrder.findFirstOrThrow({ where: { issuedById: s.client, issuedToId: s.seller }, select: { id: true } })
    s.order = order.id
    s.ms = (await prisma.orderMilestone.findMany({ where: { orderId: order.id }, orderBy: { sortOrder: 'asc' }, select: { id: true } })).map((m) => m.id)
    s.engagement = (await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id }, select: { engagementId: true } })).engagementId
    expect(s.ms).toHaveLength(3)
    expect(await prisma.sellContract.count({ where: { clientCompanyId: s.client } })).toBe(2)
  })

  it('the team now reads sold to the client', async () => {
    expect((await offers()).offers[s.pod]).toMatchObject({ decision: 'APPROVED', says: 'Sold to Harrowgate Foods' })
  })

  it('a sold team cannot be offered again while its project is open', async () => {
    const r = await offerTo(SELLER, s.pod, offer())
    expect(r.status).toBe(409)
  })

  it('the supplier hands over all three deliverables', async () => {
    for (const id of s.ms) expect((await idRoute(deliver, SELLER, id)).status).toBe(200)
  })

  it('a colleague cannot accept a deliverable, and the named person accepts two and rejects one with a reason', async () => {
    expect((await idRoute(decide, COLLEAGUE, s.ms[0], { accept: true })).status).toBe(403)
    for (const id of [s.ms[0], s.ms[1]]) expect((await idRoute(decide, ACCEPTOR, id, { accept: true })).status).toBe(200)
    expect((await idRoute(decide, ACCEPTOR, s.ms[2], { accept: false, reason: 'EVIDENCE_MISSING' })).status).toBe(200)
    as(COLLEAGUE)
    const [p] = (await json(await clientView(req('GET', '/api/program/pods')))).body.data.projects
    expect(p.deliverables.map((d: any) => d.state)).toEqual(['accepted', 'accepted', 'rejected'])
  })

  it('nothing bills while no member has started, and the refusal says nobody is placed', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.engagement }, { status: 'DRAFT' })
    expect(made.ok).toBe(false)
    expect(JSON.stringify((made as any).body)).toContain('Nobody is placed')
  })

  it('once one member has started, the bill run bills the two accepted deliverables and not the rejected one', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({ where: { clientCompanyId: s.client, personId: s.people[0] } })
    await prisma.sellContract.update({ where: { id: line.id }, data: { state: 'IN_PROGRESS' } })
    const company = await prisma.company.findUniqueOrThrow({ where: { id: s.seller }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: s.engagement }, { status: 'DRAFT' })
    expect(made.ok, JSON.stringify((made as any).body)).toBe(true)
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: (made as { invoiceId: string }).invoiceId }, select: { milestoneId: true, amountCents: true } })
    expect(lines.map((l) => l.milestoneId).sort()).toEqual([s.ms[0], s.ms[1]].sort())
    expect(lines.reduce((n, l) => n + (l.amountCents ?? 0), 0)).toBe(2_000_000)
    expect((await prisma.orderMilestone.findUniqueOrThrow({ where: { id: s.ms[2] } })).status).toBe('REJECTED')
  })

  it('a team the named person declines reads declined, nothing is written, and it may be offered again', async () => {
    const r = await offerTo(SELLER, s.pod2, offer({ projectName: 'Reporting build', deliverables: [{ name: 'The reports', amountCents: 3_000_000 }], kind: 'FIXED_PRICE' }))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const before = await clientRows()
    const no = await answer(ACCEPTOR, r.body.data.approvalId, { decision: 'REJECTED', reason: 'Not this quarter', surface: 'WEB' })
    expect(no.status, JSON.stringify(no.body)).toBe(200)
    expect(await clientRows()).toEqual(before)
    expect((await offers()).offers[s.pod2]).toMatchObject({ decision: 'REJECTED', says: 'Declined by Harrowgate Foods' })
    const again = await offerTo(SELLER, s.pod2, offer({ projectName: 'Reporting build', deliverables: [{ name: 'The reports', amountCents: 3_000_000 }], kind: 'FIXED_PRICE' }))
    expect(again.status, JSON.stringify(again.body)).toBe(201)
  })

  it('the decline reason stays with the client and is not on what the supplier reads', async () => {
    expect(JSON.stringify(await offers())).not.toContain('Not this quarter')
  })
})
