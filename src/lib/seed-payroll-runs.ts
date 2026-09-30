/**
 * The payroll runs a seeded employer has already made.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * A worker's own page says a week is owed to her once her employer has
 * accepted it, and paid once a processed payroll run has paid it
 * (`lib/payroll-paid`, read by `/api/me/work`). The seed recorded one
 * run — Rosa Delgado's June — so on a fresh demo her page read every
 * other month since February as owed and past its pay day, about $68,000,
 * as if Brightmoor Staffing had not paid her since the winter. An
 * employer that has been paying somebody for seven months has run
 * payroll seven times.
 *
 * So each W2 line of a worker the demo opens a page for gets a processed
 * run for every pay period of its own that ended before the world was
 * born — a calendar month on every seeded line — recorded in the shape
 * `POST /api/payroll/run` records it: every day it paid, at the rate in
 * force that day, so the next run — and her page — subtracts it. The
 * period holding today is left for the payroll desk to run, which is the
 * one period a worker's page should read as owed.
 *
 * ── What this will not pay, and why ──────────────────────────────────
 *
 * The run's pricing lives inside the route, which is money's. This file
 * pays a month only where the route's answer is plain straight time with
 * nothing to decide: one acceptance standing on each week, from the firm
 * that pays; the hours accepted as filed; no leave; no calendar week over
 * the worker's pay line; and every day inside the line's window. There,
 * what a run pays is each day's hours at the rate in force that day, and
 * nothing else — so `premiumsPriced` is written true, because a run that
 * priced overtime would have found none.
 *
 * A month with anything else is left unpaid and said, never approximated.
 * Rosa's forty-five-hour week in August is the case: its five hours of
 * premium depend on the overtime method her employer chose and the
 * regular rate of the week, and a second copy of that arithmetic here
 * would be a number nobody can stand behind the day the route changes.
 * August pays through here the day the route's pricing is a function
 * this file can call instead of restate.
 *
 * ── Idempotent ───────────────────────────────────────────────────────
 *
 * A run is keyed on its line and the start of the period it paid. A
 * second seeding finds every run it wrote and writes nothing; a world
 * whose June run was written before this file finds it and leaves it.
 *
 * ── Two things it does not do ────────────────────────────────────────
 *
 * It writes no pay dates: every seeded payroll line has its own, monthly,
 * written when the line was (`DEMO_MONTHLY_PAY`), and a run here marks
 * the one its period falls due on — the day after the month, never the
 * month-end itself. And it pays nobody on corp to corp: Colleen Byrne is paid by her own company, which invoices
 * Halcyon, and what Halcyon owes is an invoice receipt, not payroll.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { priceByDay, ratePeriods } from '@/lib/contract-rate'
import { periodFor, hoursInPeriod, type Period, type Terms } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey, PAYROLL_RUN, type PaidLine } from '@/lib/payroll-paid'
import { payLineOn } from '@/lib/money/pay-line'
import { EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import { weekStart } from '@/lib/overtime'
import { totals } from '@/lib/money-display'
import { DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)

/**
 * How far past a period's end its pay day may fall: the demo's monthly
 * pay day is month-end + 9 at the latest (`DEMO_MONTHLY_PAY`), moved back
 * off a weekend or holiday, never forward. The next month's pay day is
 * always past this, so a run completes its own period's pay day only.
 */
const PAY_LAG_DAYS = Math.max(...DEMO_MONTHLY_PAY.filter((d) => d.kind === 'SALARY_PAY').map((d) => d.offsetDays ?? 0))

/**
 * The workers whose pay the demo shows from their own page, by the
 * address their door signs in at, and Aptiva's own analyst, whose weeks
 * its payroll desk pays. A line of anybody else is the payroll desk's to
 * run on the demo, and left for it.
 */
export const PAID_WORKERS = [
  'rosa.delgado@seed.etyme.invalid',
  'karthik.menon@seed.etyme.invalid',
  'helena.marsh@seed.etyme.invalid',
  'chidi.okafor@seed.etyme.invalid',
  'ruben.ortega@seed.etyme.invalid',
] as const

/** When the run for a period was pressed: ten days after it ends, and never after the world was born. */
export function runAtFor(period: Period): Date {
  const usual = atHour(plus(period.end, 10), 17)
  const latest = atHour(day(-1), 17)
  return usual < latest ? usual : latest
}

type Line = NonNullable<Awaited<ReturnType<typeof loadLine>>>

