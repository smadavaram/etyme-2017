/**
 * Which pay period a pay-day cycle pays, read off the cycles themselves.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * A `Cycle` row carries a date and a kind, and no period bounds (CLAUDE.md,
 * "The cycle engine, honestly", item 7). The payroll run has to decide
 * which pay days a run for a period has settled, and it used to do that
 * with a fixed allowance: every open pay day from the period's first day
 * to four days after its last. That held while every line was paid on the
 * pack's Fridays. It broke on the first line that paid later than four
 * days — the demo's monthly pay, nine days after the month ends — in two
 * directions at once: the run for July missed July's pay day, 7 August,
 * and marked June's, 7 July, done because it fell inside July.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * Pay follows the hours it pays (the founder's rule for the monthly
 * packs). So the days a pay day covers are the days since the pay day
 * before it, and it belongs to the pay period that holds most of those
 * days. A tie goes to the period the pay day itself falls in.
 *
 *   monthly, paid 9 days after:  7 Aug, the one before 9 Jul — 10 Jul to
 *                                7 Aug is 22 days of July and 7 of August,
 *                                so 7 Aug pays July.
 *   fortnightly Fridays:         10 Jul, the one before 26 Jun — 4 days of
 *                                June, 10 of July, so it pays July, which
 *                                is what the four-day window said too.
 *
 * The first pay day of a line has no pay day before it, and covers the
 * days since the line started (`startedOn`). Where the start is not
 * known, its span is taken as the same length as the gap to the next pay
 * day, the line's own rhythm; and a line with one pay day and no start
 * pays the period it falls in, said here because it is a guess.
 *
 * Nothing here is a number of days. Pure: no database.
 */

import type { Period } from '@/lib/periods'

const DAY = 86_400_000
const key = (p: Period) => p.start.toISOString().slice(0, 10)
const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export interface PayDayCycle {
  id: string
  dueOn: Date
  /** Null where it is still open. A completed one is never marked again, and still dates the one after it. */
  completedAt: Date | null
}

/**
 * The period a pay day pays, given every pay day of its kind on the line.
 *
 * `periodOf` is the line's own pay-period arithmetic (`periodFor` with the
 * line's terms), so a calendar month, a half-month and an anniversary
 * month all read the same way.
 */
export function periodPaidBy(
  cycle: PayDayCycle,
  all: readonly PayDayCycle[],
  periodOf: (d: Date) => Period,
  startedOn?: Date | null
): Period {
  const sorted = [...all].sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  const i = sorted.findIndex((c) => c.id === cycle.id)
  const due = dayOf(cycle.dueOn)
  const prev = i > 0 ? dayOf(sorted[i - 1].dueOn) : null
  const next = i >= 0 && i < sorted.length - 1 ? dayOf(sorted[i + 1].dueOn) : null

  let from: Date
  if (prev) from = new Date(prev.getTime() + DAY)
  else if (startedOn && dayOf(startedOn) <= due) from = dayOf(startedOn)
  else if (next) from = new Date(due.getTime() - (next.getTime() - due.getTime()) + DAY)
  else return periodOf(due)

  const days = new Map<string, { period: Period; n: number }>()
  for (let t = from.getTime(); t <= due.getTime(); t += DAY) {
    const p = periodOf(new Date(t))
    const k = key(p)
    const e = days.get(k)
    if (e) e.n++
    else days.set(k, { period: p, n: 1 })
  }
  const own = key(periodOf(due))
  let best: { period: Period; n: number } | null = null
  for (const [k, e] of days) {
    if (!best || e.n > best.n || (e.n === best.n && k === own)) best = e
  }
  return best!.period
}

/**
 * The open pay days a run over these periods settles: each one whose
 * period (`periodPaidBy`) is one of the run's.
 */
export function payDaysToMark(
  cycles: readonly PayDayCycle[],
  windows: readonly Period[],
  periodOf: (d: Date) => Period,
  startedOn?: Date | null
): PayDayCycle[] {
  const asked = new Set(windows.map(key))
  return cycles
    .filter((c) => c.completedAt == null)
    .filter((c) => asked.has(key(periodPaidBy(c, cycles, periodOf, startedOn))))
    .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
}
