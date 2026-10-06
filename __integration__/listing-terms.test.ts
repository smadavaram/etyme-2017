import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'
import { POST as assertWeek } from '@/app/api/timesheets/[id]/assert/route'
import { termsGate, termsOnRecordFor } from '@/lib/award/terms-on-record'
import { TERMS_PAPER } from '@/lib/award/hire-terms'

/**
 * Terms carried on a bench listing, and the rate each signature records.
 *
 * A firm that agreed a person's terms when it listed them is not asked a
 * second time at the award: the pay line is written from the listing.
 * The listing columns are written by supply's listing door; here they are
 * set directly, because what is under test is the reader.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const BRIGHTMOOR = `world-brightmoor${D}`
const MARISOL = 'marisol.quintero@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}

/** Marisol says yes to Brightmoor's listing, which carries the terms given; Northbend places her. */
async function placeMarisolWith(terms: { statedAt: Date; agreedAt: Date | null; statedBy: string }) {
  await freshWorld()
  for (const slug of ['world-nike', 'world-brightmoor']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
  }
  const marisol = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MARISOL } })).id
  const desk = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: terms.statedBy } })).id
  const listing = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { personId: marisol }, companyId: co['world-brightmoor'] },
  })
  as(MARISOL)
  const said = await call(respond, 'POST', `/api/me/benches/${listing.id}/respond`, listing.id, { said: 'ACCEPT' })
  expect(said.body?.error, JSON.stringify(said.body)).toBeUndefined()
  await prisma.benchListing.update({
    where: { id: listing.id },
    data: {
      termsEngagementType: 'W2', termsPayRateCents: 9_500,
      termsStatedAt: terms.statedAt, termsStatedById: desk, termsAgreedAt: terms.agreedAt,
    },
  })

  const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
  as(NIKE.hiring)
  const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
    title: 'Controls engineer', skills: ['PLC programming', 'SCADA'],
    location: 'Tualatin, OR', billMin: 12_000, billMax: 16_000, months: 6, headcount: 1, hoursPerWeek: 40,
    costCenterId: cc.id, neededBy: day(7).toISOString(),
  })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  const requisition = r.body.data.requisition.id as string
  await prisma.requirement.update({ where: { id: requisition }, data: { approvalState: 'APPROVED', status: 'OPEN' } })
  as(NIKE.programme)
  const sent = await call(distribute, 'POST', `/api/requisitions/${requisition}/distribute`, requisition, {
    vendors: [{ companyId: co['world-brightmoor'], payMin: 12_000, payMax: 15_000 }],
  })
  expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  as(BRIGHTMOOR)
  const s = await json(await submitCandidates(req('POST', '/api/submissions', {
    requirementId: requisition, personIds: [marisol], rate: 14_000, fromCompanyId: co['world-brightmoor'],
  })))
  expect(s.body?.error, JSON.stringify(s.body)).toBeUndefined()
  const submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: requisition, personId: marisol } })).id
  as(NIKE.hiring)
  const awarded = await call(award, 'POST', `/api/submissions/${submission}/award`, submission, {
    rate: 14_000, startDate: day(7).toISOString().slice(0, 10), endDate: day(190).toISOString().slice(0, 10),
  })
  expect(awarded.body?.error, JSON.stringify(awarded.body)).toBeUndefined()
  return { marisol, desk, contract: awarded.body.data.contractId as string, body: awarded.body.data }
}

describe('terms Marisol agreed on Brightmoor’s listing', () => {
  const STATED = new Date('2026-09-20T10:00:00Z')
  const AGREED = new Date('2026-09-21T09:00:00Z')
  let placed: Awaited<ReturnType<typeof placeMarisolWith>>

  beforeAll(async () => {
    placed = await placeMarisolWith({ statedAt: STATED, agreedAt: AGREED, statedBy: BRIGHTMOOR })
  }, 300_000)

  it('a listing whose terms the person agreed makes the award ready at once, written from the listing', async () => {
    expect(placed.body.placement.word).not.toBe('Awarded, terms pending')
    expect(placed.body.terms.onRecord).toBe(true)
    expect((await termsGate(placed.contract)).blocks).toBe(false)

    const line = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: co['world-brightmoor'], candidates: { some: { personId: placed.marisol } } },
      include: { candidates: true, docs: { include: { template: true } } },
    })
    expect([line.contractType, line.vendorCompanyId, line.workOrderId, line.candidates[0].payRate]).toEqual(['W2', null, null, 9_500])
    const paper = line.docs.find((d) => d.template.name === TERMS_PAPER)!
    expect([paper.countersignedAt, paper.countersignedById, paper.signedAt, paper.signedById])
      .toEqual([STATED, placed.desk, AGREED, placed.marisol])
    expect((await termsOnRecordFor([placed.contract])).get(placed.contract)?.says)
      .toBe("Marisol Quintero's terms with Brightmoor Staffing are agreed.")
  })
})

