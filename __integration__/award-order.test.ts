import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as awardSubmission } from '@/app/api/submissions/[id]/award/route'
import { POST as convertSubmission } from '@/app/api/submissions/[id]/convert/route'
import { nounFor } from '@/lib/order-naming'

/**
 * The award raises the purchase order, and the contract is its first line.
 *
 * ── What this walk proves ────────────────────────────────────────────
 *
 * A purchase order is one document — a header and its lines. The header
 * is the commitment to a counterparty: who, how much, over what dates,
 * on what terms. A line is one person at one rate at one site, and that
 * is what `SellContract` and `BuyContract` are. CLAUDE.md, 2026-09-18,
 * from the founder: *"the client raises one every time."*
 *
 * The award wrote the lines and never the header. `WorkOrder` had zero
 * rows for the life of the product, and three things followed: no
 * ceiling for an invoice to match against, milestone billing
 * unreachable, and `cron/auto-approve` reading the client's own term off
 * a row that did not exist — so the nightly job approved nothing from
 * the day it was written.
 *
 * ── Who is in it ─────────────────────────────────────────────────────
 *
 *   Northbend Athletic  the client. Awards, and its order is the one
 *                       its AP desk will quote.
 *   Veritan Talent      a staffing firm selling to Northbend, bringing
 *                       two of its own W2 employees.
 *   Auralis Software    a systems integrator selling to Northbend and
 *                       buying the person from a sub-vendor.
 *   Marrow Field        the sub-vendor under Auralis. Northbend never
 *                       sees the order Auralis raises to it.
 */

const NORTHBEND = 'program@northbend.invalid'
const VERITAN = 'owner@veritan.invalid'
const AURALIS = 'owner@auralis.invalid'
const MARROW = 'owner@marrow.invalid'

const co = { northbend: '', veritan: '', auralis: '', marrow: '' }
const who = { pm: '', veritanLead: '', auralisLead: '', marrowLead: '', rosa: '', dev: '', chained: '', unpriced: '' }
const it_ = {
  seat: '', firstSubmission: '', secondSubmission: '',
  chainSeat: '', subSubmission: '', primeSubmission: '',
  unpricedSeat: '', unpricedSubmission: '',
  order: '', firstContract: '', secondContract: '',
}

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45, templatePack: 'US_IT' },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name: `${name} lead`, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'order header walk' },
  })
  return { companyId: c.id, personId: p.id, roleId: role.id }
}

/** Cover on file, which is what lets a supplier place anybody at all. */
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

async function worker(name: string, email: string, employerId: string, roleId: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: employerId, roleId, type: 'EMPLOYEE', grantReason: 'Delivery' },
  })
  return p.id
}

async function award(submissionId: string, body: Record<string, unknown>) {
  return json(
    await awardSubmission(req('POST', `/api/submissions/${submissionId}/award`, body), {
      params: Promise.resolve({ id: submissionId }),
    })
  )
}

