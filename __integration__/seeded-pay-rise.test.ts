import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { rateChangeDates, RATE_CHANGE_PERSON, RATE_CHANGE_DEPARTMENT } from '@/lib/seed-rate-change'
import { runAtFor } from '@/lib/seed-payroll-runs'
import { EMPLOYEE_CONTRACT_TYPES } from '@/lib/money/paid-through'
import { seedToday, anchorSeed } from '@/lib/seed-days'
import { costCenterCode } from '@/lib/seed-coding'
import { shortDay } from '@/lib/consultant-portfolio'
import { weekStart, weekEnd } from '@/lib/overtime'

import { GET as payrollExport } from '@/app/api/payroll/export/route'
import { GET as profitability } from '@/app/api/profitability/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as rateHistory } from '@/app/api/rate-history/route'
import { GET as budget } from '@/app/api/program/budget/route'

/**
 * The pay rise the founder asked to see, on the seeded world.
 *
 * Rosa Delgado, a warehouse systems analyst at Northbend Athletic on
 * Brightmoor Staffing's own payroll, billed at $112 and paid $66. Five
 * months of signed weeks, then $70 from the first Wednesday of month
 * six, approved by a second desk, and one payroll run already made for
 * the month before the rise. `__integration__/pay-rate-change.test.ts`
 * proves the product handles this; this file proves the demo shows it.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const DAY = 86_400_000

const PAYROLL_DESK = 'world-brightmoor-payroll@demo.etyme.local'
const OWNER = 'world-brightmoor@demo.etyme.local'
const NORTHBEND_HIRING = 'world-nike-hiring@demo.etyme.local'
const NORTHBEND_OWNER = 'world-nike@demo.etyme.local'
const DISTRIBUTION = costCenterCode(RATE_CHANGE_DEPARTMENT.code, 'Northbend Athletic')

let personId = ''
let sellId = ''
let buyId = ''
let dates: ReturnType<typeof rateChangeDates>

/** Every day she worked, and its hours, across every week on the line. */
const days = async () => {
  const sheets = await prisma.timesheet.findMany({ where: { sellContractId: sellId }, orderBy: { periodStart: 'asc' } })
  const out: Record<string, number> = {}
  for (const s of sheets) for (const [d, h] of Object.entries(s.days as Record<string, number>)) out[d] = Number(h)
  return out
}
const payFor = (d: string, h: number) => h * (d >= iso(dates.rise) ? 7_000 : 6_600)

/** Every processed run on her line, as the automation log holds it. */
const runsOnHerLine = async () =>
  (await prisma.automationLog.findMany({
    where: { action: 'PAYROLL_RUN', payload: { path: ['contracts', '0', 'buyContractId'], equals: buyId } },
    select: { payload: true, at: true },
    orderBy: { at: 'asc' },
  })).map((r) => (r.payload as any).contracts[0] as { payPeriod: { start: string; end: string }; paid: { day: string; hours: number }[] })

/** YYYY-MM of a date or an ISO day. */
const monthOf = (d: Date | string) => (typeof d === 'string' ? d : iso(d)).slice(0, 7)

/**
 * The months whose payroll run had been pressed by the day the world was
 * born, read by the seed's own rule rather than a second copy of it.
 *
 * A run is pressed five days after its month ends at 17:00, or an hour
 * after the employer's last acceptance on a week holding a day of the
 * month, whichever is later, and only if that is no later than 17:00 the
 * evening before the world was born (lib/seed-payroll-runs, runAtFor).
 * This used to be one calendar comparison, month-end + 6 on or before
 * today, which forgot the acceptance: the week that crosses a month's end
 * is accepted on the Tuesday after its Saturday, which can be later than
 * five days past the month. Born 2026-10-07, September's last week was
 * accepted on Oct 6 at 17:00, so its run falls at 18:00 that evening,
 * past the seed's cut-off, and is not written — September is owed, due
 * on its pay day, Oct 9. The comparison said its run had come.
 *
 * Read off the world's own birthday (the harness anchors it) and its own
 * acceptances, so it holds whatever day the template was built.
 */
