import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as actOnTerms } from '@/app/api/submissions/[id]/terms/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { POST as recordPlacement } from '@/app/api/contracts/route'
import { termsGate } from '@/lib/award/terms-on-record'

/**
 * Nobody starts on terms nobody agreed — money's half of demand's
 * hire-terms change of 2026-10-06, on the seeded world.
 *
 * Demand's walk (`hire-terms.test.ts`) proves the award leaves Marisol
 * Quintero "Awarded, terms pending" and that `termsGate` blocks. This file
 * proves the button that starts a placement actually asks it, and that the
 * contracts page's "Record a placement" — the other door that writes a pay
 * line — obeys the same rule rather than writing the $0 W2 line the award
 * no longer writes.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const BRIGHTMOOR = `world-brightmoor${D}`
const MARISOL = 'marisol.quintero@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

describe('the start waits on the person’s own terms', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-nike', 'world-brightmoor']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    }
    it_.marisol = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MARISOL } })).id

    // Demand's road to the award, step for step: her consent to be
    // marketed, a job, Brightmoor puts her forward, Northbend places her.
    const listing = await prisma.benchListing.findFirstOrThrow({
      where: { consultant: { personId: it_.marisol }, companyId: co['world-brightmoor'] },
    })
    as(MARISOL)
    const said = await call(respond, 'POST', `/api/me/benches/${listing.id}/respond`, listing.id, { said: 'ACCEPT' })
    expect(said.body?.error, JSON.stringify(said.body)).toBeUndefined()

    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const raised = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Controls engineer', skills: ['PLC programming', 'SCADA'],
      location: 'Tualatin, OR', billMin: 12_000, billMax: 16_000, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(raised.body?.error, JSON.stringify(raised.body)).toBeUndefined()
    it_.requisition = raised.body.data.requisition.id
    await prisma.requirement.update({ where: { id: it_.requisition }, data: { approvalState: 'APPROVED', status: 'OPEN' } })

    as(NIKE.programme)
    const sent = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-brightmoor'], payMin: 12_000, payMax: 15_000 }],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()

    as(BRIGHTMOOR)
    const put = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.marisol], rate: 14_000, fromCompanyId: co['world-brightmoor'],
    })))
    expect(put.body?.error, JSON.stringify(put.body)).toBeUndefined()
    it_.submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.marisol } })).id

    as(NIKE.hiring)
    const awarded = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 14_000, startDate: day(7).toISOString().slice(0, 10), endDate: day(190).toISOString().slice(0, 10),
    })
    expect(awarded.body?.error, JSON.stringify(awarded.body)).toBeUndefined()
    it_.contract = awarded.body.data.contractId
  }, 240_000)

  it('Marisol Quintero cannot be started while her terms with Brightmoor are pending, and the refusal says whose move it is', async () => {
    as(BRIGHTMOOR)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('TERMS_PENDING')
    expect(r.body.error.message).toBe(
      'Brightmoor Staffing has not said how it engages Marisol Quintero or what it pays them. ' +
        'Nobody starts until the person and the firm that pays them have agreed how they are engaged and what they are paid.'
    )
    // No reason overrides it: this is not a warning somebody proceeds past.
    const anyway = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, {
      action: 'activate', overrideReason: 'She is already on site.',
    })
    expect(anyway.body.error.code).toBe('TERMS_PENDING')
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })).state).not.toBe('IN_PROGRESS')
  })

  it('once Brightmoor states W2 at $90 the refusal says it is now Marisol’s move', async () => {
    as(BRIGHTMOOR)
    const stated = await call(actOnTerms, 'POST', `/api/submissions/${it_.submission}/terms`, it_.submission, {
      action: 'state', engagementType: 'W2', payRate: 9_000,
    })
    expect(stated.body?.error, JSON.stringify(stated.body)).toBeUndefined()
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    expect(r.body.error.code).toBe('TERMS_PENDING')
    expect(r.body.error.message).toMatch(/^Marisol Quintero has not agreed the terms Brightmoor Staffing offered yet\./)
  })

  it('once she agrees them on her own page, her terms no longer stop the start', async () => {
    as(MARISOL)
    const agreed = await call(actOnTerms, 'POST', `/api/submissions/${it_.submission}/terms`, it_.submission, { action: 'agree' })
    expect(agreed.body?.error, JSON.stringify(agreed.body)).toBeUndefined()
    as(BRIGHTMOOR)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    // Whatever else the start asks — papers, governance — it is no longer her terms.
    expect(r.body?.error?.code).not.toBe('TERMS_PENDING')
  })
})

describe('"Record a placement" writes a pay line only under the same rules', () => {
  const record = async (body: Record<string, unknown>) =>
    json(await recordPlacement(req('POST', '/api/contracts', {
      personId: it_.marisol, companyId: co['world-brightmoor'], clientCompanyId: co['world-nike'],
      billRate: 14_000, startDate: day(14).toISOString().slice(0, 10), endDate: day(200).toISOString().slice(0, 10),
      ...body,
    })))

  const lines = () => prisma.sellContract.count({ where: { companyId: co['world-brightmoor'], personId: it_.marisol } })

  it('a pay rate of nothing is refused as a missing rate, and nothing is written', async () => {
    as(BRIGHTMOOR)
    const before = await lines()
    const r = await record({ engagementType: 'W2', payRate: 0 })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('NO_RATE')
    expect(r.body.error.message).toBe('Say what Brightmoor Staffing pays Marisol Quintero. An empty rate is a missing rate, not a free placement.')
    expect(await lines()).toBe(before)
  })

  it('employed by another firm is refused in the words the terms page uses, and nothing is written', async () => {
    as(BRIGHTMOOR)
    const before = await lines()
    const r = await record({ engagementType: 'OTHER_EMPLOYER', payRate: 9_000 })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('THROUGH_THE_EMPLOYER')
    expect(r.body.error.message).toMatch(/^Marisol Quintero's employer has to agree this, so it cannot be written from here\./)
    expect(await lines()).toBe(before)
  })

  it('recorded as an employee at $90, the line is W2 at $90 and nothing about her terms stops the start', async () => {
    as(BRIGHTMOOR)
    const r = await record({ engagementType: 'W2', payRate: 9_000 })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.terms).toEqual({ says: 'Brightmoor Staffing employs Marisol Quintero at $90/hr.', payLine: true })
    const sellId = r.body.data.sellContract.id
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: r.body.data.buyContract.id }, include: { candidates: true } })
    expect([buy.contractType, buy.vendorCompanyId, buy.candidates[0].payRate]).toEqual(['W2', null, 9_000])
    expect((await termsGate(sellId)).blocks).toBe(false)
  })

  it('recorded with nothing said about pay, there is no pay line and the start waits on the firm', async () => {
    as(BRIGHTMOOR)
    const r = await record({})
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.buyContract).toBeNull()
    expect(r.body.data.terms.payLine).toBe(false)
    const gate = await termsGate(r.body.data.sellContract.id)
    expect(gate.blocks).toBe(true)
    expect(gate.says).toMatch(/^Brightmoor Staffing has not said how it engages Marisol Quintero or what it pays them\./)
  })
})

describe('"Record a placement" is only for somebody the firm already knows', () => {
  it('a firm cannot record a placement for a person it has no record of', async () => {
    // Northbend's hiring manager: a seat at the client, nothing at all at
    // Brightmoor — no seat, no listing, no line, never put forward.
    const stranger = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE.hiring }, select: { id: true, name: true } })
    const before = await prisma.sellContract.count({ where: { personId: stranger.id } })
    as(BRIGHTMOOR)
    const r = await json(await recordPlacement(req('POST', '/api/contracts', {
      personId: stranger.id, companyId: co['world-brightmoor'], clientCompanyId: co['world-nike'],
      billRate: 14_000, startDate: day(14).toISOString().slice(0, 10), endDate: day(200).toISOString().slice(0, 10),
      engagementType: 'W2', payRate: 9_000,
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('NO_RECORD_OF_PERSON')
    expect(r.body.error.message).toBe(
      `${stranger.name} is not on your bench, your payroll or any contract of yours; invite them or list them first.`
    )
    expect(await prisma.sellContract.count({ where: { personId: stranger.id } })).toBe(before)
  })

  it('a placement recorded with a start two months ago writes no reminder dated before the day it was recorded', async () => {
    // The seeded firms carry no template pack, and a firm with none gets
    // no reminders at all — which would pass this sentence for nothing.
    await prisma.company.update({ where: { id: co['world-brightmoor'] }, data: { templatePack: 'US_SAP' } })
    as(BRIGHTMOOR)
    const r = await json(await recordPlacement(req('POST', '/api/contracts', {
      personId: it_.marisol, companyId: co['world-brightmoor'], clientCompanyId: co['world-nike'],
      billRate: 14_000, startDate: day(-60).toISOString().slice(0, 10), endDate: day(120).toISOString().slice(0, 10),
      engagementType: 'W2', payRate: 9_000,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
    const cycles = await prisma.cycle.findMany({
      where: { OR: [{ sellContractId: r.body.data.sellContract.id }, { buyContractId: r.body.data.buyContract.id }] },
      select: { kind: true, dueOn: true },
    })
    // The placement still has its reminders from today on — the floor
    // drops the past, not the contract.
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles.filter((c) => c.dueOn < today)).toEqual([])
    // Its dates stay the truth about the work.
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: r.body.data.sellContract.id } })
    expect(line.startDate.getTime()).toBeLessThan(today.getTime())
  })
})
