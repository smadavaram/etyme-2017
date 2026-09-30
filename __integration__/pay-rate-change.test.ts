import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as proposeRate, GET as rateHistory } from '@/app/api/rate-history/route'
import { POST as decideRate } from '@/app/api/rate-history/[id]/approve/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as profitability } from '@/app/api/profitability/route'
import { POST as approveWeek } from '@/app/api/timesheets/[id]/approve/route'

/**
 * A pay rise in the middle of a placement, walked end to end.
 *
 * Priya is placed on 2 February 2026 at $66 an hour, W2, by a firm that
 * sells her to a client at $112. She works Monday to Friday, eight hours
 * a day, for five months — nine a day in the week of 6 July. On
 * Wednesday 1 July her pay rises to $70.
 *
 * Walked on 2026-09-29 against the build as it stood, this paid $87,450
 * in one payroll run — every approved hour since February, at whatever
 * the rate was that morning — and closed twenty-six pay dates with one
 * press. The week of the rise paid Wednesday to Friday at $66. The
 * margin screen priced her pay at the client's $112 and reported the
 * placement losing money. Each sentence below is one of those, put
 * right.
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
let second: Seat
let worker: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

/** The hours in a pay period, each day at $66 before 1 July and $70 from it. */
function expected(from: string, to: string) {
  let cents = 0
  let hours = 0
  for (const [day, h] of Object.entries(DAYS)) {
    if (day < from || day > to) continue
    hours += h
    cents += h * (day >= '2026-07-01' ? 7_000 : 6_600)
  }
  return { cents, hours }
}

const DAYS: Record<string, number> = {}
const WEEKS: string[] = []

