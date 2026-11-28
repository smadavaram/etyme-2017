import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'

/**
 * A company that pays by the month, found by hand on 2026-11-14: the week
 * of Jun 7 (40 x $96 = $3,840) was worked out, paid and downloaded; the
 * week of Jun 14 was accepted, worked out and paid; the second download
 * listed both weeks as unpaid, so a provider paying from it paid the
 * Jun 7 week twice. The month's file now comes from the Payroll page's own
 * rows, with what was paid already taken off.
 *
 * Calendar facts: Monday 8 June 2026 and Monday 15 June 2026.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let clientId = ''
let owner: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown) {
  as(seat.email)
  return json(await fn(req(method, url, body, { 'x-context-id': seat.id })))
}

async function file(seat: Seat, url: string) {
  as(seat.email)
  const res = await payroll(req('GET', url, undefined, { 'x-context-id': seat.id }))
  return res
}

interface Line { personId: string; sellId: string; buyId: string; candId: string }

async function line(name: string, email: string): Promise<Line> {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  const start = d('2026-06-01')
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: 13_200, startDate: start, state: 'IN_PROGRESS' },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: 9_600, startDate: start } },
    },
    include: { candidates: true },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
  // Every week here is 40 hours, so none waits on whether she is exempt.
  return { personId: person.id, sellId: sell.id, buyId: buy.id, candId: buy.candidates[0].id }
}

/** Monday to Friday, 8 hours a day, accepted as filed. */
async function week(l: Line, monday: string) {
  const m = d(monday)
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(+m + i * 86_400_000))] = 8
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sellId, personId: l.personId, periodStart: new Date(+m - 86_400_000), periodEnd: new Date(+m + 5 * 86_400_000), days, totalHours: 40,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 9_600, state: 'LIVE', byId: owner.personId },
  })
}

/** The June file's line for one person, by column name. */
async function juneLine(name: string) {
  const res = await file(owner, `/api/payroll?period=2026-06&format=csv&companyId=${firmId}`)
  expect(res.status, await res.clone().text()).toBe(200)
  const [head, ...lines] = (await res.text()).trim().split('\n')
  const cols = head.split(',')
  const mine = lines.map((l) => l.split(',')).filter((c) => c[0] === name)
  expect(mine).toHaveLength(1)
  return (k: string) => mine[0][cols.indexOf(k)]
}

const run = (l: Line, action: 'calculate' | 'process') =>
  call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [l.buyId], action, period: '2026-06' })

