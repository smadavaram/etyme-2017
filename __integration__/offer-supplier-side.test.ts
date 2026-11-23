import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import * as offerRoute from '@/app/api/submissions/[id]/offer/route'
import { GET as listSubmissions } from '@/app/api/submissions/route'

/**
 * Chain 2 of record 112, the supplier's side of an offer: she sees the offer made to
 * her candidate and records the answer, cannot change what was offered, and a firm
 * that is not on the deal reads nothing of it.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const PINNACLE = `world-pinnacle${D}`
const OUTSIDER = `world-tecwyn${D}`
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
  const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
  as(NIKE.hiring)
  const role = await json(await raiseRequisition(req('POST', '/api/requisitions', {
    title, skills: ['Demand planning'], location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
    costCenterId: cc.id, neededBy: day(7).toISOString(),
  })))
  expect(role.body?.error, JSON.stringify(role.body)).toBeUndefined()
  const requisition = role.body.data.requisition.id
  as(NIKE.programme)
  const sent = await json(await distribute(req('POST', `/api/requisitions/${requisition}/distribute`, { vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3900 }] }), p(requisition)))
  expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  as(PINNACLE)
  const put = await json(await submitCandidates(req('POST', '/api/submissions', { requirementId: requisition, personIds: [person.id], rate: 3700, fromCompanyId: co['world-pinnacle'] })))
  expect(put.body?.error, JSON.stringify(put.body)).toBeUndefined()
  return (await prisma.submission.findFirstOrThrow({ where: { requirementId: requisition, personId: person.id } })).id
}


const rowOf = async (email: string) => {
  as(email)
  const out = await json(await listSubmissions(req('GET', `/api/submissions?direction=sent&limit=200`)))
  return (out.body?.data?.submissions ?? []).find((s: any) => s.id === w.submission)
}

describe('the supplier’s side of an offer', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-nike', 'world-pinnacle']) co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    w.submission = await submitTo('Rowan Pell', 'rowan.pell@seed.etyme.invalid', 'Planning analyst, supplier side')
  }, 240_000)

  it('a supplier does not see a draft offer to its candidate', async () => {
    const made = await offer(NIKE.hiring, 'POST', { rate: 41.5, startDate: '2027-02-01' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    w.offer = made.body.data.id
    expect((await offer(PINNACLE, 'GET')).body.data.offers).toEqual([])
    expect((await rowOf(PINNACLE))?.offer ?? null).toBeNull()
  })

  it('a supplier sees the offer made to its candidate and records her answer', async () => {
    await offer(NIKE.hiring, 'PATCH', { offerId: w.offer, action: 'PROPOSE' })
    const row = await rowOf(PINNACLE)
    expect(row.offer).toMatchObject({ state: 'PROPOSED', rate: 41.5, currency: 'USD', startDate: '2027-02-01', side: 'SUPPLIER', mayAnswer: true })
    const read = await offer(PINNACLE, 'GET')
    expect(read.body.data.offers[0].rate).toBe(41.5)
    expect(read.body.data.mayRecordAnswer).toBe(true)
    const said = await offer(PINNACLE, 'PATCH', { offerId: w.offer, action: 'DECLINE' })
    expect(said.status).toBe(422)
    const declined = await offer(PINNACLE, 'PATCH', { offerId: w.offer, action: 'DECLINE', reasonCode: 'RATE' })
    expect(declined.status, JSON.stringify(declined.body)).toBe(200)
    expect(declined.body.data.state).toBe('DECLINED')
    const ledger = await prisma.recordAction.findFirstOrThrow({ where: { recordType: 'Offer', recordId: w.offer, action: 'OFFER_DECLINED:RATE' } })
    expect(ledger.companyId).toBe(co['world-pinnacle'])
  })

  it('a supplier cannot change an offer’s rate or start', async () => {
    const again = await offer(NIKE.hiring, 'POST', { rate: 50, startDate: '2027-03-01', propose: true })
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    const id = again.body.data.id
    const made = await offer(PINNACLE, 'POST', { rate: 60, startDate: '2027-04-01' })
    expect(made.status).toBe(403)
    const edit = await offer(PINNACLE, 'PATCH', { offerId: id, action: 'PROPOSE', rate: 60, startDate: '2027-04-01' })
    expect(edit.status).toBe(403)
    const accepted = await offer(PINNACLE, 'PATCH', { offerId: id, action: 'ACCEPT', rate: 60, startDate: '2027-04-01' })
    expect(accepted.status).toBe(200)
    const stored = await prisma.offer.findUniqueOrThrow({ where: { id } })
    expect([Number(stored.rate), stored.startDate?.toISOString().slice(0, 10)]).toEqual([50, '2027-03-01'])
    const withdraw = await offer(PINNACLE, 'PATCH', { offerId: id, action: 'WITHDRAW' })
    expect(withdraw.status).toBe(403)
  })

  it('a firm that is not party to the submission cannot read the offer', async () => {
    const read = await offer(OUTSIDER, 'GET')
    expect(read.status).toBe(404)
    expect(JSON.stringify(read.body)).not.toMatch(/50|41\.5/)
    const said = await offer(OUTSIDER, 'PATCH', { action: 'ACCEPT' })
    expect(said.status).toBe(404)
  })
})
