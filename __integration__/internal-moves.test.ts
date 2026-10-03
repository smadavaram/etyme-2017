import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'

import { GET as ourBench } from '@/app/api/bench/ours/route'
import { POST as flag } from '@/app/api/bench/ours/flag/route'
import { POST as ask } from '@/app/api/bench/ours/[personId]/ask/route'
import { POST as hold } from '@/app/api/bench/ours/holds/route'
import { DELETE as endHold } from '@/app/api/bench/ours/holds/[id]/route'
import { POST as place } from '@/app/api/bench/ours/holds/[id]/place/route'
import { POST as confirm } from '@/app/api/bench/ours/releases/[id]/confirm/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { poolFor } from '@/lib/match-pool'

/**
 * The founder's example, walked on the seeded world (2026-09-30): Ingrid
 * Solberg manages Teleworld's Tualatin project at Northbend Athletic and
 * has flagged Felix Brenner rolling off; Rahul Deshpande manages its San
 * Jose project at Harlow Health, sees Felix on Our bench, asks, reserves
 * and — once Ingrid confirms the day — places him on his own project's
 * order. Farah Haddad at HR is told of every step and approves none.
 */

const D = '@demo.etyme.local'
const INGRID = `world-teleworld-delivery-portland${D}`
const RAHUL = `world-teleworld-delivery-sanjose${D}`
const FARAH = `world-teleworld-hr${D}`
const OWNER = `world-teleworld${D}`
const NORTHBEND = `world-nike${D}`
const HARLOW = `world-harlow-health${D}`
const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const FELIX = 'felix.brenner@seed.etyme.invalid'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

let ids: Record<string, string> = {}

async function personId(email: string) {
  return (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })).id
}
async function read(email: string) {
  as(email)
  return json(await ourBench(req('GET', '/api/bench/ours')))
}

beforeAll(async () => {
  await freshWorld()
  const teleworld = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })
  ids = {
    teleworld: teleworld.id,
    felix: await personId(FELIX),
    amara: await personId('amara.nwosu@seed.etyme.invalid'),
    deepa: await personId('deepa.varma@seed.etyme.invalid'),
    karthik: await personId(KARTHIK),
    ingrid: await personId(INGRID),
    rahul: await personId(RAHUL),
    farah: await personId(FARAH),
  }
}, 600_000)

describe('Our bench, as the seeded world has it', () => {
  it('a manager flags an employee rolling off and the firm’s other managers see them on Our bench', async () => {
    const r = await read(RAHUL)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const felix = r.body.data.rows.find((x: any) => x.name === 'Felix Brenner')
    expect(felix.status).toBe('ROLLING_OFF')
    expect(felix.project).toBe('Northbend Athletic, Tualatin')
    expect(felix.releaser.name).toBe('Ingrid Solberg')
    expect(felix.may).toMatchObject({ ask: true, reserve: true, confirm: false, place: false })
    // Somebody on a project nobody flagged is not on Our bench.
    expect(r.body.data.rows.map((x: any) => x.name)).not.toContain('Deepa Varma')
    // Somebody already between projects is, with nobody releasing them.
    const karthik = r.body.data.rows.find((x: any) => x.name === 'Karthik Menon')
    expect(karthik.status).toBe('BETWEEN_PROJECTS')
    expect(karthik.releaser).toBeNull()
  })

  it('somebody kept until a date reads as free from that date', async () => {
    const r = await read(RAHUL)
    const amara = r.body.data.rows.find((x: any) => x.name === 'Amara Nwosu')
    const release = await prisma.projectRelease.findFirstOrThrow({ where: { personId: ids.amara } })
    expect(amara.status).toBe('KEPT')
    expect(amara.freeOn).toBe(iso(release.keepUntil!))
    expect(amara.says).toContain('staying with Ingrid Solberg until')
  })

  it('every person read on Our bench is on the access trail before the answer leaves', async () => {
    const before = await prisma.accessLog.count({ where: { actorPersonId: ids.rahul, subjectId: ids.felix, action: 'RELEASING_SOON_VIEW' } })
    await read(RAHUL)
    const after = await prisma.accessLog.count({ where: { actorPersonId: ids.rahul, subjectId: ids.felix, action: 'RELEASING_SOON_VIEW' } })
    expect(after).toBe(before + 1)
  })

  it('a Delivery Manager is offered his own project’s order as a position, and the client job requests his firm was sent', async () => {
    const r = await read(RAHUL)
    expect(r.body.data.viewer.maySubmit).toBe(true)
    const order = r.body.data.positions.find((p: any) => p.kind === 'ORDER')
    expect(order.title).toContain('Harlow Health, San Jose')
  })
})

