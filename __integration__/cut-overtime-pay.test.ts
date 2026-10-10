import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { writeCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'

/**
 * The default for a cut week, through the real run, the payroll screen
 * and the payroll file — and the pay days a monthly run marks done.
 *
 * The founder, 2026-09-30: overtime only on the accepted hours above the
 * line is the default. Leila Farouk's line has nothing chosen on it:
 *
 *   week of 6 July    45 worked, 42 accepted → 40 ordinary and 2 overtime
 *   week of 13 July   45 worked, 41 accepted → 40 ordinary and 1 overtime
 *   weeks of 20 and 27 July, 40 worked and accepted
 *
 * Her employer pays monthly, nine days after the month ends
 * (DEMO_MONTHLY_PAY): July's pay day is Friday 7 August, and August's is
 * Wednesday 9 September.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let buyId = ''
let sellId = ''
let personId = ''
let owner: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown) {
  as(seat.email)
  return json(await fn(req(method, url, body, { 'x-context-id': seat.id })))
}

async function week(monday: string, perDay: number, accepted: number) {
  const m = d(monday)
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = perDay
  const total = perDay * 5
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: m, periodEnd: end, days, totalHours: total,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId, acceptedHours: accepted === total ? null : accepted,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: accepted, rateCents: 6_600, state: 'LIVE', byId: owner.personId },
  })
}

const payDays = async (kind: string) =>
  (await prisma.cycle.findMany({ where: { buyContractId: buyId, kind }, orderBy: { dueOn: 'asc' } }))
    .map((c) => [iso(c.dueOn), c.completedAt != null] as const)

describe('on a line nobody changed, overtime is paid only on the accepted hours over the line', () => {
  beforeAll(async () => {
    await freshWorld()

    const direct = await prisma.buyContract.findFirstOrThrow({
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    const theirSell = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract
    firmId = direct.companyId
    const clientId = theirSell.clientCompanyId

    const ctxs = await prisma.context.findMany({
      where: { companyId: firmId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }

    const leila = await prisma.person.create({ data: { name: 'Leila Farouk', primaryEmail: 'leila@cut-overtime-pay.etyme.invalid' } })
    personId = leila.id
    const start = d('2026-07-06')
    const end = d('2026-08-31')
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: clientId, personId, billRate: 11_200, startDate: start, endDate: end, state: 'IN_PROGRESS' },
    })
    sellId = sell.id
    // Nothing about a cut week is chosen on this line.
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, endDate: end, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
        overtimeAfterHours: 40, overtimeMultiplierBps: 15_000,
        candidates: { create: { personId, payRate: 6_600, startDate: start } },
      },
    })
    buyId = buy.id
    await prisma.contractLink.create({ data: { sellContractId: sellId, buyContractId: buyId, effectiveFrom: start } })
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buyId, personId, assertedByCompanyId: firmId, status: 'NONEXEMPT', wageRule: 'US_FLSA',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.', assertedById: owner.personId,
      } as any,
    })
    await writeCyclesFor(prisma, {
      sell: { id: sellId, startDate: start, endDate: end },
      buy: { id: buyId, contractType: 'W2', vendorCompanyId: null },
      packId: 'US_IT',
      pay: DEMO_MONTHLY_PAY,
    })

    await week('2026-07-06', 9, 42)
    await week('2026-07-13', 9, 41)
    await week('2026-07-20', 8, 40)
    await week('2026-07-27', 8, 40)
  }, 900_000)

  it('the run pays July 163 hours accepted, and overtime on 3 of them: 2 from the week accepted at 42 and 1 from the week accepted at 41', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-07' })
    expect(r.status).toBe(200)
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.totalHours).toBe(163)
    expect(row.overtimeHours).toBe(3)
    expect(row.premiumCents).toBe(3 * 3_300)
    expect(row.grossPay).toBe(163 * 6_600 + 3 * 3_300)
    expect(row.accepted).toContain('come off the hours over the line first')
  })

  it('the payroll screen shows the same hours and the same pay the run pays', async () => {
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-07&companyId=${firmId}`)
    const item = r.body.data.payItems.find((x: any) => x.buyContractId === buyId)
    expect(item.totalApprovedHours).toBe(163)
    expect(item.premiumCents).toBe(3 * 3_300)
    expect(item.grossPay).toBe(163 * 6_600 + 3 * 3_300)
  })

  it('the payroll file puts 40 ordinary hours and 2 of overtime on the week accepted at 42, and 40 and 1 on the week accepted at 41', async () => {
    const first = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-07-06&to=2026-07-10&provider=GENERIC')
    const a = first.body.data.lines.filter((l: any) => l.personName === 'Leila Farouk')
    expect(a.map((l: any) => [l.hours, l.overtimeHours])).toEqual([[40, 2]])
    const second = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-07-13&to=2026-07-17&provider=GENERIC')
    const b = second.body.data.lines.filter((l: any) => l.personName === 'Leila Farouk')
    expect(b.map((l: any) => [l.hours, l.overtimeHours])).toEqual([[40, 1]])
  })

  it('a monthly line has one pay day a month, each after the month it pays', async () => {
    expect((await payDays('SALARY_PAY')).map(([day]) => day)).toEqual(['2026-08-07', '2026-09-09'])
  })

  it('processing July marks July’s pay day done, nine days after the month, and leaves August’s open', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-07' })
    expect(r.status).toBe(200)
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.cyclesCompleted).toBe(1)
    expect(await payDays('SALARY_PAY')).toEqual([['2026-08-07', true], ['2026-09-09', false]])
  })
})
