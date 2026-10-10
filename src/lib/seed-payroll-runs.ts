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
 * So each payroll line in the world gets a processed
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
 * pays a month only where nothing is left to decide: one acceptance
 * standing on each week, from the firm that pays; the hours accepted as
 * filed; no leave; and every day inside the line's window. There, a run
 * pays each day's hours at the rate in force that day, and the premium
 * on any hours over the line is priced by `sheetPay` — the call money's
 * own pricing reads — on the whole week, so the regular rate is the
 * week's and the method is the one the employer chose. Rosa Delgado's
 * forty-five-hour week in August is paid that way (since 2026-09-30).
 * A week whose premium nobody can price is refused, never approximated.
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

import { paidByPayroll } from '@/lib/money/paid-through'
import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { priceByDay, ratePeriods } from '@/lib/contract-rate'
import { periodFor, hoursInPeriod, type Period, type Terms } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey, PAYROLL_RUN, type PaidLine } from '@/lib/payroll-paid'
import { payLineOn } from '@/lib/money/pay-line'
import { EXEMPT_SELECT, sheetPay, wageLineFor } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'
import { totals } from '@/lib/money-display'
import { DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)

/**
 * How far past a period's end its pay day may fall: the demo's monthly
 * pay day is month-end + 9 (`DEMO_MONTHLY_PAY`) before any shift. A pay
 * kind moves back off a weekend or holiday under the default policy
 * (`lib/cycle-shift`, PAY before), so it lands on or before that bound;
 * the hours and bill kinds move forward, and a company that sets its pay
 * direction to after could push a pay day past this bound, which every
 * seeded company leaves at the default. The next month's pay day is always
 * past this, so a run completes its own period's pay day only.
 */
const PAY_LAG_DAYS = Math.max(...DEMO_MONTHLY_PAY.filter((d) => d.kind === 'SALARY_PAY').map((d) => d.offsetDays ?? 0))

/**
 * The workers whose pay the demo shows from their own page, by the
 * address their door signs in at, and Aptiva's own analyst. Read by the
 * tests that walk those pages; the seed pays every payroll line in the
 * world, theirs among them.
 */
export const PAID_WORKERS = [
  'rosa.delgado@seed.etyme.invalid',
  'karthik.menon@seed.etyme.invalid',
  'helena.marsh@seed.etyme.invalid',
  'chidi.okafor@seed.etyme.invalid',
  'ruben.ortega@seed.etyme.invalid',
] as const

/**
 * When the run for a period was pressed: five days after it ends, so it
 * is processed before the demo's pay day (month-end + 9, moved back off a
 * weekend) and a paid date reads before the day it was due, never after.
 *
 * But never before the hours it pays were accepted. A week that crosses
 * the month's end is signed after the Friday it ends on, which can be
 * later than five days past the month; a run pressed before that
 * signature would leave those days to no run at all, because the next
 * period's run pays only its own days. So the run waits an hour past the
 * last acceptance on the period's weeks.
 *
 * And never after the world was born — but never by pulling the run
 * earlier either. It used to be clamped to the evening before the
 * birthday, so a world born on Oct 1 recorded September's run as pressed
 * on Sep 30, before the month had ended, and the worker's page said
 * "paid on Oct 9" in the past tense on Oct 1. Where the day the run falls
 * on is after the world was born, the run has not happened yet: this
 * returns null, no run is written, and the month reads as owed.
 */
