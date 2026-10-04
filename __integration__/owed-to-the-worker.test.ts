import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'
import { nextOpen } from '@/lib/money/next-cycle'
import { periodTermsFor, ORDER_HEADER_SELECT } from '@/lib/money/order-terms'
import { periodFor, type Terms } from '@/lib/periods'

import { GET as myWork, POST as fileWeek } from '@/app/api/me/work/route'
import { POST as approveWeek } from '@/app/api/timesheets/[id]/approve/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'

/**
 * Who owes the worker what, and when, on her own page — walked on the
 * seeded Rosa Delgado.
 *
 * The founder, 2026-09-29: once the client approves a week the client
 * owes it to the firm it pays; once her employer accepts it, having
 * checked the client's approval, her employer owes her, due on her own
 * pay schedule. So her page says "owed to you" only after the employer's
 * acceptance, with the date it falls due, and a week the client signed
 * and the employer has not accepted reads as waiting on the employer,
 * never as owed.
 *
 * Rosa is Brightmoor Staffing's own W2 at Northbend Athletic, paid $70
 * an hour now. She files this week from her own page; Northbend's hiring
 * manager signs it; Brightmoor's payroll desk accepts fewer hours than
 * she filed, with a reason; Brightmoor runs payroll for the week. Her
 * page is read at every step, as her.
 */

const ROSA = RATE_CHANGE_PERSON.email
const NORTHBEND_HIRING = 'world-nike-hiring@demo.etyme.local'
const BRIGHTMOOR_PAYROLL = 'world-brightmoor-payroll@demo.etyme.local'
const HELENA = 'helena.marsh@seed.etyme.invalid'

const iso = (d: Date) => d.toISOString().slice(0, 10)

async function page(email: string) {
  as(email)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

/** Every number anywhere in a value, however deeply nested. */
function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value)
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbersIn(v, out)
  return out
}

const the: {
  buyId: string
  terms: Terms | null
  payPeriodEnd: string
  weekStart: string
  weekEnd: string
  sheetId: string
  weekOf: string
  periodStart: string
  periodEnd: string
  filed: number
  accepted: number
  owedBefore: number
} = { buyId: '', terms: null, payPeriodEnd: '', weekStart: '', weekEnd: '', sheetId: '', weekOf: '', periodStart: '', periodEnd: '', filed: 0, accepted: 0, owedBefore: 0 }

const mine = (d: any) => d.owed.weeks.filter((w: any) => w.sheetId === the.sheetId || (w.weekOf === the.weekOf && !w.sheetId))

