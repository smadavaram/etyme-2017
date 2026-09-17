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
 * The day is honored now. The defaults are unchanged — Friday, the 15th,
 * month-end — and they are defaults rather than the only answer. There is
 * still no per-client configuration screen and that is deliberate: the
 * pack is the default, and a knob per client is how the 2017 engine grew
 * to four thousand commits. When a real client needs a different day it
 * gets a different pack, not a setting.
 *
 * ── Which way a date moves off a weekend ─────────────────────────────
 *
 * Pay moves back; everything else moves forward. Decided 2026-09-16.
 *
 * This was forward-only, on the reasoning that "a payment that moves
 * earlier is a surprise in a way that one moving later is not". That is
 * true of a bill and false of a pay day. US payroll pays a Saturday pay
 * day on the Friday before, universally, because moving it to the Monday
 * pays somebody after the period it covers — a contractor is short over a
 * weekend for a date the calendar chose. Nobody is upset to be paid on
 * Friday.
 *
 * So the direction is per category rather than global: PAY backward,
 * HOURS and BILL forward. An invoice due on a Saturday is still due on
 * the Monday — pulling a client's payment terms shorter is the surprise
 * the original note described, and it is real on that side.
 *
 * ── And whose answer that is ─────────────────────────────────────────
 *
 * Those three remain the defaults and are no longer the only answer.
 * 2026-09-17, from the founder: "If Sat or Sun — company can have
 * settings to do before weekend or after weekend. It's each company that
 * can set up how their cycles should work during holidays including
 * company calendar."
 *
 * The policy is `lib/cycle-shift`, read off the company that holds the
 * contract pair — the firm that sells to the client and buys from the
 * consultant or the sub-vendor, because all six money kinds are that
 * firm's own operating dates. Holidays still union both companies'
 * calendars; the direction is one firm's policy and not a negotiation.
 *
 * A caller that passes no policy generates on the shipped default, which
 * is what every company that has said nothing is already on. There is no
 * third behavior for a missing answer — a cycle date arrived at by
 * falling through a gap is the one outcome that must not be possible.
 *
 * ── The February rule ────────────────────────────────────────────────
 *
 * A day of month that does not exist in this month is the last day that
 * does. The 30th in February is the 28th, or the 29th. Anything at or
 * past the 28th means "the end of the month" — which is what a pack
 * author writing 28 meant, and what a 31 would have meant in a 30-day
 * month anyway.
 */

import { categoryOf, isMoneyKind } from '@/lib/cycle-kinds'
import {
  DEFAULT_CYCLE_SHIFT,
  directionFor,
  localDayKey,
  shiftToWorkingDay,
  type CycleShiftPolicy,
} from '@/lib/cycle-shift'

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

/** The Friday that is the default period end. */
const DEFAULT_DAY_OF_WEEK = 5
/** The mid-month cut that is the default first semimonthly boundary. */
const DEFAULT_SEMIMONTHLY_CUT = 15
/** At or past this, a day of month means "the end of the month". */
const MEANS_MONTH_END = 28

/**
 * The calendar day this date names, where the reader is.
 *
 * One copy, in `lib/cycle-shift`, re-exported here under the name its
 * callers already use. It used to be written out twice — once here and
 * once there — and two copies of a timezone fix is one copy waiting to
 * be missed.
 */
export { localDayKey as localKey } from '@/lib/cycle-shift'

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

  // No trailing partial period, and this is deliberate rather than
  // forgotten — see "The cycle engine, honestly" in CLAUDE.md.
  //
  // A contract ending on a Wednesday stops at the Friday before, so its
  // last two days have no hours cycle and no invoice. The retired Rails
  // engine emitted a short trailing group and the rebuild dropped it,
  // which reads like a straight revenue leak and was tried as a one-line
  // fix. It is not one: a trailing cycle is only correct while the
  // contract really does end there. Extending leaves it stranded
  // mid-contract, asking for a partial week that the next regular cycle
  // also covers — and cycles are evidence, so the extension cannot
  // quietly delete it.
  //
  // The honest fix is for the final regular cycle to COVER through the
  // contract end rather than for an extra cycle to exist, and `Cycle`
  // carries no period bounds to say so. Blocked on that column, which is
  // the architect's.

  return periods
}