describe('terms Brightmoor changed on its listing after Marisol said yes', () => {
  let placed: Awaited<ReturnType<typeof placeMarisolWith>>

  beforeAll(async () => {
    placed = await placeMarisolWith({
      statedAt: new Date('2026-09-22T10:00:00Z'), agreedAt: new Date('2026-09-21T09:00:00Z'), statedBy: BRIGHTMOOR,
    })
  }, 300_000)

  it('terms a firm stated after the person said yes are not agreed until she agrees them', async () => {
    expect(placed.body.placement.word).toBe('Awarded, terms pending')
    expect(await prisma.buyContract.count({
      where: { companyId: co['world-brightmoor'], candidates: { some: { personId: placed.marisol } } },
    })).toBe(0)
    const t = (await termsOnRecordFor([placed.contract])).get(placed.contract)!
    expect(t).toMatchObject({ onRecord: false, pending: 'PERSON', waitingOn: 'PERSON' })
    expect(t.says).toBe('Brightmoor Staffing changed the terms on its bench listing after Marisol Quintero agreed them. Marisol Quintero has not agreed the new terms yet.')
    expect((await termsGate(placed.contract)).blocks).toBe(true)
  })
})

describe('the rate each signature records on Helena Marsh’s week', () => {
  const ids: Record<string, string> = {}
  let week: { id: string; sellContractId: string; periodStart: Date }

  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['nike', 'computer-systems', 'techpeple']) {
      ids[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug: `world-${slug}` } })).id
    }
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'APPROVED', sellContract: { companyId: ids.techpeple } },
      orderBy: { periodStart: 'desc' },
      select: { id: true, sellContractId: true, periodStart: true },
    })
    // The week as it stood before anybody signed it.
    await prisma.workAssertion.updateMany({ where: { timesheetId: week.id, state: 'LIVE' }, data: { state: 'WITHDRAWN' } })
    await prisma.timesheet.update({
      where: { id: week.id },
      data: { status: 'SUBMITTED', clientApprovedAt: null, employerAcceptedAt: null, approvedAt: null },
    })
  }, 300_000)

  it('each firm’s signature records the rate on the rung it pays, and the client’s is the top contract’s bill rate', async () => {
    const bottom = await prisma.sellContract.findUniqueOrThrow({ where: { id: week.sellContractId }, select: { billRate: true } })
    const csBuy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: ids['computer-systems'], supplierSellContractId: week.sellContractId },
      select: { sellLinks: { select: { sellContract: { select: { billRate: true } } } }, candidates: { select: { payRate: true } } },
    })
    const top = csBuy.sellLinks[0].sellContract.billRate
    const tpPay = await prisma.buyContractCandidate.findFirstOrThrow({
      where: { buyContract: { companyId: ids.techpeple, sellLinks: { some: { sellContractId: week.sellContractId } } } },
      select: { payRate: true },
    })
    expect(top).not.toBe(bottom.billRate)

    // Northbend signs, Computer Systems accepts what it pays, Techpeple last.
    for (const email of [NIKE.programme, `world-computer-systems${D}`, `world-techpeple${D}`]) {
      as(email)
      const r = await call(assertWeek, 'POST', `/api/timesheets/${week.id}/assert`, week.id, {})
      expect(r.body?.error, `${email}: ${JSON.stringify(r.body)}`).toBeUndefined()
    }

    const signed = await prisma.workAssertion.findMany({
      where: { timesheetId: week.id, state: 'LIVE' },
      select: { companyId: true, role: true, rateCents: true },
    })
    const rateOf = (id: string) => signed.find((s) => s.companyId === id)?.rateCents
    expect(signed.map((s) => s.role).sort()).toEqual(['CLIENT_APPROVAL', 'EMPLOYER_ACCEPTANCE', 'PASS_THROUGH'])
    expect(rateOf(ids.nike)).toBe(top)
    expect(rateOf(ids['computer-systems'])).toBe(csBuy.candidates[0].payRate)
    expect(rateOf(ids.techpeple)).toBe(tpPay.payRate)
  })
})
