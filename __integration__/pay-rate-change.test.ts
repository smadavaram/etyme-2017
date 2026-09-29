import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as proposeRate } from '@/app/api/rate-history/route'
import { POST as decideRate } from '@/app/api/rate-history/[id]/approve/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'

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
})
