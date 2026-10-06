import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'
import { proposeBackPay } from '@/lib/money/back-pay'

/**
 * The employer accepts fewer hours than were worked, on a line whose
 * paying firm chose to keep the week's overtime.
 *
 * Since 2026-09-30 the ordinary-first cut is a choice on the pay line,
 * recorded with who made it and why; the default pays overtime only on
 * the accepted hours over the line, and walks through the run, the
 * screen and the file in cut-overtime-pay.test.ts. Omar's line below
 * records the choice, so every sentence here is the chosen rule.
 *
 * The founder, 2026-09-29 ("yes to all"): the cut on PAY comes off the
 * worker's ordinary hours first, so the worker keeps their overtime —
 * the opposite of the billing rule, on purpose. And pay is the hours
 * accepted, never the hours filed: until this, the run and the screen
 * paid every hour filed on a week the employer had cut.
 *
 * And the same day: an acceptance at or under the line is the hours
 * worked. Where the employer accepts forty hours or fewer of a longer
 * week, those hours are paid at straight time. Until this that week's
 * premium was held and the payroll file left it off.
 *
 * Omar Haddad starts on Monday 6 July 2026 at $66 an hour, W2,
 * nonexempt, on a forty-hour line. Two forty-five-hour weeks — nine
 * hours a day — then two of forty:
 *
 *   week of 6 July    45 worked, 42 accepted → 37 ordinary and 5 overtime
 *   week of 13 July   45 worked, 38 accepted → 38 at straight time,
 *                     because as accepted the week is not over forty
 *   weeks of 20 and 27 July, 40 worked and accepted
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

/** A Sunday-to-Saturday sheet with its hours worked Monday to Friday. */
async function week(monday: string, perDay: number, accepted: number) {
  const m = d(monday)
  const sunday = new Date(+m - 86_400_000)
  const saturday = new Date(+m + 5 * 86_400_000)
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = perDay
  const total = perDay * 5
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: sunday, periodEnd: saturday, days, totalHours: total,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId, acceptedHours: accepted === total ? null : accepted,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: accepted, rateCents: 6_600, state: 'LIVE', byId: owner.personId },
  })
}

