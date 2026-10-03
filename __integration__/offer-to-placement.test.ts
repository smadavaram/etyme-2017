import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'
import { buildProposal, EMPTY_FORM } from '@/lib/interview-proposal'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { GET as requisitionDetail } from '@/app/api/requisitions/[id]/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates, GET as listSubmissions } from '@/app/api/submissions/route'
import { POST as proposeRound } from '@/app/api/submissions/[id]/interviews/route'
import { POST as decideRound } from '@/app/api/interviews/[id]/route'
import { PATCH as setStatus } from '@/app/api/submissions/[id]/status/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'

/**
 * From an offer to a first week of hours, on the seeded world.
 *
 * B0 on the founder's fix list. A full lifecycle walk on the demo took a
 * new consultant bench → submitted → interviewed → OFFERED and stopped:
 * no placement and no contract were ever written, so timesheets, invoices
 * and the match could not be reached for anybody placed that day. The
 * award wrote everything and was reachable from one button on one page;
 * the road people actually took was a bare status flip to PLACED that
 * wrote nothing.
 *
 * This walks a consultant nobody seeded — Wren Castellano, on Pinnacle's
 * bench — through every station, with the desk that owns each, and checks
 * at the offer that the only road forward is the award.
 */

const D = '@demo.etyme.local'
const NIKE = {
  programme: `world-nike-programme${D}`,
  hiring: `world-nike-hiring${D}`,
  ap: `world-nike-ap${D}`,
}
const PINNACLE = `world-pinnacle${D}`
const WREN = 'wren.castellano@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

/** A slot the form accepts: a local date and a time, two days out. */
const inTwoDays = () => {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date, time: '10:00' }
}

async function rowFor(email: string, direction: 'sent' | 'received', companyId: string) {
  as(email)
  const r = await json(await listSubmissions(req('GET', `/api/submissions?direction=${direction}&companyId=${companyId}&limit=50`)))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.submissions.find((s: any) => s.id === it_.submission)
}

