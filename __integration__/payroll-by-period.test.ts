import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as ap } from '@/app/api/ap/route'
import { payPeriodAt } from '@/lib/payroll-settings'
import { companyPayPeriods } from '@/lib/money/company-pay-periods'
import { periodHolding, periodsPayingBetween } from '@/lib/money/pay-periods'
import { windowFor } from '@/lib/money/cash-flow'
import { shiftToWorkingDay, localDayKey } from '@/lib/cycle-shift'

/**
 * The Payroll page lists pay by the company's own two-week periods, from
 * the Sunday its Owner set (the founder, 2026-11-14: "W2 first, outside
 * payroll provider, biweekly"). He has not said which Sunday, so each of
 * the three he may choose is walked: Dec 6, Dec 13 and Dec 27, 2026.
 *
 * The world, at Brightmoor Staffing, paying every other week, worked out
 * the Wednesday and paid the Friday after each period, the working day
 * before where that is a day off, with Christmas Day and New Year's Day
 * on its own calendar. For each Sunday S, one W-2 employee on a line
 * written to pay once a month, with no end date and no pay dates:
 *
 *   - the week before S: 40 hours, accepted;
 *   - the two weeks from S: 40 hours each, accepted, with a raise from
 *     $45 to $50 an hour on the Wednesday of the second week;
 *   - the third week: 40 hours, accepted; the fourth: 46 hours, filed
 *     and not accepted.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const SUNDAYS = ['2026-12-06', '2026-12-13', '2026-12-27'] as const
const DAY = 86_400_000
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const plus = (k: string, n: number) => new Date(+d(k) + n * DAY).toISOString().slice(0, 10)
/** The one rule every pay date follows, asked directly (lib/cycle-shift). */
const oneRule = (k: string, holidays: string[]) => {
  const [y, m, dd] = k.split('-').map(Number)
  return localDayKey(shiftToWorkingDay(new Date(y, m - 1, dd), new Set(holidays), 'BEFORE', [0, 6]))
}

let firmId = ''
let ownerPersonId = ''
let clientId = ''
let clientName = ''

interface Line { personId: string; name: string; email: string; sellId: string; buyId: string }
const lines = new Map<string, Line>()

async function week(l: Line, sunday: string, perDay: number, accepted: boolean) {
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[plus(sunday, i)] = perDay
  const sat = d(plus(sunday, 6))
  const total = Math.round(perDay * 5 * 100) / 100
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sellId, personId: l.personId, periodStart: d(sunday), periodEnd: sat, days, totalHours: total,
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

async function setFirstDay(sunday: string) {
  await prisma.company.update({ where: { id: firmId }, data: { payFirstPeriodStart: d(sunday), paySettingsSetAt: new Date() } })
}

async function rows(period: string) {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', `/api/payroll?period=${period}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
const rowOf = (data: any, l: Line) => data.payItems.find((p: any) => p.buyContractId === l.buyId)

beforeAll(async () => {
  await freshWorld()
  const firm = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  firmId = firm.id
  ownerPersonId = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: BRIGHTMOOR } })).id
  const theirs = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: firmId, clientCompanyId: { not: firmId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { clientCompanyId: true, clientCompany: { select: { name: true } } },
  })
  clientId = theirs.clientCompanyId!
  clientName = theirs.clientCompany!.name

  await prisma.holiday.deleteMany({ where: { companyId: firmId, date: { in: [d('2026-12-25'), d('2027-01-01')] } } })
  await prisma.holiday.createMany({ data: [
    { companyId: firmId, date: d('2026-12-25'), name: 'Christmas Day' },
    { companyId: firmId, date: d('2027-01-01'), name: 'New Year’s Day' },
  ] })
  await prisma.company.update({
    where: { id: firmId },
    data: { payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, cycleShiftPay: 'BEFORE', daysOff: [0, 6] },
  })

  const start = d('2026-01-04')
  for (const [i, S] of SUNDAYS.entries()) {
    const name = ['Ines Varga', 'Tomas Ruiz', 'Amara Nwosu'][i]
    const email = `${name.split(' ')[0].toLowerCase()}@by-period.etyme.invalid`
    const person = await prisma.person.create({ data: { name, primaryEmail: email } })
    await prisma.context.create({ data: { personId: person.id, companyId: firmId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' } })
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: 7_000, startDate: start, state: 'IN_PROGRESS' },
    })
    // Written to pay once a month, as a W-2 line with no order is today.
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
        candidates: { create: { personId: person.id, payRate: 4_500, startDate: start } },
      },
    })
    await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
    // The raise, from the Wednesday of the period's second week.
    await prisma.rateHistory.create({
      data: {
        contractType: 'BUY', contractId: buy.id, rate: 5_000, rateType: 'HOURLY', fromDate: d(plus(S, 10)), toDate: null,
        reason: 'Raise', changedById: ownerPersonId, previousRate: 4_500,
        approvalState: 'APPROVED', approvedById: ownerPersonId, approvedAt: d(plus(S, 10)),
      },
    })
    const l: Line = { personId: person.id, name, email, sellId: sell.id, buyId: buy.id }
    lines.set(S, l)
    await week(l, plus(S, -7), 8, true)
    await week(l, S, 8, true)
    await week(l, plus(S, 7), 8, true)
    await week(l, plus(S, 14), 8, true)
    await week(l, plus(S, 21), 9.2, false)
  }
}, 900_000)

