import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'
import { GET as ap } from '@/app/api/ap/route'
import { GET as myWork } from '@/app/api/me/work/route'

/**
 * A W-2 employee on a placement with no end date: the walk of 2026-11-14.
 *
 * Her line has no pay dates, because an open-ended placement gets none
 * written. Her accepted weeks read "Processed" on the Payroll page before
 * anybody had paid her, the page offered nothing to work her pay out or
 * mark it paid, and the Owner's cash flow read Payroll due $0.00.
 *
 * The world this file makes, at Brightmoor Staffing: Nadia Okonjo starts
 * on Sunday 6 September 2026 at $45 an hour, W-2, with no end date and no
 * pay dates. Two weeks of forty hours are accepted. A third week of 46
 * hours is filed and not approved yet. Nobody has paid anything.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const NADIA = 'nadia.okonjo@open-ended.etyme.invalid'
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

let firmId = ''
let buyId = ''
let sellId = ''
let personId = ''
let clientName = ''

async function week(sunday: string, perDay: number, accepted: boolean) {
  const sun = d(sunday)
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[iso(new Date(+sun + i * 86_400_000))] = perDay
  const sat = new Date(+sun + 6 * 86_400_000)
  const total = perDay * 5
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: sun, periodEnd: sat, days, totalHours: total,
      status: accepted ? 'APPROVED' : 'SUBMITTED', submittedAt: sat,
      ...(accepted ? { approvedAt: sat, clientApprovedAt: sat, employerAcceptedAt: sat } : {}),
    },
  })
  if (accepted) {
    await prisma.workAssertion.create({
      data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 4_500, state: 'LIVE' },
    })
  }
}

async function row(period = '2026-09') {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', `/api/payroll?period=${period}`)))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return { data: r.body.data, mine: r.body.data.payItems.find((p: any) => p.buyContractId === buyId) }
}

beforeAll(async () => {
  await freshWorld()
  const firm = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  firmId = firm.id
  const theirs = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: firmId, clientCompanyId: { not: firmId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { clientCompanyId: true, clientCompany: { select: { name: true } } },
  })
  clientName = theirs.clientCompany!.name

  const nadia = await prisma.person.create({ data: { name: 'Nadia Okonjo', primaryEmail: NADIA } })
  personId = nadia.id
  await prisma.context.create({
    data: { personId, companyId: firmId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' },
  })
  const start = d('2026-09-06')
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: theirs.clientCompanyId, personId, billRate: 7_000, startDate: start, state: 'IN_PROGRESS' },
  })
  sellId = sell.id
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId, payRate: 4_500, startDate: start } },
    },
  })
  buyId = buy.id
  await prisma.contractLink.create({ data: { sellContractId: sellId, buyContractId: buyId, effectiveFrom: start } })

  await week('2026-09-06', 8, true)
  await week('2026-09-13', 8, true)
  await week('2026-09-20', 9.2, false)

  expect(await prisma.cycle.count({ where: { buyContractId: buyId } })).toBe(0)
}, 900_000)

describe('a placement with no end date and accepted hours nobody has paid is owed, never processed', () => {
  it('reads as pending on the payroll page, with her accepted hours and gross pay, and never as processed', async () => {
    const { mine } = await row()
    expect(mine, 'her row on the September run').toBeTruthy()
    expect(mine.totalApprovedHours).toBe(80)
    expect(mine.grossPay).toBe(360_000)
    expect(mine.payStatus).toBe('PENDING')
    expect(mine.nextPayDate).toBeNull()
  })

  it('names the week filed and not approved inside the period, and leaves it out of gross pay', async () => {
    const { mine } = await row()
    expect(mine.notAccepted).toBe(
      `Nadia Okonjo's week of Sep 20 – Sep 26, 2026, 46 hours, is not in this pay until ${clientName} approves it and Brightmoor Staffing accepts it.`
    )
    expect(mine.totalApprovedHours).toBe(80)
  })

  it('says which pay period the company set, that the page lists pay by calendar month, and where the Owner sets the first day', async () => {
    const { data } = await row()
    expect(data.periodSays).toMatch(
      /^Brightmoor Staffing pays (every other week|every week), but this page lists pay by calendar month until the first pay period's first day is set\. The Owner sets it in Settings, under Cycles, then Payroll: "First pay period starts on"\.$|^Brightmoor Staffing pays (twice a month|once a month), so this page lists pay by calendar month\.$/
    )
  })

  it('reads as owed on the Owner’s cash flow, by name and amount, rather than as nought', async () => {
    as(BRIGHTMOOR)
    const r = await json(await ap(req('GET', '/api/ap?view=cash-flow&period=90d&grain=month')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const said = (r.body.data.says as string[]).find((s) => s.startsWith('Payroll due leaves out accepted pay that has no pay date set:'))
    expect(said, JSON.stringify(r.body.data.says)).toBeTruthy()
    expect(said).toContain('Nadia Okonjo, $3,600.00 for September 2026')
  })

  it('reads as owed to her on her own page, the same hours the payroll row shows', async () => {
    as(NADIA)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.owed.says).toContain('$3,600.00 is owed to you, for 80 hours Brightmoor Staffing accepted and has not paid yet.')
  })

  it('the pay file names the person, her hours, her rate and her gross pay for the period', async () => {
    as(BRIGHTMOOR)
    const res = await payrollExport(req('GET', '/api/payroll/export?provider=GENERIC&format=csv&from=2026-09-01&to=2026-09-30'))
    expect(res.status).toBe(200)
    const csv = await res.text()
    const [head, ...lines] = csv.split('\n')
    const cols = head.split(',')
    const hers = lines.map((l) => l.split(',')).filter((c) => c[cols.indexOf('name')] === 'Nadia Okonjo')
    expect(hers.length).toBeGreaterThan(0)
    const sum = (k: string) => hers.reduce((n, c) => n + Number(c[cols.indexOf(k)]), 0)
    expect(sum('hours')).toBe(80)
    expect(new Set(hers.map((c) => c[cols.indexOf('rate')]))).toEqual(new Set(['45.00']))
    expect(sum('regular_amount') + sum('overtime_amount')).toBe(3600)
  })
})

describe('with no pay dates written, the payroll person can still work her pay out and mark it paid', () => {
  it('working her pay out moves her row to calculated, ready to be marked paid', async () => {
    as(BRIGHTMOOR)
    const r = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period: '2026-09' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await row()).mine.payStatus).toBe('CALCULATED')
  })

  it('marking the period paid moves her row to processed, and only then', async () => {
    as(BRIGHTMOOR)
    const r = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'process', period: '2026-09' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const paid = r.body.data.details.find((x: any) => x.buyContractId === buyId)
    expect(paid.grossPay).toBe(360_000)
    expect((await row()).mine.payStatus).toBe('PROCESSED')
  })

  it('she then reads both weeks as paid, on the day the run was made, and nothing owed', async () => {
    as(NADIA)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    const weeks = (r.body.data.owed.weeks as any[]).filter((w) => w.stage === 'PAID')
    expect(weeks).toHaveLength(2)
    const today = new Date().toISOString().slice(0, 10)
    for (const w of weeks) expect(w.paidOn).toBe(today)
    expect(r.body.data.owed.says).toContain('Nothing is owed to you right now.')
  })

  it('the cash flow no longer names her pay as due once it is paid', async () => {
    as(BRIGHTMOOR)
    const r = await json(await ap(req('GET', '/api/ap?view=cash-flow&period=90d&grain=month')))
    const said = (r.body.data.says as string[]).join(' ')
    expect(said).not.toContain('Nadia Okonjo')
  })
})
