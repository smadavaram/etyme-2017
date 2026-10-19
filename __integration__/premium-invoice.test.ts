import { describe, it, expect, beforeAll } from 'vitest'
import { weekStart } from '@/lib/overtime'
import { as, req, json, prisma, freshWorld } from './harness'
import { matchInvoice } from '@/lib/invoice-match'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { GET as readInvoice } from '@/app/api/invoices/[id]/route'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { POST as withdrawBill } from '@/app/api/invoices/[id]/withdraw/route'
import { generateBill } from '@/lib/money/bill-generate'
import { POST as acceptExpense } from '@/app/api/expenses/[id]/accept/route'
import { GET as listExpenses } from '@/app/api/expenses/route'
import { POST as expenseActions } from '@/app/api/expenses/actions/route'
import { legsFor } from '@/lib/money/expense-acceptance-read'
import { POST as recordPayment } from '@/app/api/invoices/[id]/payments/route'
import { GET as receiptOptions } from '@/app/api/ap/receipts/options/route'
import { ladderFor } from '@/lib/work-chain-read'
import { descend } from '@/lib/work-chain'

/**
 * The week Northbend Athletic's desk signed at time and a half, as far as the document.
 *
 * Omar Haddad worked forty-five hours at $132 an hour for Brightmoor on
 * Northbend Athletic's site. Five of those hours were over the line and the desk that
 * signs the week chose the contract's time and a half, so the invoice is
 * $6,270 — and forty-five times $132 is $5,940.
 *
 * Both numbers are right, which is the whole problem: a line that prints
 * one beside the other cannot be checked by the person paying it, and
 * being checkable is the only reason an invoice line exists. This walks
 * it against a real database from the decision to what the screen is
 * handed.
 *
 * The decision is written here rather than clicked, because how a week
 * gets answered belongs to the approval desk and this is about what
 * happens to the money afterwards.
 */

const D = '@demo.etyme.local'
const BRIGHTMOOR = `world-brightmoor${D}`
const CS = `world-computer-systems${D}`
const TECHPEPLE = `world-techpeple${D}`

const it_: Record<string, any> = {}

