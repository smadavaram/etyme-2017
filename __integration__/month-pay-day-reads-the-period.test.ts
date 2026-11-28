import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { DEMO_MONTHLY_PAY, writeCyclesFor } from '@/lib/contract-cycles'

/**
 * The month's pay file names the pay day that pays that month, read off
 * the pay day's own row.
 *
 * A W-2 line at Brightmoor Staffing, which pays by the month, started on
 * Wednesday Sep 30, 2026. Its first pay cycle is the one-day period Sep 30
 * to Sep 30, paid Oct 9; its second is October, paid Nov 9. The walk of
 * 2026-11-14 read October's file as "2026-10-09; 2026-11-09", because the
 * pay day's period was guessed from the days since the line started (one
 * of September, nine of October) and not read off the row.
 *
 * The line, its hours and its pay days are this file's own, at fixed
 * dates. It once read a seeded line instead, and the seeded world counts
 * its dates from the day it is built, so the line that started on Sep 30
 * one day started on Oct 1 the next (release check, 2026-11-15). Nothing
 * here is read from the seeded world's dates or from the clock.
 *
 * Calendar facts: Wednesday 30 September 2026, Friday 9 October 2026,
 * Monday 9 November 2026.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const NAME = 'Iris Calloway'
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)

let firmId = ''
let seat = ''
let buyId = ''
let personId = ''
let sellId = ''

async function payDayIn(period: string): Promise<string | null> {
  as(BRIGHTMOOR)
  const res = await payroll(req('GET', `/api/payroll?period=${period}&format=csv&companyId=${firmId}`, undefined, { 'x-context-id': seat }))
  expect(res.status, await res.clone().text()).toBe(200)
  const [head, ...lines] = (await res.text()).trim().split('\n')
  const cols = head.split(',')
  const at = cols.indexOf('Pay day')
  expect(at).toBeGreaterThan(-1)
  const mine = lines.filter((l) => l.startsWith(`${NAME},`))
  expect(mine).toHaveLength(1)
  // Quoted cells hold commas; the cells before "Pay day" are plain.
  return mine[0].split(',')[at] || null
}

/** Accepted as filed, 8 hours on each day named, in the week starting on that Sunday. */
async function week(sunday: string, worked: string[]) {
  const s = d(sunday)
  const days: Record<string, number> = {}
  for (const x of worked) days[x] = 8
  const end = new Date(+s + 6 * 86_400_000)
  const hours = worked.length * 8
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: s, periodEnd: end, days, totalHours: hours,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours, rateCents: 9_600, state: 'LIVE' },
  })
}

const weekdays = (from: string, to: string) => {
  const out: string[] = []
  for (let t = +d(from); t <= +d(to); t += 86_400_000) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) out.push(iso(new Date(t))!)
  }
  return out
}

describe('the month pay file names the pay day its own row says pays that month', () => {
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findFirstOrThrow({ where: { name: 'Brightmoor Staffing' }, select: { id: true } })
    firmId = firm.id
    // A firm that pays by the month, not by periods of its own.
    await prisma.company.update({ where: { id: firmId }, data: { payPeriod: 'MONTHLY', payFirstPeriodStart: null } })
    const ctx = await prisma.context.findFirstOrThrow({
      where: { companyId: firmId, type: 'EMPLOYEE', person: { primaryEmail: BRIGHTMOOR } },
      select: { id: true },
    })
    seat = ctx.id
    // Any client Brightmoor bills; which one does not change a pay day.
    const client = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: firmId }, orderBy: { id: 'asc' }, select: { clientCompanyId: true },
    })

    const start = d('2026-09-30')
    const end = d('2027-06-30')
    const person = await prisma.person.create({ data: { name: NAME, primaryEmail: 'iris@month-pay-day.etyme.invalid' } })
    personId = person.id
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: client.clientCompanyId, personId, billRate: 13_200, startDate: start, endDate: end, state: 'IN_PROGRESS' },
    })
    sellId = sell.id
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, endDate: end, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
        candidates: { create: { personId, payRate: 9_600, payCurrency: 'USD', startDate: start, endDate: end } },
      },
    })
    buyId = buy.id
    await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start, effectiveTo: end } })
    // Its pay days, written by the one writer every line's dates come
    // from, on the monthly pay the seeded lines use, with no holidays.
    await writeCyclesFor(prisma as any, {
      sell, buy, packId: 'US_IT', holidays: new Set<string>(), pay: DEMO_MONTHLY_PAY, payroll: null,
    })

    // Sep 30 in the week of Sep 27, then every weekday of October.
    await week('2026-09-27', ['2026-09-30', '2026-10-01', '2026-10-02'])
    for (const sunday of ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']) {
      const sat = iso(new Date(+d(sunday) + 6 * 86_400_000))!
      await week(sunday, weekdays(sunday, sat))
    }

    // Both months worked out, so each file is offered.
    as(BRIGHTMOOR)
    for (const period of ['2026-09', '2026-10']) {
      const r = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [buyId], action: 'calculate', period }, { 'x-context-id': seat })))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
  }, 900_000)

  it('the line started on Sep 30 and its own rows say Oct 9 pays Sep 30 to Sep 30 and Nov 9 pays October', async () => {
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId }, select: { startDate: true } })
    expect(iso(line.startDate)).toBe('2026-09-30')
    const pays = await prisma.cycle.findMany({
      where: { buyContractId: buyId, kind: 'SALARY_PAY', dueOn: { lt: new Date('2026-11-30T00:00:00Z') } },
      orderBy: { dueOn: 'asc' },
      select: { dueOn: true, periodStart: true, periodEnd: true },
    })
    expect(pays.map((c) => [iso(c.dueOn), iso(c.periodStart), iso(c.periodEnd)])).toEqual([
      ['2026-10-09', '2026-09-30', '2026-09-30'],
      ['2026-11-09', '2026-10-01', '2026-10-31'],
    ])
  })

  it("October's pay file names only Nov 9 for a line that started on Sep 30", async () => {
    expect(await payDayIn('2026-10')).toBe('2026-11-09')
  })

  it("September's pay file names Oct 9 for the same line", async () => {
    expect(await payDayIn('2026-09')).toBe('2026-10-09')
  })
})
