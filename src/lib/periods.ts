/**
 * The contract says what a period is. The timesheet does not.
 *
 * Invoice generation took the timesheets it was about to bill, found the
 * earliest one, and called that the start of the period. So four weekly
 * timesheets ending on the 3rd, 10th, 17th and 24th of August produced an
 * invoice for "28 July to 24 August" — a period that appears in no
 * contract, matches no purchase order window, and reconciles against
 * nothing on the client's side.
 *
 * A contract that bills monthly bills for the month. If a consultant
 * submits weekly, that is a matter for the consultant and the approver; it
 * changes nothing about what is billed or when. Same on the buy side: a
 * payroll run every fortnight pays a fortnight, whatever shape the hours
 * arrived in.
 *
 * ── Why this can be done exactly ─────────────────────────────────────
 *
 * Because a timesheet stores hours per day, not just a total. A week
 * running Monday 27 July to Sunday 2 August has four days in July and one
 * in August, and both months can take exactly their own. Nothing is
 * apportioned, estimated or rounded — the days are simply read.
 *
 * That is what makes "irrespective of whether the timesheet is weekly"
 * true rather than approximately true.
 *
 * ── The two things a business has to decide ──────────────────────────
 *
 * **Where a month starts.** Calendar (the 1st) or the contract's own
 * anniversary (started the 12th, so periods run the 12th to the 11th).
 * Both are real and neither is more correct; MSPs and VMS portals usually
 * impose the calendar, direct contracts often use the anniversary.
 *
 * **What to do with a week that straddles.** Split it by day, or move the
 * whole thing into one period. Splitting is exact and some clients will
 * not accept a part-week line; moving it whole is simpler and shifts a
 * few thousand dollars between two months.
 *
 * Both are settings on the contract rather than a decision taken here,
 * because both answers are correct somewhere and the wrong one is a
 * reconciliation argument every month.
 */

export type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY'

/** Where a monthly or semi-monthly period begins. */
export type Anchor =
  /** The 1st. What an MSP or a VMS portal almost always imposes. */
  | 'CALENDAR'
  /** The day of the month the contract started. Common on direct deals. */
  | 'CONTRACT'

/** What happens to a timesheet week that crosses a period boundary. */
export type Straddle =
  /** Each day goes to the period it falls in. Exact, and possible because
   *  hours are stored per day. */
  | 'SPLIT'
  /** The whole timesheet goes to the period its last day falls in. */
  | 'END'
  /** The whole timesheet goes to the period its first day falls in. */
  | 'START'

export interface Terms {
  frequency: Frequency
  anchor: Anchor
  straddle: Straddle
  /** When the contract started. Only read when the anchor is CONTRACT. */
  startedOn: Date
}

export interface Period {
  start: Date
  end: Date
  /** "August 2026" · "1–15 August 2026" · "week of 3 August" */
  label: string
}

// ── Date helpers, all in UTC ──────────────────────────────────────────
//
// Every date in this file is a UTC calendar day. A period boundary that
// moves with the reader's timezone would put the same hour in two months
// depending on who opened the screen.

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0))
}

function dayOf(d: Date): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

/** Last day of the month containing this date. Handles February. */
export function endOfMonth(d: Date): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
}

