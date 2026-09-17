import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'

/**
 * Seeding the same world twice, on two different days.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * `reseed-gate` already says pressing the button twice makes no second
 * copy, and it passed while this was broken, because it pressed twice
 * inside one second. Every seeded date is counted in days from today,
 * so a re-seed tomorrow looks for weeks of hours that are a day off the
 * ones it wrote, finds none of them, and writes the lot again.
 *
 * Exactly seven days later it is worse than a duplicate: the weeks line
 * up one step over, so the timesheets are found and the invoice is not,
 * and the run dies on `Unique constraint failed on the fields:
 * (timesheetId, sellContractId)` with the world half rewritten.
 *
 * This is not a corner. The founder seeds production once and re-seeds
 * whenever a name or a story changes, and the second seed is on a
 * different day by definition. If it throws, he is stuck.
 *
 * The clock is faked for the earlier runs; the world's birthday is
 * written into the first company's `createdAt` by the seed itself
 * rather than left to the database clock, which is what makes a day in
 * the past testable at all.
 */

const census = async () => ({
  companies: await prisma.company.count({ where: { slug: { startsWith: 'world-' } } }),
  people: await prisma.person.count(),
  sellContracts: await prisma.sellContract.count(),
  requirements: await prisma.requirement.count(),
  submissions: await prisma.submission.count(),
  timesheets: await prisma.timesheet.count(),
  invoices: await prisma.invoice.count(),
  invoiceLines: await prisma.invoiceLine.count(),
  payments: await prisma.payment.count(),
  interviews: await prisma.interview.count(),
})

/** The seeded world, as it stood the day it was made. */
let firstDay: Awaited<ReturnType<typeof census>>
let bornOn: Date

/** Pretend today is `n` days from the real today, for one seeding. */
const on = (n: number) => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() + n * 86_400_000))
}

beforeAll(async () => {
  await resetDatabase()
  on(-7)
  await seedWorld()
  vi.useRealTimers()
  firstDay = await census()
  bornOn = (await prisma.company.findFirstOrThrow({
    where: { slug: { startsWith: 'world-' } },
    orderBy: { createdAt: 'asc' },
  })).createdAt
}, 600_000)

afterAll(() => {
  vi.useRealTimers()
})

describe('a world that was seeded on an earlier day', () => {
  it('was built at all, so the counts below mean something', () => {
    expect(firstDay.companies).toBeGreaterThan(10)
    expect(firstDay.timesheets).toBeGreaterThan(10)
    expect(firstDay.invoiceLines).toBeGreaterThan(10)
  })

  it('seeding a world that was seeded yesterday makes no second copy and no error', async () => {
    on(-6)
    await expect(seedWorld()).resolves.toBeTruthy()
    vi.useRealTimers()
    expect(await census()).toEqual(firstDay)
  }, 600_000)

  it('seeding a world that was seeded a week ago makes no second copy either, where before it died on a duplicate invoice line', async () => {
    vi.useRealTimers()
    await expect(seedWorld()).resolves.toBeTruthy()
    expect(await census()).toEqual(firstDay)
  }, 600_000)

  it('keeps the day it was born, so the second seeding counts its weeks from the same midnight as the first', async () => {
    vi.useRealTimers()
    await seedWorld()
    expect(day(0).toISOString()).toBe(bornOn.toISOString())
    const oldest = await prisma.timesheet.findFirstOrThrow({ orderBy: { periodStart: 'asc' } })
    expect(oldest.periodStart.getTime()).toBeLessThan(bornOn.getTime())
  }, 600_000)

  it('leaves every seeded company with the one owner it started with, rather than a second seat each', async () => {
    const seats = await prisma.context.count({
      where: { company: { slug: { startsWith: 'world-' } }, grantReason: 'Seeded world' },
    })
    expect(seats).toBe(firstDay.companies)
  })
})