async function monthsRunCame(personId: string): Promise<Set<string>> {
  const employers = new Set((await prisma.buyContract.findMany({
    where: {
      vendorCompanyId: null, supplierSellContractId: null,
      contractType: { in: [...EMPLOYEE_CONTRACT_TYPES] as any },
      candidates: { some: { personId } },
    },
    select: { companyId: true },
  })).map((l) => l.companyId))
  const sheets = await prisma.timesheet.findMany({
    where: { personId },
    select: {
      days: true, periodStart: true, periodEnd: true,
      assertions: { where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' }, select: { companyId: true, at: true } },
    },
  })
  const months = new Set(sheets.flatMap((s) => Object.keys(s.days as Record<string, number>)).map((d) => d.slice(0, 7)))
  const came = new Set<string>()
  for (const month of months) {
    const [y, m] = month.split('-').map(Number)
    const period = { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)), label: month }
    const accepted = sheets
      .filter((s) => s.periodStart <= period.end && s.periodEnd >= period.start)
      .flatMap((s) => s.assertions.filter((a) => employers.has(a.companyId)).map((a) => a.at))
    if (runAtFor(period, accepted)) came.add(month)
  }
  return came
}

async function census() {
  return {
    timesheets: await prisma.timesheet.count({ where: { sellContractId: sellId } }),
    assertions: await prisma.workAssertion.count({ where: { timesheet: { sellContractId: sellId } } }),
    rates: await prisma.rateHistory.count({ where: { contractId: { in: [sellId, buyId] } } }),
    runs: await prisma.automationLog.count({ where: { action: 'PAYROLL_RUN', payload: { path: ['contracts', '0', 'buyContractId'], equals: buyId } } }),
    postings: await prisma.orderPosting.count({ where: { personId } }),
    cycles: await prisma.cycle.count({ where: { OR: [{ sellContractId: sellId }, { buyContractId: buyId }] } }),
    people: await prisma.person.count(),
    verifications: await prisma.verification.count({ where: { personId } }),
    allocations: await prisma.contractCostAllocation.count({ where: { sellContractId: sellId } }),
    costCenters: await prisma.costCenter.count({ where: { code: DISTRIBUTION } }),
    plans: await prisma.headcountPlan.count({ where: { costCenter: { code: DISTRIBUTION } } }),
  }
}

beforeAll(async () => {
  await freshWorld()
  dates = rateChangeDates()
  const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: RATE_CHANGE_PERSON.email } })
  personId = person.id
  const sell = await prisma.sellContract.findFirstOrThrow({ where: { personId }, include: { buyLinks: true } })
  sellId = sell.id
  buyId = sell.buyLinks[0].buyContractId
}, 900_000)

