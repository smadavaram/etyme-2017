import { describe, it, expect, beforeAll } from 'vitest'
import { weekStart } from '@/lib/overtime'
import { as, req, json, prisma, freshWorld } from './harness'
import { matchInvoice } from '@/lib/invoice-match'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { GET as readInvoice } from '@/app/api/invoices/[id]/route'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { POST as withdrawBill } from '@/app/api/invoices/[id]/withdraw/route'
import { generateBill } from '@/lib/money/bill-generate'

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
      where: { action: 'REVERSAL', payload: { path: ['invoiceId'], equals: draftId } },
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
