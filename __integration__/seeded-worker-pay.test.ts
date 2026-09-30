import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { PAID_WORKERS } from '@/lib/seed-payroll-runs'
import { EMPLOYEE_CONTRACT_TYPES } from '@/lib/money/paid-through'
import { GET as myWork } from '@/app/api/me/work/route'

/**
 * What a seeded worker reads about her own pay.
 *
 * On 2026-09-29 the worker's page learned to say a week is owed once her
 * employer accepts it and paid once a payroll run pays it. The seed had
 * not kept up: Karthik Menon's, Colleen Byrne's and Ruben Ortega's weeks
 * were signed on the week's own columns and never on the ledger, so no
 * run could pay them; and no employer but Brightmoor, for one month, had
 * ever run payroll, so every month a worker had worked read as owed and
 * past its pay day. This file holds the demo to what an employer that
 * has been paying somebody would show.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthOf = (d: string) => d.slice(0, 7)

/**
 * The days a page week holds. The page groups by calendar week, Monday
 * on, and a seeded week need not start on a Monday.
 */
function daysInWeek(weeks: { days: unknown }[], weekOf: string): string[] {
  const end = iso(new Date(Date.parse(`${weekOf}T00:00:00Z`) + 6 * 86_400_000))
  return weeks.flatMap((t) => Object.keys(t.days as Record<string, number>)).filter((d) => d >= weekOf && d <= end)
}
const email = (handle: string) => `${handle}@seed.etyme.invalid`

/** Every week of a person's, with its signatures. */
async function weeksOf(handle: string) {
  const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email(handle) } })
  return prisma.timesheet.findMany({
    where: { personId: person.id },
    include: {
      assertions: { where: { state: 'LIVE' } },
      sellContract: {
        select: {
          companyId: true, clientCompanyId: true, billRate: true,
          buyLinks: { select: { buyContract: { select: { candidates: { where: { personId: person.id }, select: { payRate: true } } } } } },
        },
      },
    },
    orderBy: { periodStart: 'asc' },
  })
}

async function counts() {
  return {
    runs: await prisma.automationLog.count({ where: { action: 'PAYROLL_RUN' } }),
    assertions: await prisma.workAssertion.count(),
    paidDays: await prisma.cycle.count({ where: { kind: 'SALARY_PAY', completedAt: { not: null } } }),
  }
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
}, 900_000)