beforeAll(async () => {
  await resetDatabase()

  const northbend = await company('Northbend Athletic', 'northbend-athletic', 'CLIENT', NORTHBEND)
  co.northbend = northbend.companyId
  who.pm = northbend.personId

  const veritan = await company('Veritan Talent', 'veritan-talent', 'VENDOR', VERITAN)
  co.veritan = veritan.companyId
  who.veritanLead = veritan.personId

  const auralis = await company('Auralis Software', 'auralis-software', 'GSI', AURALIS)
  co.auralis = auralis.companyId
  who.auralisLead = auralis.personId

  const marrow = await company('Marrow Field', 'marrow-field', 'VENDOR', MARROW)
  co.marrow = marrow.companyId
  who.marrowLead = marrow.personId

  for (const [id, by] of [[co.veritan, who.veritanLead], [co.auralis, who.auralisLead], [co.marrow, who.marrowLead]]) {
    await insure(id, by)
  }

  // Where the work happens. The order carries it, because a large client
  // signs in one entity and has the work done at another site.
  await prisma.companyLocation.create({
    data: { companyId: co.northbend, name: 'Tualatin plant', city: 'Tualatin', country: 'US', isPrimary: true },
  })

  who.rosa = await worker('Rosa Iqbal', 'rosa@veritan.invalid', co.veritan, veritan.roleId)
  who.dev = await worker('Dev Anand', 'dev@veritan.invalid', co.veritan, veritan.roleId)
  who.chained = await worker('Priya Raman', 'priya@marrow.invalid', co.marrow, marrow.roleId)
  who.unpriced = await worker('Sam Oyelaran', 'sam@veritan.invalid', co.veritan, veritan.roleId)

  // Two seats on one requisition, with a budget finance stated: the
  // figure the approval chain routed on, and so the ceiling on the order.
  const seat = await prisma.requirement.create({
    data: {
      companyId: co.northbend, title: 'Data engineer — Tualatin',
      skills: ['SQL', 'Airflow'], location: 'Tualatin, Oregon',
      status: 'OPEN', approvalState: 'APPROVED', headcount: 2,
      billMin: 9_000, billMax: 12_000, months: 12,
      budgetCents: 26_000_000, // $260,000 stated, over a year
      startDate: new Date('2026-10-05'), raisedById: who.pm, ownerId: who.pm,
    },
  })
  it_.seat = seat.id

  for (const [personId, rate] of [[who.rosa, 11_000], [who.dev, 10_500]] as const) {
    const s = await prisma.submission.create({
      data: {
        requirementId: seat.id, personId, fromCompanyId: co.veritan, toCompanyId: co.northbend,
        kind: 'INTERNAL', rate, contractType: 'W2', status: 'SUBMITTED',
      },
    })
    if (personId === who.rosa) it_.firstSubmission = s.id
    else it_.secondSubmission = s.id
  }

  // The chain: Marrow puts Priya to Auralis, Auralis puts her to
  // Northbend. Two rungs, so the buy side has a sub-vendor under it.
  const chainSeat = await prisma.requirement.create({
    data: {
      companyId: co.northbend, title: 'Platform engineer — Tualatin',
      skills: ['Kubernetes'], location: 'Tualatin, Oregon',
      status: 'OPEN', approvalState: 'APPROVED', headcount: 1,
      billMin: 12_000, billMax: 15_000, months: 12,
      startDate: new Date('2026-10-05'), raisedById: who.pm, ownerId: who.pm,
    },
  })
  it_.chainSeat = chainSeat.id

  // Auralis's own record of the role it is answering, which is what a
  // forwarded submission hangs on.
  const auralisSeat = await prisma.requirement.create({
    data: {
      companyId: co.auralis, title: 'Platform engineer — Tualatin (via Auralis)',
      skills: ['Kubernetes'], status: 'OPEN', approvalState: 'AUTO_APPROVED', headcount: 1,
      billMax: 15_000, months: 12, raisedById: who.auralisLead, ownerId: who.auralisLead,
    },
  })

  const subSubmission = await prisma.submission.create({
    data: {
      requirementId: auralisSeat.id, personId: who.chained,
      fromCompanyId: co.marrow, toCompanyId: co.auralis,
      // Priya is Marrow's own W2. The chain is what makes the buy leg
      // corp-to-corp — Auralis buys from Marrow, not from Priya.
      kind: 'NETWORK', rate: 11_000, contractType: 'W2', status: 'SUBMITTED',
    },
  })
  it_.subSubmission = subSubmission.id

  it_.primeSubmission = (await prisma.submission.create({
    data: {
      requirementId: chainSeat.id, personId: who.chained,
      fromCompanyId: co.auralis, toCompanyId: co.northbend,
      kind: 'NETWORK', rate: 14_000, contractType: 'W2', status: 'SUBMITTED',
      parentSubmissionId: subSubmission.id,
    },
  })).id

  // A seat nobody priced: no budget, no rate ceiling, and a submission
  // carrying no rate either. There is nothing to value an order at.
  const unpricedSeat = await prisma.requirement.create({
    data: {
      companyId: co.northbend, title: 'Analyst — unpriced',
      skills: ['Excel'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1,
      months: 6, raisedById: who.pm, ownerId: who.pm,
    },
  })
  it_.unpricedSeat = unpricedSeat.id
  it_.unpricedSubmission = (await prisma.submission.create({
    data: {
      requirementId: unpricedSeat.id, personId: who.unpriced,
      fromCompanyId: co.veritan, toCompanyId: co.northbend,
      kind: 'INTERNAL', rate: 0, contractType: 'W2', status: 'SUBMITTED',
    },
  })).id
}, 240_000)

// ═══════════════════════════════════════════════════════════════════
// One document, created once
// ═══════════════════════════════════════════════════════════════════

describe('A client awards, and the order it will quote exists the same second', () => {

  it('awarding a submission raises the purchase order the client will read, with the contract as its first line', async () => {
    as(NORTHBEND)
    const r = await award(it_.firstSubmission, {
      rate: 11_000, startDate: '2026-10-05', endDate: '2027-10-04',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.firstContract = r.body.data.contractId
    it_.order = r.body.data.order.id

    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    expect(order.issuedById).toBe(co.northbend)   // the client buys
    expect(order.issuedToId).toBe(co.veritan)     // the supplier sells
    expect(order.status).toBe('OPEN')

    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.firstContract } })
    expect(line.workOrderId).toBe(it_.order)
    expect(line.personId).toBe(who.rosa)
  })

  it('the client reads it as a purchase order and the supplier reads the same row as its sales order', async () => {
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    expect(nounFor(order, co.northbend).noun).toBe('purchase order')
    expect(nounFor(order, co.veritan).noun).toBe('sales order')
    // Both numbers on one document, because an invoice quoting the wrong
    // one is a fortnight of accounts-payable email.
    expect(order.number).toMatch(/^PO-\d{4}-/)
    expect(order.sellerNumber).toMatch(/^SO-\d{4}-/)
  })

  it('the order’s ceiling is what the requisition was approved at, never a third number', async () => {
    const seat = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.seat } })
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    // $260,000 was stated on the requisition and $260,000 is authorized.
    expect(seat.budgetCents).toBe(26_000_000)
    expect(Number(order.amount)).toBe(260_000)
  })

  it('says where the ceiling came from, in a sentence anybody can audit', async () => {
    const logged = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: co.northbend, action: 'PURCHASE_ORDER_RAISED' },
    })
    expect(logged.summary).toContain('$260,000')
    expect(logged.summary).toContain('Veritan Talent')
    expect(logged.reason).toContain('budget stated on the requisition')
    expect((logged.payload as any).basis).toBe('BUDGET')
  })

  it('a line never disagrees with its header on the day it is written', async () => {
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.firstContract } })

    expect(line.billFrequency).toBe(order.billFrequency)
    expect(line.billAnchor).toBe(order.billAnchor)
    expect(line.billStraddle).toBe(order.billStraddle)
    expect(line.paymentTerms).toBe(order.paymentTerms)
    // The dates are not copies: a header covers several lines and
    // outlives each of them, so the line sits inside the window.
    expect(line.startDate.getTime()).toBeGreaterThanOrEqual(order.startDate.getTime())
    expect(line.endDate!.getTime()).toBeLessThanOrEqual(order.endDate!.getTime())
  })

  it('runs a month past the last day of the work, so the final invoice has an order to quote', async () => {
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.firstContract } })
    expect(order.endDate!.getTime() - line.endDate!.getTime()).toBe(30 * 86_400_000)
  })

  it('carries where the work happens and who recorded it', async () => {
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    const site = await prisma.companyLocation.findFirstOrThrow({ where: { companyId: co.northbend } })
    expect(order.shipToId).toBe(site.id)
    expect(order.recordedById).toBe(co.northbend)
  })

  it('never decides for the client that silence approves a timesheet', async () => {
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    expect(order.autoApproveTimesheets).toBe(false)
    expect(order.approvalWindowDays).toBeNull()
  })

  it('an award with no agreement behind it writes no agreement, and the placement stands on the order alone', async () => {
    // Northbend and Veritan have never papered an agreement. The award
    // used to invent one — a DRAFT row nobody proposed, which reads on
    // the agreements page as something somebody started. The order is
    // what authorizes the spend; the agreement is the umbrella where one
    // exists, and here there is none.
    const agreements = await prisma.masterAgreement.count({
      where: { vendorId: co.veritan, clientId: co.northbend },
    })
    expect(agreements).toBe(0)

    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.firstContract } })
    expect(line.msaId).toBeNull()
    expect(line.workOrderId).toBe(it_.order)

    // The engagement it bills under still exists, with no agreement over it.
    const engagement = await prisma.engagement.findUniqueOrThrow({ where: { id: line.engagementId! } })
    expect(engagement.msaId).toBeNull()
  })

  it('an employee’s line hangs on no order at all', async () => {
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: it_.firstContract } })
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: link.buyContractId } })
    // You do not raise a purchase order to your own employee.
    expect(buy.contractType).toBe('W2')
    expect(buy.vendorCompanyId).toBeNull()
    expect(buy.workOrderId).toBeNull()
  })
})

