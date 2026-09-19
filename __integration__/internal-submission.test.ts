import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as submitCandidate } from '@/app/api/submissions/route'
import { POST as awardSubmission } from '@/app/api/submissions/[id]/award/route'
import { GET as ownPeople } from '@/app/api/submissions/own-people/route'

/**
 * A prime brings its own people, and a sub-vendor brings somebody else's.
 *
 * ── The thing this walk proves ───────────────────────────────────────
 *
 * From the founder, 2026-09-17: "Prime, GSI and MSP can bring their own
 * W2s as well and don't need a supplier all the time."
 *
 * They could not. `POST /api/submissions` asked every person for a
 * `ConsultantProfile` and a bench listing granted to the submitting
 * firm, which meant a GSI could not put its own delivery employee in
 * front of a client until that employee had first agreed to be marketed
 * by the firm that already employs them. Nobody asks an employee's
 * permission to be staffed on a project, so in practice the work went
 * back to email and the client's record of it never existed.
 *
 * The buy side already knew all this — `BuyContract.workOrderId` is
 * nullable precisely because you do not raise a purchase order to your
 * own employee — and the sell side did not.
 *
 * ── Who is in it ─────────────────────────────────────────────────────
 *
 *   Cavanaugh Glassworks           the client. Publishes the seat, awards it, pays.
 *   Ardent Systems    a GSI. Sells to Cavanaugh Glassworks and brings Arun, who is on
 *                     its own payroll. No supplier under it.
 *   Veritan Talent     a staffing vendor. Sells to Cavanaugh Glassworks and brings
 *                     Lena, a consultant who granted it a bench listing.
 *   Arun Nadar        Ardent's employee. Told, never asked.
 *   Lena Ortiz        Vertex's bench consultant. Asked, as always.
 *   Maya Rao          also Ardent's employee, and Cavanaugh Glassworks is on her
 *                     do-not-submit list.
 *
 * Both submissions land on the same requirement, which is the case the
 * founder described and the one the route could not do.
 *
 * `seed-world` belongs to the architect and seeds no GSI employing
 * anybody, so the world here is built in `beforeAll` the way
 * `full-spine` builds its own.
 */

const CORNING_PM = 'program@corning.test'
const ARDENT_DM = 'delivery@ardent.test'
const VERTEX = 'owner@vertex.test'

const co = { corning: '', ardent: '', vertex: '' }
const who = { pm: '', dm: '', vertexLead: '', arun: '', lena: '', maya: '', stranger: '' }
const it_ = { requirement: '', internal: '', network: '' }

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45 },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'internal submission walk' },
  })
  return { companyId: c.id, personId: p.id, roleId: role.id }
}

/** Cover on file for a supplier, which is what lets it place anybody. */
async function insure(companyId: string, uploadedById: string) {
  for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
    await prisma.verification.create({
      data: {
        companyId, type, status: 'CLEAR', provider: 'Hartford',
        issuedAt: new Date('2026-06-01'), expiresAt: new Date('2027-06-01'),
        uploadedById, verifiedById: uploadedById, verifiedAt: new Date('2026-06-02'),
        result: { outcome: 'CLEAR', notes: 'Certificate on file' },
      },
    })
  }
}

