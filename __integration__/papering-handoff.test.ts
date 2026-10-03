import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { rolesFor } from '@/lib/company-defaults'

import { POST as awardSubmission } from '@/app/api/submissions/[id]/award/route'
import { POST as moveContract } from '@/app/api/contracts/[id]/activate/route'
import { GET as decisionQueue } from '@/app/api/decisions/route'

/**
 * The baton, from the desk that won the deal to the desk that papers it.
 *
 * The founder asked how a placement gets from the account manager to the
 * contract manager and at what point. The answer is the award, and until
 * now nothing said so: the award told whoever raised the requisition —
 * who sits at the client — and the supplier's DRAFT contract landed on
 * nobody's desk.
 *
 * Veritan Talent here has the real staffing roles out of
 * `lib/company-defaults`: Marisol on Account Manager, who may submit and
 * may not write a contract, and Anwar on Contract Manager, who is the
 * reverse. Nothing about this walk depends on the role names — only on
 * what each of them may do.
 */

/**
 * Notices are fire-and-forget by design — `notify` never blocks a route.
 * So the bell is given a moment to ring rather than read the instant the
 * award returns.
 */
async function noticeFor(personId: string, entityId: string, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const row = await prisma.notification.findFirst({ where: { personId, entityId } })
    if (row) return row
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`no notice reached ${personId} about ${entityId}`)
}

const CLIENT_PM = 'pm@northbend.test'
const SELLER = 'marisol@veritan.test'
const PAPERER = 'anwar@veritan.test'

const who = { pm: '', seller: '', paperer: '', priya: '' }
const co = { client: '', supplier: '' }
const it_ = { requirement: '', submission: '', contract: '' }

async function seat(companyId: string, roleName: string, name: string, email: string) {
  const seed = rolesFor('VENDOR').find((r) => r.name === roleName)!
  const role =
    (await prisma.role.findFirst({ where: { companyId, name: roleName } })) ??
    (await prisma.role.create({
      data: { companyId, name: roleName, permissions: seed.permissions as string[] },
    }))
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'papering walk' },
  })
  return person.id
}

