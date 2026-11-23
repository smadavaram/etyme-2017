/**
 * The payroll draft agent (record 112, chain 4) on the database through the
 * real runner and the real payroll routes. Builds its own firm on reserved
 * domains. October 2026 has accepted weeks and is drafted; September 2026 was
 * already paid by a run and is not.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { payrollDraftAgent, PAYROLL_DRAFT as KEY } from '@/lib/agents/payroll-draft'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as drafts } from '@/app/api/payroll/drafts/route'

const tag = `pd${Date.now()}`
const w: Record<string, any> = {}
const NOW = new Date('2026-11-23T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)
const mail = (n: string) => `${n}.${tag}@example.invalid`

async function person(name: string) {
  return prisma.person.create({ data: { name, primaryEmail: mail(name.toLowerCase().replace(/\s/g, '.')) } })
}
/** A W2 line with a sell line behind it, paid monthly at $66 an hour. */
async function line(who: any, exempt: boolean) {
  const start = d('2026-09-01')
  const sell = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: who.id, billRate: 11_200, startDate: start, state: 'IN_PROGRESS' } })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: w.firm.id, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT', overtimeAfterHours: 40, overtimeMultiplierBps: 15_000,
      candidates: { create: { personId: who.id, payRate: 6_600, startDate: start } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
  if (exempt) {
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buy.id, personId: who.id, assertedByCompanyId: w.firm.id, status: 'NONEXEMPT', wageRule: 'US_FLSA',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.', assertedById: w.owner.id,
      } as any,
    })
  }
  return { sell, buy }
}
/** One accepted week, Monday to Friday, `perDay` hours a day. */
async function week(l: { sell: any }, who: any, monday: string, perDay: number) {
  const m = d(monday)
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = perDay
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sell.id, personId: who.id, periodStart: m, periodEnd: end, days, totalHours: perDay * 5,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end, employerAcceptedById: w.owner.id,
    },
  })
  await prisma.workAssertion.create({ data: { timesheetId: ts.id, companyId: w.firm.id, role: 'EMPLOYER_ACCEPTANCE', hours: perDay * 5, rateCents: 6_600, state: 'LIVE', byId: w.owner.id } })
  return ts
}
const setSwitch = (state: 'OFF' | 'DRAFT_ONLY' | 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey: KEY } },
  update: { state }, create: { companyId: w.firm.id, agentKey: KEY, state, changedById: w.owner.id },
})
const run = (n = NOW) => { registerAgent(KEY, payrollDraftAgent); return runAgent(KEY, w.firm.id, n) }
const call = async (seat: any, fn: any, method: string, url: string, body?: unknown) => {
  as(seat.email)
  return json(await fn(req(method, url, body, { 'x-context-id': seat.ctx })))
}
const draftsOf = () => prisma.payrollDraft.findMany({ where: { companyId: w.firm.id }, orderBy: { createdAt: 'asc' } })
const cards = () => prisma.decisionItem.findMany({ where: { companyId: w.firm.id }, orderBy: { createdAt: 'asc' } })

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Draft Firm ${tag}`, slug: `draft-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Draft Client ${tag}`, slug: `draft-client-${tag}`, kind: 'CLIENT' } as any })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Draft Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const roles = { owner: await role('Owner', ['*']), ap: await role('AP & Payroll', ['payroll.read', 'payroll.run']), hr: await role('HR', []) }
  const seat = async (name: string, r: any) => {
    const p = await person(name)
    const c = await prisma.context.create({ data: { personId: p.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: r.id } as any })
    return { ...p, personId: p.id, email: p.primaryEmail, ctx: c.id }
  }
  w.owner = await seat('Dana Owner', roles.owner); w.clerk = await seat('Ravi Payroll', roles.ap); w.hr = await seat('Hana Hiring', roles.hr)

  w.leila = await person('Leila Farouk'); w.mo = await person('Mo Ito')
  w.leilaLine = await line(w.leila, true)
  w.moLine = await line(w.mo, false)
  // October: four accepted weeks of 40 for Leila, and a 45-hour week for Mo, whose exemption nobody has recorded.
  for (const m of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']) await week(w.leilaLine, w.leila, m, 8)
  await week(w.moLine, w.mo, '2026-10-05', 9)
  // September: three weeks, which a processed run already paid, day by day.
  const paid: any[] = []
  for (const m of ['2026-09-07', '2026-09-14', '2026-09-21']) {
    const ts = await week(w.leilaLine, w.leila, m, 8)
    for (const day of Object.keys(ts.days as object)) paid.push({ personId: w.leila.id, timesheetId: ts.id, day, hours: 8, rateCents: 6_600 })
  }
  await prisma.automationLog.create({
    data: {
      companyId: w.firm.id, action: 'PAYROLL_RUN', summary: 'Payroll process: 1 contracts', reason: 'Payroll process initiated by test', reversible: false,
      payload: { action: 'process', period: '2026-09', contracts: [{ buyContractId: w.leilaLine.buy.id, buyContractCandidateId: 'x', person: 'Leila Farouk', hours: 120, grossPay: 792_000, currency: 'USD', refused: null, paid, premiumsPriced: true }], runBy: w.owner.id, runAt: '2026-10-05T00:00:00Z' } as any,
    },
  })
}, 600_000)
afterEach(() => unregisterAgent(KEY))

describe('the payroll draft agent, on the database', () => {
  it('an agent that is off drafts nothing and opens no card', async () => {
    const out = await run()
    expect(out.ran).toBe(false)
    expect(await draftsOf()).toHaveLength(0)
    expect(await cards()).toHaveLength(0)
  })

  it('a period already run is not drafted', async () => {
    await setSwitch('ON')
    await run()
    const periods = (await draftsOf()).map((x) => `${iso(x.periodStart)}..${iso(x.periodEnd)}`)
    expect(periods).toEqual(['2026-10-01..2026-10-31'])
  })

  it('a payroll draft is built from accepted weeks: the run’s own hours and gross for each person, and the held week with its reason', async () => {
    const [draft] = await draftsOf()
    const rows = draft.rows as any[]
    const leila = rows.find((r) => r.person === 'Leila Farouk')
    expect([leila.hours, leila.grossPay, leila.currency]).toEqual([160, 160 * 6_600, 'USD'])
    const mo = rows.find((r) => r.person === 'Mo Ito')
    expect(mo.hours).toBe(0)
    expect(mo.held.join(' ')).toMatch(/exempt/i)
  })

  it('the draft’s card names the period and the people, is owed by AP & Payroll, and keeps the total in its proof', async () => {
    const [card] = await cards()
    expect(card.question).toBe('Payroll draft for October 2026 is ready: 2 people. Review and run it in Payroll.')
    expect(card.ownerPersonId).toBe(w.clerk.id)
    expect(card.proof).toMatch(/Draft by the payroll agent, not run\..*October 2026: 2 people, total gross \$10,560\.00/)
    expect(card.proofLinks).toEqual([{ recordType: 'PayrollDraft', recordId: (await draftsOf())[0].id }])
    expect((await draftsOf())[0].decisionId).toBe(card.id)
  })

  it('the payroll agent never runs or releases payroll: no run is logged, no pay day is marked, nothing is paid', async () => {
    expect(await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'PAYROLL_RUN', payload: { path: ['action'], not: 'process' } as any } })).toBe(0)
    expect(await prisma.cycle.count({ where: { buyContractId: w.leilaLine.buy.id, completedAt: { not: null } } })).toBe(0)
    expect(await prisma.payment.count({ where: { receivedByCompanyId: w.firm.id } })).toBe(0)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id } })).toBe(0)
  })

  it('the draft is on the ledger as the agent, and the act says it was not run', async () => {
    const [draft] = await draftsOf()
    const rows = await prisma.recordAction.findMany({ where: { companyId: w.firm.id, recordType: 'PayrollDraft', recordId: draft.id } })
    expect(rows.map((r) => [r.action, r.agentKey, r.heldAs, r.ruleVersion])).toEqual([['PAYROLL_DRAFTED', KEY, 'agent', 'payroll-draft-v1']])
    expect(rows[0].summary).toMatch(/Not run: running it is a person’s/)
  })

  it('a period already drafted unchanged is not drafted again and opens no second card', async () => {
    await run(new Date('2026-11-24T12:00:00Z'))
    expect(await draftsOf()).toHaveLength(1)
    expect(await cards()).toHaveLength(1)
  })

  it('the draft holds the figures the payroll run itself calculates for the same period', async () => {
    const r = await call(w.owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [w.leilaLine.buy.id, w.moLine.buy.id], action: 'calculate', period: '2026-10' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const [draft] = await draftsOf()
    for (const row of draft.rows as any[]) {
      const real = r.body.data.details.find((x: any) => x.buyContractCandidateId === row.buyContractCandidateId)
      expect([row.hours, row.grossPay]).toEqual([real.totalHours, real.grossPay])
    }
  })

  it('the draft shows on the payroll screen’s route, labeled, to a seat that reads payroll, and to nobody else', async () => {
    const ok = await call(w.clerk, drafts, 'GET', '/api/payroll/drafts')
    expect(ok.status).toBe(200)
    expect(ok.body.data.label).toBe('Draft by the payroll agent, not run')
    expect(ok.body.data.drafts).toHaveLength(1)
    expect(ok.body.data.drafts[0]).toMatchObject({ period: expect.stringContaining('Oct'), people: 2 })
    expect(ok.body.data.drafts[0].totalGross).toBe('$10,560.00')
    const no = await call(w.hr, drafts, 'GET', '/api/payroll/drafts')
    expect(no.status).toBe(403)
  })

  it('a draft that changed replaces the earlier one and opens a new card that says so', async () => {
    const asha = await person('Asha Rao')
    const ashaLine = await line(asha, true)
    await week(ashaLine, asha, '2026-10-12', 8)
    await run(new Date('2026-11-25T12:00:00Z'))
    const all = await draftsOf()
    expect(all.map((x) => x.state)).toContain('SUPERSEDED')
    expect(all.filter((x) => x.state === 'DRAFT')).toHaveLength(1)
    const cs = await cards()
    expect(cs).toHaveLength(2)
    expect(cs[1].proof).toMatch(/replaces an earlier draft/)
  })
})
