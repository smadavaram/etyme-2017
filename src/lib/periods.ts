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

import {
  billableHours,
  splitWeeks,
  valueOf,
  weekStart,
  type Decision,
  type OvertimePolicy,
  type Split,
  type Valuation,
  type WeekLine,
} from '@/lib/overtime'

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

/** Is this exactly a period the contract recognizes? */
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

// ── What a period may bill, once somebody has decided the overtime ────
//
// `hoursInPeriod` answers "how many hours", which was enough while every
// hour was worth the same. It is not enough now: a week over the line
// holds hours of three different kinds — ordinary, decided overtime, and
// hours nobody has answered yet — and only the first two may be billed.
// A single number cannot say which of them it is made of, so an invoice
// reading it either billed an undecided hour or dropped a decided one.
//
// This restricts the weekly split to the days the period may bill, and
// leaves the judging of the week to `splitWeeks`. Two rules make that
// safe:
//
// **The week is judged whole, then apportioned.** A week running 27 July
// to 2 August is weighed against the threshold across all seven days,
// whichever months they fall in. Judging the four days in July on their
// own would find no overtime at all and the five hours would vanish.
//
// **The hours that took the week over the line are the last ones
// worked.** Walking the days in order and giving each day the part of
// its hours that sits above the running threshold is exact, needs no
// pro-rata, and says the same thing a timekeeper would: you went into
// overtime on Thursday afternoon. The fraction the old invoice code used
// — overtime hours times the share of the sheet in the period — was a
// guess that happened to be right when nothing straddled.

/** Two decimals, the precision hours are stored at. */
const r2 = (n: number): number => Math.round(n * 100) / 100

export interface BilledInPeriod {
  /** The bands, restricted to the days this period may bill. */
  split: Split
  /** What those bands are worth at this rate. */
  value: Valuation
  /** The hours that may be printed on the line — never a pending one. */
  hours: number
  /** How the period took them: the whole timesheet, or these days of it. */
  share: InPeriod
  /**
   * The weeks whose hours reach this invoice and have a live decision
   * behind them. Their decisions are billed, and billed is immutable.
   */
  weeksBilled: string[]
  /** Over the line, undecided, and therefore left off. Say so; never bill it. */
  pendingHours: number
}

/**
 * What a timesheet is worth to one billing period.
 *
 * Returns null where the timesheet is none of this period's business —
 * the same answer `hoursInPeriod` gives, for the same reasons.
 */
export function billableInPeriod(
  sheet: Sheet & { leaveDays?: Record<string, number> | null },
  period: Period,
  straddle: Straddle,
  rateCents: number,
  policy: OvertimePolicy,
  decisions: Decision[] = []
): BilledInPeriod | null {
  const share = hoursInPeriod(sheet, period, straddle)
  if (!share) return null

  const days = sheet.days ?? {}
  const leave = sheet.leaveDays ?? {}

  // The week judged whole: the threshold, the decision, and whether that
  // decision still describes the week. None of that changes because a
  // month boundary runs through the middle of it.
  const whole = splitWeeks(days, policy, { leaveDays: leave, decisions })

  const inside = (isoDay: string): boolean => {
    if (!share.partial) return true
    const when = new Date(`${isoDay}T00:00:00.000Z`)
    return when >= dayOf(period.start) && when <= dayOf(period.end)
  }

  // Day by day, in order, so the hours above the line land on the day
  // the week actually crossed it.
  const kept = new Map<string, { regular: number; leave: number; over: number }>()
  const running = new Map<string, number>()

  for (const [isoDay, raw] of Object.entries(days).sort((a, b) => a[0].localeCompare(b[0]))) {
    const hours = Number(raw)
    if (!Number.isFinite(hours) || hours <= 0) continue

    const week = weekStart(isoDay)
    const onLeave = Math.min(Math.max(Number(leave[isoDay]) || 0, 0), hours)
    const worked = r2(hours - onLeave)

    const before = running.get(week) ?? 0
    const after = r2(before + worked)
    running.set(week, after)

    const line = policy.afterHours
    const over = line == null ? 0 : r2(Math.max(0, after - Math.max(line, before)))
    const regular = r2(worked - over)

    if (!inside(isoDay)) continue
    const acc = kept.get(week) ?? { regular: 0, leave: 0, over: 0 }
    kept.set(week, {
      regular: r2(acc.regular + regular),
      leave: r2(acc.leave + onLeave),
      over: r2(acc.over + over),
    })
  }

  const weeks: WeekLine[] = whole.weeks.map((w) => {
    const got = kept.get(w.weekOf) ?? { regular: 0, leave: 0, over: 0 }
    return {
      ...w,
      hours: r2(got.regular + got.leave + got.over),
      workedHours: r2(got.regular + got.over),
      leaveHours: got.leave,
      regularHours: got.regular,
      overHours: got.over,
      // Which band the over-hours fall in is the week's answer, not this
      // period's. This period only says how many of them it holds.
      overtimeHours: w.overtimeHours > 0 ? got.over : 0,
      bankedHours: w.bankedHours > 0 ? got.over : 0,
      pendingHours: w.pendingHours > 0 ? got.over : 0,
    }
  })

  const sum = (pick: (w: WeekLine) => number) => r2(weeks.reduce((n, w) => n + pick(w), 0))

  const split: Split = {
    regularHours: sum((w) => w.regularHours),
    leaveHours: sum((w) => w.leaveHours),
    overtimeHours: sum((w) => w.overtimeHours),
    pendingHours: sum((w) => w.pendingHours),
    bankedHours: sum((w) => w.bankedHours),
    weeks,
  }

  return {
    split,
    value: valueOf(split, rateCents),
    hours: billableHours(split),
    share,
    // A week whose hours reach this invoice and whose decision priced
    // them. A banked week counts: its ordinary hours are on this
    // invoice, so changing the answer afterwards would restate a
    // document somebody has already been sent.
    weeksBilled: weeks
      .filter((w) => w.treatment !== null && w.hours > 0)
      .map((w) => w.weekOf),
    pendingHours: split.pendingHours,
  }
}

