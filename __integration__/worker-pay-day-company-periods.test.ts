import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { GET as myWork } from '@/app/api/me/work/route'

/**
 * Her own page tells her the pay day the Payroll page gives (found by hand,
 * 2026-11-14). A W-2 line recorded on Wed Dec 9, 2026 read "The next pay
 * day for it is Jan 8, 2027" for the weeks of Dec 6 and Dec 13, where
 * Payroll and the forecast read Dec 24. An open-ended line read "has not
 * set a pay date for this week" while Payroll read Dec 24.
 *
 * The world, at Brightmoor Staffing: pay every other week from Sunday
 * Dec 6, worked out the Wednesday and paid the Friday after each period,
 * the working day before where that is a day off. The period Dec 6 to
 * Dec 19 pays Friday Dec 25, moved back to Thursday Dec 24 for Christmas.
 *
 *   - Lena Brandt, recorded on screen: starts Wed Dec 9, ends Tue Mar 9,
 *     written to pay once a month, with the seven pay days recording
 *     wrote (Dec 24, Jan 8, Jan 22, Feb 5, Feb 19, Mar 5, Mar 19).
 *   - Omar Fadel: starts Wed Dec 9, no end date, no pay days written.
 *
 * Each works Wed to Fri of the week of Dec 6 (24 hours) and Mon to Fri of
 * the week of Dec 13 (40 hours) at $45 an hour, both accepted: $1,080 and
 * $1,800, $2,880 in all.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const LENA = 'lena.brandt@pay-day.etyme.invalid'
const OMAR = 'omar.fadel@pay-day.etyme.invalid'
const DAY = 86_400_000
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const plus = (k: string, n: number) => new Date(+d(k) + n * DAY).toISOString().slice(0, 10)

let firmId = ''
const buyOf = new Map<string, string>()

async function week(sellId: string, personId: string, sunday: string, first: number, last: number) {
  const days: Record<string, number> = {}
  for (let i = first; i <= last; i++) days[plus(sunday, i)] = 8
  const sat = d(plus(sunday, 6))
  const total = (last - first + 1) * 8
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: d(sunday), periodEnd: sat, days, totalHours: total,
      status: 'APPROVED', submittedAt: sat, approvedAt: sat, clientApprovedAt: sat, employerAcceptedAt: sat,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 4_500, state: 'LIVE' },
  })
}

async function line(name: string, email: string, endDate: string | null, payDays: string[]) {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: person.id, companyId: firmId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' } })
  const client = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: firmId, clientCompanyId: { not: firmId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { clientCompanyId: true },
  })
  const start = d('2026-12-09')
  const end = endDate ? d(endDate) : null
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: client.clientCompanyId, personId: person.id, billRate: 7_000, startDate: start, endDate: end, state: 'IN_PROGRESS' },
  })
  // Written to pay once a month, as a line recorded on screen is today.
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, endDate: end, payCurrency: 'USD',
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: 4_500, startDate: start } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
  for (const p of payDays) await prisma.cycle.create({ data: { buyContractId: buy.id, kind: 'SALARY_PAY', dueOn: d(p) } })
  await week(sell.id, person.id, '2026-12-06', 3, 5)
  await week(sell.id, person.id, '2026-12-13', 1, 5)
  buyOf.set(email, buy.id)
}

async function payrollPayDay(email: string): Promise<string> {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', '/api/payroll?period=2026-12-06')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const row = r.body.data.payItems.find((p: any) => p.buyContractId === buyOf.get(email))
  expect(row, `${email} on the Payroll page`).toBeTruthy()
  return String(row.nextPayDate).slice(0, 10)
}

async function herPage(email: string) {
  as(email)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  const owed = r.body.data.owed
  const weeks = (owed.weeks as any[]).filter((w) => w.stage === 'OWED' && w.priced)
  return { says: owed.says as string, weeks: weeks.map((w) => [w.weekOf, w.owedCents, w.dueOn]) }
}

async function christmas(on: boolean) {
  await prisma.holiday.deleteMany({ where: { companyId: firmId, date: d('2026-12-25') } })
  if (on) await prisma.holiday.create({ data: { companyId: firmId, date: d('2026-12-25'), name: 'Christmas Day' } })
}

beforeAll(async () => {
  await freshWorld()
  firmId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  await prisma.company.update({
    where: { id: firmId },
    data: {
      payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, cycleShiftPay: 'BEFORE', daysOff: [0, 6],
      payFirstPeriodStart: d('2026-12-06'), paySettingsSetAt: new Date(),
    },
  })
  await christmas(true)
  await line('Lena Brandt', LENA, '2027-03-09', ['2026-12-24', '2027-01-08', '2027-01-22', '2027-02-05', '2027-02-19', '2027-03-05', '2027-03-19'])
  await line('Omar Fadel', OMAR, null, [])
}, 900_000)

describe('her own page reads the pay day the Payroll page gives, by the company’s own two-week periods', () => {
  it('a line recorded on Wed Dec 9 reads Thu Dec 24 for the weeks of Dec 6 and Dec 13 with Christmas on the calendar, as Payroll does, never Jan 8', async () => {
    await christmas(true)
    expect(await payrollPayDay(LENA)).toBe('2026-12-24')
    const page = await herPage(LENA)
    // 40 x $45 = $1,800 for the week of Dec 13; 24 x $45 = $1,080 for the week of Dec 6.
    expect(page.weeks).toEqual([
      ['2026-12-13', 180_000, '2026-12-24'],
      ['2026-12-06', 108_000, '2026-12-24'],
    ])
    expect(page.says).toContain('$2,880.00 is owed to you')
    expect(page.says).toContain('The next pay day for it is Dec 24.')
    expect(page.says).not.toContain('Jan 8')
  })

  it('an open-ended line with no pay days written reads Dec 24, as Payroll does, never “has not set a pay date”', async () => {
    await christmas(true)
    expect(await payrollPayDay(OMAR)).toBe('2026-12-24')
    const page = await herPage(OMAR)
    expect(page.weeks.map((w) => w[2])).toEqual(['2026-12-24', '2026-12-24'])
    expect(page.says).toContain('The next pay day for it is Dec 24.')
    expect(page.says).not.toContain('has not set a pay date')
  })

  it('without Christmas on the calendar both lines read Fri Dec 25, the Saturday Dec 19 plus six days, on her page and on Payroll alike', async () => {
    await christmas(false)
    for (const who of [LENA, OMAR]) {
      expect(await payrollPayDay(who)).toBe('2026-12-25')
      expect((await herPage(who)).weeks.map((w) => w[2])).toEqual(['2026-12-25', '2026-12-25'])
    }
    await christmas(true)
  })

  it('once the company’s first pay period day is cleared, the recorded line reads its own answer again, Jan 8', async () => {
    await prisma.company.update({ where: { id: firmId }, data: { payFirstPeriodStart: null } })
    try {
      expect((await herPage(LENA)).weeks.map((w) => w[2])).toEqual(['2027-01-08', '2027-01-08'])
    } finally {
      await prisma.company.update({ where: { id: firmId }, data: { payFirstPeriodStart: d('2026-12-06') } })
    }
  })
})
