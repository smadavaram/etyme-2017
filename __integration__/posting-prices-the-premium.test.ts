import { describe, it, expect, beforeAll } from 'vitest'
import { weekStart } from '@/lib/overtime'
import { prisma, freshWorld } from './harness'
import { planAssertion } from '@/lib/order-postings'
import { generateBill } from '@/lib/money/bill-generate'

/**
 * The order's posting at the client's signature prices the week the way
 * its bill does. Measured on the seeded world: Omar Haddad's 45-hour week
 * at Brightmoor, $132 an hour, five hours over the line signed at time
 * and a half. Before, the posting read 45 × $132 = $5,940 and the bill
 * $6,270; now both read $6,270.
 */
describe('a premium week posts what it bills', () => {
  let assertionId = ''
  let sheetId = ''
  let decisionId = ''
  let contract: { id: string; companyId: string; engagementId: string | null; billRate: number }
  let company = ''

  beforeAll(async () => {
    await freshWorld()
    const c = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: 'Omar Haddad' }, overtimeAfterHours: { not: null }, state: 'IN_PROGRESS' },
      select: { id: true, billRate: true, companyId: true, clientCompanyId: true, engagementId: true, overtimeAfterHours: true, overtimeMultiplierBps: true, company: { select: { name: true } } },
    })
    contract = c
    company = c.company.name
    const sheet = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: c.id, totalHours: 45 }, select: { id: true, days: true } })
    sheetId = sheet.id
    const weekOf = weekStart(Object.keys(sheet.days as Record<string, number>).sort()[0])
    const signer = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran' }, select: { id: true } })
    decisionId = (await prisma.overtimeDecision.create({
      data: {
        timesheetId: sheet.id, sellContractId: c.id, weekOf: new Date(`${weekOf}T00:00:00.000Z`),
        treatment: 'PREMIUM', overtimeHours: 5, afterHours: c.overtimeAfterHours!,
        multiplierBps: c.overtimeMultiplierBps, appliedBps: c.overtimeMultiplierBps,
        decidedById: signer.id, decidedByCompanyId: c.clientCompanyId, reason: 'Release weekend.',
      },
    })).id
    await prisma.timesheet.update({ where: { id: sheet.id }, data: { status: 'APPROVED', clientApprovedById: signer.id, clientApprovedAt: new Date() } })
    assertionId = (await prisma.workAssertion.create({
      data: { timesheetId: sheet.id, companyId: c.clientCompanyId, role: 'CLIENT_APPROVAL', hours: 45, rateCents: c.billRate, state: 'LIVE', byId: signer.id },
    })).id
  }, 240_000)

  const revenue = async () => {
    const plan = await planAssertion(assertionId)
    return plan!.planned.find((p) => p.kind === 'REVENUE' && p.ownSellContractId === contract.id)!
  }

  it('the posting at the client’s signature is the bill’s figure for a week signed at a premium: $6,270, not $5,940', async () => {
    const r = await revenue()
    expect(contract.billRate).toBe(13_200)
    expect(r.amountCents).toBe(627_000)
    expect(r.says).toMatch(/5 of them overtime at 1\.5 times, as the bill prices it\.$/)

    const bill = await generateBill(
      { company: { id: contract.companyId, name: company }, person: { id: null, name: 'measure' } },
      { engagementId: contract.engagementId },
      { dryRun: true },
    )
    expect(bill.ok).toBe(true)
    const week = bill.ok ? bill.planned.weeks.find((w) => w.timesheetId === sheetId) : null
    expect(week?.amountMinor).toBe(r.amountCents)
  })

  it('the same week with no decision posts at straight time, the figure every premium week used to post', async () => {
    await prisma.overtimeDecision.delete({ where: { id: decisionId } })
    expect((await revenue()).amountCents).toBe(45 * 13_200)
  })
})