describe('a week signed at a premium, as far as the invoice', () => {
  beforeAll(async () => {
    await freshWorld()

    const contract = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: 'Omar Haddad' }, overtimeAfterHours: { not: null }, state: 'IN_PROGRESS' },
      select: {
        id: true, billRate: true, companyId: true, clientCompanyId: true,
        engagementId: true, overtimeAfterHours: true, overtimeMultiplierBps: true,
      },
    })

    const sheet = await prisma.timesheet.findFirstOrThrow({
      where: { sellContractId: contract.id, totalHours: 45 },
      select: { id: true, days: true, periodStart: true, periodEnd: true, personId: true },
    })

    // The Sunday the week began, the key every reader of a week looks it up by.
    const weekOf = weekStart(Object.keys(sheet.days as Record<string, number>).sort()[0])
    // Northbend Athletic's hiring manager, the desk that signs Omar's week.
    const signer = await prisma.person.findFirstOrThrow({
      where: { name: 'Marcus Oyelaran' },
      select: { id: true },
    })

    // The desk that signs the week says: the contract's time and a half.
    await prisma.overtimeDecision.create({
      data: {
        timesheetId: sheet.id, sellContractId: contract.id,
        weekOf: new Date(`${weekOf}T00:00:00.000Z`),
        treatment: 'PREMIUM', overtimeHours: 5,
        afterHours: contract.overtimeAfterHours!,
        multiplierBps: contract.overtimeMultiplierBps,
        appliedBps: contract.overtimeMultiplierBps,
        decidedById: signer.id, decidedByCompanyId: contract.clientCompanyId,
        reason: 'Release weekend.',
      },
    })

    await prisma.timesheet.update({
      where: { id: sheet.id },
      data: { status: 'APPROVED', clientApprovedById: signer.id, clientApprovedAt: new Date() },
    })
    await prisma.workAssertion.create({
      data: {
        timesheetId: sheet.id, companyId: contract.clientCompanyId,
        role: 'CLIENT_APPROVAL', hours: 45, rateCents: contract.billRate, state: 'LIVE',
        byId: signer.id,
      },
    })

    it_.contract = contract
    it_.sheet = sheet
    it_.weekOf = weekOf
  }, 240_000)

  // A draft is the firm's working paper (release walk, 2026-10-18): the
  // supplier's twin drafts, a person sends or withdraws. Until it is sent
  // the week's answer is not history.
  const draftIt = async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: it_.contract.companyId }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: it_.contract.engagementId }, { status: 'DRAFT' })
    expect(made.ok && made.status === 201, JSON.stringify((made as any).body)).toBe(true)
    return (made as { invoiceId: string }).invoiceId
  }
  const decisionBilledAt = async () =>
    (await prisma.overtimeDecision.findFirstOrThrow({ where: { timesheetId: it_.sheet.id }, select: { billedAt: true } })).billedAt

  it('a draft over the decided week leaves the decision open, and withdrawing the draft leaves the week to bill again', async () => {
    const draftId = await draftIt()
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draftId, timesheetId: it_.sheet.id } })).toBe(1)
    expect(await decisionBilledAt()).toBeNull()

    as(BRIGHTMOOR)
    const out = await json(await withdrawBill(
      req('POST', `/api/invoices/${draftId}/withdraw`, { reason: 'Priced before the client asked a question about the weekend.' }),
      { params: Promise.resolve({ id: draftId }) }
    ))
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect(await prisma.invoice.findUnique({ where: { id: draftId } })).toBeNull()
    expect(await prisma.invoiceLine.count({ where: { timesheetId: it_.sheet.id } })).toBe(0)
    expect(await decisionBilledAt()).toBeNull()
    // Who withdrew it and why, on the trail.
    const trail = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'INVOICE_DRAFT_WITHDRAWN', payload: { path: ['invoiceId'], equals: draftId } },
    })
    expect(trail.reason).toContain('Priced before the client asked a question about the weekend.')
  })

  it('the decision is stamped billed when the drafted bill is sent, not when it was drafted', async () => {
    const draftId = await draftIt()
    expect(await decisionBilledAt()).toBeNull()
    as(BRIGHTMOOR)
    const out = await json(await sendBill(req('POST', `/api/invoices/${draftId}/submit`, {}), { params: Promise.resolve({ id: draftId }) }))
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect(out.body.data.invoice.status).toBe('SUBMITTED')
    expect(await decisionBilledAt()).not.toBeNull()
    it_.invoiceId = draftId
  })

  it('a sent bill cannot be withdrawn, and says it is corrected with a credit note', async () => {
    as(BRIGHTMOOR)
    const out = await json(await withdrawBill(
      req('POST', `/api/invoices/${it_.invoiceId}/withdraw`, { reason: 'Too late.' }),
      { params: Promise.resolve({ id: it_.invoiceId }) }
    ))
    expect(out.status).toBe(409)
    expect(out.body.error.message).toContain('has been sent, so it cannot be withdrawn')
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: it_.invoiceId } })).status).toBe('SUBMITTED')
  })

  it('the invoice bills the week at what the desk decided: $5,280 of ordinary hours and $990 of overtime', async () => {
    // The bill sent above is the one the Bills page would have raised;
    // asked again, the Bills page finds the week already billed.
    as(BRIGHTMOOR)
    const again = await json(
      await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.contract.engagementId }))
    )
    expect(again.status).toBe(422)

    const line = await prisma.invoiceLine.findFirstOrThrow({
      where: { invoiceId: it_.invoiceId, timesheetId: it_.sheet.id },
    })
    expect(Number(line.hours)).toBe(45)
    expect(line.rateCents).toBe(13_200)
    expect(line.amountCents).toBe(627_000)
  })

  it('the decision is stamped billed the moment it reaches the invoice, and can no longer be changed', async () => {
    const decision = await prisma.overtimeDecision.findFirstOrThrow({
      where: { timesheetId: it_.sheet.id },
      select: { billedAt: true, appliedBps: true },
    })
    expect(decision.billedAt).not.toBeNull()
    expect(decision.appliedBps).toBe(15_000)
  })

  it('the line the screen is handed shows its working, and the working adds up to the amount charged', async () => {
    as(BRIGHTMOOR)
    const r = await json(
      await readInvoice(req('GET', `/api/invoices/${it_.invoiceId}`), {
        params: Promise.resolve({ id: it_.invoiceId }),
      })
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)

    const line = r.body.data.lines.find((l: any) => l.amount === 6270)
    expect(line, JSON.stringify(r.body.data.lines)).toBeTruthy()

    // What a person reads under the amount: two bands, each of which
    // multiplies out on its own.
    expect(line.bands.map((b: any) => [b.hours, b.rate, b.amount, b.says])).toEqual([
      [40, 132, 5280, 'at the usual rate'],
      [5, 198, 990, 'overtime, at time and a half'],
    ])
    for (const b of line.bands) expect(Math.round(b.hours * b.rate * 100) / 100).toBe(b.amount)
    expect(line.bands.reduce((n: number, b: any) => n + b.amount, 0)).toBe(line.amount)

    // And the document itself says it, for the desk that files the PDF
    // rather than opening this screen.
    expect(line.description).toContain('40h at the usual rate, 5h overtime, at time and a half')
  })

  it('the three-way match adds up the premium the desk signed instead of calling the line bad arithmetic', async () => {
    const match = await matchInvoice(it_.invoiceId)
    const extension = match!.checks.find((c) => c.code === 'EXTENSION')!
    expect(extension.outcome, extension.reason).toBe('PASS')
    const header = match!.checks.find((c) => c.code === 'HEADER_TOTAL')!
    expect(header.outcome, header.reason).toBe('PASS')
  })
})

