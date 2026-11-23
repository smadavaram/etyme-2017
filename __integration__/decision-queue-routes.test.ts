/**
 * Flow A of record 107, through the real routes as real seats: the home
 * setting, the queue, an item and its three acts, agent control and the
 * record view. Builds its own two small firms, so nothing depends on
 * which seeded row is first.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as queue from '@/app/api/decision-items/route'
import * as item from '@/app/api/decision-items/[id]/route'
import * as agents from '@/app/api/decision-items/agents/route'
import * as records from '@/app/api/decision-items/records/route'
import * as recordView from '@/app/api/records/[type]/[id]/route'
import * as homePage from '@/app/api/settings/home-page/route'
import { openBody, decideBody } from '@/lib/decision-queue'

const tag = `dq${Date.now()}`
const w: Record<string, any> = {}
const mail = (n: string) => `${n}.${tag}@example.invalid`
const p = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Queue Firm ${tag}`, slug: `queue-firm-${tag}`, kind: 'VENDOR' } })
  w.other = await prisma.company.create({ data: { name: `Other Firm ${tag}`, slug: `other-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Client Firm ${tag}`, slug: `client-firm-${tag}`, kind: 'CLIENT' } })
  await prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId: w.client.id, relationship: 'CLIENT' } })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Queue Firm LLC', country: 'US', currency: 'USD' } })
  const role = (companyId: string, name: string, permissions: string[]) => prisma.role.create({ data: { companyId, name, permissions } })
  w.ownerRole = await role(w.firm.id, 'Owner', ['*'])
  w.adminRole = await role(w.firm.id, 'Admin', ['settings.manage', 'people.manage'])
  w.amRole = await role(w.firm.id, 'Account Manager', ['requirements.write', 'submissions.create', 'consultants.read'])
  w.otherOwnerRole = await role(w.other.id, 'Owner', ['*'])
  const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: mail(n.toLowerCase().replace(/\s/g, '.')) } })
  w.owner = await person('Dana Owner'); w.admin = await person('Ivo Admin'); w.am = await person('Ravi Accounts'); w.stranger = await person('Mo Stranger')
  for (const [who, r, c] of [[w.owner, w.ownerRole, w.firm], [w.admin, w.adminRole, w.firm], [w.am, w.amRole, w.firm], [w.stranger, w.otherOwnerRole, w.other]]) {
    await prisma.context.create({ data: { personId: who.id, companyId: c.id, type: 'EMPLOYEE', roleId: r.id } as any })
  }
})

const post = (url: string, body: unknown) => req('POST', url, body)

async function openOne(question: string, extra: Record<string, unknown> = {}) {
  as(w.owner.primaryEmail)
  const res = await json(await queue.POST(post('/api/decision-items', openBody({
    question, ownerPersonId: w.am.id, openedOn: '2025-10-05', actingEntityId: w.entity.id, proof: 'The renewal letter is on file.',
    proofLinks: [{ recordType: 'Company', recordId: w.client.id }], ...extra,
  }))))
  return res
}

describe('the decision queue, through its routes', () => {
  it('the Owner opens a decision with a proof link and it is on the queue with its owner, its age in days and its entity', async () => {
    const res = await openOne('Approve the client renewal for another year?')
    expect(res.status).toBe(201)
    w.itemId = res.body.data.id
    const list = await json(await queue.GET(req('GET', '/api/decision-items?state=open')))
    const row = list.body.data.items.find((i: any) => i.id === w.itemId)
    expect([row.ownerName, row.entityName]).toEqual(['Ravi Accounts', 'Queue Firm LLC'])
    expect(row.ageDays).toBeGreaterThan(365)
    const ledger = await prisma.recordAction.findFirst({ where: { recordId: w.itemId, action: 'OPENED' } })
    expect([ledger?.personId, ledger?.heldAs, ledger?.actingEntityId]).toEqual([w.owner.id, 'Owner', w.entity.id])
  })

  it('the queue lists the oldest decision first', async () => {
    await openOne('Approve the newer supplier change?', { openedOn: '2026-11-01' })
    await openOne('Approve the oldest open change?', { openedOn: '2024-01-02' })
    const list = await json(await queue.GET(req('GET', '/api/decision-items')))
    const days = list.body.data.items.map((i: any) => i.ageDays)
    expect([...days].sort((a, b) => b - a)).toEqual(days)
  })

  it('a seat that is neither the Owner nor an Admin cannot open a decision, and is told so in a sentence', async () => {
    as(w.am.primaryEmail)
    const res = await json(await queue.POST(post('/api/decision-items', openBody({ question: 'x?', ownerPersonId: w.am.id, openedOn: '2026-11-01', actingEntityId: w.entity.id, proof: 'y' }))))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toMatch(/Owner or an Admin/)
  })

  it('a firm with a legal entity cannot open a decision without choosing which entity it is for', async () => {
    as(w.admin.primaryEmail)
    const res = await json(await queue.POST(post('/api/decision-items', openBody({ question: 'x?', ownerPersonId: w.am.id, openedOn: '2026-11-01', proof: 'y' }))))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/Choose which one/)
  })

  it('a proof link to another firm’s record is refused', async () => {
    const res = await openOne('Approve the stranger?', { proofLinks: [{ recordType: 'Company', recordId: w.other.id }] })
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/not on your firm’s book/)
  })

  it('the proof picker offers the firm’s own companies and never another firm’s', async () => {
    as(w.owner.primaryEmail)
    const res = await json(await records.GET(req('GET', '/api/decision-items/records?type=Company&q=')))
    const ids = res.body.data.records.map((r: any) => r.id)
    expect(ids).toContain(w.client.id)
    expect(ids).not.toContain(w.other.id)
  })

  it('send back without a reason is refused in a sentence, and the decision stays open', async () => {
    as(w.am.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.itemId}`, decideBody('SEND_BACK', '', w.entity.id)), p(w.itemId)))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toBe('Say in one line why it is sent back.')
  })

  it('send back with a reason keeps the decision on the queue, with the reason on its row and its age still counting', async () => {
    as(w.am.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.itemId}`, decideBody('SEND_BACK', 'Needs the signed letter first.', w.entity.id)), p(w.itemId)))
    expect(res.status).toBe(200)
    const list = await json(await queue.GET(req('GET', '/api/decision-items')))
    const row = list.body.data.items.find((i: any) => i.id === w.itemId)
    expect(row.sentBackReason).toBe('Needs the signed letter first.')
    expect(row.ageDays).toBeGreaterThan(365)
  })

  it('reject without a reason is refused in a sentence', async () => {
    as(w.am.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.itemId}`, decideBody('REJECT', ' ', w.entity.id)), p(w.itemId)))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toBe('Say in one line why it is rejected.')
  })

  it('a decider at a firm with entities must choose which entity she decides for', async () => {
    as(w.am.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.itemId}`, decideBody('APPROVE', '', '')), p(w.itemId)))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/Choose which one you decide for/)
  })

  it('after approval the item names the decider, the entity, the role she held, the time and the reason, and it leaves the open list', async () => {
    as(w.am.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.itemId}`, decideBody('APPROVE', 'Letter received.', w.entity.id)), p(w.itemId)))
    expect(res.status).toBe(200)
    const one = await json(await item.GET(req('GET', `/api/decision-items/${w.itemId}`), p(w.itemId)))
    const d = one.body.data.decision
    expect([d.verdict, d.personName, d.entityName, d.heldAs, d.reason]).toEqual(['APPROVED', 'Ravi Accounts', 'Queue Firm LLC', 'Account Manager', 'Letter received.'])
    expect(d.at).toBeTruthy()
    const open = await json(await queue.GET(req('GET', '/api/decision-items?state=open')))
    expect(open.body.data.items.some((i: any) => i.id === w.itemId)).toBe(false)
    const decided = await json(await queue.GET(req('GET', '/api/decision-items?state=decided')))
    expect(decided.body.data.items.some((i: any) => i.id === w.itemId)).toBe(true)
  })

  it('a decision already approved cannot be decided again', async () => {
    as(w.owner.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.itemId}`, decideBody('REJECT', 'Changed my mind.', w.entity.id)), p(w.itemId)))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/already closed/)
  })

  it('another firm’s seat cannot open this firm’s decision, and the refusal is logged before it is sent', async () => {
    as(w.stranger.primaryEmail)
    const before = await prisma.accessLog.count({ where: { actorPersonId: w.stranger.id, allowed: false } })
    const res = await json(await item.GET(req('GET', `/api/decision-items/${w.itemId}`), p(w.itemId)))
    expect(res.status).toBe(404)
    expect(await prisma.accessLog.count({ where: { actorPersonId: w.stranger.id, allowed: false } })).toBe(before + 1)
  })
})

describe('agent control and the ledger', () => {
  it('each of the seven agents reads off, no actions today, and no cap, until the Owner switches it on', async () => {
    as(w.am.primaryEmail)
    const res = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(res.body.data.agents).toHaveLength(7)
    for (const a of res.body.data.agents) expect([a.state, a.actionsToday, a.meter, a.cap]).toEqual(['Off', 0, '0 actions', '0 today · no cap'])
  })

  it('the margin baseline line is shown only to a seat that may read margin', async () => {
    as(w.am.primaryEmail)
    const am = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(am.body.data.lines).toEqual(['Consultants billing: baseline pending'])
    as(w.owner.primaryEmail)
    const owner = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(owner.body.data.lines).toContain('Blended margin an hour: baseline pending')
  })

  it('the audit ledger lists the firm’s acts newest first, each with its entity, person and role held, for the firm’s Owner', async () => {
    as(w.owner.primaryEmail)
    const res = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    const rows = res.body.data.ledger.rows
    expect(rows[0].summary).toBe('Approved: Letter received.')
    expect([rows[0].entityName, rows[0].by, rows[0].heldAs]).toEqual(['Queue Firm LLC', 'Ravi Accounts', 'Account Manager'])
    const times = rows.map((r: any) => new Date(r.at).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })
})

describe('the record view', () => {
  it('a decision’s record view shows its whole history from the ledger, oldest first', async () => {
    as(w.am.primaryEmail)
    const res = await json(await recordView.GET(req('GET', `/api/records/DecisionItem/${w.itemId}`), { params: Promise.resolve({ type: 'DecisionItem', id: w.itemId }) }))
    expect(res.status).toBe(200)
    expect(res.body.data.timeline.map((r: any) => r.action)).toEqual(['OPENED', 'SENT_BACK', 'APPROVED'])
    expect(res.body.data.ownPage.href).toBe(`/dashboard/decisions/${w.itemId}`)
  })

  it('a record of another company is refused in a sentence and the refusal is logged first', async () => {
    as(w.am.primaryEmail)
    const before = await prisma.accessLog.count({ where: { actorPersonId: w.am.id, allowed: false, subjectCompanyId: w.other.id } })
    const res = await json(await recordView.GET(req('GET', `/api/records/Company/${w.other.id}`), { params: Promise.resolve({ type: 'Company', id: w.other.id }) }))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toBe('That record is not on your firm’s book, so it cannot be opened here.')
    expect(await prisma.accessLog.count({ where: { actorPersonId: w.am.id, allowed: false, subjectCompanyId: w.other.id } })).toBe(before + 1)
  })
})

describe('the first screen after sign-in', () => {
  it('only the Owner may set the first screen after sign-in', async () => {
    as(w.admin.primaryEmail)
    const res = await json(await homePage.PATCH(req('PATCH', '/api/settings/home-page', { homePage: 'DECISIONS', actingEntityId: w.entity.id })))
    expect(res.status).toBe(403)
  })

  it('the Owner sets the decision queue as the first screen, the firm keeps it, and the change is on the ledger', async () => {
    as(w.owner.primaryEmail)
    const res = await json(await homePage.PATCH(req('PATCH', '/api/settings/home-page', { homePage: 'DECISIONS', actingEntityId: w.entity.id })))
    expect(res.status).toBe(200)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: w.firm.id } })).homePage).toBe('DECISIONS')
    const row = await prisma.recordAction.findFirst({ where: { companyId: w.firm.id, recordType: 'Company', action: 'SETTING_CHANGED' } })
    expect([row?.personId, row?.heldAs]).toEqual([w.owner.id, 'Owner'])
    const back = await json(await homePage.PATCH(req('PATCH', '/api/settings/home-page', { homePage: 'USUAL', actingEntityId: w.entity.id })))
    expect(back.status).toBe(200)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: w.firm.id } })).homePage).toBeNull()
  })
})
