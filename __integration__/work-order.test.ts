import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { GET as listClients, POST as listClient } from '@/app/api/clients/route'
import { GET as listOrders, POST as raiseOrder } from '@/app/api/purchase-orders/route'
import { POST as writeContract } from '@/app/api/contracts/route'
import { GET as autoApprove } from '@/app/api/cron/auto-approve/route'

/**
 * The vendor who arrived first, and the one order underneath two names.
 *
 * ── What this walk proves ────────────────────────────────────────────
 *
 * Two things the founder authorized together on 2026-09-17, because they
 * meet in one place.
 *
 * **One order, three names.** *"Work order is not separate from PO — the
 * client gives it to the supplier and it agrees rate, duration, resource
 * and location of work"*, then *"the PO on the client side is the sales
 * order on the vendor side."* The product modeled that as two rows and
 * only ever wrote the thin one, so the four parties, the billing basis,
 * the milestones and the term saying silence approves a timesheet had
 * nowhere to live. `cron/auto-approve` read that last one off a
 * `SalesOrder` nothing had ever created, which means the nightly job has
 * approved nothing, ever, since the day it was written. It fires here.
 *
 * **A door for the vendor.** Only a client could create a shell. A
 * staffing firm signing up with an existing book could record none of
 * it, because every client it holds a contract with is a company that
 * has never heard of us.
 *
 * ── Who is in it ─────────────────────────────────────────────────────
 *
 *   Veritan Talent      a staffing firm. Signs up on a Tuesday with two
 *                       people already placed and a paper PO in a drawer.
 *   Halvard Industries  its client. Not on Etyme, and never will be for
 *                       the purposes of this walk.
 *   Northbend Athletic  a client that *is* here, with its own desks.
 *   Auralis Software    a firm with no part in any of it.
 */

const VERITAN = 'owner@veritan.test'
const NORTHBEND = 'program@northbend.test'
const AURALIS = 'owner@auralis.test'

const co = { veritan: '', northbend: '', auralis: '', halvard: '' }
const who = { veritanOwner: '', northbendPm: '', rosa: '', dev: '' }
const it_ = { order: '', contract: '', secondContract: '', quietSheet: '', answeredSheet: '' }

let secretBefore: string | undefined

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', claimedAt: new Date('2026-01-04') },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name: `${name} owner`, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'work order walk' },
  })
  return { companyId: c.id, personId: p.id }
}

const day = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

beforeAll(async () => {
  await resetDatabase()
  secretBefore = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'work-order-test'

  const veritan = await company('Veritan Talent', 'veritan-talent', 'VENDOR', VERITAN)
  co.veritan = veritan.companyId
  who.veritanOwner = veritan.personId

  const northbend = await company('Northbend Athletic', 'northbend-athletic', 'CLIENT', NORTHBEND)
  co.northbend = northbend.companyId
  who.northbendPm = northbend.personId

  const auralis = await company('Auralis Software', 'auralis-software', 'VENDOR', AURALIS)
  co.auralis = auralis.companyId

  const rosa = await prisma.person.create({
    data: { name: 'Rosa Amadi', primaryEmail: 'rosa@veritan.test' },
  })
  who.rosa = rosa.id
  const dev = await prisma.person.create({
    data: { name: 'Dev Shah', primaryEmail: 'dev@veritan.test' },
  })
  who.dev = dev.id
})