describe('a pay rise from $66 to $70 on a Wednesday', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    // A firm that sells and employs directly, and its client — read off
    // a direct W2 the world already has.
    const direct = await prisma.buyContract.findFirstOrThrow({
      where: {
        contractType: 'W2',
        supplierSellContractId: null,
        sellLinks: { some: { sellContract: { clientCompanyId: { not: undefined } } } },
      },
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

    // A second desk at the firm, so the rise is not approved by its proposer.
    const role = await prisma.role.create({
      data: { companyId: firmId, name: 'Contract Manager (pay rise)', permissions: ['rates.read', 'rates.write', 'consultants.cost', 'payroll.read'] },
    })
    const p2 = await prisma.person.create({ data: { name: 'Marta Oyelaran', primaryEmail: 'marta@pay-rise.etyme.invalid' } })
    const c2 = await prisma.context.create({
      data: { personId: p2.id, companyId: firmId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Pay rise test' },
    })
    second = { id: c2.id, personId: p2.id, email: p2.primaryEmail }

    // Priya, placed on Monday 2 February at $66, billed at $112.
    const priya = await prisma.person.create({ data: { name: 'Priya Venkataraman', primaryEmail: 'priya@pay-rise.etyme.invalid' } })
    personId = priya.id
    const start = d('2026-02-02')
    const sell = await prisma.sellContract.create({
      data: {
        companyId: firmId, clientCompanyId: clientId, personId, billRate: 11_200,
        startDate: start, state: 'IN_PROGRESS',
      },
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

    // A pay date at the end of every month, as the pack would write.
    for (const end of ['2026-02-27', '2026-03-31', '2026-04-30', '2026-05-29', '2026-06-30', '2026-07-31', '2026-08-31']) {
      await prisma.cycle.create({ data: { buyContractId: buyId, kind: 'SALARY_PAY', dueOn: d(end) } })
    }

    // Monday to Friday, 2 February to 21 August. Nine hours a day in the
    // week of 6 July, so that week goes over forty.
    for (let m = d('2026-02-02'); m <= d('2026-08-17'); m = new Date(+m + 7 * 86_400_000)) {
      const perDay = iso(m) === '2026-07-06' ? 9 : 8
      const days: Record<string, number> = {}
      for (let i = 0; i < 5; i++) {
        const day = iso(new Date(+m + i * 86_400_000))
        days[day] = perDay
        DAYS[day] = perDay
      }
      const end = new Date(+m + 4 * 86_400_000)
      const total = perDay * 5
      const ts = await prisma.timesheet.create({
        data: {
          sellContractId: sellId, personId, periodStart: m, periodEnd: end, days, totalHours: total,
          status: 'APPROVED', submittedAt: end, approvedAt: new Date(+end + 86_400_000),
          clientApprovedAt: new Date(+end + 86_400_000), employerAcceptedAt: new Date(+end + 2 * 86_400_000),
          employerAcceptedById: owner.personId,
        },
      })
      await prisma.workAssertion.create({
        data: { timesheetId: ts.id, companyId: clientId, role: 'CLIENT_APPROVAL', hours: total, rateCents: 11_200, state: 'LIVE', byId: owner.personId },
      })
      // What the approval route used to write on a direct placement: the
      // BILL rate on the employer's acceptance. Left here on purpose, so
      // nothing that prices pay may read it.
      await prisma.workAssertion.create({
        data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 11_200, state: 'LIVE', byId: owner.personId },
      })
      WEEKS.push(iso(m))
    }

    const wc = await prisma.context.create({
      data: { personId, companyId: firmId, type: 'CONSULTANT', grantReason: 'Pay rise test — Priya herself' },
    })
    worker = { id: wc.id, personId, email: priya.primaryEmail }
  }, 900_000)

  it('has twenty-nine weeks of approved hours on the placement, or nothing below proves anything', () => {
    expect(WEEKS.length).toBe(29)
    expect(WEEKS).toContain('2026-06-29')
  })

  // ── Before the rise: one period, once ──────────────────────────────

  it("pays June's days in June's run and nothing from any other month", async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-06' })
    expect(r.status).toBe(200)
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    const june = expected('2026-06-01', '2026-06-30')
    expect(row.totalHours).toBe(june.hours)
    expect(row.grossPay).toBe(june.cents)
    expect(row.grossPay).toBe(176 * 6_600)
  })

  it('closes the one pay date that belongs to June, not every pay date the placement has', async () => {
    const open = await prisma.cycle.count({ where: { buyContractId: buyId, kind: 'SALARY_PAY', completedAt: null } })
    const done = await prisma.cycle.findMany({ where: { buyContractId: buyId, kind: 'SALARY_PAY', completedAt: { not: null } } })
    expect(done.map((c) => iso(c.dueOn))).toEqual(['2026-06-30'])
    expect(open).toBe(6)
  })

  it('pays nothing the second time June is run, because every June hour is already paid', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-06' })
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.grossPay).toBe(0)
    expect(row.alreadyPaidHours).toBe(176)
  })

  it('refuses a run whose period is not a month or a pair of dates, in a sentence', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: 'last month' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('pay period')
  })

  // ── The rise ───────────────────────────────────────────────────────

  let rise = ''

  it('takes a rise to $70 from Wednesday 1 July, proposed by one desk and approved by another', async () => {
    const p = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 7_000, fromDate: '2026-07-01', reason: 'Six-month review',
    })
    expect(p.status).toBe(201)
    rise = p.body.data.rateHistory.id
    const a = await call(second, decideRate, 'POST', `/api/rate-history/${rise}/approve`, { action: 'approve', reason: 'agreed' }, { id: rise })
    expect(a.status).toBe(200)
    expect(a.body.data.approvalState).toBe('APPROVED')
    approval = a.body.data
  })

  it("tells Priya, in the app and by email, \"Your pay rate changes from $66 to $70 an hour from Wednesday, July 1.\" — and nobody else", async () => {
    const told = await prisma.notification.findMany({ where: { entityId: rise } })
    expect(told.map((n) => n.personId)).toEqual([personId])
    expect(told[0].body.startsWith('Your pay rate changes from $66 to $70 an hour from Wednesday, July 1.')).toBe(true)
    expect(told[0].channel).toBe('EMAIL')
    expect(approval.workerTold.personId).toBe(personId)
  })

  it("never tells Priya the $112 the client is billed for her", async () => {
    const told = await prisma.notification.findMany({ where: { personId } })
    for (const n of told) {
      expect(n.body).not.toContain('$112')
      expect(JSON.stringify(n.data ?? {})).not.toContain('11200')
    }
  })

  // ── How the change sits in the line's history ──────────────────────

  let approval: any

  it('records $66 as the rate the rise replaces, not zero', async () => {
    const row = await prisma.rateHistory.findUniqueOrThrow({ where: { id: rise } })
    expect(row.previousRate).toBe(6_600)
  })

  it('writes $66 down as the opening rate, from 2 February to Tuesday 30 June, when the rise is approved', async () => {
    const opening = await prisma.rateHistory.findFirstOrThrow({
      where: { contractType: 'BUY', contractId: buyId, id: { not: rise } },
    })
    expect(opening.rate).toBe(6_600)
    expect(opening.approvalState).toBe('APPROVED')
    expect(iso(opening.fromDate)).toBe('2026-02-02')
    expect(iso(opening.toDate!)).toBe('2026-06-30')
  })

  it("never overwrites the line's own $66, so every day before the rise still reads it", async () => {
    const line = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: buyId } })
    expect(line.payRate).toBe(6_600)
  })

  it('reports the pay periods the rise reaches, July and August, rather than invoice lines, and none of them paid yet', () => {
    expect(approval.invoiceLinesAffected).toBe(0)
    expect(approval.payPeriodsAffected.map((p: any) => p.label)).toEqual(['July 2026', 'August 2026'])
    expect(approval.payPeriodsAffected.every((p: any) => p.paid === false)).toBe(true)
    expect(approval.message).toContain('July 2026')
  })

  // ── Payroll, by the day ────────────────────────────────────────────

  it("pays July's run the Wednesday to Friday of the week of the rise at $70, and every other July day at $70", async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-07' })
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    const july = expected('2026-07-01', '2026-07-31')
    expect(row.totalHours).toBe(189)
    expect(row.grossPay).toBe(july.cents)
    expect(row.grossPay).toBe(189 * 7_000)
  })

  it("leaves the Monday and Tuesday of the week of the rise to June's run, and pays the Wednesday to Friday at $70", async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', {
      buyContractIds: [buyId], action: 'calculate', period: { start: '2026-06-29', end: '2026-07-03' },
    })
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    // Monday and Tuesday were paid in June's run; only Wednesday to
    // Friday are left, and they are $70 days.
    expect(row.alreadyPaidHours).toBe(16)
    expect(row.grossPay).toBe(24 * 7_000)
  })

  // ── Every other reader of pay, by the day ──────────────────────────

  it('shows the payroll screen the same July figure the run pays, and the $70 rate she is on now', async () => {
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-07&companyId=${firmId}`)
    const item = r.body.data.payItems.find((x: any) => x.buyContractId === buyId)
    expect(item.grossPay).toBe(expected('2026-07-01', '2026-07-31').cents)
    expect(item.payRate).toBe(7_000)
  })

  it("reads no next pay date for Priya once her last one has passed, and names every one before today still open as overdue, oldest first", async () => {
    // Pay dates at the end of February to August; only June's was run.
    // Today is past all of them, so none is "next" — and the six left
    // open are overdue, oldest 27 February. Never the last one generated.
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-07&companyId=${firmId}`)
    const item = r.body.data.payItems.find((x: any) => x.buyContractId === buyId)
    const today = new Date().toISOString().slice(0, 10)
    const open = ['2026-02-27', '2026-03-31', '2026-04-30', '2026-05-29', '2026-07-31', '2026-08-31']
    const late = open.filter((x) => x < today)
    expect(item.nextPayDate?.slice(0, 10) ?? null).toBe(open.find((x) => x >= today) ?? null)
    expect(item.payDatesOverdue.count).toBe(late.length)
    expect(item.payDatesOverdue.earliest.slice(0, 10)).toBe('2026-02-27')
  })

  it('shows on Rate History that one desk proposed the rise and a different desk approved it', async () => {
    const r = await call(owner, rateHistory, 'GET', '/api/rate-history')
    expect(r.status).toBe(200)
    const row = r.body.data.rateHistory.find((x: any) => x.id === rise)
    expect(row.changedById).toBe(owner.personId)
    expect(row.approvedById).toBe(second.personId)
    expect(row.approvedByName).toBe('Marta Oyelaran')
    expect(row.approvedByName).not.toBe(row.changedByName)
  })

  it('puts the week of the rise on the payroll file as sixteen hours at $66 and twenty-four at $70', async () => {
    const r = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-06-29&to=2026-07-03&provider=GENERIC')
    expect(r.status).toBe(200)
    const mine = r.body.data.lines.filter((l: any) => l.personName === 'Priya Venkataraman')
    expect(mine.map((l: any) => [l.hours, l.rateCents, l.totalCents])).toEqual([
      [16, 6_600, 16 * 6_600],
      [24, 7_000, 24 * 7_000],
    ])
  })

  it('pays the forty-five-hour week after the rise, all at $70, with its overtime at time and a half of $70', async () => {
    await prisma.buyContract.update({ where: { id: buyId }, data: { overtimeAfterHours: 40, overtimeMultiplierBps: 15_000 } })
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buyId, personId, assertedByCompanyId: firmId, status: 'NONEXEMPT',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.', assertedById: owner.personId,
      } as any,
    })
    const r = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-07-06&to=2026-07-10&provider=GENERIC')
    const mine = r.body.data.lines.filter((l: any) => l.personName === 'Priya Venkataraman')
    expect(mine).toHaveLength(1)
    expect(mine[0].rateCents).toBe(7_000)
    expect(mine[0].hours).toBe(40)
    expect(mine[0].overtimeHours).toBe(5)
    expect(mine[0].regularCents).toBe(40 * 7_000)
    expect(mine[0].overtimeCents).toBe(Math.round(5 * 7_000 * 1.5))
  })

  it('overtime in a week paid at two rates uses a regular rate weighted across both (29 CFR §778.115), not the rate on the first day', async () => {
    // The week of the rise made forty-five hours: a thirteen-hour Friday.
    // 16 hours at $66 and 29 at $70 is $3,086 straight time, a regular
    // rate of $68.58, and a premium of $171.44 on the five over the line.
    const ts = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: sellId, periodStart: d('2026-06-29') } })
    const before = { days: ts.days, totalHours: ts.totalHours }
    const long = { ...(ts.days as Record<string, number>), '2026-07-03': 13 }
    await prisma.timesheet.update({ where: { id: ts.id }, data: { days: long, totalHours: 45 } })
    await prisma.workAssertion.updateMany({ where: { timesheetId: ts.id }, data: { hours: 45 } })
    try {
      // The file: the premium on the $70 line, where the overtime was worked.
      const f = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-06-29&to=2026-07-03&provider=GENERIC')
      const mine = f.body.data.lines.filter((l: any) => l.personName === 'Priya Venkataraman')
      expect(mine.map((l: any) => [l.rateCents, l.hours, l.overtimeHours, l.regularCents, l.overtimeCents])).toEqual([
        [6_600, 16, 0, 16 * 6_600, 0],
        [7_000, 24, 5, 24 * 7_000, 5 * 7_000 + 17_144],
      ])
      expect(mine.reduce((n: number, l: any) => n + l.totalCents, 0)).toBe(325_744)

      // The run: June's run paid Monday and Tuesday; this one pays the
      // Wednesday to Friday at $70 and the premium on the regular rate.
      const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', {
        buyContractIds: [buyId], action: 'calculate', period: { start: '2026-06-29', end: '2026-07-03' },
      })
      const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
      expect(row.alreadyPaidHours).toBe(16)
      expect(row.premiumCents).toBe(17_144)
      expect(row.grossPay).toBe(29 * 7_000 + 17_144)
      expect(row.overtime).toContain('regular rate')

      // The screen: July carries the premium on both long weeks — $171.44
      // on the week of the rise and $175.00 on the week of 6 July, all at
      // $70 — rounded once for the row.
      const s = await call(owner, payroll, 'GET', `/api/payroll?period=2026-07&companyId=${firmId}`)
      const item = s.body.data.payItems.find((x: any) => x.buyContractId === buyId)
      expect(item.overtimeHours).toBe(10)
      expect(item.premiumCents).toBe(Math.round(17_144.444 + 17_500))
      expect(item.grossPay).toBe(194 * 7_000 + item.premiumCents)
    } finally {
      await prisma.timesheet.update({ where: { id: ts.id }, data: before as any })
      await prisma.workAssertion.updateMany({ where: { timesheetId: ts.id }, data: { hours: 40 } })
    }
  })

  it("shows Priya the $70 she is on now, on her own page", async () => {
    const r = await call(worker, myWork, 'GET', '/api/me/work')
    expect(r.status).toBe(200)
    const line = r.body.data.placements.find((p: any) => p.id === sellId)
    expect(line.payRate).toBe(7_000)
  })

  it('tells Priya what she is owed, each day at its own rate, less what June\'s run already paid her', async () => {
    const r = await call(worker, myWork, 'GET', '/api/me/work')
    const owed = r.body.data.owed
    const all = expected('2026-01-01', '2026-12-31')
    const june = expected('2026-06-01', '2026-06-30')
    // Her line is non-exempt with a forty-hour line from the test above,
    // so the forty-five-hour week of 6 July carries its premium on her
    // page as it does on her pay: half of $70 again on five hours. Her
    // page read straight time only until 2026-09-29.
    const premium = 5 * 3_500
    expect(owed.paidHours).toBe(june.hours)
    expect(owed.hours).toBe(all.hours - june.hours)
    expect(owed.overtimeHours).toBe(5)
    expect(owed.cents).toBe(all.cents - june.cents + premium)
  })

  it('prices her pay on the margin screen at $66 and $70 by the day, never at the $112 the client is billed', async () => {
    const r = await call(owner, profitability, 'GET', '/api/profitability')
    expect(r.status).toBe(200)
    const row = r.body.data.rows.find((x: any) => x.contractId === sellId)
    const all = expected('2026-01-01', '2026-12-31')
    expect(row.profit.revenueCents).toBe(all.hours * 11_200)
    // Cost is what payroll pays: the forty-five-hour week of 6 July
    // carries half of $70 again on its five hours over the line.
    expect(row.profit.payCents).toBe(all.cents + 5 * 3_500)
    expect(row.profit.marginCents).toBeGreaterThan(0)
    // What the two sides agreed, read at the rate in force today.
    expect(row.agreed.payRateCents).toBe(7_000)
  })

  it("records the firm's acceptance of a new week at her $70 pay rate, never the client's $112", async () => {
    const days = { '2026-08-24': 8, '2026-08-25': 8, '2026-08-26': 8, '2026-08-27': 8, '2026-08-28': 8 }
    const ts = await prisma.timesheet.create({
      data: {
        sellContractId: sellId, personId, periodStart: d('2026-08-24'), periodEnd: d('2026-08-28'),
        days, totalHours: 40, status: 'SUBMITTED', submittedAt: d('2026-08-28'),
      },
    })
    const clientDesk = await prisma.context.findFirstOrThrow({
      where: { companyId: clientId, type: 'EMPLOYEE', role: { permissions: { hasSome: ['*', 'timesheets.approve'] } } },
      include: { person: true },
    })
    const signed = await call(
      { id: clientDesk.id, personId: clientDesk.personId, email: clientDesk.person.primaryEmail },
      approveWeek, 'POST', `/api/timesheets/${ts.id}/approve`, {}, { id: ts.id }
    )
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)
    const accepted = await call(owner, approveWeek, 'POST', `/api/timesheets/${ts.id}/approve`, {}, { id: ts.id })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    const row = await prisma.workAssertion.findFirstOrThrow({
      where: { timesheetId: ts.id, role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
    })
    expect(row.rateCents).toBe(7_000)
  })

  // ── The next change, and the ones that collide ─────────────────────

  it('refuses a change starting inside a stretch already on the books, and says which', async () => {
    const r = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 6_800, fromDate: '2026-06-15',
    })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('already')
  })

  it('takes a second change from 1 October while the first is still open, and closes the first on 30 September', async () => {
    // $70 to $72 is under five per cent, so it clears on its own.
    const r = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 7_200, fromDate: '2026-10-01', reason: 'Annual uplift',
    })
    expect(r.status).toBe(201)
    const second = await prisma.rateHistory.findUniqueOrThrow({ where: { id: r.body.data.rateHistory.id } })
    expect(second.approvalState).toBe('APPROVED')
    expect(second.previousRate).toBe(7_000)
    const first = await prisma.rateHistory.findUniqueOrThrow({ where: { id: rise } })
    expect(iso(first.toDate!)).toBe('2026-09-30')
  })

  it('lets a change through where the only thing in its way was a change somebody rejected', async () => {
    const p = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 8_000, fromDate: '2026-11-02',
    })
    expect(p.status).toBe(201)
    const id = p.body.data.rateHistory.id
    const no = await call(second, decideRate, 'POST', `/api/rate-history/${id}/approve`, { action: 'reject', reason: 'Not this year' }, { id })
    expect(no.body.data.approvalState).toBe('REJECTED')
    const again = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 7_500, fromDate: '2026-11-02',
    })
    expect(again.status).toBe(201)
  })
})
