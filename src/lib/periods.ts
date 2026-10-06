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
 * running Sunday 26 July to Saturday 1 August has six days in July and one
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
  /**
   * Each day goes to the period it falls in. Exact, and possible because
   * hours are stored per day.
   *
   * Exact, and **not recordable on a bill** — see `billingStraddle`
   * below. Answering "how many of this week's hours fell in August" is a
   * question a report may ask and get a true answer to. Billing it is a
   * different act, and the document model cannot hold the answer.
   */
  | 'SPLIT'
  /** The whole timesheet goes to the period its last day with hours falls in. */
  | 'END'
  /** The whole timesheet goes to the period its first day with hours falls in. */
  | 'START'

/** A straddle a bill can honor, and what it was asked for. */
export interface BillingStraddle {
  /** What the bill will actually do. */
  straddle: Straddle
  /**
   * Why the document's own answer could not be honored, in a sentence.
   * Null where it was honored, which is every case but one.
   */
  instead: string | null
}

/**
 * The straddle a BILL can record, which is not always the one the
 * document asked for.
 *
 * ── The nine hours billed to nobody ──────────────────────────────────
 *
 * Omar Haddad worked Monday 31 August to Friday 4 September 2026, nine
 * hours a day, forty-five hours, signed by Northbend Athletic's hiring
 * manager with five hours at time and a half. The September invoice
 * billed thirty-six of them — the four September days — and `SPLIT` was
 * right to say so: one day of that week belongs to August, the split was
 * exact, and `hoursInPeriod` flagged it partial and said which days it
 * had taken.
 *
 * Monday's nine hours were then on no invoice, and no invoice they could
 * ever reach was coming. Two facts close that door, and neither is a
 * default anybody chose:
 *
 * **One timesheet bills once, ever.** `InvoiceLine` is unique on
 * `(timesheetId, sellContractId)` and the schema says the reason out
 * loud: it is the whole anti-double-billing control, and it is in the
 * database rather than in a service because a service can be bypassed by
 * the next route somebody writes. So the August days have nowhere to be
 * written — not a second line on the September invoice, and not a line
 * on an August one.
 *
 * **Generation runs forward.** An invoice bills the period containing
 * the work it was asked about. Nothing walks backwards looking for a
 * period that was never billed, and the periods before an engagement's
 * first billing cycle are never generated at all. On the seeded world
 * there is no August invoice on that engagement and there will not be
 * one.
 *
 * So under `SPLIT` the minority days of every straddling week are lost,
 * silently, at $1,188 a time on one placement — and a monthly or
 * fortnightly period straddles a week roughly once a month on every
 * calendar-anchored engagement. It is not an exotic configuration; it is
 * arithmetic that is right and cannot be written down.
 *
 * ── Why the answer is not "change the default" ────────────────────────
 *
 * The shipped default could be moved from `SPLIT` to `END` and this
 * placement would come out right. `SPLIT` would still be a setting the
 * product offers, still be the honest answer for a client that will not
 * accept a part-week line, and still lose the same hours for anybody who
 * chose it. A defect made rarer is a defect made harder to find, and
 * nobody audits an invoice that is too small.
 *
 * So the resolution is here, where the arithmetic is, and it is narrow:
 * `START` and `END` each put the whole week in one period, are each
 * recordable, and are untouched. Only `SPLIT` cannot be recorded, and a
 * bill asked for it does the one thing that loses nothing and says which
 * answer it used.
 *
 * ── Why the fallback is END rather than START ─────────────────────────
 *
 * Two reasons, and the file already had the first. `hoursInPeriod` has
 * fallen back to `END` for a timesheet with no daily breakdown since it
 * was written — the same situation, a split that cannot be performed —
 * so this is the existing rule applied to the case that was missed.
 *
 * The second is money. `END` bills a week on the invoice for the period
 * its last day falls in, so the work is always complete before it is
 * billed. `START` would put a week beginning 29 September on the
 * September invoice, billing a client for four days nobody had worked
 * yet.
 *
 * ── What would make SPLIT recordable ─────────────────────────────────
 *
 * `periodStart` and `periodEnd` on `InvoiceLine`, and the unique
 * relaxed to `(timesheetId, sellContractId, periodStart)`. That is a
 * schema request for `etyme-architect` and it is not urgent: the unique
 * is a real control, one line per week reads better on a document than
 * two, and nothing is lost today.
 */
