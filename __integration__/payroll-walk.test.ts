import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma, as, req, json } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as payroll } from '@/app/api/payroll/route'
import { GET as statutory } from '@/app/api/payroll/statutory/route'

/**
 * The payroll screens, walked on the seeded world as Teleworld and
 * Brightmoor — the four things a browser walk found on 2026-09-30.
 * The pure rules are in __tests__/invariants/payroll-walk.test.ts; this
 * is the same sentences against the real routes and the real seed.
 */

const D = '@demo.etyme.local'
const TELEWORLD = `world-teleworld${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const ym = (d: Date) => d.toISOString().slice(0, 7)

async function rows(who: string, period?: string) {
  as(who)
  const r = await json(await payroll(req('GET', `/api/payroll${period ? `?period=${period}` : ''}`)))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data as { payItems: any[]; summary: any }
}

let karthik: { start: Date; end: Date; pays: { dueOn: Date; completedAt: Date | null }[] }

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
  const bc = await prisma.buyContract.findFirstOrThrow({
    where: { candidates: { some: { person: { name: 'Karthik Menon' } } }, company: { name: 'Teleworld Solutions' } },
    select: { startDate: true, endDate: true, state: true, buyCycles: { where: { kind: 'SALARY_PAY' }, select: { dueOn: true, completedAt: true } } },
  })
  expect(bc.state).toBe('ENDED')
  karthik = { start: bc.startDate, end: bc.endDate!, pays: bc.buyCycles }
}, 600_000)

describe('a placement that has ended is still on the payroll for the months it worked', () => {
  it('a worker whose placement has ended is still on the payroll for every month they worked', async () => {
    const months: string[] = []
    for (let d = new Date(karthik.start); d <= karthik.end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(ym(d))
    expect(months).toHaveLength(3)
    for (const m of months) {
      const data = await rows(TELEWORLD, m)
      const row = data.payItems.find((p) => p.person.name === 'Karthik Menon')
      expect(row, `Karthik Menon on Teleworld's ${m} run`).toBeTruthy()
      expect(row.totalApprovedHours).toBeGreaterThan(0)
      expect(data.summary.byContractType.W2.count).toBeGreaterThanOrEqual(1)
    }
  })

  it('a month whose pay day the run has already settled reads as processed, not pending', async () => {
    const data = await rows(TELEWORLD, ym(karthik.end))
    expect(data.payItems.find((p) => p.person.name === 'Karthik Menon').payStatus).toBe('PROCESSED')
  })

  it('an ended placement is not on the run for the month after its last day', async () => {
    const after = new Date(Date.UTC(karthik.end.getUTCFullYear(), karthik.end.getUTCMonth() + 1, 1))
    const data = await rows(TELEWORLD, ym(after))
    expect(data.payItems.find((p) => p.person.name === 'Karthik Menon')).toBeUndefined()
  })

  it('an ended placement whose last month is paid is not a row on the view of every period', async () => {
    const data = await rows(TELEWORLD)
    expect(data.payItems.find((p) => p.person.name === 'Karthik Menon')).toBeUndefined()
  })
})

describe('the client on a pay row is the client the work is for', () => {
  it('a corp-to-corp worker’s client is the client the employer bills, never the employer itself', async () => {
    const bm = await rows(BRIGHTMOOR)
    const ravi = bm.payItems.find((p) => p.person.name === 'Ravi Subramanian')
    expect(ravi.client?.name).toBe('Nordway Retail')
    for (const ts of ravi.timesheets) expect(ts.clientCompany?.name).not.toBe('Brightmoor Staffing')

    const tw = await rows(TELEWORLD)
    const marcus = tw.payItems.find((p) => p.person.name === 'Marcus Whitfield')
    expect(marcus.client?.name).toBe('Corveldt Aerospace')
    for (const ts of marcus.timesheets) expect(ts.clientCompany?.name).not.toBe('Teleworld Solutions')
  })
})