beforeAll(async () => {
  await resetDatabase()

  const corning = await company('Cavanaugh Glassworks', 'corning', 'CLIENT', CORNING_PM)
  co.corning = corning.companyId
  who.pm = corning.personId

  const ardent = await company('Ardent Systems', 'ardent-systems', 'GSI', ARDENT_DM)
  co.ardent = ardent.companyId
  who.dm = ardent.personId

  const vertex = await company('Veritan Talent', 'vertex-talent', 'VENDOR', VERTEX)
  co.vertex = vertex.companyId
  who.vertexLead = vertex.personId

  await insure(co.ardent, who.dm)
  await insure(co.vertex, who.vertexLead)

  // Arun is on Ardent's payroll. He has no consultant profile, no bench
  // listing and no reason to have either — he is an employee between
  // projects, which is what a delivery bench actually is.
  const arun = await prisma.person.create({
    data: { name: 'Arun Nadar', primaryEmail: 'arun@ardent.test' },
  })
  who.arun = arun.id
  await prisma.context.create({
    data: {
      personId: arun.id, companyId: co.ardent, type: 'EMPLOYEE',
      roleId: ardent.roleId, grantReason: 'Delivery — validation practice',
    },
  })

  // Maya is too, and she has told the system she will not go to Cavanaugh Glassworks.
  const maya = await prisma.person.create({
    data: { name: 'Maya Rao', primaryEmail: 'maya@ardent.test' },
  })
  who.maya = maya.id
  await prisma.context.create({
    data: {
      personId: maya.id, companyId: co.ardent, type: 'EMPLOYEE',
      roleId: ardent.roleId, grantReason: 'Delivery — validation practice',
    },
  })
  await prisma.doNotSubmit.create({
    data: { personId: maya.id, companyId: co.corning },
  })

  // Lena is nobody's employee. She granted Vertex a listing, the old way
  // and the only way for somebody a firm does not employ.
  const lena = await prisma.person.create({
    data: { name: 'Lena Ortiz', primaryEmail: 'lena@person.test' },
  })
  who.lena = lena.id
  const profile = await prisma.consultantProfile.create({
    data: {
      personId: lena.id, skills: ['Validation', 'GxP'],
      location: 'Cavanaugh Glassworks, New York', visibility: 'VERIFIED', workAuth: 'GC',
    },
  })
  await prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: co.vertex, tier: 'MARKETING',
      state: 'GRANTED', invitedAt: new Date('2026-08-10'),
      respondedAt: new Date('2026-08-11'), grantedAt: new Date('2026-08-11'),
    },
  })

  // Somebody Vertex does not employ and has no listing for. The old wall,
  // which has to stay exactly where it was.
  const stranger = await prisma.person.create({
    data: { name: 'Tom Ibarra', primaryEmail: 'tom@person.test' },
  })
  who.stranger = stranger.id

  // Cavanaugh Glassworks's seat. Two heads, so the walk can award one and still read
  // what happened to the other.
  const requirement = await prisma.requirement.create({
    data: {
      companyId: co.corning, title: 'Validation engineer — Sullivan Park',
      skills: ['Validation', 'GxP'], location: 'Cavanaugh Glassworks, New York',
      status: 'OPEN', approvalState: 'APPROVED', headcount: 2,
      billMin: 9_000, billMax: 13_000, months: 12,
      startDate: new Date('2026-10-05'), raisedById: who.pm, ownerId: who.pm,
    },
  })
  it_.requirement = requirement.id

  for (const toCompanyId of [co.ardent, co.vertex]) {
    await prisma.requirementInvitation.create({
      data: {
        requirementId: requirement.id, fromCompanyId: co.corning, toCompanyId,
        status: 'SENT', payMin: 9_000, payMax: 13_000,
        expiresAt: new Date('2026-10-01'),
      },
    })
  }
}, 240_000)

describe('A GSI puts its own employee in front of a client', () => {
  it('lets Ardent submit Arun, who is on nobody’s bench, because Ardent employs him', async () => {
    as(ARDENT_DM)
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.requirement,
      personIds: [who.arun],
      rate: 11_500,
      fromCompanyId: co.ardent,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const [result] = r.body.data.results
    expect(result.error, JSON.stringify(result)).toBeUndefined()
    expect(result.status).toBe('created')
    it_.internal = result.submissionId
  })

  it('records it as an internal submission, because the person is Ardent’s own W2', async () => {
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: it_.internal } })
    expect(submission.kind).toBe('INTERNAL')
    expect(submission.fromCompanyId).toBe(co.ardent)
    expect(submission.toCompanyId).toBe(co.corning)
  })

  it('never asked Arun for a bench listing, because his employment is the consent', async () => {
    const profile = await prisma.consultantProfile.findUnique({ where: { personId: who.arun } })
    expect(profile).toBeNull()
    const listings = await prisma.benchListing.count({
      where: { consultant: { personId: who.arun } },
    })
    expect(listings).toBe(0)
  })

  it('tells Arun he has been put forward, and to which client, in a sentence', async () => {
    const told = await prisma.notification.findFirstOrThrow({
      where: { personId: who.arun, type: 'SUBMISSION' },
    })
    expect(told.title).toContain('Ardent Systems')
    expect(told.title).toContain('Cavanaugh Glassworks')
    expect(told.body).toContain('Validation engineer — Sullivan Park')
  })

  it('tells him rather than asks him — there is nothing on it to accept', async () => {
    const told = await prisma.notification.findFirstOrThrow({
      where: { personId: who.arun, type: 'SUBMISSION' },
    })
    expect(told.body).toContain('nothing for you to accept')

    // No consent ask went out, and no representation claim was staked
    // against an employee who is not on the market.
    const asked = await prisma.textMessage.count({ where: { personId: who.arun, kind: 'CONSENT' } })
    expect(asked).toBe(0)
    const claims = await prisma.representation.count({ where: { personId: who.arun } })
    expect(claims).toBe(0)
  })

  it('logs the read of Arun’s record the way it logs every other', async () => {
    const read = await prisma.accessLog.findFirstOrThrow({
      where: { subjectId: who.arun, actorCompanyId: co.ardent, action: 'SUBMIT' },
    })
    expect(read.allowed).toBe(true)
    expect(read.reason).toContain('Validation engineer — Sullivan Park')
  })
})