/** The line, its worker, and every week accepted on it with when it was accepted. Read once. */
async function loadLine(buyContractId: string) {
  return db.buyContract.findUnique({
    where: { id: buyContractId },
    include: {
      candidates: { include: { person: { select: { id: true, name: true } } } },
      workOrder: { select: ORDER_HEADER_SELECT },
      exemptAssertions: { select: EXEMPT_SELECT },
      entity: { select: { country: true } },
      company: { select: { name: true } },
      sellLinks: {
        include: {
          sellContract: {
            select: {
              overtimeAfterHours: true,
              workLocation: { select: { country: true } },
              timesheets: {
                where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
                select: {
                  id: true, personId: true, days: true, leaveDays: true, periodStart: true, periodEnd: true,
                  acceptedHours: true,
                  assertions: {
                    where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                    select: { companyId: true, hours: true, at: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
}

/**
 * What a run pressed at `runAt` pays for one period, day by day — or why
 * the seed will not say. Pure: reads nothing, writes nothing.
 */
function priceThePeriod(
  bc: Line,
  period: Period,
  terms: Terms,
  runAt: Date,
  rates: ReturnType<typeof ratePeriods>,
  paid: Map<string, number>
): { lines: PaidLine[]; refused: string | null } {
  const cand = bc.candidates[0]
  const who = cand.person.name
  const exempt = bc.exemptAssertions.find((a) => a.personId === cand.personId) ?? null
  const lines: PaidLine[] = []
  const weekly = new Map<string, number>()
  let lineAfter: number | null = null
  const refuse = (refused: string) => ({ lines: [], refused })

  for (const link of bc.sellLinks) {
    const sell = link.sellContract
    const line = payLineOn(bc, sell, { name: who, payCurrency: cand.payCurrency }, exempt)
    for (const t of sell.timesheets) {
      if (t.personId !== cand.personId) continue
      // What stood on the week when the run was pressed.
      const standing = t.assertions.filter((a) => a.companyId === bc.companyId && a.at <= runAt)
      if (standing.length === 0) continue
      const days = Object.fromEntries(
        Object.entries((t.days ?? {}) as Record<string, number>).map(([d, h]) => [d.slice(0, 10), Number(h || 0)])
      )
      const filed = Object.values(days).reduce((a, b) => a + b, 0)
      const share = hoursInPeriod(
        { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days, totalHours: filed },
        period,
        terms.straddle
      )
      if (!share || share.hours <= 0) continue
      const week = `the week of ${iso(t.periodStart)}`

      if (standing.length !== 1) return refuse(`${who}'s ${week} has ${standing.length} acceptances standing, and a run pays none of them on a guess.`)
      if (Number(standing[0].hours) !== filed || (t.acceptedHours != null && Number(t.acceptedHours) !== filed)) {
        return refuse(`${who}'s ${week} was accepted at fewer hours than were filed, and which hours are cut is the payroll run's to decide.`)
      }
      if (Object.keys((t.leaveDays ?? {}) as object).length > 0) return refuse(`${who}'s ${week} carries leave, which the payroll run prices.`)
      const outside = Object.keys(days).some((d) => {
        const on = new Date(`${d}T00:00:00Z`)
        return on < link.effectiveFrom || (link.effectiveTo != null && on > link.effectiveTo)
      })
      if (outside) return refuse(`${who}'s ${week} has days outside the line's window.`)
      if (line.afterHours != null) lineAfter = lineAfter == null ? line.afterHours : Math.min(lineAfter, line.afterHours)
      for (const [d, h] of Object.entries(days)) weekly.set(weekStart(d), (weekly.get(weekStart(d)) ?? 0) + h)

      const priced = priceByDay({
        contractRateCents: cand.payRate, periods: rates, days, hours: null,
        within: share.partial ? period : null, periodStart: t.periodStart, periodEnd: t.periodEnd,
      })
      for (const x of priced.days) {
        const before = paid.get(paidKey(bc.id, cand.personId, t.id, x.day)) ?? 0
        const left = Math.round((x.hours - before) * 100) / 100
        if (left > 0) lines.push({ personId: cand.personId, timesheetId: t.id, day: x.day, hours: left, rateCents: x.rateCents })
      }
    }
  }
  // Over the line in any calendar week: a premium is owed, and its price
  // is the route's to work out.
  const over = lineAfter == null ? null : [...weekly.entries()].find(([, h]) => h > lineAfter!)
  if (over) {
    return refuse(
      `${who} worked ${over[1]} hours in the week of ${over[0]}, over the ${lineAfter}-hour line, and the premium on them ` +
        `is priced by the payroll run, not by the seed. ${period.label} is left for a run.`
    )
  }
  return { lines: lines.sort((a, b) => a.day.localeCompare(b.day)), refused: null }
}

/**
 * Processed runs for the pay periods of one W2 line that ended before the
 * world was born — or, with `only`, for the one period holding that
 * month, pressed at that moment. Says every period it would not pay.
 */
export async function payPastPeriods(
  buyContractId: string,
  runBy: { id: string; name: string },
  only?: { month: string; runAt: Date }
): Promise<{ runs: number; refused: string[] }> {
  const out = { runs: 0, refused: [] as string[] }
  const bc = await loadLine(buyContractId)
  const cand = bc?.candidates[0]
  if (!bc || !cand) return out

  const terms: Terms = { ...periodTermsFor('BUY', bc), startedOn: cand.startDate }
  const rates = ratePeriods(
    await db.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: bc.id },
      select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
  )
  // What earlier runs paid, and which periods they paid — one read each,
  // kept current as this writes more.
  const book = await paidBook(bc.companyId, [bc.id])
  const ran = new Set<string>()
  for (const r of await db.automationLog.findMany({
    where: { companyId: bc.companyId, action: PAYROLL_RUN, payload: { path: ['action'], equals: 'process' } },
    select: { payload: true },
  })) {
    for (const c of ((r.payload as { contracts?: { buyContractId?: string; payPeriod?: { start?: string } | null }[] } | null)?.contracts ?? [])) {
      if (c.buyContractId === bc.id && c.payPeriod?.start) ran.add(c.payPeriod.start)
    }
  }

  const due: { period: Period; runAt: Date; asked: string | { start: string; end: string } }[] = []
  if (only) {
    due.push({ period: periodFor(new Date(`${only.month}-01T00:00:00Z`), terms), runAt: only.runAt, asked: only.month })
  } else {
    // Every period from the first day worked that had ended before the
    // world was born. The one holding today is the payroll desk's to run.
    for (let p = periodFor(cand.startDate, terms); p.end < day(0); p = periodFor(plus(p.end, 1), terms)) {
      due.push({ period: p, runAt: runAtFor(p), asked: { start: iso(p.start), end: iso(p.end) } })
    }
  }

  for (const { period, runAt, asked } of due) {
    if (ran.has(iso(period.start))) continue
    const { lines, refused } = priceThePeriod(bc, period, terms, runAt, rates, book.paid)
    if (refused) { out.refused.push(refused); continue }
    if (lines.length === 0) continue

    const byRate = new Map<number, number>()
    for (const l of lines) byRate.set(l.rateCents, (byRate.get(l.rateCents) ?? 0) + l.hours)
    const grossPay = [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0)
    const hours = Math.round(lines.reduce((n, l) => n + l.hours, 0) * 100) / 100

    // The pay dates that fall due for this period, and only those.
    await db.cycle.updateMany({
      where: {
        buyContractId: bc.id, kind: 'SALARY_PAY', completedAt: null,
        dueOn: { gt: period.end, lte: plus(period.end, PAY_LAG_DAYS) },
      },
      data: { completedAt: runAt },
    })
    // What the run was asked to do, read back by `paidBook`: only a
    // processed run paid anybody.
    const action = 'process'
    await db.automationLog.create({
      data: {
        companyId: bc.companyId,
        // Written out whole, as every automation name is (lib/autonomy).
        action: 'PAYROLL_RUN',
        summary: `Payroll process: 1 contracts, ${totals([{ minor: grossPay, currency: bc.payCurrency }])} gross total`,
        reason: `Payroll process initiated by ${runBy.name}`,
        payload: {
          action,
          period: asked,
          contracts: [{
            buyContractId: bc.id,
            person: cand.person.name,
            payPeriod: { start: iso(period.start), end: iso(period.end), label: period.label },
            hours,
            grossPay,
            currency: bc.payCurrency,
            refused: null,
            paid: lines,
            // Priced for overtime and none was owed: every week is at or
            // under the line, which is the only kind of period this pays.
            premiumsPriced: true,
          }],
          runBy: runBy.id,
          runAt: runAt.toISOString(),
        } as never,
        reversible: false,
        at: runAt,
      },
    })
    ran.add(iso(period.start))
    for (const l of lines) {
      const k = paidKey(bc.id, l.personId, l.timesheetId, l.day)
      book.paid.set(k, (book.paid.get(k) ?? 0) + l.hours)
    }
    out.runs++
  }
  return out
}

/**
 * Every pay period before this one, paid, on each W2 line of the workers
 * in `PAID_WORKERS`. Says what it wrote and every period it would not pay.
 */
export async function seedPayrollRuns(ctx: { roster: string[] }): Promise<{ runs: number; refused: string[] }> {
  const out = { runs: 0, refused: [] as string[] }
  const lines = await db.buyContract.findMany({
    where: {
      contractType: 'W2', vendorCompanyId: null,
      company: { slug: { in: ctx.roster } },
      candidates: { some: { person: { primaryEmail: { in: [...PAID_WORKERS] } } } },
    },
    select: { id: true, companyId: true },
    orderBy: { id: 'asc' },
  })
  for (const line of lines) {
    const runBy = await payrollDesk(line.companyId)
    if (!runBy) continue
    const r = await payPastPeriods(line.id, runBy)
    out.runs += r.runs
    out.refused.push(...r.refused)
  }
  return out
}

/** Whoever runs payroll at a firm: the first seat that may, else the first seat there is. */
async function payrollDesk(companyId: string): Promise<{ id: string; name: string } | null> {
  const seats = await db.context.findMany({
    where: { companyId, type: 'EMPLOYEE' },
    select: { person: { select: { id: true, name: true } }, role: { select: { permissions: true } } },
    orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
  })
  const may = seats.find((s) => (s.role?.permissions ?? []).some((p) => p === '*' || p === 'payroll.run'))
  return (may ?? seats[0])?.person ?? null
}