export function runAtFor(period: Period, acceptedAt: readonly Date[] = []): Date | null {
  const usual = atHour(plus(period.end, 5), 17)
  const last = acceptedAt.reduce<number>((m, d) => Math.max(m, +d), 0)
  const afterLast = new Date(last + 3_600_000)
  const at = afterLast > usual ? afterLast : usual
  const latest = atHour(day(-1), 17)
  return at <= latest ? at : null
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
      // The pay days still open, so a period with nothing to pay is
      // closed only where a pay day is actually waiting on it.
      buyCycles: { where: { kind: 'SALARY_PAY', completedAt: null }, select: { dueOn: true } },
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

      const priced = priceByDay({
        contractRateCents: cand.payRate, periods: rates, days, hours: null,
        within: share.partial ? period : null, periodStart: t.periodStart, periodEnd: t.periodEnd,
      })
      for (const x of priced.days) {
        const before = paid.get(paidKey(bc.id, cand.personId, t.id, x.day)) ?? 0
        const left = Math.round((x.hours - before) * 100) / 100
        if (left > 0) lines.push({ personId: cand.personId, timesheetId: t.id, day: x.day, hours: left, rateCents: x.rateCents })
      }

      // The premium over the line, priced by the same call the payroll
      // run's own pricing reads (lib/money/sheet-overtime), on the whole
      // week so the regular rate is the week's, and kept to this
      // period's days. A week nobody can price is still refused.
      const pay = sheetPay({
        days, leaveDays: {}, afterHours: line.afterHours, accepted: null,
        contractRateCents: cand.payRate, periods: rates, method: methodFor(bc).method,
        line: wageLineFor(bc, who, exempt),
      })
      if (pay.weeks.some((w) => !w.terms.priced)) {
        return refuse(`${who}'s ${week} went over the line and nobody can say what its premium is owed.`)
      }
      const inPeriod = new Set(priced.days.map((x) => x.day))
      for (const [dday, p] of pay.premiums) {
        if (!inPeriod.has(dday)) continue
        const l = lines.find((x) => x.timesheetId === t.id && x.day === dday)
        if (l) { l.overtimeHours = p.hours; l.premiumCents = p.premiumCents }
        else lines.push({ personId: cand.personId, timesheetId: t.id, day: dday, hours: 0, rateCents: p.rateCents, overtimeHours: p.hours, premiumCents: p.premiumCents })
      }
    }
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
    const mine = bc.sellLinks.flatMap((l) => l.sellContract.timesheets).filter((t) => t.personId === cand.personId)
    for (let p = periodFor(cand.startDate, terms); p.end < day(0); p = periodFor(plus(p.end, 1), terms)) {
      const inIt = mine.filter((t) => t.periodStart <= p.end && t.periodEnd >= p.start)
      const accepted = inIt.flatMap((t) => t.assertions.filter((a) => a.companyId === bc.companyId).map((a) => a.at))
      const runAt = runAtFor(p, accepted)
      // Not pressed yet on the day the world was born: the period is owed.
      if (!runAt) continue
      due.push({ period: p, runAt, asked: { start: iso(p.start), end: iso(p.end) } })
    }
  }

  for (const { period, runAt, asked } of due) {
    if (ran.has(iso(period.start))) continue
    const { lines, refused } = priceThePeriod(bc, period, terms, runAt, rates, book.paid)
    if (refused) { out.refused.push(refused); continue }
    // Nothing accepted in the period: a real employer still runs payroll
    // and pays nothing, which is what closes the pay day. Written only
    // where a pay day is waiting on the period, so no run is invented for
    // a month the line never paid in.
    const waiting = bc.buyCycles.some((c) => c.dueOn > period.end && c.dueOn <= plus(period.end, PAY_LAG_DAYS))
    if (lines.length === 0 && !waiting) continue

    const byRate = new Map<number, number>()
    for (const l of lines) byRate.set(l.rateCents, (byRate.get(l.rateCents) ?? 0) + l.hours)
    // Straight time rounded once per rate, and the premium once for the
    // row, as the payroll run rounds them.
    const premiumCents = Math.round(lines.reduce((n, l) => n + (l.premiumCents ?? 0), 0))
    const grossPay = [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0) + premiumCents
    const hours = Math.round(lines.reduce((n, l) => n + l.hours, 0) * 100) / 100

    // The pay dates that fall due for this period, and only those.
    if (waiting) {
      await db.cycle.updateMany({
        where: {
          buyContractId: bc.id, kind: 'SALARY_PAY', completedAt: null,
          dueOn: { gt: period.end, lte: plus(period.end, PAY_LAG_DAYS) },
        },
        data: { completedAt: runAt },
      })
    }
    // What the run was asked to do, read back by `paidBook`: only a
    // processed run paid anybody.
    const action = 'process'
    await db.automationLog.create({
      data: {
        companyId: bc.companyId,
        // Written out whole, as every automation name is (lib/autonomy).
        action: 'PAYROLL_RUN',
        summary: lines.length === 0
          ? `Payroll process: 1 contracts, nothing accepted in ${period.label}, nothing paid`
          : `Payroll process: 1 contracts, ${totals([{ minor: grossPay, currency: bc.payCurrency }])} gross total`,
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
            // Priced for overtime through sheetPay: the premium, where one
            // was owed, is on the day it was worked.
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
 * Every pay period before this one, paid, on every payroll line an
 * employer in the world holds — not only the workers whose pages the demo
 * opens, because an employer's payroll screen reads every line it pays,
 * and a line nobody ran read as overdue on the day the world was born.
 * Says what it wrote and every period it would not pay.
 */
export async function seedPayrollRuns(
  ctx: { roster: string[] },
  share: { index: number; of: number } = { index: 0, of: 1 }
): Promise<{ runs: number; refused: string[] }> {
  const out = { runs: 0, refused: [] as string[] }
  // Which lines payroll pays is money's one rule (`paidByPayroll`): an
  // employment type with nobody between the firm and the worker. The seed
  // asks it rather than keeping its own copy of it.
  const candidates = await db.buyContract.findMany({
    where: {
      company: { slug: { in: ctx.roster } },
    },
    select: { id: true, companyId: true, contractType: true, vendorCompanyId: true, supplierSellContractId: true },
    orderBy: { id: 'asc' },
  })
  // One share of the lines, dealt round by position so every share holds
  // a mix of long and short histories: every line in the world is more
  // reading than one function call can do against a distant database.
  const lines = candidates.filter(paidByPayroll).filter((_, i) => i % share.of === share.index)
  const desks = new Map<string, { id: string; name: string } | null>()
  for (const line of lines) {
    if (!desks.has(line.companyId)) desks.set(line.companyId, await payrollDesk(line.companyId))
    const runBy = desks.get(line.companyId)
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
