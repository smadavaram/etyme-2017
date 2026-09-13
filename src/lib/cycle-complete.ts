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
 * A timesheet for the week ending Friday the 12th belongs to the cycle
 * of its kind whose due date is the first one on or after that Friday —
 * the 12th itself, or the 15th once a weekend shift has moved it. The
 * rule is: the earliest cycle of that kind, not yet done, due on or
 * after the day before the period ended. The day's grace is for a
 * period that ends on the due date itself when the shift went backwards.
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

/** The cycle a period's event completes, or null when none is waiting. */
export function pickCycle(cycles: CycleRow[], kind: string, periodEnd: Date): CycleRow | null {
  const floor = periodEnd.getTime() - DAY
  return (
    cycles
      .filter((c) => c.kind === kind && c.completedAt === null && c.dueOn.getTime() >= floor)
      .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())[0] ?? null
  )
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
      where: { ...where, kind: args.kind, completedAt: null },
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