/**
 * What a company asked for, and which periods this run may emit.
 */
export interface GenerateOptions {
  /**
   * Which way this company's dates move off a day nobody works. Omitted
   * means the shipped default — pay on the working day before, hours and
   * bills on the working day after — which is what every company that has
   * said nothing is already on.
   */
  policy?: CycleShiftPolicy
  /**
   * Emit only periods ending after this day. Null or omitted means the
   * whole contract.
   *
   * This is the extension's floor, and it exists because the day-key
   * guard below cannot survive a company changing its direction. Dates
   * already written are matched by the day they landed on; if pay moved
   * from the Friday before to the Monday after between the two runs,
   * January regenerates onto Mondays that are in nobody's existing set
   * and every pay day of the original contract is written a second time.
   * Two pay days for one fortnight is money, not tidiness.
   *
   * Bounding by period rather than by due date is the honest test of
   * "already covered": a period that ended before the extension began was
   * settled by the first run, whatever day its date was shifted to.
   * Generation still runs over the whole contract so a fortnightly cycle
   * keeps its original weeks — only the emitting is bounded.
   */
  onlyPeriodsAfter?: Date | null
}

/**
 * Every cycle for a contract, in date order.
 *
 * @param start          Contract start
 * @param end            Contract end
 * @param definitions    The kinds this contract needs — see cyclesFor()
 * @param holidays       YYYY-MM-DD, both companies' calendars unioned
 * @param existingDates  kind → set of YYYY-MM-DD already written, for extension
 * @param options        The company's shift policy, and the extension floor
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
  existingDates: Map<string, Set<string>> = new Map(),
  options: GenerateOptions = {}
): GeneratedCycle[] {
  const cycles: GeneratedCycle[] = []
  const holidaySet = new Set(holidays)
  const policy = options.policy ?? DEFAULT_CYCLE_SHIFT
  const floor = options.onlyPeriodsAfter ?? null

  for (const def of definitions) {
    if (!isMoneyKind(def.kind)) continue
    const existing = existingDates.get(def.kind) ?? new Set<string>()

    // Which way this company moves a date of this kind. OTHER is not
    // configurable and never reaches here — an unrecognized kind is
    // skipped above — but `directionFor` answers for it anyway, because a
    // row written by an older engine must not change behavior because
    // somebody edited a setting about pay.
    const direction = directionFor(categoryOf(def.kind), policy)

    // What this kind already sits on: the dates written by an earlier run,
    // and the ones this run has produced so far.
    //
    // Two boundaries can shift onto one day. A semimonthly invoice cuts at
    // month-end and again on the 1st, and when the 31st is a Saturday and
    // the 1st a Sunday both move forward to the same Monday — two rows,
    // one day, two invoices raised for one period. The guard against
    // re-writing an extension's existing dates was here; the guard against
    // a run colliding with itself was not.
    const taken = new Set(existing)

    for (const periodEnd of generatePeriodEnds(start, end, def)) {
      // A period settled by an earlier run is not emitted again, however
      // the company has since asked its dates to move.
      if (floor && periodEnd <= floor) continue
      const due = new Date(periodEnd)
      due.setDate(due.getDate() + (def.offsetDays ?? 0))
      const shifted = shiftToWorkingDay(due, holidaySet, direction)
      // Keyed the same way the holidays are, so an extension knows the
      // dates it already wrote whatever timezone the server is in.
      const day = localDayKey(shifted)
      if (taken.has(day)) continue
      taken.add(day)
      cycles.push({ kind: def.kind, dueOn: shifted })
    }
  }

  cycles.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  return cycles
}