describe('A staffing vendor answers the same seat the old way, and both stand', () => {
  it('lets Vertex submit Lena, who granted it a listing', async () => {
    as(VERTEX)
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.requirement,
      personIds: [who.lena],
      rate: 12_000,
      fromCompanyId: co.vertex,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const [result] = r.body.data.results
    expect(result.error, JSON.stringify(result)).toBeUndefined()
    expect(result.status).toBe('created')
    it_.network = result.submissionId
  })

  it('records Lena’s as a network submission, because Vertex does not employ her', async () => {
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: it_.network } })
    expect(submission.kind).toBe('NETWORK')
  })

  it('puts an employee and a bought consultant on the same seat, which is the whole point', async () => {
    const kinds = await prisma.submission.findMany({
      where: { requirementId: it_.requirement },
      select: { kind: true },
      orderBy: { submittedAt: 'asc' },
    })
    expect(kinds.map(k => k.kind)).toEqual(['INTERNAL', 'NETWORK'])
  })

  it('still refuses a firm that puts forward somebody it neither employs nor has a listing for', async () => {
    as(VERTEX)
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.requirement,
      personIds: [who.stranger],
      rate: 11_000,
      fromCompanyId: co.vertex,
    })))
    const [result] = r.body.data.results
    expect(result.status).toBe('error')
    expect(result.error).toBe('Person has no consultant profile')
  })
})

describe('Employing somebody does not override what they said about a client', () => {
  it('refuses Maya even though Ardent employs her, because Cavanaugh Glassworks is on her list', async () => {
    as(ARDENT_DM)
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.requirement,
      personIds: [who.maya],
      rate: 11_500,
      fromCompanyId: co.ardent,
    })))
    const [result] = r.body.data.results
    expect(result.status).toBe('error')
    expect(result.code).toBe('BLOCKED')
    expect(result.error).toBe('This person cannot be submitted to this client.')
  })

  it('says nothing about who else is involved or why', async () => {
    const refusal = await prisma.accessLog.findFirstOrThrow({
      where: { subjectId: who.maya, actorCompanyId: co.ardent, action: 'SUBMIT' },
    })
    expect(refusal.allowed).toBe(false)
    expect(refusal.reason).not.toMatch(/agency|vendor|supplier|because|another/i)
  })

  it('writes no submission for her at all', async () => {
    const attempts = await prisma.submission.count({ where: { personId: who.maya } })
    expect(attempts).toBe(0)
  })
})

describe('The rule has a door, so somebody can actually pick an employee', () => {
  it('offers Ardent the people on its own payroll, alongside its bench', async () => {
    as(ARDENT_DM)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const names = r.body.data.people.map((p: any) => p.name)
    expect(names).toContain('Arun Nadar')
    expect(names).toContain('Maya Rao')
  })

  it('tells whoever is choosing that these need no bench listing, in a sentence', async () => {
    as(ARDENT_DM)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    expect(r.body.data.says).toContain('no bench listing')
    expect(r.body.data.says).toContain('told')
  })

  it('never offers Vertex somebody else’s employee', async () => {
    as(VERTEX)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    const names = r.body.data.people.map((p: any) => p.name)
    expect(names).not.toContain('Arun Nadar')
    expect(names).not.toContain('Maya Rao')
  })

  it('does not offer a consultant on the bench as somebody we employ', async () => {
    as(VERTEX)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    const names = r.body.data.people.map((p: any) => p.name)
    expect(names).not.toContain('Lena Ortiz')
  })
})

describe('Cavanaugh Glassworks awards the employee, and Ardent gets a contract pair with nobody underneath', () => {
  it('lets Cavanaugh Glassworks award Ardent’s own employee', async () => {
    as(CORNING_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.internal}/award`, {
        rate: 11_500, startDate: '2026-10-05', endDate: '2027-10-04',
      }),
      { params: Promise.resolve({ id: it_.internal }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('writes the sell contract Ardent bills Cavanaugh Glassworks under', async () => {
    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.ardent, clientCompanyId: co.corning, personId: who.arun },
    })
    expect(sell.billRate).toBe(11_500)
  })

  it('writes the buy leg as payroll, with no supplier under Ardent', async () => {
    const buy = await prisma.buyContract.findFirstOrThrow({ where: { companyId: co.ardent } })
    expect(buy.vendorCompanyId).toBeNull()
    expect(buy.contractType).toBe('W2')
  })

  it('raises no purchase order, because nobody raises one to their own employee', async () => {
    const buy = await prisma.buyContract.findFirstOrThrow({ where: { companyId: co.ardent } })
    expect(buy.workOrderId).toBeNull()
    const orders = await prisma.workOrder.count({ where: { issuedById: co.ardent } })
    expect(orders).toBe(0)
  })
})
