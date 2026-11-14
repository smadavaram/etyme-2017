import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as ap } from '@/app/api/ap/route'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { payPeriodAt } from '@/lib/payroll-settings'
import { owedOnRow } from '@/lib/money/period-pay-left'

/**
 * Three faults found by hand in the company's own pay periods
 * (2026-11-14), walked for each Sunday the founder may choose.
 *
 * At Brightmoor Staffing, paying every other week, worked out the
 * Wednesday and paid the Friday after each period, the working day before
 * where that is a day off, with Christmas Day and New Year's Day on its
 * calendar. For each Sunday S, three W-2 employees at $20 an hour:
 *
 *   - Rhea, whose period before S has its first week paid and its second
 *     week accepted late;
 *   - Joel, who starts on the Monday of the second week of the period
 *     from S, with his pay days written when the first day was set;
 *   - Mina, with one week accepted forty weeks before S and never paid.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const SUNDAYS = ['2026-12-06', '2026-12-13', '2026-12-27'] as const
const HOLIDAYS = ['2026-12-25', '2027-01-01']
const DAY = 86_400_000
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const plus = (k: string, n: number) => new Date(+d(k) + n * DAY).toISOString().slice(0, 10)

let firmId = ''
let clientId = ''

interface Line { personId: string; name: string; sellId: string; buyId: string }

async function line(name: string, start: string, end: string | null): Promise<Line> {
  const email = `${name.split(' ')[0].toLowerCase()}.${start}@part-paid.etyme.invalid`
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: person.id, companyId: firmId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' } })
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: 4_000, startDate: d(start), endDate: end ? d(end) : null, state: 'IN_PROGRESS' },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: d(start), endDate: end ? d(end) : null, payCurrency: 'USD',
      payFrequency: 'BIWEEKLY', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: 2_000, startDate: d(start) } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: d(start) } })
  return { personId: person.id, name, sellId: sell.id, buyId: buy.id }
}

async function week(l: Line, sunday: string) {
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[plus(sunday, i)] = 8
  const sat = d(plus(sunday, 6))
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sellId, personId: l.personId, periodStart: d(sunday), periodEnd: sat, days, totalHours: 40,
      status: 'APPROVED', submittedAt: sat, approvedAt: sat, clientApprovedAt: sat, employerAcceptedAt: sat,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 2_000, state: 'LIVE' },
  })
}

async function page(period: string, extra = '') {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', `/api/payroll?period=${period}${extra}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
const rowOf = (data: any, l: Line) => data.payItems.find((p: any) => p.buyContractId === l.buyId)

async function run(l: Line, start: string, end: string) {
  as(BRIGHTMOOR)
  for (const action of ['calculate', 'process']) {
    const r = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [l.buyId], action, period: { start, end } })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  }
}

beforeAll(async () => {
  await freshWorld()
  firmId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  clientId = (await prisma.sellContract.findFirstOrThrow({
    where: { companyId: firmId, clientCompanyId: { not: firmId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { clientCompanyId: true },
  })).clientCompanyId!
  await prisma.holiday.deleteMany({ where: { companyId: firmId, date: { in: HOLIDAYS.map(d) } } })
  await prisma.holiday.createMany({ data: [
    { companyId: firmId, date: d('2026-12-25'), name: 'Christmas Day' },
    { companyId: firmId, date: d('2027-01-01'), name: 'New Year’s Day' },
  ] })
  await prisma.company.update({
    where: { id: firmId },
    data: { payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, cycleShiftPay: 'BEFORE', daysOff: [0, 6], paySettingsSetAt: new Date() },
  })
}, 900_000)

for (const S of SUNDAYS) {
  describe(`with the first pay period starting on ${S}`, () => {
    let rhea: Line
    let joel: Line
    let mina: Line
    const before = plus(S, -14)
    beforeAll(async () => {
      await prisma.company.update({ where: { id: firmId }, data: { payFirstPeriodStart: d(S) } })
      // A name of her own in each family, so one Sunday's weeks are not read as another's.
      const n = SUNDAYS.indexOf(S)
      rhea = await line(['Rhea Lindqvist', 'Rhea Castellano', 'Rhea Nakamura'][n], plus(before, 1), null)
      await week(rhea, before)
      await run(rhea, before, plus(before, 13))
      // Her second week, accepted after the first was paid.
      await week(rhea, plus(before, 7))

      joel = await line(['Joel Okafor', 'Joel Brandt', 'Joel Mensah'][n], plus(S, 8), plus(S, 83))
      await writeCyclesFor(prisma, {
        sell: { id: joel.sellId, startDate: d(plus(S, 8)), endDate: d(plus(S, 83)) },
        buy: { id: joel.buyId, contractType: 'W2', vendorCompanyId: null },
        packId: 'US_IT',
        holidays: HOLIDAYS,
      })
      await week(joel, plus(S, 7))

      mina = await line(['Mina Arslan', 'Mina Halvorsen', 'Mina Duarte'][n], plus(S, -279), null)
      await week(mina, plus(S, -280))
    }, 300_000)

    it('a period with its first week paid says what was paid already and what is still to pay', async () => {
      const mine = rowOf(await page(before), rhea)
      expect(mine.totalApprovedHours).toBe(80)
      expect(mine.grossPay).toBe(160_000)
      expect(mine.paidSoFar).toEqual({ hours: 40, grossCents: 80_000 })
      expect(mine.toPay).toMatchObject({ hours: 40, grossCents: 80_000 })
      expect(mine.partPaid).toBe('Paid already: $800.00 for 40 hours. Still to pay: $800.00 for 40 hours.')
    })

    it('the pay file for that period carries only the week still to pay, with the week paid already beside it', async () => {
      as(BRIGHTMOOR)
      const res = await payroll(req('GET', `/api/payroll?period=${before}&format=csv`))
      expect(res.status).toBe(200)
      const want = await payPeriodAt(firmId, before)
      const hers = (await res.text()).trim().split('\n').filter((x) => x.startsWith(`${rhea.name},`))
      expect(hers).toEqual([`${rhea.name},40,20.00,0,0.00,800.00,800.00,USD,${before},${plus(before, 13)},${want!.payOn},Part paid`])
    })

    it('the next run pays only the week still to pay', async () => {
      as(BRIGHTMOOR)
      const calc = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [rhea.buyId], action: 'calculate', period: { start: before, end: plus(before, 13) } })))
      expect(calc.status, JSON.stringify(calc.body)).toBe(200)
      expect(calc.body.data.details.find((x: any) => x.buyContractId === rhea.buyId)).toMatchObject({ grossPay: 80_000, alreadyPaidHours: 40 })
    })

    it('the Owner’s cash flow counts the week paid already as paid, and only the week still to pay as due', async () => {
      const want = (await payPeriodAt(firmId, before))!
      const data = await page(before)
      const owed = data.payItems.filter((x: any) => ['PENDING', 'CALCULATED'].includes(x.payStatus) && owedOnRow(x) > 0 && x.payCurrency === 'USD')
      expect(owedOnRow(rowOf(data, rhea))).toBe(80_000)
      as(BRIGHTMOOR)
      const r = await json(await ap(req('GET', '/api/ap?view=cash-flow&period=quarter&grain=week')))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      const usd = r.body.data.currencies.find((c: any) => c.currency === 'USD')
      const slot = usd.rows.find((x: any) => x.start.slice(0, 10) <= want.payOn && x.end.slice(0, 10) >= want.payOn)
      expect(slot, `a week slot holds ${want.payOn}`).toBeTruthy()
      expect(slot.figures.payrollDue).toBe(owed.reduce((n: number, x: any) => n + owedOnRow(x), 0))
    })

    it('a person starting in the second week of a period has the Payroll page’s pay day on his own line', async () => {
      const want = (await payPeriodAt(firmId, S))!
      const pay = await prisma.cycle.findMany({ where: { buyContractId: joel.buyId, kind: 'SALARY_PAY' }, orderBy: { dueOn: 'asc' } })
      expect(pay[0].dueOn.toISOString().slice(0, 10)).toBe(want.payOn)
      expect(pay[0].periodStart!.toISOString().slice(0, 10)).toBe(plus(S, 8))
      expect(pay[0].periodEnd!.toISOString().slice(0, 10)).toBe(want.end)
      for (const c of pay) {
        const own = (await payPeriodAt(firmId, c.periodStart!.toISOString().slice(0, 10)))!
        expect(c.dueOn.toISOString().slice(0, 10)).toBe(own.payOn)
      }
    })

    it('paying the company’s period marks that period’s pay day on his line paid, and no other', async () => {
      const want = (await payPeriodAt(firmId, S))!
      await run(joel, S, plus(S, 13))
      const pay = await prisma.cycle.findMany({ where: { buyContractId: joel.buyId, kind: 'SALARY_PAY' }, orderBy: { dueOn: 'asc' } })
      const done = pay.filter((c) => c.completedAt).map((c) => c.dueOn.toISOString().slice(0, 10))
      expect(done).toEqual([want.payOn])
    })

    it('the picker offers a period forty weeks back that still holds accepted hours nobody paid', async () => {
      const data = await page(S)
      const far = data.payPeriods.periods.find((p: any) => p.start === plus(S, -280))
      expect(far, 'the old period is offered').toBeTruthy()
      expect(far.unpaid).toBe(true)
      expect(far.words).toMatch(/ · accepted hours not paid$/)
      // Opened, it can be worked out and paid.
      const old = await page(plus(S, -280))
      expect(old.runsHere).toBe(true)
      expect(rowOf(old, mina)).toMatchObject({ totalApprovedHours: 40, payStatus: 'PENDING' })
    })
  })
}
