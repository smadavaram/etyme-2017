/**
 * A placement ended early: its real last day on site, and what that day
 * does to the dates and the weeks behind the line.
 *
 * ── Why (founder, 2026-11-16, "go ahead with your recommendations") ──
 *
 * Ending a placement early set the line ENDED and kept its planned end
 * date, months away. Every reader of a line's end read the plan as the
 * fact: Bench and Today read her free only from the day after the planned
 * end, the tenure ledger counted days on site she never worked, and the
 * break in service began months late. CLAUDE.md, "Money": a contract's
 * last day is a day on site, a break starts the day after it, and tenure
 * is a day counted once.
 *
 * So an early end writes the real last day as the line's end date. The
 * planned end is kept in the activity log (`from` → `to`), so nothing is
 * lost. A line that ends on its planned day is unchanged.
 *
 * ── Which day ────────────────────────────────────────────────────────
 *
 * The act takes no date today (the Complete button on the contracts
 * drawer). So the last day is the day it is pressed, read in the site's
 * own time zone, else the worker's, else UTC. A day in the future can
 * therefore never be given, and nothing here is "planned to end": that
 * is still the end date, unchanged, and the nightly job ends it then.
 * Held to the line: never after the planned end, never before the start.
 *
 * ── What it may not rewrite ──────────────────────────────────────────
 *
 * A week with hours on a day after the new last day is a fact somebody
 * filed, and may already be billed or paid. That is never rewritten: the
 * early end is refused in one sentence naming the week and the day.
 *
 * Pure: no database, no clock. `now` is passed in.
 */

import { formatDay } from '@/lib/format-date'
import { dayFor } from '@/lib/when'

/** "2026-11-16" for a stored day (midnight UTC). */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function utcDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

/**
 * The calendar day `now` falls on in `zone`, as a stored day (midnight
 * UTC). An unknown or missing zone reads as UTC, the way the nightly job
 * and Bench read a day.
 */
export function calendarDayIn(now: Date, zone: string | null | undefined): Date {
  // The one reader of a day in somebody's zone (`dayFor`, lib/when): an
  // unknown zone falls back to UTC there.
  const key = dayFor(now, zone)
  return utcDay(/^\d{4}-\d{2}-\d{2}$/.test(key) ? key : dayKey(now))
}

export interface LastDay {
  /** The day written as the line's end date. */
  lastDay: Date
  /** True where it differs from the planned end, or there was none. */
  early: boolean
  /** The end date the line carried before, kept in the log. */
  plannedEnd: Date | null
}

/**
 * The real last day on site of a line ended today.
 *
 * Today, held to the line: a planned end already passed is kept (the
 * nightly job had not run yet, and it is the day the line ran to); a
 * line not started yet reads its first day, so no line ends before it
 * began. A line with no planned end ends today, early by definition.
 */
export function lastDayOnSite(input: { startDate: Date; plannedEnd: Date | null; today: Date }): LastDay {
  const today = dayKey(input.today)
  const start = dayKey(input.startDate)
  const planned = input.plannedEnd ? dayKey(input.plannedEnd) : null
  let last = planned !== null && planned < today ? planned : today
  if (last < start) last = start
  return { lastDay: utcDay(last), early: planned === null || last !== planned, plannedEnd: input.plannedEnd }
}

/** A cycle already written, as the early end reads it. */
export interface StoredCycleRow {
  id: string
  completedAt: Date | null
  periodStart: Date | null
  periodEnd: Date | null
}

export interface CyclesAtLastDay {
  /** Open cycles whose period begins after the last day: no such period is left. */
  remove: string[]
  /** Open cycles whose period holds the last day: cut to end on it, their due date kept. */
  cut: { id: string; periodEnd: Date }[]
  /** Cycles written before periods were recorded: left as written, because their period cannot be read. */
  unplaced: number
}