for (const S of SUNDAYS) {
  describe(`with the first pay period starting on ${S}`, () => {
    let l: Line
    beforeAll(async () => {
      l = lines.get(S)!
      await setFirstDay(S)
    })

    it('the picker lists the company’s own periods, the current one first, each with its two dates and its pay day', async () => {
      const data = await rows(S)
      const { periods, current } = data.payPeriods
      expect(periods[0].start).toBe(current)
      const today = new Date().toISOString().slice(0, 10)
      expect(periods[0].start <= today && periods[0].end >= today).toBe(true)
      for (const p of periods) {
        expect(p.words).toMatch(/^\w{3} \d{1,2}(, \d{4})? – \w{3} \d{1,2}, \d{4} · paid \w{3}, \w{3} \d{1,2}, \d{4}( · accepted hours not paid)?$/)
        expect(Math.abs(((+d(p.start) - +d(S)) / DAY) % 14)).toBe(0)
      }
    })

    it('a two-week period runs fourteen days from a Sunday to a Saturday and never splits a week', async () => {
      const data = await rows(S)
      expect(data.payPeriods.shown).toMatchObject({ start: S, end: plus(S, 13) })
      const mine = rowOf(data, l)
      expect(mine.payPeriod.start.slice(0, 10)).toBe(S)
      expect(mine.payPeriod.end.slice(0, 10)).toBe(plus(S, 13))
      // Both weeks whole, neither cut at the period's edge.
      expect(mine.timesheets.map((t: any) => t.partPeriod)).toEqual([false, false])
      expect(mine.timesheets.map((t: any) => t.totalHours)).toEqual([40, 40])
    })

    it('the week before the first period falls in the period before it', async () => {
      const data = await rows(plus(S, -7))
      expect(data.payPeriods.shown).toMatchObject({ start: plus(S, -14), end: plus(S, -1) })
      const mine = rowOf(data, l)
      expect(mine.totalApprovedHours).toBe(40)
      expect(mine.grossPay).toBe(180_000)
    })

    it('a pay day is the period’s Saturday plus the company’s offset, moved by the one rule when it lands on a day off', async () => {
      for (const at of [plus(S, -14), S, plus(S, 14)]) {
        const data = await rows(at)
        const want = await payPeriodAt(firmId, at)
        expect(data.payPeriods.shown).toMatchObject({ start: want!.start, end: want!.end, payOn: want!.payOn, calcOn: want!.calcOn })
        expect(want!.payOnUnmoved).toBe(plus(want!.end, 6))
        expect(want!.payOn).toBe(oneRule(want!.payOnUnmoved, ['2026-12-25', '2027-01-01']))
        expect(rowOf(data, l).nextPayDate.slice(0, 10)).toBe(want!.payOn)
        expect(rowOf(data, l).nextCalcDate.slice(0, 10)).toBe(want!.calcOn)
      }
    })

    it('a period that ends on 2026-12-19 or 2026-12-26 pays on the day the one rule gives for a Friday that is a public holiday', async () => {
      const at = [plus(S, -14), S].find((k) => ['2026-12-19', '2026-12-26'].includes(plus(k, 13)))!
      expect(at, 'one period in this family ends on Dec 19 or Dec 26').toBeTruthy()
      const data = await rows(at)
      const friday = plus(at, 19)
      expect(['2026-12-25', '2027-01-01']).toContain(friday)
      // Christmas Day moves to Thursday Dec 24, 2026 and New Year's Day to
      // Thursday Dec 31, 2026: the working day before, as every pay date.
      expect(data.payPeriods.shown.payOn).toBe(oneRule(friday, ['2026-12-25', '2027-01-01']))
      expect(new Date(`${data.payPeriods.shown.payOn}T00:00:00Z`).getUTCDay()).toBe(4)
      expect(data.periodSays).toContain(`It moved from Fri, ${friday === '2026-12-25' ? 'Dec 25, 2026' : 'Jan 1, 2027'}, a day off or a holiday.`)
    })

    it('a year’s end does not break a period', async () => {
      const data = await rows('2026-12-31')
      const p = data.payPeriods.shown
      expect(p.start <= '2026-12-31' && p.end >= '2027-01-02').toBe(true)
      expect((+d(p.end) - +d(p.start)) / DAY + 1).toBe(14)
      expect(new Date(`${p.start}T00:00:00Z`).getUTCDay()).toBe(0)
    })

    it('hours accepted in two weeks of one period are paid together at the rate in force each day', async () => {
      const mine = rowOf(await rows(S), l)
      expect(mine.totalApprovedHours).toBe(80)
      // 56 hours at $45 to the Tuesday of the second week, 24 at $50 from the Wednesday.
      expect(mine.rates).toEqual([{ rateCents: 4_500, hours: 56 }, { rateCents: 5_000, hours: 24 }])
      expect(mine.grossPay).toBe(56 * 4_500 + 24 * 5_000)
      expect(mine.payStatus).toBe('PENDING')
    })

    it('a line written to pay once a month is listed on the company’s two-week period, and the line itself is not rewritten', async () => {
      const mine = rowOf(await rows(S), l)
      expect(mine.payPeriod.label).toBe(`${S === '2026-12-27' ? 'Dec 27, 2026 – Jan 9, 2027' : `Dec ${Number(S.slice(8))} – Dec ${Number(S.slice(8)) + 13}, 2026`}`)
      const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: l.buyId }, select: { payFrequency: true } })
      expect(line.payFrequency).toBe('MONTHLY')
      expect(await prisma.cycle.count({ where: { buyContractId: l.buyId } })).toBe(0)
    })

    it('a week not accepted is named and left out', async () => {
      const mine = rowOf(await rows(plus(S, 14)), l)
      expect(mine.totalApprovedHours).toBe(40)
      expect(mine.grossPay).toBe(200_000)
      const fourth = plus(S, 21)
      const span = S === '2026-12-06' ? 'Dec 27, 2026 – Jan 2, 2027' : S === '2026-12-13' ? 'Jan 3 – Jan 9, 2027' : 'Jan 17 – Jan 23, 2027'
      expect(fourth).toBe(S === '2026-12-06' ? '2026-12-27' : S === '2026-12-13' ? '2027-01-03' : '2027-01-17')
      expect(mine.notAccepted).toBe(
        `${l.name}'s week of ${span}, 46 hours, is not in this pay until ${clientName} approves it and Brightmoor Staffing accepts it.`,
      )
    })

    it('the pay file’s figures are the row’s figures', async () => {
      const data = await rows(S)
      as(BRIGHTMOOR)
      const res = await payroll(req('GET', `/api/payroll?period=${S}&format=csv`))
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toBe(`attachment; filename="payroll-${S}-to-${plus(S, 13)}.csv"`)
      const [head, ...body] = (await res.text()).trim().split('\n')
      expect(head).toBe('Name,Hours,Pay rate,Overtime hours,Overtime premium,Gross pay,Paid already,Currency,Period start,Period end,Pay day,Status')
      const hers = body.filter((x) => x.startsWith(`${l.name},`))
      expect(hers).toEqual([
        `${l.name},80,45.00 for 56 hours; 50.00 for 24 hours,0,0.00,3720.00,0.00,USD,${S},${plus(S, 13)},${data.payPeriods.shown.payOn},Not worked out yet`,
      ])
      // Every person with hours on the page is on the file, at what the page
      // says is still to pay and what was paid already.
      const onPage = data.payItems.filter((p: any) => p.totalApprovedHours > 0)
      expect(body).toHaveLength(onPage.length)
      for (const p of onPage) {
        const line = body.find((x) => x.startsWith(`${p.person.name},`) || x.startsWith(`"${p.person.name}",`))!
        const paid = ((p.paidSoFar?.grossCents ?? 0) / 100).toFixed(2)
        expect(line, p.person.name).toContain(`,${(p.toPay.grossCents / 100).toFixed(2)},${paid},${p.payCurrency},`)
      }
    })

    it('working out the period and then paying it moves her row from pending to worked out to paid, and the next period stays owed', async () => {
      as(BRIGHTMOOR)
      const period = { start: S, end: plus(S, 13) }
      const calc = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [l.buyId], action: 'calculate', period })))
      expect(calc.status, JSON.stringify(calc.body)).toBe(200)
      expect(rowOf(await rows(S), l).payStatus).toBe('CALCULATED')
      const paid = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [l.buyId], action: 'process', period })))
      expect(paid.status, JSON.stringify(paid.body)).toBe(200)
      expect(paid.body.data.details.find((x: any) => x.buyContractId === l.buyId).grossPay).toBe(372_000)
      expect(rowOf(await rows(S), l).payStatus).toBe('PROCESSED')
      expect(rowOf(await rows(plus(S, 14)), l).payStatus).toBe('PENDING')
      expect(rowOf(await rows(plus(S, -14)), l).payStatus).toBe('PENDING')
    })

    it('the Owner’s cash flow reads accepted pay nobody has paid as due on its period’s pay day', async () => {
      const own = await companyPayPeriods(firmId)
      const w = windowFor('quarter', new Date())
      const key = (x: Date) => x.toISOString().slice(0, 10)
      // A period paying this quarter, clear of the weeks above, with one
      // accepted week for her in it.
      const p = periodsPayingBetween(key(w.start), key(w.end), own.rhythm, own.rule)
        .find((x) => x.end < plus(S, -14) || x.start > plus(S, 27))!
      expect(p, 'a period pays this quarter').toBeTruthy()
      await week(l, p.start, 8, true)
      const page = await rows(p.start)
      const owed = page.payItems.filter((x: any) => ['PENDING', 'CALCULATED'].includes(x.payStatus) && x.grossPay > 0 && x.payCurrency === 'USD')
      expect(owed.some((x: any) => x.buyContractId === l.buyId)).toBe(true)

      as(BRIGHTMOOR)
      const r = await json(await ap(req('GET', '/api/ap?view=cash-flow&period=quarter&grain=week')))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      const usd = r.body.data.currencies.find((c: any) => c.currency === 'USD')
      const slot = usd.rows.find((x: any) => x.start.slice(0, 10) <= p.payOn && x.end.slice(0, 10) >= p.payOn)
      expect(slot.figures.payrollDue).toBe(owed.reduce((n: number, x: any) => n + x.grossPay, 0))
      expect((r.body.data.says as string[]).join(' ')).not.toContain(l.name)
    })
  })
}