export function daysInMonth(d: Date): number {
  return endOfMonth(d).getUTCDate()
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── The period a date falls in ────────────────────────────────────────

/**
 * Which billing or pay period contains this day.
 *
 * The one function everything else asks. Give it a date and the contract's
 * terms; it returns the period the contract would bill that day under.
 */
export function periodFor(on: Date, terms: Terms): Period {
  const d = dayOf(on)

  switch (terms.frequency) {
    case 'MONTHLY':
      return terms.anchor === 'CALENDAR' ? calendarMonth(d) : anniversaryMonth(d, terms.startedOn)

    case 'SEMIMONTHLY':
      return semiMonth(d)

    case 'WEEKLY':
      return everyNDays(d, terms.startedOn, 7)

    case 'BIWEEKLY':
      return everyNDays(d, terms.startedOn, 14)
  }
}

/**
 * The 1st to the last day. Thirty days in September, thirty-one in
 * August, twenty-eight in February and twenty-nine when it is not.
 */
function calendarMonth(d: Date): Period {
  const start = utc(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const end = endOfMonth(d)
  return { start, end, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
}

/**
 * The contract's own day of the month. Started on the 12th, so periods run
 * the 12th to the 11th.
 *
 * The awkward case is a contract that started on the 31st. There is no
 * 31st of September, so the period starts on the last day the month has —
 * which is what every payroll system does and what a person would do.
 */
function anniversaryMonth(d: Date, startedOn: Date): Period {
  const anchorDay = dayOf(startedOn).getUTCDate()

  const startThis = clampedDay(d.getUTCFullYear(), d.getUTCMonth(), anchorDay)

  const start = d >= startThis
    ? startThis
    : clampedDay(d.getUTCFullYear(), d.getUTCMonth() - 1, anchorDay)

  const nextStart = clampedDay(start.getUTCFullYear(), start.getUTCMonth() + 1, anchorDay)
  const end = addDays(nextStart, -1)

  return { start, end, label: `${iso(start)} to ${iso(end)}` }
}

/** The nth day of a month, or its last day where it has fewer. */
function clampedDay(year: number, month: number, day: number): Date {
  const last = utc(year, month + 1, 0).getUTCDate()
  return utc(year, month, Math.min(day, last))
}

/** 1st to 15th, then 16th to the end. */
function semiMonth(d: Date): Period {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()

  if (d.getUTCDate() <= 15) {
    return {
      start: utc(y, m, 1),
      end: utc(y, m, 15),
      label: `1–15 ${MONTHS[m]} ${y}`,
    }
  }

  const end = endOfMonth(d)
  return {
    start: utc(y, m, 16),
    end,
    label: `16–${end.getUTCDate()} ${MONTHS[m]} ${y}`,
  }
}

/**
 * Fixed-length periods counted from the contract start.
 *
 * Counted rather than snapped to a weekday: a fortnightly payroll that
 * started on a Wednesday pays Wednesday to Tuesday forever, and drifting
 * it onto Mondays would silently pay somebody thirteen days one time.
 */
function everyNDays(d: Date, startedOn: Date, n: number): Period {
  const anchor = dayOf(startedOn)
  const elapsed = Math.floor((d.getTime() - anchor.getTime()) / 86400000)
  const index = Math.floor(elapsed / n)

  const start = addDays(anchor, index * n)
  const end = addDays(start, n - 1)

  return { start, end, label: `${n === 7 ? 'week' : 'fortnight'} of ${iso(start)}` }
}

/**
 * Every period between two dates.
 *
 * What a contract will be billed for over its life, or what has been
 * missed. Bounded, because a bad end date should not spin.
 */
export function periodsBetween(from: Date, to: Date, terms: Terms, max = 400): Period[] {
  const out: Period[] = []
  let cursor = dayOf(from)

  while (cursor <= dayOf(to) && out.length < max) {
    const p = periodFor(cursor, terms)
    out.push(p)
    cursor = addDays(p.end, 1)
  }

  return out
}

/** Is this exactly a period the contract recognises? */
export function isAPeriod(start: Date, end: Date, terms: Terms): boolean {
  const p = periodFor(start, terms)
  return p.start.getTime() === dayOf(start).getTime() && p.end.getTime() === dayOf(end).getTime()
}

// ── Hours in a period ─────────────────────────────────────────────────

export interface Sheet {
  id: string
  periodStart: Date
  periodEnd: Date
  /** { "2026-08-01": 8, … } — the reason this can be exact. */
  days: Record<string, number>
  totalHours: number
}

export interface InPeriod {
  sheetId: string
  hours: number
  /** True where only part of this timesheet belongs to the period. */
  partial: boolean
  /** Said on the line, so a part-week is never a silent surprise. */
  note: string | null
}

/**
 * How many hours of a timesheet belong to a period.
 *
 * Under SPLIT this reads the daily breakdown and takes exactly the days
 * that fall inside — no apportioning, no rounding, no estimate. Under END
 * or START the whole timesheet goes one way or the other.
 *
 * A timesheet with no daily breakdown cannot be split, so it falls back to
 * END and says so rather than dividing a total by seven and calling the
 * answer exact.
 */
export function hoursInPeriod(sheet: Sheet, period: Period, straddle: Straddle): InPeriod | null {
  const sheetStart = dayOf(sheet.periodStart)
  const sheetEnd = dayOf(sheet.periodEnd)

  // No overlap at all: this timesheet is not this period's business.
  if (sheetEnd < period.start || sheetStart > period.end) return null

  const straddles = sheetStart < period.start || sheetEnd > period.end

  if (!straddles) {
    return { sheetId: sheet.id, hours: sheet.totalHours, partial: false, note: null }
  }

  const daily = Object.entries(sheet.days ?? {})

  if (straddle === 'SPLIT' && daily.length > 0) {
    let hours = 0
    let counted = 0
    for (const [day, h] of daily) {
      const when = dayOf(new Date(`${day}T00:00:00Z`))
      if (when >= period.start && when <= period.end) {
        hours += Number(h) || 0
        counted++
      }
    }

    return {
      sheetId: sheet.id,
      hours: Math.round(hours * 100) / 100,
      partial: true,
      note: `${counted} day${counted === 1 ? '' : 's'} of a timesheet running ${iso(sheetStart)} to ${iso(sheetEnd)}`,
    }
  }

  // Whole-timesheet policies, and the fallback when there is nothing daily
  // to split. Dividing a total by seven would look exact and be a guess.
  const goesHere =
    straddle === 'START'
      ? sheetStart >= period.start && sheetStart <= period.end
      : sheetEnd >= period.start && sheetEnd <= period.end

  if (!goesHere) return null

  const why =
    straddle === 'SPLIT'
      ? 'no daily hours recorded, so the whole timesheet is billed where it ends'
      : straddle === 'START'
        ? 'whole timesheet billed where it starts'
        : 'whole timesheet billed where it ends'

  return {
    sheetId: sheet.id,
    hours: sheet.totalHours,
    partial: false,
    note: `Crosses the period boundary — ${why}`,
  }
}

/**
 * Everything billable in one period, across however many timesheets it
 * arrived in.
 *
 * This is the answer to "irrespective of whether the timesheet is weekly".
 * Five weekly sheets or one monthly one produce the same period and the
 * same hours.
 */
export function collect(sheets: Sheet[], period: Period, straddle: Straddle): {
  lines: InPeriod[]
  totalHours: number
  says: string
} {
  const lines = sheets
    .map((s) => hoursInPeriod(s, period, straddle))
    .filter((l): l is InPeriod => l !== null && l.hours > 0)

  const totalHours = Math.round(lines.reduce((sum, l) => sum + l.hours, 0) * 100) / 100
  const partials = lines.filter((l) => l.partial).length

  return {
    lines,
    totalHours,
    says:
      lines.length === 0
        ? `Nothing approved for ${period.label}.`
        : `${totalHours}h for ${period.label}, from ${lines.length} timesheet${lines.length === 1 ? '' : 's'}${partials > 0 ? `, ${partials} of them part-period` : ''}.`,
  }
}