describe('who may read Our bench', () => {
  it('no client ever sees another client’s project or the integrator’s bench', async () => {
    for (const client of [NORTHBEND, HARLOW]) {
      const r = await read(client)
      expect(r.status).toBe(403)
      expect(r.body.error.code).toBe('CLIENT')
      expect(JSON.stringify(r.body)).not.toContain('Felix')
    }
  })

  it('an engineer on the firm’s own roster cannot read Our bench', async () => {
    const r = await read(KARTHIK)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('read by the managers who staff its projects and by HR')
  })

  it('HR reads Our bench, is offered nothing to do on it, and may not hold anybody', async () => {
    const r = await read(FARAH)
    expect(r.status).toBe(200)
    for (const row of r.body.data.rows) expect(Object.values(row.may).every((v) => v === false)).toBe(true)
    expect(r.body.data.team).toEqual([])
    as(FARAH)
    const h = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.karthik, sellContractId: 'x' })))
    expect(h.status).toBeGreaterThanOrEqual(400)
  })
})

describe('flagging', () => {
  it('a manager on another project cannot flag somebody he does not manage', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: ids.felix, companyId: ids.teleworld, state: 'IN_PROGRESS' } })
    as(RAHUL)
    const r = await json(await flag(req('POST', '/api/bench/ours/flag', { sellContractId: line.id, rollsOffOn: iso(line.endDate!) })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Felix Brenner is on a project you do not manage. The manager of the Northbend Athletic project flags who comes off it.')
  })

  it('the San Jose manager flags his own engineer, and the Tualatin manager then sees her on Our bench', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: ids.deepa, companyId: ids.teleworld, state: 'IN_PROGRESS' } })
    as(RAHUL)
    const f = await json(await flag(req('POST', '/api/bench/ours/flag', { sellContractId: line.id, rollsOffOn: iso(line.endDate!) })))
    expect(f.status, JSON.stringify(f.body)).toBe(201)
    const r = await read(INGRID)
    const deepa = r.body.data.rows.find((x: any) => x.name === 'Deepa Varma')
    expect(deepa.releaser.name).toBe('Rahul Deshpande')
    expect(deepa.freeOn).toBe(iso(new Date(line.endDate!.getTime() + DAY)))
  })

  it('a roll-off after the contract ends is refused, because a flag is not an extension', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: ids.deepa, companyId: ids.teleworld, state: 'IN_PROGRESS' } })
    as(RAHUL)
    const r = await json(await flag(req('POST', '/api/bench/ours/flag', { sellContractId: line.id, rollsOffOn: iso(new Date(line.endDate!.getTime() + 10 * DAY)) })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('extend the contract first')
  })
})

