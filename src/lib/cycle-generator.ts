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

import { shiftCategoryOf, isMoneyKind } from '@/lib/cycle-kinds'
import {
  DEFAULT_CYCLE_SHIFT,
  directionFor,
  localDayKey,
  shiftToWorkingDay,
  type CycleShiftPolicy,
} from '@/lib/cycle-shift'
import { payDatesFor, payDatesInMonth, type PayRhythm } from '@/lib/pay-dates'

export type CycleFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'ON_COMPLETION'

export interface CycleDefinition {
  kind: string
  frequency: CycleFrequency
  /** 0 = Sunday … 6 = Saturday. Weekly and biweekly: the boundary day. Default Friday (see `DEFAULT_DAY_OF_WEEK`). */
  dayOfWeek?: number
  /**
   * 1–31. Monthly: the day. Semimonthly: the first cut, with month-end as
   * the second. At or past 28 means month-end. Default 15 (semimonthly),
   * month-end (monthly).
   */
  dayOfMonth?: number
  /**
   * Days after the period boundary the cycle is due. Default 0, except a
   * weekly cycle naming no weekday, which is due 3 days after its Friday:
   * the Monday after the week's Saturday (`offsetFor`).
   */
  offsetDays?: number
}

export interface GeneratedCycle {
  kind: string
  dueOn: Date
  /**
   * The period the cycle covers, first and last day, as UTC midnights
   * (`Cycle.periodStart`, `periodEnd`, 2026-11-09). The first period
   * starts no earlier than the contract and the last runs through the
   * contract's own end date (`periodsFor`).
   */
  periodStart: Date
  periodEnd: Date
}

/**
 * Friday, and a weekly cycle that names neither day nor offset is due
 * three days later: the Monday after the week's Saturday.
 *
 * A week runs Sunday to Saturday and its hours are due on the Monday
 * after it ends, so weekend work is in before anybody signs. Decided by
 * the founder on 2026-09-30 (CLAUDE.md, "A week runs Sunday to Saturday,
 * and the weekend can be filed" and "When a Sunday-to-Saturday week is
 * due"). The default used to be due on the Friday itself, before the
 * week's Saturday had happened.
 *
 * Why the boundary is Friday and not the Saturday the week ends on:
 * `generatePeriodEnds` keeps only boundaries on or before the contract's
 * last day, so a Saturday boundary drops the final week of every
 * contract ending Sunday to Friday — the ordinary Monday-to-Friday
 * placement loses its last week's hours date, which is a week nobody is
 * reminded to bill. Friday plus three keeps it, and is the shape the
 * shipped packs use (`lib/template-packs`, measured by regulatory over
 * 2,401 contract shapes). Nor is the boundary Monday: a series anchored
 * on Monday starts on the first Monday after the contract does, so a
 * contract starting on a Sunday would owe its first week's hours the
 * next day — the spurious head the approval note below describes.
 *
 * What it still does not cover: a contract starting on a Saturday has
 * no date for that one day, the head's twin of "no final partial
 * period" (CLAUDE.md, "The cycle engine, honestly", item 2).
 *
 * A biweekly period with no day named also ends on the Friday, with no
 * default offset, because when its money moves depends on the kind.
 * Every shipped pack names its own day; this reaches only a definition
 * built without one, and a pack that names a day or an offset gets
 * exactly what it named.
 */
const DEFAULT_DAY_OF_WEEK = 5
/** The Monday after the week's Saturday, for a weekly cycle that names neither day nor offset. */
const DEFAULT_WEEKLY_OFFSET_DAYS = 3

/** How many days after its period end a definition is due. */
function offsetFor(def: CycleDefinition): number {
  if (def.offsetDays !== undefined) return def.offsetDays
  return def.frequency === 'WEEKLY' && def.dayOfWeek === undefined ? DEFAULT_WEEKLY_OFFSET_DAYS : 0
}
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

