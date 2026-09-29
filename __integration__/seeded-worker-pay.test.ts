import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { PAID_WORKERS } from '@/lib/seed-payroll-runs'
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
    // Rosa's forty-five-hour week is the one month the seed leaves for a
    // run, because its overtime is priced by payroll and not by a seed.
    const rosa = await weeksOf('rosa.delgado')
    const long = rosa.find((t) => Number(t.totalHours) > 40)!
    const forARun = new Set(Object.keys(long.days as Record<string, number>).map(monthOf))

    for (const address of PAID_WORKERS) {
      const handle = address.split('@')[0]
      const weeks = await weeksOf(handle)
      as(address)
      const r = await json(await myWork(req('GET', '/api/me/work')))
      expect(r.status, handle).toBe(200)
      for (const w of r.body.data.owed.weeks.filter((x: any) => x.stillOwedCents > 0)) {
        const months = daysInWeek(weeks, w.weekOf).map(monthOf)
        expect(
          months.some((m) => m === now || (handle === 'rosa.delgado' && forARun.has(m))),
          `${handle}'s week of ${w.weekOf} reads as owed in a month the seed paid`
        ).toBe(true)
      }
    }
  })

  it('Colleen is paid by her own company on corp to corp, so the seed runs no payroll on her line', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email('colleen.byrne') } })
    const lines = await prisma.buyContract.findMany({ where: { candidates: { some: { personId: person.id } } } })
    expect(lines.map((l) => l.contractType)).toEqual(['C2C'])
    const runs = await prisma.automationLog.findMany({ where: { action: 'PAYROLL_RUN' }, select: { payload: true } })
    const onHers = runs.filter((r) => ((r.payload as any).contracts ?? []).some((c: any) => lines.some((l) => l.id === c.buyContractId)))
    expect(onHers).toEqual([])
  })

  it('seeding the world a second time writes no second payroll run and no second signature', async () => {
    const first = await counts()
    await seedWorld()
    expect(await counts()).toEqual(first)
  }, 900_000)
})
