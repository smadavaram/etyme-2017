import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { iso, isAPeriod } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { dueOn } from '@/lib/billing-cascade'

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
  // One owner seat per firm, and the same number of them however many
  // times the world is seeded.
  ownerSeats: await prisma.context.count({
    where: { company: { slug: { startsWith: 'world-' } }, grantReason: 'Seeded world' },
  }),
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
    // Counted per company rather than against the number of companies.
    // Not every firm in this world is somebody's employer: a
    // consultant's own limited company is a real company — it signs,
    // it invoices, it carries the cover — and nobody signs in as it,
    // because the consultant IS it and she holds a consultant's seat
    // elsewhere. Comparing a total against a total made that read as a
    // missing seat when what it is is an absent one.
    const perCompany = await prisma.context.groupBy({
      by: ['companyId'],
      where: { company: { slug: { startsWith: 'world-' } }, grantReason: 'Seeded world' },
      _count: { _all: true },
    })
    expect(perCompany.filter((c) => c._count._all > 1)).toEqual([])
    // And every firm that employs anybody has exactly one. The total is
    // in the census above, so three seedings on three days cannot move it.
    expect(perCompany.length).toBeGreaterThan(20)
  })
})

/**
 * And the bills the world was seeded with are shaped like bills.
 *
 * ── Why this hangs off the re-seed test ──────────────────────────────
 *
 * Because both of the things it catches only appear on some days.
 *
 * Every seeded date is counted back from the day the world was born, so
 * a run of signed weeks lands wherever it lands. The seed used to take
 * the whole run and call it one billing period — `periodStart:
 * signed[0].periodStart, periodEnd: signed[last].periodEnd` — and on a
 * world born in the first days of a month that span crossed from August
 * into September. Five of Northbend Athletic's eleven bills were in that
 * state on some seed days and none of them on others, and the three-way
 * match refused each one, correctly, for covering a period no contract
 * bills on.
 *
 * The second is worse because it is arithmetic on a screen. A world
 * seeded twice across more than one day produced `IN-X5JEDU-20260816`
 * with a total of $17,400 and no lines at all: the header was written
 * first and every line under it was then skipped as already billed. A
 * bill whose lines add to nothing and whose total says seventeen
 * thousand is the exact thing CLAUDE.md means by a number nobody can
 * stand behind, and it sat on a client's payables page.
 *
 * The world under these has been seeded three times on three different
 * days by the tests above, which is the condition both bugs needed.
 */