afterAll(() => {
  if (secretBefore === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secretBefore
})

describe('a staffing firm arrives before its clients do', () => {
  it('a staffing firm can record work for a client that has never heard of us', async () => {
    as(VERITAN)
    const r = await json(
      await listClient(req('POST', '/api/clients', { name: 'Halvard Industries' }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    co.halvard = r.body.data.client.id

    const row = await prisma.company.findUniqueOrThrow({ where: { id: co.halvard } })
    // A shell: on the register, not on the system. It cannot sign in, the
    // network cannot see it, and nobody may mistake it for a firm that
    // chose to be here.
    expect(row.claimedAt).toBeNull()
    expect(row.listedById).toBe(co.veritan)
    expect(row.domain).toBeNull()

    // The paper stub, so a contract recorded tomorrow has an agreement to
    // hang on rather than being refused for having no relationship.
    const msa = await prisma.masterAgreement.findFirst({
      where: { vendorId: co.veritan, clientId: co.halvard },
    })
    expect(msa).not.toBeNull()
    expect(msa!.signedAt).toBeNull()

    expect(r.body.data.message).toContain('is on your register')
  })

  it('the register says which of a firm’s clients are actually here', async () => {
    as(VERITAN)
    const r = await json(await listClients(req('GET', '/api/clients')))
    const halvard = r.body.data.clients.find((c: any) => c.name === 'Halvard Industries')
    expect(halvard.onEtyme).toBe(false)
    expect(halvard.yours).toBe(true)
    expect(halvard.says).toContain('is not on Etyme')
    expect(r.body.data.offSystem).toBe(1)
  })

  it('a firm cannot put a second copy of a company that is already here on its register', async () => {
    await prisma.company.update({
      where: { id: co.northbend },
      data: { domain: 'northbend.example', domainVerified: true },
    })
    as(VERITAN)
    const r = await json(
      await listClient(
        req('POST', '/api/clients', { name: 'Northbend Athletic', domain: 'northbend.example' })
      )
    )
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('already on Etyme')
    expect(r.body.error.message).toContain('Ask them to add you instead')
  })

  it('a firm can record the placements it is already running against a client that is not here', async () => {
    as(VERITAN)
    const r = await json(
      await writeContract(
        req('POST', '/api/contracts', {
          personId: who.rosa,
          companyId: co.veritan,
          clientCompanyId: co.halvard,
          billRate: 11_000,
          startDate: day(-120).toISOString(),
          endDate: day(120).toISOString(),
        })
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.sellContract.id

    const second = await json(
      await writeContract(
        req('POST', '/api/contracts', {
          personId: who.dev,
          companyId: co.veritan,
          clientCompanyId: co.halvard,
          billRate: 9_500,
          startDate: day(-120).toISOString(),
          endDate: day(120).toISOString(),
        })
      )
    )
    expect(second.body?.error, JSON.stringify(second.body)).toBeUndefined()
    it_.secondContract = second.body.data.sellContract.id

    await prisma.sellContract.updateMany({
      where: { id: { in: [it_.contract, it_.secondContract] } },
      data: { state: 'IN_PROGRESS' },
    })
  })

  it('a firm cannot name a company that is already here as its client without them', async () => {
    as(VERITAN)
    const r = await json(
      await writeContract(
        req('POST', '/api/contracts', {
          personId: who.rosa,
          companyId: co.veritan,
          clientCompanyId: co.northbend,
          billRate: 11_000,
          startDate: day(-10).toISOString(),
        })
      )
    )
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('has nothing on file with you')
    expect(r.body.error.message).toContain('ask them to add you')
  })

  it('a contract naming a company id that does not exist is refused in a sentence, not a foreign key', async () => {
    as(VERITAN)
    const r = await json(
      await writeContract(
        req('POST', '/api/contracts', {
          personId: who.rosa,
          companyId: co.veritan,
          clientCompanyId: 'co-does-not-exist',
          billRate: 11_000,
          startDate: day(-10).toISOString(),
        })
      )
    )
    expect(r.status).toBe(404)
    expect(r.body.error.message).toContain('POST /api/clients')
  })
})

describe('the purchase order the client handed them', () => {
  it('a supplier can record the purchase order its client handed it', async () => {
    as(VERITAN)
    const r = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          number: 'HAL-PO-7781',
          sellerNumber: 'VT-SO-2026-04',
          issuedById: co.halvard,
          issuedToId: co.veritan,
          amount: 400_000,
          startDate: day(-130).toISOString(),
          endDate: day(200).toISOString(),
          // The term on Halvard's own paper: five working days to answer
          // a timesheet, then it stands.
          autoApproveTimesheets: true,
          approvalWindowDays: 5,
        })
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    it_.order = r.body.data.order.id

    const row = await prisma.workOrder.findUniqueOrThrow({ where: { id: it_.order } })
    expect(row.issuedById).toBe(co.halvard)
    expect(row.issuedToId).toBe(co.veritan)
    // The row says who typed it in, so nobody reads it as a shell company
    // signing in and raising its own paper.
    expect(row.recordedById).toBe(co.veritan)
    expect(row.autoApproveTimesheets).toBe(true)
    expect(row.approvalWindowDays).toBe(5)

    expect(r.body.data.recordedForThem).toBe(true)
    expect(r.body.data.message).toContain('recording the purchase order they handed you')
  })

  it('one order still produces a contract for each person on it', async () => {
    // Two people, two contracts, one order — which is why a contract is
    // per person and an order is not.
    const contracts = await prisma.sellContract.findMany({
      where: { workOrderId: it_.order },
      select: { id: true, personId: true },
    })
    expect(contracts).toHaveLength(2)
    expect(contracts.map((c) => c.personId).sort()).toEqual([who.rosa, who.dev].sort())
  })

  it('a supplier cannot raise an order in the name of a client that is here and could have raised it', async () => {
    as(VERITAN)
    const r = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          number: 'NB-PO-0001',
          issuedById: co.northbend,
          issuedToId: co.veritan,
          amount: 100_000,
          startDate: day(-10).toISOString(),
        })
      )
    )
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('theirs to raise')
    expect(r.body.error.message).toContain('Ask their program office or AP desk')
  })

  it('a firm that is neither end of the deal cannot write the order at all', async () => {
    as(AURALIS)
    const r = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          number: 'AU-PO-0001',
          issuedById: co.halvard,
          issuedToId: co.veritan,
          amount: 100_000,
          startDate: day(-10).toISOString(),
        })
      )
    )
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('written by one of the two firms on it')
  })

  it('a client reads it as a purchase order and a supplier reads the same row as a sales order', async () => {
    // Northbend raises its own, the ordinary way round.
    as(NORTHBEND)
    const raised = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          number: 'NB-PO-40118',
          issuedToId: co.veritan,
          amount: 250_000,
          startDate: day(-30).toISOString(),
        })
      )
    )
    expect(raised.body?.error, JSON.stringify(raised.body)).toBeUndefined()
    const orderId = raised.body.data.order.id

    as(NORTHBEND)
    const theirs = await json(await listOrders(req('GET', '/api/purchase-orders')))
    const asBuyer = theirs.body.data.orders.find((o: any) => o.id === orderId)
    expect(asBuyer.noun).toBe('purchase order')
    expect(asBuyer.side).toBe('BUYER')
    expect(asBuyer.counterparty.name).toBe('Veritan Talent')

    as(VERITAN)
    const ours = await json(await listOrders(req('GET', '/api/purchase-orders')))
    const asSeller = ours.body.data.orders.find((o: any) => o.id === orderId)
    expect(asSeller.noun).toBe('sales order')
    expect(asSeller.side).toBe('SELLER')
    expect(asSeller.counterparty.name).toBe('Northbend Athletic')

    // One row underneath. Not two that have to be kept in step.
    expect(asBuyer.id).toBe(asSeller.id)
    expect(await prisma.workOrder.count({ where: { id: orderId } })).toBe(1)
  })

  it('a supplier is told out loud when the other end of an order is not on the system', async () => {
    as(VERITAN)
    const r = await json(await listOrders(req('GET', '/api/purchase-orders')))
    const halvardOrder = r.body.data.orders.find((o: any) => o.id === it_.order)
    expect(halvardOrder.offSystem).toContain('Halvard Industries is not on Etyme')
    expect(halvardOrder.recordedByCounterparty).toBe(true)
    // Their number, and ours, both kept.
    expect(halvardOrder.reference).toBe('VT-SO-2026-04')
    expect(halvardOrder.number).toBe('HAL-PO-7781')
  })
})

