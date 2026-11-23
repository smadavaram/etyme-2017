/**
 * Who reads and who owes a decision (record 107, Flow A), through the
 * real routes as real seats: the review of 2026-11-21 and the browser
 * walk of Flow A. Builds its own small firm, so nothing depends on which
 * seeded row is first.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as queue from '@/app/api/decision-items/route'
import * as item from '@/app/api/decision-items/[id]/route'
import * as agents from '@/app/api/decision-items/agents/route'
import * as recordView from '@/app/api/records/[type]/[id]/route'
import * as onboarding from '@/app/api/onboarding/route'
import { openBody, decideBody } from '@/lib/decision-queue'
import { openDecision, decideDecision } from '@/lib/decision-items'

const tag = `dg${Date.now()}`
const w: Record<string, any> = {}
const mail = (n: string) => `${n}.${tag}@example.invalid`
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const rp = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) })
const past = new Date('2026-01-01T00:00:00Z')

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Guard Firm ${tag}`, slug: `guard-firm-${tag}`, kind: 'VENDOR', homePage: 'DECISIONS' } as any })
  w.second = await prisma.company.create({ data: { name: `Second Firm ${tag}`, slug: `second-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Guard Client ${tag}`, slug: `guard-client-${tag}`, kind: 'CLIENT' } })
  const role = (companyId: string, name: string, permissions: string[]) => prisma.role.create({ data: { companyId, name, permissions } })
  w.ownerRole = await role(w.firm.id, 'Owner', ['*'])
  w.adminRole = await role(w.firm.id, 'Admin', ['settings.manage', 'team.manage'])
  w.amRole = await role(w.firm.id, 'Account Manager', ['requirements.write', 'consultants.read'])
  w.secondRole = await role(w.second.id, 'Owner', ['*'])
  const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: mail(n.toLowerCase().replace(/\s/g, '.')) } })
  w.owner = await person('Dana Owner'); w.am = await person('Ravi Accounts'); w.bench = await person('Bo Bench')
  w.paused = await person('Pat Paused'); w.ended = await person('Eve Ended'); w.invited = await person('Ian Invited')
  w.twoSeats = await person('Tess Twofirms')
  const seat = (who: any, roleId: string | null, extra: Record<string, unknown> = {}, companyId = w.firm.id) =>
    prisma.context.create({ data: { personId: who.id, companyId, type: 'EMPLOYEE', roleId, ...extra } as any })
  await seat(w.owner, w.ownerRole.id)
  await seat(w.am, w.amRole.id)
  await seat(w.bench, null, { type: 'CONSULTANT' })
  await seat(w.paused, w.amRole.id, { suspendedAt: past })
  await seat(w.ended, w.adminRole.id, { expiresAt: past })
  // The ended Admin also holds a live seat with no power to decide, so "beside a live seat" is real.
  await seat(w.ended, w.amRole.id)
  await seat(w.invited, w.amRole.id, { invitedAt: past })
  w.twoAtFirm = await seat(w.twoSeats, w.amRole.id)
  w.twoAtSecond = await seat(w.twoSeats, w.secondRole.id, {}, w.second.id)
  w.line = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: w.am.id, billRate: 10000, startDate: new Date('2026-09-01') } })
  w.item = await openDecision({ companyId: w.firm.id, personId: w.owner.id, heldAs: 'Owner', question: 'Renew the client for a year?', ownerPersonId: w.owner.id, openedOn: new Date('2026-11-01'), proof: 'The renewal letter, received by email.' })
})

const post = (url: string, body: unknown) => req('POST', url, body)

describe('a working seat at the firm reads and owes decisions; nobody else does', () => {
  it('a person on the firm’s bench cannot read the firm’s decisions, their proof, the ledger or a record view', async () => {
    as(w.bench.primaryEmail)
    const before = await prisma.accessLog.count({ where: { actorPersonId: w.bench.id, allowed: false } })
    const reads = [
      await queue.GET(req('GET', '/api/decision-items')),
      await item.GET(req('GET', `/api/decision-items/${w.item.id}`), p(w.item.id)),
      await agents.GET(req('GET', '/api/decision-items/agents')),
      await recordView.GET(req('GET', `/api/records/Company/${w.firm.id}`), rp('Company', w.firm.id)),
    ]
    for (const r of reads) {
      const { status, body } = await json(r)
      expect(status).toBe(403)
      expect(body.error.message).toMatch(/bench/)
    }
    expect(await prisma.accessLog.count({ where: { actorPersonId: w.bench.id, allowed: false } })).toBe(before + 4)
  })

  it('the owner picker offers exactly the people a decision may be owed by: no bench, paused or ended seat, and an invited seat may be named', async () => {
    as(w.owner.primaryEmail)
    const { body } = await json(await queue.GET(req('GET', '/api/decision-items')))
    const names = body.data.people.map((x: any) => x.name)
    expect(names).toEqual(expect.arrayContaining(['Dana Owner', 'Ravi Accounts', 'Ian Invited', 'Eve Ended', 'Tess Twofirms']))
    expect(names).not.toContain('Bo Bench')
    expect(names).not.toContain('Pat Paused')
  })

  it('a person on the firm’s bench, or whose seat is paused, cannot be named the owner of a decision', async () => {
    as(w.owner.primaryEmail)
    for (const who of [w.bench, w.paused]) {
      const res = await json(await queue.POST(post('/api/decision-items', openBody({ question: 'Q?', ownerPersonId: who.id, openedOn: '2026-11-02', proof: 'P' }))))
      expect(res.status).toBe(422)
      expect(res.body.error.message).toMatch(/working seat at this firm/)
    }
  })

  it('an invited seat that never signed in may be named owner but cannot decide', async () => {
    const owed = await openDecision({ companyId: w.firm.id, personId: w.owner.id, heldAs: 'Owner', question: 'Approve the new supplier?', ownerPersonId: w.invited.id, openedOn: new Date('2026-11-02'), proof: 'Their form' })
    await expect(decideDecision({ companyId: w.firm.id, personId: w.invited.id, heldAs: 'Account Manager', decisionId: owed.id, verdict: 'APPROVE' })).rejects.toThrow(/Only the person who owes/)
  })

  it('an Admin seat past its end date does not decide, even beside a live seat', async () => {
    await expect(decideDecision({ companyId: w.firm.id, personId: w.ended.id, heldAs: 'Admin', decisionId: w.item.id, verdict: 'APPROVE' })).rejects.toThrow(/Only the person who owes/)
  })

  it('another seat at the firm reads the question and who may read the proof, and never the proof or its history', async () => {
    as(w.am.primaryEmail)
    const { status, body } = await json(await item.GET(req('GET', `/api/decision-items/${w.item.id}`), p(w.item.id)))
    expect(status).toBe(200)
    expect(body.data.question).toBe('Renew the client for a year?')
    expect(body.data.proof).toBeNull()
    expect(body.data.timeline).toEqual([])
    expect(body.data.proofHidden).toMatch(/Dana Owner, who owes this decision/)
    const view = await json(await recordView.GET(req('GET', `/api/records/DecisionItem/${w.item.id}`), rp('DecisionItem', w.item.id)))
    expect(view.status).toBe(403)
  })

  it('the firm’s whole ledger on agent control is read by the Owner, and another seat reads the agents and who reads the ledger', async () => {
    as(w.am.primaryEmail)
    const am = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect([am.body.data.ledger, am.body.data.agents.length]).toEqual([null, 8])
    expect(am.body.data.ledgerHidden).toMatch(/Owner and Admins/)
    as(w.owner.primaryEmail)
    const owner = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(owner.body.data.ledger.total).toBeGreaterThan(0)
  })

  it('a record view opens a record only for a seat that may read that kind of record', async () => {
    const otherAm = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Recruiter', permissions: ['consultants.read'] } })
    await prisma.context.updateMany({ where: { personId: w.am.id, companyId: w.firm.id }, data: { roleId: otherAm.id } })
    as(w.am.primaryEmail)
    const res = await json(await recordView.GET(req('GET', `/api/records/SellContract/${w.line.id}`), rp('SellContract', w.line.id)))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toBe('Your seat cannot read contracts.')
  })

  it('a record with no ledger rows shows its own key fields and says the firm’s ledger began on its first row', async () => {
    as(w.owner.primaryEmail)
    const { body } = await json(await recordView.GET(req('GET', `/api/records/SellContract/${w.line.id}`), rp('SellContract', w.line.id)))
    expect(body.data.facts.map((f: any) => f.label)).toEqual(['Consultant', 'Supplier', 'Client', 'Starts'])
    expect(body.data.emptySays).toMatch(/^Your firm’s ledger began on /)
  })

  it('a decided decision leaves the open list and keeps the age it had when it was decided', async () => {
    as(w.owner.primaryEmail)
    await json(await item.POST(post(`/api/decision-items/${w.item.id}`, decideBody('APPROVE', '', '')), p(w.item.id)))
    const open = await json(await queue.GET(req('GET', '/api/decision-items')))
    expect(open.body.data.items.map((i: any) => i.id)).not.toContain(w.item.id)
    const decided = await json(await queue.GET(req('GET', '/api/decision-items?state=decided')))
    const row = decided.body.data.items.find((i: any) => i.id === w.item.id)
    const days = Math.round((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - Date.UTC(2026, 10, 1)) / 86_400_000)
    expect(row.ageDays).toBe(days)
  })

  it('a person seated at two firms lands by the home setting of the firm her session opens', async () => {
    as(w.twoSeats.primaryEmail)
    const atFirm = await json(await onboarding.GET(req('GET', '/api/onboarding', undefined, { 'x-context-id': w.twoAtFirm.id })))
    const atSecond = await json(await onboarding.GET(req('GET', '/api/onboarding', undefined, { 'x-context-id': w.twoAtSecond.id })))
    expect([atFirm.body.data.company.homePage, atSecond.body.data.company.homePage]).toEqual(['DECISIONS', null])
  })
})
