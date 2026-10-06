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
 */
export function pickCycle(cycles: CycleRow[], kind: string, periodEnd: Date): CycleRow | null {
  const floor = periodEnd.getTime() - DAY
  const ofKind = cycles.filter((c) => c.kind === kind).sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  const hit = ofKind.find((c) => c.completedAt === null && c.dueOn.getTime() >= floor) ?? null
  if (!hit) return null
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
 * Mark the matching cycle done. Returns its id, or null when there was
 * nothing to mark — a contract raised before cycles were generated, or a
 * period already accounted for. Never throws: a timeline that is behind
 * is a lesser fault than a submission that fails because of it.
 */
export async function completeCycle(
  db: Db,
  args: {
    sellContractId?: string | null
    buyContractId?: string | null
    kind: MoneyKind
    periodEnd: Date
    at?: Date
  }
): Promise<string | null> {
  const where = args.sellContractId
    ? { sellContractId: args.sellContractId }
    : args.buyContractId
      ? { buyContractId: args.buyContractId }
      : null
  if (!where) return null
  try {
    const rows = await db.cycle.findMany({
      // Every row of the kind, done or not: the guard in `pickCycle`
      // needs the earliest one ever written, not the earliest still open.
      where: { ...where, kind: args.kind },
      select: { id: true, kind: true, dueOn: true, completedAt: true },
    })
    const hit = pickCycle(rows, args.kind, args.periodEnd)
    if (!hit) return null
    await db.cycle.update({ where: { id: hit.id }, data: { completedAt: args.at ?? new Date() } })
    return hit.id
  } catch {
    return null
  }
}
