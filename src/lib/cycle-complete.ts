/**
 * Marking a cycle done when the thing it was waiting for happens.
 *
 * The cycle engine writes what is due on a contract — hours to submit,
 * hours to approve, an invoice to raise, an invoice to collect, pay to
 * calculate, pay day, a vendor bill to raise, a vendor bill to settle —
 * and the placement timeline reads `completedAt` to say which of those
 * are done. Only the pay run ever set it. A week of hours could be
 * submitted, signed by both parties, invoiced and paid, and the timeline
 * went on saying "Hours due · overdue" about it for the life of the
 * contract. "All tables must keep moving their statuses across the
 * app" — this is the table that did not.
 *
 * ── Which cycle ──────────────────────────────────────────────────────
 *
 * A week runs Sunday to Saturday and its hours are due on the Monday
 * after it (CLAUDE.md, "A week runs Sunday to Saturday", decided
 * 2026-09-30). So a timesheet for the week ending Saturday the 12th
 * belongs to the cycle of its kind whose due date is the first one on or
 * after that Saturday — Monday the 14th, or Tuesday the 15th once a
 * Monday holiday has moved it. The rule is: the earliest cycle of that
 * kind, not yet done, due on or after the day before the period ended.
 * The day's grace is for a date that a backward shift moved onto the
 * Friday before the week's Saturday, and for the Friday reminders older
 * packs wrote, which still sit on contracts created before the change.
 *
 * Earlier cycles left undone stay undone. A week nobody ever submitted
 * is still owed, and completing it because a later week arrived would
 * hide exactly the gap the timeline exists to show.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import type { MoneyKind } from '@/lib/cycle-kinds'
import { planCyclesFor } from '@/lib/contract-cycles'
import { loadContractHolidays } from '@/lib/holidays'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { termsFor, ORDER_HEADER_SELECT } from '@/lib/money/order-terms'

export interface CycleRow {
  id: string
  kind: string
  dueOn: Date
  completedAt: Date | null
}

const DAY = 24 * 60 * 60 * 1000

/**
 * The cycle a period's event completes, or null when none is waiting.
 *
 * ── A period from before the first reminder ──────────────────────────
 *
 * A placement awarded or recorded for work already under way writes no
 * reminder dated before that day, so the weeks before it have none. A
 * timesheet for one of those weeks would otherwise claim the earliest
 * reminder of its kind — which belongs to a later week — and the
 * timeline would read that later week as done before it was filed.
 *
 * So the earliest reminder of a kind is not claimed by a period that
 * ended a whole cycle or more before it: where the reminder one rhythm
 * earlier — the one the floor did not write — would itself have been the
 * period's under the rule above, the period is that one's and claims
 * nothing. A week ending Saturday 5 September against a first reminder on
 * Monday 14 September is a week too early: the reminder a rhythm before,
 * Monday 7, would have been its own.
 *
 * The rhythm is the typical gap between two reminders of the kind in a
 * row — the lower median of every gap — not the first gap. A first
 * reminder a holiday moved — pay pulled back from Labor Day, Monday 7
 * September, to Friday 4 — opens a ten-day gap to Monday 14, and read as
 * the rhythm that let the week ending Saturday 29 August claim a pay
 * date belonging to the week after it. Nor the shortest gap: a
 * semimonthly invoice runs 13 to 18 days apart over a year, and taking
 * 13 refused the 15 October invoice date to the week ending 3 October,
 * whose own date it is. The median is what the rhythm usually is, and
 * one shifted date among several cannot move it. With only one reminder
 * there is no rhythm to read and the rule above stands. Pass
 * every row of the kind, done or not: "earliest" means earliest written,
 * not earliest still open.
 *
 * ── Where the line's whole series is known, it is read, not estimated ──
 *
 * The rhythm is an estimate of the date the floor dropped, and a date
 * moved off a weekend breaks it. Awarded on 22 October 2026 for work
 * under way, a semimonthly line's first written invoice date is Monday
 * 2 November — the 31st is a Saturday — and the one before it, the 15th,
 * was never written. The estimate put that unwritten date at 2 November
 * less the usual fifteen days, the 18th; the week ending Saturday 17
 * October would have claimed the 18th, so it claimed nothing, and its
 * own date, 2 November, read overdue after the bill was raised. Its own
 * date was the 2nd all along: the 15th is before the day before its
 * Saturday.
 *
 * So `series` — every date of the kind the line has, generated again
 * with no floor (`ownSeries`) — is the answer where a caller has it. The
 * period's own date is the first in it on or after the day before the
 * period ended, the rule above. The earliest written date is refused
 * only when that own date comes before it in the series: a date the
 * award never wrote. Where the earliest written date is not in the
 * series at all — the company changed its weekend rule since, or the
 * line its dates — the series is not the one that was written and the
 * estimate decides, as before.
 */