/**
 * Below the top of a chain, the founder's rule of 2026-10-19: a
 * sub-vendor's overtime is priced on the decision the client made when it
 * signed the week, at the pair's own rate.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by Techpeple. Northbend signs a forty-five hour week and
 * decides, on its own leg, that the five over its line of forty are worth
 * double time to it. Computer Systems' bill to Northbend carries that
 * double time; Techpeple's bill to Computer Systems carries the same five
 * hours at the multiplier on Techpeple's own contract with Computer
 * Systems — never Northbend's.
 */
describe('a sub-vendor’s bill sent on the platform prices the overtime the client decided, at its own contract’s rate', () => {
  const h: Record<string, any> = {}

  beforeAll(async () => {
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const first = await prisma.timesheet.findFirstOrThrow({ where: { personId: helena.id }, orderBy: { periodStart: 'asc' } })
    const cs = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
    const techpeple = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' } })
    const hoursLeg = await prisma.sellContract.findUniqueOrThrow({ where: { id: first.sellContractId } })
    const top = await prisma.sellContract.findFirstOrThrow({ where: { personId: helena.id, companyId: cs.id } })
    // Northbend's line with Computer Systems is forty hours.
    await prisma.sellContract.update({ where: { id: top.id }, data: { overtimeAfterHours: 40 } })

    const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
    // A week before the earliest on the record that lies wholly inside one
    // month, so each bill is for that week alone.
    let back = -14
    while (plus(first.periodStart, back).getUTCMonth() !== plus(first.periodEnd, back).getUTCMonth()) back -= 7
    const days: Record<string, number> = {}
    for (let i = 1; i <= 5; i++) days[plus(first.periodStart, back + i).toISOString().slice(0, 10)] = 9
    const sheet = await prisma.timesheet.create({
      data: {
        sellContractId: hoursLeg.id, personId: helena.id,
        periodStart: plus(first.periodStart, back), periodEnd: plus(first.periodEnd, back),
        days, totalHours: 45, status: 'APPROVED', submittedAt: new Date(), approvedAt: new Date(),
      },
    })
    const signer = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran' }, select: { id: true } })
    for (const [companyId, role, rateCents] of [
      [top.clientCompanyId, 'CLIENT_APPROVAL', top.billRate],
      [cs.id, 'PASS_THROUGH', hoursLeg.billRate],
      [techpeple.id, 'EMPLOYER_ACCEPTANCE', hoursLeg.billRate],
    ] as const) {
      await prisma.workAssertion.create({ data: { timesheetId: sheet.id, companyId, role, hours: 45, rateCents, state: 'LIVE', byId: signer.id } })
    }
    await prisma.overtimeDecision.create({
      data: {
        timesheetId: sheet.id, sellContractId: top.id, weekOf: new Date(`${weekStart(Object.keys(days).sort()[0])}T00:00:00.000Z`),
        treatment: 'PREMIUM', overtimeHours: 5, afterHours: 40, multiplierBps: 15_000, appliedBps: 20_000,
        decidedById: signer.id, decidedByCompanyId: top.clientCompanyId, reason: 'Cut-over weekend, double time agreed.',
      },
    })
    Object.assign(h, { sheet, hoursLeg, top })
  }, 240_000)

  const billFor = async (who: string, engagementId: string) => {
    as(who)
    const made = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId,
      periodStart: h.sheet.periodStart.toISOString().slice(0, 10),
      periodEnd: h.sheet.periodEnd.toISOString().slice(0, 10),
    })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    return prisma.invoiceLine.findFirstOrThrow({ where: { timesheetId: h.sheet.id, sellContractId: who === TECHPEPLE ? h.hoursLeg.id : h.top.id } })
  }

  it('Techpeple’s bill to Computer Systems carries the five hours Northbend decided, at Techpeple’s own multiplier, and the three-way check passes it', async () => {
    const line = await billFor(TECHPEPLE, h.hoursLeg.engagementId)
    const rate = h.hoursLeg.billRate
    const premium = Math.round((5 * rate * (h.hoursLeg.overtimeMultiplierBps - 10_000)) / 10_000)
    expect(Number(line.hours)).toBe(45)
    expect(line.amountCents).toBe(45 * rate + premium)
    // Not Northbend's double time.
    expect(line.amountCents).not.toBe(45 * rate + 5 * rate)
    const match = await matchInvoice(line.invoiceId)
    const extension = match!.checks.find((c) => c.code === 'EXTENSION')!
    expect(extension.outcome, extension.reason).toBe('PASS')
  })

  it('Computer Systems’ bill to Northbend is still priced at the double time Northbend chose on its own leg', async () => {
    const line = await billFor(CS, h.top.engagementId)
    const rate = h.top.billRate
    expect(Number(line.hours)).toBe(45)
    expect(line.amountCents).toBe(45 * rate + 5 * rate)
    const extension = (await matchInvoice(line.invoiceId))!.checks.find((c) => c.code === 'EXTENSION')!
    expect(extension.outcome, extension.reason).toBe('PASS')
  })
})