/**
 * What the early end does to the dates already written.
 *
 * The rule the generator keeps for a normal end (2026-11-09): the last
 * regular period runs through the contract's end date, on the series'
 * usual date. So the period holding the new last day is cut at it and
 * keeps its due day, and every later period goes. That is exactly the set
 * the generator writes for a line planned to end on that day; the unit
 * test proves it on the shipped pack.
 *
 * A cycle already completed is history — a pay day that ran, a bill that
 * was raised — and is never touched. Money on a day after the last day is
 * refused before this runs (`moneyPastLastDay`).
 */
export function cyclesAtLastDay(stored: readonly StoredCycleRow[], lastDay: Date): CyclesAtLastDay {
  const last = dayKey(lastDay)
  const remove: string[] = []
  const cut: { id: string; periodEnd: Date }[] = []
  let unplaced = 0
  for (const c of stored) {
    if (c.completedAt) continue
    if (!c.periodStart || !c.periodEnd) {
      unplaced++
      continue
    }
    if (dayKey(c.periodStart) > last) remove.push(c.id)
    else if (dayKey(c.periodEnd) > last) cut.push({ id: c.id, periodEnd: utcDay(last) })
  }
  return { remove, cut, unplaced }
}

/** One week of hours, with what has been done with it. */
export interface WeekAfter {
  id: string
  periodStart: Date
  /** ISO day → hours, as filed. */
  days: Record<string, unknown>
  /** On a bill the payer has been sent. */
  billed: boolean
  /** Paid: by a pay run processed over the day, or on an invoice receipt paid. Per day. */
  paidOn: (day: string) => boolean
}

export type Stage = 'PAID' | 'BILLED' | 'FILED'

export interface PastLastDay {
  weekId: string
  weekOf: Date
  day: string
  stage: Stage
  says: string
}

const RANK: Record<Stage, number> = { PAID: 3, BILLED: 2, FILED: 1 }

/**
 * The week that stops an early end, or null where none does.
 *
 * Any hours on a day after the last day refuse it: paid first, then
 * billed, then filed, and of those the latest day, because ending on or
 * after that day is the one way past it the act offers. A rejected week
 * is no claim and is passed over by the caller.
 */
export function moneyPastLastDay(weeks: readonly WeekAfter[], lastDay: Date, personName: string): PastLastDay | null {
  const last = dayKey(lastDay)
  let found: { w: WeekAfter; day: string; stage: Stage } | null = null
  for (const w of weeks) {
    for (const [day, raw] of Object.entries(w.days ?? {})) {
      const key = day.slice(0, 10)
      if (key <= last || !(Number(raw) > 0)) continue
      const stage: Stage = w.paidOn(key) ? 'PAID' : w.billed ? 'BILLED' : 'FILED'
      if (!found || RANK[stage] > RANK[found.stage] || (RANK[stage] === RANK[found.stage] && key > found.day)) {
        found = { w, day: key, stage }
      }
    }
  }
  if (!found) return null
  return {
    weekId: found.w.id,
    weekOf: found.w.periodStart,
    day: found.day,
    stage: found.stage,
    says: pastLastDaySays(found.stage, found.w.periodStart, found.day, personName),
  }
}

/** The refusal, in one sentence a payroll clerk would say. */
export function pastLastDaySays(stage: Stage, weekOf: Date, day: string, personName: string): string {
  const week = formatDay(weekOf)
  const on = formatDay(day)
  switch (stage) {
    case 'PAID':
      return `The week of ${week} is already paid, with hours on ${on}. End ${personName}'s placement on or after that day.`
    case 'BILLED':
      return `The week of ${week} is already billed, with hours on ${on}. End ${personName}'s placement on or after that day.`
    case 'FILED':
      return `The week of ${week} has hours filed on ${on}. Have that week corrected, or end ${personName}'s placement on or after that day.`
  }
}

/** "Last day on site: Nov 16, 2026." — what the person who ended it reads. */
export function lastDaySays(lastDay: Date): string {
  return `Last day on site: ${formatDay(lastDay)}.`
}

/** Whether a stored period covers a day, both ends counted. */
export function periodCovers(p: { periodStart: Date | null; periodEnd: Date | null }, day: string): boolean {
  if (!p.periodStart || !p.periodEnd) return false
  return dayKey(p.periodStart) <= day && day <= dayKey(p.periodEnd)
}

