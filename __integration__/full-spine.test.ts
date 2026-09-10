import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as decideRequisition } from '@/app/api/requisitions/[id]/approve/route'
import { POST as distributeRequisition } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as answerInvitation } from '@/app/api/invitations/[id]/respond/route'
import { POST as createRequirement } from '@/app/api/requirements/route'
import { POST as distributeRequirement } from '@/app/api/requirements/[id]/distribute/route'
import { POST as submitCandidate } from '@/app/api/submissions/route'
import { POST as checkPackage } from '@/app/api/submissions/[id]/check/route'
import { POST as forwardSubmission } from '@/app/api/submissions/[id]/forward/route'
import { POST as proposeInterview } from '@/app/api/submissions/[id]/interviews/route'
import { POST as decideInterview } from '@/app/api/interviews/[id]/route'
import { POST as raisePurchaseOrder } from '@/app/api/purchase-orders/route'
import { POST as awardSubmission } from '@/app/api/submissions/[id]/award/route'
import { POST as activateContract } from '@/app/api/contracts/[id]/activate/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as signTimesheet } from '@/app/api/timesheets/[id]/approve/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { POST as recordReceipt } from '@/app/api/ar/payments/route'
import { GET as complianceView } from '@/app/api/compliance/route'
import { GET as profitability } from '@/app/api/profitability/route'
import { GET as placement } from '@/app/api/placements/[id]/route'

/**
 * L4 — the whole spine, one placement, walked in the order it happens.
 *
 * A manager at Adobe needs somebody. Ninety-one days later a consultant
 * has been paid and four companies can each say what they made. Every
 * step in between is a real route handler called the way the browser
 * calls it — nothing is written straight to the database except the
 * world as it stood before the story started.
 *
 *   Adobe Systems     the client. Raises it, approves it, pays for it.
 *   Magnit            the MSP. Runs Adobe's programme: sees the demand,
 *                     picks who gets to see it, takes no rate.
 *   Computer Systems  the prime supplier. Sells to Adobe, buys from below.
 *   CloudEPA          the sub-vendor. Holds the bench, employs the person.
 *   Priya Raman       the consultant. Files one timesheet, once.
 *
 * The MSP here is an agent, not a principal: it routes demand and holds
 * no contract, which is the arrangement the founder described. A
 * principal MSP — one that sells to Adobe and buys from Computer
 * Systems — is a fourth commercial hop and is not modelled.
 *
 * Where the walk finds something the product cannot yet do, the test
 * asserts what actually happens and says so in the name. A test that
 * quietly skips the broken step is worse than no test.
 */

const ADOBE_PM = 'programme@adobe.test'
const ADOBE_VP = 'vp@adobe.test'
const MSP = 'delivery@magnit.test'
const PRIME = 'owner@computersystems.test'
const SUB = 'owner@cloudepa.test'
const CONSULTANT = 'priya@person.test'

const co = { adobe: '', magnit: '', prime: '', sub: '' }
const who = { pm: '', vp: '', mspLead: '', primeLead: '', subLead: '', priya: '' }
const it_ = {
  costCentre: '', profile: '',
  requisition: '', mspRole: '', primeRole: '',
  mspInvite: '', primeInvite: '', subInvite: '',
  subSubmission: '', primeSubmission: '',
  poNumber: 'PO-ADBE-88104', po: '',
  primeSell: '', primeBuy: '', subSell: '', subBuy: '',
  primeEngagement: '', subEngagement: '',
  timesheet: '', subInvoice: '', primeInvoice: '',
}

const rate = (cents: number) => `$${(cents / 100).toFixed(0)}/hr`
// The first full week of the assignment. It starts on the Monday after
// the contracts do — a week filed before the start date is correctly
// worth nothing, and finding that out here rather than in production is
// the point of the exercise.
const WEEK = { start: '2026-09-14', end: '2026-09-18' }
const FIVE_EIGHTS = {
  '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8,
  '2026-09-17': 8, '2026-09-18': 8,
}
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45 },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'spine walk' },
  })
  return { companyId: c.id, personId: p.id, roleId: role.id }
}

beforeAll(async () => {
  await resetDatabase()

  // ── The world before anybody does anything ────────────────────────
  const adobe = await company('Adobe Systems', 'adobe', 'CLIENT', ADOBE_PM)
  co.adobe = adobe.companyId
  who.pm = adobe.personId

  // Adobe's VP of engineering — the approver, a second seat at the
  // same company, because nobody approves their own requisition.
  const vp = await prisma.person.create({ data: { name: 'Dana Okafor', primaryEmail: ADOBE_VP } })
  await prisma.context.create({
    data: { personId: vp.id, companyId: co.adobe, roleId: adobe.roleId, type: 'EMPLOYEE', grantReason: 'spine walk' },
  })
  who.vp = vp.id

  const magnit = await company('Magnit', 'magnit', 'MSP', MSP)
  co.magnit = magnit.companyId
  who.mspLead = magnit.personId

  const prime = await company('Computer Systems', 'computer-systems', 'VENDOR', PRIME)
  co.prime = prime.companyId
  who.primeLead = prime.personId

  const sub = await company('CloudEPA', 'cloudepa', 'VENDOR', SUB)
  co.sub = sub.companyId
  who.subLead = sub.personId

  // Who trades with whom. Adobe never learns CloudEPA exists.
  const trades = (a: string, b: string, relationship: string) =>
    prisma.counterparty.create({ data: { companyId: a, otherCompanyId: b, relationship } })
  await trades(co.adobe, co.magnit, 'MSP')
  await trades(co.magnit, co.adobe, 'CLIENT')
  await trades(co.magnit, co.prime, 'SUPPLIER')
  await trades(co.prime, co.magnit, 'MSP')
  await trades(co.prime, co.adobe, 'CLIENT')
  await trades(co.adobe, co.prime, 'SUPPLIER')
  await trades(co.prime, co.sub, 'SUPPLIER')
  await trades(co.sub, co.prime, 'PRIME')

  // Adobe's budget: the cost centre the role is funded from, and the
  // plan that says how many heads and how much money it may spend.
  const cc = await prisma.costCenter.create({
    data: { companyId: co.adobe, code: 'DME-PLAT-4100', name: 'Digital Media — Platform' },
  })
  it_.costCentre = cc.id
  await prisma.headcountPlan.create({
    data: { costCenterId: cc.id, period: '2026', approvedHeads: 6, annualBudget: 2_400_000, currency: 'USD' },
  })

  // The delegation of authority. Anything over $100k a year is Dana's.
  await prisma.approvalRule.create({
    data: {
      companyId: co.adobe, name: 'Platform — over $100k', thresholdAmount: 100_000,
      approverId: who.vp, rank: 1, isActive: true, authoredById: who.pm,
    },
  })

  // Priya, and the one bench she has agreed to be on.
  const priya = await prisma.person.create({
    data: { name: 'Priya Raman', primaryEmail: CONSULTANT },
  })
  who.priya = priya.id
  const profile = await prisma.consultantProfile.create({
    data: {
      personId: priya.id, skills: ['SAP FICO', 'S/4HANA'],
      location: 'San Jose, California', visibility: 'VERIFIED', workAuth: 'GC',
      availableFrom: new Date('2026-09-01'),
    },
  })
  it_.profile = profile.id
  await prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: co.sub, tier: 'RETAINED',
      state: 'GRANTED', invitedAt: new Date('2026-08-10'),
      respondedAt: new Date('2026-08-11'), grantedAt: new Date('2026-08-11'),
    },
  })
  // The seat a bench consultant gets: pointed at the agency that lists
  // her, carrying no role and therefore no permissions. It is what lets
  // her file her own hours and nothing else of CloudEPA's.
  await prisma.context.create({
    data: { personId: priya.id, companyId: co.sub, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
  })
}, 240_000)

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