describe('a fresh consultant, from an offer to a first week of hours', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-nike', 'world-pinnacle']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }
    const wren = await prisma.person.create({ data: { name: 'Wren Castellano', primaryEmail: WREN } })
    it_.worker = wren.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: wren.id, skills: ['Supply planning', 'SAP IBP'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-20), respondedAt: day(-19), grantedAt: day(-19) },
    })
    await prisma.context.create({
      data: { personId: wren.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
    })
  }, 240_000)

  it('the hiring manager raises a role inside plan, and it publishes itself', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Supply planning analyst', skills: ['Supply planning', 'SAP IBP'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.requisition.status).toBe('OPEN')
    it_.requisition = r.body.data.requisition.id

    as(NIKE.programme)
    const sent = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3900 }],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  })

  it('Pinnacle puts Wren forward from its bench', async () => {
    as(PINNACLE)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.worker], rate: 3800, fromCompanyId: co['world-pinnacle'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.worker } })).id
  })

  it('the hiring manager interviews Wren, the supplier confirms, and the round ends in an offer', async () => {
    const { body, problems } = buildProposal({ ...EMPTY_FORM, stage: 'Panel', mode: 'VIDEO', durationMins: 45, times: [inTwoDays()] })
    expect(problems).toEqual([])
    as(NIKE.hiring)
    const round = await call(proposeRound, 'POST', `/api/submissions/${it_.submission}/interviews`, it_.submission, body)
    expect(round.body?.error, JSON.stringify(round.body)).toBeUndefined()
    it_.round = round.body.data.id

    as(PINNACLE)
    const confirmed = await call(decideRound, 'POST', `/api/interviews/${it_.round}`, it_.round, { action: 'confirm', forConsultant: true })
    expect(confirmed.body?.error, JSON.stringify(confirmed.body)).toBeUndefined()

    as(NIKE.hiring)
    const offer = await call(decideRound, 'POST', `/api/interviews/${it_.round}`, it_.round, {
      action: 'outcome', outcome: 'OFFER', feedback: 'Strong on IBP; the team wants her.',
    })
    expect(offer.body?.error, JSON.stringify(offer.body)).toBeUndefined()
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })).status).toBe('OFFERED')
  })

  it('a bare status change to placed is refused for the client, and the sentence points to Place', async () => {
    as(NIKE.hiring)
    const r = await call(setStatus, 'PATCH', `/api/submissions/${it_.submission}/status`, it_.submission, { status: 'PLACED' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('PLACE_BY_AWARD')
    expect(r.body.error.message).toBe(
      'Wren Castellano is placed by awarding the position, which writes the contract, the order and the billing dates in the same step. Press Place on their row.'
    )
    // And it stayed an offer, with nothing half-written behind it.
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })).status).toBe('OFFERED')
    expect(await prisma.sellContract.count({ where: { requirementId: it_.requisition } })).toBe(0)
  })

  it('the supplier asking for placed is told the client places Wren by awarding', async () => {
    as(PINNACLE)
    const r = await call(setStatus, 'PATCH', `/api/submissions/${it_.submission}/status`, it_.submission, { status: 'PLACED' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe(
      'Wren Castellano is placed when Northbend Athletic awards the position, which writes the contract and its billing dates in the same step.'
    )
  })

  it('the offered row offers Place to the hiring manager, and to nobody who would be refused', async () => {
    const hiring = await rowFor(NIKE.hiring, 'received', co['world-nike'])
    expect(hiring.status).toBe('OFFERED')
    expect(hiring.award.open).toBe(true)
    expect(hiring.contractId).toBeNull()

    const clerk = await rowFor(NIKE.ap, 'received', co['world-nike'])
    expect(clerk.award.open).toBe(false)
    expect(clerk.award.says).toContain('Ask them to award Wren Castellano.')

    const supplier = await rowFor(PINNACLE, 'sent', co['world-pinnacle'])
    expect(supplier.award.open).toBe(false)
    expect(supplier.award.says).toBe('A supplier never awards its own candidate. Northbend Athletic decides whether Wren Castellano is placed.')

    // The requisition page answers the same way.
    as(NIKE.hiring)
    const detail = await call(requisitionDetail, 'GET', `/api/requisitions/${it_.requisition}`, it_.requisition)
    const onRole = detail.body.data.candidates.find((c: any) => c.id === it_.submission)
    expect(onRole.award.open).toBe(true)
  })

  it('the supplier cannot award its own candidate, and the refusal names who decides', async () => {
    as(PINNACLE)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, { rate: 3800 })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('OWN_CANDIDATE')
  })

  it('the AP clerk cannot award, because placing is the hiring desk’s', async () => {
    as(NIKE.ap)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, { rate: 3800 })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_HIRING')
  })

  it('the hiring manager places Wren from the offer, and the award writes the contract, both sides and their dates', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 3800, startDate: day(-7).toISOString().slice(0, 10), endDate: day(173).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    it_.contract = r.body.data.contractId

    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract }, include: { buyLinks: true } })
    expect(sell.personId).toBe(it_.worker)
    expect(sell.clientCompanyId).toBe(co['world-nike'])
    expect(sell.companyId).toBe(co['world-pinnacle'])
    expect(sell.buyLinks).toHaveLength(1)
    expect(await prisma.cycle.count({ where: { sellContractId: sell.id } })).toBeGreaterThan(0)
    expect(await prisma.cycle.count({ where: { buyContractId: sell.buyLinks[0].buyContractId } })).toBeGreaterThan(0)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })
    expect(sub.status).toBe('PLACED')
    expect(sub.decidedAt).not.toBeNull()
    // The last seat closes the role.
    expect((await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })).status).toBe('FILLED')
  })

  it('the placed row leads to its placement and offers no second award', async () => {
    const row = await rowFor(NIKE.hiring, 'received', co['world-nike'])
    expect(row.status).toBe('PLACED')
    expect(row.contractId).toBe(it_.contract)
    expect(row.award.open).toBe(false)

    as(NIKE.hiring)
    const again = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, { rate: 3800 })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_AWARDED')
  })

  it('with an I-9 on file the supplier starts Wren, and Wren enters her first week against the contract', async () => {
    const seat = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PINNACLE } })
    await prisma.verification.create({
      data: {
        personId: it_.worker, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-8),
        uploadedById: seat.id, verifiedById: seat.id, verifiedAt: day(-8), result: { outcome: 'CLEAR' },
      },
    })
    as(PINNACLE)
    const started = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, {
      action: 'activate', overrideReason: 'Background check ordered from Sterling, reference ST-44120; Northbend Athletic agreed a start ahead of it in writing.',
    })
    expect(started.body?.error, JSON.stringify(started.body)).toBeUndefined()
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })).state).toBe('IN_PROGRESS')

    const days: Record<string, number> = {}
    for (let i = 0; i < 5; i++) days[day(-7 + i).toISOString().slice(0, 10)] = 8
    as(WREN)
    const week = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.contract,
      periodStart: day(-7).toISOString().slice(0, 10),
      periodEnd: day(-3).toISOString().slice(0, 10),
      days,
    })))
    expect(week.body?.error, JSON.stringify(week.body)).toBeUndefined()
    expect(week.body.data.timesheet.totalHours).toBe(40)
  })
})
