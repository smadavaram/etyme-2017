import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import * as offerRoute from '@/app/api/submissions/[id]/offer/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'

/**
 * Chain 2 of record 112: the award reads the accepted offer. Walks the
 * seeded world's client and supplier to a submission, an accepted offer
 * and a placement, and reads the placement's rate and first day.
 */

const D = '@demo.etyme.local'
const NORTHBEND = { programme: `world-northbend-programme${D}`, hiring: `world-northbend-hiring${D}` }
const PINNACLE = `world-pinnacle${D}`
const w: Record<string, any> = {}
const co: Record<string, string> = {}
const p = (id: string) => ({ params: Promise.resolve({ id }) })

const offer = async (email: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown) => {
  as(email)
  const fn = method === 'GET' ? offerRoute.GET : method === 'POST' ? offerRoute.POST : offerRoute.PATCH
  return json(await fn(req(method, `/api/submissions/${w.submission}/offer`, body), p(w.submission)))
}

async function submitTo(personName: string, email: string, title: string) {
  const person = await prisma.person.create({ data: { name: personName, primaryEmail: email } })
  const profile = await prisma.consultantProfile.create({
    data: { personId: person.id, skills: ['Demand planning'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
  })
  await prisma.benchListing.create({
    data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-20), respondedAt: day(-19), grantedAt: day(-19) },
  })
  await prisma.context.create({ data: { personId: person.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } })
  const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-northbend'], code: { startsWith: 'APPS-' } } })
  as(NORTHBEND.hiring)
  const role = await json(await raiseRequisition(req('POST', '/api/requisitions', {
    title, skills: ['Demand planning'], location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
    costCenterId: cc.id, neededBy: day(7).toISOString(),
  })))
  expect(role.body?.error, JSON.stringify(role.body)).toBeUndefined()
  const requisition = role.body.data.requisition.id
  as(NORTHBEND.programme)
  const sent = await json(await distribute(req('POST', `/api/requisitions/${requisition}/distribute`, { vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3900 }] }), p(requisition)))
  expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  as(PINNACLE)
  const put = await json(await submitCandidates(req('POST', '/api/submissions', { requirementId: requisition, personIds: [person.id], rate: 3700, fromCompanyId: co['world-pinnacle'] })))
  expect(put.body?.error, JSON.stringify(put.body)).toBeUndefined()
  return (await prisma.submission.findFirstOrThrow({ where: { requirementId: requisition, personId: person.id } })).id
}

describe('the award reads the accepted offer', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-northbend', 'world-pinnacle']) co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    w.submission = await submitTo('Marlow Quince', 'marlow.quince@seed.etyme.invalid', 'Planning analyst, offer first')
  }, 240_000)

  it('an offer that was proposed but not accepted gives the award nothing to open on', async () => {
    const made = await offer(NORTHBEND.hiring, 'POST', { rate: 41.5, startDate: day(-0).toISOString().slice(0, 10), propose: true })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    w.offer = made.body.data.id
    expect((await offer(NORTHBEND.hiring, 'GET')).body.data.award).toBeNull()
  })

  it('once the answer is recorded as accepted the placement carries the offer’s rate and first day', async () => {
    const start = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10)
    await prisma.offer.update({ where: { id: w.offer }, data: { startDate: new Date(`${start}T00:00:00Z`) } })
    const said = await offer(PINNACLE, 'PATCH', { offerId: w.offer, action: 'ACCEPT' })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
    as(NORTHBEND.hiring)
    const placed = await json(await award(req('POST', `/api/submissions/${w.submission}/award`, {}), p(w.submission)))
    expect(placed.status, JSON.stringify(placed.body)).toBe(201)
    const line = await prisma.sellContract.findFirstOrThrow({ where: { requirementId: (await prisma.submission.findUniqueOrThrow({ where: { id: w.submission } })).requirementId } })
    expect(line.billRate).toBe(4150)
    expect(line.startDate.toISOString().slice(0, 10)).toBe(start)
  })

  it('a rate typed at the award still wins over the offer', async () => {
    const second = await submitTo('Odette Vance', 'odette.vance@seed.etyme.invalid', 'Planning analyst, typed rate')
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: second } })
    const made = await prisma.offer.create({ data: { companyId: co['world-northbend'], submissionId: second, rate: 41.5, state: 'ACCEPTED', liveFor: second } })
    expect(made.id).toBeTruthy()
    as(NORTHBEND.hiring)
    const placed = await json(await award(req('POST', `/api/submissions/${second}/award`, { rate: 3900 }), p(second)))
    expect(placed.status, JSON.stringify(placed.body)).toBe(201)
    expect((await prisma.sellContract.findFirstOrThrow({ where: { requirementId: row.requirementId } })).billRate).toBe(3900)
  })
})
