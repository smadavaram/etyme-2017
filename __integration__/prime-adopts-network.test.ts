import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { GET as requisitionDetail } from '@/app/api/requisitions/[id]/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { GET as bench } from '@/app/api/bench/route'

/**
 * A prime puts forward somebody its network offered it, on the seeded world.
 *
 * Break #4. Northbend Athletic releases one requisition to Computer
 * Systems and to Techpeple. Computer Systems reads Grace Lindqvist on
 * Bench → Your network, offered by Techpeple on a listing she granted
 * Techpeple. Putting her forward was refused — "No active bench listing
 * from this company. The consultant must grant a listing first." — and
 * the only road left was Techpeple going round its prime to the client.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const PRIME = `world-computer-systems${D}`
const SUB = `world-techpeple${D}`

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

const put = async (personId: string, extra: Record<string, unknown> = {}) =>
  json(await submitCandidates(req('POST', '/api/submissions', {
    requirementId: it_.requisition, personIds: [personId], rate: 4200, fromCompanyId: co['world-computer-systems'], ...extra,
  })))

describe('a prime puts forward somebody its network offered it', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-nike', 'world-computer-systems', 'world-techpeple']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }
    it_.grace = (await prisma.person.findFirstOrThrow({ where: { name: 'Grace Lindqvist' } })).id
    it_.peter = (await prisma.person.findFirstOrThrow({ where: { name: 'Peter Halloran' } })).id

    // Somebody Techpeple keeps to itself: a retained listing, never shown
    // to its network.
    const p = await prisma.person.create({ data: { name: 'Ilse Brandt', primaryEmail: 'ilse.brandt@seed.etyme.invalid' } })
    const profile = await prisma.consultantProfile.create({
      data: { personId: p.id, skills: ['SAP IBP'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-techpeple'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-20), respondedAt: day(-19), grantedAt: day(-19) },
    })
    it_.retained = p.id

    // In this story Techpeple also supplies Northbend directly, beside
    // supplying it through Computer Systems — which is what makes "first
    // in wins" across the two paths a question at all. Without a direct
    // agreement Techpeple is Computer Systems' sub-vendor and nothing more,
    // and the release door refuses to send Northbend's job to it: a
    // sub-vendor's name is the prime's to keep (CLAUDE.md, 2026-09-17).
    await prisma.masterAgreement.create({ data: { clientId: co['world-nike'], vendorId: co['world-techpeple'], paymentTerms: 30 } })
  }, 240_000)

  it('Northbend raises a role and releases it to Computer Systems and to Techpeple', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Demand planning analyst', skills: ['SAP IBP'], location: 'Beaverton, OR',
      billMin: 3200, billMax: 4500, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.requisition = r.body.data.requisition.id

    as(NIKE.programme)
    const sent = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [
        { companyId: co['world-computer-systems'], payMin: 3400, payMax: 4400 },
        { companyId: co['world-techpeple'], payMin: 3200, payMax: 4000 },
      ],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
    it_.rolesAtNorthbend = await prisma.requirement.count({ where: { companyId: co['world-nike'] } })
  })

  it('Computer Systems reads Grace Lindqvist on its network, offered by Techpeple', async () => {
    as(PRIME)
    const r = await json(await bench(req('GET', '/api/bench?scope=network&limit=100')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const offered = r.body.data.tiers.MARKETING.map((l: any) => `${l.consultant.person.name} from ${l.company.name}`)
    expect(offered).toContain('Grace Lindqvist from Techpeple')
  })

  it('without the rate it pays Techpeple, Computer Systems is asked for it and nothing is written', async () => {
    as(PRIME)
    const r = await put(it_.grace)
    const item = r.body.data.results[0]
    expect(item.status).toBe('error')
    expect(item.code).toBe('NO_PAY_RATE')
    expect(item.error).toContain('what Techpeple charges you for Grace Lindqvist')
    expect(await prisma.submission.count({ where: { personId: it_.grace } })).toBe(0)
  })

  it('Computer Systems puts Grace forward on Northbend’s requisition, as its own NETWORK candidate, whatever kind the request claims', async () => {
    as(PRIME)
    const r = await put(it_.grace, { payRate: 3600, kind: 'INTERNAL' })
    const item = r.body.data.results[0]
    expect(item.status, JSON.stringify(item)).toBe('created')
    expect(item.offeredBy).toBe('Techpeple')
    const ours = await prisma.submission.findUniqueOrThrow({ where: { id: item.submissionId } })
    expect(ours.requirementId).toBe(it_.requisition)
    expect(ours.fromCompanyId).toBe(co['world-computer-systems'])
    expect(ours.toCompanyId).toBe(co['world-nike'])
    expect(ours.kind).toBe('NETWORK')
    expect(ours.rate).toBe(4200)
    it_.ours = ours
    // Nothing written onto Northbend's books.
    expect(await prisma.requirement.count({ where: { companyId: co['world-nike'] } })).toBe(it_.rolesAtNorthbend)
  })

  it('the rung below is written with it: Techpeple supplies Grace to Computer Systems at the agreed rate, on Computer Systems’ own record of the role, already sent on', async () => {
    const below = await prisma.submission.findUniqueOrThrow({
      where: { id: it_.ours.parentSubmissionId },
      include: { requirement: true },
    })
    expect(below.fromCompanyId).toBe(co['world-techpeple'])
    expect(below.toCompanyId).toBe(co['world-computer-systems'])
    expect(below.rate).toBe(3600)
    expect(below.kind).toBe('NETWORK')
    expect(below.forwardedVia).toBe('ONWARD')
    expect(below.forwardedAt).not.toBeNull()
    expect(below.requirement.companyId).toBe(co['world-computer-systems'])
    expect(below.requirement.mirroredFromId).toBe(it_.requisition)
    expect(below.requirement.endClientCompanyId).toBe(co['world-nike'])
    // No band on a requirement another firm could read.
    expect(below.requirement.billMin).toBeNull()
    expect(below.requirement.billMax).toBeNull()
  })

  it('Grace is told who put her forward and that Techpeple offered her; the hold is Techpeple’s, whose consent it is', async () => {
    const told = await prisma.notification.findFirst({ where: { personId: it_.grace, type: 'SUBMISSION' }, orderBy: { createdAt: 'desc' } })
    expect(told?.body).toContain('Computer Systems Inc put you forward to Northbend Athletic')
    expect(told?.body).toContain('Techpeple, who you agreed may market you, offered you to them')
    const hold = await prisma.representation.findFirst({ where: { personId: it_.grace, clientCompanyId: co['world-nike'] } })
    expect(hold?.companyId).toBe(co['world-techpeple'])
  })

  it('Northbend’s requisition shows Grace under Computer Systems’ name and never Techpeple’s', async () => {
    as(NIKE.hiring)
    const r = await call(requisitionDetail, 'GET', `/api/requisitions/${it_.requisition}`, it_.requisition)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = r.body.data.candidates.find((c: any) => c.person.name === 'Grace Lindqvist')
    expect(row.vendor.name).toBe('Computer Systems Inc')
    expect(JSON.stringify(row)).not.toContain('Techpeple')
  })

  it('Techpeple then submitting Grace straight to Northbend is refused — first in wins', async () => {
    as(SUB)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.grace], rate: 3900, fromCompanyId: co['world-techpeple'],
    })))
    expect(r.body.data.results[0].status).toBe('duplicate')
    expect(await prisma.submission.count({ where: { requirementId: it_.requisition, personId: it_.grace } })).toBe(1)
  })

  it('Techpeple can still submit Peter straight to Northbend, and Computer Systems then putting him forward is refused — first in wins', async () => {
    as(SUB)
    const direct = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.peter], rate: 3900, fromCompanyId: co['world-techpeple'],
    })))
    expect(direct.body.data.results[0].status, JSON.stringify(direct.body)).toBe('created')

    as(PRIME)
    const r = await put(it_.peter, { payRate: 3600 })
    expect(r.body.data.results[0].status).toBe('duplicate')
    expect(await prisma.submission.count({ where: { personId: it_.peter } })).toBe(1)
  })

  it('somebody Techpeple keeps on its retained bench cannot be put forward by Computer Systems, and the refusal is logged', async () => {
    as(PRIME)
    const r = await put(it_.retained, { payRate: 3600 })
    const item = r.body.data.results[0]
    expect(item.status).toBe('error')
    expect(item.code).toBe('NOT_OFFERED_TO_NETWORK')
    expect(item.error).toBe('Techpeple keeps Ilse Brandt on its own bench and has not offered them to its network. Ask Techpeple to put Ilse Brandt forward to you on your job.')
    expect(await prisma.submission.count({ where: { personId: it_.retained } })).toBe(0)
    const logged = await prisma.accessLog.findFirst({ where: { subjectId: it_.retained, actorCompanyId: co['world-computer-systems'], allowed: false } })
    expect(logged).not.toBeNull()
  })

  it('Northbend awards Grace, and Computer Systems buys her from Techpeple — not from its own payroll', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.ours.id}/award`, it_.ours.id, {
      rate: 4200, startDate: day(7).toISOString().slice(0, 10), endDate: day(190).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: r.body.data.contractId }, include: { buyLinks: true } })
    expect(sell.companyId).toBe(co['world-computer-systems'])
    expect(sell.requirementId).toBe(it_.requisition)
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: sell.buyLinks[0].buyContractId } })
    expect(buy.vendorCompanyId).toBe(co['world-techpeple'])
    expect((await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })).status).toBe('FILLED')
  })
})

describe('the person placed is told, by the firm nearest them', () => {
  it('Grace is told she is placed at Northbend Athletic through Techpeple, with no rate named', async () => {
    let told = null as null | { title: string; body: string | null }
    for (let i = 0; i < 20 && !told; i++) {
      told = await prisma.notification.findFirst({
        where: { personId: it_.grace, title: 'You are placed at Northbend Athletic' },
        select: { title: true, body: true },
      })
      if (!told) await new Promise((r) => setTimeout(r, 100))
    }
    expect(told?.body).toBe(
      'You are placed at Northbend Athletic through Techpeple, for Demand planning analyst. Techpeple will be in touch about your start date. ' +
        // Placed is not employed: her own terms with Techpeple come first.
        'Nothing starts until you and Techpeple agree how you are engaged and what you are paid; you will see their offer on your own page and say yes there.'
    )
  })
})