/**
 * An expense is accepted like a week (the founder, 2026-10-19).
 *
 * Omar Haddad, Brightmoor's, on Northbend Athletic's site. Brightmoor
 * approves his flight to reimburse him; Northbend, which pays for it,
 * accepts it before it is billed, and the bill carries what Northbend
 * accepted — never what Omar claimed.
 */
describe('an expense on Brightmoor’s bill to Northbend is the amount Northbend accepted', () => {
  const x: Record<string, any> = {}
  const NIKE_HIRING = `world-nike-hiring${D}`
  const plan = async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: it_.contract.companyId }, select: { id: true, name: true, kind: true } })
    return generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: it_.contract.engagementId }, { dryRun: true })
  }
  /** What was left off, said either on the plan or in the refusal where nothing else is left to bill. */
  const leftOffSays = (made: any): string => (made.ok ? made.planned.heldBack ?? '' : made.body.error.message ?? '')
  const raise = (category: string, total: number) =>
    prisma.expense.create({
      data: {
        companyId: it_.contract.companyId, sellContractId: it_.contract.id, personId: it_.sheet.personId,
        category, billable: true, description: `${category} for the release weekend`,
        periodStart: it_.sheet.periodStart, periodEnd: it_.sheet.periodStart, items: [], total,
        status: 'APPROVED', approvedAt: new Date(),
      },
    })

  beforeAll(async () => {
    x.flight = (await raise('TRAVEL', 412.5)).id
  })

  it('an expense Northbend has not accepted is left off the bill with a sentence', async () => {
    const made = await plan()
    expect(leftOffSays(made)).toMatch(/Omar Haddad’s travel expense of [A-Z][a-z]+ \d+, \d{4} is not on this bill: Northbend Athletic has not accepted it yet\./)
  })

  it('a bill carries the expense at the amount the firm above accepted, never the amount the worker claimed', async () => {
    as(NIKE_HIRING)
    const a = await json(await acceptExpense(
      req('POST', `/api/expenses/${x.flight}/accept`, { decision: 'accept', amountCents: 38_000, reason: 'Economy fare is $380 on this route.' }),
      { params: Promise.resolve({ id: x.flight }) }
    ))
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: it_.contract.companyId }, select: { id: true, name: true, kind: true } })
    const made = await generateBill({ company, person: { id: null, name: 'Ask Etyme' } }, { engagementId: it_.contract.engagementId }, { status: 'DRAFT' })
    expect(made.ok && made.status === 201, JSON.stringify((made as any).body)).toBe(true)
    const draftId = (made as { invoiceId: string }).invoiceId
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: draftId, expenseId: x.flight } })
    expect(line.amountCents).toBe(38_000)
    expect(line.description).toContain('(accepted $380.00 of $412.50)')
    // The three-way check's receipt for it is Northbend's acceptance.
    const m = await matchInvoice(draftId)
    expect(m!.checks.find((c) => c.code === 'RECEIPT')!.outcome, JSON.stringify(m!.checks)).toBe('PASS')

    // Withdrawn, so the rest of the walk reads the world as it was.
    as(BRIGHTMOOR)
    const out = await json(await withdrawBill(
      req('POST', `/api/invoices/${draftId}/withdraw`, { reason: 'Checking the expense line only.' }),
      { params: Promise.resolve({ id: draftId }) }
    ))
    expect(out.status, JSON.stringify(out.body)).toBe(200)
  })

  it('an expense of a kind the agreement does not list is left off the bill with a sentence naming the agreement', async () => {
    const leg = (await legsFor([it_.contract.id])).get(it_.contract.id)!
    expect(leg.agreement, 'Brightmoor and Northbend trade under an agreement').toBeTruthy()
    await prisma.masterAgreement.update({ where: { id: leg.agreement!.id }, data: { billableExpenseKinds: ['TRAVEL'], billableExpenseKindsSaid: true } })
    try {
      const course = (await raise('TRAINING', 600)).id
      const made = await plan()
      expect(leftOffSays(made)).toContain(
        `Omar Haddad’s training expense is not on this bill: The agreement between ${leg.agreement!.clientName} and ${leg.agreement!.vendorName} does not list training expenses as billable, so Northbend Athletic does not pay for this one.`
      )
      // And Northbend has nothing to accept on it.
      as(NIKE_HIRING)
      const a = await json(await acceptExpense(req('POST', `/api/expenses/${course}/accept`, { decision: 'accept' }), { params: Promise.resolve({ id: course }) }))
      expect(a.status).toBe(422)
      expect(a.body.error.code).toBe('NOT_BILLABLE')
    } finally {
      await prisma.masterAgreement.update({ where: { id: leg.agreement!.id }, data: { billableExpenseKinds: [], billableExpenseKindsSaid: false } })
    }
  })
})