describe('where the paying firm keeps the week’s overtime, pay is the hours the employer accepted, cut off ordinary hours first', () => {
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

    const omar = await prisma.person.create({ data: { name: 'Omar Haddad', primaryEmail: 'omar@pay-accepted.etyme.invalid' } })
    personId = omar.id
    const start = d('2026-07-06')
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: clientId, personId, billRate: 11_200, startDate: start, state: 'IN_PROGRESS' },
    })
    sellId = sell.id
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
        overtimeAfterHours: 40, overtimeMultiplierBps: 15_000,
        // The firm's recorded choice: keep the week's overtime on a cut week.
        cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: owner.personId, cutOvertimeAt: d('2026-07-01'),
        cutOvertimeReason: 'Our handbook promises overtime on every week worked past forty',
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

    await week('2026-07-06', 9, 42)
    await week('2026-07-13', 9, 38)
    await week('2026-07-20', 8, 40)
    await week('2026-07-27', 8, 40)
  }, 900_000)

  it('pays July the 160 hours accepted, not the 170 filed', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-07' })
    expect(r.status).toBe(200)
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.totalHours).toBe(160)
  })

  it('keeps the five overtime hours of the week accepted at 42, and pays them time and a half: 37 ordinary and 5 overtime', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-07' })
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    // Only the week of 6 July carries a premium.
    expect(row.overtimeHours).toBe(5)
    expect(row.premiumCents).toBe(5 * 3_300)
    expect(row.grossPay).toBe(160 * 6_600 + 5 * 3_300)
    expect(row.accepted).toContain('accepted 42 of the 45 hours Omar Haddad filed, so 42 are paid.')
  })

  it('pays the week accepted at 38 at straight time and says so: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-07' })
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.straightTime).toBe(
      'Week of July 12, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.'
    )
    expect(row.accepted).toContain('accepted 38 of the 45 hours Omar Haddad filed, so 38 are paid.')
    // Nothing is held, and only the week of 6 July carries a premium:
    // July's 160 hours at $66, and the premium on that week's 5 alone.
    expect(row.overtime).not.toContain('held')
    expect(row.overtime).not.toContain('2026-07-13')
    expect(row.overtimeHours).toBe(5)
    expect(row.grossPay).toBe(160 * 6_600 + 5 * 3_300)
  })

  it('shows the payroll screen the same hours and the same pay the run pays', async () => {
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-07&companyId=${firmId}`)
    const item = r.body.data.payItems.find((x: any) => x.buyContractId === buyId)
    expect(item.totalApprovedHours).toBe(160)
    expect(item.premiumCents).toBe(5 * 3_300)
    expect(item.grossPay).toBe(160 * 6_600 + 5 * 3_300)
    expect(item.accepted).toContain('come off ordinary hours first')
    // The week's own sentence, on the row, in plain words.
    expect(item.straightTime).toBe(
      'Week of July 12, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.'
    )
  })

  it('puts 37 ordinary hours and 5 overtime on the payroll file for the week accepted at 42', async () => {
    const r = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-07-05&to=2026-07-11&provider=GENERIC')
    const mine = r.body.data.lines.filter((l: any) => l.personName === 'Omar Haddad')
    expect(mine).toHaveLength(1)
    expect([mine[0].hours, mine[0].overtimeHours]).toEqual([37, 5])
    expect(mine[0].regularCents).toBe(37 * 6_600)
    expect(mine[0].overtimeCents).toBe(5 * 9_900)
  })

  it('puts the week accepted at 38 on the payroll file as 38 hours at straight time, with its sentence as a note, rather than leaving it off', async () => {
    const r = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-07-12&to=2026-07-18&provider=GENERIC')
    expect(r.body.data.skipped.find((x: any) => x.personName === 'Omar Haddad')).toBeUndefined()
    const mine = r.body.data.lines.filter((l: any) => l.personName === 'Omar Haddad')
    expect(mine).toHaveLength(1)
    expect([mine[0].hours, mine[0].overtimeHours]).toEqual([38, 0])
    expect(mine[0].totalCents).toBe(38 * 6_600)
    expect(mine[0].notes).toContain(
      'Omar Haddad, week of July 12, 2026: 38 of 45 hours accepted; paid at straight time because the accepted week is not over 40.'
    )
  })

  it('records the days it paid as the days accepted, so the next run pays nothing twice', async () => {
    const paid = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-07' })
    const row = paid.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.totalHours).toBe(160)
    const again = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-07' })
    const second = again.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(second.totalHours).toBe(0)
    expect(second.grossPay).toBe(0)
  })

  it('works back pay for a raise from 13 July on the 38 hours paid at straight time that week, with no premium to move', async () => {
    const rise = await prisma.rateHistory.create({
      data: {
        contractType: 'BUY', contractId: buyId, rate: 7_000, previousRate: 6_600, fromDate: d('2026-07-13'),
        reason: 'Agreed at the July review', changedById: owner.personId, approvalState: 'APPROVED',
        approvedById: owner.personId, approvedAt: d('2026-08-03'),
      },
    })
    const p = await proposeBackPay(rise.id)
    expect(p && p.applies).toBe(true)
    if (!p || !p.applies) return
    // 38 + 40 + 40 hours paid at $66 from 13 July, $4 each, and no
    // premium anywhere: the week of 13 July is straight time.
    expect(p.figure.totalCents).toBe(118 * 400)
    const lines = p.figure.periods.flatMap((x) => x.lines)
    expect(lines.every((l) => l.premiumCents === 0)).toBe(true)
    const week = lines.filter((l) => l.weekOf === '2026-07-12')
    expect(Math.round(week.reduce((n, l) => n + l.straightCents, 0))).toBe(38 * 400)
  })
})