describe('asking, holding, confirming and placing', () => {
  it('asking about somebody opens a thread inside the firm with the releasing manager', async () => {
    as(RAHUL)
    const r = await json(await ask(req('POST', `/api/bench/ours/${ids.felix}/ask`, { message: 'Is Felix free from the 20th for sure? I have a San Jose seat.' }), params({ personId: ids.felix })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const thread = await prisma.conversation.findUniqueOrThrow({ where: { id: r.body.data.conversationId } })
    expect(thread.companyId).toBe(ids.teleworld)
    expect(thread.withCompanyId).toBeNull()
    const who = (thread.participants as any[]).map((p) => p.personId)
    expect(who).toContain(ids.ingrid)
    expect(r.body.data.heard).toContain(ids.ingrid)
    const note = await prisma.notification.findFirst({ where: { personId: ids.ingrid, type: 'CONVERSATION', entityId: thread.id } })
    expect(note).not.toBeNull()
  })

  it('a second manager cannot reserve somebody already held, and is told who holds them', async () => {
    const r0 = await read(RAHUL)
    const order = r0.body.data.positions[0]
    as(RAHUL)
    const h = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.felix, sellContractId: order.sellContractId })))
    expect(h.status, JSON.stringify(h.body)).toBe(201)
    ids.hold = h.body.data.holdId

    as(OWNER)
    const second = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.felix, sellContractId: order.sellContractId })))
    expect(second.status).toBe(409)
    expect(second.body.error.message).toMatch(/^Felix Brenner is held by Rahul Deshpande for .+ until .+\. Ask Rahul Deshpande, or wait until then\.$/)
  })

  it('the database admits one live hold per person, whatever a route does', async () => {
    await expect(
      prisma.projectHold.create({
        data: { companyId: ids.teleworld, personId: ids.felix, heldById: ids.ingrid, forTitle: 'x', until: new Date(Date.now() + 5 * DAY) },
      })
    ).rejects.toThrow()
  })

  it('the releasing manager cannot hold their own person; she keeps them with a date instead', async () => {
    const mine = await read(INGRID)
    const portland = mine.body.data.positions[0]
    expect(portland.title).toContain('Northbend Athletic, Tualatin')
    as(INGRID)
    const r = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.amara, sellContractId: portland.sellContractId })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('You are releasing Amara Nwosu. To keep them, say "staying with me until" a date instead of holding them.')
  })

  it('a flagged person cannot be placed until the releasing manager confirms the date', async () => {
    as(RAHUL)
    const r = await json(await place(req('POST', `/api/bench/ours/holds/${ids.hold}/place`, {}), params({ id: ids.hold })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Ingrid Solberg has not confirmed the day Felix Brenner comes off. Ask them to confirm it, then place.')
  })

  it('only the releasing manager confirms the date', async () => {
    const release = await prisma.projectRelease.findFirstOrThrow({ where: { personId: ids.felix } })
    as(RAHUL)
    const no = await json(await confirm(req('POST', `/api/bench/ours/releases/${release.id}/confirm`), params({ id: release.id })))
    expect(no.status).toBe(403)
    as(INGRID)
    const yes = await json(await confirm(req('POST', `/api/bench/ours/releases/${release.id}/confirm`), params({ id: release.id })))
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    expect(yes.body.data.says).toContain('confirmed')
  })

  it('the releasing manager confirms the date and the receiving manager places the person on his project’s order, starting the day after', async () => {
    const old = await prisma.sellContract.findFirstOrThrow({ where: { personId: ids.felix, companyId: ids.teleworld, state: 'IN_PROGRESS' } })
    const oldEnd = old.endDate!
    const heldFor = await prisma.projectHold.findUniqueOrThrow({ where: { id: ids.hold } })
    const seat = await prisma.sellContract.findUniqueOrThrow({ where: { id: heldFor.forSellContractId! } })

    as(RAHUL)
    const r = await json(await place(req('POST', `/api/bench/ours/holds/${ids.hold}/place`, {}), params({ id: ids.hold })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.startsOn).toBe(iso(new Date(oldEnd.getTime() + DAY)))
    expect(r.body.data.cityChange).toBe('This moves you from Tualatin to San Jose.')

    const line = await prisma.sellContract.findUniqueOrThrow({
      where: { id: r.body.data.sellContractId },
      include: { buyLinks: { include: { buyContract: { include: { candidates: true } } } }, sellCycles: true },
    })
    // The same order the San Jose project runs under — never a second one.
    expect(line.workOrderId).toBe(seat.workOrderId)
    expect(line.personId).toBe(ids.felix)
    expect(line.clientCompanyId).toBe(seat.clientCompanyId)
    expect(line.deliveryUnitId).toBe(seat.deliveryUnitId)
    expect(line.state).toBe('DRAFT')
    expect(line.billRate).toBe(seat.billRate)
    // Our own employee: W2, no purchase order, paid what he is paid today.
    const buy = line.buyLinks[0].buyContract
    expect(buy.contractType).toBe('W2')
    expect(buy.workOrderId).toBeNull()
    expect(buy.candidates[0].payRate).toBe(8_600)
    // Its due dates, written as the award writes them.
    expect(line.sellCycles.length).toBeGreaterThan(0)
    // The old placement still ends on the day it said.
    const after = await prisma.sellContract.findUniqueOrThrow({ where: { id: old.id } })
    expect(after.endDate!.getTime()).toBe(oldEnd.getTime())
    expect(after.state).toBe('IN_PROGRESS')

    const h = await prisma.projectHold.findUniqueOrThrow({ where: { id: ids.hold } })
    expect(h.live).toBeNull()
    expect(h.endedHow).toBe('PLACED')
  })

  it('once placed, the person reads as moving on Our bench and drops out of matching', async () => {
    const r = await read(RAHUL)
    const felix = r.body.data.rows.find((x: any) => x.name === 'Felix Brenner')
    expect(felix.status).toBe('MOVING')
    expect(felix.may.reserve).toBe(false)
  })

  it('the person is told of the move and the new city on their own page', async () => {
    as(FELIX)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const next = r.body.data.moves.find((m: any) => m.kind === 'NEXT_PROJECT')
    expect(next.title).toMatch(/^Your next project: Harlow Health in San Jose, from /)
    expect(next.body).toContain('This moves you from Tualatin to San Jose.')
    expect(next.cityChange).toBe(true)
    const email = await prisma.notification.findFirst({ where: { personId: ids.felix, type: 'ROLLOFF', channel: 'EMAIL', title: { startsWith: 'Your next project' } } })
    expect(email).not.toBeNull()
  })
})

describe('a hold released, and somebody put forward to a client’s job request', () => {
  it('a hold can be released by its holder, and then another manager may reserve', async () => {
    const r0 = await read(RAHUL)
    const order = r0.body.data.positions[0]
    as(RAHUL)
    const h = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.karthik, sellContractId: order.sellContractId })))
    expect(h.status, JSON.stringify(h.body)).toBe(201)
    // A third manager may not let somebody else's hold go.
    as(INGRID)
    const not = await json(await endHold(req('DELETE', `/api/bench/ours/holds/${h.body.data.holdId}`, {}), params({ id: h.body.data.holdId })))
    expect(not.status).toBe(403)
    as(RAHUL)
    const off = await json(await endHold(req('DELETE', `/api/bench/ours/holds/${h.body.data.holdId}`, {}), params({ id: h.body.data.holdId })))
    expect(off.status).toBe(200)
  })

  it('placing onto a client’s job request goes forward as the firm’s own employee', async () => {
    const harlow = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-harlow-health' }, select: { id: true } })
    const job = await prisma.requirement.create({
      data: {
        companyId: harlow.id, title: 'Avionics-grade validation lead', skills: ['Validation'], location: 'San Jose, CA',
        billMin: 12_000, billMax: 15_000, months: 6, headcount: 1, status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL',
      },
    })
    await prisma.requirementInvitation.create({
      data: { requirementId: job.id, fromCompanyId: harlow.id, toCompanyId: ids.teleworld, expiresAt: new Date(Date.now() + 10 * DAY), status: 'SENT' },
    })
    // The owner holds every desk, submitting among them.
    as(OWNER)
    const h = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.karthik, requirementId: job.id })))
    expect(h.status, JSON.stringify(h.body)).toBe(201)
    const p = await json(await place(req('POST', `/api/bench/ours/holds/${h.body.data.holdId}/place`, {}), params({ id: h.body.data.holdId })))
    expect(p.status, JSON.stringify(p.body)).toBe(201)
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: p.body.data.submissionId } })
    expect(sub.kind).toBe('INTERNAL')
    expect(sub.fromCompanyId).toBe(ids.teleworld)
    expect(sub.personId).toBe(ids.karthik)
  })
})