describe('a seeded worker reads her own pay the way her employer would have left it', () => {
  it('Karthik’s, Colleen’s and Ruben’s signed weeks are on the ledger: the client’s approval at its bill rate, then the acceptance of the firm that pays, at the pay rate', async () => {
    for (const handle of ['karthik.menon', 'colleen.byrne', 'ruben.ortega']) {
      const signed = (await weeksOf(handle)).filter((t) => t.employerAcceptedAt)
      expect(signed.length, `${handle} has signed weeks`).toBeGreaterThan(0)
      for (const t of signed) {
        const client = t.assertions.filter((a) => a.role === 'CLIENT_APPROVAL')
        const employer = t.assertions.filter((a) => a.role === 'EMPLOYER_ACCEPTANCE')
        expect(client.map((a) => a.companyId)).toEqual([t.sellContract.clientCompanyId])
        expect(employer.map((a) => a.companyId)).toEqual([t.sellContract.companyId])
        expect(client[0].rateCents).toBe(t.sellContract.billRate)
        const payRate = t.sellContract.buyLinks.flatMap((l) => l.buyContract.candidates)[0].payRate
        expect(employer[0].rateCents, 'a promise to pay is at the pay rate').toBe(payRate)
        expect(employer[0].rateCents).not.toBe(t.sellContract.billRate)
        expect(Number(employer[0].hours)).toBe(Number(t.totalHours))
        expect(+employer[0].at, 'the employer accepts after the client signs').toBeGreaterThan(+client[0].at)
      }
    }
  })

  it('a week the client signed and the employer has not is on the ledger as the client’s approval only', async () => {
    const waiting = [
      ...(await weeksOf('colleen.byrne')),
      ...(await weeksOf('ruben.ortega')),
    ].filter((t) => t.clientApprovedAt && !t.employerAcceptedAt)
    expect(waiting.length).toBeGreaterThan(0)
    for (const t of waiting) {
      expect(t.assertions.map((a) => a.role)).toEqual(['CLIENT_APPROVAL'])
      expect(t.status).toBe('SUBMITTED')
    }
  })

  it('Karthik’s weeks in the months before this one are paid by a Teleworld payroll run, and his page says so', async () => {
    const now = monthOf(iso(new Date()))
    const weeks = await weeksOf('karthik.menon')
    const pastDays = weeks.flatMap((t) => Object.keys(t.days as Record<string, number>)).filter((d) => monthOf(d) < now)
    expect(pastDays.length).toBeGreaterThan(0)

    const runs = await prisma.automationLog.findMany({
      where: { action: 'PAYROLL_RUN', company: { slug: 'world-teleworld' } },
      select: { payload: true },
    })
    const paid = new Set(runs.flatMap((r) => ((r.payload as any).contracts ?? []).flatMap((c: any) => (c.paid ?? []).map((l: any) => l.day))))
    expect(pastDays.filter((d) => !paid.has(d))).toEqual([])

    as(email('karthik.menon'))
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status).toBe(200)
    let checked = 0
    for (const w of r.body.data.owed.weeks) {
      const days = daysInWeek(weeks, w.weekOf)
      if (days.length && days.every((d) => monthOf(d) < now)) {
        expect(w.paidCents, `the week of ${w.weekOf}`).toBe(w.owedCents)
        checked++
      }
    }
    expect(checked, 'a week of his wholly before this month is on his page').toBeGreaterThan(0)
  })

  it('no worker the demo pays reads a week as owed unless it has a day in this month or in a month a payroll run has to price', async () => {
    const now = monthOf(iso(new Date()))
    // Rosa's forty-five-hour week was once left for a run; since
    // 2026-09-30 the seed prices its premium through sheetPay and pays it.

    for (const address of PAID_WORKERS) {
      const handle = address.split('@')[0]
      const weeks = await weeksOf(handle)
      as(address)
      const r = await json(await myWork(req('GET', '/api/me/work')))
      expect(r.status, handle).toBe(200)
      for (const w of r.body.data.owed.weeks.filter((x: any) => x.stillOwedCents > 0)) {
        const months = daysInWeek(weeks, w.weekOf).map(monthOf)
        expect(
          months.some((m) => m === now),
          `${handle}'s week of ${w.weekOf} reads as owed in a month the seed paid`
        ).toBe(true)
      }
    }
  })

  it('pays Rosa’s forty-five-hour week with its overtime premium, on the days over the line', async () => {
    const rosa = await weeksOf('rosa.delgado')
    const long = rosa.find((t) => Number(t.totalHours) > 40)!
    const runs = await prisma.automationLog.findMany({ where: { action: 'PAYROLL_RUN' }, select: { payload: true } })
    const lines = runs.flatMap((r) => ((r.payload as any).contracts ?? []).flatMap((c: any) => c.paid ?? []))
      .filter((l: any) => l.timesheetId === long.id)
    expect(lines.reduce((n: number, l: any) => n + (l.overtimeHours ?? 0), 0)).toBe(Number(long.totalHours) - 40)
    expect(lines.reduce((n: number, l: any) => n + (l.premiumCents ?? 0), 0)).toBeGreaterThan(0)
  })

  it('no demo employer’s own payroll reads overdue on the day the world is born', async () => {
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
    const lines = await prisma.buyContract.findMany({
      where: {
        vendorCompanyId: null, supplierSellContractId: null,
        contractType: { in: [...EMPLOYEE_CONTRACT_TYPES] as any },
        company: { slug: { startsWith: 'world-' } },
      },
      select: {
        id: true, company: { select: { name: true } },
        candidates: { select: { person: { select: { name: true } } } },
        buyCycles: { where: { kind: 'SALARY_PAY', completedAt: null, dueOn: { lt: today } }, select: { dueOn: true } },
      },
    })
    expect(lines.length).toBeGreaterThan(0)
    const overdue = lines.filter((l) => l.buyCycles.length > 0).map((l) =>
      `${l.company.name} owes ${l.candidates[0]?.person.name ?? 'somebody'} pay due ${l.buyCycles.map((c) => iso(c.dueOn)).join(', ')}`)
    expect(overdue).toEqual([])
  })

  it('Colleen is paid by her own company on corp to corp, so the seed runs no payroll on her line', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email('colleen.byrne') } })
    const lines = await prisma.buyContract.findMany({ where: { candidates: { some: { personId: person.id } } } })
    expect(lines.map((l) => l.contractType)).toEqual(['C2C'])
    const runs = await prisma.automationLog.findMany({ where: { action: 'PAYROLL_RUN' }, select: { payload: true } })
    const onHers = runs.filter((r) => ((r.payload as any).contracts ?? []).some((c: any) => lines.some((l) => l.id === c.buyContractId)))
    expect(onHers).toEqual([])
  })

  it('Karthik’s placement runs three months, every month of it has a pay day, and no pay day comes before the hours it pays', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email('karthik.menon') } })
    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { personId: person.id, company: { slug: 'world-teleworld' } },
      include: { buyLinks: { include: { buyContract: { include: { buyCycles: { where: { kind: 'SALARY_PAY' }, orderBy: { dueOn: 'asc' } } } } } } },
    })
    const start = sell.startDate
    const end = sell.endDate!
    // The 1st of a month to the last day of the month two after it.
    expect(start.getUTCDate()).toBe(1)
    expect(new Date(+end + 86_400_000).getUTCDate()).toBe(1)
    expect((end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()).toBe(2)

    const months = [0, 1, 2].map((i) => iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))).slice(0, 7))
    const weeks = await weeksOf('karthik.menon')
    const worked = weeks.flatMap((t) => Object.keys(t.days as Record<string, number>))
    // Hours across the whole window, every weekday of it.
    expect(new Set(worked.map(monthOf))).toEqual(new Set(months))
    expect(worked.every((d) => d >= iso(start) && d <= iso(end))).toBe(true)

    const payDays = sell.buyLinks[0].buyContract.buyCycles.map((c) => iso(c.dueOn))
    expect(payDays).toHaveLength(3)
    for (const [i, m] of months.entries()) {
      const lastWorked = worked.filter((d) => monthOf(d) === m).sort().at(-1)!
      const monthEnd = iso(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)))
      expect(payDays[i] > monthEnd, `${m} is paid on ${payDays[i]}, after the month`).toBe(true)
      expect(payDays[i] > lastWorked, `${m} is paid after its last hours`).toBe(true)
    }
  })

  it('every demo worker is paid monthly, on a day after the month’s hours, and each pay day matches a paid period in the payroll runs', async () => {
    const lines = await prisma.buyContract.findMany({
      where: {
        contractType: 'W2', vendorCompanyId: null,
        candidates: { some: { person: { primaryEmail: { in: [...PAID_WORKERS] } } } },
      },
      include: {
        buyCycles: { where: { kind: { in: ['SALARY_PAY', 'SALARY_CALCULATE'] } }, orderBy: { dueOn: 'asc' } },
        candidates: { select: { personId: true } },
      },
    })
    expect(lines.length).toBeGreaterThan(0)
    const runs = await prisma.automationLog.findMany({ where: { action: 'PAYROLL_RUN' }, select: { payload: true } })
    let matched = 0
    for (const line of lines) {
      const pay = line.buyCycles.filter((c) => c.kind === 'SALARY_PAY')
      const calc = line.buyCycles.filter((c) => c.kind === 'SALARY_CALCULATE')
      expect(pay.length, `line ${line.id} has pay days`).toBeGreaterThan(0)
      expect(calc.length).toBe(pay.length)
      // Monthly: one pay day a month, each paying the month before it.
      const paidMonth = (d: Date) => iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 10))).slice(0, 7)
      expect(new Set(pay.map((c) => paidMonth(c.dueOn))).size).toBe(pay.length)
      const sheets = await prisma.timesheet.findMany({ where: { personId: line.candidates[0].personId, sellContract: { buyLinks: { some: { buyContractId: line.id } } } } })
      const worked = sheets.flatMap((t) => Object.keys(t.days as Record<string, number>))
      for (const [i, c] of pay.entries()) {
        const m = paidMonth(c.dueOn)
        const monthEnd = iso(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)))
        expect(iso(c.dueOn) > monthEnd, `pay day ${iso(c.dueOn)} is after ${m}`).toBe(true)
        const last = worked.filter((d) => monthOf(d) === m).sort().at(-1)
        if (last) expect(iso(c.dueOn) > last).toBe(true)
        expect(+calc[i].dueOn, 'the month is worked out before it is paid').toBeLessThan(+c.dueOn)
      }
      // Every period a run paid has its pay day marked, and every pay day
      // marked is one a run paid.
      const periods = runs.flatMap((r) => ((r.payload as any).contracts ?? []))
        .filter((c: any) => c.buyContractId === line.id && c.payPeriod)
        .map((c: any) => c.payPeriod.end as string)
      const done = pay.filter((c) => c.completedAt).map((c) => paidMonth(c.dueOn)).sort()
      expect(done, `line ${line.id}`).toEqual(periods.map((e: string) => e.slice(0, 7)).sort())
      matched += periods.length
    }
    expect(matched, 'the seed paid some months').toBeGreaterThan(0)
  })

  it('seeding the world a second time writes no second payroll run and no second signature', async () => {
    const first = await counts()
    await seedWorld()
    expect(await counts()).toEqual(first)
  }, 900_000)
})