describe('the term that had nowhere to live', () => {
  beforeAll(async () => {
    // Rosa filed a week twelve days ago and nobody at Halvard answered.
    const quiet = await prisma.timesheet.create({
      data: {
        sellContractId: it_.contract,
        personId: who.rosa,
        periodStart: day(-19),
        periodEnd: day(-13),
        days: {},
        totalHours: 40,
        status: 'SUBMITTED',
        submittedAt: day(-12),
      },
    })
    it_.quietSheet = quiet.id

    // Dev's week sits on a contract whose order says nothing about
    // silence, so nobody's silence means anything.
    const other = await prisma.timesheet.create({
      data: {
        sellContractId: it_.secondContract,
        personId: who.dev,
        periodStart: day(-19),
        periodEnd: day(-13),
        days: {},
        totalHours: 40,
        status: 'SUBMITTED',
        submittedAt: day(-12),
      },
    })
    it_.answeredSheet = other.id

    // Take Dev's contract off the auto-approving order, so the two sheets
    // differ in exactly one thing.
    await prisma.sellContract.update({
      where: { id: it_.secondContract },
      data: { workOrderId: null },
    })
  })

  it('a timesheet nobody answered is approved when the order says silence counts, and is not when it does not', async () => {
    const r = await json(
      await autoApprove(
        req('GET', '/api/cron/auto-approve', undefined, { authorization: 'Bearer work-order-test' })
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const approved = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.quietSheet } })
    expect(approved.clientApprovedAt).not.toBeNull()
    expect(approved.autoApproved).toBe(true)
    // Names nobody, on purpose. An auto-approved sheet carrying a
    // manager's id is a forged signature.
    expect(approved.clientApprovedById).toBeNull()

    const untouched = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.answeredSheet } })
    expect(untouched.clientApprovedAt).toBeNull()
    expect(untouched.status).toBe('SUBMITTED')
  })

  it('the approval is asserted by the client, not by the firm that will bill for it', async () => {
    const assertion = await prisma.workAssertion.findFirstOrThrow({
      where: { timesheetId: it_.quietSheet, role: 'CLIENT_APPROVAL' },
    })
    // Halvard's, even though Halvard is not on Etyme. A client approval
    // asserted by the company raising the invoice is the vendor approving
    // its own bill.
    expect(assertion.companyId).toBe(co.halvard)
    expect(assertion.byId).toBeNull()
    expect(assertion.auto).toBe(true)
  })

  it('the approval nobody made is written down as something the system did, with a reason in plain English', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'TIMESHEET_AUTO_APPROVED', companyId: co.veritan },
    })
    expect(log.summary).toContain('Rosa Amadi')
    expect(log.reason.length).toBeGreaterThan(20)
    // Somebody can withdraw it; the invoice has not gone yet.
    expect(log.reversible).toBe(true)
  })

  it('running the nightly job twice does not approve the same week twice', async () => {
    await autoApprove(
      req('GET', '/api/cron/auto-approve', undefined, { authorization: 'Bearer work-order-test' })
    )
    const assertions = await prisma.workAssertion.count({
      where: { timesheetId: it_.quietSheet, role: 'CLIENT_APPROVAL', state: 'LIVE' },
    })
    expect(assertions).toBe(1)
  })
})