/**
 * First date on or after `from` that falls on `dayOfWeek`.
 *
 * ── An approval that lands before the submission it approves ─────────
 *
 * Found 2026-09-22, on the release agent's third walk, and written down
 * here because this is where somebody will come looking. **The bug is
 * not in this file and the one-line fix is not here either** — see the
 * note at the end.
 *
 * A contract starting Monday 12 October 2026 generates
 *
 *     TIMESHEET_APPROVE   Mon 12 Oct
 *     TIMESHEET_SUBMIT    Fri 16 Oct
 *
 * because the US_IT pack asks for two independent weekly series —
 * `TIMESHEET_SUBMIT` on `dayOfWeek: 5` and `TIMESHEET_APPROVE` on
 * `dayOfWeek: 1` — and each is anchored separately at the contract
 * start by the function above. The engine did exactly what it was
 * asked; the pack asked for the wrong thing.
 *
 * It is not the weekend-direction question, which was decided on
 * 2026-09-16 and is now a company setting in `lib/cycle-shift`. The
 * walk saw 13 October rather than 12 only because 12 October is a
 * holiday on the seeded calendar; the defect is there with no holidays
 * and no shifting at all.
 *
 * Which contracts: those starting on a **Saturday, Sunday or Monday** —
 * the days where the next Monday arrives before the next Friday. Monday
 * is the commonest start day in staffing. Three of seven.
 *
 * Steady state is right. The second approval, Mon 19 Oct, sits three
 * days after the submission of Fri 16 Oct and approves it. Only the
 * head of the series is spurious — and it is not merely cosmetic:
 * `pickCycle` in `lib/cycle-complete` matches a period's event to the
 * earliest uncompleted cycle due on or after `periodEnd - 1 day`, so
 * approving the first week (ending Fri 16 Oct) claims the 19th and the
 * 12th is never claimed by anything. It stays open for the life of the
 * contract and the placement timeline calls it overdue, which is the
 * exact failure `lib/cycle-complete` was written to end.
 *
 * ── The fix, and why it is one line and not here ─────────────────────
 *
 * The approval is not a rhythm of its own. It is "three days after the
 * hours are due", which this engine can already say — `offsetDays` is
 * honored in `generateCycles` below. So in `lib/template-packs`:
 *
 *     { kind: 'TIMESHEET_APPROVE', frequency: 'WEEKLY', dayOfWeek: 1 }
 *  →  { kind: 'TIMESHEET_APPROVE', frequency: 'WEEKLY', dayOfWeek: 5, offsetDays: 3 }
 *
 * Checked over a full quarter from all seven start weekdays: every
 * approval from the second onward lands on the identical day, the
 * spurious head disappears, and the counts come out equal (11 and 11
 * where they were 11 and 12). It also closes the tail — a Monday-
 * anchored series stops at the last Monday inside the contract, so the
 * final week's hours had no approval date at all.
 *
 * `lib/template-packs` belongs to `etyme-regulatory` under
 * `lib/domains`, so this is written down rather than done. Making the
 * generator drop a cycle that precedes another kind's first cycle would
 * hard-code a dependency between kinds that `lib/cycle-kinds` does not
 * express, and would be wrong for a company that genuinely runs
 * approvals on their own rhythm. The pack is where the sentence
 * belongs.
 */