beforeAll(async () => {
  await resetDatabase()

  const client = await prisma.company.create({
    data: { name: 'Northbend Athletic', slug: 'northbend-pap', kind: 'CLIENT', currency: 'USD', defaultPaymentTerms: 45 },
  })
  co.client = client.id
  const clientRole = await prisma.role.create({
    data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const pm = await prisma.person.create({ data: { name: 'Elena Kaur', primaryEmail: CLIENT_PM } })
  who.pm = pm.id
  await prisma.context.create({
    data: { personId: pm.id, companyId: client.id, roleId: clientRole.id, type: 'EMPLOYEE', grantReason: 'papering walk' },
  })

  const supplier = await prisma.company.create({
    data: { name: 'Veritan Talent', slug: 'veritan-pap', kind: 'VENDOR', currency: 'USD', defaultPaymentTerms: 30 },
  })
  co.supplier = supplier.id
  who.seller = await seat(supplier.id, 'Account Manager', 'Marisol Vega', SELLER)
  who.paperer = await seat(supplier.id, 'Contract Manager', 'Anwar Bhatt', PAPERER)

  // Cover on file, or the award is refused before it reaches the handoff.
  for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
    await prisma.verification.create({
      data: {
        companyId: supplier.id, type, status: 'CLEAR', provider: 'Hartford',
        issuedAt: new Date(Date.now() - 60 * 86_400_000),
        expiresAt: new Date(Date.now() + 300 * 86_400_000),
        uploadedById: who.paperer, verifiedById: who.paperer, verifiedAt: new Date(),
      },
    })
  }

  const priya = await prisma.person.create({ data: { name: 'Priya Raman', primaryEmail: 'priya@person.test' } })
  who.priya = priya.id

  const requirement = await prisma.requirement.create({
    data: {
      companyId: co.client, title: 'SAP FICO Consultant', headcount: 1,
      status: 'OPEN', approvalState: 'AUTO_APPROVED', raisedById: who.pm,
      billMin: 10_000, billMax: 15_000,
      neededBy: new Date(Date.now() + 21 * 86_400_000), months: 12,
    },
  })
  it_.requirement = requirement.id

  const submission = await prisma.submission.create({
    data: {
      requirementId: requirement.id, personId: priya.id,
      fromCompanyId: co.supplier, toCompanyId: co.client,
      kind: 'NETWORK', rate: 13_500, contractType: 'W2', status: 'SUBMITTED',
    },
  })
  it_.submission = submission.id
}, 180_000)

describe('The award is the handoff, and both desks hear about it in their own words', () => {

  it('when a candidate is placed, the desk that papers contracts is told, and the desk that submitted is not asked to', async () => {
    as(CLIENT_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.submission}/award`, { rate: 13_500 }),
      { params: Promise.resolve({ id: it_.submission }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.contractId

    const toPaperer = await noticeFor(who.paperer, it_.contract)
    expect(toPaperer.title).toContain('Paper the contract — Priya Raman')
    expect(toPaperer.body).toContain('$135/hr')
    // Email as well as in the app, like every other desk notice.
    expect(toPaperer.channel).toBe('EMAIL')

    const toSeller = await noticeFor(who.seller, it_.contract)
    expect(toSeller.title).toContain('Won — Priya Raman')
    expect(toSeller.body).not.toContain('Paper the contract')
  })

  it('an account manager cannot paper the contract they won, and is told who can', async () => {
    const toSeller = await noticeFor(who.seller, it_.contract)
    expect(toSeller.body).toContain('Anwar Bhatt (Contract Manager)')
    expect(toSeller.body).toContain("contract desk's, not yours")

    // And the permission model agrees with the sentence: she is refused
    // on the route, in words rather than a code.
    as(SELLER)
    const refused = await json(await moveContract(
      req('POST', `/api/contracts/${it_.contract}/activate`, { action: 'verify' }),
      { params: Promise.resolve({ id: it_.contract }) }
    ))
    expect(refused.status).toBe(403)
    const still = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })
    expect(still.state).toBe('DRAFT')
  })

  it('the award leaves the contract a draft, because winning a deal is not papering one', async () => {
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })
    expect(sell.state).toBe('DRAFT')
    const buy = await prisma.buyContract.findFirstOrThrow({ where: { companyId: co.supplier } })
    expect(buy.state).toBe('DRAFT')
  })

  it('a contract waiting to be papered is on the supplier’s own queue, with how long it has waited', async () => {
    as(PAPERER)
    const q = await json(await decisionQueue(req('GET', '/api/decisions')))
    const row = q.body.data.decisions.find((d: { type: string }) => d.type === 'CONTRACT_PAPERING')
    expect(row, JSON.stringify(q.body.data.counts)).toBeTruthy()
    expect(row.title).toBe('Paper the contract — Priya Raman')
    expect(row.subtitle).toContain('awarded today, still a draft')
    expect(row.subtitle).toContain('Northbend Athletic')
    expect(row.actionUrl).toBe(`/dashboard/contracts/${it_.contract}`)
    // Never a state name on a screen.
    expect(`${row.title} ${row.subtitle}`).not.toContain('DRAFT')
  })

  it('the same row is not on the account manager’s queue, because she cannot act on it', async () => {
    as(SELLER)
    const q = await json(await decisionQueue(req('GET', '/api/decisions')))
    const kinds = q.body.data.decisions.map((d: { type: string }) => d.type)
    expect(kinds).not.toContain('CONTRACT_PAPERING')
  })

  it('a contract that has been papered leaves that queue and joins the one waiting to start', async () => {
    as(PAPERER)
    const moved = await json(await moveContract(
      req('POST', `/api/contracts/${it_.contract}/activate`, { action: 'verify' }),
      { params: Promise.resolve({ id: it_.contract }) }
    ))
    expect(moved.body?.error, JSON.stringify(moved.body)).toBeUndefined()

    const q = await json(await decisionQueue(req('GET', '/api/decisions')))
    const kinds = q.body.data.decisions.map((d: { type: string }) => d.type)
    expect(kinds).not.toContain('CONTRACT_PAPERING')

    const row = q.body.data.decisions.find((d: { type: string }) => d.type === 'CONTRACT_START')
    expect(row).toBeTruthy()
    expect(row.title).toBe('Start Priya Raman at Northbend Athletic')
    expect(row.subtitle).toContain('papered today, not started')
  })

  it('a placement under way is on nobody’s queue at all, because it needs no decision', async () => {
    // Nobody may start her without an I-9, which is the next desk again.
    await prisma.verification.create({
      data: {
        personId: who.priya, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify',
        issuedAt: new Date(), uploadedById: who.paperer, verifiedById: who.paperer, verifiedAt: new Date(),
      },
    })
    as(PAPERER)
    await moveContract(
      req('POST', `/api/contracts/${it_.contract}/activate`, {
        action: 'activate', overrideReason: 'Background check waived in writing by Northbend.',
      }),
      { params: Promise.resolve({ id: it_.contract }) }
    )
    const live = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })
    expect(live.state).toBe('IN_PROGRESS')

    const q = await json(await decisionQueue(req('GET', '/api/decisions')))
    const kinds = q.body.data.decisions.map((d: { type: string }) => d.type)
    expect(kinds).not.toContain('CONTRACT_PAPERING')
    expect(kinds).not.toContain('CONTRACT_START')
  })
})
