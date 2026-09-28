import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { GET as requisitionDetail } from '@/app/api/requisitions/[id]/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as recordRole } from '@/app/api/requirements/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as forward } from '@/app/api/submissions/[id]/forward/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'

/**
 * A prime's candidate reaches the client, on the seeded world.
 *
 * Break #3. Northbend Athletic sends one requisition to two suppliers:
 * CloudEPA, which submits straight onto it, and Computer Systems, a prime
 * that works it through its own sub-vendor. CloudEPA's candidate arrived.
 * Computer Systems' never did: "Send on" wrote a fresh copy of the
 * prime's record onto Northbend's books and put the candidate there, so
 * Northbend's own requisition showed one candidate where it had two, and
 * its list gained a role nobody at Northbend had raised.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const PRIME = `world-computer-systems${D}`
const SUB = `world-cloudepa${D}`

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

async function onBench(name: string, email: string, companyId: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  const profile = await prisma.consultantProfile.create({
    data: { personId: p.id, skills: ['Supply planning', 'SAP IBP'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
  })
  await prisma.benchListing.create({
    data: { consultantId: profile.id, companyId, tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-20), respondedAt: day(-19), grantedAt: day(-19) },
  })
  await prisma.context.create({
    data: { personId: p.id, companyId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
  })
  return p.id
}

describe('a prime’s candidate reaches the client’s requisition', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-computer-systems', 'world-cloudepa']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }
    it_.direct = await onBench('Anika Varga', 'anika.varga@seed.etyme.invalid', co['world-cloudepa'])
    it_.chained = await onBench('Bram Osei', 'bram.osei@seed.etyme.invalid', co['world-cloudepa'])
  }, 240_000)

  it('Northbend raises a role and sends it to CloudEPA and to Computer Systems', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Supply planning analyst', skills: ['Supply planning', 'SAP IBP'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4500, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.requisition = r.body.data.requisition.id

    as(NIKE.programme)
    const sent = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [
        { companyId: co['world-cloudepa'], payMin: 3200, payMax: 4000 },
        { companyId: co['world-computer-systems'], payMin: 3400, payMax: 4400 },
      ],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
    expect(sent.body.data.summary.sent).toBe(2)
    it_.rolesAtNorthbend = await prisma.requirement.count({ where: { companyId: co['world-nike'] } })
  })

  it('CloudEPA submits straight onto the requisition, and Northbend sees the candidate there', async () => {
    as(SUB)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.direct], rate: 3900, fromCompanyId: co['world-cloudepa'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const landed = await prisma.submission.findFirstOrThrow({ where: { personId: it_.direct, toCompanyId: co['world-nike'] } })
    expect(landed.requirementId).toBe(it_.requisition)
  })

  it('Computer Systems records the role against itself and sends it down to CloudEPA', async () => {
    as(PRIME)
    const r = await json(await recordRole(req('POST', '/api/requirements', {
      title: 'Supply planning analyst', skills: ['Supply planning', 'SAP IBP'],
      location: 'Beaverton, OR', billMin: 3000, billMax: 3800, months: 6,
      endClientCompanyId: co['world-nike'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.primeRole = r.body.data.requirement.id

    const down = await call(distribute, 'POST', `/api/requisitions/${it_.primeRole}/distribute`, it_.primeRole, {
      vendors: [{ companyId: co['world-cloudepa'], payMin: 3000, payMax: 3600 }],
    })
    expect(down.body?.error, JSON.stringify(down.body)).toBeUndefined()

    as(SUB)
    const up = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.primeRole, personIds: [it_.chained, it_.direct], rate: 3500, fromCompanyId: co['world-cloudepa'],
    })))
    expect(up.body?.error, JSON.stringify(up.body)).toBeUndefined()
    it_.subSubmission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.primeRole, personId: it_.chained } })).id
    it_.subSubmissionDirect = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.primeRole, personId: it_.direct } })).id
  })

  it('a candidate the prime sends on lands on the requisition Northbend raised and sent it, not on a copy', async () => {
    as(PRIME)
    const r = await call(forward, 'POST', `/api/submissions/${it_.subSubmission}/forward`, it_.subSubmission, {
      via: 'ONWARD', toCompanyId: co['world-nike'], rate: 4200,
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const child = await prisma.submission.findUniqueOrThrow({ where: { id: r.body.data.childSubmissionId } })
    it_.primeSubmission = child.id
    expect(child.requirementId).toBe(it_.requisition)
    expect(child.fromCompanyId).toBe(co['world-computer-systems'])
    expect(child.toCompanyId).toBe(co['world-nike'])
    expect(child.parentSubmissionId).toBe(it_.subSubmission)
    // Nothing new was written onto Northbend's books.
    expect(await prisma.requirement.count({ where: { companyId: co['world-nike'] } })).toBe(it_.rolesAtNorthbend)
  })

  it('Northbend’s requisition shows both candidates, the prime’s under the prime’s name and never the sub-vendor’s', async () => {
    as(NIKE.hiring)
    const r = await call(requisitionDetail, 'GET', `/api/requisitions/${it_.requisition}`, it_.requisition)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const names = r.body.data.candidates.map((c: any) => `${c.person.name} via ${c.vendor.name}`).sort()
    expect(names).toEqual(['Anika Varga via CloudEPA', 'Bram Osei via Computer Systems Inc'])
  })

  it('the same person sent on after another firm already put them forward is refused — first in wins, and nothing is duplicated', async () => {
    as(PRIME)
    const r = await call(forward, 'POST', `/api/submissions/${it_.subSubmissionDirect}/forward`, it_.subSubmissionDirect, {
      via: 'ONWARD', toCompanyId: co['world-nike'], rate: 4200,
    })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_SUBMITTED')
    expect(r.body.error.message).toBe('Anika Varga has already been put forward for Supply planning analyst by another firm. First in wins.')
    expect(await prisma.submission.count({ where: { requirementId: it_.requisition, personId: it_.direct } })).toBe(1)
  })

  it('Northbend awards the prime’s candidate on its own requisition, and the contract carries its cost center and the sub-vendor below', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.primeSubmission}/award`, it_.primeSubmission, {
      rate: 4200, startDate: day(7).toISOString().slice(0, 10), endDate: day(190).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: r.body.data.contractId }, include: { buyLinks: true } })
    expect(sell.requirementId).toBe(it_.requisition)
    expect(sell.companyId).toBe(co['world-computer-systems'])
    expect(await prisma.contractCostAllocation.count({ where: { sellContractId: sell.id } })).toBe(1)
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: sell.buyLinks[0].buyContractId } })
    expect(buy.vendorCompanyId).toBe(co['world-cloudepa'])
    expect((await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })).status).toBe('FILLED')
  })
})
