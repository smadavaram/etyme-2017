import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as chooseMethod } from '@/app/api/placements/[id]/overtime-method/route'
import { GET as openPlacement } from '@/app/api/placements/[id]/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'

/**
 * The paying firm chooses how overtime is priced in a week paid at two
 * rates, and payroll pays it — never below what the law requires.
 *
 * Priya is a W2, nonexempt, on a forty-hour line at $70 from 1 June 2026.
 * Her pay is cut to $66 from Wednesday 17 June, and that week she works
 * forty-five hours: Monday and Tuesday at $70, Wednesday to Friday at
 * $66, a thirteen-hour Friday. Five hours over the line, all on a $66 day.
 *
 *   straight time    16 × $70 + 29 × $66          = $3,034.00
 *   regular rate     $3,034.00 / 45               = $67.42…
 *   law's premium    5 × half the regular rate    = $168.56   (29 CFR §778.115)
 *   rate on the day  5 × half of $66              = $165.00   — under the law, so the law's is paid
 *   higher rate      5 × half of $70              = $175.00
 *
 * The founder, 2026-09-29: follow US law as the recommendation, allow the
 * firm to choose otherwise, and record who chose it and why.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let buyId = ''
let sellId = ''
let personId = ''
let owner: Seat
let noCost: Seat
let client: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

const choose = (seat: Seat, body: unknown) =>
  call(seat, chooseMethod, 'PATCH', `/api/placements/${sellId}/overtime-method`, body, { id: sellId })

async function juneRow() {
  const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-06' })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.details.find((x: any) => x.buyContractId === buyId)
}

describe("a paying firm's choice of overtime method", () => {
  beforeAll(async () => {
    await freshWorld()

    const direct = await prisma.buyContract.findFirstOrThrow({
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    const theirSell = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract
    firmId = direct.companyId
    const clientId = theirSell.clientCompanyId

    const ownerOf = async (companyId: string): Promise<Seat> => {
      const ctxs = await prisma.context.findMany({
        where: { companyId, type: 'EMPLOYEE', role: { isNot: null } },
        include: { role: true, person: true },
      })
      const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
      return { id: o.id, personId: o.personId, email: o.person.primaryEmail }
    }
    owner = await ownerOf(firmId)
    client = await ownerOf(clientId)

    // A desk that runs the calendar of pay but may not read what anybody costs.
    const role = await prisma.role.create({
      data: { companyId: firmId, name: 'Payroll clerk (no cost)', permissions: ['payroll.read', 'rates.read', 'timesheets.read'] },
    })
    const p2 = await prisma.person.create({ data: { name: 'Dev Raghunathan', primaryEmail: 'dev@ot-method.etyme.invalid' } })
    const c2 = await prisma.context.create({
      data: { personId: p2.id, companyId: firmId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Overtime method test' },
    })
    noCost = { id: c2.id, personId: p2.id, email: p2.primaryEmail }

    const priya = await prisma.person.create({ data: { name: 'Priya Natarajan', primaryEmail: 'priya@ot-method.etyme.invalid' } })
    personId = priya.id
    const start = d('2026-06-01')
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: clientId, personId, billRate: 11_200, startDate: start, state: 'IN_PROGRESS' },
    })
    sellId = sell.id
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
        overtimeAfterHours: 40, overtimeMultiplierBps: 15_000,
        candidates: { create: { personId, payRate: 7_000, startDate: start } },
      },
    })
    buyId = buy.id
    await prisma.contractLink.create({ data: { sellContractId: sellId, buyContractId: buyId, effectiveFrom: start } })
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buyId, personId, assertedByCompanyId: firmId, status: 'NONEXEMPT',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.', assertedById: owner.personId,
      } as any,
    })
    // The cut, approved, from Wednesday 17 June.
    await prisma.rateHistory.create({
      data: {
        contractType: 'BUY', contractId: buyId, rate: 6_600, previousRate: 7_000, fromDate: d('2026-06-17'),
        changedById: owner.personId, approvalState: 'APPROVED', approvedById: owner.personId, approvedAt: d('2026-06-10'),
        reason: 'Moved to a lighter role',
      },
    })

    // Four weeks, Monday to Friday; a thirteen-hour Friday on 19 June.
    for (const monday of ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22']) {
      const m = d(monday)
      const days: Record<string, number> = {}
      for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = 8
      if (monday === '2026-06-15') days['2026-06-19'] = 13
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
        data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 7_000, state: 'LIVE', byId: owner.personId },
      })
    }
  }, 900_000)

  it("says on the placement that overtime is paid at the US regular rate, the law's default, until somebody chooses otherwise", async () => {
    const r = await call(owner, openPlacement, 'GET', `/api/placements/${sellId}`, undefined, { id: sellId })
    expect(r.status).toBe(200)
    const ot = r.body.data.contracts.buy.overtime
    expect(ot.method).toBe('US_REGULAR_RATE')
    expect(ot.chosen).toBe(false)
    expect(ot.says).toContain("Overtime is paid at the US regular rate (the law's default).")
    expect(ot.mayChange).toBe(true)
  })

  it('pays the law’s premium on the week that crossed the cut before anything is chosen', async () => {
    const row = await juneRow()
    expect(row.totalHours).toBe(165)
    expect(row.premiumCents).toBe(16_856)
    expect(row.grossPay).toBe(96 * 7_000 + 69 * 6_600 + 16_856)
  })

  it('a desk that cannot read what people cost cannot change it', async () => {
    const r = await choose(noCost, { method: 'HIGHER_RATE', reason: 'Agreed with Priya at the June review' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain("Changing how Priya Natarajan's overtime is priced")
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.overtimeMethod).toBe('US_REGULAR_RATE')
    expect(line.overtimeMethodById).toBeNull()
    // The trail is written without holding the response up, so give it a moment.
    let refused = null
    for (let i = 0; i < 20 && !refused; i++) {
      refused = await prisma.accessLog.findFirst({
        where: { subjectId: personId, actorPersonId: noCost.personId, allowed: false },
      })
      if (!refused) await new Promise((r) => setTimeout(r, 50))
    }
    expect(refused?.reason).toContain('FORBIDDEN')
  })

  it('does not show that desk the method, because it follows the pay rate', async () => {
    const r = await call(noCost, openPlacement, 'GET', `/api/placements/${sellId}`, undefined, { id: sellId })
    expect(r.status).toBe(200)
    expect(r.body.data.contracts.buy.overtime).toBeNull()
  })

  it('refuses the client, which is a party to the placement and pays nobody on this line', async () => {
    const r = await choose(client, { method: 'HIGHER_RATE', reason: 'We would like her paid more' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_THE_PAYER')
    expect(r.body.error.message).toBe('Only the firm that pays Priya Natarajan can choose how their overtime is priced.')
  })

  it("a method other than the law's default is refused without a reason", async () => {
    const r = await choose(owner, { method: 'RATE_ON_THE_DAY' })
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('reason')
    expect(r.body.error.message).toContain("should not be paid at the US regular rate, the law's default")
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.overtimeMethod).toBe('US_REGULAR_RATE')
  })

  it("a firm's overtime method is recorded with who chose it and why", async () => {
    const r = await choose(owner, { method: 'HIGHER_RATE', reason: 'Agreed with Priya when her role changed' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('Overtime is paid at the higher of the rates worked that week.')
    expect(r.body.data.says).toContain('never paid less than the regular-rate premium')

    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.overtimeMethod).toBe('HIGHER_RATE')
    expect(line.overtimeMethodById).toBe(owner.personId)
    expect(line.overtimeMethodAt).not.toBeNull()
    expect(line.overtimeMethodReason).toBe('Agreed with Priya when her role changed')

    const logged = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: firmId, action: 'OVERTIME_METHOD_CHOSEN' },
      orderBy: { at: 'desc' },
    })
    expect(logged.reason).toBe('Agreed with Priya when her role changed')
    expect(logged.reversible).toBe(true)
    expect((logged.payload as any).from).toBe('US_REGULAR_RATE')
    expect((logged.payload as any).to).toBe('HIGHER_RATE')
    const read = await prisma.accessLog.findFirst({
      where: { subjectId: personId, actorPersonId: owner.personId, allowed: true, action: 'PAYROLL_VIEW' },
    })
    expect(read).not.toBeNull()
  })

  it('payroll pays the chosen method, never below the regular-rate premium for a non-exempt worker', async () => {
    // The higher of the week's two rates: half of $70 on five hours.
    const higher = await juneRow()
    expect(higher.premiumCents).toBe(17_500)

    // The rate on the day: half of $66 on five hours is $165.00, under
    // what the law requires on the regular rate, so the law's is paid.
    const r = await choose(owner, { method: 'RATE_ON_THE_DAY', reason: 'Premium follows the rate of the day worked' })
    expect(r.status).toBe(200)
    const onTheDay = await juneRow()
    expect(onTheDay.premiumCents).toBe(16_856)
    // The run's sentence (lib/money/sheet-overtime, overtimeSaysFor) says
    // "on the regular rate" whatever the method, which is wrong under
    // HIGHER_RATE. Reported to money rather than asserted here.
  })

  it('goes back to the law’s default with no reason needed, and says who chose it', async () => {
    const r = await choose(owner, { method: 'US_REGULAR_RATE' })
    expect(r.status).toBe(200)
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.overtimeMethod).toBe('US_REGULAR_RATE')
    expect(line.overtimeMethodReason).toBeNull()
    const open = await call(owner, openPlacement, 'GET', `/api/placements/${sellId}`, undefined, { id: sellId })
    expect(open.body.data.contracts.buy.overtime.chosen).toBe(true)
    expect(open.body.data.contracts.buy.overtime.says).toMatch(/Chosen by .+ on /)
  })
})
