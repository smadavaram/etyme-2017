import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { matchInvoice } from '@/lib/invoice-match'

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { POST as generate } from '@/app/api/invoices/generate/route'
import { POST as recordBill, GET as exceptions, PATCH as payBill } from '@/app/api/ap/bills/route'
import { GET as proposeRun } from '@/app/api/ap/payment-runs/route'

/**
 * What each rung may bill, and when — the founder's three answers of
 * 2026-09-28, walked on the seeded chain.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by CloudEPA. Her latest seeded week is filed once, on
 * CloudEPA's contract, and nobody has signed it.
 *
 *   1. A firm bills only the hours the firm above it accepted.
 *   2. A firm bills upward on the client's signature, without waiting for
 *      the rungs below it to accept.
 *   3. A week the paying firm has not accepted blocks the invoice receipt
 *      that includes it — no "approve anyway with a reason".
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const CLOUDEPA = `world-cloudepa${D}`

const sign = async (id: string, body: unknown = {}) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, body), { params: Promise.resolve({ id }) }))

const s: Record<string, any> = {}

const bill = async (engagementId: string) =>
  json(await generate(req('POST', '/api/invoices/generate', { engagementId, periodStart: s.from, periodEnd: s.to })))

const receipt = async (number: string, hours: number) =>
  json(
    await recordBill(
      req('POST', '/api/ap/bills', {
        vendorCompanyId: s.cloudepa,
        number,
        buyContractId: s.buy,
        periodStart: s.from,
        periodEnd: s.to,
        hours,
        rateCents: s.payRate,
        total: (hours * s.payRate) / 100,
        currency: 'USD',
        dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
    )
  )

const check = (m: any, code: string) => m.checks.find((c: any) => c.code === code)

describe('each rung bills what the rung above it accepted, upward on the client’s signature, and never pays a week it has not accepted', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
      include: { sellContract: true },
    })
    const cs = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
    const cloudepa = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-cloudepa' } })
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })

    // The two contracts that bill Helena's week: Computer Systems' to
    // Northbend at the top, CloudEPA's to Computer Systems underneath —
    // which is also the one the hours are filed on.
    const top = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: cs.id, personId: helena.id, state: 'IN_PROGRESS' },
    })
    const rung = week.sellContract
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: cs.id, vendorCompanyId: cloudepa.id, candidates: { some: { personId: helena.id } } },
      include: { candidates: true },
    })

    Object.assign(s, {
      week: week.id,
      hours: Number(week.totalHours),
      weekWord: week.periodStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }),
      cs: cs.id,
      // The firm's name as the seed writes it, which is what a sentence says.
      csName: cs.name,
      cloudepa: cloudepa.id,
      northbend: northbend.id,
      top,
      rung,
      buy: buy.id,
      payRate: buy.candidates[0].payRate,
      from: week.periodStart.toISOString().slice(0, 10),
      to: week.periodEnd.toISOString().slice(0, 10),
    })

    // The seed records CloudEPA's invoice receipts at Computer Systems over
    // Helena's recent weeks, this unsigned one among them — itself the
    // fault a tester found on 2026-09-30 (a receipt over a week nobody
    // accepted), sent to the architect. This story starts before any
    // invoice for the week was keyed in, so those are withdrawn here.
    await prisma.vendorBill.updateMany({
      where: {
        companyId: cs.id, vendorCompanyId: cloudepa.id,
        periodStart: { lte: week.periodEnd }, periodEnd: { gte: week.periodStart },
      },
      data: { status: 'CANCELLED' },
    })

    // The walk rests on the seeded shape; say so rather than pass by luck.
    expect(s.hours).toBe(40)
    expect(rung.companyId).toBe(cloudepa.id)
    expect(rung.clientCompanyId).toBe(cs.id)
    expect(rung.endClientCompanyId).toBe(northbend.id)
    expect(top.clientCompanyId).toBe(northbend.id)
    expect(
      await prisma.timesheet.count({
        where: { personId: helena.id, periodStart: { lte: week.periodEnd }, periodEnd: { gte: week.periodStart } },
      })
    ).toBe(1)
  }, 240_000)

  it('a CloudEPA invoice recorded before this rule, over Helena’s week nobody has accepted, cannot be paid, and the exception queue says who must accept it', async () => {
    // As it would read had it been recorded before 2026-09-28: approved,
    // due, against Computer Systems' buy contract, over the unsigned week.
    const old = await prisma.vendorBill.create({
      data: {
        companyId: s.cs, vendorCompanyId: s.cloudepa, number: 'CE-BEFORE-RULE', buyContractId: s.buy,
        periodStart: new Date(`${s.from}T00:00:00.000Z`), periodEnd: new Date(`${s.to}T00:00:00.000Z`),
        currency: 'USD', totalCents: 40 * s.payRate, receivedAt: new Date(Date.now() - 86_400_000),
        dueAt: new Date(Date.now() - 3_600_000), status: 'APPROVED',
      },
    })
    s.oldBill = old.id
    const says = `${s.csName} has not accepted Helena Marsh’s week of ${s.weekWord}. Accept it first, then pay this invoice.`

    as(CS)
    const paid = await json(await payBill(req('PATCH', '/api/ap/bills', { id: old.id })))
    expect(paid.status).toBe(422)
    expect(paid.body.error).toEqual({ code: 'WEEK_NOT_ACCEPTED', message: says })
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: old.id } })).paidCents).toBe(0)

    const q = await json(await exceptions(req('GET', '/api/ap/bills')))
    const row = q.body.data.exceptions.find((e: any) => e.id === old.id)
    expect(row.hardFailures).toContain('RECEIPT')
    expect(row.waivableFailures).not.toContain('RECEIPT')
    expect(check(row, 'RECEIPT').reason).toBe(says)

    const run = await json(await proposeRun(req('GET', `/api/ap/payment-runs?currency=USD&scheduledFor=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`)))
    expect(run.status, JSON.stringify(run.body)).toBe(200)
    expect(run.body.data.proposed.lines.map((l: any) => l.billId)).not.toContain(old.id)
    expect(run.body.data.proposed.excluded.find((e: any) => e.billId === old.id)).toMatchObject({ reason: 'WEEK_NOT_ACCEPTED', says })
  })

  it('Northbend signs thirty-eight of Helena’s forty hours, with its reason', async () => {
    as(NIKE)
    const r = await sign(s.week, { acceptedHours: 38, note: 'Two hours were a Friday training session we do not pay for.' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const mine = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, companyId: s.northbend, state: 'LIVE' } })
    expect(mine.role).toBe('CLIENT_APPROVAL')
    expect(Number(mine.hours)).toBe(38)
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: s.week } })
    // Signed at the top and not below: the timesheet is not "approved".
    expect(row.status).toBe('SUBMITTED')
  })

  it('Northbend signs thirty-eight of forty, and Computer Systems bills Northbend for thirty-eight, before Computer Systems or CloudEPA has accepted anything', async () => {
    expect(await prisma.workAssertion.count({ where: { timesheetId: s.week, companyId: { in: [s.cs, s.cloudepa] } } })).toBe(0)

    as(CS)
    const r = await bill(s.top.engagementId)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.heldBack.weeks).toEqual([])
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: r.body.data.invoice.id, timesheetId: s.week } })
    expect(Number(line.hours)).toBe(38)
    expect(line.rateCents).toBe(s.top.billRate)
    expect(line.amountCents).toBe(Math.round(38 * s.top.billRate))
    s.topInvoice = r.body.data.invoice.id
    s.topLine = line.id
  })

  it('Computer Systems’ bill to Northbend clears the receipt and hours checks on Northbend’s signature alone, not held for CloudEPA two rungs below', async () => {
    const m = await matchInvoice(s.topInvoice)
    expect(check(m, 'RECEIPT').outcome, JSON.stringify(m!.checks)).toBe('PASS')
    expect(check(m, 'QUANTITY').outcome).toBe('PASS')
    expect(check(m, 'EXTENSION').outcome).toBe('PASS')
    expect(check(m, 'HEADER_TOTAL').outcome).toBe('PASS')
  })

  it('a Computer Systems bill to Northbend for all forty hours fails the hours check against the thirty-eight Northbend signed', async () => {
    const forty = 40 * s.top.billRate
    const before = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: s.topLine } })
    const header = await prisma.invoice.findUniqueOrThrow({ where: { id: s.topInvoice } })
    await prisma.invoiceLine.update({ where: { id: s.topLine }, data: { hours: 40, amountCents: forty } })
    await prisma.invoice.update({ where: { id: s.topInvoice }, data: { total: forty / 100 } })

    const m = await matchInvoice(s.topInvoice)
    expect(check(m, 'QUANTITY')).toMatchObject({ outcome: 'FAIL', reason: 'Helena Marsh: billed 40h, approved 38h' })

    // Put back as generated, so nothing later in the walk reads the edit.
    await prisma.invoiceLine.update({ where: { id: s.topLine }, data: { hours: before.hours, amountCents: before.amountCents } })
    await prisma.invoice.update({ where: { id: s.topInvoice }, data: { total: header.total } })
  })

  it('CloudEPA cannot bill Computer Systems for Helena’s week until Computer Systems has accepted it, and is told so in a sentence', async () => {
    as(CLOUDEPA)
    const r = await bill(s.rung.engagementId)
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('NOT_ACCEPTED_ABOVE')
    expect(r.body.error.message).toBe(
      `${s.csName} has not accepted Helena Marsh’s week of ${s.weekWord}, so it is not on this bill. ` +
        `A firm bills only the hours the firm above it accepted; it bills once ${s.csName} has.`
    )
    expect(await prisma.invoiceLine.count({ where: { timesheetId: s.week, sellContractId: s.rung.id } })).toBe(0)
  })

  it('Computer Systems cannot record CloudEPA’s invoice for the week before accepting it, and is told which week and who must accept it', async () => {
    as(CS)
    const r = await receipt('CE-HM-EARLY', 40)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('WEEK_NOT_ACCEPTED')
    expect(r.body.error.message).toBe(
      `${s.csName} has not accepted Helena Marsh’s week of ${s.weekWord}. Accept it first, then record this invoice.`
    )
    // Refused, not recorded as disputed for somebody to wave through.
    expect(await prisma.vendorBill.count({ where: { companyId: s.cs, number: 'CE-HM-EARLY' } })).toBe(0)
  })

  it('Computer Systems accepts thirty-eight of Helena’s forty hours, with its reason', async () => {
    as(CS)
    const r = await sign(s.week, { acceptedHours: 38, note: 'Two hours were a Friday training session Northbend does not pay us for.' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const mine = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, companyId: s.cs, state: 'LIVE' } })
    expect(mine.role).toBe('PASS_THROUGH')
    expect(Number(mine.hours)).toBe(38)
  })

  it('once Computer Systems has accepted the week, the invoice recorded before the rule is no longer blocked by it', async () => {
    as(CS)
    const q = await json(await exceptions(req('GET', '/api/ap/bills')))
    const row = q.body.data.exceptions.find((e: any) => e.id === s.oldBill)
    expect(row?.hardFailures ?? []).not.toContain('RECEIPT')
  })

  it('Computer Systems records CloudEPA’s invoice for the thirty-eight hours it accepted, and it matches', async () => {
    as(CS)
    const r = await receipt('CE-HM-38', 38)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('RECEIVED')
    expect(r.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
  })

  it('an invoice receipt for forty against the thirty-eight accepted is still held as disputed with a reason, because the other waivable mismatches stay as they were', async () => {
    as(CS)
    const r = await receipt('CE-HM-40', 40)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('DISPUTED')
    expect(r.body.data.match.checks.find((c: any) => c.code === 'QUANTITY')).toMatchObject({ outcome: 'FAIL', overridable: true })
  })

  it('a bill never covers hours already on a bill to the same firm: CloudEPA cannot generate a bill for the week Computer Systems already holds its invoice for, and is told which', async () => {
    as(CLOUDEPA)
    const r = await bill(s.rung.engagementId)
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.message).toMatch(new RegExp(`^Helena Marsh’s week of .+ is already on invoices .*CE-HM-38.*, which ${s.csName} recorded from you, so it is not billed again\\.$`))
    expect(await prisma.invoiceLine.count({ where: { timesheetId: s.week, sellContractId: s.rung.id } })).toBe(0)

    // Computer Systems withdraws the three it keyed in, so CloudEPA's own bill can be the one.
    await prisma.vendorBill.updateMany({
      where: { companyId: s.cs, number: { in: ['CE-BEFORE-RULE', 'CE-HM-38', 'CE-HM-40'] } },
      data: { status: 'CANCELLED' },
    })
  })

  it('CloudEPA’s bill to Computer Systems is for the thirty-eight hours Computer Systems accepted, not the forty Helena worked, before CloudEPA has accepted anything itself', async () => {
    expect(await prisma.workAssertion.count({ where: { timesheetId: s.week, companyId: s.cloudepa } })).toBe(0)

    as(CLOUDEPA)
    const r = await bill(s.rung.engagementId)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: r.body.data.invoice.id, timesheetId: s.week } })
    expect(Number(line.hours)).toBe(38)
    expect(line.rateCents).toBe(s.rung.billRate)
    expect(line.amountCents).toBe(Math.round(38 * s.rung.billRate))
    s.rungInvoice = r.body.data.invoice.id
    s.rungLine = line.id
  })

  it('CloudEPA’s bill for the thirty-eight hours clears the receipt, hours and arithmetic checks against Computer Systems’ own acceptance', async () => {
    const m = await matchInvoice(s.rungInvoice)
    expect(check(m, 'RECEIPT').outcome, JSON.stringify(m!.checks)).toBe('PASS')
    expect(check(m, 'QUANTITY').outcome).toBe('PASS')
    expect(check(m, 'EXTENSION').outcome).toBe('PASS')
    expect(check(m, 'HEADER_TOTAL').outcome).toBe('PASS')
  })

  it('Computer Systems cannot key in CloudEPA’s invoice for hours CloudEPA’s generated bill already holds, and is told which bill', async () => {
    as(CS)
    const r = await receipt('CE-HM-AGAIN', 38)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_BILLED')
    expect(r.body.error.message).toMatch(/^Helena Marsh’s hours for .+ are already on CloudEPA’s bill .+, so recording this invoice would owe them twice\. Pay that bill, or ask CloudEPA to cancel it first\.$/)
    expect(await prisma.vendorBill.count({ where: { companyId: s.cs, number: 'CE-HM-AGAIN' } })).toBe(0)
  })

  it('a CloudEPA bill for all forty hours, as one raised before this rule would read, fails the hours check against the thirty-eight Computer Systems accepted', async () => {
    const forty = 40 * s.rung.billRate
    await prisma.invoiceLine.update({ where: { id: s.rungLine }, data: { hours: 40, amountCents: forty } })
    await prisma.invoice.update({ where: { id: s.rungInvoice }, data: { total: forty / 100 } })

    const m = await matchInvoice(s.rungInvoice)
    expect(check(m, 'QUANTITY')).toMatchObject({ outcome: 'FAIL', reason: 'Helena Marsh: billed 40h, approved 38h' })
    expect(check(m, 'RECEIPT').outcome).toBe('PASS')
  })

  // ── Rule 4, the founder, 2026-09-29: the cut comes off overtime first ──
  //
  // A week of Helena's before the seeded ones, forty-five hours at nine a
  // day, filed on CloudEPA's contract as every week of hers is. Computer
  // Systems' agreement with Northbend puts the overtime line at forty.
  // Northbend signs forty-two and prices the five over the line at time
  // and a half; the three it did not accept come off the overtime.
  it('Northbend signs forty-two of a forty-five hour week with five over the line, and Computer Systems bills forty ordinary and two overtime, which the three-way check passes and a bill for all forty-five fails', async () => {
    await prisma.sellContract.update({ where: { id: s.top.id }, data: { overtimeAfterHours: 40, overtimeMultiplierBps: 15_000 } })

    const earliest = await prisma.timesheet.findFirstOrThrow({
      where: { sellContractId: s.rung.id },
      orderBy: { periodStart: 'asc' },
    })
    const monday = new Date(earliest.periodStart.getTime() - 14 * 86_400_000)
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    const day = (n: number) => new Date(monday.getTime() + n * 86_400_000).toISOString().slice(0, 10)
    const days = Object.fromEntries([0, 1, 2, 3, 4].map((n) => [day(n), 9]))

    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const ts = await prisma.timesheet.create({
      data: {
        sellContractId: s.rung.id, personId: helena.id,
        periodStart: new Date(`${day(0)}T00:00:00.000Z`), periodEnd: new Date(`${day(4)}T00:00:00.000Z`),
        days, totalHours: 45, status: 'SUBMITTED', submittedAt: new Date(`${day(4)}T18:00:00.000Z`),
      },
    })

    as(NIKE)
    const signed = await sign(ts.id, {
      acceptedHours: 42,
      note: 'Three hours of Friday were a vendor demo we did not ask for.',
      overtime: [{ weekOf: day(0), treatment: 'PREMIUM', multiplierBps: 15_000 }],
    })
    expect(signed.body?.error, JSON.stringify(signed.body)).toBeUndefined()

    as(CS)
    const made = await json(
      await generate(req('POST', '/api/invoices/generate', { engagementId: s.top.engagementId, periodStart: day(0), periodEnd: day(4) }))
    )
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(made.body.data.heldBack.weeks).toEqual([])
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: made.body.data.invoice.id, timesheetId: ts.id } })
    const premiumRate = Math.round((s.top.billRate * 15_000) / 10_000)
    expect(Number(line.hours)).toBe(42)
    expect(line.amountCents).toBe(40 * s.top.billRate + Math.round(2 * premiumRate))
    expect(line.description ?? '').toMatch(/40h at the usual rate, 2h overtime, at time and a half/)

    const m = await matchInvoice(made.body.data.invoice.id)
    for (const code of ['RECEIPT', 'QUANTITY', 'PRICE', 'EXTENSION', 'HEADER_TOTAL']) {
      expect(check(m, code)?.outcome, `${code}: ${JSON.stringify(m!.checks)}`).toBe('PASS')
    }

    // The same week billed as worked — forty ordinary and five overtime —
    // fails the hours check against what Northbend signed.
    const asWorked = 40 * s.top.billRate + 5 * premiumRate
    await prisma.invoiceLine.update({ where: { id: line.id }, data: { hours: 45, amountCents: asWorked } })
    await prisma.invoice.update({ where: { id: made.body.data.invoice.id }, data: { total: asWorked / 100 } })
    const wrong = await matchInvoice(made.body.data.invoice.id)
    expect(check(wrong, 'QUANTITY')).toMatchObject({ outcome: 'FAIL', reason: 'Helena Marsh: billed 45h, approved 42h' })
  })
})
