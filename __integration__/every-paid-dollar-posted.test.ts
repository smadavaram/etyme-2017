import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as statutory } from '@/app/api/payroll/statutory/route'
import { POST as recordExempt } from '@/app/api/contracts/[id]/exempt/route'
import { postAssertion } from '@/lib/order-postings'

/**
 * Every dollar a payroll run pays has its wage posting, once.
 *
 * The walk of 2026-11-14 at a firm like Brightmoor: a W-2 employee at $45
 * an hour worked a 40-hour week and then a 46-hour week, accepted before
 * anybody said whether she was exempt. The 46-hour week posted 46 x $45 =
 * $2,070 of pay and was held off the run. Once "Not exempt" was recorded,
 * Process paid 40 x $45 + 6 x $67.50 = $2,205.00, and the W-2 figures read
 * "$4,005.00 paid, only $3,870.00 has a wage posting behind it": the $135
 * premium (6 x $22.50) was paid and never posted.
 *
 * Calendar facts: Sunday Oct 11 and Sunday Oct 18, 2026; Monday Jun 8, 2026.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let clientId = ''
let owner: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

interface Line { personId: string; sellId: string; buyId: string; name: string; rate: number }

async function line(name: string, email: string, rate: number, start: string): Promise<Line> {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  const s = d(start)
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: rate * 2, startDate: s, state: 'IN_PROGRESS' },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: s, payCurrency: 'USD',
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: rate, startDate: s } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: s } })
  return { personId: person.id, sellId: sell.id, buyId: buy.id, name, rate }
}

/** Monday to Friday, accepted as filed and posted the way the accept button posts it. */
async function week(l: Line, monday: string, hours: number[]) {
  const m = d(monday)
  const days: Record<string, number> = {}
  hours.forEach((h, i) => { days[iso(new Date(+m + i * 86_400_000))] = h })
  const total = hours.reduce((a, b) => a + b, 0)
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sellId, personId: l.personId, periodStart: new Date(+m - 86_400_000), periodEnd: new Date(+m + 5 * 86_400_000),
      days, totalHours: total, status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId,
    },
  })
  const sig = await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: l.rate, state: 'LIVE', byId: owner.personId },
  })
  await postAssertion(sig.id, owner.personId)
  return { id: ts.id, days, sigId: sig.id }
}

/** What the books hold for one person's pay, by kind, in cents (magnitudes). */
async function posted(l: Line, timesheetId?: string) {
  const sigs = timesheetId
    ? (await prisma.workAssertion.findMany({ where: { timesheetId, role: 'EMPLOYER_ACCEPTANCE' }, select: { id: true } })).map((x) => x.id)
    : null
  const rows = await prisma.orderPosting.findMany({
    where: {
      companyId: firmId, personId: l.personId, kind: { in: ['PAY', 'PREMIUM'] }, reversalOfId: null,
      ...(sigs ? { source: 'TIMESHEET', sourceId: { in: sigs } } : {}),
    },
    select: { kind: true, txAmountCents: true },
  })
  const sum = (k: string) => rows.filter((r) => r.kind === k).reduce((n, r) => n + Math.abs(r.txAmountCents), 0)
  return { pay: sum('PAY'), premium: sum('PREMIUM'), premiumRows: rows.filter((r) => r.kind === 'PREMIUM').length }
}

const run = async (l: Line, action: 'calculate' | 'process', period: string) => {
  const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [l.buyId], action, period })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return { data: r.body.data, mine: r.body.data.details.find((x: any) => x.buyContractId === l.buyId) }
}
const pay = async (l: Line, period: string) => {
  await run(l, 'calculate', period)
  return run(l, 'process', period)
}

const notExempt = async (l: Line) => {
  const said = await call(owner, recordExempt, 'POST', `/api/contracts/${l.buyId}/exempt`, { personId: l.personId, status: 'NONEXEMPT' }, { id: l.buyId })
  expect(said.status, JSON.stringify(said.body)).toBe(201)
  return said.body.data
}

const w2 = async (l: Line) => {
  const r = await call(owner, statutory, 'GET', '/api/payroll/statutory?year=2026')
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return {
    gross: r.body.data.pack.summaries.find((s: any) => s.personId === l.personId)?.grossCents ?? null,
    short: r.body.data.pack.wagesShort.find((s: any) => s.personId === l.personId) ?? null,
  }
}