describe('Five people on one commitment is one document with five lines', () => {

  it('a second person awarded to the same client goes on the same order as a second line', async () => {
    as(NORTHBEND)
    const r = await award(it_.secondSubmission, {
      rate: 10_500, startDate: '2026-10-05', endDate: '2027-10-04',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.secondContract = r.body.data.contractId

    expect(r.body.data.order.id).toBe(it_.order)
    expect(r.body.data.order.raised).toBe(false)

    const lines = await prisma.sellContract.findMany({ where: { workOrderId: it_.order } })
    expect(lines.map((l) => l.id).sort()).toEqual([it_.firstContract, it_.secondContract].sort())
  })

  it('the second award joins the engagement the first one opened, so one deal is not billed as two', async () => {
    // With no agreement over it, an engagement has no other parent —
    // the sell lines underneath are what say which two firms it is
    // between. If that lookup misses, every award opens a folder of its
    // own and the client is invoiced twice for one piece of work.
    const first = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.firstContract } })
    const second = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.secondContract } })
    expect(second.engagementId).toBe(first.engagementId)

    const folders = await prisma.engagement.count({ where: { title: 'Data engineer \u2014 Tualatin' } })
    expect(folders).toBe(1)
  })

  it('does not raise a second order to the same supplier, so the client has one number to quote', async () => {
    const orders = await prisma.workOrder.count({
      where: { issuedById: co.northbend, issuedToId: co.veritan },
    })
    expect(orders).toBe(1)
  })

  it('the ceiling is not quietly raised to fit the second person — that is the client’s own act', async () => {
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    expect(Number(order.amount)).toBe(260_000)
  })

  it('an engagement of the same name between two other firms is never joined, because the lines underneath say whose it is', async () => {
    // A title is not an identity. Two clients can both be hiring a
    // systems analyst in the same town, and before there was an
    // agreement to scope by, a lookup on the title alone would have put
    // Northbend's placement inside somebody else's folder — and its
    // invoices with it.
    const decoyPerson = await prisma.person.create({
      data: { name: 'Ines Vargas', primaryEmail: 'ines@marrow.invalid' },
    })
    const decoy = await prisma.engagement.create({
      data: { msaId: null, title: 'Systems analyst \u2014 Tualatin', invoiceCycle: 'MONTHLY' },
    })
    await prisma.sellContract.create({
      data: {
        companyId: co.marrow, clientCompanyId: co.auralis, personId: decoyPerson.id,
        engagementId: decoy.id, billRate: 8_000, startDate: new Date('2026-09-01'),
      },
    })

    const seat = await prisma.requirement.create({
      data: {
        companyId: co.northbend, title: 'Systems analyst \u2014 Tualatin',
        skills: ['SQL'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1,
        billMax: 9_500, months: 6, budgetCents: 9_000_000,
        raisedById: who.pm, ownerId: who.pm,
      },
    })
    const person = await prisma.person.create({
      data: { name: 'Tobias Werner', primaryEmail: 'tobias@veritan.invalid' },
    })
    const submission = await prisma.submission.create({
      data: {
        requirementId: seat.id, personId: person.id,
        fromCompanyId: co.veritan, toCompanyId: co.northbend,
        kind: 'INTERNAL', rate: 9_500, contractType: 'W2', status: 'SUBMITTED',
      },
    })

    as(NORTHBEND)
    const r = await award(submission.id, {
      rate: 9_500, startDate: '2026-10-05', endDate: '2027-04-04',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: r.body.data.contractId } })
    expect(line.engagementId).not.toBe(decoy.id)

    // And the other firms' folder is untouched: still the one line it had.
    const inDecoy = await prisma.sellContract.count({ where: { engagementId: decoy.id } })
    expect(inDecoy).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// The rung below
// ═══════════════════════════════════════════════════════════════════

describe('A prime buys below the line it sells', () => {

  it('gives the sub-vendor’s placement its own order, from the prime to the sub', async () => {
    as(NORTHBEND)
    const r = await award(it_.primeSubmission, {
      rate: 14_000, startDate: '2026-10-05', endDate: '2027-10-04',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: r.body.data.contractId } })
    const sellOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: sell.workOrderId! } })
    expect(sellOrder.issuedById).toBe(co.northbend)
    expect(sellOrder.issuedToId).toBe(co.auralis)

    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: sell.id } })
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: link.buyContractId } })
    expect(buy.vendorCompanyId).toBe(co.marrow)
    expect(buy.workOrderId).not.toBeNull()

    const buyOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: buy.workOrderId! } })
    expect(buyOrder.issuedById).toBe(co.auralis) // we buy
    expect(buyOrder.issuedToId).toBe(co.marrow)  // they sell
    expect(buyOrder.recordedById).toBe(co.auralis)
  })

  it('what a prime pays its sub is on the prime’s order and never on the client’s', async () => {
    const clientOrder = await prisma.workOrder.findFirstOrThrow({
      where: { issuedById: co.northbend, issuedToId: co.auralis },
    })
    const subOrder = await prisma.workOrder.findFirstOrThrow({
      where: { issuedById: co.auralis, issuedToId: co.marrow },
    })
    // The client's order authorizes what the client pays; ours to the
    // sub authorizes what we pay. Two documents, two ceilings, and the
    // client is a party to only one of them.
    expect(Number(subOrder.amount)).toBeLessThan(Number(clientOrder.amount))
    expect(subOrder.issuedById).not.toBe(co.northbend)
    expect(subOrder.issuedToId).not.toBe(co.northbend)
  })

  it('logs the order to the sub against the prime, never against the client', async () => {
    const logged = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: co.auralis, action: 'PURCHASE_ORDER_RAISED' },
    })
    expect(logged.summary).toContain('Priya Raman')
    const atClient = await prisma.automationLog.count({
      where: { companyId: co.northbend, action: 'PURCHASE_ORDER_RAISED' },
    })
    // Only the two orders the client itself is the buyer on.
    expect(atClient).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════
