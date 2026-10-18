import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { POST as recordBill, GET as exceptions, PATCH as payBill } from '@/app/api/ap/bills/route'
import { GET as runPreview, PATCH as runAct } from '@/app/api/ap/payment-runs/route'

/**
 * A supplier's invoice is matched against what the firm paying it
 * accepted, on the seeded chain.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by Techpeple. Her week is filed once, on Techpeple's contract.
 * When Techpeple invoices Computer Systems, the receipt is Computer
 * Systems' own PASS_THROUGH acceptance — the founder's rule that no rung
 * pays on a week it has not accepted. Before this, the match read only
 * EMPLOYER_ACCEPTANCE, and only on a contract linked to Computer Systems'
 * buy contract, which carries no hours: the invoice matched nothing
 * whoever had signed, and the one signature it looked for was
 * Techpeple's own.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const TECHPEPLE = `world-techpeple${D}`

const sign = async (id: string, body: unknown = {}) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, body), { params: Promise.resolve({ id }) }))

const s: Record<string, any> = {}

const invoice = async (number: string, hours: number, extra: Record<string, unknown> = {}) =>
  json(
    await recordBill(
      req('POST', '/api/ap/bills', {
        vendorCompanyId: s.techpeple,
        number,
        buyContractId: s.buy,
        periodStart: s.from,
        periodEnd: s.to,
        hours,
        rateCents: s.rate,
        total: (hours * s.rate) / 100,
        currency: 'USD',
        dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        ...extra,
      })
    )
  )

const pay = async (id: string, extra: Record<string, unknown> = {}) =>
  json(await payBill(req('PATCH', '/api/ap/bills', { id, ...extra })))

const idOf = async (number: string) =>
  (await prisma.vendorBill.findFirstOrThrow({ where: { companyId: s.cs, vendorCompanyId: s.techpeple, number } })).id

// Stands in for a cancel door the invoice receipt does not have yet
// (KNOWN-LIMITS.md, money): the clerk's correction of a mis-keyed receipt.
const cancel = (number: string) =>
  prisma.vendorBill.updateMany({ where: { companyId: s.cs, vendorCompanyId: s.techpeple, number }, data: { status: 'CANCELLED' } })

describe('a supplier’s invoice is matched against the paying firm’s own acceptance, down the seeded chain', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    const cs = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
    const techpeple = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' } })
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: cs.id, vendorCompanyId: techpeple.id, candidates: { some: { personId: helena.id } } },
      include: { candidates: true },
    })
    Object.assign(s, {
      week: week.id,
      hours: Number(week.totalHours),
      techpeple: techpeple.id,
      cs: cs.id,
      buy: buy.id,
      order: buy.workOrderId,
      rate: buy.candidates[0].payRate,
      from: week.periodStart.toISOString(),
      to: week.periodEnd.toISOString(),
    })
    // The invoice covers this one week and no other of Helena's.
    expect(
      await prisma.timesheet.count({
        where: { personId: helena.id, periodStart: { lte: week.periodEnd }, periodEnd: { gte: week.periodStart } },
      })
    ).toBe(1)
    expect(s.hours).toBe(40)
  }, 240_000)

  it('an invoice from Techpeple to Computer Systems cannot be recorded while nobody has signed the week, and the refusal names the week and who must accept it', async () => {
    as(CS)
    const r = await invoice('CE-HM-0', 40)
    expect(r.status).toBe(422)
    // Rule 3 of 2026-09-28: a week the payer has not accepted blocks the
    // invoice, in a sentence, before the match is even asked.
    expect(r.body.error.code).toBe('WEEK_NOT_ACCEPTED')
    expect(r.body.error.message).toMatch(/^Computer Systems[^.]* has not accepted Helena Marsh\u2019s week of [A-Z][a-z]+ \d+\. Accept it first, then record this invoice\.$/)
  })

  it('Northbend’s signature is not Computer Systems’ acceptance: the invoice still cannot be matched once the client has signed', async () => {
    as(NIKE)
    const signed = await sign(s.week)
    expect(signed.body?.error, JSON.stringify(signed.body)).toBeUndefined()

    as(CS)
    const r = await invoice('CE-HM-1', 40)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('WEEK_NOT_ACCEPTED')
    expect(await prisma.vendorBill.count({ where: { companyId: s.cs, vendorCompanyId: s.techpeple, number: { startsWith: 'CE-HM' } } })).toBe(0)
  })

  it('Computer Systems accepts thirty-eight of Helena’s forty hours, with its reason, as its own pass-through acceptance', async () => {
    as(CS)
    const r = await sign(s.week, { acceptedHours: 38, note: 'Two hours were a Friday training session Northbend does not pay us for.' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const mine = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, companyId: s.cs, state: 'LIVE' } })
    expect(mine.role).toBe('PASS_THROUGH')
    expect(Number(mine.hours)).toBe(38)
  })

  it('Techpeple’s invoice for the thirty-eight hours Computer Systems accepted matches, before Techpeple has accepted anything itself', async () => {
    const techpepleSigned = await prisma.workAssertion.count({ where: { timesheetId: s.week, companyId: s.techpeple } })
    expect(techpepleSigned).toBe(0)

    as(CS)
    const r = await invoice('CE-HM-2', 38)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('RECEIVED')
    expect(r.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
    expect(r.body.data.match.checks.find((c: any) => c.code === 'RECEIPT').reason).toMatch(/^38h accepted for pay across 1 record/)
  })

  it('the same week cannot be received twice under two invoice numbers: an invoice for all forty hours is refused, naming the receipt that already holds the week', async () => {
    as(CS)
    const r = await invoice('CE-HM-3', 40)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_RECEIVED')
    expect(r.body.error.message).toMatch(/^Helena Marsh\u2019s week of [A-Z][a-z]+ \d+ is already on Techpeple\u2019s invoice CE-HM-2, received [A-Z][a-z]+ \d+, \d{4}, so this invoice would owe it twice\./)
    expect(await prisma.vendorBill.count({ where: { companyId: s.cs, number: 'CE-HM-3' } })).toBe(0)
  })

  it('once that receipt is cancelled, an invoice for all forty hours is held as disputed, because Computer Systems accepted thirty-eight', async () => {
    await cancel('CE-HM-2')
    as(CS)
    const r = await invoice('CE-HM-3', 40)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('DISPUTED')
    expect(r.body.data.match.checks.find((c: any) => c.code === 'QUANTITY').reason).toMatch(/^Invoiced 40h, we accepted 38h\./)
  })

  it('once Techpeple has accepted too, the exception queue re-matches Techpeple’s invoices on Computer Systems’ own acceptance and finds a receipt behind each', async () => {
    as(TECHPEPLE)
    const r = await sign(s.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, companyId: s.techpeple, state: 'LIVE' } })).role).toBe('EMPLOYER_ACCEPTANCE')

    as(CS)
    const q = await json(await exceptions(req('GET', '/api/ap/bills')))
    expect(q.status, JSON.stringify(q.body)).toBe(200)
    const unreceipted = q.body.data.exceptions
      .filter((e: any) => String(e.reference).startsWith('CE-HM'))
      .filter((e: any) => e.checks.some((c: any) => c.code === 'RECEIPT' && c.outcome === 'FAIL'))
    expect(unreceipted).toEqual([])
  })
})

describe('a typed-in invoice receipt is paid on the same check as a platform invoice (release walk, 2026-10-18)', () => {
  it('a typed-in receipt marked disputed is not paid while its difference stands, and the refusal says why', async () => {
    as(CS)
    const id = await idOf('CE-HM-3')
    const r = await pay(id)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('MATCH_FAILED')
    expect(r.body.error.message).toMatch(/^Techpeple\u2019s invoice CE-HM-3 for \$[\d,.]+ does not pass the check now: /)
    const after = await prisma.vendorBill.findUniqueOrThrow({ where: { id } })
    expect(after.status).toBe('DISPUTED')
    expect(after.paidCents).toBe(0)
    expect(after.paidAt).toBeNull()
  })

  it('a typed-in receipt giving only a total that is not the accepted hours at the agreed rate is refused, and asks for the hours and the rate', async () => {
    await cancel('CE-HM-3')
    as(CS)
    const r = await invoice('CE-HM-4', 40, { hours: undefined, rateCents: undefined })
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('MATCH_FAILED')
    expect(r.body.error.message).toMatch(/Enter the hours and the rate from the invoice/)
  })

  it('a typed-in receipt past the order’s ceiling fails the order check like a platform invoice, though the clerk named no order', async () => {
    expect(s.order, 'Helena’s buy line is on an order').toBeTruthy()
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: s.order } })
    s.orderAmount = order.amount
    await prisma.workOrder.update({ where: { id: s.order }, data: { amount: 1000 } })
    as(CS)
    const r = await invoice('CE-HM-4', 38, { hours: undefined, rateCents: undefined })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('DISPUTED')
    const po = r.body.data.match.checks.find((c: any) => c.code === 'PO_BALANCE')
    expect(po.outcome).toBe('FAIL')
    expect(po.overridable).toBe(true)
    // The line's own order is written on the receipt, so the next one counts it.
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: await idOf('CE-HM-4') } })).workOrderId).toBe(s.order)

    const paid = await pay(await idOf('CE-HM-4'))
    expect(paid.status).toBe(409)
    expect(paid.body.error.message).toMatch(/has nowhere yet to keep a reason for paying a difference/)
  })

  it('a payment larger than what is still owed on a typed-in receipt is refused', async () => {
    await prisma.workOrder.update({ where: { id: s.order }, data: { amount: s.orderAmount } })
    as(CS)
    const r = await pay(await idOf('CE-HM-4'), { amount: (38 * s.rate) / 100 + 1 })
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('OVERPAYMENT')
  })

  it('paying a typed-in receipt records who paid whom, how much and who pressed it, once the order has room again, and closes no date a second time', async () => {
    const id = await idOf('CE-HM-4')
    const closedBefore = await prisma.cycle.count({ where: { buyContractId: s.buy, completedAt: { not: null } } })
    as(CS)
    const r = await pay(id, { method: 'ACH', reference: 'CS-7781' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('PAID')
    expect(r.body.data.payment).toMatchObject({
      amountMinor: 38 * s.rate, currency: 'USD', method: 'ACH', reference: 'CS-7781',
      paidBy: 'Computer Systems Inc', paidTo: 'Techpeple',
    })
    expect(r.body.data.payment.recordedBy).toBeTruthy()
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'PAYMENT_RECORDED', payload: { path: ['vendorBillId'], equals: id } },
    })
    expect(log.companyId).toBe(s.cs)
    expect((log.payload as any).paidTo.companyId).toBe(s.techpeple)
    expect((log.payload as any).paidCents).toBe(38 * s.rate)
    expect(await prisma.cycle.count({ where: { buyContractId: s.buy, completedAt: { not: null } } })).toBe(closedBefore)
  })

  it('a paid week cannot be received again under another invoice number', async () => {
    as(CS)
    const r = await invoice('CE-HM-5', 38)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.message).toMatch(/already on Techpeple\u2019s invoice CE-HM-4/)
  })

  it('a second receipt for the same week let in before this rule is refused at payment, naming the receipt already paid', async () => {
    const twin = await prisma.vendorBill.create({
      data: {
        companyId: s.cs, vendorCompanyId: s.techpeple, number: 'CE-HM-6', buyContractId: s.buy, workOrderId: s.order,
        periodStart: new Date(s.from), periodEnd: new Date(s.to), currency: 'USD', totalCents: 38 * s.rate,
        receivedAt: new Date(Date.now() - 86_400_000), dueAt: new Date(Date.now() - 3_600_000), status: 'APPROVED',
      },
    })
    s.twin = twin.id
    as(CS)
    const r = await pay(twin.id)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.message).toMatch(/already on Techpeple\u2019s invoice CE-HM-4/)
  })

  it('a payment run leaves out a receipt the check refuses, with the reason', async () => {
    as(CS)
    const r = await json(await runPreview(req('GET', '/api/ap/payment-runs?currency=USD')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const left = r.body.data.proposed.excluded.find((e: any) => e.billId === s.twin)
    expect(left?.reason).toBe('MATCH_FAILED')
    expect(left?.says).toMatch(/already on Techpeple\u2019s invoice CE-HM-4/)
  })

  it('a receipt in an approved payment run that no longer passes the check stops the run being released', async () => {
    const people = await prisma.context.findMany({ where: { companyId: s.cs, revokedAt: null }, select: { personId: true }, take: 2 })
    const run = await prisma.paymentRun.create({
      data: {
        companyId: s.cs, currency: 'USD', status: 'APPROVED', scheduledFor: new Date(), totalCents: 38 * s.rate,
        createdById: people[0]?.personId ?? null, approvedById: people[1]?.personId ?? null,
        items: { create: [{ vendorBillId: s.twin, amountCents: 38 * s.rate }] },
      },
    })
    as(CS)
    const r = await json(await runAct(req('PATCH', '/api/ap/payment-runs', { id: run.id, action: 'pay' })))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('MATCH_FAILED')
    expect(r.body.error.message).toMatch(/^This run is not released: one invoice receipt in it no longer passes the three-way check\./)
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.twin } })).paidCents).toBe(0)
  })
})