// ── The working, so a line can be checked by the person paying it ──────
//
// A line with a premium on it does not multiply out. Forty-five hours at
// $132 is $5,940; the line says $6,270, because five of those hours were
// signed at time and a half. Both numbers are right and printing only
// the second beside the first makes the document uncheckable — which is
// the whole job of an invoice line.
//
// `InvoiceLine` holds one row per timesheet per contract, deliberately,
// so the two rows a paper invoice would print cannot be stored. The
// working is therefore derived: the same split the money came from, cut
// into the bands a person would expect to read.
//
// Amounts here are hours × the band's own rate, rounded once — the way a
// billing clerk would do it — rather than the valuation's per-band
// rounding. The two agree to the cent whenever the premium rate lands on
// a whole cent, which is every ordinary case. Where they do not, the
// caller compares against what was actually billed and shows no working
// at all rather than a sum that is a cent out. A working that does not
// add up is worse than none: it is the bug this exists to fix, smaller.

export interface Band {
  kind: 'REGULAR' | 'LEAVE' | 'OVERTIME'
  hours: number
  /** Cents an hour for this band: the contract's rate, or what was applied to it. */
  rateCents: number
  amountCents: number
  /** What the band is, in the trade's words rather than the enum's. */
  says: string
}

/** 'time and a half' · 'double time' · '1.75×' */
function multipleWord(bps: number): string {
  const x = bps / 10_000
  if (x === 1) return 'the usual rate'
  if (x === 1.5) return 'time and a half'
  if (x === 2) return 'double time'
  return `${x}×`
}

/**
 * A billed split as the two or three lines a person would expect to read.
 *
 * Overtime is grouped by the rate that was applied, not by week: a
 * semi-monthly sheet holding one week at the usual rate and one at double
 * time reads as two bands, which is what happened, while two weeks
 * answered the same way read as one.
 */
export function bandsOf(split: Split, rateCents: number): Band[] {
  const out: Band[] = []

  if (split.regularHours > 0) {
    out.push({
      kind: 'REGULAR',
      hours: split.regularHours,
      rateCents,
      amountCents: Math.round(split.regularHours * rateCents),
      says: 'at the usual rate',
    })
  }

  if (split.leaveHours > 0) {
    out.push({
      kind: 'LEAVE',
      hours: split.leaveHours,
      rateCents,
      // Leave drawn from the bank is paid at the ordinary rate. It was
      // banked at a premium or it was not; either way what is owed now
      // is an hour's pay.
      amountCents: Math.round(split.leaveHours * rateCents),
      says: 'paid leave, at the usual rate',
    })
  }

  const byBps = new Map<number, number>()
  for (const w of split.weeks) {
    if (w.overtimeHours <= 0 || w.appliedBps == null) continue
    byBps.set(w.appliedBps, r2((byBps.get(w.appliedBps) ?? 0) + w.overtimeHours))
  }

  for (const [bps, hours] of [...byBps.entries()].sort((a, b) => a[0] - b[0])) {
    const bandRate = Math.round((rateCents * bps) / 10_000)
    out.push({
      kind: 'OVERTIME',
      hours,
      rateCents: bandRate,
      amountCents: Math.round(hours * bandRate),
      says: `overtime, at ${multipleWord(bps)}`,
    })
  }

  return out
}