export function pickCycle(
  cycles: CycleRow[],
  kind: string,
  periodEnd: Date,
  series?: readonly Date[] | null
): CycleRow | null {
  const floor = periodEnd.getTime() - DAY
  const ofKind = cycles.filter((c) => c.kind === kind).sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  const hit = ofKind.find((c) => c.completedAt === null && c.dueOn.getTime() >= floor) ?? null
  if (!hit) return null
  if (hit === ofKind[0] && series && series.length > 0) {
    const whole = [...series].map((x) => x.getTime()).sort((a, b) => a - b)
    const first = whole.indexOf(hit.dueOn.getTime())
    const own = whole.findIndex((t) => t >= floor)
    // Read only where the series is the one the rows came from.
    if (first >= 0 && own >= 0) return own < first ? null : hit
  }
  if (hit === ofKind[0] && ofKind.length > 1) {
    const gaps: number[] = []
    for (let i = 1; i < ofKind.length; i++) {
      const gap = ofKind[i].dueOn.getTime() - ofKind[i - 1].dueOn.getTime()
      if (gap > 0) gaps.push(gap)
    }
    gaps.sort((a, b) => a - b)
    // The lower median: what the gap usually is, whatever one holiday did.
    const rhythm = gaps.length > 0 ? gaps[Math.floor((gaps.length - 1) / 2)] : Infinity
    // The reminder a whole cycle earlier, had the floor not dropped it.
    // If the rule above would have given the period that one, the period
    // is that one's, and the earliest written is not.
    if (Number.isFinite(rhythm) && hit.dueOn.getTime() - rhythm >= floor) return null
  }
  return hit
}

type Db = PrismaClient | Prisma.TransactionClient

/**
 * A failure the database gave, as opposed to a line with nothing to mark.
 * Prisma's own errors carry a P-code or a PrismaClient name.
 */
function fromTheDatabase(err: unknown): boolean {
  const e = err as { name?: unknown; code?: unknown } | null
  return (typeof e?.name === 'string' && e.name.startsWith('PrismaClient')) ||
    (typeof e?.code === 'string' && /^P\d{4}$/.test(e.code))
}

/**
 * What a database failure means here depends on where it happened.
 *
 * Inside a transaction it is thrown: Postgres has already aborted that
 * transaction, so swallowing it only hid that the bill or the week was
 * about to roll back, and left the reminder silently open (found on the
 * 2,000-person world, 2026-10-22). Outside one, the act it follows has
 * already stood, so the failure is reported to staff and the reminder
 * stays open: never silent, never a refusal of something that was done.
 */
async function onDatabaseFailure(db: Db, err: unknown): Promise<null> {
  if (db !== prisma) throw err
  await reportError('A due date could not be marked done', err).catch(() => {})
  return null
}

interface CompleteArgs {
  sellContractId?: string | null
  buyContractId?: string | null
  kind: MoneyKind
  periodEnd: Date
  at?: Date
}

/** Which cycle one event closes, read and not written. Null where there is nothing to mark. */
async function cycleToComplete(db: Db, args: CompleteArgs): Promise<string | null> {
  const where = args.sellContractId
    ? { sellContractId: args.sellContractId }
    : args.buyContractId
      ? { buyContractId: args.buyContractId }
      : null
  if (!where) return null
  const rows = await db.cycle.findMany({
    // Every row of the kind, done or not: the guard in `pickCycle`
    // needs the earliest one ever written, not the earliest still open.
    where: { ...where, kind: args.kind },
    select: { id: true, kind: true, dueOn: true, completedAt: true },
  })
  // The line's whole series is read only where it can change the answer:
  // the period would claim the earliest date ever written, which is the
  // one an award's floor may have stood in front of.
  const floor = args.periodEnd.getTime() - DAY
  const first = rows.reduce<CycleRow | null>((a, c) => (!a || c.dueOn < a.dueOn ? c : a), null)
  const series =
    first && first.completedAt === null && first.dueOn.getTime() >= floor
      ? await ownSeries(db, { sellContractId: args.sellContractId, buyContractId: args.buyContractId, kind: args.kind })
      : null
  return pickCycle(rows, args.kind, args.periodEnd, series)?.id ?? null
}

