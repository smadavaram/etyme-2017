import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { getCallerContext } from '@/lib/api-context'
import { workerFacts } from '@/app/api/conversations/twin/worker-read'
import { owedSays } from '@/app/api/conversations/twin/worker'

/**
 * Her own page and the Payroll page read one held week the same way
 * (found on a phone, 2026-11-14, walker tpe item 3). Payroll held Marisol
 * Quintero's 46-hour week of Oct 18 because nobody had recorded whether she
 * is exempt from overtime, while her page read it as $2,070.00 owed at the
 * usual rate, 46 x $45.
 *
 * The world, at Brightmoor Staffing: pay every other week from Sunday
 * Oct 11, worked out the Wednesday and paid the Friday after each period.
 * The period Oct 11 to Oct 24 is paid Fri Oct 30.
 *
 *   - Nadia Ferro, W2 at $45 an hour, nothing recorded on overtime.
 *   - Week of Oct 11: 8 hours Mon to Fri, 40 hours, accepted Oct 26.
 *   - Week of Oct 18: Mon to Thu at 9 and Fri at 10, 46 hours, accepted Oct 26.
 *   - Nothing paid yet.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const NADIA = 'nadia.ferro@held-week.etyme.invalid'
const DAY = 86_400_000
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const plus = (k: string, n: number) => new Date(+d(k) + n * DAY).toISOString().slice(0, 10)

let firmId = ''
let buyId = ''
let personId = ''

async function week(sellId: string, sunday: string, hours: number[]) {
  const days: Record<string, number> = {}
  hours.forEach((h, i) => { days[plus(sunday, i + 1)] = h })
  const sat = d(plus(sunday, 6))
  const total = hours.reduce((a, b) => a + b, 0)
  const accepted = d('2026-10-26')
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sellId, personId, periodStart: d(sunday), periodEnd: sat, days, totalHours: total,
      status: 'APPROVED', submittedAt: sat, approvedAt: accepted, clientApprovedAt: accepted, employerAcceptedAt: accepted,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 4_500, state: 'LIVE', at: accepted },
  })
}

async function payrollRow() {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', '/api/payroll?period=2026-10-11')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const row = r.body.data.payItems.find((p: any) => p.buyContractId === buyId)
  expect(row, 'Nadia Ferro on the Payroll page').toBeTruthy()
  return row
}

async function herPage() {
  as(NADIA)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  const owed = r.body.data.owed
  const of = (sunday: string) => (owed.weeks as any[]).find((w) => w.weekOf === sunday)
  return { owed, oct11: of('2026-10-11'), oct18: of('2026-10-18') }
}

beforeAll(async () => {
  await freshWorld()
  firmId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  await prisma.company.update({
    where: { id: firmId },
    data: {
      payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, cycleShiftPay: 'BEFORE', daysOff: [0, 6],
      payFirstPeriodStart: d('2026-10-11'), paySettingsSetAt: new Date(),
    },
  })
  const person = await prisma.person.create({ data: { name: 'Nadia Ferro', primaryEmail: NADIA } })
  personId = person.id
  await prisma.context.create({ data: { personId, companyId: firmId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' } })
  const client = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: firmId, clientCompanyId: { not: firmId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { clientCompanyId: true },
  })
  const start = d('2026-10-12')
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: client.clientCompanyId, personId, billRate: 7_000, startDate: start, state: 'IN_PROGRESS' },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
      candidates: { create: { personId, payRate: 4_500, startDate: start } },
    },
  })
  buyId = buy.id
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
  await week(sell.id, '2026-10-11', [8, 8, 8, 8, 8])
  await week(sell.id, '2026-10-18', [9, 9, 9, 9, 10])
}, 900_000)

describe('her page and the Payroll page read one held week the same way', () => {
  it('while Payroll holds the week of Oct 18, her page prices it nowhere and counts only the 40-hour week as owed, 40 x $45 = $1,800.00', async () => {
    await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
    const row = await payrollRow()
    // Payroll's own row: the week of Oct 18, 46 hours, held.
    expect(row.heldWeeks).toEqual([{ weekOf: '2026-10-18', hours: 46 }])

    const { owed, oct11, oct18 } = await herPage()
    expect(oct18.held).toBe(true)
    expect(oct18.priced).toBe(false)
    expect(oct18.owedCents).toBeNull()
    expect(oct18.dueOn).toBeNull()
    expect(oct18.says).toBe(
      'Brightmoor Staffing is holding this week, 46 hours, until it records whether you are paid overtime for hours over 40. ' +
        'It is then paid once, with any overtime owed.'
    )
    expect(oct11.owedCents).toBe(180_000)
    // Only the week of Oct 11 is owed: $1,800.00, never $1,800 + $2,070 = $3,870.00.
    expect(owed.cents).toBe(180_000)
    expect(owed.hours).toBe(40)
    expect(owed.says).toContain('$1,800.00 is owed to you, for 40 hours Brightmoor Staffing accepted and has not paid yet.')
    expect(owed.says).toContain('Your week of Oct 18 is held until Brightmoor Staffing records whether you are paid overtime for hours over 40.')
    expect(owed.says).not.toContain('2,070')
    expect(owed.says).not.toContain('3,870')
  })

  it('while the week is held, her Ask Etyme answer on what she is owed counts only the week of Oct 11, $1,800.00, read through her own page', async () => {
    await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
    as(NADIA)
    const request = req('GET', '/api/conversations/twin')
    const got = await getCallerContext(request)
    if (!got.caller) throw new Error('Nadia Ferro has no seat')
    const f = await workerFacts(got.caller, request)
    const answer = owedSays(f)
    expect(answer.says).toBe('$1,800.00 is owed to you, for 40 hours Brightmoor Staffing accepted and has not paid yet.')
    expect([answer.says, ...answer.more].join(' ')).not.toMatch(/2,070|3,870|2,205/)
  })

  it('once not exempt is recorded her page reads $2,205.00 for the week of Oct 18, 40 x 45 + 6 x 67.50, and Payroll holds nothing', async () => {
    await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buyId, personId, assertedByCompanyId: firmId, status: 'NONEXEMPT', wageRule: 'US_FLSA',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.',
      },
    })
    try {
      const row = await payrollRow()
      expect(row.heldWeeks).toEqual([])
      const { owed, oct18 } = await herPage()
      expect(oct18.held).toBeUndefined()
      expect(oct18.priced).toBe(true)
      expect(oct18.owedCents).toBe(40 * 4_500 + 6 * 6_750)
      expect(oct18.owedCents).toBe(220_500)
      // $1,800.00 + $2,205.00 = $4,005.00 over 86 hours, 6 of them overtime.
      expect(owed.cents).toBe(400_500)
      expect(owed.says).toContain('$4,005.00 is owed to you, for 86 hours Brightmoor Staffing accepted and has not paid yet, 6 of them overtime.')
      expect(owed.says).not.toContain('held')
    } finally {
      await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
    }
  })

  it('a week accepted Oct 26 reads the pay day Payroll gives its period, Oct 30, on her page and on the Payroll row alike, and says it has passed', async () => {
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buyId, personId, assertedByCompanyId: firmId, status: 'NONEXEMPT', wageRule: 'US_FLSA',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.',
      },
    })
    try {
      const row = await payrollRow()
      // Oct 24 (Sat) + 6 = Fri Oct 30.
      expect(String(row.nextPayDate).slice(0, 10)).toBe('2026-10-30')
      const { oct11, oct18 } = await herPage()
      expect(oct11.dueOn).toBe('2026-10-30')
      expect(oct18.dueOn).toBe('2026-10-30')
      expect(oct18.overdue).toBe(true)
      expect(oct18.says).toContain('It fell due on your pay day of Oct 30 and has not been paid.')
    } finally {
      await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
    }
  })

  it('both weeks accepted late, on Nov 14, still read Oct 30 and overdue on her page, the day Payroll names overdue, never Nov 27', async () => {
    const late = d('2026-11-14')
    const early = d('2026-10-26')
    const sheets = await prisma.timesheet.findMany({ where: { personId }, select: { id: true } })
    const ids = sheets.map((s) => s.id)
    await prisma.timesheet.updateMany({ where: { id: { in: ids } }, data: { approvedAt: late, clientApprovedAt: late, employerAcceptedAt: late } })
    await prisma.workAssertion.updateMany({ where: { timesheetId: { in: ids }, role: 'EMPLOYER_ACCEPTANCE' }, data: { at: late } })
    await prisma.exemptAssertion.create({
      data: {
        buyContractId: buyId, personId, assertedByCompanyId: firmId, status: 'NONEXEMPT', wageRule: 'US_FLSA',
        screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.',
      },
    })
    try {
      const row = await payrollRow()
      // Payroll: the period Oct 11 – Oct 24 is paid Fri Oct 30, and it has passed unpaid.
      expect(String(row.nextPayDate).slice(0, 10)).toBe('2026-10-30')
      expect(row.payDatesOverdue.count).toBe(1)
      expect(String(row.payDatesOverdue.earliest).slice(0, 10)).toBe('2026-10-30')
      const { owed, oct11, oct18 } = await herPage()
      // 40 x $45 = $1,800.00 and 40 x $45 + 6 x $67.50 = $2,205.00, both due Oct 30.
      expect([oct11.owedCents, oct11.dueOn, oct11.overdue]).toEqual([180_000, '2026-10-30', true])
      expect([oct18.owedCents, oct18.dueOn, oct18.overdue]).toEqual([220_500, '2026-10-30', true])
      expect(oct11.says).toBe('40 hours, none of them overtime. It fell due on your pay day of Oct 30 and has not been paid.')
      expect(owed.says).toContain('All of it is past its pay day.')
      expect(owed.says).not.toContain('Nov 27')
    } finally {
      await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
      await prisma.timesheet.updateMany({ where: { id: { in: ids } }, data: { approvedAt: early, clientApprovedAt: early, employerAcceptedAt: early } })
      await prisma.workAssertion.updateMany({ where: { timesheetId: { in: ids }, role: 'EMPLOYER_ACCEPTANCE' }, data: { at: early } })
    }
  })
  it('a worker whose week abroad is held reads which country, and that her employer is setting the overtime rules there, with no figure and nothing written', async () => {
    await prisma.exemptAssertion.deleteMany({ where: { buyContractId: buyId, personId } })
    const sell = await prisma.sellContract.findFirstOrThrow({ where: { personId, companyId: firmId }, select: { id: true, clientCompanyId: true } })
    const site = await prisma.companyLocation.create({ data: { companyId: sell.clientCompanyId, name: 'Pune office', city: 'Pune', country: 'IN' } })
    await prisma.sellContract.update({ where: { id: sell.id }, data: { workLocationId: site.id } })
    const before = await Promise.all([prisma.timesheet.count(), prisma.exemptAssertion.count(), prisma.workAssertion.count()])
    try {
      const row = await payrollRow()
      expect(row.heldWeeks[0]).toMatchObject({ weekOf: '2026-10-18', hours: 46 })
      const { owed, oct18 } = await herPage()
      expect(oct18.held).toBe(true)
      expect(oct18.owedCents).toBeNull()
      expect(oct18.says).toBe(
        'Your week of October 18, 2026 is on hold. You worked 46 hours in India, and your employer is still setting the overtime rules there. It is paid once they are set.'
      )
      expect(oct18.says).not.toMatch(/\$|exempt|whether you are paid overtime/)
      expect(owed.says).toContain('Your week of October 18, 2026 is on hold while your employer sets the overtime rules for India.')
      expect(owed.says).not.toContain('2,070')
      expect(await Promise.all([prisma.timesheet.count(), prisma.exemptAssertion.count(), prisma.workAssertion.count()])).toEqual(before)
    } finally {
      await prisma.sellContract.update({ where: { id: sell.id }, data: { workLocationId: null } })
      await prisma.companyLocation.delete({ where: { id: site.id } })
    }
  })
})