describe('the bills the seeded world carries are shaped like the bills production raises', () => {
  it('gives every seeded invoice at least one line, so no total on a payables page adds up to nothing', async () => {
    const empty = await prisma.invoice.findMany({
      where: { invoiceLines: { none: {} } },
      select: { number: true, total: true, periodStart: true },
    })
    expect(
      empty.map((i) => `${i.number} — $${Number(i.total)} and nothing under it`),
      'An invoice with no lines claims a total nothing supports. Skip writing the header ' +
        'when every signed week in the period is already on a line.'
    ).toEqual([])
  })

  it('makes each invoice total agree with the lines under it, to the cent', async () => {
    const invoices = await prisma.invoice.findMany({
      select: { number: true, total: true, invoiceLines: { select: { amountCents: true } } },
    })
    expect(invoices.length).toBeGreaterThan(10)
    const wrong = invoices
      .map((i) => ({
        number: i.number,
        header: Math.round(Number(i.total) * 100),
        lines: i.invoiceLines.reduce((sum, l) => sum + l.amountCents, 0),
      }))
      .filter((i) => i.header !== i.lines)
      .map((i) => `${i.number}: header ${i.header}c, lines ${i.lines}c`)
    expect(wrong).toEqual([])
  })

  it('bills one whole billing period per invoice, never the span of whichever weeks happened to be signed', async () => {
    const invoices = await prisma.invoice.findMany({
      where: { invoiceLines: { some: { sellContractId: { not: null } } } },
      select: {
        number: true, periodStart: true, periodEnd: true,
        invoiceLines: {
          where: { sellContractId: { not: null } },
          select: {
            sellContract: {
              select: {
                startDate: true, billFrequency: true, billAnchor: true, billStraddle: true,
                workOrder: { select: ORDER_HEADER_SELECT },
              },
            },
          },
        },
      },
    })
    expect(invoices.length).toBeGreaterThan(10)
    const wrong = invoices
      .filter((i) => {
        const line = i.invoiceLines[0].sellContract!
        return !isAPeriod(i.periodStart, i.periodEnd, periodTermsFor('SELL', line))
      })
      .map((i) => `${i.number}: ${iso(i.periodStart)} to ${iso(i.periodEnd)}`)
    expect(
      wrong,
      'A bill covering 28 July to 24 August is a period in no contract, matching no order, ' +
        'and refused by the three-way match. Ask `periodFor` under the terms of the document ' +
        'the line is on, the way POST /api/invoices/generate does.'
    ).toEqual([])
  })

  it('keeps every line inside the period its own invoice claims to cover', async () => {
    const lines = await prisma.invoiceLine.findMany({
      where: { timesheetId: { not: null } },
      select: {
        invoice: { select: { number: true, periodStart: true, periodEnd: true } },
        timesheet: { select: { periodStart: true } },
      },
    })
    expect(lines.length).toBeGreaterThan(10)
    const outside = lines
      .filter(
        (l) =>
          l.timesheet!.periodStart < l.invoice.periodStart ||
          l.timesheet!.periodStart > l.invoice.periodEnd
      )
      .map((l) => `${l.invoice.number}: a week starting ${iso(l.timesheet!.periodStart)}`)
    expect(outside).toEqual([])
  })

  it('gives every seeded invoice one due date — the one its own payment terms compute, never issue plus forty-five', async () => {
    const invoices = await prisma.invoice.findMany({
      where: { invoiceLines: { some: { sellContractId: { not: null } } } },
      select: {
        number: true, periodEnd: true, issuedAt: true, dueAt: true,
        invoiceLines: {
          where: { sellContractId: { not: null } },
          select: {
            sellContract: {
              select: {
                startDate: true, paymentTerms: true, paymentTermsFrom: true,
                billFrequency: true, billAnchor: true, billStraddle: true,
                workOrder: { select: ORDER_HEADER_SELECT },
              },
            },
          },
        },
      },
    })
    expect(invoices.length).toBeGreaterThan(10)
    // A bill with no issue date and no due date is its own bug, and the
    // comparison below would silently skip it.
    expect(
      invoices.filter((i) => !i.issuedAt || !i.dueAt).map((i) => i.number),
      'A seeded bill with no issue date or no due date cannot be chased or paid.'
    ).toEqual([])
    const wrong = invoices
      .map((i) => {
        const terms = termsFor('SELL', i.invoiceLines[0].sellContract!)
        const due = dueOn({
          anchor: terms.paymentTermsFrom ?? 'PERIOD_END',
          days: terms.paymentTermsDays ?? 30,
          periodEnd: i.periodEnd,
          issuedAt: i.issuedAt!,
          receivedAt: null,
          approvedAt: null,
        })
        return { number: i.number, says: iso(due.dueAt), holds: iso(i.dueAt!) }
      })
      .filter((i) => i.says !== i.holds)
      .map((i) => `${i.number}: the row says ${i.holds}, the terms say ${i.says}`)
    expect(
      wrong,
      'The invoice screen prints the stored due date beside the sentence `dueOn` computes. ' +
        'Two different dates in adjacent lines and no way to tell which is the wrong one.'
    ).toEqual([])
  })

  it('raises no bill dated in the future, and pays none before it was raised', async () => {
    const invoices = await prisma.invoice.findMany({
      select: { number: true, issuedAt: true, payments: { select: { receivedAt: true } } },
    })
    const today = day(0)
    const wrong = invoices
      .filter((i) => i.issuedAt !== null)
      .filter(
        (i) =>
          i.issuedAt! > today ||
          i.payments.some((p) => p.receivedAt !== null && p.receivedAt < i.issuedAt!)
      )
      .map((i) => `${i.number} issued ${iso(i.issuedAt!)}`)
    expect(wrong).toEqual([])
  })
})
