import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as recordRole } from '@/app/api/requirements/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { GET as listSubmissions } from '@/app/api/submissions/route'
import { POST as forward } from '@/app/api/submissions/[id]/forward/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { GET as readTerms, POST as actOnTerms } from '@/app/api/submissions/[id]/terms/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'
import { GET as people } from '@/app/api/people/route'
import { GET as program } from '@/app/api/program/route'
import { termsGate, termsOnRecordFor } from '@/lib/award/terms-on-record'
import { placementStatus } from '@/lib/award/placement-status'

/**
 * Hire terms before the start, on the seeded world.
 *
 * The outside chain audit of 2026-10-05, section 6, walked exactly this:
 * Marisol Quintero said yes to Brightmoor's bench invitation, Brightmoor
 * put her forward to Northbend Athletic, and Northbend placed her. The
 * award wrote "Brightmoor Staffing employs Marisol directly", W2, at $0
 * an hour; she was never asked. The start was a week before the award,
 * so its reminders were already overdue. Northbend's contractor list
 * said she was on site while its program page said she could not start.
 *
 * Then four tiers — client, prime, sub, bench, person — because the
 * audit saw the award's notice travel across two and asked for four.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const BRIGHTMOOR = `world-brightmoor${D}`
const PRIME = `world-computer-systems${D}`
const SUB = `world-techpeple${D}`
const BENCH = `world-pinnacle${D}`
const MARISOL = 'marisol.quintero@seed.etyme.invalid'
const ANA = 'ana.ruiz.terms@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}
const startOfToday = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)

async function raise(title: string) {
  const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
  as(NIKE.hiring)
  const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
    title, skills: ['PLC programming', 'SCADA'],
    location: 'Tualatin, OR', billMin: 12_000, billMax: 16_000, months: 6, headcount: 1, hoursPerWeek: 40,
    costCenterId: cc.id, neededBy: day(7).toISOString(),
  })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  const id = r.body.data.requisition.id as string
  // A controls engineer at the audit's rates is over this cost center's
  // plan, so the job waits for its approvers. Approving it is another
  // station's walk (`a-requisition-reaches-the-desk-that-signs-it`); here
  // it is simply approved.
  await prisma.requirement.update({ where: { id }, data: { approvalState: 'APPROVED', status: 'OPEN' } })
  return id
}

describe('hire terms: Marisol Quintero at Brightmoor, the audit’s own case', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-nike', 'world-brightmoor', 'world-computer-systems', 'world-techpeple', 'world-pinnacle']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    }
    it_.marisol = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MARISOL } })).id
  }, 240_000)

  it('Marisol says yes to Brightmoor’s bench invitation on her own page — consent to be marketed, nothing more', async () => {
    const listing = await prisma.benchListing.findFirstOrThrow({
      where: { consultant: { personId: it_.marisol }, companyId: co['world-brightmoor'] },
    })
    as(MARISOL)
    const r = await call(respond, 'POST', `/api/me/benches/${listing.id}/respond`, listing.id, { said: 'ACCEPT' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.benchListing.findUniqueOrThrow({ where: { id: listing.id } })).state).toBe('GRANTED')
  })

  it('Northbend raises a controls job and sends it to Brightmoor, and Brightmoor puts Marisol forward at $140', async () => {
    it_.requisition = await raise('Controls engineer')
    as(NIKE.programme)
    const sent = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-brightmoor'], payMin: 12_000, payMax: 15_000 }],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
    as(BRIGHTMOOR)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.marisol], rate: 14_000, fromCompanyId: co['world-brightmoor'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.marisol } })).id
  })

  it('how she came reads "From our bench" to Brightmoor and "From the supplier’s bench" to Northbend — there is no partner firm', async () => {
    as(BRIGHTMOOR)
    const sent = await json(await listSubmissions(req('GET', `/api/submissions?direction=sent&companyId=${co['world-brightmoor']}`)))
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
    const mine = sent.body.data.submissions.find((s: any) => s.id === it_.submission)
    expect(mine.came).toEqual({ chained: false, through: null })
    as(NIKE.hiring)
    const got = await json(await listSubmissions(req('GET', `/api/submissions?direction=received&companyId=${co['world-nike']}`)))
    const theirs = got.body.data.submissions.find((s: any) => s.id === it_.submission)
    expect(theirs.came).toEqual({ chained: false, through: null })
  })

  it('a start date before the award is refused unless the awarder says the work is already under way', async () => {
    as(NIKE.hiring)
    const early = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 14_000, startDate: day(-7).toISOString().slice(0, 10),
    })
    expect(early.status).toBe(422)
    expect(early.body.error.code).toBe('START_BEFORE_AWARD')
    expect(early.body.error.message).toMatch(/is before today\. Pick today or later, or tick "the work is already under way" and say why\./)

    const noReason = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 14_000, startDate: day(-7).toISOString().slice(0, 10), workUnderWay: true,
    })
    expect(noReason.body.error.code).toBe('NO_REASON')
    expect(await prisma.sellContract.count({ where: { requirementId: it_.requisition } })).toBe(0)
  })

  it('the buyer cannot set what Brightmoor pays Marisol at the award', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 14_000, payRate: 0, startDate: day(7).toISOString().slice(0, 10),
    })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('PAY_RATE_NOT_YOURS')
  })

  it('awarding a bench-listed person writes no employment and no $0 rate; the placement reads awarded, terms pending', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 14_000, startDate: day(7).toISOString().slice(0, 10), endDate: day(190).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.contractId
    expect(r.body.data.placement.word).toBe('Awarded, terms pending')
    expect(r.body.data.terms.href).toBe(`/dashboard/submissions/${it_.submission}/terms`)

    // No employment of any kind, and no pay line at any rate.
    const pay = await prisma.buyContract.count({
      where: { companyId: co['world-brightmoor'], candidates: { some: { personId: it_.marisol } } },
    })
    expect(pay).toBe(0)
    expect(await prisma.buyContractCandidate.count({ where: { personId: it_.marisol, payRate: 0 } })).toBe(0)
  })

  it('no reminder is generated for a date already past', async () => {
    const cycles = await prisma.cycle.findMany({ where: { sellContractId: it_.contract }, select: { dueOn: true } })
    expect(cycles.length).toBeGreaterThan(0)
    const past = cycles.filter((c) => c.dueOn.getTime() < startOfToday().getTime())
    expect(past).toEqual([])
  })

  it('the award keeps whether anybody interviewed her, without refusing either way', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'CANDIDATE_AWARDED', payload: { path: ['submissionId'], equals: it_.submission } },
    })
    expect((log.payload as any).interviews).toEqual({ held: 0, placedWithoutInterview: true })
    expect((log.payload as any).payLine.written).toBe(false)
  })

  it('she is told she is placed and that nothing starts until she agrees her own terms', async () => {
    const told = await prisma.notification.findFirstOrThrow({
      where: { personId: it_.marisol, title: { startsWith: 'You are placed' } },
    })
    expect(told.body).toMatch(/Nothing starts until you and Brightmoor Staffing agree how you are engaged and what you are paid/)
  })

  it('the start is held while her terms are pending, in a sentence', async () => {
    const gate = await termsGate(it_.contract)
    expect(gate.blocks).toBe(true)
    expect(gate.says).toMatch(/Brightmoor Staffing has not said how it engages Marisol Quintero or what it pays them/)
  })

  it('Northbend cannot read the terms between Marisol and Brightmoor', async () => {
    as(NIKE.hiring)
    const r = await call(readTerms, 'GET', `/api/submissions/${it_.submission}/terms`, it_.submission)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('These are the terms between Marisol Quintero and the firm that holds them. Only those two can read them.')
  })

  it('Brightmoor states W2 at $90; she is asked, and the placement is still terms pending until she answers', async () => {
    as(BRIGHTMOOR)
    const empty = await call(actOnTerms, 'POST', `/api/submissions/${it_.submission}/terms`, it_.submission, {
      action: 'state', engagementType: 'W2', payRate: 0,
    })
    expect(empty.status).toBe(422)
    expect(empty.body.error.message).toMatch(/a missing rate, not a free placement/)

    const r = await call(actOnTerms, 'POST', `/api/submissions/${it_.submission}/terms`, it_.submission, {
      action: 'state', engagementType: 'W2', payRate: 9_000,
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.terms.payRateWords).toBe('$90/hr')
    expect(r.body.data.waitingOn).toBe('PERSON')
    expect(r.body.data.placement.word).toBe('Awarded, terms pending')
    expect((await termsGate(it_.contract)).blocks).toBe(true)

    const asked = await prisma.notification.findFirstOrThrow({
      where: { personId: it_.marisol, title: 'Brightmoor Staffing offers you terms for Controls engineer' },
    })
    expect(asked.body).toBe('Brightmoor Staffing employs Marisol Quintero at $90/hr. Nothing starts until you agree. Open your terms to say yes.')
  })

  it('the person confirms W2 at $90 on her own page, and only then can the placement start', async () => {
    as(MARISOL)
    const seen = await call(readTerms, 'GET', `/api/submissions/${it_.submission}/terms`, it_.submission)
    expect(seen.body.data.you).toBe('PERSON')
    expect(seen.body.data.terms.engagementWords).toBe('Employee of the firm (W2)')
    expect(seen.body.data.may.agree).toBe(true)

    const r = await call(actOnTerms, 'POST', `/api/submissions/${it_.submission}/terms`, it_.submission, { action: 'agree' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.onRecord).toBe(true)
    expect(r.body.data.placement.word).toBe('Papers pending')
    expect((await termsGate(it_.contract)).blocks).toBe(false)

    const line = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: co['world-brightmoor'], candidates: { some: { personId: it_.marisol } } },
      include: { candidates: true },
    })
    expect([line.contractType, line.vendorCompanyId, line.candidates[0].payRate]).toEqual(['W2', null, 9_000])
  })

  it('every screen reads one status for one placement', async () => {
    as(NIKE.programme)
    const register = await json(await people(req('GET', '/api/people')))
    const row = register.body.data.people.find((p: any) => p.personId === it_.marisol)
    const prog = await json(await program(req('GET', '/api/program')))
    const soon = prog.body.data.startingSoon.find((c: any) => c.person.id === it_.marisol)
    as(MARISOL)
    const own = await call(readTerms, 'GET', `/api/submissions/${it_.submission}/terms`, it_.submission)

    expect(row.placement.word).toBe('Papers pending')
    expect(row.says).not.toMatch(/On site here/)
    expect(soon.placement.word).toBe('Papers pending')
    expect(own.body.data.placement.word).toBe('Papers pending')
  })
})

describe('the award cascade across four tiers: client, prime, sub, bench, person', () => {
  beforeAll(async () => {
    // Ana Ruiz, on Pinnacle's bench by her own consent, who can sign in.
    const ana = await prisma.person.create({ data: { name: 'Ana Ruiz', primaryEmail: ANA } })
    it_.ana = ana.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: ana.id, skills: ['PLC programming', 'SCADA'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-20), respondedAt: day(-19), grantedAt: day(-19) },
    })
    await prisma.context.create({
      data: { personId: ana.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
    })
    // Pinnacle supplies Techpeple: the rung below the sub.
    if (!(await prisma.masterAgreement.findFirst({ where: { clientId: co['world-techpeple'], vendorId: co['world-pinnacle'] } }))) {
      await prisma.masterAgreement.create({ data: { clientId: co['world-techpeple'], vendorId: co['world-pinnacle'], paymentTerms: 30 } })
    }
  })

  it('Northbend sends a job to Computer Systems, which sends it to Techpeple, which sends it to Pinnacle', async () => {
    it_.top = await raise('Commissioning engineer')
    as(NIKE.programme)
    const a = await call(distribute, 'POST', `/api/requisitions/${it_.top}/distribute`, it_.top, {
      vendors: [{ companyId: co['world-computer-systems'], payMin: 13_000, payMax: 16_000 }],
    })
    expect(a.body?.error, JSON.stringify(a.body)).toBeUndefined()

    for (const [who, from, to, slot] of [
      [PRIME, 'world-computer-systems', 'world-techpeple', 'primeRole'],
      [SUB, 'world-techpeple', 'world-pinnacle', 'subRole'],
    ] as const) {
      as(who)
      const r = await json(await recordRole(req('POST', '/api/requirements', {
        title: 'Commissioning engineer', skills: ['PLC programming', 'SCADA'],
        location: 'Tualatin, OR', billMin: 10_000, billMax: 14_000, months: 6,
        endClientCompanyId: co['world-nike'],
      })))
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
      it_[slot] = r.body.data.requirement.id
      const down = await call(distribute, 'POST', `/api/requisitions/${it_[slot]}/distribute`, it_[slot], {
        vendors: [{ companyId: co[to], payMin: 10_000, payMax: 14_000 }],
      })
      expect(down.body?.error, `${from} → ${to}: ${JSON.stringify(down.body)}`).toBeUndefined()
    }
  })

  it('Pinnacle submits Ana to Techpeple at $115, Techpeple passes her to Computer Systems at $130, and Computer Systems to Northbend at $150', async () => {
    as(BENCH)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.subRole, personIds: [it_.ana], rate: 11_500, fromCompanyId: co['world-pinnacle'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.benchSub = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.subRole, personId: it_.ana } })).id

    as(SUB)
    const up1 = await call(forward, 'POST', `/api/submissions/${it_.benchSub}/forward`, it_.benchSub, {
      via: 'ONWARD', toCompanyId: co['world-computer-systems'], rate: 13_000,
    })
    expect(up1.body?.error, JSON.stringify(up1.body)).toBeUndefined()
    it_.subSub = up1.body.data.childSubmissionId

    as(PRIME)
    const up2 = await call(forward, 'POST', `/api/submissions/${it_.subSub}/forward`, it_.subSub, {
      via: 'ONWARD', toCompanyId: co['world-nike'], rate: 15_000,
    })
    expect(up2.body?.error, JSON.stringify(up2.body)).toBeUndefined()
    it_.primeSub = up2.body.data.childSubmissionId
    const top = await prisma.submission.findUniqueOrThrow({ where: { id: it_.primeSub } })
    expect(top.requirementId).toBe(it_.top)
  })

  it('Northbend awards, and the notice reaches the prime, the sub, the bench and the candidate, in that order, each at its own rate', async () => {
    const before = new Date()
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.primeSub}/award`, it_.primeSub, {
      rate: 15_000, startDate: day(14).toISOString().slice(0, 10), endDate: day(200).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.topLine = r.body.data.contractId
    expect(r.body.data.placement.word).toBe('Awarded, terms pending')

    const since = await prisma.notification.findMany({
      where: { createdAt: { gte: before } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { companyId: true, personId: true, title: true, body: true, createdAt: true },
    })
    const firstAt = (pred: (n: (typeof since)[number]) => boolean) => since.findIndex(pred)
    const prime = firstAt((n) => n.companyId === co['world-computer-systems'])
    const sub = firstAt((n) => n.companyId === co['world-techpeple'])
    const bench = firstAt((n) => n.companyId === co['world-pinnacle'])
    const person = firstAt((n) => n.personId === it_.ana)
    expect([prime, sub, bench, person].every((i) => i >= 0), JSON.stringify(since.map((n) => n.title))).toBe(true)
    expect(prime).toBeLessThan(sub)
    expect(sub).toBeLessThan(bench)
    expect(bench).toBeLessThan(person)

    const subNotice = since[sub]
    expect(subNotice.title).toBe('Selected — Ana Ruiz for Commissioning engineer')
    expect(subNotice.body).toMatch(/^Computer Systems Inc has a client decision: .* at the \$130\/hr you asked\./)
    expect(subNotice.body).not.toMatch(/\$150|\$115|Northbend/)
    const benchNotice = since[bench]
    expect(benchNotice.body).toMatch(/^Techpeple has a client decision: .* at the \$115\/hr you asked\./)
    expect(benchNotice.body).not.toMatch(/\$150|\$130|Northbend|Computer Systems/)
    expect(since[person].body).toMatch(/through Pinnacle/)
    expect(since[person].body).not.toMatch(/\$/)
  })

  it('the prime settles with the sub and the sub with the bench, each upper hop at the rate on its submission', async () => {
    as(PRIME)
    const a = await call(award, 'POST', `/api/submissions/${it_.subSub}/award`, it_.subSub, {
      rate: 13_000, startDate: day(14).toISOString().slice(0, 10), endDate: day(200).toISOString().slice(0, 10),
    })
    expect(a.body?.error, JSON.stringify(a.body)).toBeUndefined()
    it_.subLine = a.body.data.contractId
    as(SUB)
    const b = await call(award, 'POST', `/api/submissions/${it_.benchSub}/award`, it_.benchSub, {
      rate: 11_500, startDate: day(14).toISOString().slice(0, 10), endDate: day(200).toISOString().slice(0, 10),
    })
    expect(b.body?.error, JSON.stringify(b.body)).toBeUndefined()
    it_.benchLine = b.body.data.contractId

    const primeBuy = await prisma.buyContractCandidate.findFirstOrThrow({ where: { personId: it_.ana, buyContract: { companyId: co['world-computer-systems'] } } })
    const subBuy = await prisma.buyContractCandidate.findFirstOrThrow({ where: { personId: it_.ana, buyContract: { companyId: co['world-techpeple'] } } })
    expect([primeBuy.payRate, subBuy.payRate]).toEqual([13_000, 11_500])
    // Hop 0 is not written: Pinnacle holds her listing, not her employment.
    expect(await prisma.buyContract.count({ where: { companyId: co['world-pinnacle'], candidates: { some: { personId: it_.ana } } } })).toBe(0)
  })

  it('the placement reads awarded, terms pending on every rung until the candidate agrees', async () => {
    const lines = [it_.topLine, it_.subLine, it_.benchLine]
    const words = async () => {
      const terms = await termsOnRecordFor(lines)
      const rows = await prisma.sellContract.findMany({ where: { id: { in: lines } } })
      return lines.map((id) => {
        const c = rows.find((r) => r.id === id)!
        return placementStatus({ state: c.state, startDate: c.startDate, endDate: c.endDate, termsOnRecord: terms.get(id)!.onRecord }, new Date()).word
      })
    }
    expect(await words()).toEqual(['Awarded, terms pending', 'Awarded, terms pending', 'Awarded, terms pending'])

    as(BENCH)
    const stated = await call(actOnTerms, 'POST', `/api/submissions/${it_.benchSub}/terms`, it_.benchSub, {
      action: 'state', engagementType: 'W2', payRate: 9_000,
    })
    expect(stated.body?.error, JSON.stringify(stated.body)).toBeUndefined()
    expect(await words()).toEqual(['Awarded, terms pending', 'Awarded, terms pending', 'Awarded, terms pending'])

    as(ANA)
    const agreed = await call(actOnTerms, 'POST', `/api/submissions/${it_.benchSub}/terms`, it_.benchSub, { action: 'agree' })
    expect(agreed.body?.error, JSON.stringify(agreed.body)).toBeUndefined()
    expect(await words()).toEqual(['Papers pending', 'Papers pending', 'Papers pending'])
  })

  it('a firm further up the chain cannot read or set the candidate’s own terms', async () => {
    as(SUB)
    const r = await call(readTerms, 'GET', `/api/submissions/${it_.benchSub}/terms`, it_.benchSub)
    expect(r.status).toBe(403)
    as(PRIME)
    const w = await call(actOnTerms, 'POST', `/api/submissions/${it_.benchSub}/terms`, it_.benchSub, { action: 'state', engagementType: 'W2', payRate: 1 })
    expect(w.status).toBe(403)
  })
})