/**
 * Mark the matching cycle done. Returns its id, or null when there was
 * nothing to mark — a contract raised before cycles were generated, or a
 * period already accounted for. A database failure is thrown inside a
 * transaction and reported outside one (`onDatabaseFailure`).
 */
export async function completeCycle(db: Db, args: CompleteArgs): Promise<string | null> {
  try {
    const id = await cycleToComplete(db, args)
    if (!id) return null
    await db.cycle.update({ where: { id }, data: { completedAt: args.at ?? new Date() } })
    return id
  } catch (err) {
    if (fromTheDatabase(err)) return onDatabaseFailure(db, err)
    return null
  }
}

/**
 * Several events at once — a bill closing the reminders of every line on
 * it. Every cycle is found first, then marked in id order: two bills that
 * close overlapping cycles take the rows in the same order, so neither
 * waits on a row the other holds while holding one it wants.
 */
export async function completeCycles(db: Db, list: CompleteArgs[]): Promise<string[]> {
  try {
    const found: { id: string; at: Date }[] = []
    for (const args of list) {
      const id = await cycleToComplete(db, args)
      if (id && !found.some((f) => f.id === id)) found.push({ id, at: args.at ?? new Date() })
    }
    found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const f of found) await db.cycle.update({ where: { id: f.id }, data: { completedAt: f.at } })
    return found.map((f) => f.id)
  } catch (err) {
    if (fromTheDatabase(err)) {
      await onDatabaseFailure(db, err)
      return []
    }
    return []
  }
}

export async function ownSeries(
  db: Db,
  args: { sellContractId?: string | null; buyContractId?: string | null; kind: string }
): Promise<Date[] | null> {
  try {
    const sellId =
      args.sellContractId ??
      (args.buyContractId
        ? (await db.contractLink.findFirst({
            where: { buyContractId: args.buyContractId },
            orderBy: { effectiveFrom: 'asc' },
            select: { sellContractId: true },
          }))?.sellContractId ?? null
        : null)
    if (!sellId) return null
    const sell = await db.sellContract.findUnique({
      where: { id: sellId },
      select: {
        id: true, startDate: true, endDate: true, companyId: true, clientCompanyId: true,
        company: { select: { templatePack: true } },
        workOrder: { select: ORDER_HEADER_SELECT },
      },
    })
    if (!sell) return null
    // The line's dates, through the one door: a line is a person, and its
    // own start and end are what the award generated over.
    const dates = termsFor('SELL', sell)
    if (!dates.startDate || !dates.endDate) return null
    const buy = args.buyContractId
      ? await db.buyContract.findUnique({
          where: { id: args.buyContractId },
          select: { id: true, contractType: true, vendorCompanyId: true },
        })
      : null
    if (args.buyContractId && !buy) return null
    const site = await db.companyLocation.findFirst({
      where: { companyId: sell.clientCompanyId },
      orderBy: [{ isPrimary: 'desc' }],
      select: { country: true },
    })
    const holidays = await loadContractHolidays(
      sell.companyId,
      sell.clientCompanyId,
      dates.startDate.getFullYear(),
      dates.endDate.getFullYear(),
      site?.country ?? null,
      // The caller's own client: inside a transaction, the transaction.
      db
    )
    const planned = await planCyclesFor(db, {
      sell: { id: sell.id, startDate: sell.startDate, endDate: sell.endDate, workOrder: sell.workOrder },
      buy: buy ? { id: buy.id, contractType: String(buy.contractType), vendorCompanyId: buy.vendorCompanyId } : null,
      packId: sell.company.templatePack ?? 'US_IT',
      holidays,
    })
    const onLine = (r: (typeof planned.rows)[number]) =>
      args.buyContractId ? 'buyContractId' in r && r.buyContractId === args.buyContractId : 'sellContractId' in r
    const due = planned.rows.filter((r) => r.kind === args.kind && onLine(r)).map((r) => r.dueOn)
    return due.length > 0 ? due : null
  } catch (err) {
    // A line whose dates cannot be generated has no series; a database
    // failure is not that, and is the caller's to hear.
    if (fromTheDatabase(err)) throw err
    return null
  }
}