export function billingStraddle(straddle: Straddle): BillingStraddle {
  if (straddle !== 'SPLIT') return { straddle, instead: null }

  return {
    straddle: 'END',
    instead:
      'one week bills once per contract, so the days falling in the earlier period ' +
      'cannot be billed there and the whole week is billed in the period its last worked day falls in',
  }
}

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
  //
  // Decided 2026-10-06: START and END judge a week by its first and last
  // day with hours, never by an empty Sunday or Saturday at its edge.
  // With no daily hours, the sheet's own first and last day stand in.
  const worked = workedSpan(sheet.days)
  const first = worked ? worked.first : sheetStart
  const last = worked ? worked.last : sheetEnd
  const judged = straddle === 'START' ? first : last
  const goesHere = judged >= period.start && judged <= period.end

  if (!goesHere) return null

  const why =
    straddle === 'SPLIT'
      ? 'no daily hours recorded, so the whole timesheet is billed where it ends'
      : straddle === 'START'
        ? 'whole timesheet billed where its first worked day falls'
        : 'whole timesheet billed where its last worked day falls'

  return {
    sheetId: sheet.id,
    hours: sheet.totalHours,
    partial: false,
    note: `Crosses the period boundary — ${why}`,
  }
}

/** The first and last day with hours on a sheet. Null where no day has any. */
export function workedSpan(days: Record<string, number> | null | undefined): { first: Date; last: Date } | null {
  const worked = Object.entries(days ?? {})
    .filter(([, h]) => Number(h) > 0)
    .map(([k]) => k.slice(0, 10))
    .sort()
  if (worked.length === 0) return null
  return {
    first: dayOf(new Date(`${worked[0]}T00:00:00Z`)),
    last: dayOf(new Date(`${worked[worked.length - 1]}T00:00:00Z`)),
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

// ── Hours in a calendar month ─────────────────────────────────────────

/**
 * A person's hours in the calendar month holding `on`, counted by day.
 *
 * "Hours this month" on a worker's page counted every week that *started*
 * in the month, so a week running Monday 31 August to Friday 4 September
 * was August's whole, and September lost its first four days — Helena
 * Marsh read 120 where her own list held 152. A month is its days: the
 * days of each sheet that fall inside it, read off the daily breakdown,
 * whichever month the week began in.
 *
 * A sheet crossing the month with no daily breakdown cannot be split, so
 * it counts where it ends — the same fallback `hoursInPeriod` uses — and
 * `unsplit` says how many did, so a screen can say the figure leans on it
 * rather than presenting a guess as a count.
 */
export function hoursInMonth(
  sheets: readonly Sheet[],
  on: Date
): { hours: number; unsplit: number; month: Period } {
  const start = utc(on.getUTCFullYear(), on.getUTCMonth(), 1)
  const month: Period = {
    start,
    end: endOfMonth(start),
    label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
  }
  let hours = 0
  let unsplit = 0
  for (const s of sheets) {
    const got = hoursInPeriod(s, month, 'SPLIT')
    if (!got) continue
    hours += got.hours
    if (!got.partial && got.note) unsplit++
  }
  return { hours: r2(hours), unsplit, month }
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

// ── When the payer accepted fewer hours than were worked ─────────────
//
// The founder, 2026-09-29 (CLAUDE.md, "What each rung may bill, and
// when", rule 4): **when fewer hours are accepted than were worked, the
// cut comes off overtime first, and off the later bill first. A partial
// acceptance covering only some days is priced on the days it covers.**
//
// An acceptance is one number for a range of days, with no daily
// breakdown, so the rule is what says which hours the difference came
// off. Allocated exactly, deterministically, in two passes:
//
//   1. **Overtime first.** The hours over the line — which, by the rule
//      above, sit on the last hours worked in the week — are cut first,
//      walking from the last covered day backward.
//   2. **Then ordinary hours**, again from the last covered day
//      backward; on any one day the hours worked go before paid leave
//      drawn from the bank, the way a day's leave is already capped at
//      its hours.
//
// Walking backward is also "the later bill first": where a week crosses
// the edge of a bill, the days in the later period are cut before any
// day in the earlier one, so the earlier bill keeps its days whole as
// far as the cut allows. Where the two rules pull apart — the week's
// overtime sits on a day in the earlier period — overtime comes first,
// because the founder put it first.
//
// A partial acceptance is priced on the days it covers and no others.
// The week is still judged whole against the line, the way a week
// crossing a bill's edge is: overtime is a weekly fact, and which days
// somebody accepted does not change which hours took the week over.

/** A payer's acceptance, as the days need to read it. */
export interface AcceptedCut {
  /** Hours accepted across the days covered. */
  hours: number
  /** First day covered, inclusive, as an ISO date. Null is the start of the sheet. */
  from: string | null
  /** Last day covered, inclusive, as an ISO date. Null is the end of the sheet. */
  to: string | null
}

/** One day's hours, cut into the three kinds the week judged them to be. */
export interface DayBands {
  day: string
  /** The Sunday the week began: a week runs Sunday to Saturday (`weekStart`). */
  week: string
  regular: number
  leave: number
  over: number
}

/**
 * The days an acceptance covers, with the hours it did not accept taken
 * off: overtime first, then ordinary hours, each from the last day
 * backward. Days outside the acceptance are not returned at all.
 *
 * An acceptance of more than the covered days hold cuts nothing; the
 * caller decides what that means (`lib/money/rung-billing` does not
 * price it from the days).
 */
export function acceptedDays(days: readonly DayBands[], accepted: AcceptedCut): DayBands[] {
  const covered = [...days]
    .filter((d) => (!accepted.from || d.day >= accepted.from) && (!accepted.to || d.day <= accepted.to))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ ...d }))

  const held = r2(covered.reduce((n, d) => n + d.regular + d.leave + d.over, 0))
  let cut = r2(held - Math.max(0, accepted.hours))
  if (cut <= 0) return covered

  // 1. Overtime first, from the last day backward.
  for (let i = covered.length - 1; i >= 0 && cut > 0; i--) {
    const take = Math.min(cut, covered[i].over)
    covered[i].over = r2(covered[i].over - take)
    cut = r2(cut - take)
  }

  // 2. Then ordinary hours, from the last day backward: worked, then leave.
  for (let i = covered.length - 1; i >= 0 && cut > 0; i--) {
    const fromWorked = Math.min(cut, covered[i].regular)
    covered[i].regular = r2(covered[i].regular - fromWorked)
    cut = r2(cut - fromWorked)
    const fromLeave = Math.min(cut, covered[i].leave)
    covered[i].leave = r2(covered[i].leave - fromLeave)
    cut = r2(cut - fromLeave)
  }

  return covered
}

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
 *
 * `accepted`, where the payer accepted something other than every hour
 * worked, prices the days that acceptance covers with the hours it did
 * not accept cut off them (`acceptedDays`). Null prices the days worked.
 */