/**
 * The expenses page, on the same world: each firm reads where an
 * expense stands in its own words, and the firm whose turn it is
 * accepts it on the row, through the one route that records it.
 */
describe('the expenses page reads each expense as the firm reading it, and the AP clerk accepts on the row', () => {
  const AP = `world-nike-ap${D}`
  const x: Record<string, any> = {}
  const list = async () => {
    const r = await json(await listExpenses(req('GET', '/api/expenses?limit=100')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return r.body.data.expenses as any[]
  }
  const raise = (line: { id: string; companyId: string; personId: string }, category: string, total: number, billable = true) =>
    prisma.expense.create({
      data: {
        companyId: line.companyId, sellContractId: line.id, personId: line.personId,
        category, billable, description: `${category} for the expenses page`,
        periodStart: it_.sheet.periodStart, periodEnd: it_.sheet.periodStart, items: [], total,
        status: 'APPROVED', approvedAt: new Date(),
      },
    })

  beforeAll(async () => {
    x.omarLine = { id: it_.contract.id, companyId: it_.contract.companyId, personId: it_.sheet.personId }
    x.leg = (await legsFor([it_.contract.id])).get(it_.contract.id)!
    x.hotel = (await raise(x.omarLine, 'TRAVEL', 275)).id
  })

  it('the AP clerk accepts a waiting expense from the expenses page, and the row then reads accepted with the amount', async () => {
    as(AP)
    const before = (await list()).find((e) => e.id === x.hotel)
    expect(before, 'Northbend’s list does not show Brightmoor’s approved expense').toBeTruthy()
    expect(before.chain).toMatchObject({ state: 'YOURS', upToCents: 27_500, line: `Approved by ${x.leg.sellerName} · waiting on you` })
    expect(before.client).toMatchObject({ name: x.leg.sellerName, role: 'SUPPLIER' })

    const a = await json(await acceptExpense(req('POST', `/api/expenses/${x.hotel}/accept`, { decision: 'accept' }), { params: Promise.resolve({ id: x.hotel }) }))
    expect(a.status, JSON.stringify(a.body)).toBe(200)

    const after = (await list()).find((e) => e.id === x.hotel)
    expect(after.chain).toMatchObject({ state: 'ACCEPTED', upToCents: null, line: `Approved by ${x.leg.sellerName} · accepted by you $275.00` })
  })

  it('the employer cannot reject an expense a firm above has accepted', async () => {
    as(BRIGHTMOOR)
    const r = await json(await expenseActions(req('POST', '/api/expenses/actions', { action: 'reject', expenseIds: [x.hotel], reason: 'Changed our mind.' })))
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ACCEPTED_ABOVE')
    expect(r.body.error.message).toMatch(
      new RegExp(`^Omar Haddad’s travel expense of [A-Z][a-z]+ \\d+, \\d{4} cannot be rejected, because ${x.leg.payerName} accepted \\$275\\.00 of it on [A-Z][a-z]+ \\d+, \\d{4}\\.$`)
    )
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: x.hotel } })).status).toBe('APPROVED')
    // And the employer's own row reads the acceptance.
    const mine = (await list()).find((e) => e.id === x.hotel)
    expect(mine.chain.line).toBe(`Approved by you · accepted by ${x.leg.payerName} $275.00`)
    expect(mine.client).toMatchObject({ name: x.leg.payerName, role: 'CLIENT' })
  })

  it('a client’s expenses page reads billable kinds from the agreement, not the supplier’s flag', async () => {
    expect(x.leg.agreement, 'Brightmoor and Northbend trade under an agreement').toBeTruthy()
    await prisma.masterAgreement.update({ where: { id: x.leg.agreement.id }, data: { billableExpenseKinds: ['TRAVEL'], billableExpenseKindsSaid: true } })
    try {
      // Brightmoor marked the cab its own cost; the agreement bills travel.
      const cab = (await raise(x.omarLine, 'TRAVEL', 48, false)).id
      // Brightmoor marked the dinner billable; the agreement does not list meals.
      const dinner = (await raise(x.omarLine, 'MEALS', 62, true)).id
      as(AP)
      const rows = await list()
      expect(rows.find((e) => e.id === cab)).toMatchObject({ billable: true, chain: { state: 'YOURS', upToCents: 4_800 } })
      expect(rows.find((e) => e.id === dinner)).toMatchObject({
        billable: false,
        chain: {
          state: 'NOT_BILLABLE', upToCents: null,
          notBillableSays: `The agreement between ${x.leg.agreement.clientName} and ${x.leg.agreement.vendorName} does not list meals expenses as billable, so ${x.leg.payerName} does not pay for this one.`,
        },
      })
    } finally {
      await prisma.masterAgreement.update({ where: { id: x.leg.agreement.id }, data: { billableExpenseKinds: [], billableExpenseKindsSaid: false } })
    }
  })

  it('a middle firm’s list shows its supplier’s expense on a line it pays, and the client’s names nobody below its own supplier', async () => {
    // Helena Marsh: Northbend Athletic ← Computer Systems ← Techpeple, who employs her.
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: 'Helena Marsh' }, company: { slug: 'world-techpeple' } },
      select: { id: true, companyId: true, personId: true, company: { select: { name: true } }, clientCompany: { select: { name: true } } },
    })
    const flight = (await raise(line, 'TRAVEL', 412.5)).id

    as(CS)
    const mid = (await list()).find((e) => e.id === flight)
    expect(mid, 'Computer Systems’ list does not show its supplier’s expense').toBeTruthy()
    expect(mid.client).toMatchObject({ name: line.company.name, role: 'SUPPLIER' })
    expect(mid.chain).toMatchObject({ state: 'WAITING', upToCents: null, line: `Approved by ${line.company.name} · waiting on ${x.leg.payerName}` })

    as(AP)
    const top = (await list()).find((e) => e.id === flight)
    expect(top, 'Northbend’s list does not show the expense on its site').toBeTruthy()
    expect(top.client).toMatchObject({ name: line.clientCompany.name, role: 'SUPPLIER' })
    expect(top.chain.line).toBe('Approved by the employer · waiting on you')
    expect(JSON.stringify(top)).not.toContain(line.company.name)
  })
})

