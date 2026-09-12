/**
 * Cycle generation engine.
 *
 * CLAUDE.md: "Port the arithmetic, not the architecture, and write the
 * tests first."
 *
 * ── What this does ───────────────────────────────────────────────────
 *
 * Given a contract's dates and the cycle definitions its template pack
 * carries, produce every due date for every kind — hours due each Friday,
 * invoice raised on the first, pay day on the 28th — shifted off weekends
 * and off both companies' holidays to the next working day, and skipping
 * any date that already exists so an extension adds weeks rather than
 * duplicating them.
 *
 * ── What changed, and why ────────────────────────────────────────────
 *
 * The packs have always said which day a cycle lands on — `dayOfWeek: 1`
 * for a Monday approval, `dayOfMonth: 15` for a mid-month vendor bill —
 * and this engine ignored every one of them. It hard-coded Friday for
 * anything weekly, the 15th and month-end for anything semimonthly, and
 * month-end for anything monthly. A pack asking for Monday got Friday.
 * The callers helped by dropping the day fields before they got here.
 *
 * The day is honoured now. The defaults are unchanged — Friday, the 15th,
 * month-end — and they are defaults rather than the only answer. There is
 * still no per-client configuration screen and that is deliberate: the
 * pack is the default, and a knob per client is how the 2017 engine grew
 * to four thousand commits. When a real client needs a different day it
 * gets a different pack, not a setting.
 *
 * Weekend shift stays forward-only. The 2017 engine could shift backward
 * per frequency; nobody has asked, and a payment that moves earlier is a
 * surprise in a way that one moving later is not.
 *
 * ── The February rule ────────────────────────────────────────────────
 *
 * A day of month that does not exist in this month is the last day that
 * does. The 30th in February is the 28th, or the 29th. Anything at or
 * past the 28th means "the end of the month" — which is what a pack
 * author writing 28 meant, and what a 31 would have meant in a 30-day
 * month anyway.
 */

import { isMoneyKind } from '@/lib/cycle-kinds'

export type CycleFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'ON_COMPLETION'

export interface CycleDefinition {
  kind: string
  frequency: CycleFrequency
  /** 0 = Sunday … 6 = Saturday. Weekly and biweekly. Default Friday. */
  dayOfWeek?: number
  /**
   * 1–31. Monthly: the day. Semimonthly: the first cut, with month-end as
   * the second. At or past 28 means month-end. Default 15 (semimonthly),
   * month-end (monthly).
   */
  dayOfMonth?: number
  /** Days after the period boundary the cycle is due. Default 0. */
  offsetDays?: number
}

export interface GeneratedCycle {
  kind: string
  dueOn: Date
}

const WEEKEND_DAYS = [0, 6] // Sunday, Saturday

/** The Friday that is the default period end. */
const DEFAULT_DAY_OF_WEEK = 5
/** The mid-month cut that is the default first semimonthly boundary. */
const DEFAULT_SEMIMONTHLY_CUT = 15
/** At or past this, a day of month means "the end of the month". */
const MEANS_MONTH_END = 28

/** Forward to the next working day. Iterates, because Monday can be a holiday too. */
function shiftToBusinessDay(date: Date, holidays: Set<string>): Date {
  const d = new Date(date)
  const key = () => d.toISOString().slice(0, 10)
  while (WEEKEND_DAYS.includes(d.getDay()) || holidays.has(key())) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * The requested day, or the last day the month has. `undefined` and
 * anything at or past 28 both mean month-end.
 */
function dayInMonth(year: number, month: number, requested: number | undefined): Date {
  const last = daysInMonth(year, month)
  const day =
    requested === undefined || requested >= MEANS_MONTH_END ? last : Math.min(Math.max(requested, 1), last)
  return new Date(year, month, day)
}

/** First date on or after `from` that falls on `dayOfWeek`. */
function nextOnDay(from: Date, dayOfWeek: number): Date {
  const d = new Date(from)
  while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() + 1)
  return d
}

/** Period end dates for one definition between start and end, inclusive. */
function generatePeriodEnds(start: Date, end: Date, def: CycleDefinition): Date[] {
  const periods: Date[] = []

  switch (def.frequency) {
    case 'WEEKLY':
    case 'BIWEEKLY': {
      const step = def.frequency === 'WEEKLY' ? 7 : 14
      const cursor = nextOnDay(start, def.dayOfWeek ?? DEFAULT_DAY_OF_WEEK)
      while (cursor <= end) {
        periods.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + step)
      }
      break
    }

    case 'SEMIMONTHLY': {
      // Two cuts a month: the pack's day, then month-end. A pack that
      // says 1 gets the 1st and the last; one that says nothing gets
      // the 15th and the last. If the first cut IS month-end there is
      // only one, and it is not emitted twice.
      let year = start.getFullYear()
      let month = start.getMonth()
      const firstCut = def.dayOfMonth ?? DEFAULT_SEMIMONTHLY_CUT
      while (new Date(year, month, 1) <= end) {
        const first = dayInMonth(year, month, firstCut)
        const last = dayInMonth(year, month, undefined)
        if (first >= start && first <= end) periods.push(first)
        if (last.getTime() !== first.getTime() && last >= start && last <= end) periods.push(last)
        month++
        if (month > 11) { month = 0; year++ }
      }
      break
    }

    case 'MONTHLY': {
      let year = start.getFullYear()
      let month = start.getMonth()
      while (new Date(year, month, 1) <= end) {
        const on = dayInMonth(year, month, def.dayOfMonth)
        if (on >= start && on <= end) periods.push(on)
        month++
        if (month > 11) { month = 0; year++ }
      }
      break
    }

    case 'ON_COMPLETION': {
      periods.push(new Date(end))
      break
    }
  }

  return periods
}

/**
 * Every cycle for a contract, in date order.
 *
 * @param start          Contract start
 * @param end            Contract end
 * @param definitions    The kinds this contract needs — see cyclesFor()
 * @param holidays       YYYY-MM-DD, both companies' calendars unioned
 * @param existingDates  kind → set of YYYY-MM-DD already written, for extension
 *
 * A definition whose kind is not a money kind is skipped rather than
 * generated. The packs no longer carry any, but an old pack in a
 * database might, and a compliance reminder written as a billing cycle
 * would shift itself off a weekend for no reason and then sit unread.
 */
export function generateCycles(
  start: Date,
  end: Date,
  definitions: readonly CycleDefinition[],
  holidays: Iterable<string> = [],
  existingDates: Map<string, Set<string>> = new Map()
): GeneratedCycle[] {
  const cycles: GeneratedCycle[] = []
  const holidaySet = new Set(holidays)

  for (const def of definitions) {
    if (!isMoneyKind(def.kind)) continue
    const existing = existingDates.get(def.kind) ?? new Set<string>()

    for (const periodEnd of generatePeriodEnds(start, end, def)) {
      const due = new Date(periodEnd)
      due.setDate(due.getDate() + (def.offsetDays ?? 0))
      const shifted = shiftToBusinessDay(due, holidaySet)
      if (existing.has(shifted.toISOString().slice(0, 10))) continue
      cycles.push({ kind: def.kind, dueOn: shifted })
    }
  }

  cycles.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  return cycles
}
