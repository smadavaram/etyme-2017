import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { POST as recordBill, GET as exceptions, PATCH as payBill } from '@/app/api/ap/bills/route'
import { GET as runPreview, PATCH as runAct } from '@/app/api/ap/payment-runs/route'
import { POST as cancelReceipt } from '@/app/api/ap/bills/[id]/cancel/route'
import { POST as waive, DELETE as unwaive } from '@/app/api/ap/bills/[id]/match/override/route'
import { GET as unappliedCash } from '@/app/api/ar/payments/route'
import { POST as generate } from '@/app/api/invoices/generate/route'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { GET as receiptsList } from '@/app/api/ap/receipts/route'
import { GET as receiptOptions } from '@/app/api/ap/receipts/options/route'
import { POST as acceptExpense } from '@/app/api/expenses/[id]/accept/route'
import { readForAcceptance } from '@/lib/money/expense-acceptance-read'
import { acceptanceChain } from '@/lib/money/expense-acceptance'

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

const params = (id: string) => ({ params: Promise.resolve({ id }) })

// The clerk's correction of a mis-keyed receipt, through the paying
// team's own door.
const cancel = async (number: string, reason = 'Keyed in again with the supplier’s corrected figures.') => {
  as(CS)
  const id = await idOf(number)
  return json(await cancelReceipt(req('POST', `/api/ap/bills/${id}/cancel`, { reason }), params(id)))
}

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

  it('once that receipt is cancelled with a reason, an invoice for all forty hours is held as disputed, because Computer Systems accepted thirty-eight', async () => {
    const c = await cancel('CE-HM-2')
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    const closed = () => prisma.cycle.count({ where: { buyContractId: s.buy, kind: 'VENDOR_BILL_GENERATE', completedAt: { not: null } } })
    const before = await closed()
    as(CS)
    const r = await invoice('CE-HM-3', 40)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('DISPUTED')
    expect(r.body.data.match.checks.find((c: any) => c.code === 'QUANTITY').reason).toMatch(/^Invoiced 40h, we accepted 38h\./)
    // The week's date closed when CE-HM-2 was recorded; the receipt keyed
    // again in its place closes no second date — the next period's.
    expect(await closed()).toBe(before)
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
    expect((await cancel('CE-HM-3')).status).toBe(200)
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
    // Waivable, and so said: an exception with a reason, or a corrected invoice.
    expect(paid.body.error.message).toMatch(/Record an exception with a reason on it if the difference should be paid, or ask Techpeple for a corrected invoice\.$/)
  })

  it('a payment larger than what is still owed on a typed-in receipt is refused', async () => {
    await prisma.workOrder.update({ where: { id: s.order }, data: { amount: s.orderAmount } })
    as(CS)
    const r = await pay(await idOf('CE-HM-4'), { amount: (38 * s.rate) / 100 + 1 })
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('OVERPAYMENT')
  })

  it('paying a typed-in receipt writes a payment saying who paid whom, how much and who pressed it, once the order has room again, and closes no date a second time', async () => {
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
    // And a payment row on the record, naming the receipt it settles.
    const payment = await prisma.payment.findFirstOrThrow({ where: { vendorBillId: id } })
    expect(payment).toMatchObject({
      invoiceId: null, payerCompanyId: s.cs, receivedByCompanyId: s.techpeple,
      currency: 'USD', method: 'ACH', reference: 'CS-7781',
    })
    expect(Math.round(Number(payment.amount) * 100)).toBe(38 * s.rate)
    expect(payment.appliedById).toBeTruthy()
    expect((log.payload as any).paymentId).toBe(payment.id)
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

/**
 * A typed-in receipt has lines, exceptions and a cancel door (2026-10-18).
 *
 * Helena's next week, October 11, is signed by all three firms, Computer
 * Systems accepting the whole forty. Techpeple's invoices for it are typed
 * in line by line: the week, an expense Helena incurred on the job, and a
 * milestone on Computer Systems' order to Techpeple.
 */
describe('a typed-in receipt is matched line by line, its differences waived with a reason, and a mis-keyed one cancelled', () => {
  const t: Record<string, any> = {}
  const day = (d: Date) => d.toISOString().slice(0, 10)

  const receive = async (number: string, lines: unknown[], totalCents: number, extra: Record<string, unknown> = {}) => {
    as(CS)
    return json(
      await recordBill(
        req('POST', '/api/ap/bills', {
          vendorCompanyId: s.techpeple,
          number,
          buyContractId: s.buy,
          periodStart: t.from,
          periodEnd: t.to,
          total: totalCents / 100,
          currency: 'USD',
          dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          lines,
          ...extra,
        })
      )
    )
  }
  const week = (hours: number, rateCents = s.rate) => ({ timesheetId: t.week, hours, rateCents, amountCents: Math.round(hours * rateCents) })
  const waiveAs = async (who: string, number: string, code: string, reason = 'Two hours of handover the client asked for in writing.') => {
    as(who)
    const id = await idOf(number)
    return json(await waive(req('POST', `/api/ap/bills/${id}/match/override`, { code, reason }), params(id)))
  }

  beforeAll(async () => {
    const last = await prisma.timesheet.findUniqueOrThrow({ where: { id: s.week } })
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
    const days: Record<string, number> = {}
    for (let i = 1; i <= 5; i++) days[day(plus(last.periodStart, 7 + i))] = 8
    const sheet = await prisma.timesheet.create({
      data: {
        sellContractId: last.sellContractId, personId: helena.id,
        periodStart: plus(last.periodStart, 7), periodEnd: plus(last.periodEnd, 7),
        days, totalHours: 40, status: 'SUBMITTED', submittedAt: new Date(),
      },
    })
    Object.assign(t, { week: sheet.id, from: sheet.periodStart.toISOString(), to: sheet.periodEnd.toISOString(), helena: helena.id })
    for (const who of [NIKE, CS, TECHPEPLE]) {
      as(who)
      const r = await sign(sheet.id)
      expect(r.body?.error, `${who}: ${JSON.stringify(r.body)}`).toBeUndefined()
    }
    expect(Number((await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: sheet.id, companyId: s.cs, state: 'LIVE' } })).hours)).toBe(40)

    // An expense Helena incurred that week, on the contract her hours are
    // filed on, and one the firm carried as its own cost.
    const expense = (billable: boolean, status: string) =>
      prisma.expense.create({
        data: {
          companyId: s.techpeple, sellContractId: last.sellContractId, personId: helena.id, category: 'TRAVEL',
          billable, description: 'Train to the Tualatin site for the cut-over', periodStart: plus(last.periodStart, 9),
          periodEnd: plus(last.periodStart, 9), items: [], total: 250, status,
        },
      })
    t.expense = (await expense(true, 'SUBMITTED')).id
    t.ownCost = (await expense(false, 'APPROVED')).id
    // A milestone on Computer Systems' own order to Techpeple, delivered and not yet accepted.
    t.milestone = (await prisma.orderMilestone.create({
      data: { orderId: s.order, name: 'Data migration sign-off', amountCents: 150_000, status: 'DELIVERED', deliveredAt: new Date() },
    })).id
  }, 240_000)

  it('the form offers the weeks Computer Systems accepted on Techpeple’s buy line, with the hours accepted and the agreed rate beside each, and nothing it has not approved', async () => {
    as(CS)
    const suppliers = await json(await receiptOptions(req('GET', '/api/ap/receipts/options')))
    expect(suppliers.status, JSON.stringify(suppliers.body)).toBe(200)
    const techpeple = suppliers.body.data.suppliers.find((x: any) => x.id === s.techpeple)
    expect(techpeple?.lines.map((l: any) => l.buyContractId)).toContain(s.buy)
    expect(techpeple.lines.find((l: any) => l.buyContractId === s.buy)).toMatchObject({ rateMinor: s.rate, currency: 'USD', people: ['Helena Marsh'] })

    const r = await json(await receiptOptions(req('GET', `/api/ap/receipts/options?buyContractId=${s.buy}`)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.weeks.find((w: any) => w.timesheetId === t.week)).toMatchObject({
      personName: 'Helena Marsh', hoursAccepted: 40, rateMinor: s.rate, heldBy: null, says: null,
    })
    // The week of the first describe, which Computer Systems accepted at thirty-eight.
    expect(r.body.data.weeks.find((w: any) => w.timesheetId === s.week)?.hoursAccepted).toBe(38)
    // An expense still waiting for approval, one the firm carried as its own
    // cost, and a milestone delivered but not accepted are not offered.
    expect(r.body.data.expenses.map((x: any) => x.id)).not.toContain(t.expense)
    expect(r.body.data.expenses.map((x: any) => x.id)).not.toContain(t.ownCost)
    expect(r.body.data.milestones.map((x: any) => x.id)).not.toContain(t.milestone)

    // Only whoever records invoice receipts reads the form, and the supplier
    // never reads the payer's buy line.
    as(TECHPEPLE)
    expect([403, 404]).toContain((await json(await receiptOptions(req('GET', `/api/ap/receipts/options?buyContractId=${s.buy}`)))).status)
  })

  it('checking a typed-in receipt before saving runs the same check as recording it, and writes nothing', async () => {
    const before = await prisma.vendorBill.count({ where: { companyId: s.cs } })
    const held = await receive('CE-HM-P1', [week(42)], 42 * s.rate, { preview: true })
    expect(held.status, JSON.stringify(held.body)).toBe(200)
    expect(held.body.data).toMatchObject({ preview: true, wouldBe: 'DISPUTED' })
    expect(held.body.data.match.checks.find((c: any) => c.code === 'QUANTITY')).toMatchObject({ outcome: 'FAIL', overridable: true, reason: 'Helena Marsh: billed 42h, approved 40h' })
    expect(held.body.data.note).toMatch(/^It would be recorded and held\. /)
    const clean = await receive('CE-HM-P1', [week(40)], 40 * s.rate, { preview: true })
    expect(clean.body.data).toMatchObject({ preview: true, wouldBe: 'RECEIVED' })
    // A refusal is said in the intake's own sentence, before anything is saved.
    const sum = await receive('CE-HM-P1', [week(40)], 41 * s.rate, { preview: true })
    expect(sum.status).toBe(422)
    expect(sum.body.error.checks.find((c: any) => c.code === 'HEADER_TOTAL').outcome).toBe('FAIL')
    expect(await prisma.vendorBill.count({ where: { companyId: s.cs } })).toBe(before)
    expect(await prisma.automationLog.count({ where: { payload: { path: ['number'], equals: 'CE-HM-P1' } } })).toBe(0)
  })

  it('a typed-in receipt with a line for the week Computer Systems accepted is matched against that acceptance, and its line is kept with the person it is for', async () => {
    const r = await receive('CE-HM-K1', [week(40)], 40 * s.rate)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('RECEIVED')
    expect(r.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
    const lines = await prisma.vendorBillLine.findMany({ where: { vendorBillId: await idOf('CE-HM-K1') } })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ timesheetId: t.week, personId: t.helena, rateCents: s.rate, amountCents: 40 * s.rate })
    expect(Number(lines[0].hours)).toBe(40)
  })

  it('the same week typed in again under another number is refused, naming the receipt that holds it', async () => {
    const r = await receive('CE-HM-K2', [week(40)], 40 * s.rate)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_RECEIVED')
    expect(r.body.error.message).toMatch(/^Helena Marsh’s week of [A-Z][a-z]+ \d+ is already on Techpeple’s invoice CE-HM-K1,/)
  })

  it('a mis-keyed receipt is cancelled with a reason and its week can be received again', async () => {
    expect((await cancel('CE-HM-K1', '')).status, 'a reason is required').toBe(422)
    const c = await cancel('CE-HM-K1', 'Keyed against the wrong invoice number; Techpeple’s invoice is CE-HM-L1.')
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    const k1 = await prisma.vendorBill.findUniqueOrThrow({ where: { id: await idOf('CE-HM-K1') }, include: { lines: true } })
    // Kept on the record, with its line, and never revived.
    expect(k1.status).toBe('CANCELLED')
    expect(k1.lines).toHaveLength(1)
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'INVOICE_RECEIPT_CANCELLED', payload: { path: ['vendorBillId'], equals: k1.id } },
    })
    expect(log.reason).toBe('Keyed against the wrong invoice number; Techpeple’s invoice is CE-HM-L1.')
    expect(log.reversible).toBe(false)
    expect((await cancel('CE-HM-K1')).status, 'a cancelled receipt is not cancelled twice').toBe(409)

    // The week again, for forty-two hours where Computer Systems accepted forty.
    const r = await receive('CE-HM-L1', [week(42)], 42 * s.rate)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('DISPUTED')
    expect(r.body.data.match.checks.find((c: any) => c.code === 'QUANTITY')).toMatchObject({ outcome: 'FAIL', overridable: true })
  })

  it('a receipt whose lines do not add up to its total is refused', async () => {
    const r = await receive('CE-HM-X2', [{ expenseId: t.ownCost, amountCents: 25_000 }], 30_000, { periodStart: undefined, periodEnd: undefined })
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.checks.find((c: any) => c.code === 'HEADER_TOTAL').outcome).toBe('FAIL')
  })

  it('a difference the paying team waives with a reason is paid, and the waiver dies if the total changes', async () => {
    const id = await idOf('CE-HM-L1')
    as(CS)
    const refused = await pay(id)
    expect(refused.status).toBe(409)
    expect(refused.body.error.message).toMatch(/^Techpeple’s invoice CE-HM-L1 for \$[\d,.]+ does not pass the check now: Helena Marsh: billed 42h, approved 40h\. Record an exception with a reason on it/)

    // The rate, the same work twice, a week nobody accepted and a bare
    // total are nobody's to wave through, whatever the reason.
    const price = await waiveAs(CS, 'CE-HM-L1', 'PRICE')
    expect(price.status).toBe(403)
    expect(price.body.error.code).toBe('NOT_OVERRIDABLE')
    expect((await waiveAs(CS, 'CE-HM-L1', 'QUANTITY', 'ok')).status, 'a reason is a sentence').toBe(422)
    // The supplier is never the one to waive a check on what it billed.
    expect((await waiveAs(TECHPEPLE, 'CE-HM-L1', 'QUANTITY')).status).toBe(404)

    const w = await waiveAs(CS, 'CE-HM-L1', 'QUANTITY')
    expect(w.status, JSON.stringify(w.body)).toBe(200)
    expect(w.body.data.matched).toBe(true)
    const row = await prisma.vendorBillMatchOverride.findUniqueOrThrow({ where: { vendorBillId_code: { vendorBillId: id, code: 'QUANTITY' } } })
    expect(row).toMatchObject({ reason: 'Two hours of handover the client asked for in writing.', totalCentsAtOverride: 42 * s.rate })
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id } })).status).toBe('RECEIVED')
    expect((await waiveAs(CS, 'CE-HM-L1', 'PERIOD')).status, 'only a check failing now is waived').toBe(409)

    // Withdrawn, the difference is back and the receipt reads as disputed;
    // recorded again, it passes.
    as(CS)
    const back = await json(await unwaive(req('DELETE', `/api/ap/bills/${id}/match/override?code=QUANTITY`), params(id)))
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    expect(back.body.data.matched).toBe(false)
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id } })).status).toBe('DISPUTED')
    expect((await pay(id)).status).toBe(409)
    expect((await waiveAs(CS, 'CE-HM-L1', 'QUANTITY')).status).toBe(200)

    // The receipt corrected to forty-one hours is a different claim: the
    // exception was for forty-two, so it no longer covers it.
    const line = await prisma.vendorBillLine.findFirstOrThrow({ where: { vendorBillId: id } })
    await prisma.vendorBillLine.update({ where: { id: line.id }, data: { hours: 41, amountCents: 41 * s.rate } })
    await prisma.vendorBill.update({ where: { id }, data: { totalCents: 41 * s.rate } })
    as(CS)
    const stale = await pay(id)
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(stale.body.error.message).toMatch(/so it no longer covers it\. Record the exception again if it still stands\./)
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id } })).paidCents).toBe(0)

    // Back to the forty-two it was waived at, it passes and is paid.
    await prisma.vendorBillLine.update({ where: { id: line.id }, data: { hours: 42, amountCents: 42 * s.rate } })
    await prisma.vendorBill.update({ where: { id }, data: { totalCents: 42 * s.rate } })
    as(CS)
    const paid = await pay(id, { method: 'WIRE', reference: 'CS-8102' })
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    expect(paid.body.data.bill.status).toBe('PAID')
  })

  it('a payment on a typed-in receipt is not cash Techpeple has to place on its receivables', async () => {
    const id = await idOf('CE-HM-L1')
    const p = await prisma.payment.findFirstOrThrow({ where: { vendorBillId: id } })
    expect(p.receivedByCompanyId).toBe(s.techpeple)
    as(TECHPEPLE)
    const r = await json(await unappliedCash(req('GET', '/api/ar/payments')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain(p.id)
  })

  it('a receipt with money paid on it cannot be cancelled', async () => {
    const c = await cancel('CE-HM-L1', 'Tried to take it back after paying it.')
    expect(c.status).toBe(409)
    expect(c.body.error.code).toBe('PAID')
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: await idOf('CE-HM-L1') } })).status).toBe('PAID')
  })

  it('the list of invoice receipts carries each one’s lines, its exceptions with who and why, what still fails, whether it may be paid or cancelled, and who paid whom', async () => {
    as(CS)
    const r = await json(await receiptsList(req('GET', '/api/ap/receipts')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.role).toMatchObject({ mayRecord: true, mayWaive: true, mayPay: true })
    const row = (n: string) => r.body.data.receipts.find((x: any) => x.number === n)

    const paid = row('CE-HM-L1')
    expect(paid.status).toBe('PAID')
    expect(paid.lines).toEqual([expect.objectContaining({ kind: 'HOURS', hours: 42, rateMinor: s.rate, amountMinor: 42 * s.rate })])
    expect(paid.lines[0].says).toMatch(/^Helena Marsh · week of /)
    expect(paid.payments[0]).toMatch(/^Computer Systems[^.]* paid Techpeple \$[\d,.]+ on [A-Z][a-z]{2} \d+, \d{4} by WIRE, reference CS-8102\. Recorded by /)
    expect(paid.doors.waivers).toEqual([expect.objectContaining({ code: 'QUANTITY', live: true, reason: 'Two hours of handover the client asked for in writing.' })])
    expect(paid.doors.pay).toEqual({ offered: false, says: null })
    expect(paid.doors.cancel.offered).toBe(false)
    expect(paid.doors.cancel.says).toMatch(/has been paid on Techpeple’s invoice CE-HM-L1, so it is not cancelled/)

    const cancelled = row('CE-HM-K1')
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.cancelled).toMatch(/: “Keyed against the wrong invoice number; Techpeple’s invoice is CE-HM-L1\.”$/)
    expect(cancelled.doors.cancel).toEqual({ offered: false, says: null })

    // Held by the duplicate rule, in a run waiting to be released: nobody
    // may wave it through, and it is not cancelled until the run is.
    const twin = row('CE-HM-6')
    expect(twin.doors.failing.find((f: any) => f.code === 'DUPLICATE')).toMatchObject({ waivable: false, waive: { offered: false, says: 'Nobody can wave this through.' } })
    expect(twin.doors.pay.offered).toBe(false)
    expect(twin.doors.pay.says).toMatch(/already on Techpeple’s invoice CE-HM-4/)
    expect(twin.doors.cancel.says).toMatch(/is in a payment run that is approved and waiting to be released\. Cancel the run first, then this receipt\.$/)

    // The supplier reads its own book, never the payer's receipts.
    as(TECHPEPLE)
    const theirs = await json(await receiptsList(req('GET', '/api/ap/receipts')))
    expect(JSON.stringify(theirs.body)).not.toContain('CE-HM-L1')
  })

  it('a receipt in a payment run waiting to be released is not cancelled until the run is', async () => {
    const c = await cancel('CE-HM-6', 'Keyed twice before the duplicate rule existed.')
    expect(c.status, JSON.stringify(c.body)).toBe(409)
    expect(c.body.error.code).toBe('IN_A_RUN')
    as(CS)
    const run = await json(await runAct(req('PATCH', '/api/ap/payment-runs', { id: c.body.error.runId, action: 'cancel' })))
    expect(run.status, JSON.stringify(run.body)).toBe(200)
    expect((await cancel('CE-HM-6', 'Keyed twice before the duplicate rule existed.')).status).toBe(200)
  })

  it('a typed-in receipt’s expense line is paid only against the paying firm’s own acceptance of an expense approved on that line, and a rung below cannot accept before the client', async () => {
    const expenseLine = (expenseId: string) => [{ expenseId, amountCents: 25_000 }]
    const noPeriod = { periodStart: undefined, periodEnd: undefined }

    const submitted = await receive('CE-HM-E1', expenseLine(t.expense), 25_000, noPeriod)
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(422)
    expect(submitted.body.error.message).toMatch(/^Line 1 bills Helena Marsh’s travel expense of [A-Z][a-z]+ \d+, \d{4}, which is submitted, not approved, so it is not paid\./)

    const ownCost = await receive('CE-HM-E1', expenseLine(t.ownCost), 25_000, noPeriod)
    expect(ownCost.status).toBe(422)
    // The agreement between the two firms is silent, so Techpeple's own flag decides.
    expect(ownCost.body.error.message).toMatch(/^Line 1 bills Helena Marsh’s travel expense of .*, which is not billable on this leg: Techpeple recorded this travel expense as its own cost, and the agreement between Computer Systems Inc and Techpeple does not say which expenses are billable\./)

    await prisma.expense.update({ where: { id: t.expense }, data: { status: 'APPROVED', approvedAt: new Date() } })

    // Approved by Techpeple to reimburse Helena is not accepted by
    // Computer Systems, which pays for it (the founder, 2026-10-19).
    const unaccepted = await receive('CE-HM-E1', expenseLine(t.expense), 25_000, noPeriod)
    expect(unaccepted.status).toBe(422)
    expect(unaccepted.body.error.message).toMatch(/^Line 1 bills Helena Marsh’s travel expense of [A-Z][a-z]+ \d+, \d{4}, which your firm has not accepted\. Accept it first, then it is paid\./)

    const accept = async (who: string, body: unknown = { decision: 'accept' }) => {
      as(who)
      return json(await acceptExpense(req('POST', `/api/expenses/${t.expense}/accept`, body), params(t.expense)))
    }
    // Computer Systems cannot accept before Northbend, and Techpeple never accepts its own.
    const early = await accept(CS)
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body.error.message).toMatch(/^Northbend Athletic accepts Helena Marsh’s travel expense of .* first, then Computer Systems Inc\. It has not yet\.$/)
    const own = await accept(TECHPEPLE)
    expect(own.status).toBe(403)
    expect(own.body.error.code).toBe('OWN_EXPENSE')
    expect((await accept(NIKE)).status).toBe(200)
    expect((await accept(CS)).status).toBe(200)
    expect(await prisma.expenseAcceptance.count({ where: { expenseId: t.expense, status: 'ACCEPTED' } })).toBe(2)

    const wrongSum = await receive('CE-HM-E1', [{ expenseId: t.expense, amountCents: 27_500 }], 27_500, noPeriod)
    expect(wrongSum.status).toBe(422)
    expect(wrongSum.body.error.message).toMatch(/Line 1 bills \$275\.00 for Helena Marsh’s travel expense of .*; \$250\.00 was accepted\./)

    const ok = await receive('CE-HM-E1', expenseLine(t.expense), 25_000, noPeriod)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.bill.status).toBe('RECEIVED')
    const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: await idOf('CE-HM-E1') }, include: { lines: true } })
    // Its period is the expense's own day, read off the line.
    expect(day(bill.periodStart!)).toBe(day(bill.periodEnd!))
    expect(bill.lines[0]).toMatchObject({ expenseId: t.expense, personId: t.helena, hours: null, rateCents: null })

    const twice = await receive('CE-HM-E2', expenseLine(t.expense), 25_000, noPeriod)
    expect(twice.status).toBe(409)
    expect(twice.body.error.message).toMatch(/^Helena Marsh’s expense of \$250\.00 is already on Techpeple’s invoice CE-HM-E1,/)

    // And at the moment money leaves: an expense rejected since is not paid.
    await prisma.expense.update({ where: { id: t.expense }, data: { status: 'REJECTED' } })
    as(CS)
    const late = await pay(bill.id)
    expect(late.status).toBe(409)
    expect(late.body.error.message).toMatch(/which is rejected, not approved, so it is not paid/)
    await prisma.expense.update({ where: { id: t.expense }, data: { status: 'APPROVED' } })
    expect((await pay(bill.id)).status).toBe(200)
  })

  it('a typed-in receipt’s milestone line is paid only against a milestone accepted on the order it draws on', async () => {
    const line = [{ milestoneId: t.milestone, amountCents: 150_000 }]
    const early = await receive('CE-HM-M1', line, 150_000)
    expect(early.status).toBe(422)
    expect(early.body.error.message).toMatch(/^Line 1 bills the milestone “Data migration sign-off”, which has not been accepted, so it is not paid\./)

    await prisma.orderMilestone.update({ where: { id: t.milestone }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    const ok = await receive('CE-HM-M1', line, 150_000)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.bill.status).toBe('RECEIVED')
    // It draws on the order like any other receipt.
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: await idOf('CE-HM-M1') } })).workOrderId).toBe(s.order)
  })

  it('where the agreed rate changed inside a week, a line at one rate is refused rather than priced on a guess', async () => {
    const sheet = await prisma.timesheet.findUniqueOrThrow({ where: { id: t.week } })
    const someone = await prisma.person.findFirstOrThrow({ select: { id: true } })
    const raise = await prisma.rateHistory.create({
      data: {
        contractType: 'BUY', contractId: s.buy, rate: s.rate + 500, previousRate: s.rate,
        fromDate: new Date(sheet.periodStart.getTime() + 3 * 86_400_000), changedById: someone.id,
        approvalState: 'APPROVED', approvedAt: new Date(), reason: 'Midweek raise',
      },
    })
    try {
      const r = await receive('CE-HM-R1', [week(40)], 40 * s.rate)
      expect(r.status, JSON.stringify(r.body)).toBe(422)
      expect(r.body.error.code).toBe('RATE_CHANGED_IN_WEEK')
      expect(r.body.error.message).toMatch(/^The agreed rate changed inside Helena Marsh’s week of [A-Z][a-z]+ \d+ \(\$[\d,.]+ to \$[\d,.]+ an hour\), so one line at one rate cannot state it\. Record this invoice as a total, which is priced day by day\.$/)
    } finally {
      await prisma.rateHistory.delete({ where: { id: raise.id } })
    }
  })

  // ── The founder, 2026-10-19: a sub-vendor's overtime is the client's
  // decision, carried down the chain, at the pair's own rate; and a cut
  // week loses overtime first, as on any bill. ─────────────────────────
  //
  // A week of forty-five hours, Monday to Friday at nine, a week earlier
  // than any of Helena's on the record. Every firm signs it. Northbend
  // decides on its own leg — Computer Systems' contract to it — that the
  // five over its line of forty are worth double time to Northbend.
  // Techpeple invoices Computer Systems on Computer Systems' buy line,
  // whose own multiplier is the pair's.
  const overtimeWeek = async (o: { accepted?: number; clientDecides?: boolean; csDecidesOnTechpeple?: boolean } = {}) => {
    const first = await prisma.timesheet.findFirstOrThrow({ where: { personId: t.helena }, orderBy: { periodStart: 'asc' } })
    const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
    const days: Record<string, number> = {}
    for (let i = 1; i <= 5; i++) days[day(plus(first.periodStart, -7 + i))] = 9
    const sheet = await prisma.timesheet.create({
      data: {
        sellContractId: first.sellContractId, personId: t.helena,
        periodStart: plus(first.periodStart, -7), periodEnd: plus(first.periodEnd, -7),
        days, totalHours: 45, status: 'APPROVED', submittedAt: new Date(), approvedAt: new Date(),
      },
    })
    const hoursLeg = await prisma.sellContract.findUniqueOrThrow({ where: { id: first.sellContractId } })
    const top = await prisma.sellContract.findFirstOrThrow({ where: { personId: t.helena, companyId: s.cs } })
    const someone = await prisma.person.findFirstOrThrow({ select: { id: true } })
    for (const [companyId, role, hours, rateCents] of [
      [top.clientCompanyId, 'CLIENT_APPROVAL', 45, top.billRate],
      [s.cs, 'PASS_THROUGH', o.accepted ?? 45, hoursLeg.billRate],
      [s.techpeple, 'EMPLOYER_ACCEPTANCE', 45, s.rate],
    ] as const) {
      await prisma.workAssertion.create({ data: { timesheetId: sheet.id, companyId, role, hours, rateCents, state: 'LIVE', byId: someone.id } })
    }
    if (o.clientDecides ?? true) {
      await prisma.overtimeDecision.create({
        data: {
          timesheetId: sheet.id, sellContractId: top.id, weekOf: sheet.periodStart,
          treatment: 'PREMIUM', overtimeHours: 5, afterHours: 40, multiplierBps: 15_000, appliedBps: 20_000,
          decidedById: someone.id, decidedByCompanyId: top.clientCompanyId, reason: 'Cut-over weekend, double time agreed.',
        },
      })
    }
    if (o.csDecidesOnTechpeple) {
      await prisma.overtimeDecision.create({
        data: {
          timesheetId: sheet.id, sellContractId: hoursLeg.id, weekOf: sheet.periodStart,
          treatment: 'PREMIUM', overtimeHours: 5, afterHours: 40, multiplierBps: 15_000, appliedBps: 15_000,
          decidedById: someone.id, decidedByCompanyId: s.cs, reason: 'Computer Systems’ own answer on Techpeple’s leg.',
        },
      })
    }
    const bps = (await prisma.buyContract.findUniqueOrThrow({ where: { id: s.buy } })).overtimeMultiplierBps
    return {
      sheet,
      period: { periodStart: sheet.periodStart.toISOString(), periodEnd: sheet.periodEnd.toISOString() },
      line: (hours: number, amountCents: number) => [{ timesheetId: sheet.id, hours, rateCents: s.rate, amountCents }],
      premiumPerHour: (s.rate * (bps - 10_000)) / 10_000,
    }
  }

  it('a sub-vendor’s receipt prices as overtime exactly the hours the client’s signature decided, at the pair’s own rate', async () => {
    const w = await overtimeWeek()
    const straight = 45 * s.rate
    const pairs = Math.round(5 * w.premiumPerHour)
    // Northbend's double time is a price on its own leg, not Techpeple's.
    const clients = 5 * s.rate
    const atTheClientsRate = await receive('CE-HM-OT1', w.line(45, straight + clients), straight + clients, w.period)
    expect(atTheClientsRate.status, JSON.stringify(atTheClientsRate.body)).toBe(422)
    expect(atTheClientsRate.body.error.checks.find((c: any) => c.code === 'EXTENSION').outcome).toBe('FAIL')

    const ok = await receive('CE-HM-OT1', w.line(45, straight + pairs), straight + pairs, w.period)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.bill.status).toBe('RECEIVED')
    expect(ok.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])

    // Typed in as a total, the same week is held to the same figure.
    expect((await cancel('CE-HM-OT1')).status).toBe(200)
    const short = await receive('CE-HM-OT1T', [], straight, w.period)
    expect(short.status, JSON.stringify(short.body)).toBe(422)
    expect(short.body.error.message).toMatch(/with \$[\d,.]+ of overtime the client decided come to/)
    const total = await receive('CE-HM-OT1T', [], straight + pairs, w.period)
    expect(total.status, JSON.stringify(total.body)).toBe(200)
    expect(total.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
  })

  it('a premium line for hours the client did not decide as overtime is refused', async () => {
    // Computer Systems answered on Techpeple's leg; Northbend decided nothing.
    const w = await overtimeWeek({ clientDecides: false, csDecidesOnTechpeple: true })
    const straight = 45 * s.rate
    const premium = Math.round(5 * w.premiumPerHour)
    const r = await receive('CE-HM-OT2', w.line(45, straight + premium), straight + premium, w.period)
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.checks.find((c: any) => c.code === 'EXTENSION').outcome).toBe('FAIL')

    const ok = await receive('CE-HM-OT2', w.line(45, straight), straight, w.period)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
  })

  it('when fewer hours are accepted on a sub-vendor’s receipt, the cut comes off overtime first, as on any bill', async () => {
    // Computer Systems accepts 43 of the 45: the two it did not accept come
    // off the five over the line, leaving 40 ordinary and 3 overtime.
    const w = await overtimeWeek({ accepted: 43 })
    const billRule = 43 * s.rate + Math.round(3 * w.premiumPerHour)
    const payRule = 43 * s.rate + Math.round(5 * w.premiumPerHour)
    const wrong = await receive('CE-HM-OT3', w.line(43, payRule), payRule, w.period)
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(422)
    expect(wrong.body.error.checks.find((c: any) => c.code === 'EXTENSION').outcome).toBe('FAIL')

    const ok = await receive('CE-HM-OT3', w.line(43, billRule), billRule, w.period)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
  })

  it('releasing a payment run writes a payment for each invoice receipt it pays', async () => {
    const id = await idOf('CE-HM-M1')
    await prisma.vendorBill.update({ where: { id }, data: { status: 'APPROVED' } })
    const people = await prisma.context.findMany({ where: { companyId: s.cs, revokedAt: null }, select: { personId: true }, take: 1 })
    const other = await prisma.person.findFirstOrThrow({ where: { id: { not: people[0].personId } }, select: { id: true } })
    const run = await prisma.paymentRun.create({
      data: {
        companyId: s.cs, currency: 'USD', status: 'APPROVED', scheduledFor: new Date(), totalCents: 150_000,
        createdById: other.id, approvedById: other.id,
        items: { create: [{ vendorBillId: id, amountCents: 150_000 }] },
      },
    })
    as(CS)
    const r = await json(await runAct(req('PATCH', '/api/ap/payment-runs', { id: run.id, action: 'pay' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const p = await prisma.payment.findFirstOrThrow({ where: { vendorBillId: id } })
    expect(p).toMatchObject({ payerCompanyId: s.cs, receivedByCompanyId: s.techpeple, method: 'PAYMENT_RUN', reference: run.id })
    expect(Math.round(Number(p.amount) * 100)).toBe(150_000)
  })
})

/**
 * When the supplier sends its bill here rather than the payer typing it
 * in, the payer's own "invoice receipt to record" date on its buy line is
 * just as done — and nothing closed it.
 */
describe('a supplier’s bill sent on the platform closes the payer’s receipt date on its buy line', () => {
  it('when Techpeple sends its bill for Helena’s week on Etyme, Computer Systems’ date for that invoice receipt closes', async () => {
    const first = await prisma.timesheet.findFirstOrThrow({ where: { personId: (await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })).id }, orderBy: { periodStart: 'asc' } })
    const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
    const days: Record<string, number> = {}
    // A week before the earliest on the record that lies wholly inside one
    // month, so the bill is for that week alone.
    let back = -14
    while (plus(first.periodStart, back).getUTCMonth() !== plus(first.periodEnd, back).getUTCMonth()) back -= 7
    for (let i = 1; i <= 5; i++) days[plus(first.periodStart, back + i).toISOString().slice(0, 10)] = 8
    const sheet = await prisma.timesheet.create({
      data: {
        sellContractId: first.sellContractId, personId: first.personId,
        periodStart: plus(first.periodStart, back), periodEnd: plus(first.periodEnd, back),
        days, totalHours: 40, status: 'SUBMITTED', submittedAt: new Date(),
      },
    })
    for (const who of [NIKE, CS, TECHPEPLE]) {
      as(who)
      const r = await sign(sheet.id)
      expect(r.body?.error, `${who}: ${JSON.stringify(r.body)}`).toBeUndefined()
    }
    const open = () => prisma.cycle.findMany({
      where: { buyContractId: s.buy, kind: 'VENDOR_BILL_GENERATE', completedAt: null },
      orderBy: { dueOn: 'asc' }, select: { id: true, dueOn: true },
    })
    const before = await open()

    const contract = await prisma.sellContract.findUniqueOrThrow({ where: { id: sheet.sellContractId } })
    as(TECHPEPLE)
    const made = await json(await generate(req('POST', '/api/invoices/generate', {
      engagementId: contract.engagementId,
      periodStart: sheet.periodStart.toISOString().slice(0, 10),
      periodEnd: sheet.periodEnd.toISOString().slice(0, 10),
    })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const bill = await prisma.invoice.findFirstOrThrow({
      where: { invoiceLines: { some: { timesheetId: sheet.id } } }, select: { id: true, status: true },
    })
    if (bill.status !== 'SUBMITTED') {
      const sent = await json(await sendBill(req('POST', `/api/invoices/${bill.id}/submit`, {}), params(bill.id)))
      expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    }
    const after = await open()
    expect(after.length).toBe(before.length - 1)
    // The date closed is one on or after the week it bills, never earlier.
    const closed = before.filter((c) => !after.some((a) => a.id === c.id))
    expect(closed).toHaveLength(1)
    expect(closed[0].dueOn.getTime()).toBeGreaterThanOrEqual(sheet.periodEnd.getTime())
  })
})

describe('the invoice receipt form offers a week only where the check would take it, and a line holds only the week it names', () => {
  const p: Record<string, any> = {}
  const options = async () => {
    as(CS)
    const r = await json(await receiptOptions(req('GET', `/api/ap/receipts/options?buyContractId=${p.buy}`)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return r.body.data
  }
  const preview = async (lines: unknown[], totalCents: number) => {
    as(CS)
    return json(await recordBill(req('POST', '/api/ap/bills', {
      vendorCompanyId: p.vendor, number: 'CE-PR-PREVIEW', buyContractId: p.buy, currency: 'USD',
      total: totalCents / 100, dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), lines, preview: true,
    })))
  }

  beforeAll(async () => {
    // Priya Raman's buy line at Computer Systems, as seeded: one week
    // inside a receipt typed in as a total, the rest on bills Techpeple sent.
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: {
        company: { name: 'Computer Systems Inc' },
        vendorCompany: { name: 'Techpeple' },
        candidates: { some: { person: { name: 'Priya Raman' } } },
      },
      select: { id: true, vendorCompanyId: true },
    })
    p.buy = buy.id
    p.vendor = buy.vendorCompanyId
    p.total = await prisma.vendorBill.findFirstOrThrow({
      where: { buyContractId: buy.id, status: { not: 'CANCELLED' }, lines: { none: {} }, periodStart: { not: null } },
      select: { id: true, number: true, periodStart: true, periodEnd: true },
    })
  })

  it('a week inside an invoice receipt typed in as a total is shown as already on it, and a week on a bill the supplier sent is shown as already on that bill', async () => {
    const o = await options()
    const inside = o.weeks.filter((w: any) => w.weekOf >= p.total.periodStart.toISOString().slice(0, 10) && w.weekOf <= p.total.periodEnd.toISOString().slice(0, 10))
    expect(inside.length).toBeGreaterThan(0)
    for (const w of inside) expect(w.heldBy).toBe(p.total.number)
    const onBills = o.weeks.filter((w: any) => w.heldBy && w.heldBy !== p.total.number)
    expect(onBills.length).toBeGreaterThan(0)
    const sent = await prisma.invoice.findMany({ where: { number: { in: onBills.map((w: any) => w.heldBy) } }, select: { number: true } })
    expect(sent.map((x) => x.number).sort()).toEqual([...new Set(onBills.map((w: any) => w.heldBy))].sort())
    p.freed = inside[0]
    p.billed = onBills[0]
    // The seeded travel expense. Where a firm above Computer Systems'
    // supplier has to accept it first, the form names it and does not
    // offer it until each firm that pays for it has (the founder,
    // 2026-10-19); one Computer Systems raised on its own book is its own
    // approval, and is offered as it was.
    const toAccept = o.expensesToAccept[0]
    if (toAccept) {
      expect(toAccept.says).toMatch(/ is not accepted yet, so it is not offered\. Accept it first\.$/)
      expect(o.expenses.map((x: any) => x.id)).not.toContain(toAccept.id)
      const read = (await readForAcceptance(toAccept.id))!
      for (const step of acceptanceChain(read.expense, read.legs).steps) {
        const by = await prisma.context.findFirstOrThrow({ where: { companyId: step.companyId, type: 'EMPLOYEE', revokedAt: null }, select: { personId: true } })
        await prisma.expenseAcceptance.create({ data: { expenseId: toAccept.id, companyId: step.companyId, byId: by.personId, acceptedCents: read.expense.totalCents, status: 'ACCEPTED' } })
      }
    }
    p.expense = (await options()).expenses.find((x: any) => !x.heldBy)
    expect(p.expense, 'the seeded travel expense').toBeTruthy()
  })

  it('once the total-only receipt is cancelled its week is offered again, and a receipt for that week with an expense dated in an earlier week is not refused over hours it does not bill', async () => {
    const c = await cancel(p.total.number, 'Keyed as a total; keyed again with its line.')
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    const o = await options()
    const freed = o.weeks.find((w: any) => w.timesheetId === p.freed.timesheetId)
    expect(freed.heldBy).toBeNull()
    const hours = freed.hoursAccepted * freed.rateMinor
    const r = await preview([
      { timesheetId: freed.timesheetId, hours: freed.hoursAccepted, rateCents: freed.rateMinor, amountCents: hours },
      { expenseId: p.expense.id, amountCents: p.expense.amountMinor },
    ], hours + p.expense.amountMinor)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ preview: true, wouldBe: 'RECEIVED' })
  })

  it('a line for a week already on a bill the supplier sent is refused in a sentence naming that bill', async () => {
    const w = p.billed
    const r = await preview([{ timesheetId: w.timesheetId, hours: w.hoursAccepted, rateCents: w.rateMinor, amountCents: w.hoursAccepted * w.rateMinor }], w.hoursAccepted * w.rateMinor)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_BILLED')
    expect(r.body.error.message).toMatch(new RegExp(`^Priya Raman’s hours for .+ are already on Techpeple’s bill .*${w.heldBy}`))
  })
})