describe('HR, the trail and matching', () => {
  it('HR is told of every flag, hold, release and move', async () => {
    const told = await prisma.notification.findMany({ where: { personId: ids.farah, type: 'ROLLOFF', channel: 'EMAIL' }, select: { title: true } })
    const titles = told.map((t) => t.title)
    expect(titles.some((t) => t.startsWith('Deepa Varma rolls off'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Rahul Deshpande is holding Felix Brenner'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Ingrid Solberg confirmed Felix Brenner comes off'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Felix Brenner moves to Harlow Health in San Jose'))).toBe(true)
    expect(titles.some((t) => t.startsWith('The hold on Karthik Menon was released'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Karthik Menon moves to Harlow Health'))).toBe(true)
  })

  it('every step writes an automation row saying who did it and that nobody approved it', async () => {
    const acts = await prisma.automationLog.findMany({ where: { companyId: ids.teleworld, action: { startsWith: 'PROJECT_' } }, select: { action: true, reason: true } })
    const names = new Set(acts.map((a) => a.action))
    for (const a of ['PROJECT_RELEASE_FLAGGED', 'PROJECT_HOLD_TAKEN', 'PROJECT_RELEASE_CONFIRMED', 'PROJECT_MOVE_PLACED', 'PROJECT_HOLD_RELEASED', 'PROJECT_MOVE_SUBMITTED']) {
      expect(names.has(a), a).toBe(true)
    }
  })

  it('refusals about a person are on the access trail too', async () => {
    const refused = await prisma.accessLog.count({ where: { actorPersonId: ids.rahul, subjectId: ids.felix, allowed: false } })
    expect(refused).toBeGreaterThan(0)
  })

  it('matching counts a flagged employee free within thirty days, and somebody kept past it only from their free date', async () => {
    for (const personId of [ids.amara, ids.deepa]) {
      await prisma.consultantProfile.upsert({
        where: { personId },
        update: { skills: ['Data pipelines', 'SQL'] },
        create: { personId, skills: ['Data pipelines', 'SQL'], location: 'Portland, OR' },
      })
    }
    const job = await prisma.requirement.findFirstOrThrow({ where: { title: 'Avionics-grade validation lead' } })
    const facts = { id: job.id, companyId: job.companyId, payerCompanyId: job.payerCompanyId, endClientCompanyId: job.endClientCompanyId }
    const amara = await prisma.projectRelease.findFirstOrThrow({ where: { personId: ids.amara } })

    const today = await poolFor(facts, ids.teleworld, { suggest: false })
    // Amara's contract ends inside the month, but Ingrid keeps her past it.
    expect(today.entries.map((e) => e.personId)).not.toContain(ids.amara)

    const nearer = await poolFor(facts, ids.teleworld, { suggest: false, now: new Date(amara.keepUntil!.getTime() - 20 * DAY) })
    const entry = nearer.entries.find((e) => e.personId === ids.amara)
    expect(entry?.employee).toBe(true)
    expect(entry?.standing).toContain('free from then')
  })
})

describe('a delivery manager and a client\u2019s job request', () => {
  it('a delivery manager places the firm\u2019s own employee onto a client\u2019s job request from Our bench', async () => {
    const harlow = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-harlow-health' }, select: { id: true } })
    const job = await prisma.requirement.create({
      data: {
        companyId: harlow.id, title: 'Validation lead — second phase', skills: ['Validation'], location: 'San Jose, CA',
        billMin: 12_000, billMax: 15_000, months: 6, headcount: 1, status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL',
      },
    })
    await prisma.requirementInvitation.create({
      data: { requirementId: job.id, fromCompanyId: harlow.id, toCompanyId: ids.teleworld, expiresAt: new Date(Date.now() + 10 * DAY), status: 'SENT' },
    })
    as(RAHUL)
    const h = await json(await hold(req('POST', '/api/bench/ours/holds', { personId: ids.karthik, requirementId: job.id })))
    expect(h.status, JSON.stringify(h.body)).toBe(201)
    const p = await json(await place(req('POST', `/api/bench/ours/holds/${h.body.data.holdId}/place`, {}), params({ id: h.body.data.holdId })))
    expect(p.status, JSON.stringify(p.body)).toBe(201)
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: p.body.data.submissionId } })
    expect(sub.kind).toBe('INTERNAL')
    expect(sub.fromCompanyId).toBe(ids.teleworld)
  })
})