describe('a company that pays by the month downloads a June file that never lists a paid week as new', () => {
  let omar: Line
  let lena: Line

  beforeAll(async () => {
    await freshWorld()
    const direct = await prisma.buyContract.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    firmId = direct.companyId
    clientId = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract.clientCompanyId
    await prisma.company.update({ where: { id: firmId }, data: { payPeriod: 'MONTHLY', payFirstPeriodStart: null } })
    const ctxs = await prisma.context.findMany({
      where: { companyId: firmId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }

    omar = await line('Omar Haddock', 'omar@month-pay-file.etyme.invalid')
    await week(omar, '2026-06-08')
  }, 900_000)

  it('the first June file, once worked out, lists the Jun 7 week: 40 hours, $3,840.00 to pay, nothing paid already', async () => {
    expect((await run(omar, 'calculate')).status).toBe(200)
    const col = await juneLine('Omar Haddock')
    expect([col('Hours'), col('Pay rate'), col('Gross pay'), col('Paid already'), col('Period start'), col('Period end')])
      .toEqual(['40', '96.00', '3840.00', '0.00', '2026-06-01', '2026-06-30'])
    // Omar's line has no pay days written, so June has none: blank, never a guess.
    expect(col('Pay day')).toBe('')
    const paid = await run(omar, 'process')
    expect(paid.body.data.details.find((x: any) => x.buyContractId === omar.buyId).grossPay).toBe(384_000)
  })

  it('a late week of Jun 14 sends the month back to Calculate, and the file waits in a sentence', async () => {
    await week(omar, '2026-06-15')
    const res = await file(owner, `/api/payroll?period=2026-06&format=csv&companyId=${firmId}`)
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toContain('Press Calculate first.')
  })

  it('the second June file lists only the Jun 14 week, 40 x $96 = $3,840.00, with the paid $3,840.00 beside it, never 80 hours', async () => {
    expect((await run(omar, 'calculate')).status).toBe(200)
    const col = await juneLine('Omar Haddock')
    expect([col('Hours'), col('Gross pay'), col('Paid already'), col('Status')]).toEqual(['40', '3840.00', '3840.00', 'Part paid'])
    const paid = await run(omar, 'process')
    expect(paid.body.data.details.find((x: any) => x.buyContractId === omar.buyId).grossPay).toBe(384_000)
  })

  it('after both are paid, the June file pays nothing and says $7,680.00 was paid already', async () => {
    const col = await juneLine('Omar Haddock')
    expect([col('Hours'), col('Gross pay'), col('Paid already'), col('Status')]).toEqual(['0', '0.00', '7680.00', 'Paid'])
  })

  it('a calculation that never said what it covered does not let Process pay a late week unworked', async () => {
    // Lena's June, worked out by a run written before calculations said what they covered.
    lena = await line('Lena Vance', 'lena@month-pay-file.etyme.invalid')
    await week(lena, '2026-06-08')
    await prisma.automationLog.create({
      data: {
        companyId: firmId, action: 'PAYROLL_RUN', summary: 'Payroll calculate: an earlier run', reason: 'An earlier run', reversible: false,
        payload: {
          action: 'calculate', period: '2026-06',
          contracts: [{ buyContractId: lena.buyId, buyContractCandidateId: lena.candId, payPeriod: { start: '2026-06-01T00:00:00.000Z', end: '2026-06-30T00:00:00.000Z' }, refused: null }],
        } as any,
      },
    })
    await week(lena, '2026-06-15')
    const refused = await run(lena, 'process')
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body.error.message).toContain('has not been worked out yet')
    expect((await run(lena, 'calculate')).status).toBe(200)
    const paid = await run(lena, 'process')
    // Both weeks, 80 x $96 = $7,680, paid once.
    expect(paid.body.data.details.find((x: any) => x.buyContractId === lena.buyId).grossPay).toBe(768_000)
  })

  it('a line paid on the 7th reads June’s own pay day, Jul 7, on the June file worked out, paid, and part paid; never its next pay day, Dec 7', async () => {
    // Pay days written on the line, each the 7th for the month before,
    // moved off weekends and Labor Day: Jul 7, Aug 7, Sep 8, Oct 7, Nov 6,
    // Dec 7. Jul 7 pays Jun 7 to Jul 7, 24 days of June and 7 of July.
    const rae = await line('Rae Okafor', 'rae@month-pay-file.etyme.invalid')
    const days = ['2026-07-07', '2026-08-07', '2026-09-08', '2026-10-07', '2026-11-06', '2026-12-07']
    // And a work-out day before each: Jul 2, Aug 4, Sep 3, Oct 2, Nov 3, Dec 2.
    const calcs = ['2026-07-02', '2026-08-04', '2026-09-03', '2026-10-02', '2026-11-03', '2026-12-02']
    await prisma.cycle.createMany({
      data: [
        ...days.map((x) => ({ buyContractId: rae.buyId, kind: 'SALARY_PAY', dueOn: d(x) })),
        ...calcs.map((x) => ({ buyContractId: rae.buyId, kind: 'SALARY_CALCULATE', dueOn: d(x) })),
      ],
    })
    await week(rae, '2026-06-08')
    expect((await run(rae, 'calculate')).status).toBe(200)
    let col = await juneLine('Rae Okafor')
    expect([col('Hours'), col('Gross pay'), col('Period start'), col('Period end'), col('Pay day')])
      .toEqual(['40', '3840.00', '2026-06-01', '2026-06-30', '2026-07-07'])

    const paid = await run(rae, 'process')
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    // The run settled June's own pay day and no other.
    const marked = await prisma.cycle.findMany({ where: { buyContractId: rae.buyId, kind: 'SALARY_PAY', completedAt: { not: null } }, select: { dueOn: true } })
    expect(marked.map((c) => iso(c.dueOn))).toEqual(['2026-07-07'])
    col = await juneLine('Rae Okafor')
    // 40 x $96 = $3,840.00 paid already, nothing left; Jul 7 is done and the
    // row's next open pay day from today is another month's.
    expect([col('Hours'), col('Gross pay'), col('Paid already'), col('Status'), col('Pay day')])
      .toEqual(['0', '0.00', '3840.00', 'Paid', '2026-07-07'])

    // A late week of Jun 14, worked out: part paid, still June's own Jul 7.
    await week(rae, '2026-06-15')
    expect((await run(rae, 'calculate')).status).toBe(200)
    col = await juneLine('Rae Okafor')
    expect([col('Hours'), col('Gross pay'), col('Paid already'), col('Status'), col('Pay day')])
      .toEqual(['40', '3840.00', '3840.00', 'Part paid', '2026-07-07'])
  })

  it('the view of every period offers no file and says to pick a month; period=all is a sentence, not a failure', async () => {
    const all = await file(owner, `/api/payroll?format=csv&companyId=${firmId}`)
    expect(all.status).toBe(422)
    expect((await all.json()).error.message).toBe('A pay file comes from one month, so no hour is paid twice. Pick a month above.')
    const bad = await file(owner, `/api/payroll?period=all&companyId=${firmId}`)
    expect(bad.status).toBe(422)
    expect((await bad.json()).error.message).toBe('Pick a month or one of your pay periods.')
  })

  it('the older export gives no file, in lower or capital letters, and its list says it is not a pay file', async () => {
    for (const f of ['csv', 'CSV']) {
      const r = await call(owner, payrollExport, 'GET', `/api/payroll/export?provider=GENERIC&format=${f}&from=2026-06-01&to=2026-06-30`)
      expect(r.status).toBe(409)
      expect(r.body.error.message).toBe(
        'This list shows accepted hours whether or not they were paid. Download the pay file from the Payroll page instead.'
      )
    }
    const list = await call(owner, payrollExport, 'GET', '/api/payroll/export?provider=GENERIC&from=2026-06-01&to=2026-06-30')
    expect(list.status).toBe(200)
    expect(list.body.data.note).toContain('whether or not they were paid')
  })
})