/**
 * A firm in the middle of a chain bills its client for an expense
 * (the founder, 2026-10-19, decision 1, and the unique the architect
 * relaxed to (expenseId, sellContractId) the same day).
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by Techpeple. Techpeple approves her $250 train fare to
 * reimburse her; Northbend accepts it, then Computer Systems. Techpeple
 * bills it to Computer Systems and Computer Systems bills it to
 * Northbend, each on its own line, each matched against its own payer's
 * acceptance; Northbend pays Computer Systems and Computer Systems pays
 * Techpeple. The expense's own status is Techpeple's rung's; every rung
 * above reads billed and paid from its own lines.
 */
describe('Helena Marsh’s train fare is billed up the chain a rung at a time and paid down it', () => {
  const NIKE_HIRING = `world-nike-hiring${D}`
  const NIKE_AP = `world-nike-ap${D}`
  const w: Record<string, any> = {}
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  const day = (d: Date) => d.toISOString().slice(0, 10)

  const billFor = async (who: string, engagementId: string) => {
    as(who)
    return json(await generateInvoice(req('POST', '/api/invoices/generate', { engagementId, periodStart: w.day, periodEnd: w.day })))
  }
  const send = async (who: string, id: string) => {
    const bill = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { status: true } })
    if (bill.status === 'SUBMITTED') return
    as(who)
    const r = await json(await sendBill(req('POST', `/api/invoices/${id}/submit`, {}), params(id)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  }
  const pay = async (who: string, id: string) => {
    const bill = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { total: true } })
    as(who)
    return json(await recordPayment(req('POST', `/api/invoices/${id}/payments`, { amount: Number(bill.total), method: 'ACH', reference: `PAY-${id.slice(-4)}` }), params(id)))
  }
  const rowAs = async (who: string) => {
    as(who)
    const r = await json(await listExpenses(req('GET', '/api/expenses?limit=100')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return (r.body.data.expenses as any[]).find((e) => e.id === w.train)
  }

  beforeAll(async () => {
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const tpLine = await prisma.sellContract.findFirstOrThrow({ where: { personId: helena.id, company: { slug: 'world-techpeple' } } })
    const csLine = await prisma.sellContract.findFirstOrThrow({ where: { personId: helena.id, company: { slug: 'world-computer-systems' } } })
    // A day no week is filed on under either firm's engagement, so each bill is for the train fare alone.
    const lines = await prisma.sellContract.findMany({ where: { engagementId: { in: [tpLine.engagementId, csLine.engagementId].filter((x): x is string => !!x) } }, select: { id: true } })
    const rungs = await ladderFor(lines.map((l) => l.id))
    const under = [...new Set(lines.flatMap((l) => descend(l.id, rungs)))]
    const earliest = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: { in: under } }, orderBy: { periodStart: 'asc' } })
    let d = new Date(earliest.periodStart.getTime() - 86_400_000)
    for (let i = 0; i < 400; i++, d = new Date(d.getTime() - 86_400_000)) {
      const busy = await prisma.timesheet.count({ where: { sellContractId: { in: under }, periodStart: { lte: d }, periodEnd: { gte: d } } })
      const spent = await prisma.expense.count({ where: { sellContractId: { in: under }, periodStart: { lte: d }, periodEnd: { gte: d } } })
      if (busy + spent === 0) break
    }
    const train = await prisma.expense.create({
      data: {
        companyId: tpLine.companyId, sellContractId: tpLine.id, personId: helena.id, category: 'TRAVEL', billable: true,
        description: 'Train to the Tualatin site for the cut-over', periodStart: d, periodEnd: d, items: [], total: 250,
        status: 'APPROVED', approvedAt: new Date(),
      },
    })
    Object.assign(w, { train: train.id, tpLine, csLine, day: day(d) })

    // Northbend accepts it first, then Computer Systems.
    for (const who of [NIKE_HIRING, CS]) {
      as(who)
      const a = await json(await acceptExpense(req('POST', `/api/expenses/${w.train}/accept`, { decision: 'accept' }), params(w.train)))
      expect(a.status, `${who}: ${JSON.stringify(a.body)}`).toBe(200)
    }
  }, 240_000)

  it('the employer’s bill of the same expense to the middle firm is a separate line and both pass their own check', async () => {
    // Before Techpeple bills it here, Computer Systems' invoice receipt form offers it, at what Computer Systems accepted.
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: w.csLine.companyId, vendorCompanyId: w.tpLine.companyId, candidates: { some: { personId: w.tpLine.personId } } },
    })
    const offered = async () => {
      as(CS)
      const r = await json(await receiptOptions(req('GET', `/api/ap/receipts/options?buyContractId=${buy.id}`)))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return (r.body.data.expenses as any[]).find((x) => x.id === w.train) ?? null
    }
    expect(await offered()).toMatchObject({ amountMinor: 25_000 })

    const tp = await billFor(TECHPEPLE, w.tpLine.engagementId)
    expect(tp.status, JSON.stringify(tp.body)).toBe(201)
    const tpLine = await prisma.invoiceLine.findFirstOrThrow({ where: { expenseId: w.train, sellContractId: w.tpLine.id } })
    expect(tpLine.amountCents).toBe(25_000)
    // Techpeple's own bill is the employer's rung: the expense's column names it.
    expect(await prisma.expense.findUniqueOrThrow({ where: { id: w.train } })).toMatchObject({ status: 'INVOICED', invoiceId: tpLine.invoiceId })
    w.tpBill = tpLine.invoiceId

    const cs = await billFor(CS, w.csLine.engagementId)
    expect(cs.status, JSON.stringify(cs.body)).toBe(201)
    const lines = await prisma.invoiceLine.findMany({ where: { expenseId: w.train }, orderBy: { createdAt: 'asc' } })
    expect(lines.map((l) => l.sellContractId)).toEqual([w.tpLine.id, w.csLine.id])
    w.csBill = lines[1].invoiceId

    await send(TECHPEPLE, w.tpBill)
    await send(CS, w.csBill)
    // Sent here, it is not offered to be typed in a second time.
    expect(await offered()).toBeNull()
    for (const id of [w.tpBill, w.csBill]) {
      const m = (await matchInvoice(id))!
      for (const code of ['RECEIPT', 'DUPLICATE']) {
        expect(m.checks.find((c) => c.code === code)!.outcome, `${code}: ${JSON.stringify(m.checks)}`).toBe('PASS')
      }
    }
  })

  it('a firm in the middle bills its client for an expense at what the client accepted, on its own line, once', async () => {
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: w.csBill, expenseId: w.train } })
    expect(line).toMatchObject({ sellContractId: w.csLine.id, amountCents: 25_000, timesheetId: null })
    // What Northbend reads names Helena and the fare, never the firm below Computer Systems.
    expect(line.description).toBe('Helena Marsh — Travel expense: Train to the Tualatin site for the cut-over')
    const bill = await prisma.invoice.findUniqueOrThrow({ where: { id: w.csBill }, select: { total: true, workOrderId: true } })
    expect(Number(bill.total)).toBe(250)
    // Drawn on the order Computer Systems' line is on, as any bill on that line is.
    expect(bill.workOrderId).toBe(w.csLine.workOrderId)
    // Billing it on Computer Systems' line does not move Techpeple's column.
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: w.train } })).invoiceId).toBe(w.tpBill)
    // Once: a second run finds nothing left to bill.
    const again = await billFor(CS, w.csLine.engagementId)
    expect(again.status, JSON.stringify(again.body)).toBe(422)
    expect(await prisma.invoiceLine.count({ where: { expenseId: w.train, sellContractId: w.csLine.id } })).toBe(1)
  })

  it('a rung reads an expense as billed or paid only from its own line, never from a rung below', async () => {
    const csNumber = (await prisma.invoice.findUniqueOrThrow({ where: { id: w.csBill } })).number
    const tpNumber = (await prisma.invoice.findUniqueOrThrow({ where: { id: w.tpBill } })).number

    // Northbend pays Computer Systems. Techpeple has not been paid, and its column says so.
    const nb = await pay(NIKE_AP, w.csBill)
    expect(nb.status, JSON.stringify(nb.body)).toBeLessThan(300)
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: w.train } })).status).toBe('INVOICED')

    const top = await rowAs(NIKE_AP)
    expect(top.status).toBe('PAID')
    expect(top.chain.line).toBe(`Approved by the employer · accepted by you $250.00 · accepted by Computer Systems Inc $250.00 · billed to you on ${csNumber}, paid`)
    expect(JSON.stringify(top)).not.toContain(tpNumber)
    expect(JSON.stringify(top)).not.toContain('Techpeple')

    const mid = await rowAs(CS)
    expect(mid.status).toBe('PAID')
    expect(mid.chain.line).toContain(`billed to you on ${tpNumber}`)
    expect(mid.chain.line).toContain(`billed to Northbend Athletic on ${csNumber}, paid`)
    expect(mid.chain.line).not.toContain(`${tpNumber}, paid`)

    const bottom = await rowAs(TECHPEPLE)
    expect(bottom.status).toBe('INVOICED')
    expect(bottom.chain.line).toContain(`billed to Computer Systems Inc on ${tpNumber}`)
    expect(bottom.chain.line).not.toContain(csNumber)

    // Computer Systems pays Techpeple: now the employer's rung is paid too.
    const paid = await pay(CS, w.tpBill)
    expect(paid.status, JSON.stringify(paid.body)).toBeLessThan(300)
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: w.train } })).status).toBe('PAID')
    expect((await rowAs(TECHPEPLE)).chain.line).toContain(`billed to Computer Systems Inc on ${tpNumber}, paid`)
    // And the client's own reading did not move with it.
    expect((await rowAs(NIKE_AP)).chain.line).not.toContain(tpNumber)
  })
})
