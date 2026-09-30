import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'
import { buildProposal, EMPTY_FORM } from '@/lib/interview-proposal'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as proposeRound } from '@/app/api/submissions/[id]/interviews/route'
import { GET as listRounds } from '@/app/api/interviews/route'
import { POST as decideRound } from '@/app/api/interviews/[id]/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'

/**
 * The interview page, from "Make an offer" to a placement, on the seeded
 * world.
 *
 * The page let a client make an offer and then offered no way to place
 * the candidate. This walks a consultant nobody seeded — Juniper Aldana,
 * on Pinnacle's bench — to an offer on the interview page, and reads
 * that page's list as each desk: the hiring manager is offered Place,
 * the AP clerk and the supplier read the award's sentence instead, and
 * once the award is made every one of them reads the placement.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}`, ap: `world-nike-ap${D}` }
const PINNACLE = `world-pinnacle${D}`
const JUNIPER = 'juniper.aldana@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

const inTwoDays = () => {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date, time: '10:00' }
}

/** The offered round, as the interview page's list gives it to this reader. */
async function roundAs(email: string) {
  as(email)
  const r = await json(await listRounds(req('GET', '/api/interviews')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.interviews.find((i: any) => i.id === it_.round)
}

describe('the interview page, from an offer to a placement', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-nike', 'world-pinnacle']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }
    const person = await prisma.person.create({ data: { name: 'Juniper Aldana', primaryEmail: JUNIPER } })
    it_.worker = person.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: person.id, skills: ['Demand planning'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-20), respondedAt: day(-19), grantedAt: day(-19) },
    })
    await prisma.context.create({
      data: { personId: person.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
    })

    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const role = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Demand planning analyst', skills: ['Demand planning'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(role.body?.error, JSON.stringify(role.body)).toBeUndefined()
    it_.requisition = role.body.data.requisition.id

    as(NIKE.programme)
    const sent = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3900 }],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()

    as(PINNACLE)
    const put = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.worker], rate: 3700, fromCompanyId: co['world-pinnacle'],
    })))
    expect(put.body?.error, JSON.stringify(put.body)).toBeUndefined()
    it_.submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.worker } })).id

    const { body, problems } = buildProposal({ ...EMPTY_FORM, stage: 'Panel', mode: 'VIDEO', durationMins: 45, times: [inTwoDays()] })
    expect(problems).toEqual([])
    as(NIKE.hiring)
    const round = await call(proposeRound, 'POST', `/api/submissions/${it_.submission}/interviews`, it_.submission, body)
    expect(round.body?.error, JSON.stringify(round.body)).toBeUndefined()
    it_.round = round.body.data.id

    as(PINNACLE)
    const confirmed = await call(decideRound, 'POST', `/api/interviews/${it_.round}`, it_.round, { action: 'confirm', forConsultant: true })
    expect(confirmed.body?.error, JSON.stringify(confirmed.body)).toBeUndefined()
  }, 240_000)

  it('before the round is decided, the interview page offers nobody Place', async () => {
    const row = await roundAs(NIKE.hiring)
    expect(row.place).toEqual({ kind: 'NONE' })
  })

  it('making an offer tells the client to place the candidate, not to raise a contract by hand', async () => {
    as(NIKE.hiring)
    const offer = await call(decideRound, 'POST', `/api/interviews/${it_.round}`, it_.round, {
      action: 'outcome', outcome: 'OFFER', feedback: 'The team wants her.',
    })
    expect(offer.body?.error, JSON.stringify(offer.body)).toBeUndefined()
    expect(offer.body.data.says).toBe(
      'Juniper Aldana has an offer. Place them to write the contract, the order and the billing dates in one step.'
    )
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })).status).toBe('OFFERED')
  })

  it('the offer tells the supplier and the candidate that placing is the client’s award, and never the client’s notes', async () => {
    // The notices are fire-and-forget; give them a moment to land.
    let rows: { personId: string; body: string; channel: string }[] = []
    for (let i = 0; i < 40 && rows.length < 2; i++) {
      rows = await prisma.notification.findMany({
        where: { entityId: it_.round, title: { contains: 'an offer' } },
        select: { personId: true, body: true, channel: true },
      })
      if (rows.length < 2) await new Promise((r) => setTimeout(r, 50))
    }
    const toCandidate = rows.find((r) => r.personId === it_.worker)
    expect(toCandidate?.channel).toBe('EMAIL')
    expect(toCandidate?.body).toContain('You are placed when Northbend Athletic awards the position.')
    const toSupplier = rows.filter((r) => r.personId !== it_.worker)
    expect(toSupplier.length).toBeGreaterThan(0)
    for (const r of toSupplier) expect(r.body).toContain('Juniper is placed when Northbend Athletic awards the position')
    for (const r of rows) expect(r.body).not.toContain('The team wants her')
  })

  it('the hiring manager is offered Place on the offered round', async () => {
    const row = await roundAs(NIKE.hiring)
    expect(row.place).toEqual({
      kind: 'PLACE',
      says: 'Place Juniper Aldana: this writes the contract, the order and the billing dates in one step.',
    })
  })

  it('the AP clerk reads why she cannot place Juniper, and is offered no button', async () => {
    const row = await roundAs(NIKE.ap)
    expect(row.place.kind).toBe('SAID')
    expect(row.place.says).toContain('Ask them to award Juniper Aldana.')
  })

  it('the supplier reads that Northbend Athletic decides, and is offered no button', async () => {
    const row = await roundAs(PINNACLE)
    expect(row.place).toEqual({
      kind: 'SAID',
      says: 'A supplier never awards its own candidate. Northbend Athletic decides whether Juniper Aldana is placed.',
    })
  })

  it('Place on the interview page is the award: the hiring manager places Juniper and the contract is written', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 3700, startDate: day(3).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.contractId
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })).status).toBe('PLACED')
  })

  it('once placed, every desk reads the placement on the round, and nobody is offered Place again', async () => {
    for (const email of [NIKE.hiring, NIKE.ap, PINNACLE]) {
      const row = await roundAs(email)
      expect(row.place, email).toEqual({ kind: 'PLACED', says: 'Juniper Aldana is placed.', contractId: it_.contract })
    }
  })
})