describe('every dollar a payroll run pays has its wage posting, once', () => {
  let marisol: Line
  let fortySix: { id: string }
  let pia: Line
  let pele: Line

  beforeAll(async () => {
    await freshWorld()
    const direct = await prisma.buyContract.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    firmId = direct.companyId
    clientId = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract.clientCompanyId
    const ctxs = await prisma.context.findMany({
      where: { companyId: firmId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }

    marisol = await line('Marisol Quintana', 'marisol@paid-posted.etyme.invalid', 4_500, '2026-10-01')
    await week(marisol, '2026-10-12', [8, 8, 8, 8, 8]) // 40 hours
    fortySix = await week(marisol, '2026-10-19', [10, 9, 9, 9, 9]) // 46 hours
  }, 900_000)

  it('a 46-hour week accepted before anybody said whether she is exempt posts $2,070 of pay (46 x 45) and no premium', async () => {
    expect(await posted(marisol, fortySix.id)).toEqual({ pay: 46 * 4_500, premium: 0, premiumRows: 0 })
  })

  it('the 40-hour week is paid $1,800 (40 x 45) while the 46-hour week is held, and the W-2 reads $1,800 with nothing short', async () => {
    const { mine } = await pay(marisol, '2026-10')
    expect(mine.grossPay).toBe(180_000)
    const year = await w2(marisol)
    expect(year.gross).toBe(180_000)
    expect(year.short).toBeNull()
  })

  it('recording "not exempt" posts the $135 premium (6 x 22.50) beside the $2,070 already posted, and says how many weeks it restated', async () => {
    const said = await notExempt(marisol)
    expect(said.books.restated).toBe(1)
    expect(said.books.leftAlone).toEqual([])
    expect(await posted(marisol, fortySix.id)).toEqual({ pay: 207_000, premium: 13_500, premiumRows: 1 })
  })

  it('recording the same answer a second time posts nothing more: still one $135 premium', async () => {
    const said = await notExempt(marisol)
    expect(said.books.restated).toBe(0)
    expect(await posted(marisol, fortySix.id)).toEqual({ pay: 207_000, premium: 13_500, premiumRows: 1 })
  })

  it('the held week is then paid $2,205 (40 x 45 + 6 x 67.50), and the W-2 reads $4,005 (1,800 + 2,070 + 135) with nothing short', async () => {
    const { mine, data } = await pay(marisol, '2026-10')
    expect(mine.grossPay).toBe(40 * 4_500 + 6 * 6_750) // 180,000 + 40,500 = 220,500
    expect(mine.premiumCents).toBe(13_500)
    // The premium was posted when the answer was recorded, so the run restates nothing.
    expect(data.books).toEqual({ restated: 0, leftAlone: [] })
    const year = await w2(marisol)
    expect(year.gross).toBe(400_500)
    expect(year.short).toBeNull()
    expect(await posted(marisol)).toEqual({ pay: 180_000 + 207_000, premium: 13_500, premiumRows: 1 })
  })

  it('a 46-hour week at $96 paid at straight time first ($4,416 = 46 x 96), then recorded not exempt: the $288 premium (6 x 48) is posted once and paid once, $4,704 posted and paid', async () => {
    pia = await line('Pia Lindqvist', 'pia@paid-posted.etyme.invalid', 9_600, '2026-06-01')
    const ts = await week(pia, '2026-06-08', [10, 9, 9, 9, 9])
    // A run from before the hold existed, which paid the 46 hours at straight time.
    await prisma.automationLog.create({
      data: {
        companyId: firmId, action: 'PAYROLL_RUN', summary: 'Payroll process: an earlier run', reason: 'An earlier run', reversible: false,
        payload: {
          action: 'process', period: '2026-06',
          contracts: [{
            buyContractId: pia.buyId, person: pia.name, payPeriod: null, hours: 46, grossPay: 441_600, currency: 'USD', refused: null, premiumsPriced: true,
            paid: Object.entries(ts.days).map(([day, hours]) => ({ personId: pia.personId, timesheetId: ts.id, day, hours, rateCents: 9_600 })),
          }],
        } as any,
      },
    })
    expect(await posted(pia)).toEqual({ pay: 441_600, premium: 0, premiumRows: 0 })
    expect((await w2(pia)).gross).toBe(441_600)

    const said = await notExempt(pia)
    expect(said.books.restated).toBe(1)
    expect(await posted(pia)).toEqual({ pay: 441_600, premium: 28_800, premiumRows: 1 })
    // Posted and not yet paid: in no year yet, so the W-2 still reads what was paid.
    expect((await w2(pia)).gross).toBe(441_600)

    const { mine } = await pay(pia, '2026-06')
    expect(mine.grossPay).toBe(28_800) // 4,704 - 4,416
    const again = await run(pia, 'process', '2026-06')
    expect(again.mine.grossPay).toBe(0)

    expect(await posted(pia)).toEqual({ pay: 441_600, premium: 28_800, premiumRows: 1 })
    const year = await w2(pia)
    expect(year.gross).toBe(470_400)
    expect(year.short).toBeNull()
  })

  it('an answer recorded before this rule, with the week still posted at straight time, gets its $135 premium posted by the run that pays it, and the run says so', async () => {
    pele = await line('Pele Amadi', 'pele@paid-posted.etyme.invalid', 4_500, '2026-10-01')
    const ts = await week(pele, '2026-10-19', [10, 9, 9, 9, 9])
    // Written straight to the table, as an answer recorded before the books followed it.
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: pele.buyId, personId: pele.personId, assertedByCompanyId: firmId, assertedById: owner.personId,
        status: 'NONEXEMPT', wageRule: 'US_FLSA',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Recorded before the books followed the answer.',
      },
    })
    expect(await posted(pele, ts.id)).toEqual({ pay: 207_000, premium: 0, premiumRows: 0 })

    const { mine, data } = await pay(pele, '2026-10')
    expect(mine.grossPay).toBe(220_500) // 40 x 45 + 6 x 67.50
    expect(data.books).toEqual({ restated: 1, leftAlone: [] })
    expect(await posted(pele, ts.id)).toEqual({ pay: 207_000, premium: 13_500, premiumRows: 1 })
    const year = await w2(pele)
    expect(year.gross).toBe(220_500)
    expect(year.short).toBeNull()
  })
})