describe('one door and one answer for the company’s periods', () => {
  it('the Payroll page’s periods are the payroll settings’ own, day for day, for each of the three Sundays', async () => {
    for (const S of SUNDAYS) {
      await setFirstDay(S)
      const own = await companyPayPeriods(firmId)
      for (const at of [plus(S, -7), S, plus(S, 20), '2026-12-31']) {
        expect(periodHolding(at, own.rhythm, own.rule), `${S} ${at}`).toEqual(await payPeriodAt(firmId, at))
      }
    }
  })

  it('a company that has not set its first day keeps the calendar month, with one sentence saying where the Owner sets it', async () => {
    await prisma.company.update({ where: { id: firmId }, data: { payFirstPeriodStart: null } })
    const data = await rows('2026-12')
    expect(data.payPeriods).toBeNull()
    expect(data.periodSays).toBe(
      "Brightmoor Staffing pays every other week, but this page lists pay by calendar month until the first pay period's first day is set. " +
      'The Owner sets it in Settings, under Cycles, then Payroll: "First pay period starts on".',
    )
    expect(data.runsHere).toBe(true)
    as(BRIGHTMOOR)
    const r = await json(await payroll(req('GET', '/api/payroll?period=2026-12-06')))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('period')
  })

  it('a company that pays once a month keeps its calendar picker, whatever first day it once stored', async () => {
    await prisma.company.update({ where: { id: firmId }, data: { payPeriod: 'MONTHLY', payDaysOfMonth: [28], payFirstPeriodStart: d('2026-12-06') } })
    const data = await rows('2026-12')
    expect(data.payPeriods).toBeNull()
    expect(data.periodSays).toBe('Brightmoor Staffing pays once a month, so this page lists pay by calendar month.')
    await prisma.company.update({ where: { id: firmId }, data: { payPeriod: 'BIWEEKLY' } })
  })

  it('a period that holds nothing to pay says so and offers nothing to run', async () => {
    await setFirstDay('2026-12-06')
    const data = await rows('2030-06-02')
    expect(data.payItems.every((p: any) => p.totalApprovedHours === 0)).toBe(true)
    expect(data.nothingToPay).toMatch(/^Nothing is owed for \w{3} \d{1,2} – \w{3} \d{1,2}, 2030\. No accepted hours fall in it, so there is nothing to work out or pay\.$/)
    expect(data.runsHere).toBe(false)
  })

  it('a calendar month on a company that pays by its own periods is for reading, and offers nothing to run', async () => {
    const data = await rows('2026-12')
    expect(data.runsHere).toBe(false)
    expect(data.periodSays).toBe(
      'Brightmoor Staffing pays every other week, so pay is worked out and paid by pay period. ' +
      'Pick one above to run it; a calendar month is shown here for reading only.',
    )
  })
})