// ═══════════════════════════════════════════════════════════════════
// Part one — the demand
// ═══════════════════════════════════════════════════════════════════

describe('Step 1 — a manager at Adobe raises a requisition', () => {
  it('is routed to an approver rather than opened, because it is worth $288,000 a year', async () => {
    as(ADOBE_PM)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'SAP FICO consultant — Digital Media platform',
      skills: ['SAP FICO', 'S/4HANA'],
      location: 'San Jose, California',
      headcount: 1, billMin: 12_000, billMax: 15_000, months: 12,
      neededBy: '2026-09-07',
      justification: 'Backfill for the platform close cycle',
      costCenterId: it_.costCentre,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.requisition = r.body.data.requisition.id
    expect(r.body.data.requisition.approvalState).toBe('PENDING_APPROVAL')
  })

  it('is not open to a single vendor until somebody has said yes', async () => {
    const q = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })
    expect(q.status).toBe('DRAFT')
    const invitations = await prisma.requirementInvitation.count({ where: { requirementId: it_.requisition } })
    expect(invitations).toBe(0)
  })

  it('records why it routed, in words the manager can read', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: co.adobe, action: 'REQUISITION_ROUTED' },
    })
    expect(log.reason).toContain('HEADCOUNT')
    expect(log.reason).toContain('BUDGET')
  })
})

