import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'
import { POST as proposeRate } from '@/app/api/rate-history/route'

/**
 * A nonexempt US worker whose contracts draw no overtime line.
 *
 * The founder, 2026-09-29 ("yes to all"): she is owed overtime after
 * forty hours a week anyway, because the law draws the line the
 * contracts did not. Dana Whitfield starts on Monday 1 June 2026 at $66
 * an hour, W2, nonexempt, and neither her buy line nor the sell line
 * above it sets `overtimeAfterHours`. The week of 8 June she works
 * forty-five hours — a thirteen-hour Friday.
 *
 * Before this, the run, the screen, the file and back pay all paid those
 * forty-five hours at straight time.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let clientId = ''
let buyId = ''
let sellId = ''
let personId = ''
let owner: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

/** Monday to Friday at eight hours, with the days given overriding. */
async function week(monday: string, override: Record<string, number> = {}) {
  const m = d(monday)
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = 8
  Object.assign(days, override)
  const total = Object.values(days).reduce((a, b) => a + b, 0)
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: m, periodEnd: end, days, totalHours: total,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 6_600, state: 'LIVE', byId: owner.personId },
  })
  return ts
}

describe('a nonexempt US worker is paid overtime after forty hours even where no contract draws the line', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const direct = await prisma.buyContract.findFirstOrThrow({
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    const theirSell = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract
    firmId = direct.companyId
    clientId = theirSell.clientCompanyId

    const ctxs = await prisma.context.findMany({
      where: { companyId: firmId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }

    const dana = await prisma.person.create({ data: { name: 'Dana Whitfield', primaryEmail: 'dana@law-forty.etyme.invalid' } })
    personId = dana.id
    const start = d('2026-06-01')
    // No overtime line on either leg: the schema's default is null.
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: clientId, personId, billRate: 11_200, startDate: start, state: 'IN_PROGRESS' },
    })
    sellId = sell.id
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
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

    await week('2026-06-01')
    await week('2026-06-08', { '2026-06-12': 13 })
    await week('2026-06-15')
    await week('2026-06-22')
  }, 900_000)

  it('draws no overtime line on either contract, or nothing below proves anything', async () => {
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    expect(buy.overtimeAfterHours).toBeNull()
    expect(sell.overtimeAfterHours).toBeNull()
  })

  it("pays the forty-five-hour week's five hours over forty at time and a half of $66, in the payroll run", async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-06' })
    expect(r.status).toBe(200)
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.totalHours).toBe(165)
    expect(row.overtimeHours).toBe(5)
    expect(row.premiumCents).toBe(5 * 3_300)
    expect(row.grossPay).toBe(165 * 6_600 + 5 * 3_300)
    expect(row.payLine).toContain("Neither contract sets an overtime line for Dana Whitfield, so the law's applies")
  })

  it('shows the payroll screen the same premium the run pays, and says the line is the law’s', async () => {
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-06&companyId=${firmId}`)
    const item = r.body.data.payItems.find((x: any) => x.buyContractId === buyId)
    expect(item.premiumCents).toBe(5 * 3_300)
    expect(item.grossPay).toBe(165 * 6_600 + 5 * 3_300)
    expect(item.payLine).toContain('owed time and a half for hours over 40 in a week (29 U.S.C. §207(a)(1))')
  })

  it('puts the five hours on the payroll file as overtime, with the reason on the line', async () => {
    const r = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-06-08&to=2026-06-12&provider=GENERIC')
    expect(r.status).toBe(200)
    const mine = r.body.data.lines.filter((l: any) => l.personName === 'Dana Whitfield')
    expect(mine).toHaveLength(1)
    expect(mine[0].hours).toBe(40)
    expect(mine[0].overtimeHours).toBe(5)
    expect(mine[0].overtimeCents).toBe(Math.round(5 * 6_600 * 1.5))
    expect(mine[0].notes.join(' ')).toContain("the law's applies")
  })

  it('leaves the client’s side as it was: the sell line still draws no overtime line', async () => {
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    expect(sell.overtimeAfterHours).toBeNull()
    expect(await prisma.overtimeDecision.count({ where: { sellContractId: sellId } })).toBe(0)
  })

  it('moves the premium the law’s forty earned when a raise reaches the week, in the back pay it proposes', async () => {
    const paid = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-06' })
    expect(paid.status).toBe(200)
    // $66 to $69 is under five per cent, so it clears on its own and its
    // back pay is proposed on the spot.
    const p = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 6_900, fromDate: '2026-06-08', reason: 'Agreed at the June review',
    })
    expect(p.status).toBe(201)
    expect(p.body.data.rateHistory.approvalState).toBe('APPROVED')
    // 125 hours from 8 to 26 June at $3 more each; and the five over
    // forty move from half of $66 to half of $69.
    expect(p.body.data.backPay.totalCents).toBe(125 * 300 + 5 * 150)
  })

  it('pays the same week at straight time, and says why, once the work is recorded at a site outside the US', async () => {
    const site = await prisma.companyLocation.create({
      data: { companyId: clientId, name: 'Pune delivery center', country: 'IN' } as any,
    })
    await prisma.sellContract.update({ where: { id: sellId }, data: { workLocationId: site.id } })
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-06&companyId=${firmId}`)
    const item = r.body.data.payItems.find((x: any) => x.buyContractId === buyId)
    expect(item.premiumCents).toBe(0)
    expect(item.payLine).toContain('the work site is in India')
    expect(item.payLine).toContain('the US 40-hour overtime line is not applied')
    await prisma.sellContract.update({ where: { id: sellId }, data: { workLocationId: null } })
  })
})
