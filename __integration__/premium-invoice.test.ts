import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { matchInvoice } from '@/lib/invoice-match'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { GET as readInvoice } from '@/app/api/invoices/[id]/route'

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
    await resetDatabase()
    await seedWorld()

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

    const weekOf = Object.keys(sheet.days as Record<string, number>).sort()[0]
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

  it('the invoice bills the week at what the desk decided: $5,280 of ordinary hours and $990 of overtime', async () => {
    as(BRIGHTMOOR)
    const r = await json(
      await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.contract.engagementId }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.invoiceId = r.body.data.invoice.id

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
