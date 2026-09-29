import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as proposeRate } from '@/app/api/rate-history/route'
import { POST as decideRate } from '@/app/api/rate-history/[id]/approve/route'
import { GET as backPayRead } from '@/app/api/rate-history/[id]/back-pay/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { POST as offCycle } from '@/app/api/payroll/off-cycle/route'

/**
 * A raise dated back into a month already paid.
 *
 * Priya starts on Monday 1 June 2026 at $66 an hour, W2, nonexempt, with
 * a forty-hour line. The week of 15 June she works forty-five hours — a
 * thirteen-hour Friday. June is paid. Then a raise to $70 is approved,
 * effective Monday 15 June.
 *
 * The founder's rule, 2026-09-29: the back pay is worked out and put
 * forward for a desk to approve, never paid silently. Every sentence
 * below is one piece of that.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let buyId = ''
let sellId = ''
let personId = ''
let owner: Seat
let second: Seat
let rise = ''

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

describe('back pay for a raise dated before days already paid', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

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

    // A second desk that decides pay but does not run payroll.
    const role = await prisma.role.create({
      data: { companyId: firmId, name: 'Contract Manager (back pay)', permissions: ['rates.read', 'rates.write', 'consultants.cost', 'payroll.read'] },
    })
    const p2 = await prisma.person.create({ data: { name: 'Marta Oyelaran', primaryEmail: 'marta@back-pay.etyme.invalid' } })
    const c2 = await prisma.context.create({
      data: { personId: p2.id, companyId: firmId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Back pay test' },
    })
    second = { id: c2.id, personId: p2.id, email: p2.primaryEmail }

    const priya = await prisma.person.create({ data: { name: 'Priya Venkataraman', primaryEmail: 'priya@back-pay.etyme.invalid' } })
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
        candidates: { create: { personId, payRate: 6_600, startDate: start } },
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

    // Monday to Friday, 1 June to 31 July; a thirteen-hour Friday on 19 June.
    for (let m = d('2026-06-01'); m <= d('2026-07-27'); m = new Date(+m + 7 * 86_400_000)) {
      const days: Record<string, number> = {}
      for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = 8
      if (iso(m) === '2026-06-15') days['2026-06-19'] = 13
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
    }
  }, 900_000)

  it("pays June at $66, with the premium on the forty-five-hour week's five hours over the line", async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-06' })
    expect(r.status).toBe(200)
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.totalHours).toBe(181)
    expect(row.premiumCents).toBe(5 * 3_300)
    expect(row.grossPay).toBe(181 * 6_600 + 5 * 3_300)
  })

  it('proposes $414.00 of back pay when a raise to $70 from 15 June is approved, and says for which weeks', async () => {
    const p = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 7_000, fromDate: '2026-06-15', reason: 'Agreed at the June review',
    })
    expect(p.status).toBe(201)
    rise = p.body.data.rateHistory.id
    const a = await call(second, decideRate, 'POST', `/api/rate-history/${rise}/approve`, { action: 'approve', reason: 'ok' }, { id: rise })
    expect(a.status).toBe(200)
    // 101 hours paid at $66 from 15 to 30 June, $4 each; and the premium on
    // the five overtime hours moves from half of $66 to half of $70.
    expect(a.body.data.backPay.totalCents).toBe(101 * 400 + 5 * 200)
    expect(a.body.data.backPay.weeks).toEqual(['2026-06-15', '2026-06-22', '2026-06-29'])
    expect(a.body.data.backPay.payments.map((x: any) => [x.label, x.amountCents])).toEqual([['June 2026', 41_400]])
    expect(a.body.data.message).toContain(
      'Back pay of $414.00 is proposed for Priya Venkataraman, for the weeks of June 15, 2026, June 22, 2026 and June 29, 2026'
    )
    expect(a.body.data.message).toContain('nothing is paid until then')
  })

  it('tells Priya her new rate, and that $414.00 of back pay was put to the payroll desk and is not paid yet', async () => {
    const told = await prisma.notification.findMany({ where: { entityId: rise } })
    expect(told.map((n) => n.personId)).toEqual([personId])
    expect(told[0].body).toContain('Your pay rate changes from $66 to $70 an hour from Monday, June 15.')
    expect(told[0].body).toContain('back pay of $414.00')
    expect(told[0].body).toContain('It is not paid yet.')
    expect(told[0].body).not.toContain('$112')
  })

  it('pays nothing until a payroll desk approves it', async () => {
    const posted = await prisma.orderPosting.count({ where: { sellContractId: sellId, sourceId: { startsWith: 'offcycle:' } } })
    expect(posted).toBe(0)
  })

  it('shows the same proposal on Rate History, and offers the payment only to a desk that runs payroll', async () => {
    const mine = await call(owner, backPayRead, 'GET', `/api/rate-history/${rise}/back-pay`, undefined, { id: rise })
    expect(mine.status).toBe(200)
    expect(mine.body.data.totalCents).toBe(41_400)
    expect(mine.body.data.says).toContain('June 15, 2026')
    expect(mine.body.data.mayPay).toBe(true)
    const theirs = await call(second, backPayRead, 'GET', `/api/rate-history/${rise}/back-pay`, undefined, { id: rise })
    expect(theirs.body.data.mayPay).toBe(false)
  })

  it('refuses the back pay from a desk that does not run payroll', async () => {
    const r = await call(second, offCycle, 'POST', '/api/payroll/off-cycle', {
      rateHistoryId: rise, sellContractId: sellId, personId, amountCents: 41_400, reason: 'RATE_AMENDMENT_LATE', periodStart: '2026-06-01',
    })
    expect(r.status).toBe(403)
  })

  it('refuses a back payment for a figure other than the one the books give, and says the right one', async () => {
    const r = await call(owner, offCycle, 'POST', '/api/payroll/off-cycle', {
      rateHistoryId: rise, sellContractId: sellId, personId, amountCents: 41_300, reason: 'RATE_AMENDMENT_LATE', periodStart: '2026-06-01',
    })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('$414.00')
  })

  it("pays the approved back pay as one off-cycle payment, posted to June, the period it belongs to", async () => {
    const r = await call(owner, offCycle, 'POST', '/api/payroll/off-cycle', {
      rateHistoryId: rise, sellContractId: sellId, personId, amountCents: 41_400, reason: 'RATE_AMENDMENT_LATE', periodStart: '2026-06-01',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.posting.amountCents).toBe(-41_400)
    expect(iso(new Date(r.body.data.posting.postedAt))).toBe('2026-06-01')
  })

  it('proposes nothing more for the same raise once it is paid, and refuses paying it twice', async () => {
    const again = await call(owner, backPayRead, 'GET', `/api/rate-history/${rise}/back-pay`, undefined, { id: rise })
    expect(again.body.data.totalCents).toBe(0)
    expect(again.body.data.says).toContain('No back pay is owed')
    const twice = await call(owner, offCycle, 'POST', '/api/payroll/off-cycle', {
      rateHistoryId: rise, sellContractId: sellId, personId, amountCents: 41_400, reason: 'RATE_AMENDMENT_LATE', periodStart: '2026-06-01',
    })
    expect(twice.status).toBe(409)
  })

  it('measures a second raise from the $70 already paid in back pay, not from the $66 the run paid', async () => {
    // $70 to $72 from 22 June is under five per cent, so it clears on its
    // own — and its back pay is proposed on the spot, never paid.
    const p = await call(owner, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 7_200, fromDate: '2026-06-22',
    })
    expect(p.status).toBe(201)
    expect(p.body.data.rateHistory.approvalState).toBe('APPROVED')
    // 56 hours from 22 to 30 June, $2 each.
    expect(p.body.data.backPay.totalCents).toBe(56 * 200)
    expect(p.body.data.backPay.says).toContain('$112.00')
    // Cleared on its own is approved, so Priya is told this one too.
    expect(p.body.data.workerTold.personId).toBe(personId)
    const told = await prisma.notification.findFirstOrThrow({ where: { entityId: p.body.data.rateHistory.id } })
    expect(told.body).toContain('from $70 to $72 an hour from Monday, June 22.')
  })

  it('pays July at the new rate in the ordinary run, with no back pay in it', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-07' })
    const row = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(row.grossPay).toBe(row.totalHours * 7_200)
  })
})