export function billableInPeriod(
  sheet: Sheet & { leaveDays?: Record<string, number> | null },
  period: Period,
  straddle: Straddle,
  rateCents: number,
  policy: OvertimePolicy,
  decisions: Decision[] = [],
  accepted: AcceptedCut | null = null
): BilledInPeriod | null {
  // What this document asked for, and what a bill can actually record.
  // Only SPLIT differs, and `billingStraddle` says why in a sentence
  // rather than moving the hours quietly. This is the one door for it, so
  // the invoice route and the three-way match cannot reach two answers
  // about the same week.
  const asked = billingStraddle(straddle)
  const share = hoursInPeriod(sheet, period, asked.straddle)
  if (!share) return null

  // The reason rides on the line, because a week billed somewhere other
  // than where its days fall is a thing the person paying it should be
  // able to read. It replaces `hoursInPeriod`'s own note rather than
  // being appended to it: that note says what END did, and this one says
  // why END was used.
  if (asked.instead && share.note) {
    share.note = `Crosses the period boundary — ${asked.instead}`
  }

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
  const perDay: DayBands[] = []
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

    perDay.push({ day: isoDay, week, regular, leave: onLeave, over })
  }

  // What the payer accepted, where it is not every hour worked: the days
  // it covers, with the hours it did not accept cut off them. The week
  // has already been judged whole above, so an hour that was over the
  // line is still an overtime hour whoever accepted which days.
  const kept = new Map<string, { regular: number; leave: number; over: number }>()
  for (const d of accepted ? acceptedDays(perDay, accepted) : perDay) {
    if (!inside(d.day)) continue
    const acc = kept.get(d.week) ?? { regular: 0, leave: 0, over: 0 }
    kept.set(d.week, {
      regular: r2(acc.regular + d.regular),
      leave: r2(acc.leave + d.leave),
      over: r2(acc.over + d.over),
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