describe('a pay rise on the seeded world', () => {
  it('the demo holds a consultant with five months of weeks at $66 before a raise', async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { sellContractId: sellId },
      include: { assertions: true },
      orderBy: { periodStart: 'asc' },
    })
    const before = sheets.filter((s) => s.periodEnd < dates.rise && s.periodEnd < new Date(+dates.rise - 2 * DAY))
    // Five months of Mondays is twenty-one weeks at the least.
    expect(before.length).toBeGreaterThanOrEqual(21)
    expect(+dates.rise - +dates.start).toBeGreaterThanOrEqual(150 * DAY)
    expect(dates.rise.getUTCDay(), 'the rise lands on a Wednesday').toBe(3)
    for (const s of before) {
      expect(s.status).toBe('APPROVED')
      const client = s.assertions.find((a) => a.role === 'CLIENT_APPROVAL')!
      const employer = s.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE')!
      // The client signs at what it is billed; the employer accepts at
      // what it pays, never at the bill rate.
      expect(client.rateCents).toBe(11_200)
      expect(employer.rateCents).toBe(6_600)
      expect(+employer.at).toBeGreaterThan(+client.at)
    }
    // And the weeks go on past the rise.
    expect(sheets.filter((s) => s.periodStart >= dates.straddleWeek).length).toBeGreaterThanOrEqual(3)
    // Her pay dates are written, and one is paid.
    const pay = await prisma.cycle.findMany({ where: { buyContractId: buyId, kind: 'SALARY_PAY' } })
    expect(pay.length).toBeGreaterThan(0)
    expect(pay.filter((c) => c.completedAt).length).toBeGreaterThanOrEqual(1)
  })

  it('her raise to $70 is approved by a different desk from the one that proposed it, and the $66 row closes the day before', async () => {
    const rows = await prisma.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: buyId },
      orderBy: { fromDate: 'asc' },
    })
    expect(rows.map((r) => [r.rate, r.approvalState])).toEqual([[6_600, 'APPROVED'], [7_000, 'APPROVED']])
    const [opening, rise] = rows
    expect(iso(opening.fromDate)).toBe(iso(dates.start))
    expect(iso(opening.toDate!)).toBe(iso(new Date(+dates.rise - DAY)))
    expect(iso(rise.fromDate)).toBe(iso(dates.rise))
    expect(rise.toDate).toBeNull()
    expect(rise.previousRate).toBe(6_600)
    expect(rise.approvedById).not.toBe(rise.changedById)
    // Approved before any week with a $70 day in it was accepted.
    expect(+rise.approvedAt!).toBeLessThan(+dates.rise)
    // Both desks are at Brightmoor and both may decide a pay rate.
    for (const who of [rise.changedById, rise.approvedById!]) {
      const seat = await prisma.context.findFirstOrThrow({
        where: { personId: who, company: { slug: 'world-brightmoor' }, type: 'EMPLOYEE' },
        include: { role: true },
      })
      expect(seat.role!.permissions.some((p) => p === '*' || p === 'consultants.cost') || seat.role!.permissions.includes('consultants.cost')).toBe(true)
    }
    // The line's own rate is never overwritten.
    const line = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: buyId } })
    expect(line.payRate).toBe(6_600)
  })

  it('the rate history screen shows the owner both rows on her pay line', async () => {
    as(OWNER)
    const r = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(r.status).toBe(200)
    const mine = r.body.data.rateHistory.filter((h: any) => h.contractId === buyId)
    expect(mine.map((h: any) => h.rate).sort()).toEqual([6_600, 7_000])
  })

  it('the week of the raise is paid at $66 for the days before it and $70 from the Wednesday', async () => {
    const all = await days()
    // The sheet runs Sunday to Saturday, and the export selects a sheet by
    // its period end, so the window asked for is the whole week.
    const sunday = weekStart(iso(dates.straddleWeek))
    const saturday = weekEnd(iso(dates.straddleWeek))
    const inWeek = Object.entries(all).filter(([d]) => d >= sunday && d <= saturday)
    const before = inWeek.filter(([d]) => d < iso(dates.rise)).reduce((n, [, h]) => n + h, 0)
    const after = inWeek.filter(([d]) => d >= iso(dates.rise)).reduce((n, [, h]) => n + h, 0)
    expect(after).toBeGreaterThan(0)

    as(PAYROLL_DESK)
    const r = await json(await payrollExport(req('GET', `/api/payroll/export?from=${sunday}&to=${saturday}&provider=GENERIC`)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const mine = r.body.data.lines.filter((l: any) => l.personName === RATE_CHANGE_PERSON.name)
    const expected = [
      ...(before > 0 ? [[before, 6_600, before * 6_600]] : []),
      [after, 7_000, after * 7_000],
    ]
    expect(mine.map((l: any) => [l.hours, l.rateCents, l.totalCents])).toEqual(expected)
  })

  it('Rosa’s own page says the week of the raise was paid at two rates, the hours at each, and the day the raise took effect', async () => {
    const all = await days()
    const monday = iso(dates.straddleWeek)
    const friday = iso(new Date(+dates.straddleWeek + 4 * DAY))
    const inWeek = Object.entries(all).filter(([d]) => d >= monday && d <= friday)
    const before = inWeek.filter(([d]) => d < iso(dates.rise)).reduce((n, [, h]) => n + h, 0)
    const after = inWeek.filter(([d]) => d >= iso(dates.rise)).reduce((n, [, h]) => n + h, 0)
    expect(before, 'the seed puts days on both sides of the raise').toBeGreaterThan(0)

    as(RATE_CHANGE_PERSON.email)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status).toBe(200)
    const week = r.body.data.owed.weeks.find((w: any) => w.weekOf === weekStart(monday))
    expect(week, 'the raise week is not on her page').toBeTruthy()
    expect(week.owedCents).toBe(before * 6_600 + after * 7_000)
    expect(week.says).toContain(
      `${before + after} hours: ${before} at $66 and ${after} at $70, because your raise took effect on ${shortDay(iso(dates.rise))}.`
    )
    expect(week.says).not.toContain('none of them overtime')
  })

  it('the forty-five-hour week after the raise is paid all at $70, with five hours at time and a half', async () => {
    const long = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: sellId, totalHours: 45 } })
    expect(long.periodStart > dates.rise).toBe(true)
    as(PAYROLL_DESK)
    const r = await json(await payrollExport(
      req('GET', `/api/payroll/export?from=${iso(long.periodStart)}&to=${iso(long.periodEnd)}&provider=GENERIC`)
    ))
    const mine = r.body.data.lines.filter((l: any) => l.personName === RATE_CHANGE_PERSON.name)
    expect(mine).toHaveLength(1)
    expect(mine[0].rateCents).toBe(7_000)
    expect(mine[0].hours).toBe(40)
    expect(mine[0].overtimeHours).toBe(5)
    expect(mine[0].overtimeCents).toBe(Math.round(5 * 7_000 * 1.5))
  })

  it('the margin screen prices her pay by the day, overtime premium included, and her bill rate stays $112', async () => {
    const all = await days()
    const hours = Object.values(all).reduce((a, b) => a + b, 0)
    const pay = Object.entries(all).reduce((n, [d, h]) => n + payFor(d, h), 0)
    as(OWNER)
    const r = await json(await profitability(req('GET', '/api/profitability')))
    expect(r.status).toBe(200)
    const row = r.body.data.rows.find((x: any) => x.contractId === sellId)
    expect(row, 'her placement is not on the margin screen').toBeTruthy()
    expect(row.profit.revenueCents).toBe(hours * 11_200)
    // What payroll pays, overtime premium included: half of $70 again on
    // the five hours over the line in her forty-five-hour week.
    expect(row.profit.payCents).toBe(pay + 5 * 3_500)
    expect(row.profit.marginCents).toBeGreaterThan(0)
    expect(row.agreed.payRateCents).toBe(7_000)
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    expect(sell.billRate).toBe(11_200)
  })

  it('her own page shows the $70 she is on now, and what she is owed less the months already paid', async () => {
    const all = await days()
    // Whatever the seeded runs paid, read off the runs themselves.
    const paidDays = new Set((await runsOnHerLine()).flatMap((c) => c.paid.map((l) => l.day)))
    const inRun = Object.entries(all).filter(([d]) => paidDays.has(d))
    const paidHours = inRun.reduce((n, [, h]) => n + h, 0)
    const paidCents = inRun.reduce((n, [d, h]) => n + payFor(d, h), 0)
    const allHours = Object.values(all).reduce((a, b) => a + b, 0)
    const allCents = Object.entries(all).reduce((n, [d, h]) => n + payFor(d, h), 0)

    // The forty-five-hour week's premium — half of $70 again on five
    // hours — is paid by the seeded run for its month since 2026-09-30,
    // priced through sheetPay. Only where that week is in this month, which
    // no run has reached, is it still owed on top.
    const long = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: sellId, totalHours: 45 } })
    const longPaid = Object.keys(long.days as Record<string, number>).some((d) => paidDays.has(d))
    const premium = longPaid ? 0 : 5 * 3_500

    as(RATE_CHANGE_PERSON.email)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status).toBe(200)
    const line = r.body.data.placements.find((p: any) => p.id === sellId)
    expect(line.payRate).toBe(7_000)
    expect(r.body.data.owed.paidHours).toBe(paidHours)
    expect(r.body.data.owed.hours).toBe(allHours - paidHours)
    expect(r.body.data.owed.overtimeHours).toBe(longPaid ? 0 : 5)
    expect(r.body.data.owed.cents).toBe(allCents - paidCents + premium)
  })

  it('Rosa’s own page shows the forty-five-hour week with its overtime, the same figure payroll pays', async () => {
    const long = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: sellId, totalHours: 45 } })

    // What payroll pays for that week, from the payroll file.
    as(PAYROLL_DESK)
    const f = await json(await payrollExport(
      req('GET', `/api/payroll/export?from=${iso(long.periodStart)}&to=${iso(long.periodEnd)}&provider=GENERIC`)
    ))
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    const payroll = f.body.data.lines
      .filter((l: any) => l.personName === RATE_CHANGE_PERSON.name)
      .reduce((n: number, l: any) => n + l.totalCents, 0)

    as(RATE_CHANGE_PERSON.email)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status).toBe(200)
    const week = r.body.data.owed.weeks.find((w: any) => w.weekOf === weekStart(iso(long.periodStart)))
    expect(week, 'the long week is not on her page').toBeTruthy()
    expect([week.hours, week.ordinaryHours, week.overtimeHours]).toEqual([45, 40, 5])
    expect(week.premiumCents).toBe(5 * 3_500)
    // Forty hours at $70 and five at $105: $3,325.00, never $70 × 45.
    expect(week.owedCents).toBe(40 * 7_000 + 5 * 10_500)
    expect(week.owedCents).not.toBe(45 * 7_000)
    expect(week.owedCents).toBe(payroll)
    // A seeded run pays it with its premium, the same figure payroll
    // prices, once its month has ended; in this month nothing has yet.
    const ended = monthOf(long.periodEnd) < monthOf(new Date())
    expect(week.paidCents).toBe(ended ? week.owedCents : 0)
    expect(week.stillOwedCents).toBe(ended ? 0 : week.owedCents)
    expect(week.says).toContain('40 ordinary and 5 overtime')
    expect(week.says).toContain('$175.00')
  })

  it('where no contract draws an overtime line, her page still shows the five hours over forty, because the law draws it', async () => {
    const long = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: sellId, totalHours: 45 } })
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId }, select: { overtimeAfterHours: true } })
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId }, select: { overtimeAfterHours: true } })
    await prisma.buyContract.update({ where: { id: buyId }, data: { overtimeAfterHours: null } })
    await prisma.sellContract.update({ where: { id: sellId }, data: { overtimeAfterHours: null } })
    try {
      as(RATE_CHANGE_PERSON.email)
      const r = await json(await myWork(req('GET', '/api/me/work')))
      expect(r.status).toBe(200)
      const week = r.body.data.owed.weeks.find((w: any) => w.weekOf === weekStart(iso(long.periodStart)))
      expect([week.ordinaryHours, week.overtimeHours]).toEqual([40, 5])
      expect(week.owedCents).toBe(40 * 7_000 + 5 * 10_500)
    } finally {
      await prisma.buyContract.update({ where: { id: buyId }, data: { overtimeAfterHours: buy.overtimeAfterHours } })
      await prisma.sellContract.update({ where: { id: sellId }, data: { overtimeAfterHours: sell.overtimeAfterHours } })
    }
  })

  it('her page never shows what the client is billed for her', async () => {
    as(RATE_CHANGE_PERSON.email)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).not.toMatch(/billRate|bill_rate|billCents/i)
    // Not $112 an hour, and not any week priced at it.
    const numbers: number[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'number') numbers.push(v)
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(r.body)
    expect(numbers).not.toContain(11_200)
    for (const w of r.body.data.owed.weeks) {
      if (w.hours) expect(w.owedCents).not.toBe(Math.round(w.hours * 11_200))
    }
  })

  it('her job is charged to Northbend’s Distribution cost center, and the award carries that coding onto her line', async () => {
    const line = await prisma.sellContract.findUniqueOrThrow({
      where: { id: sellId },
      include: {
        requirement: { include: { costCenter: { include: { owner: true } }, orgUnit: { include: { parent: true } } } },
        costAllocations: { include: { costCenter: true } },
      },
    })
    const job = line.requirement!
    expect(job.companyId).toBe(line.clientCompanyId)
    expect(job.costCenter?.code).toBe(DISTRIBUTION)
    expect(job.costCenter?.companyId).toBe(line.clientCompanyId)
    expect(job.costCenter?.owner?.primaryEmail).toBe(NORTHBEND_OWNER)
    expect(job.orgUnit?.name).toBe('Distribution')
    expect(job.orgUnit?.parent?.name).toBe('Operations')
    // As the award writes it: the line's department is the job's, and
    // the whole line is allocated to the job's cost center.
    expect(line.orgUnitId).toBe(job.orgUnitId)
    expect(line.costAllocations.map((a) => [a.costCenter.code, a.shareBps])).toEqual([[DISTRIBUTION, 10_000]])
  })

  it('every week Northbend signed for her is spent against that cost center’s budget, at $112 an hour', async () => {
    const signed = await prisma.timesheet.findMany({
      where: { sellContractId: sellId, clientApprovedAt: { not: null } },
      select: { totalHours: true },
    })
    const hours = signed.reduce((n, t) => n + Number(t.totalHours), 0)
    expect(hours).toBeGreaterThan(0)

    as(NORTHBEND_HIRING)
    const r = await json(await budget(req('GET', '/api/program/budget')))
    expect(r.status).toBe(200)
    const center = r.body.data.centers.find((c: any) => c.code === DISTRIBUTION)
    expect(center).toBeDefined()
    expect(center.unit).toBe('Distribution')
    expect(center.actualCents).toBe(Math.round(hours * 11_200))
  })

  it('a month whose last week is accepted the evening before the world is born is not yet run that day, and is run from the day after, whatever day the world is born', () => {
    // September 2026: the week of Sep 27 to Oct 3 accepted by her
    // employer on Oct 6 at 17:00, and a month with no late acceptance
    // beside it. Pay day for September is Oct 9 either way.
    const september = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z'), label: 'September 2026' }
    const late = [new Date('2026-10-06T17:00:00Z')]
    const born = seedToday()
    try {
      const runOn = (birthday: string, accepted: Date[] = []) => {
        anchorSeed(new Date(`${birthday}T00:00:00Z`))
        return runAtFor(september, accepted)?.toISOString() ?? null
      }
      // The day before the acceptance, the day of it, the day after.
      expect(runOn('2026-10-06', late)).toBeNull()
      expect(runOn('2026-10-07', late)).toBeNull()
      expect(runOn('2026-10-08', late)).toBe('2026-10-06T18:00:00.000Z')
      // On the pay day itself and after it, the run stands.
      expect(runOn('2026-10-09', late)).toBe('2026-10-06T18:00:00.000Z')
      expect(runOn('2026-10-10', late)).toBe('2026-10-06T18:00:00.000Z')
      // With nothing accepted late the run is five days after the month.
      expect(runOn('2026-10-05')).toBeNull()
      expect(runOn('2026-10-06')).toBe('2026-10-05T17:00:00.000Z')
    } finally {
      anchorSeed(born)
    }
  })

  it('on a fresh demo every month of hers whose pay run day has come is paid by a run of its own, the month holding her forty-five-hour week included, its overtime priced as payroll prices it', async () => {
    const all = await days()
    const now = monthOf(seedToday())
    const came = await monthsRunCame(personId)
    const before = [...new Set(Object.keys(all).map(monthOf))].filter((m) => m < now).sort()
    expect(before.length, 'five months of weeks and more before this one').toBeGreaterThanOrEqual(6)
    // A month whose run falls after the world was born is not run yet.
    const worked = before.filter((m) => came.has(m))
    expect(worked.length).toBeGreaterThanOrEqual(5)

    const runs = await runsOnHerLine()
    const ran = runs.map((c) => monthOf(c.payPeriod.start)).sort()
    expect(ran).toEqual(worked)
    // Each run paid every day of its own month and nothing outside it.
    for (const c of runs) {
      const month = monthOf(c.payPeriod.start)
      expect(c.paid.every((l) => monthOf(l.day) === month)).toBe(true)
      expect(c.paid.map((l) => l.day).sort()).toEqual(Object.keys(all).filter((d) => monthOf(d) === month).sort())
    }
    // And the pay days a run covers are marked paid.
    const paidOn = await prisma.cycle.findMany({ where: { buyContractId: buyId, kind: 'SALARY_PAY', completedAt: { not: null } } })
    expect(paidOn.length).toBeGreaterThanOrEqual(runs.length)
  })

  it('on her page every week in a paid month reads as paid, and only this month, or a month whose run has not come yet, reads as owed', async () => {
    const came = await monthsRunCame(personId)
    const open = new Set([...Object.keys(await days()).map(monthOf), monthOf(seedToday())].filter((m) => !came.has(m)))
    as(RATE_CHANGE_PERSON.email)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status).toBe(200)
    // The page groups by calendar week, Monday on: the months a week's
    // worked days fall in.
    const all = Object.keys(await days())
    const monthsIn = (weekOf: string) => {
      const end = iso(new Date(Date.parse(`${weekOf}T00:00:00Z`) + 6 * DAY))
      return all.filter((d) => d >= weekOf && d <= end).map(monthOf)
    }
    const owedWeeks = r.body.data.owed.weeks.filter((w: any) => w.stillOwedCents > 0)
    // Something is owed exactly when she worked a day in a month no run
    // has paid yet: this month, and last month until its run day comes.
    if (all.some((d) => open.has(monthOf(d)))) expect(owedWeeks.length).toBeGreaterThan(0)
    else expect(owedWeeks.map((w: any) => w.weekOf)).toEqual([])
    for (const w of owedWeeks) {
      expect(monthsIn(w.weekOf).some((m) => open.has(m)), `the week of ${w.weekOf} reads as owed in a month a run paid`).toBe(true)
    }
    for (const w of r.body.data.owed.weeks) {
      const months = monthsIn(w.weekOf)
      if (months.length && months.every((m) => !open.has(m))) expect(w.paidCents, `the week of ${w.weekOf}`).toBe(w.owedCents)
    }
  })

  it('seeding the world twice writes her history once', async () => {
    const first = await census()
    expect(first.timesheets).toBeGreaterThan(24)
    // One run for each month already paid — several, and each once.
    expect(first.runs).toBeGreaterThan(1)
    await seedWorld()
    expect(await census()).toEqual(first)
  }, 900_000)
})