describe('on the seeded Rosa Delgado, a week is owed to her once her employer accepts it, and not before', () => {
  beforeAll(async () => {
    await freshWorld()
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: ROSA } })
    const sell = await prisma.sellContract.findFirstOrThrow({ where: { personId: person.id }, include: { buyLinks: true } })
    the.buyId = sell.buyLinks[0].buyContractId
    // Her pay periods, read through the one door payroll and her page read
    // them through, so the week below is chosen from the world's own terms.
    const bc = await prisma.buyContract.findUniqueOrThrow({
      where: { id: the.buyId },
      include: { workOrder: { select: ORDER_HEADER_SELECT }, candidates: { select: { startDate: true } } },
    })
    the.terms = { ...periodTermsFor('BUY', bc), startedOn: bc.candidates[0].startDate }
  }, 900_000)

  it('a week she sends reads as waiting for Northbend Athletic to sign it, and nothing on it is owed', async () => {
    const before = await page(ROSA)
    the.owedBefore = before.owed.cents
    // What the world already owes her depends on the day it was born. Born
    // on a 1st, every week she worked sits in a month a payroll run already
    // paid, and nothing is owed; born mid-month, the weeks since are. Both
    // are true of their world, so the test reads the figure rather than
    // assuming one, and every step below adds to it or leaves it alone.
    expect(Number.isInteger(the.owedBefore) && the.owedBefore >= 0, `owed before: ${the.owedBefore}`).toBe(true)

    const filing = before.filing[0]
    expect(filing.payer).toBe('Brightmoor Staffing')
    const week = filing.weeks[0]
    expect(week, JSON.stringify(filing.weeks)).toBeTruthy()
    // Eight hours on each weekday of this week that has happened, and
    // nothing on a Saturday or Sunday: at most forty, so no day of the
    // week the world is born on puts her over the overtime line and the
    // figures below stay straight time at $70. And only the days in the
    // pay period holding the latest of them: a week that crosses into a
    // new month is paid on two pay days, one per period (her page says
    // so), and this walk is about one week reaching one pay day.
    const day = (d: string) => new Date(`${d}T00:00:00Z`)
    const weekdays = week.days.filter((d: string) => ![0, 6].includes(day(d).getUTCDay()))
    expect(weekdays.length, JSON.stringify(week.days)).toBeGreaterThan(0)
    const period = periodFor(day(weekdays[weekdays.length - 1]), the.terms!)
    const worked: string[] = weekdays.filter((d: string) => day(d) >= period.start && day(d) <= period.end)
    const hours = Object.fromEntries(worked.map((d) => [d, 8]))
    the.filed = 8 * worked.length

    as(ROSA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', { contractId: filing.contractId, periodStart: week.periodStart, hours })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.status).toBe('SUBMITTED')
    the.sheetId = r.body.data.timesheetId
    // The week as filed, which the payroll file selects by, and the days
    // she worked, which the run below pays.
    the.weekStart = week.periodStart
    the.weekEnd = week.periodEnd
    the.periodStart = worked[0]
    the.periodEnd = worked[worked.length - 1]
    the.payPeriodEnd = iso(period.end)

    const after = await page(ROSA)
    const row = after.owed.weeks.find((w: any) => w.sheetId === the.sheetId)
    expect(row, JSON.stringify(after.owed.weeks.slice(0, 3))).toBeTruthy()
    the.weekOf = row.weekOf
    expect(row.stage).toBe('WAITING_FOR_CLIENT')
    expect(row.hours).toBe(the.filed)
    // The day she sent it where the week carries one. The submit door does
    // not write `submittedAt` today (reported to its owner), and the page
    // says nothing rather than a day it cannot stand behind.
    const sent = await prisma.timesheet.findUniqueOrThrow({ where: { id: the.sheetId }, select: { submittedAt: true } })
    expect(row.says).toMatch(
      sent.submittedAt
        ? /^Sent to Northbend Athletic on [A-Z][a-z]{2} \d{1,2}\. Waiting for them to sign\.$/
        : /^Sent to Northbend Athletic\. Waiting for them to sign\.$/
    )
    // Nothing is owed on it, and the total did not move.
    expect(after.owed.cents).toBe(the.owedBefore)
    expect(after.owed.waiting.weeks).toBe(1)
    expect(after.owed.waiting.says).toContain('It is waiting for Northbend Athletic to sign.')
  })

  it('a week the client signed and the employer has not accepted reads as waiting on the employer, never as owed', async () => {
    as(NORTHBEND_HIRING)
    const signed = await json(await approveWeek(
      req('POST', `/api/timesheets/${the.sheetId}/approve`, {}),
      { params: Promise.resolve({ id: the.sheetId }) }
    ))
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)
    const sheet = await prisma.timesheet.findUniqueOrThrow({ where: { id: the.sheetId } })
    expect(sheet.clientApprovedAt).not.toBeNull()
    expect(sheet.employerAcceptedAt).toBeNull()

    const d = await page(ROSA)
    const rows = mine(d)
    expect(rows.map((w: any) => w.stage)).toEqual(['WAITING_FOR_EMPLOYER'])
    const row = rows[0]
    expect(row.says).toMatch(/^Northbend Athletic signed it on [A-Z][a-z]{2} \d{1,2}\. Waiting for Brightmoor Staffing to accept it\./)
    expect(row.says).toContain('It is owed to you once Brightmoor Staffing accepts it.')
    // No figure of any kind on the row, and not a cent more owed.
    expect(Object.keys(row).filter((k) => /cents|rate/i.test(k))).toEqual([])
    expect(d.owed.cents).toBe(the.owedBefore)
    expect(d.owed.waiting).toMatchObject({ weeks: 1, forClient: 0, forEmployer: 1, hours: the.filed })
    expect(d.owed.waiting.says).toContain('It is waiting for Brightmoor Staffing to accept.')
  })

  it('a week the employer accepted is owed to her, with the date it falls due on her pay schedule', async () => {
    // Brightmoor accepts two hours fewer than she filed, and says why.
    the.accepted = the.filed - 2
    as(BRIGHTMOOR_PAYROLL)
    const accepted = await json(await approveWeek(
      req('POST', `/api/timesheets/${the.sheetId}/approve`, {
        acceptedHours: the.accepted,
        note: 'Two hours were the site induction, which Northbend does not pay for.',
      }),
      { params: Promise.resolve({ id: the.sheetId }) }
    ))
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)

    const d = await page(ROSA)
    const rows = mine(d)
    expect(rows.map((w: any) => w.stage)).toEqual(['OWED'])
    const row = rows[0]
    expect(row.priced).toBe(true)
    expect(row.stillOwedCents).toBeGreaterThan(0)

    // Her pay day: the first one on her own pay line on or after the later
    // of the day her pay period ends and the day Brightmoor accepted it —
    // pay follows the hours it pays, so a week worked in October is paid
    // on October's pay day, never on the September one that falls after it.
    const cycles = (await prisma.cycle.findMany({ where: { buyContractId: the.buyId, kind: 'SALARY_PAY' } }))
      .map((c) => ({ ...c, completedAt: null }))
    const acceptedOn = iso(new Date())
    const from = the.payPeriodEnd > acceptedOn ? the.payPeriodEnd : acceptedOn
    const due = nextOpen(cycles, 'SALARY_PAY', new Date(`${from}T00:00:00Z`))
    expect(due, 'her pay line has a pay day after this week').not.toBeNull()
    expect(row.dueOn).toBe(iso(due!.dueOn))
    expect(row.overdue).toBe(false)
    expect(row.says).toMatch(/It is due on your pay day, [A-Z][a-z]{2} \d{1,2}\.$/)

    // Owed now, on top of what was owed before, and nothing waiting.
    expect(d.owed.cents).toBe(the.owedBefore + row.stillOwedCents)
    expect(d.owed.waiting.weeks).toBe(0)
  })

  it('a week the employer cut is priced on the hours accepted, the way payroll pays it', async () => {
    const d = await page(ROSA)
    const row = mine(d)[0]
    expect(row.hours).toBe(the.accepted)
    expect(row.filedHours).toBe(the.filed)
    expect(row.says).toContain(`You filed ${the.filed} hours and Brightmoor Staffing accepted ${the.accepted}.`)
    // At $70, the rate she is on now, and never at the $112 Northbend is billed.
    expect(row.owedCents).toBe(the.accepted * 7_000)

    // The same figure the payroll file pays for the same days.
    as(BRIGHTMOOR_PAYROLL)
    const f = await json(await payrollExport(
      req('GET', `/api/payroll/export?from=${the.weekStart}&to=${the.weekEnd}&provider=GENERIC`)
    ))
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    const lines = f.body.data.lines.filter((l: any) => l.personName === RATE_CHANGE_PERSON.name)
    expect(lines.reduce((n: number, l: any) => n + l.hours, 0)).toBe(the.accepted)
    expect(lines.reduce((n: number, l: any) => n + l.totalCents, 0)).toBe(row.owedCents)
    expect(numbersIn(d.owed)).not.toContain(11_200)
  })

  it('a paid week shows what was paid and when', async () => {
    as(BRIGHTMOOR_PAYROLL)
    const run = await json(await runPayroll(req('POST', '/api/payroll/run', {
      buyContractIds: [the.buyId], action: 'process', period: { start: the.periodStart, end: the.periodEnd },
    })))
    expect(run.status, JSON.stringify(run.body)).toBe(200)
    const paidRow = run.body.data.details.find((x: any) => x.buyContractId === the.buyId)
    expect(paidRow.totalHours).toBe(the.accepted)

    const d = await page(ROSA)
    const rows = mine(d)
    expect(rows.map((w: any) => w.stage)).toEqual(['PAID'])
    const row = rows[0]
    expect(row.paidCents).toBe(paidRow.grossPay)
    expect(row.paidCents).toBe(the.accepted * 7_000)
    expect(row.stillOwedCents).toBe(0)
    // A run for a week inside her monthly pay period settles no pay day —
    // the month's own run does — so it was paid the day it ran
    // (lib/money/pay-day-period).
    expect(row.paidOn).toBe(iso(new Date()))
    expect(row.dueOn).toBeNull()
    expect(row.says).toMatch(/Brightmoor Staffing paid it on [A-Z][a-z]{2} \d{1,2}\.$/)
    // Paid is not owed: the total is back where it started.
    expect(d.owed.cents).toBe(the.owedBefore)
  })
})

describe('in a chain, a week the client signed names every firm still to accept it', () => {
  it('Helena’s week, signed by Northbend Athletic, waits for Computer Systems Inc and then Techpeple, and is not owed to her', async () => {
    const before = await page(HELENA)
    const filing = before.filing[0]
    expect(filing.payer).toBe('Techpeple')
    const week = filing.weeks[0]
    as(HELENA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: filing.contractId, periodStart: week.periodStart, hours: { [week.days[0]]: 8 },
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const id = r.body.data.timesheetId

    as(NORTHBEND_HIRING)
    const signed = await json(await approveWeek(req('POST', `/api/timesheets/${id}/approve`, {}), { params: Promise.resolve({ id }) }))
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)

    const d = await page(HELENA)
    const row = d.owed.weeks.find((w: any) => w.sheetId === id)
    expect(row.stage).toBe('WAITING_FOR_EMPLOYER')
    expect(row.waitingOn).toBe('Computer Systems Inc')
    expect(row.says).toContain('Waiting for Computer Systems Inc to accept it, then Techpeple.')
    expect(row.says).toContain('It is owed to you once Techpeple accepts it.')
    expect(Object.keys(row).filter((k) => /cents|rate/i.test(k))).toEqual([])
  })
})