describe('deposit deadlines follow the pay days on the lines', () => {
  it('Teleworld’s deposit dates are the days Karthik Menon was paid, one a month, not a date for every week', async () => {
    as(TELEWORLD)
    const year = new Date().getUTCFullYear()
    const r = await json(await statutory(req('GET', `/api/payroll/statutory?year=${year}`)))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const listed = r.body.data.deposits.deadlines
      .filter((d: any) => d.paid)
      .map((d: any) => String(d.payDay).slice(0, 10))
    const paid = karthik.pays
      .filter((c) => c.completedAt && c.completedAt.getUTCFullYear() === year)
      .map((c) => c.completedAt!.toISOString().slice(0, 10))
    for (const day of paid) expect(listed).toContain(day)
    // Three months of work is three pay days, never thirteen weeks.
    expect(listed.length).toBeLessThan(13)
  })

  it('every deposit date at Brightmoor is a pay day on a W-2 line, and none is the week a posting fell in', async () => {
    as(BRIGHTMOOR)
    const year = new Date().getUTCFullYear()
    const r = await json(await statutory(req('GET', `/api/payroll/statutory?year=${year}`)))
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Brightmoor Staffing' } })
    const cycles = await prisma.cycle.findMany({
      where: { kind: 'SALARY_PAY', buyContract: { companyId: company.id, contractType: { in: ['W2', 'C2H_W2'] } } },
      select: { dueOn: true, completedAt: true },
    })
    const days = new Set(cycles.map((c) => (c.completedAt ?? c.dueOn).toISOString().slice(0, 10)))
    for (const d of r.body.data.deposits.deadlines) expect(days).toContain(String(d.payDay).slice(0, 10))
  })
})

describe('a worker placed mid-month with no week filed in it', () => {
  it('Omar Haddad reads no hours for the month he started when no week of his falls in it, and is paid for the weeks he filed', async () => {
    const omar = await prisma.buyContractCandidate.findFirstOrThrow({
      where: { person: { name: 'Omar Haddad' }, buyContract: { company: { name: 'Brightmoor Staffing' } } },
      select: { startDate: true, personId: true },
    })
    const sheets = await prisma.timesheet.findMany({
      where: { personId: omar.personId, assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
      select: { periodStart: true, periodEnd: true, days: true },
      orderBy: { periodStart: 'asc' },
    })
    const startMonth = ym(omar.startDate)
    const workedIn = (m: string) => sheets.some((s) => Object.keys((s.days ?? {}) as object).some((d) => d.startsWith(m)))
    const start = (await rows(BRIGHTMOOR, startMonth)).payItems.find((p) => p.person.name === 'Omar Haddad')
    if (!workedIn(startMonth)) expect(start.payStatus).toBe('NO_HOURS')
    const firstWorked = Object.keys((sheets[0].days ?? {}) as object).sort()[0].slice(0, 7)
    const paidMonth = (await rows(BRIGHTMOOR, firstWorked)).payItems.find((p) => p.person.name === 'Omar Haddad')
    expect(paidMonth.totalApprovedHours).toBeGreaterThan(0)
  })
})

describe('wages count in the year they were paid', () => {
  it('Karthik Menon’s W-2 wages are what Teleworld’s runs paid him, in the year they ran, and the screen says the rule', async () => {
    as(TELEWORLD)
    const year = new Date().getUTCFullYear()
    const r = await json(await statutory(req('GET', `/api/payroll/statutory?year=${year}`)))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.pack.yearPaidSays).toBe('Wages count in the year they were paid.')
    const k = r.body.data.pack.summaries.find((s: any) => s.personName === 'Karthik Menon')
    // Every weekday of three whole months at $89, all paid by runs this year.
    const runs = await prisma.automationLog.findMany({ where: { action: 'PAYROLL_RUN' }, select: { at: true, payload: true } })
    const paidThisYear = runs
      .filter((x) => x.at.getUTCFullYear() === year)
      .flatMap((x) => ((x.payload as any)?.contracts ?? []).filter((c: any) => c.person === 'Karthik Menon'))
      .reduce((n: number, c: any) => n + c.grossPay, 0)
    expect(paidThisYear).toBeGreaterThan(0)
    expect(k.grossCents).toBe(paidThisYear)
  })

  it('a firm with weeks accepted and not yet paid is told they count in the year a run pays them', async () => {
    as(BRIGHTMOOR)
    const year = new Date().getUTCFullYear()
    const r = await json(await statutory(req('GET', `/api/payroll/statutory?year=${year}`)))
    expect(r.body.data.pack.unpaidSays).toMatch(/not yet paid/)
  })
})
