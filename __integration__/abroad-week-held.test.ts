import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'

/**
 * Owner's decision, docs/decisions/92 answer 4: a W-2 week worked outside
 * the US, in a country whose overtime rule Etyme does not have, is held
 * over 40 hours. The country that decides is the work location. A person on
 * a business-visa trip has no work location abroad, so her home rules apply.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }
interface Line { personId: string; sellId: string; buyId: string; name: string }

let firmId = ''
let clientId = ''
let owner: Seat
let siteIndia = ''
let siteHome = ''

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown) {
  as(seat.email)
  return json(await fn(req(method, url, body, { 'x-context-id': seat.id })))
}

async function line(name: string, email: string, siteId: string | null, payCurrency = 'USD'): Promise<Line> {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  const start = d('2026-06-01')
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: 13_200, startDate: start, state: 'IN_PROGRESS', workLocationId: siteId },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency,
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: 9_600, startDate: start } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
  // The exempt answer is left unrecorded on purpose: that is where the hold applies.
  return { personId: person.id, sellId: sell.id, buyId: buy.id, name }
}

async function week(l: Line, monday: string, hours: number[]) {
  const m = d(monday)
  const days: Record<string, number> = {}
  hours.forEach((h, i) => { days[iso(new Date(+m + i * 86_400_000))] = h })
  const total = hours.reduce((a, b) => a + b, 0)
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sellId, personId: l.personId, periodStart: new Date(+m - 86_400_000), periodEnd: new Date(+m + 5 * 86_400_000), days, totalHours: total,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 9_600, state: 'LIVE', byId: owner.personId },
  })
  return { id: ts.id, days }
}

const row = async (l: Line) => {
  const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-06&companyId=${firmId}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.payItems.find((x: any) => x.buyContractId === l.buyId)
}
async function recordNonexempt(l: Line) {
  const { POST: recordExempt } = await import('@/app/api/contracts/[id]/exempt/route')
  as(owner.email)
  const r = await json(await recordExempt(
    req('POST', `/api/contracts/${l.buyId}/exempt`, { personId: l.personId, status: 'NONEXEMPT' }, { 'x-context-id': owner.id }),
    { params: Promise.resolve({ id: l.buyId }) } as any))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
}
const run = (l: Line, action: string) => call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [l.buyId], action, period: '2026-06' })

describe('a week worked abroad where Etyme has no overtime rule is held, and a business-visa trip changes nothing', () => {
  let abroad: Line
  let trip: Line

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

    siteIndia = (await prisma.companyLocation.create({ data: { companyId: clientId, name: 'Pune delivery center', country: 'IN' } })).id
    siteHome = (await prisma.companyLocation.create({ data: { companyId: clientId, name: 'Dayton office', country: 'US' } })).id

    abroad = await line('Rhea Castellan', 'rhea@abroad-week.etyme.invalid', siteIndia)
    await week(abroad, '2026-06-08', [10, 9, 9, 9, 9]) // 46 hours
    await week(abroad, '2026-06-15', [8, 8, 8, 8, 8]) // 40 hours

    // On a business-visa trip: work location unset (home), paid by a home
    // employer in another currency.
    trip = await line('Tomas Verhoeven', 'tomas@abroad-week.etyme.invalid', null, 'EUR')
    await week(trip, '2026-06-08', [10, 9, 9, 9, 9])
  }, 900_000)

  it('a week of 46 hours worked in a country with no configured overtime rule is held off the run, and says so on the Payroll row', async () => {
    const mine = await row(abroad)
    expect(mine.heldHours).toBe(46)
    expect(mine.totalApprovedHours).toBe(40)
    expect(mine.grossPay).toBe(384_000)
    expect(mine.exemptHeld).toContain("Rhea Castellan's week of June 7, 2026 is held: 46 hours worked in India")
    expect(mine.exemptHeld).toContain('Etyme has no overtime rule recorded for India')
    const r = await run(abroad, 'calculate')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const d1 = r.body.data.details.find((x: any) => x.buyContractId === abroad.buyId)
    expect(d1.grossPay).toBe(384_000)
    expect(d1.exemptHeld).toContain('worked in India')
  })

  it('the held abroad week is on no pay file and no pay row is written for it', async () => {
    const f = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-06-07&to=2026-06-13&provider=GENERIC')
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    expect(f.body.data.lines.filter((l: any) => l.personName === 'Rhea Castellan')).toHaveLength(0)
    const paid = await run(abroad, 'process')
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    const log = await prisma.automationLog.findMany({ where: { companyId: firmId, action: 'PAYROLL_RUN' }, orderBy: { at: 'desc' } })
    const days = log.flatMap((l: any) => (l.payload?.contracts ?? []).filter((c: any) => c.buyContractId === abroad.buyId).flatMap((c: any) => (c.paid ?? []).map((p: any) => String(p.day).slice(0, 10))))
    expect(days.length).toBeGreaterThan(0)
    expect(days.filter((x: string) => x >= '2026-06-07' && x <= '2026-06-13')).toEqual([])
  })

  it('a week worked at the home location is not held, even on a business-visa trip', async () => {
    // Her home employment's rules apply: the answer is recorded, and the week is paid under them.
    await recordNonexempt(trip)
    const mine = await row(trip)
    expect(mine.exemptHeld).toBeNull()
    expect(mine.heldHours ?? 0).toBe(0)
    expect(mine.totalApprovedHours).toBe(46)
  })

  it('recording not exempt does not release a week worked in a country with no rule, and the row offers no exempt answer', async () => {
    // Walk, 2026-11-17: "Not exempt" on this row paid the 46 abroad hours at the usual rate.
    await recordNonexempt(abroad)
    const mine = await row(abroad)
    expect(mine.exemptStatus).toBe('NONEXEMPT')
    expect(mine.heldHours).toBe(46)
    expect(mine.exemptReleases).toBe(false)
    expect(mine.exemptHeld).toContain('Recording whether Rhea Castellan is exempt does not release it.')
    const paid = await run(abroad, 'process')
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    expect(paid.body.data.details.find((x: any) => x.buyContractId === abroad.buyId).grossPay).toBe(0)
    const f = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-06-07&to=2026-06-13&provider=GENERIC')
    expect(f.body.data.lines.filter((l: any) => l.personName === 'Rhea Castellan')).toHaveLength(0)
    expect(f.body.data.skipped.find((k: any) => k.personName === 'Rhea Castellan')?.action)
      .toBe('Paid once Etyme records an overtime rule for India, or the work location is moved.')
  })

  it('a held week is paid once, after the work location is moved, never twice', async () => {
    await prisma.sellContract.update({ where: { id: abroad.sellId }, data: { workLocationId: siteHome } })
    const mine = await row(abroad)
    // At a US site with not exempt recorded: the country hold is gone.
    expect(mine.exemptHeld ?? '').not.toContain('worked in India')
    // Recording the answer again changes nothing; the move released it.
    await recordNonexempt(abroad)
    expect((await run(abroad, 'calculate')).status).toBe(200)
    const paid = await run(abroad, 'process')
    const gross = paid.body.data.details.find((x: any) => x.buyContractId === abroad.buyId).grossPay
    expect(gross).toBe(40 * 9_600 + 6 * 14_400) // the 46-hour week, once; the 40-hour week was paid before
    const again = await run(abroad, 'process')
    expect(again.body.data.details.find((x: any) => x.buyContractId === abroad.buyId).grossPay).toBe(0)
  })
})