// The other door to the same pair
// ═══════════════════════════════════════════════════════════════════

describe('The older convert path puts its line on the same document', () => {

  it('a placement recorded rather than awarded lands on the client’s existing order', async () => {
    // Somebody at the supplier records a deal that was done on the
    // phone. It is the same two firms, so it is the same paper.
    const seat = await prisma.requirement.create({
      data: {
        companyId: co.northbend, title: 'Reporting analyst — Tualatin',
        skills: ['SQL'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1,
        billMax: 9_000, months: 12, raisedById: who.pm, ownerId: who.pm,
        budgetCents: 12_000_000,
      },
    })
    const person = await prisma.person.create({
      data: { name: 'Nell Abiodun', primaryEmail: 'nell@veritan.invalid' },
    })
    const placed = await prisma.submission.create({
      data: {
        requirementId: seat.id, personId: person.id,
        fromCompanyId: co.veritan, toCompanyId: co.northbend,
        kind: 'INTERNAL', rate: 9_000, contractType: 'W2', status: 'PLACED',
      },
    })

    as(NORTHBEND)
    const r = await json(
      await convertSubmission(
        req('POST', `/api/submissions/${placed.id}/convert`, {
          billRate: 9_000, startDate: '2026-11-02', endDate: '2027-05-01',
        }),
        { params: Promise.resolve({ id: placed.id }) }
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    // The order Veritan's first award opened, not a second one.
    expect(r.body.data.order.id).toBe(it_.order)
    expect(r.body.data.order.raised).toBe(false)

    const line = await prisma.sellContract.findUniqueOrThrow({
      where: { id: r.body.data.sellContract.id },
    })
    expect(line.workOrderId).toBe(it_.order)

    const orders = await prisma.workOrder.count({
      where: { issuedById: co.northbend, issuedToId: co.veritan },
    })
    expect(orders).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// The honest blank
// ═══════════════════════════════════════════════════════════════════

describe('A ceiling nobody can stand behind is not invented', () => {

  it('an award with no budget, no rate ceiling and no rate raises no order, and says so', async () => {
    as(NORTHBEND)
    const r = await award(it_.unpricedSubmission, {
      startDate: '2026-10-05', endDate: '2027-04-04',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.order.id).toBeNull()
    expect(r.body.data.order.says).toContain('No ceiling could be stated')

    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: r.body.data.contractId } })
    expect(line.workOrderId).toBeNull()
  })

  it('places the person anyway, because a missing ceiling is a gap and not a refusal', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { requirementId: it_.unpricedSeat, personId: who.unpriced },
    })
    expect(line.state).toBe('DRAFT')
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.unpricedSubmission } })).status).toBe('PLACED')
  })
})