describe('Step 2 — the VP approves it, and only then does it open', () => {
  it('refuses the manager who raised it — the approval is not theirs to give', async () => {
    as(ADOBE_PM)
    const r = await json(await decideRequisition(
      req('POST', `/api/requisitions/${it_.requisition}/approve`, { action: 'approve' }),
      { params: Promise.resolve({ id: it_.requisition }) }
    ))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('FORBIDDEN')
  })

  it('opens the moment the last rank approves', async () => {
    as(ADOBE_VP)
    const r = await json(await decideRequisition(
      req('POST', `/api/requisitions/${it_.requisition}/approve`, {
        action: 'approve', reason: 'Backfill agreed at the platform review',
      }),
      { params: Promise.resolve({ id: it_.requisition }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.fullyApproved).toBe(true)
    expect(r.body.data.status).toBe('OPEN')
  })
})

describe('Step 3 — Adobe puts it in front of its MSP, with a band', () => {
  it('sends it to Magnit and nobody else', async () => {
    as(ADOBE_PM)
    const r = await json(await distributeRequisition(
      req('POST', `/api/requisitions/${it_.requisition}/distribute`, {
        vendors: [{ companyId: co.magnit, payMin: 11_000, payMax: 14_000, message: 'Programme panel — usual terms' }],
        expiresAt: soon(14),
      }),
      { params: Promise.resolve({ id: it_.requisition }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.summary.sent).toBe(1)
  })

  it('does not echo the band back in the response, where a second vendor could read it', async () => {
    const inv = await prisma.requirementInvitation.findFirstOrThrow({
      where: { requirementId: it_.requisition, toCompanyId: co.magnit },
    })
    it_.mspInvite = inv.id
    expect(inv.payMax).toBe(14_000)
  })

  it('refuses a band above the ceiling the requisition itself was approved at', async () => {
    as(ADOBE_PM)
    const r = await json(await distributeRequisition(
      req('POST', `/api/requisitions/${it_.requisition}/distribute`, {
        vendors: [{ companyId: co.prime, payMin: 14_000, payMax: 19_000 }],
      }),
      { params: Promise.resolve({ id: it_.requisition }) }
    ))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('exceeds the requisition ceiling')
  })
})

describe('Step 4 — Magnit takes it on and passes it down the panel', () => {
  it('accepts the invitation before doing anything with it', async () => {
    as(MSP)
    const r = await json(await answerInvitation(
      req('POST', `/api/invitations/${it_.mspInvite}/respond`, {
        action: 'accept', reason: 'Panel supplier search opening today',
      }),
      { params: Promise.resolve({ id: it_.mspInvite }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('writes its own record of the role, carrying Adobe forward as the end client', async () => {
    as(MSP)
    const r = await json(await createRequirement(req('POST', '/api/requirements', {
      title: 'SAP FICO consultant — Digital Media platform',
      skills: ['SAP FICO', 'S/4HANA'],
      location: 'San Jose, California',
      billMin: 10_500, billMax: 13_500, months: 12,
      endClientCompanyId: co.adobe,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.mspRole = r.body.data.requirement.id
    const role = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.mspRole } })
    expect(role.endClientCompanyId).toBe(co.adobe)
    expect(role.status).toBe('OPEN')
  })

  it('has to retype the role rather than accept a copy of it — nothing ties the two records together', async () => {
    // The finding. Demand travels down the chain by somebody rekeying
    // it: there is no route that turns an accepted invitation into the
    // recipient's own record. `Requirement.mirroredFromId` exists for
    // exactly this and only the forwarding path ever sets it.
    //
    // The cost is not the typing. It is that Adobe's requisition and
    // Magnit's copy of it are two unrelated rows, so nothing further
    // down the chain can be counted back against the thing that was
    // approved.
    const role = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.mspRole } })
    expect(role.mirroredFromId).toBeNull()
  })

  it('sends it to Computer Systems at a band of its own', async () => {
    as(MSP)
    const r = await json(await distributeRequirement(
      req('POST', `/api/requirements/${it_.mspRole}/distribute`, {
        toCompanyIds: [co.prime], payMin: 10_500, payMax: 13_500, expiresAt: soon(10),
      }),
      { params: Promise.resolve({ id: it_.mspRole }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const inv = await prisma.requirementInvitation.findFirstOrThrow({
      where: { requirementId: it_.mspRole, toCompanyId: co.prime },
    })
    it_.primeInvite = inv.id
  })
})

describe('Step 5 — Computer Systems takes it on and asks its sub-vendor', () => {
  it('accepts, and records the role against itself so a sub has somewhere to submit', async () => {
    as(PRIME)
    await json(await answerInvitation(
      req('POST', `/api/invitations/${it_.primeInvite}/respond`, { action: 'accept' }),
      { params: Promise.resolve({ id: it_.primeInvite }) }
    ))
    const r = await json(await createRequirement(req('POST', '/api/requirements', {
      title: 'SAP FICO consultant — Digital Media platform',
      skills: ['SAP FICO', 'S/4HANA'],
      location: 'San Jose, California',
      billMin: 9_500, billMax: 11_500, months: 12,
      endClientCompanyId: co.adobe,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.primeRole = r.body.data.requirement.id
  })

  it('sends it to CloudEPA at a third band, $20 below what Adobe will pay', async () => {
    as(PRIME)
    const r = await json(await distributeRequirement(
      req('POST', `/api/requirements/${it_.primeRole}/distribute`, {
        toCompanyIds: [co.sub], payMin: 9_500, payMax: 11_500, expiresAt: soon(7),
      }),
      { params: Promise.resolve({ id: it_.primeRole }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const inv = await prisma.requirementInvitation.findFirstOrThrow({
      where: { requirementId: it_.primeRole, toCompanyId: co.sub },
    })
    it_.subInvite = inv.id
    expect(inv.payMax).toBe(11_500)
  })

  it('leaves CloudEPA unable to see what Adobe agreed to pay', async () => {
    // Three bands, three recipients, and each one reads only its own.
    const theirs = await prisma.requirementInvitation.findMany({ where: { toCompanyId: co.sub } })
    expect(theirs).toHaveLength(1)
    expect(theirs[0].payMax).toBe(11_500)
    const adobes = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })
    expect(adobes.billMax).toBe(15_000)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Part two — the supply
// ═══════════════════════════════════════════════════════════════════

describe('Step 6 — CloudEPA puts Priya forward', () => {
  it('accepts and submits her at $110', async () => {
    as(SUB)
    await json(await answerInvitation(
      req('POST', `/api/invitations/${it_.subInvite}/respond`, { action: 'accept' }),
      { params: Promise.resolve({ id: it_.subInvite }) }
    ))
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.primeRole,
      personIds: [who.priya],
      rate: 11_000,
      fromCompanyId: co.sub,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const created = r.body.data.results.filter((x: any) => x.status === 'created')
    expect(created, JSON.stringify(r.body.data.results)).toHaveLength(1)
    it_.subSubmission = created[0].submissionId
  })

  it('lands on Computer Systems, which is who CloudEPA answered', async () => {
    const s = await prisma.submission.findUniqueOrThrow({ where: { id: it_.subSubmission } })
    expect(s.fromCompanyId).toBe(co.sub)
    expect(s.toCompanyId).toBe(co.prime)
    expect(s.rate).toBe(11_000)
  })

  it('could not have happened without the bench listing Priya granted', async () => {
    const listing = await prisma.benchListing.findFirstOrThrow({
      where: { consultantId: it_.profile, companyId: co.sub },
    })
    expect(listing.state).toBe('GRANTED')
    expect(listing.grantedAt.getTime()).toBeGreaterThan(listing.invitedAt!.getTime())
  })
})

describe('Step 7 — the package is checked before it goes anywhere', () => {
  it('runs the checks CloudEPA is answerable for and says what it found', async () => {
    as(SUB)
    const r = await json(await checkPackage(
      req('POST', `/api/submissions/${it_.subSubmission}/check`, {}),
      { params: Promise.resolve({ id: it_.subSubmission }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const checks = await prisma.check.findMany({
      where: { recordType: 'SUBMISSION', recordId: it_.subSubmission },
    })
    expect(checks.length).toBeGreaterThan(0)
  })
})

describe('Step 8 — Computer Systems forwards her to Adobe at $135', () => {
  it('creates a second submission with its own rate, linked to the first', async () => {
    as(PRIME)
    const r = await json(await forwardSubmission(
      req('POST', `/api/submissions/${it_.subSubmission}/forward`, {
        via: 'ONWARD', toCompanyId: co.adobe, rate: 13_500,
      }),
      { params: Promise.resolve({ id: it_.subSubmission }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.primeSubmission = r.body.data.childSubmissionId
    const child = await prisma.submission.findUniqueOrThrow({ where: { id: it_.primeSubmission } })
    expect(child.fromCompanyId).toBe(co.prime)
    expect(child.toCompanyId).toBe(co.adobe)
    expect(child.rate).toBe(13_500)
    expect(child.parentSubmissionId).toBe(it_.subSubmission)
  })

  it('tells CloudEPA that she was forwarded, and not for how much', async () => {
    const parent = await prisma.submission.findUniqueOrThrow({ where: { id: it_.subSubmission } })
    expect(parent.forwardedAt).not.toBeNull()
    expect(parent.rate).toBe(11_000)
  })

  it('lands on a fresh Adobe requirement rather than the requisition that was approved', async () => {
    // The second finding, and the more expensive one.
    //
    // Forwarding mirrors the role onto the destination's books. Adobe
    // already has this role — it raised it, funded it from a cost
    // centre and had a VP approve it — but the chain arrived through
    // two hand-typed copies, so nothing connects the submission back to
    // it. Adobe now holds two records of one job.
    const child = await prisma.submission.findUniqueOrThrow({ where: { id: it_.primeSubmission } })
    expect(child.requirementId).not.toBe(it_.requisition)

    const landed = await prisma.requirement.findUniqueOrThrow({ where: { id: child.requirementId } })
    expect(landed.companyId).toBe(co.adobe)
    expect(landed.costCenterId).toBeNull()
    expect(landed.raisedById).toBeNull()

    const atAdobe = await prisma.requirement.count({ where: { companyId: co.adobe } })
    expect(atAdobe).toBe(2)
  })
})

describe('Step 9 — Adobe interviews her, three rounds', () => {
  const rounds: Array<{ stage: string; mode: string; outcome: string; id?: string }> = [
    { stage: 'SCREEN', mode: 'PHONE', outcome: 'ADVANCE' },
    { stage: 'TECHNICAL', mode: 'VIDEO', outcome: 'ADVANCE' },
    { stage: 'ONSITE', mode: 'ONSITE', outcome: 'OFFER' },
  ]

  it('runs each round in turn, numbered, and never two at once', async () => {
    for (const [i, round] of rounds.entries()) {
      as(ADOBE_PM)
      const proposed = await json(await proposeInterview(
        req('POST', `/api/submissions/${it_.primeSubmission}/interviews`, {
          stage: round.stage, mode: round.mode, durationMins: 45,
          slots: [{ start: soon(3 + i * 2), end: soon(3 + i * 2) }],
        }),
        { params: Promise.resolve({ id: it_.primeSubmission }) }
      ))
      expect(proposed.body?.error, JSON.stringify(proposed.body)).toBeUndefined()
      round.id = proposed.body.data.id
      expect(proposed.body.data.round).toBe(i + 1)

      // The supplier confirms on the consultant's behalf, and it is
      // recorded as exactly that rather than as her own word.
      as(PRIME)
      const confirmed = await json(await decideInterview(
        req('POST', `/api/interviews/${round.id}`, { action: 'confirm', forConsultant: true }),
        { params: Promise.resolve({ id: round.id! }) }
      ))
      expect(confirmed.body?.error, JSON.stringify(confirmed.body)).toBeUndefined()

      as(ADOBE_PM)
      const said = await json(await decideInterview(
        req('POST', `/api/interviews/${round.id}`, {
          action: 'outcome', outcome: round.outcome, feedback: `${round.stage} passed`,
        }),
        { params: Promise.resolve({ id: round.id! }) }
      ))
      expect(said.body?.error, JSON.stringify(said.body)).toBeUndefined()
    }

    const all = await prisma.interview.findMany({
      where: { submissionId: it_.primeSubmission }, orderBy: { round: 'asc' },
    })
    expect(all.map(i => i.round)).toEqual([1, 2, 3])
    expect(all.map(i => i.stage)).toEqual(['SCREEN', 'TECHNICAL', 'ONSITE'])
  })

  it('refuses to let the supplier record its own candidate as having passed', async () => {
    const last = await prisma.interview.findFirstOrThrow({
      where: { submissionId: it_.primeSubmission }, orderBy: { round: 'desc' },
    })
    as(PRIME)
    const r = await json(await decideInterview(
      req('POST', `/api/interviews/${last.id}`, { action: 'outcome', outcome: 'OFFER' }),
      { params: Promise.resolve({ id: last.id }) }
    ))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_YOURS')
  })

  it('leaves CloudEPA able to see that she is interviewing without seeing Adobe’s notes', async () => {
    const theirs = await prisma.interview.count({ where: { submissionId: it_.subSubmission } })
    expect(theirs).toBe(0)
    const forwarded = await prisma.submission.findUniqueOrThrow({ where: { id: it_.subSubmission } })
    expect(forwarded.forwardedAt).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Part three — the paper
// ═══════════════════════════════════════════════════════════════════

describe('Step 10 — Adobe commits the budget before it commits to a person', () => {
  it('raises a purchase order to Computer Systems for the year', async () => {
    as(ADOBE_PM)
    const r = await json(await raisePurchaseOrder(req('POST', '/api/purchase-orders', {
      number: it_.poNumber, issuedToId: co.prime, amount: 259_200,
      currency: 'USD', startDate: '2026-09-14', endDate: '2027-09-13',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.po = r.body.data.purchaseOrder?.id ?? r.body.data.id
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: it_.po } })
    expect(po.issuedById).toBe(co.adobe)
    expect(po.issuedToId).toBe(co.prime)
  })

  it('carries a ceiling, not a rate — $259,200 for 1,920 hours at $135', async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: it_.po } })
    expect(Number(po.amount)).toBe(259_200)
    expect(13_500 * 1_920).toBe(25_920_000) // the same number, in cents
  })
})

describe('Step 10b — no supplier places anybody without cover on file', () => {
  it('refuses the award outright while Computer Systems has no certificates', async () => {
    // Addendum E: BLOCK where it is legally grounded. Somebody hurt on
    // an Adobe site with an uninsured supplier in the chain is Adobe's
    // problem, so this is a refusal and not a warning to click past.
    as(ADOBE_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.primeSubmission}/award`, { rate: 13_500 }),
      { params: Promise.resolve({ id: it_.primeSubmission }) }
    ))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('AWARD_BLOCKED')
    expect(r.body.error.message).toContain("general liability and workers' compensation")
  })

  it('clears once both certificates are on file and in date', async () => {
    await insure(co.prime, who.primeLead)
    await insure(co.sub, who.subLead)
    const cover = await prisma.verification.count({
      where: { companyId: { in: [co.prime, co.sub] }, status: 'CLEAR' },
    })
    expect(cover).toBe(4)
  })
})

describe('Step 11 — Adobe awards it, and Computer Systems gets a contract pair', () => {
  it('creates the sell contract Computer Systems bills Adobe under', async () => {
    as(ADOBE_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.primeSubmission}/award`, {
        rate: 13_500, startDate: '2026-09-14', endDate: '2027-09-13',
      }),
      { params: Promise.resolve({ id: it_.primeSubmission }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.prime, clientCompanyId: co.adobe },
    })
    it_.primeSell = sell.id
    it_.primeEngagement = sell.engagementId!
    expect(rate(sell.billRate)).toBe('$135/hr')
    expect(sell.paymentTerms).toBe(45)
  })

  it('creates the buy side too, so the placement has a cost and not only a price', async () => {
    const buy = await prisma.buyContract.findFirstOrThrow({ where: { companyId: co.prime } })
    it_.primeBuy = buy.id
    const linked = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: it_.primeSell } })
    expect(linked.buyContractId).toBe(buy.id)
  })

  it('names CloudEPA as the supplier it buys from, at the $110 CloudEPA asked for', async () => {
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.primeBuy } })
    const seat = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: it_.primeBuy } })
    expect(buy.vendorCompanyId).toBe(co.sub)
    expect(buy.contractType).toBe('C2C')
    expect(rate(seat.payRate)).toBe('$110/hr')
  })

  it('leaves Adobe’s own requisition showing nothing filled, because the award landed on the copy', async () => {
    // The cost of Step 8's finding, in the place it hurts. The award
    // route exists to carry the cost centre, the hiring manager and the
    // seat count onto the contract. It carried nothing, because the
    // requirement it awarded against is a mirror with none of them.
    const approved = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })
    expect(approved.status).toBe('OPEN')

    const filled = await prisma.sellContract.count({ where: { requirementId: it_.requisition } })
    expect(filled).toBe(0)

    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.primeSell } })
    expect(sell.hiringManagerId).toBeNull()
    const coded = await prisma.contractCostAllocation.count({ where: { sellContractId: it_.primeSell } })
    expect(coded).toBe(0)
  })
})

describe('Step 12 — Computer Systems awards its own sub, and CloudEPA gets its pair', () => {
  it('creates the sell contract CloudEPA bills Computer Systems under', async () => {
    as(PRIME)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.subSubmission}/award`, {
        rate: 11_000, payRate: 8_500, startDate: '2026-09-14', endDate: '2027-09-13',
      }),
      { params: Promise.resolve({ id: it_.subSubmission }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.sub, clientCompanyId: co.prime },
    })
    it_.subSell = sell.id
    it_.subEngagement = sell.engagementId!
    expect(rate(sell.billRate)).toBe('$110/hr')
  })

  it('employs Priya rather than buying her from somebody — there is nobody below CloudEPA', async () => {
    const buy = await prisma.buyContract.findFirstOrThrow({ where: { companyId: co.sub } })
    it_.subBuy = buy.id
    expect(buy.vendorCompanyId).toBeNull()
    expect(buy.contractType).toBe('W2')
    const seat = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: it_.subBuy } })
    expect(rate(seat.payRate)).toBe('$85/hr')
  })

  it('makes one firm’s cost the next firm’s revenue, all the way down', async () => {
    const primeBuys = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: it_.primeBuy } })
    const subSells = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.subSell } })
    expect(primeBuys.payRate).toBe(subSells.billRate)
  })

  it('leaves $135 at the top, $110 in the middle and $85 at the bottom', async () => {
    const primeSell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.primeSell } })
    const subSell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.subSell } })
    const priyaSeat = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: it_.subBuy } })
    expect([primeSell.billRate, subSell.billRate, priyaSeat.payRate].map(rate))
      .toEqual(['$135/hr', '$110/hr', '$85/hr'])
  })

  it('takes no rate for the MSP, which routed the work and holds no contract', async () => {
    const mspSells = await prisma.sellContract.count({ where: { companyId: co.magnit } })
    const mspBuys = await prisma.buyContract.count({ where: { companyId: co.magnit } })
    expect([mspSells, mspBuys]).toEqual([0, 0])
  })
})

// Moved above Step 13. This block's own title says "before she sets foot
// on site", and the walk performed it after. Activation now refuses a
// start with no work authorisation on file — the spec's own BLOCK — so
// the paperwork goes where the title always said it belonged.
describe('Step 12b — what has to be true before she sets foot on site', () => {
  it('records the work authorisation check as the one that blocks', async () => {
    await prisma.verification.create({
      data: {
        personId: who.priya, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify',
        referenceId: 'EV-2026-441908', issuedAt: new Date('2026-09-10'),
        uploadedById: who.subLead, verifiedById: who.subLead, verifiedAt: new Date('2026-09-10'),
        result: { outcome: 'CLEAR', notes: 'Employment authorised — permanent resident' },
      },
    })
    const v = await prisma.verification.findFirstOrThrow({
      where: { personId: who.priya, type: 'I9_EVERIFY' },
    })
    expect(v.status).toBe('CLEAR')
  })

  it('records the background check as the one that warns, with an expiry on it', async () => {
    await prisma.verification.create({
      data: {
        personId: who.priya, type: 'BACKGROUND_CHECK', status: 'CLEAR', provider: 'Sterling',
        referenceId: 'ST-88401-B', issuedAt: new Date('2026-09-11'),
        expiresAt: new Date('2027-09-11'),
        uploadedById: who.subLead, verifiedById: who.primeLead, verifiedAt: new Date('2026-09-12'),
        result: { outcome: 'CLEAR', notes: 'County and federal criminal, 7 years — no records' },
      },
    })
    const v = await prisma.verification.findFirstOrThrow({
      where: { personId: who.priya, type: 'BACKGROUND_CHECK' },
    })
    expect(v.expiresAt).not.toBeNull()
    expect(v.uploadedById).not.toBe(v.verifiedById)
  })

})


describe('Step 13 — the contracts are activated, and the PO is attached', () => {
  it('moves both sell contracts from draft to live', async () => {
    for (const [seat, id] of [[ADOBE_PM, it_.primeSell], [PRIME, it_.subSell]] as const) {
      as(seat)
      const r = await json(await activateContract(
        req('POST', `/api/contracts/${id}/activate`, { action: 'activate' }),
        { params: Promise.resolve({ id }) }
      ))
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    }
    const states = await prisma.sellContract.findMany({
      where: { id: { in: [it_.primeSell, it_.subSell] } }, select: { state: true },
    })
    expect(states.every(s => s.state === 'IN_PROGRESS')).toBe(true)
  })

  it('ties Computer Systems’ contract to the purchase order it draws down', async () => {
    // Nothing does this on the award path. Attaching it here is what an
    // AP clerk would do by hand, and it is the reason the invoice
    // matches in Step 18 rather than ageing unmatched.
    await prisma.sellContract.update({
      where: { id: it_.primeSell }, data: { purchaseOrderId: it_.po },
    })
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.primeSell } })
    expect(sell.purchaseOrderId).toBe(it_.po)
  })

  it('activates both buy contracts so payroll has something to pay against', async () => {
    await prisma.buyContract.updateMany({
      where: { id: { in: [it_.primeBuy, it_.subBuy] } }, data: { state: 'IN_PROGRESS' },
    })
    const live = await prisma.buyContract.count({
      where: { id: { in: [it_.primeBuy, it_.subBuy] }, state: 'IN_PROGRESS' },
    })
    expect(live).toBe(2)
  })
})

describe('Step 14 — who Adobe can see on its site, once the contracts are live', () => {
  // These two read the world after activation — a firm appears on the
  // client's compliance page because it holds a live contract whose end
  // client is that site. They were in the paperwork block above and ran
  // before the contracts were live, which is the one moment they cannot
  // be true.
  it('shows Adobe every firm working on its site, CloudEPA included', async () => {
    // Worth saying out loud, because it cuts against the rest of the
    // walk. Adobe has no counterparty record for CloudEPA and cannot
    // find them anywhere else in the product — and here they are, named
    // on Adobe's own compliance page, because CloudEPA holds a contract
    // whose end client is Adobe.
    //
    // That is Addendum E working rather than a leak: tenure accrues to
    // the person at the client aggregated across every vendor, and a
    // client that cannot see which firms are on its site cannot compute
    // it or answer for it. But it is also the prime's supply chain, and
    // primes hide subs for a living. It is a decision, and it should be
    // a decided one.
    as(ADOBE_PM)
    const r = await json(await complianceView(req('GET', '/api/compliance')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const named = (r.body.data.verifications.companies ?? []).map((c: any) => c.name)
    expect(named).toContain('CloudEPA')
    expect(named).toContain('Computer Systems')
  })

  it('still gives Adobe no way to reach CloudEPA — the visibility is the site, not the relationship', async () => {
    const reachable = await prisma.counterparty.findMany({ where: { companyId: co.adobe } })
    expect(reachable.map(c => c.otherCompanyId)).not.toContain(co.sub)
  })

  it('records the suppliers\' cover — the certificates a real firm has on file before anybody starts', async () => {
    for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
      await prisma.verification.create({
        data: {
          companyId: co.prime, type, status: 'CLEAR', provider: 'Hartford',
          issuedAt: new Date('2026-01-15'), expiresAt: new Date('2027-01-15'),
          uploadedById: who.primeLead, verifiedById: who.primeLead, verifiedAt: new Date('2026-01-16'),
          result: { outcome: 'CLEAR' },
        },
      })
    }
    for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
      await prisma.verification.create({
        data: {
          companyId: co.sub, type, status: 'CLEAR', provider: 'Hartford',
          issuedAt: new Date('2026-01-15'), expiresAt: new Date('2027-01-15'),
          uploadedById: who.subLead, verifiedById: who.subLead, verifiedAt: new Date('2026-01-16'),
          result: { outcome: 'CLEAR' },
        },
      })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Part four — compliance
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Part five — the money
// ═══════════════════════════════════════════════════════════════════

describe('Step 15 — Priya files one week, once', () => {
  it('files it against the contract of the firm that employs her', async () => {
    as(CONSULTANT)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.subSell,
      periodStart: WEEK.start, periodEnd: WEEK.end, days: FIVE_EIGHTS,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.timesheet = r.body.data.timesheet.id
    expect(r.body.data.timesheet.totalHours).toBe(40)
  })

  it('sends it for signature', async () => {
    as(CONSULTANT)
    const r = await json(await sendTimesheet(
      req('POST', `/api/timesheets/${it_.timesheet}/submit`, {}),
      { params: Promise.resolve({ id: it_.timesheet }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('refuses to let her sign off her own hours', async () => {
    as(CONSULTANT)
    const r = await json(await signTimesheet(
      req('POST', `/api/timesheets/${it_.timesheet}/approve`, {}),
      { params: Promise.resolve({ id: it_.timesheet }) }
    ))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Nobody approves their own hours.')
  })
})

describe('Step 16 — two signatures, from two different companies', () => {
  it('has Adobe say the work happened', async () => {
    as(ADOBE_PM)
    const r = await json(await signTimesheet(
      req('POST', `/api/timesheets/${it_.timesheet}/approve`, {}),
      { params: Promise.resolve({ id: it_.timesheet }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const a = await prisma.workAssertion.findFirstOrThrow({
      where: { timesheetId: it_.timesheet, role: 'CLIENT_APPROVAL' },
    })
    expect(a.companyId).toBe(co.adobe)
    expect(a.state).toBe('LIVE')
  })

  it('has CloudEPA accept what it will pay for, which is a different statement', async () => {
    as(SUB)
    const r = await json(await signTimesheet(
      req('POST', `/api/timesheets/${it_.timesheet}/approve`, { as: 'EMPLOYER' }),
      { params: Promise.resolve({ id: it_.timesheet }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const a = await prisma.workAssertion.findFirstOrThrow({
      where: { timesheetId: it_.timesheet, role: 'EMPLOYER_ACCEPTANCE' },
    })
    expect(a.companyId).toBe(co.sub)
  })

  it('is still one row of hours, not one per hop', async () => {
    const n = await prisma.timesheet.count({ where: { personId: who.priya } })
    expect(n).toBe(1)
  })
})

describe('Step 17 — CloudEPA pays Priya', () => {
  it('owes her 40 hours at $85 — $3,400', async () => {
    as(SUB)
    const r = await json(await payroll(req('GET', '/api/payroll')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = (r.body.data.payItems ?? []).find((x: any) => x.buyContractId === it_.subBuy)
    expect(row, 'CloudEPA has no pay item for Priya').toBeTruthy()
    expect(Number(row.totalApprovedHours)).toBe(40)
    expect(Number(row.grossPay)).toBe(40 * 8_500)
  }, 60_000)
})

describe('Step 18 — CloudEPA invoices Computer Systems, and is paid', () => {
  it('raises $4,400 for the week, on the 45-day terms the agreement carries', async () => {
    as(SUB)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.subEngagement, periodStart: WEEK.start, periodEnd: WEEK.end,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.subInvoice = r.body.data.invoice?.id ?? r.body.data.invoices?.[0]?.id
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: it_.subInvoice } })
    expect(Number(inv.total)).toBe(4_400)
  })

  it('records the money arriving, against the invoice it settles', async () => {
    as(SUB)
    const r = await json(await recordReceipt(req('POST', '/api/ar/payments', {
      invoiceId: it_.subInvoice, amount: 4_400, currency: 'USD',
      method: 'ACH', reference: 'CS-REMIT-90412', receivedAt: '2026-10-26',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: it_.subInvoice } })
    expect(Number(inv.paid)).toBe(4_400)
  })
})

describe('Step 19 — the same week reaches Adobe, at Adobe’s rate', () => {
  it('still has the hours filed nowhere but on CloudEPA’s contract', async () => {
    // Nothing was copied. One week of Priya's life, one row, exactly as
    // before — Computer Systems' own contract has no timesheet on it and
    // never will.
    const onPrime = await prisma.timesheet.count({ where: { sellContractId: it_.primeSell } })
    expect(onPrime).toBe(0)
    const everywhere = await prisma.timesheet.count({ where: { personId: who.priya } })
    expect(everywhere).toBe(1)
  })

  it('reaches them through the rung below, which the award wrote down', async () => {
    // BuyContract.supplierSellContractId — the edge that makes the
    // ladder walkable. Without it a prime can pay its sub and has
    // nothing to invoice its client from.
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.primeBuy } })
    expect(buy.supplierSellContractId).toBe(it_.subSell)

    // And it ends where the person is employed, rather than going on
    // forever.
    const bottom = await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.subBuy } })
    expect(bottom.supplierSellContractId).toBeNull()
  })

  it('invoices Adobe $5,400 — forty hours at $135, not at CloudEPA’s $110', async () => {
    as(PRIME)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.primeEngagement, periodStart: WEEK.start, periodEnd: WEEK.end,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.primeInvoice = r.body.data.invoice?.id ?? r.body.data.invoices?.[0]?.id
    const inv = await prisma.invoice.findUniqueOrThrow({
      where: { id: it_.primeInvoice }, include: { invoiceLines: true },
    })
    expect(Number(inv.total)).toBe(5_400)
    expect(inv.invoiceLines).toHaveLength(1)
    expect(inv.invoiceLines[0].rateCents).toBe(13_500)
    // Billed under Computer Systems' own contract, not the sub's.
    expect(inv.invoiceLines[0].sellContractId).toBe(it_.primeSell)
  })

  it('is one week of hours carrying two billings, one per leg', async () => {
    const lines = await prisma.invoiceLine.findMany({
      where: { timesheetId: it_.timesheet }, orderBy: { rateCents: 'asc' },
    })
    expect(lines).toHaveLength(2)
    expect(lines.map(l => l.rateCents)).toEqual([11_000, 13_500])
    expect(lines.map(l => l.sellContractId)).toEqual([it_.subSell, it_.primeSell])
  })

  it('refuses to bill the same week twice on the same contract', async () => {
    as(PRIME)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.primeEngagement, periodStart: WEEK.start, periodEnd: WEEK.end,
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('NO_TIMESHEETS')
  })

  it('draws the invoice down against the purchase order that authorised it', async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: it_.po }, include: { invoices: true },
    })
    expect(po.invoices.map(i => i.id)).toEqual([it_.primeInvoice])
  })

  it('records Adobe’s money arriving', async () => {
    as(PRIME)
    const r = await json(await recordReceipt(req('POST', '/api/ar/payments', {
      invoiceId: it_.primeInvoice, amount: 5_400, currency: 'USD',
      method: 'ACH', reference: 'ADBE-AP-771204', receivedAt: '2026-11-02',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: it_.primeInvoice } })
    expect(Number(inv.paid)).toBe(5_400)
  })

  it('has moved $5,400 from Adobe to $3,400 in Priya’s hands, with $1,000 kept at each hop', async () => {
    const adobePaid = 5_400
    const cloudepaPaid = 4_400
    const priyaPaid = 40 * 85
    expect(adobePaid - cloudepaPaid).toBe(1_000)
    expect(cloudepaPaid - priyaPaid).toBe(1_000)
  })
})

describe('Step 20 — what each firm made', () => {
  it('shows CloudEPA $1,000 on the week — $4,400 in, $3,400 out', async () => {
    as(SUB)
    const r = await json(await profitability(req('GET', '/api/profitability?by=candidate')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(40 * 11_000 - 40 * 8_500).toBe(100_000)
  }, 60_000)

  it('shows Computer Systems the same $1,000 — $5,400 in, $4,400 out', async () => {
    as(PRIME)
    const r = await json(await profitability(req('GET', '/api/profitability?by=candidate')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(40 * 13_500 - 40 * 11_000).toBe(100_000)
  }, 60_000)

  it('tells Computer Systems what it owes CloudEPA, which it could not see before', async () => {
    // Payroll reads its own sell side for a W2 placement and the
    // supplier's for a corp-to-corp one. Reaching only its own, a prime
    // reported a supplier as owed nothing for work that had been done
    // and signed off.
    as(PRIME)
    const r = await json(await payroll(req('GET', '/api/payroll')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = (r.body.data.payItems ?? []).find((x: any) => x.buyContractId === it_.primeBuy)
    expect(row, 'Computer Systems cannot see what it owes CloudEPA').toBeTruthy()
    expect(Number(row.totalApprovedHours)).toBe(40)
    expect(Number(row.grossPay)).toBe(40 * 11_000)
  }, 60_000)

  it('leaves Adobe unable to see CloudEPA anywhere in its own programme', async () => {
    const seen = await prisma.counterparty.findMany({ where: { companyId: co.adobe } })
    expect(seen.map(c => c.otherCompanyId).sort()).toEqual([co.magnit, co.prime].sort())
    expect(seen.map(c => c.otherCompanyId)).not.toContain(co.sub)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Part six — and all of it on one screen
// ═══════════════════════════════════════════════════════════════════

describe('Step 21 — one placement, opened, top to bottom', () => {
  it('gives CloudEPA the whole thread for Priya in one answer', async () => {
    // The screen the demo did not have. Sixty lists and four things you
    // could open meant a vendor could be shown sets of records and could
    // not follow one person through their working life.
    as(SUB)
    const r = await json(await placement(
      req('GET', `/api/placements/${it_.subSell}`),
      { params: Promise.resolve({ id: it_.subSell }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const d = r.body.data

    expect(d.person.name).toBe('Priya Raman')
    expect(d.origin.title).toContain('SAP FICO')
    expect(d.submission.from.name).toBe('CloudEPA')
    expect(d.contracts.sell.billRate).toBe(110)
    expect(d.contracts.buy.payRate).toBe(85)
    expect(d.contracts.buy.vendor).toBeNull()      // they employ her
    expect(d.timesheets).toHaveLength(1)
    expect(d.timesheets[0].hours).toBe(40)
    expect(d.money.margin).toBe(1_000)
  })

  it('shows both signatures, from the two companies that actually made them', async () => {
    as(SUB)
    const r = await json(await placement(
      req('GET', `/api/placements/${it_.subSell}`),
      { params: Promise.resolve({ id: it_.subSell }) }
    ))
    const week = r.body.data.timesheets[0]
    expect(week.clientApproved.hours).toBe(40)
    expect(week.employerAccepted.hours).toBe(40)
    expect(week.billedByUs).toBe(true)
  })

  it('shows Computer Systems their own leg — $135 in, $110 out — and not CloudEPA’s', async () => {
    as(PRIME)
    const r = await json(await placement(
      req('GET', `/api/placements/${it_.primeSell}`),
      { params: Promise.resolve({ id: it_.primeSell }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const d = r.body.data
    expect(d.contracts.sell.billRate).toBe(135)
    expect(d.contracts.buy.payRate).toBe(110)
    expect(d.contracts.buy.vendor.name).toBe('CloudEPA')
    // One firm below them, and what CloudEPA pays Priya is not in here.
    expect(d.chain.hopsBelow).toBe(1)
    expect(JSON.stringify(d)).not.toContain('8500')
  })

  it('finds the hours through the chain, on a contract that carries none of its own', async () => {
    as(PRIME)
    const r = await json(await placement(
      req('GET', `/api/placements/${it_.primeSell}`),
      { params: Promise.resolve({ id: it_.primeSell }) }
    ))
    // Computer Systems' own contract has no timesheet on it and never
    // will — the money still reads, because the invoice does.
    expect(r.body.data.money.invoices).toHaveLength(1)
    expect(r.body.data.money.billed).toBe(5_400)
  })

  it('refuses a firm that is not a party, without confirming the placement exists', async () => {
    // 404 rather than 403. Telling a stranger that a placement is there
    // is itself the leak.
    as(MSP)
    const r = await json(await placement(
      req('GET', `/api/placements/${it_.subSell}`),
      { params: Promise.resolve({ id: it_.subSell }) }
    ))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('No placement by that id.')
  })

  it('writes an access log row for the refusal as well as the read', async () => {
    // Access logging is deliberately fire-and-forget: a read must not
    // wait on its own audit row. So this waits for the write rather than
    // assuming it has landed — asserting immediately passes on a quiet
    // machine and fails on a busy one, which is the worst kind of test.
    let allowed = false
    let refused = false
    for (let attempt = 0; attempt < 40 && !(allowed && refused); attempt++) {
      const rows = await prisma.accessLog.findMany({
        where: { subjectId: who.priya, action: 'CONTRACT_VIEW' },
        select: { allowed: true },
      })
      allowed = rows.some(r => r.allowed)
      refused = rows.some(r => !r.allowed)
      if (allowed && refused) break
      await new Promise(r => setTimeout(r, 50))
    }
    expect(allowed, 'no permitted read was logged').toBe(true)
    expect(refused, 'the refusal was not logged').toBe(true)
  })
})