function nextOnDay(from: Date, dayOfWeek: number): Date {
  // In UTC, because contract dates are stored as UTC midnights. Read in
  // local time, a server east of Greenwich saw a Monday as the Sunday
  // before it, and one west of it moved across a daylight-saving change
  // by an hour and landed a day out (CLAUDE.md, "The cycle engine,
  // honestly", items 8 and 9). The monthly range check reads calendar
  // days since 2026-11-08 (`boundaryKey`); the weekly step loop still
  // steps in local time, which is the rest of item 8's piece of work.
  const d = new Date(from)
  while (d.getUTCDay() !== dayOfWeek) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/**
 * The calendar day a contract boundary names, YYYY-MM-DD.
 *
 * A contract's dates are stored as UTC midnights, and a caller building a
 * date by hand builds it at local midnight; the two agree only under UTC.
 * Item 9 of "The cycle engine, honestly": the monthly range check compared
 * a local-midnight month end against a UTC-midnight contract end, so west
 * of Greenwich the contract's last day was "after" its own end by a few
 * hours and a twelve-month series wrote eleven dates. So a boundary is read
 * as the day it was written for: a UTC midnight as its UTC day, anything
 * else as its local day. Under UTC both readings are the same day, so no
 * date moves where production runs.
 */
function boundaryKey(d: Date): string {
  const utcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  if (!utcMidnight) return localDayKey(d)
  return d.toISOString().slice(0, 10)
}

/** The year and month (0-based) of a contract boundary's calendar day. */
function boundaryMonth(d: Date): { year: number; month: number } {
  const [y, m] = boundaryKey(d).split('-').map(Number)
  return { year: y, month: m - 1 }
}

const DAY_IN_MS = 86_400_000
/** A calendar day key as the UTC midnight the record stores. */
const utcOf = (key: string) => new Date(`${key}T00:00:00Z`)
const plusDays = (key: string, n: number) => new Date(utcOf(key).getTime() + n * DAY_IN_MS).toISOString().slice(0, 10)

/** One period of a series: the boundary its date hangs off, and the days it covers. */
interface Period {
  /** The boundary the due date is counted from, as the series has always written it. */
  boundary: Date
  /** First and last calendar day covered, YYYY-MM-DD. */
  startKey: string
  endKey: string
}

/**
 * The last day a boundary's own period covers. A weekly or biweekly
 * boundary is the week's Friday in the shipped packs ("Friday + 3", see
 * above) and the week runs Sunday to Saturday, so its period ends on the
 * Saturday on or after it. A monthly or semimonthly boundary is the
 * period's own last day.
 */
function regularEndKey(boundary: Date, def: CycleDefinition): string {
  const key = boundaryKey(boundary)
  if (def.frequency === 'WEEKLY' || def.frequency === 'BIWEEKLY') {
    return plusDays(key, (6 - utcOf(key).getUTCDay() + 7) % 7)
  }
  return key
}

/**
 * Every period of one definition over a contract, each with the days it
 * covers. The founder, 2026-11-09: **the last regular period runs through
 * the contract's end date.** Until then generation stopped at the last
 * whole boundary, so a contract ending on a Wednesday had no hours-due,
 * invoice or pay date for its last days ("The cycle engine, honestly",
 * item 2). Now the regular period that holds the end date is kept, its
 * last day the contract's end, and its date the regular one: a contract
 * ending on a Wednesday files its hours, is billed and is paid for those
 * days on the week's (or the month's) usual date. It is the series' own
 * next period cut at the end, never a short cycle of its own, so an
 * extension only moves that period's last day out to where the series
 * always ended it.
 */
function periodsFor(start: Date, end: Date, def: CycleDefinition): Period[] {
  const startKey = boundaryKey(start)
  const endKey = boundaryKey(end)
  if (def.frequency === 'ON_COMPLETION') {
    return generatePeriodEnds(start, end, def).map((b) => ({ boundary: b, startKey, endKey }))
  }
  // Generated a little past the end, so the boundary after it is known.
  const beyond = new Date(end.getTime() + 70 * DAY_IN_MS)
  const all = generatePeriodEnds(start, beyond, def)
  const out: Period[] = []
  let nextStart = startKey
  for (const b of all) {
    const own = regularEndKey(b, def)
    if (boundaryKey(b) <= endKey) {
      // A whole period inside the contract, as the series always wrote it.
      out.push({ boundary: b, startKey: nextStart, endKey: own < endKey ? own : endKey })
      nextStart = plusDays(own, 1)
      continue
    }
    // The first boundary past the end: its period holds the contract's
    // last days where it starts on or before the end.
    if (nextStart <= endKey) out.push({ boundary: b, startKey: nextStart, endKey })
    break
  }
  return out
}

/** Period end dates for one definition between start and end, inclusive. */
function generatePeriodEnds(start: Date, end: Date, def: CycleDefinition): Date[] {
  const periods: Date[] = []
  const startKey = boundaryKey(start)
  const endKey = boundaryKey(end)
  /** A month's date (built at local midnight) inside the contract, by calendar day. */
  const inRange = (on: Date) => { const k = localDayKey(on); return k >= startKey && k <= endKey }

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
      //
      // ── And the shipped pack says 1, which is a typo for 15 ────────
      //
      // Found 2026-09-22 on the release agent's third walk, and the same
      // file and the same handful of lines as the approval note above,
      // so `etyme-regulatory` gets one change with two fixes in it.
      //
      // `lib/template-packs` sets `INVOICE_GENERATE` and
      // `VENDOR_BILL_GENERATE` to SEMIMONTHLY with `dayOfMonth: 1`, so
      // the two cuts are the 1st and month-end — one day apart, then a
      // month. Over calendar 2026 that is 20 dates with gaps of
      // 1, 29, 1, 30, 3, 28, 1 …, where a semimonthly cycle should give
      // 24 dates with gaps of 14 to 18. Four of the twenty-four
      // boundaries vanish entirely into the same-working-day guard
      // below, because a Saturday month-end and a Sunday 1st both move
      // forward to one Monday. A placement timeline reads "Invoice to
      // raise Nov 30 / Dec 1".
      //
      // The decisive evidence is not the gaps, it is `lib/periods`.
      // `semiMonth` there defines the periods a semimonthly contract
      // actually bills — the 1st to the 15th, then the 16th to the last
      // — and a cycle date is a period END. Month-end matches. The 1st
      // matches no period end at all: it asks for an invoice on the
      // FIRST day of the period it would bill, fourteen days before any
      // of those hours exist, and the 1st-to-15th period is then never
      // closed by a cycle. CLAUDE.md's stated default — "Friday weeks,
      // the 15th and month-end" — is `DEFAULT_SEMIMONTHLY_CUT` above and
      // is what the pack meant.
      //
      // What moves if it is changed to 15: the month-end date does not
      // move at all; the other date moves from the 1st to the 15th, 14
      // days later; a year gains four invoice dates. Nothing already
      // written is rewritten — cycles are generated once, at award,
      // convert, replace, extend and seed — so it reaches contracts
      // awarded after the change and worlds seeded after it, and a
      // re-seeded demo moves. No test pins the pack's value; the two in
      // `cycles.test.ts` that use `dayOfMonth: 1` pass a local
      // definition and are testing that this engine honors what it is
      // given, which it does.
      //
      // Separately, and bigger: the pack decides this rhythm even for a
      // line whose order states a `billFrequency` of its own. That is
      // the open money work already documented in `lib/contract-cycles`
      // — a header that says MONTHLY does not yet move an invoice date
      // — and it is why the walk saw semimonthly dates beside a line
      // reading MONTHLY. Fixing the typo does not fix that.
      //
      // Nothing here reads that column and nothing here should: this
      // engine is handed two dates and a list of definitions, and
      // `lib/money/order-terms` is the one door for deciding between a
      // header's copy and a line's. Naming the column in a sentence is
      // not reading it, which is what `terms-through-one-door` had to
      // learn on 2026-09-22 — see the note on `codeOnly` there.
      // In range by calendar day, never by instant (item 9, above).
      let { year, month } = boundaryMonth(start)
      const firstCut = def.dayOfMonth ?? DEFAULT_SEMIMONTHLY_CUT
      while (localDayKey(new Date(year, month, 1)) <= endKey) {
        const first = dayInMonth(year, month, firstCut)
        const last = dayInMonth(year, month, undefined)
        if (inRange(first)) periods.push(first)
        if (last.getTime() !== first.getTime() && inRange(last)) periods.push(last)
        month++
        if (month > 11) { month = 0; year++ }
      }
      break
    }

    case 'MONTHLY': {
      let { year, month } = boundaryMonth(start)
      while (localDayKey(new Date(year, month, 1)) <= endKey) {
        const on = dayInMonth(year, month, def.dayOfMonth)
        if (inRange(on)) periods.push(on)
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
  /**
   * Emit no cycle due before this day. Null or omitted means no floor.
   *
   * The award's floor, and a different question from the extension's.
   * "Never generate a reminder dated before now" is about the date the
   * reminder lands on, not the period it closes: a week that ended on
   * Saturday is still due on Monday, and an award made on Sunday for work
   * already under way owes that Monday reminder. Bounding by the period
   * dropped it, so the first week after an under-way award had no hours
   * date at all.
   *
   * Compared by calendar day, keyed the way every other date here is, so
   * a cycle due on the day itself is kept.
   *
   * Not a replacement for `onlyPeriodsAfter`: an extension must still drop
   * a period the first run settled even where its date falls after the
   * old end, or a company that changed its weekend direction is paid
   * twice for one fortnight. A caller may pass both.
   */
  noneDueBefore?: Date | null
  /**
   * Where a weekly or two-week line counts its pay periods from.
   *
   * Omitted, from the company's first pay period where its Owner set one
   * (`PayRhythm.payFirstPeriodStart`), so a line's pay days are the days
   * the Payroll page pays on; else from the Sunday on or before the line's
   * start. `'LINE'` keeps the Sunday on or before the start even where the
   * company set a first day: an extension of a line written before the
   * first day was set keeps the weeks it already has (`lineKeepsItsWeeks`
   * in lib/contract-cycles), and no pay day already written moves.
   */
  countWeeksFrom?: 'LINE'
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
  const dueFloor = options.noneDueBefore ? localDayKey(options.noneDueBefore) : null

  for (const def of definitions) {
    if (!isMoneyKind(def.kind)) continue
    const entries = periodsFor(start, end, def).map((p) => {
      const due = new Date(p.boundary)
      due.setDate(due.getDate() + offsetFor(def))
      return { periodEnd: p.boundary, due, startKey: p.startKey, endKey: p.endKey }
    })
    emitSeries(def.kind, entries, holidaySet, existingDates, policy, floor, dueFloor, cycles)
  }

  cycles.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  return calculationsFollowPay(cycles)
}

/**
 * A pay calculation belongs to the pay day it is worked out for.
 *
 * A monthly pack works pay out on the 25th and pays at month end, two
 * series on two rhythms. Read on its own the calculation's series would
 * cover the 26th of one month to the 25th of the next, and the last
 * regular period (2026-11-09) would ask for a calculation the month
 * after a contract ended at month end, for a pay day that does not exist.
 * So where a run writes both, each calculation covers the period of the
 * first pay day on or after it, and one with no pay day after it is not
 * written. Where only one of the two is written (an extension that adds
 * a calculation, a caller that asked for one kind) nothing is moved.
 */
function calculationsFollowPay(cycles: GeneratedCycle[]): GeneratedCycle[] {
  const pay = cycles.filter((c) => c.kind === 'SALARY_PAY')
  if (pay.length === 0 || !cycles.some((c) => c.kind === 'SALARY_CALCULATE')) return cycles
  return cycles.flatMap((c) => {
    if (c.kind !== 'SALARY_CALCULATE') return [c]
    const of = pay.find((p) => p.dueOn.getTime() >= c.dueOn.getTime())
    if (!of) return []
    return [{ ...c, periodStart: of.periodStart, periodEnd: of.periodEnd }]
  })
}

/**
 * One kind's dates, from their period ends and unshifted due days to the
 * rows written: moved off a day nobody works the way the company asked,
 * dropped where an earlier run settled the period or the award's floor
 * forbids it, and never two on one day.
 *
 * Shared by the pack's series and the company's payroll, so a pay day
 * from a setting is guarded exactly the way a pay day from a pack is.
 */
function emitSeries(
  kind: string,
  entries: readonly { periodEnd: Date; due: Date; startKey: string; endKey: string }[],
  holidaySet: Set<string>,
  existingDates: Map<string, Set<string>>,
  policy: CycleShiftPolicy,
  floor: Date | null,
  dueFloor: string | null,
  out: GeneratedCycle[]
): void {
  const existing = existingDates.get(kind) ?? new Set<string>()

  // Which way this company moves a date of this kind. OTHER is not
  // configurable and never reaches here — an unrecognized kind is
  // skipped by the callers — but `directionFor` answers for it anyway,
  // because a row written by an older engine must not change behavior
  // because somebody edited a setting about pay.
  // By the kind's own weekend direction (`shiftCategoryOf`): pay before, bills and a supplier's invoice after.
  const direction = directionFor(shiftCategoryOf(kind), policy)

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
  /** The cycle this run wrote on each day, so a period that lands on it widens it. */
  const wrote = new Map<string, GeneratedCycle>()

  for (const { periodEnd, due, startKey, endKey } of entries) {
    // A period settled by an earlier run is not emitted again, however
    // the company has since asked its dates to move.
    if (floor && periodEnd <= floor) continue
    // The company's own days off where it set them (2026-10-06).
    const shifted = shiftToWorkingDay(due, holidaySet, direction, policy.daysOff)
    // Keyed the same way the holidays are, so an extension knows the
    // dates it already wrote whatever timezone the server is in.
    const day = localDayKey(shifted)
    if (dueFloor && day < dueFloor) continue
    if (taken.has(day)) {
      // Two periods moved onto one day: the one cycle this run wrote there
      // covers both, so no period is left without a date.
      const same = wrote.get(day)
      if (same && endKey > same.periodEnd.toISOString().slice(0, 10)) same.periodEnd = utcOf(endKey)
      continue
    }
    taken.add(day)
    const cycle = { kind, dueOn: shifted, periodStart: utcOf(startKey), periodEnd: utcOf(endKey) }
    wrote.set(day, cycle)
    out.push(cycle)
  }
}

// ── Pay dates from the company's own payroll ───────────────────────────

const DAY_MS = 86_400_000

/**
 * The company's first pay period's Sunday, as a UTC midnight, where the
 * company pays every week or every other week and its Owner set it. Null
 * otherwise: nothing is guessed.
 */
export function companyFirstSunday(rhythm: PayRhythm): number | null {
  if (rhythm.payPeriod !== 'WEEKLY' && rhythm.payPeriod !== 'BIWEEKLY') return null
  const v = rhythm.payFirstPeriodStart
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(String(v).slice(0, 10))) return null
  const t = Date.parse(`${String(v).slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(t) || new Date(t).getUTCDay() !== 0) return null
  return t
}
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/**
 * A line's pay calculation and pay day on the company's own payroll
 * rhythm (`lib/pay-dates`), rather than on the pack's salary lines.
 *
 * Decided by the founder, 2026-10-07: payroll is the company's choice and
 * the recommendation is the default. The caller decides whether a company
 * chose — `lib/contract-cycles` passes a rhythm only where somebody
 * answered on the settings screen, so a company that never did keeps the
 * pack's dates to the day.
 *
 * ── Every week and every other week ──────────────────────────────────
 *
 * Periods are Sunday-to-Saturday weeks — one, or two for every other
 * week — counted from the company's first pay period where its Owner set
 * one (2026-11-14), so a line starting mid-period has its first pay day
 * on the day the Payroll page pays that period; else from the Sunday on
 * or before the contract start, the same periods `periodFor` in
 * `lib/periods` pays and the payroll export reads. Pay is worked out and paid the company's offsets after each
 * period's Saturday (`payDatesFor`).
 *
 * A period is kept while its Friday is inside the contract, for the
 * reason the weekly pack lines are written "Friday + 3": the ordinary
 * placement ends on a Friday, and a Saturday test would drop its last
 * period's pay day. The Friday is also what an extension's floor is
 * compared with, as it is for the pack's own series. A contract starting
 * on a Saturday has its one day paid in the week that ends on it, which
 * the pack's Friday anchor never covered.
 *
 * ── Twice a month and once a month ───────────────────────────────────
 *
 * The period ends on a pay day (`payDatesInMonth`), and a pay day inside
 * the contract is written with the calculation before it. A calculation
 * that would fall before the contract starts is not written — the pack's
 * own rule, where a monthly line starting on the 27th has no 25th — and
 * the pay day stands.
 *
 * No weekend or holiday is moved here; `emitSeries` moves both kinds in
 * the company's PAY direction around its own days off and holidays.
 */
export function generatePayCycles(
  start: Date,
  end: Date,
  rhythm: PayRhythm,
  holidays: Iterable<string> = [],
  existingDates: Map<string, Set<string>> = new Map(),
  options: GenerateOptions = {}
): GeneratedCycle[] {
  type Entry = { periodEnd: Date; due: Date; startKey: string; endKey: string }
  const calc: Entry[] = []
  const pay: Entry[] = []
  const from = utcMidnight(start)
  const to = utcMidnight(end)
  const key = (d: Date) => d.toISOString().slice(0, 10)
  const fromKey = key(from)
  const toKey = key(to)

  if (rhythm.payPeriod === 'WEEKLY' || rhythm.payPeriod === 'BIWEEKLY') {
    const step = rhythm.payPeriod === 'WEEKLY' ? 7 : 14
    // The company's own periods where its Owner set the first day (the
    // founder, 2026-11-14): the period holding the line's start, counted
    // forward or back from that Sunday. Else the Sunday on or before it.
    const first = options.countWeeksFrom === 'LINE' ? null : companyFirstSunday(rhythm)
    const stepMs = step * DAY_MS
    const anchor = first !== null
      ? first + Math.floor((from.getTime() - first) / stepMs) * stepMs
      : from.getTime() - from.getUTCDay() * DAY_MS // the Sunday on or before the start
    for (let k = 1; ; k++) {
      const saturday = new Date(anchor + (k * step - 1) * DAY_MS)
      const friday = new Date(saturday.getTime() - DAY_MS)
      const sunday = new Date(saturday.getTime() - (step - 1) * DAY_MS)
      const startKey = key(sunday) < fromKey ? fromKey : key(sunday)
      const { calcOn, payOn } = payDatesFor(saturday, rhythm)
      if (friday > to) {
        // The founder, 2026-11-09: the last regular period runs through the
        // contract's end date, paid on its usual day.
        if (key(sunday) <= toKey) {
          calc.push({ periodEnd: friday, due: calcOn, startKey, endKey: toKey })
          pay.push({ periodEnd: friday, due: payOn, startKey, endKey: toKey })
        }
        break
      }
      const endKey = key(saturday) < toKey ? key(saturday) : toKey
      calc.push({ periodEnd: friday, due: calcOn, startKey, endKey })
      pay.push({ periodEnd: friday, due: payOn, startKey, endKey })
    }
  } else {
    let year = from.getUTCFullYear()
    let month = from.getUTCMonth() + 1
    let nextStart = fromKey
    let done = false
    while (!done) {
      for (const { calcOn, payOn } of payDatesInMonth(year, month, rhythm)) {
        if (payOn < from) continue
        if (payOn > to) {
          // The pay day after the end: its period holds the contract's last days.
          if (nextStart <= toKey) {
            if (calcOn >= from) calc.push({ periodEnd: payOn, due: calcOn, startKey: nextStart, endKey: toKey })
            pay.push({ periodEnd: payOn, due: payOn, startKey: nextStart, endKey: toKey })
          }
          done = true
          break
        }
        if (calcOn >= from) calc.push({ periodEnd: payOn, due: calcOn, startKey: nextStart, endKey: key(payOn) })
        pay.push({ periodEnd: payOn, due: payOn, startKey: nextStart, endKey: key(payOn) })
        nextStart = key(new Date(payOn.getTime() + DAY_MS))
      }
      month++
      if (month > 12) { month = 1; year++ }
      if (Date.UTC(year, month - 1, 1) > to.getTime() + 70 * DAY_MS) done = true
    }
  }

  const cycles: GeneratedCycle[] = []
  const holidaySet = new Set(holidays)
  const policy = options.policy ?? DEFAULT_CYCLE_SHIFT
  const floor = options.onlyPeriodsAfter ?? null
  const dueFloor = options.noneDueBefore ? localDayKey(options.noneDueBefore) : null
  emitSeries('SALARY_CALCULATE', calc, holidaySet, existingDates, policy, floor, dueFloor, cycles)
  emitSeries('SALARY_PAY', pay, holidaySet, existingDates, policy, floor, dueFloor, cycles)
  cycles.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
  return cycles
}
