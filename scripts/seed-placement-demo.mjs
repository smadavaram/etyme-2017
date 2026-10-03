/**
 * One placement worth showing somebody.
 *
 * A demo of this product fell flat because there was nothing to follow:
 * sixty lists, and clicking a name did nothing. This seeds the opposite
 * — a single consultant whose whole working life is on the record, so
 * the placement screen has a story to tell rather than seven empty
 * stations.
 *
 * The chain is the one from docs/full-spine.md:
 *
 *   Adobe Systems ← Computer Systems ← CloudEPA ← Priya Raman
 *      $135/hr          $110/hr          $85/hr
 *
 * Idempotent by slug and email: run it twice and you get one chain.
 *
 *   node scripts/seed-placement-demo.mjs
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const D = (s) => new Date(s)

async function company(name, slug, kind, email) {
  const c = await db.company.upsert({
    where: { slug },
    update: {},
    create: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45 },
  })
  const role =
    (await db.role.findFirst({ where: { companyId: c.id, name: 'Owner' } })) ??
    (await db.role.create({
      data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
    }))
  const p = await db.person.upsert({
    where: { primaryEmail: email }, update: {}, create: { name, primaryEmail: email },
  })
  const seat = await db.context.findFirst({ where: { personId: p.id, companyId: c.id } })
  if (!seat) {
    await db.context.create({
      data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Demo chain' },
    })
  }
  return { companyId: c.id, personId: p.id }
}

const adobe = await company('Adobe Systems', 'demo-adobe', 'CLIENT', 'programme@demo-adobe.test')
const prime = await company('Computer Systems', 'demo-computer-systems', 'VENDOR', 'owner@demo-cs.test')
const sub = await company('CloudEPA', 'demo-cloudepa', 'VENDOR', 'owner@demo-cloudepa.test')

const link = async (a, b, relationship) => {
  const found = await db.counterparty.findFirst({
    where: { companyId: a, otherCompanyId: b, relationship },
  })
  if (!found) await db.counterparty.create({ data: { companyId: a, otherCompanyId: b, relationship } })
}
await link(prime.companyId, adobe.companyId, 'CLIENT')
await link(adobe.companyId, prime.companyId, 'SUPPLIER')
await link(sub.companyId, prime.companyId, 'PRIME')
await link(prime.companyId, sub.companyId, 'SUPPLIER')

// ── The person ──
const priya = await db.person.upsert({
  where: { primaryEmail: 'priya@demo-person.test' },
  update: {},
  create: { name: 'Priya Raman', primaryEmail: 'priya@demo-person.test' },
})
const profile =
  (await db.consultantProfile.findFirst({ where: { personId: priya.id } })) ??
  (await db.consultantProfile.create({
    data: {
      personId: priya.id, skills: ['SAP FICO', 'S/4HANA'],
      location: 'San Jose, California', visibility: 'VERIFIED', workAuth: 'GC',
    },
  }))
if (!(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: sub.companyId } }))) {
  await db.benchListing.create({
    data: {
      consultantId: profile.id, companyId: sub.companyId, tier: 'RETAINED', state: 'GRANTED',
      invitedAt: D('2026-08-10'), respondedAt: D('2026-08-11'), grantedAt: D('2026-08-11'),
    },
  })
}

// ── Where the work came from ──
const requirement =
  (await db.requirement.findFirst({ where: { companyId: prime.companyId, title: { startsWith: 'SAP FICO consultant' } } })) ??
  (await db.requirement.create({
    data: {
      companyId: prime.companyId, title: 'SAP FICO consultant — Digital Media platform',
      skills: ['SAP FICO', 'S/4HANA'], location: 'San Jose, California',
      billMin: 9_500, billMax: 11_500, months: 12, headcount: 1,
      endClientCompanyId: adobe.companyId, status: 'FILLED',
      approvalState: 'AUTO_APPROVED', source: 'MANUAL', neededBy: D('2026-09-14'),
    },
  }))

if (!(await db.requirementInvitation.findFirst({ where: { requirementId: requirement.id, toCompanyId: sub.companyId } }))) {
  await db.requirementInvitation.create({
    data: {
      requirementId: requirement.id, fromCompanyId: prime.companyId, toCompanyId: sub.companyId,
      payMin: 9_500, payMax: 11_500, status: 'ACCEPTED', expiresAt: D('2026-10-01'),
      message: 'Panel supplier search — usual terms',
    },
  })
}

// ── How she reached them ──
const submission =
  (await db.submission.findFirst({ where: { requirementId: requirement.id, personId: priya.id } })) ??
  (await db.submission.create({
    data: {
      requirementId: requirement.id, personId: priya.id,
      fromCompanyId: sub.companyId, toCompanyId: prime.companyId,
      // Computed from ownership, never chosen: she is on CloudEPA's own
      // bench, so this is a BENCH submission.
      kind: 'BENCH',
      rate: 11_000, status: 'PLACED', checkState: 'SENT',
      submittedAt: D('2026-09-01'), forwardedAt: D('2026-09-02'), decidedAt: D('2026-09-10'),
    },
  }))

const rounds = [
  { round: 1, stage: 'SCREEN', mode: 'PHONE', at: '2026-09-03' },
  { round: 2, stage: 'TECHNICAL', mode: 'VIDEO', at: '2026-09-05' },
  { round: 3, stage: 'ONSITE', mode: 'ONSITE', at: '2026-09-08' },
]
for (const r of rounds) {
  const has = await db.interview.findFirst({ where: { submissionId: submission.id, round: r.round } })
  if (!has) {
    await db.interview.create({
      data: {
        submissionId: submission.id, companyId: prime.companyId, vendorId: sub.companyId,
        round: r.round, stage: r.stage, mode: r.mode, state: 'DONE',
        proposedSlots: [], durationMins: 45, scheduledAt: D(r.at), decidedAt: D(r.at),
        requestedById: prime.personId, decidedById: prime.personId,
        clientConfirmedAt: D(r.at), vendorConfirmedAt: D(r.at),
        feedback: r.round === 3 ? 'Strong close-cycle experience. Offer.' : 'Passed.',
      },
    })
  }
}

// ── What was agreed, on both sides ──
async function pair({ seller, buyer, endClient, bill, pay, supplierSellContractId, contractType, vendorCompanyId }) {
  const existing = await db.sellContract.findFirst({
    where: { companyId: seller, personId: priya.id, clientCompanyId: buyer },
  })
  if (existing) return existing
  const msa =
    (await db.masterAgreement.findFirst({ where: { vendorId: seller, clientId: buyer } })) ??
    (await db.masterAgreement.create({
      data: { vendorId: seller, clientId: buyer, paymentTerms: 45, currency: 'USD', signedAt: D('2026-06-01') },
    }))
  const engagement =
    (await db.engagement.findFirst({ where: { msaId: msa.id, title: requirement.title } })) ??
    (await db.engagement.create({ data: { msaId: msa.id, title: requirement.title, invoiceCycle: 'BIWEEKLY' } }))

  const sell = await db.sellContract.create({
    data: {
      companyId: seller, clientCompanyId: buyer, endClientCompanyId: endClient,
      personId: priya.id, requirementId: requirement.id, engagementId: engagement.id, msaId: msa.id,
      billRate: bill, billCurrency: 'USD', paymentTerms: 45, state: 'IN_PROGRESS',
      startDate: D('2026-09-14'), endDate: D('2027-09-13'),
    },
  })
  const buy = await db.buyContract.create({
    data: {
      companyId: seller, vendorCompanyId, payCurrency: 'USD', contractType,
      state: 'IN_PROGRESS', startDate: D('2026-09-14'), endDate: D('2027-09-13'),
      supplierSellContractId: supplierSellContractId ?? null,
    },
  })
  await db.buyContractCandidate.create({
    data: {
      buyContractId: buy.id, personId: priya.id, payRate: pay, payCurrency: 'USD',
      startDate: D('2026-09-14'), endDate: D('2027-09-13'),
    },
  })
  await db.contractLink.create({
    data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: D('2026-09-14'), effectiveTo: D('2027-09-13') },
  })
  return sell
}

// CloudEPA employs her; nobody below, so no supplier contract and no vendor.
const subSell = await pair({
  seller: sub.companyId, buyer: prime.companyId, endClient: adobe.companyId,
  bill: 11_000, pay: 8_500, contractType: 'W2', vendorCompanyId: null,
})
// Computer Systems buys from CloudEPA — the edge that makes the ladder walkable.
const primeSell = await pair({
  seller: prime.companyId, buyer: adobe.companyId, endClient: adobe.companyId,
  bill: 13_500, pay: 11_000, contractType: 'C2C', vendorCompanyId: sub.companyId,
  supplierSellContractId: subSell.id,
})

// ── Cleared to work ──
for (const v of [
  { personId: priya.id, type: 'I9_EVERIFY', provider: 'E-Verify' },
  { personId: priya.id, type: 'BACKGROUND_CHECK', provider: 'Sterling', expiresAt: D('2027-09-11') },
  { companyId: sub.companyId, type: 'INSURANCE_GL', provider: 'Hartford', expiresAt: D('2027-06-01') },
  { companyId: sub.companyId, type: 'INSURANCE_WC', provider: 'Hartford', expiresAt: D('2027-06-01') },
]) {
  const where = v.personId ? { personId: v.personId, type: v.type } : { companyId: v.companyId, type: v.type }
  if (!(await db.verification.findFirst({ where }))) {
    await db.verification.create({
      data: {
        ...v, status: 'CLEAR', issuedAt: D('2026-09-10'),
        uploadedById: sub.personId, verifiedById: prime.personId, verifiedAt: D('2026-09-12'),
        result: { outcome: 'CLEAR' },
      },
    })
  }
}

// ── One week, two signatures, billed at each hop ──
const days = { '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }
let sheet = await db.timesheet.findFirst({ where: { sellContractId: subSell.id, periodStart: D('2026-09-14') } })
if (!sheet) {
  sheet = await db.timesheet.create({
    data: {
      sellContractId: subSell.id, personId: priya.id,
      periodStart: D('2026-09-14'), periodEnd: D('2026-09-18'),
      days, totalHours: 40, status: 'APPROVED',
      submittedAt: D('2026-09-18'), approvedAt: D('2026-09-21'),
    },
  })
  await db.workAssertion.createMany({
    data: [
      { timesheetId: sheet.id, companyId: adobe.companyId, role: 'CLIENT_APPROVAL', hours: 40, rateCents: 13_500, state: 'LIVE' },
      { timesheetId: sheet.id, companyId: sub.companyId, role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 8_500, state: 'LIVE' },
    ],
  })
}

async function invoice(sell, number, rateCents, clientId) {
  if (await db.invoiceLine.findFirst({ where: { timesheetId: sheet.id, sellContractId: sell.id } })) return
  const amount = 40 * rateCents
  const inv = await db.invoice.create({
    data: {
      engagementId: sell.engagementId, number, periodStart: D('2026-09-14'), periodEnd: D('2026-09-18'),
      currency: 'USD', total: amount / 100, paid: amount / 100, dueAt: D('2026-11-02'),
      issuedAt: D('2026-09-22'), status: 'PAID',
    },
  })
  await db.invoiceLine.create({
    data: {
      invoiceId: inv.id, timesheetId: sheet.id, sellContractId: sell.id, personId: priya.id,
      hours: 40, rateCents, amountCents: amount,
      description: 'Priya Raman — 2026-09-14 to 2026-09-18',
    },
  })
  await db.payment.create({
    data: {
      invoiceId: inv.id, payerCompanyId: clientId, receivedByCompanyId: sell.companyId,
      amount: amount / 100, currency: 'USD', method: 'ACH', receivedAt: D('2026-10-26'), appliedAt: D('2026-10-26'),
    },
  })
}
await invoice(subSell, 'IN-CLOUDEPA-001', 11_000, prime.companyId)
await invoice(primeSell, 'IN-CS-001', 13_500, adobe.companyId)

console.log('Seeded one placement, followable end to end.\n')
console.log('  CloudEPA view       /dashboard/placements/' + subSell.id)
console.log('  Computer Systems    /dashboard/placements/' + primeSell.id)
console.log('\n  sign in as owner@demo-cloudepa.test  or  owner@demo-cs.test')
await db.$disconnect()
