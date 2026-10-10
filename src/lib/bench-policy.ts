/**
 * What a consultant between projects costs, and what happens next.
 *
 * ── Why this is a setting and not a rule ─────────────────────────────
 *
 * Every one of these is real and none is more correct than the others:
 *
 *   · no bill, no pay — probably the most common;
 *   · full pay, carried two or three months, then released if nothing
 *     lands;
 *   · a reduced holding rate, which on some visas is what keeps a person
 *     lawfully employed;
 *   · a slice of every profit share held back into that consultant's own
 *     pot while they bill, and the bench paid out of it.
 *
 * This is a software product, not one staffing firm. Building any single
 * one of those into the core would make it a product for whoever happened
 * to run it that way. So the firm configures, and this works out the
 * consequences.
 *
 * The old spreadsheet had "Indian salary", "Rental" and "Guest house"
 * sitting unallocated at the bottom of the page — people were being
 * carried and housed between projects, and none of that ever reached a
 * consultant's profit line.
 */

import { amount } from '@/lib/money-display'
import { DEFAULT_DAYS_OFF, cleanDaysOff } from '@/lib/cycle-shift'

export type BenchPolicy = 'NO_PAY' | 'FULL_PAY' | 'REDUCED_RATE' | 'RESERVE_FUNDED'
export type ReserveOnExit = 'PAY_OUT' | 'COMPANY_KEEPS' | 'DEPENDS_ON_REASON'

export interface Policy {
  policy: BenchPolicy
  /** Basis points of their billing pay, where the policy is a reduced rate. */
  benchRateBps?: number | null
  /** Days somebody is carried before release. Null = carried indefinitely. */
  carryDays?: number | null
  /** Basis points of each share held back, where the bench is reserve funded. */
  reserveBps?: number | null
  reserveOnExit?: ReserveOnExit
}

export interface BenchFacts {
  idleDays: number
  /**
   * The day they came onto the bench. Given, the days paid are the real
   * Monday-to-Friday days after it (`workingDaysBetween`, the count
   * `burnOf` already uses); absent, they are estimated as five in seven,
   * and `counted` says so.
   */
  since?: Date | null
  /** What they earn per working day when they are billing, in cents. */
  billingDayRateCents: number
  /** What is in their own pot, in cents. Only meaningful when reserve funded. */
  reserveCents?: number
  /** Housing, and anything else carried for them per idle day. */
  housingPerDayCents?: number
  /**
   * Whether this person is paid for a public holiday on the bench, and the
   * firm's calendar (`holidayPayFor` and lib/holidays). Absent, holidays are
   * counted as paid days and `holidays` says NOT_ASKED.
   */
  holidayPay?: HolidayPay | null
}

export interface BenchCost {
  /** What the firm pays out over the idle period, in cents. */
  costCents: number
  /** Of that, what came out of the consultant's own reserve. */
  fromReserveCents: number
  /** Of that, what the firm paid from its own money. */
  fromFirmCents: number
  /** What is left in their pot afterwards. */
  reserveLeftCents: number
  /** True where the carry limit has run out. */
  dueForRelease: boolean
  /** Days left before the limit, where there is one. */
  daysLeft: number | null
  /** The working days the pay was counted over, carry limit applied. */
  paidWorkingDays: number
  /**
   * WEEKDAYS where the real Monday-to-Friday days were counted from a
   * start date; ESTIMATED where no start date was given and five in seven
   * stood in for them.
   */
  counted: 'WEEKDAYS' | 'ESTIMATED'
  /**
   * How public holidays were treated. PAID: counted as paid days. NOT_PAID:
   * taken out of the paid days. NOT_ASKED: nobody passed a holiday answer,
   * so they were counted. NOT_KNOWN: holidays are not paid but there was no
   * first bench day to place them on, so they could not be taken out.
   */
  holidays: 'PAID' | 'NOT_PAID' | 'NOT_ASKED' | 'NOT_KNOWN'
  /** Weekday holidays on the calendar inside the paid span. */
  holidaysOnBench: number
  says: string
}

/**
 * Working days in a calendar span with no dates to count from: five in
 * seven, rounded.
 *
 * Only the fallback since 2026-10-03. It was the rule, and a bench tester
 * found it beside `burnOf`, which counts the real weekdays: the same
 * person's bench read one number of days on the burn and another on bench
 * profit, and a 60-day spell is 42, 43 or 44 weekdays depending on the day
 * it starts, never "about 43". Where the first day is known the real count
 * is used; where it is not, `counted: 'ESTIMATED'` says so.
 *
 * Holidays cannot be taken out here, because five in seven has no dates
 * to put them on. Where the first day is known, `benchDays` takes them
 * out or leaves them in by the firm's holiday setting (`holidayPayFor`).
 */
function workingDays(calendarDays: number): number {
  return Math.round(Math.max(0, calendarDays) * (5 / 7))
}

export function benchCost(p: Policy, f: BenchFacts): BenchCost {
  const idle = Math.max(0, f.idleDays)
  const since = f.since ?? null
  const hp = f.holidayPay ?? null
  const housing = Math.round(idle * (f.housingPerDayCents ?? 0))
  const reserve = Math.max(0, f.reserveCents ?? 0)

  const dueForRelease = p.carryDays != null && idle > p.carryDays
  const daysLeft = p.carryDays == null ? null : Math.max(0, p.carryDays - idle)

  // Where a firm carries somebody for a fixed window, it stops paying at
  // the end of it. Charging for the whole idle period would show a cost
  // the firm never actually incurred.
  const paidSpan = p.carryDays == null ? idle : Math.min(idle, p.carryDays)

  // One count for the bench, the same `benchDays` the burn uses, so a
  // holiday is either paid on both pages or on neither.
  const counted = since ? benchDays(since, dayAfter(since, paidSpan), hp) : null
  const paidDays = counted
    ? counted.paidDays
    : p.carryDays == null
      ? workingDays(idle)
      : Math.min(workingDays(idle), workingDays(p.carryDays))

  let payCents = 0
  switch (p.policy) {
    case 'NO_PAY':
      payCents = 0
      break
    case 'FULL_PAY':
      payCents = Math.round(paidDays * f.billingDayRateCents)
      break
    case 'REDUCED_RATE':
      payCents = Math.round(
        paidDays * f.billingDayRateCents * ((p.benchRateBps ?? 0) / 10_000)
      )
      break
    case 'RESERVE_FUNDED':
      // Their own pot pays for it, up to whatever is in it. Beyond that
      // the firm is not obliged to keep paying, and pretending otherwise
      // would overstate the cost of a policy chosen precisely to cap it.
      payCents = Math.min(reserve, Math.round(paidDays * f.billingDayRateCents))
      break
  }

  const fromReserve = p.policy === 'RESERVE_FUNDED' ? Math.min(reserve, payCents) : 0
  const fromFirm = payCents - fromReserve + housing

  const holidays: BenchCost['holidays'] =
    hp == null ? 'NOT_ASKED' : hp.paid ? 'PAID' : counted ? 'NOT_PAID' : 'NOT_KNOWN'
  const holidaysOnBench = counted?.holidays ?? 0
  const base = saysFor(p, idle, payCents, housing, fromReserve, dueForRelease, daysLeft)
  const holidayClause =
    p.policy === 'NO_PAY' || idle === 0
      ? ''
      : holidays === 'NOT_PAID' && holidaysOnBench > 0
        ? ` ${holidaysOnBench} public holiday${holidaysOnBench === 1 ? '' : 's'} not paid.`
        : holidays === 'NOT_KNOWN'
          ? ' Holidays are not paid, but without the first bench day they could not be taken out, so they are counted.'
          : ''

  return {
    costCents: payCents + housing,
    fromReserveCents: fromReserve,
    fromFirmCents: fromFirm,
    reserveLeftCents: Math.max(0, reserve - fromReserve),
    dueForRelease,
    daysLeft,
    paidWorkingDays: p.policy === 'NO_PAY' ? 0 : paidDays,
    counted: since ? 'WEEKDAYS' : 'ESTIMATED',
    holidays,
    holidaysOnBench,
    says: base + holidayClause,
  }
}

const dayAfter = (since: Date, calendarDays: number) =>
  new Date(since.getTime() + Math.max(0, calendarDays) * 86_400_000)

function saysFor(
  p: Policy,
  idle: number,
  pay: number,
  housing: number,
  fromReserve: number,
  due: boolean,
  daysLeft: number | null
): string {
  if (idle === 0) return 'Not on the bench.'

  const head =
    p.policy === 'NO_PAY'
      ? `${idle} days on the bench. Nothing paid — this costs you the time to place them again.`
      : fromReserve > 0
        ? `${idle} days on the bench, ${money(fromReserve)} of it from their own reserve.`
        : `${idle} days on the bench, ${money(pay)} paid.`

  const withHousing = housing > 0 ? `${head} ${money(housing)} of housing on top.` : head

  if (due) {
    return `${withHousing} Past the carry limit — they are due to be released or placed.`
  }
  if (daysLeft != null && daysLeft <= 14) {
    return `${withHousing} ${daysLeft} days left on the carry limit.`
  }
  return withHousing
}

// ── The reserve ───────────────────────────────────────────────────────

/**
 * What is held back from a share this period.
 *
 * Only where the firm funds its bench that way. Zero everywhere else, so
 * a consultant on a different policy never sees a deduction they were not
 * told about.
 */
export function holdBack(p: Policy, shareCents: number): number {
  if (p.policy !== 'RESERVE_FUNDED') return 0
  return Math.round(Math.max(0, shareCents) * ((p.reserveBps ?? 0) / 10_000))
}

export type LeaveReason = 'PROJECT_ENDED' | 'RELEASED' | 'RESIGNED' | 'DISMISSED'

export interface ExitOutcome {
  payOutCents: number
  keptByFirmCents: number
  says: string
}

/**
 * What happens to an unspent reserve when somebody leaves.
 *
 * Three firms answer this three ways and all three exist, so it is a
 * setting. Where it turns on how somebody left, the reason has to be on
 * the record already — deciding it at the moment of payout is how the
 * reason becomes whatever is cheapest.
 */
export function onExit(
  p: Policy,
  reserveCents: number,
  reason: LeaveReason
): ExitOutcome {
  const pot = Math.max(0, reserveCents)
  if (pot === 0) {
    return { payOutCents: 0, keptByFirmCents: 0, says: 'Nothing in their reserve.' }
  }

  const rule = p.reserveOnExit ?? 'PAY_OUT'

  if (rule === 'PAY_OUT') {
    return {
      payOutCents: pot,
      keptByFirmCents: 0,
      says: `${money(pot)} in their reserve, paid out. It was their money held back.`,
    }
  }

  if (rule === 'COMPANY_KEEPS') {
    return {
      payOutCents: 0,
      keptByFirmCents: pot,
      says:
        `${money(pot)} in their reserve, kept. Your terms treat it as a ` +
        `contribution to the bench fund rather than deferred pay.`,
    }
  }

  // DEPENDS_ON_REASON
  const theirs = reason === 'PROJECT_ENDED' || reason === 'RELEASED'
  return theirs
    ? {
        payOutCents: pot,
        keptByFirmCents: 0,
        says: `${money(pot)} paid out — the assignment ended rather than them walking.`,
      }
    : {
        payOutCents: 0,
        keptByFirmCents: pot,
        says:
          `${money(pot)} kept — they left mid-contract, and your terms forfeit ` +
          `the reserve in that case. Expect to be asked to show the reason.`,
      }
}

function money(cents: number): string {
  const n = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ═════════════════════════════════════════════════════════════════════
// THE RESERVE AS A LEDGER, NOT A SETTING
// ═════════════════════════════════════════════════════════════════════
//
// `holdBack` above says what a policy WOULD hold from a share. That is
// arithmetic and it was all this file had — which meant a firm could
// configure a reserve-funded bench, run payroll for a year, and have no
// record anywhere of what was in anybody's pot. A setting with nothing
// writing to it is not a feature.
//
// So the reserve is a running balance made of postings, one per movement,
// and the balance is the sum of them. Nothing is stored as a total: a
// stored total and a list of movements disagree eventually, and when they
// do, the one somebody argues with is the consultant's.
//
// ── The sign, once, so nothing has to guess ──────────────────────────
//
// A RESERVE posting is POSITIVE when money goes INTO the consultant's pot
// and NEGATIVE when it comes out. That matches the journal in `gl.ts`,
// where a positive reserve posting credits account 2300 — a liability,
// because it is their money sitting on our balance sheet.
//
// Reserve movements are deliberately outside gross and net margin in
// `order.ts`. Holding somebody's own money back is not a cost of the
// work; it is a movement between two of our own obligations.

export type ReserveMovementKind =
  /** Held back from a share while they were billing. */
  | 'HOLD'
  /** Drawn out to pay them while they sat on the bench. */
  | 'DRAW'
  /** Paid out on exit, because the pot was theirs. */
  | 'PAY_OUT'
  /** Kept by the firm on exit, under terms that say so. */
  | 'FORFEIT'

export interface ReserveMovement {
  kind: ReserveMovementKind
  /** Signed cents. Positive into the pot, negative out of it. */
  amountCents: number
  at: Date
  says: string
}

export interface ReserveBalance {
  balanceCents: number
  heldCents: number
  drawnCents: number
  paidOutCents: number
  forfeitedCents: number
  movements: number
  /**
   * True where the movements add to less than nothing.
   *
   * Never expected and never silently corrected. A negative pot means
   * more was drawn than was ever held, which is either a double-drawn
   * bench week or a hold that was reversed after it was spent — both of
   * which are somebody's real money and neither of which should be
   * rounded away to zero on a screen.
   */
  overdrawn: boolean
  says: string
}

/** What is in one consultant's pot, from the movements alone. */
export function reserveBalance(movements: ReserveMovement[]): ReserveBalance {
  const sum = (k: ReserveMovementKind) =>
    movements.filter((m) => m.kind === k).reduce((n, m) => n + Math.abs(m.amountCents), 0)

  const balance = movements.reduce((n, m) => n + m.amountCents, 0)
  const held = sum('HOLD')
  const drawn = sum('DRAW')
  const paidOut = sum('PAY_OUT')
  const forfeited = sum('FORFEIT')

  return {
    balanceCents: balance,
    heldCents: held,
    drawnCents: drawn,
    paidOutCents: paidOut,
    forfeitedCents: forfeited,
    movements: movements.length,
    overdrawn: balance < 0,
    says:
      movements.length === 0
        ? 'Nothing has ever been held back for them.'
        : balance < 0
          ? `The pot is ${money(balance)} — more has come out than ever went in. That is a ` +
            `double-drawn bench week or a reversed hold that had already been spent, and it ` +
            `is somebody’s real money, so it is shown rather than floored at zero.`
          : `${money(balance)} in their pot: ${money(held)} held back while billing, ` +
            `${money(drawn)} drawn while on the bench` +
            (paidOut > 0 ? `, ${money(paidOut)} paid out` : '') +
            (forfeited > 0 ? `, ${money(forfeited)} kept by the firm` : '') +
            `.`,
  }
}

export interface ReservePosting {
  kind: ReserveMovementKind
  /** Signed cents, ready to post. Positive into the pot. */
  amountCents: number
  says: string
}

/**
 * The hold-back posting for one period's share, or nothing.
 *
 * Returns null rather than a zero posting on every other policy, so that
 * a consultant on NO_PAY never accumulates a row saying nothing happened.
 * An empty ledger and a ledger full of zeroes read very differently to
 * somebody trying to work out whether the feature is switched on.
 */
export function holdBackPosting(p: Policy, shareCents: number): ReservePosting | null {
  const held = holdBack(p, shareCents)
  if (held <= 0) return null
  return {
    kind: 'HOLD',
    amountCents: held,
    says:
      `${money(held)} of a ${money(shareCents)} share held back into their own bench ` +
      `reserve — ${((p.reserveBps ?? 0) / 100).toFixed(2)}% under your reserve-funded ` +
      `bench policy. It is their money, held: it shows as owed to them, not as ours.`,
  }
}

export interface Draw {
  posting: ReservePosting | null
  /** What the pot could not cover. */
  shortfallCents: number
  says: string
}

/**
 * Taking a bench week out of the pot.
 *
 * Draws only as far as the pot goes. A firm that chose a reserve-funded
 * bench chose it precisely to cap what it carries, and drawing past zero
 * would quietly turn that policy into FULL_PAY — the shortfall is
 * reported instead, because it is the moment somebody has to decide
 * whether to carry the person out of the firm's own money.
 */
export function drawFromReserve(balanceCents: number, neededCents: number, over: string): Draw {
  const pot = Math.max(0, balanceCents)
  const need = Math.max(0, Math.round(neededCents))
  const draw = Math.min(pot, need)
  const short = need - draw

  return {
    posting:
      draw > 0
        ? {
            kind: 'DRAW',
            amountCents: -draw,
            says: `${money(draw)} drawn from their bench reserve for ${over}.`,
          }
        : null,
    shortfallCents: short,
    says:
      short === 0
        ? `${money(draw)} out of the pot covers ${over}. ${money(pot - draw)} left in it.`
        : draw === 0
          ? `Their pot is empty. ${money(short)} for ${over} is not funded — carrying them ` +
            `further is the firm’s own money and its own decision.`
          : `${money(draw)} was all the pot had. ${money(short)} of ${over} is unfunded — ` +
            `beyond this the firm is carrying them out of its own money, which is the ` +
            `decision a reserve-funded bench exists to surface.`,
  }
}

export interface ExitSettlement {
  posting: ReservePosting | null
  payOutCents: number
  keptByFirmCents: number
  reason: LeaveReason
  says: string
}

/**
 * Emptying the pot when somebody leaves, as a posting rather than a note.
 *
 * `onExit` above decides what happens. This turns the decision into the
 * movement, and carries the leaving reason in the sentence — because
 * where the outcome depends on how somebody left, a reason recorded
 * afterwards becomes whatever is cheapest.
 */
export function exitPosting(
  p: Policy,
  balanceCents: number,
  reason: LeaveReason
): ExitSettlement {
  const outcome = onExit(p, balanceCents, reason)
  const pot = Math.max(0, balanceCents)

  if (pot === 0) {
    return {
      posting: null,
      payOutCents: 0,
      keptByFirmCents: 0,
      reason,
      says: 'Nothing in their reserve, so nothing moves.',
    }
  }

  const paidOut = outcome.payOutCents > 0

  return {
    posting: {
      kind: paidOut ? 'PAY_OUT' : 'FORFEIT',
      amountCents: -pot,
      says: `${outcome.says} Left as ${LEAVE_WORDS[reason]}.`,
    },
    payOutCents: outcome.payOutCents,
    keptByFirmCents: outcome.keptByFirmCents,
    reason,
    says: `${outcome.says} Left as ${LEAVE_WORDS[reason]}.`,
  }
}

const LEAVE_WORDS: Record<LeaveReason, string> = {
  PROJECT_ENDED: 'the assignment ending',
  RELEASED: 'released by the firm',
  RESIGNED: 'a resignation',
  DISMISSED: 'a dismissal',
}

// ── What a person on the bench costs to date ─────────────────────────

/**
 * One person the bench page might count, as the arithmetic needs them.
 *
 * Found 2026-09-30 by a tester as Techpeple: the bench burn counted every
 * listed person with a live pay line, so Helena Marsh — placed at
 * Northbend and billing through March 2027 — read "$720/day · 129d on
 * bench · $66.2k burned", doubling the daily burn. And the 129 was
 * calendar days while the $66,240 was 92 working days at $720, with
 * nothing on the page saying which.
 */
export interface BenchSitter {
  /** Their pay per hour on the line that pays them, in minor units. */
  payRateCents: number
  hoursPerDay?: number
  /** True where a live sell line bills their hours today. Then they are not bench. */
  billing: boolean
  /** The later of when they joined the bench and when their last placement ended. */
  benchSince: Date
  /** Whether holidays are paid for them, and the firm's calendar. Absent, holidays are paid days. */
  holidayPay?: HolidayPay | null
  /** The firm's days off, from lib/days-off. Absent, `holidayPay.daysOff`, then Saturday and Sunday. */
  daysOff?: readonly number[] | null
}

export interface Burn {
  onBench: boolean
  /** Null where they are billing: a placed person costs the bench nothing. */
  dailyCents: number | null
  /**
   * The firm's working days from the day after `benchSince` through `now`, the days
   * the daily cost is paid on — less the public holidays, where the firm
   * does not pay this person for them.
   */
  workingDays: number
  /** Weekday holidays on the firm's calendar that were not paid. */
  holidaysNotPaid: number
  calendarDays: number
  toDateCents: number | null
  /** "92 working days (129 calendar days) at $720.00 a day." */
  says: string
}

const DAY_MS = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * The firm's working days strictly after `from`, up to and including `to`.
 * `daysOff` is the firm's week from lib/days-off; omitted, Saturday and Sunday.
 */
export function workingDaysBetween(from: Date, to: Date, daysOff: readonly number[] = DEFAULT_DAYS_OFF): number {
  const off = cleanDaysOff(daysOff) ?? DEFAULT_DAYS_OFF
  let n = 0
  for (let t = utcDay(from) + DAY_MS; t <= utcDay(to); t += DAY_MS) {
    if (!off.includes(new Date(t).getUTCDay())) n++
  }
  return n
}

/**
 * What one person costs the bench, to date and per day, in integer
 * minor units — and nothing at all while somebody bills their hours.
 * The days are named as working days, with the calendar count beside
 * them, so a reader can check the figure with one multiplication.
 */
export function burnOf(s: BenchSitter, now: Date, currency = 'USD'): Burn {
  const calendarDays = Math.max(0, Math.round((utcDay(now) - utcDay(s.benchSince)) / DAY_MS))
  if (s.billing) {
    return {
      onBench: false, dailyCents: null, workingDays: 0, holidaysNotPaid: 0, calendarDays: 0, toDateCents: null,
      says: 'Placed and billing, so not a bench cost.',
    }
  }
  const days = benchDays(s.benchSince, now, s.holidayPay, s.daysOff)
  const workingDays = days.paidDays
  const holidaysNotPaid = days.weekdays - days.paidDays
  const dailyCents = Math.round(s.payRateCents * (s.hoursPerDay ?? 8))
  const toDateCents = dailyCents * workingDays
  const calendar = `${calendarDays} calendar day${calendarDays === 1 ? '' : 's'}`
  const off = holidaysNotPaid > 0
    ? `, ${holidaysNotPaid} public holiday${holidaysNotPaid === 1 ? '' : 's'} not paid`
    : ''
  return {
    onBench: true,
    dailyCents,
    workingDays,
    holidaysNotPaid,
    calendarDays,
    toDateCents,
    says: `${workingDays} working day${workingDays === 1 ? '' : 's'} (${calendar}${off}) at ${amount(dailyCents, currency)} a day.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// HOLIDAYS ON THE BENCH — a company setting, off by default
// ═════════════════════════════════════════════════════════════════════
//
// The founder, 2026-10-03: "A company setting, defaulting to no-pay, and
// each candidate needs to be activated. GSI companies do autopay."
//
//   · A firm does not pay a public holiday on the bench unless it turned
//     holiday pay on, and then only for the people it switched on, one by
//     one. A bench supplier's trainee is not paid for a holiday because
//     the firm said yes for somebody else.
//   · An integrator (GSI) is the exception: its bench is its own salaried
//     employees between projects, so holiday pay is on for the firm and
//     for every one of them unless somebody switches a person off.
//   · Who turned a switch on or off, and when, is the record — the latest
//     switch is the answer, and the earlier ones are its history.
//
// Bench cost, bench burn and bench profit all count through `benchDays`
// with `holidayPayFor`'s answer, never through a rule of their own.

/** What `benchDays` needs: whether holidays are paid for this person, and the calendar. */
export interface HolidayPay {
  /** `holidayPayFor(...).paid`. */
  paid: boolean
  /**
   * The firm's holidays as ISO days ("2026-11-26"), already filtered by
   * `appliesTo` for where the person is — `loadCompanyHolidays` in
   * lib/holidays gives exactly this.
   */
  calendar: ReadonlySet<string>
  /**
   * The firm's days off, from `daysOffFor` in lib/days-off. Absent,
   * Saturday and Sunday. Decided 2026-10-06: a bench day is a day the
   * firm works, whichever days those are.
   */
  daysOff?: readonly number[]
}

export interface BenchDays {
  /** The firm's working days strictly after `from`, through `to`. */
  weekdays: number
  /** Of those, the days on the firm's holiday calendar. */
  holidays: number
  /** The days the bench is paid on: every weekday, less the holidays where they are not paid. */
  paidDays: number
}

/**
 * The days a person on the bench is paid for, the one count every bench
 * figure uses. A holiday on a weekend is not a weekday and is not
 * counted twice; the calendar carries the observed day where there is one.
 * With no holiday answer, holidays are paid days — what the count was
 * before the setting existed — and the caller says so.
 */
export function benchDays(
  from: Date,
  to: Date,
  h?: HolidayPay | null,
  daysOff?: readonly number[] | null
): BenchDays {
  const off = cleanDaysOff(daysOff ?? h?.daysOff) ?? DEFAULT_DAYS_OFF
  let weekdays = 0
  let holidays = 0
  for (let t = utcDay(from) + DAY_MS; t <= utcDay(to); t += DAY_MS) {
    const d = new Date(t)
    if (off.includes(d.getUTCDay())) continue
    weekdays++
    if (h && h.calendar.has(d.toISOString().slice(0, 10))) holidays++
  }
  return { weekdays, holidays, paidDays: h && !h.paid ? weekdays - holidays : weekdays }
}

/** One turn of a switch: the firm's setting (no person) or one person's. */
export interface HolidaySwitch {
  paid: boolean
  /** Who turned it, as a reader knows them. Null where the record has no name. */
  byName: string | null
  at: Date
}

/**
 * The switch in force, from every turn of it. The latest wins and the
 * rest are its history; nothing stores a current value beside the turns,
 * because a stored state and its history disagree eventually.
 */
export function latestSwitch(turns: readonly HolidaySwitch[]): HolidaySwitch | null {
  let best: HolidaySwitch | null = null
  for (const t of turns) if (!best || t.at.getTime() >= best.at.getTime()) best = t
  return best
}

export type HolidayPaySource =
  /** The firm does not pay holidays on the bench — by default, or turned off. */
  | 'FIRM_OFF'
  /** The firm pays holidays, and this person was switched on. */
  | 'PERSON_ON'
  /** The firm pays holidays, and nobody has switched this person on. */
  | 'NOT_SWITCHED_ON'
  /** An integrator: on for everybody without anybody switching them on. */
  | 'INTEGRATOR_DEFAULT'
  /** Switched off for this person, by name. */
  | 'PERSON_OFF'

export interface HolidayPayAnswer {
  /** Whether this person is paid for a public holiday on the bench. */
  paid: boolean
  /** Whether the firm pays bench holidays at all. */
  firmPays: boolean
  source: HolidayPaySource
  /** "Paid for holidays: switched on by Rahul, Oct 3". */
  says: string
  /** The firm's setting, said alone: "Holidays not paid (off for this firm)". */
  firmSays: string
}

const shortDay = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const by = (s: HolidaySwitch) => (s.byName ? `by ${s.byName}, ${shortDay(s.at)}` : shortDay(s.at))

/**
 * Whether one person on a firm's bench is paid for a public holiday.
 *
 * `firm` is the latest turn of the firm's own setting and `person` the
 * latest turn of this person's switch, each null where nobody has ever
 * turned it. An integrator defaults on, for the firm and for each person;
 * every other kind of firm defaults off for both. A person's switch never
 * pays a holiday the firm itself does not pay.
 */
export function holidayPayFor(input: {
  companyKind: string
  firm: HolidaySwitch | null
  person: HolidaySwitch | null
}): HolidayPayAnswer {
  const integrator = input.companyKind === 'GSI'
  const firmPays = input.firm ? input.firm.paid : integrator
  const firmSays = !firmPays
    ? input.firm
      ? `Holidays not paid (turned off for this firm ${by(input.firm)})`
      : 'Holidays not paid (off for this firm)'
    : input.firm
      ? `Holidays paid on the bench (turned on for this firm ${by(input.firm)})`
      : 'Holidays paid on the bench (on for an integrator’s own people)'

  if (!firmPays) {
    return { paid: false, firmPays, source: 'FIRM_OFF', says: firmSays, firmSays }
  }

  const p = input.person
  if (p && !p.paid) {
    return { paid: false, firmPays, source: 'PERSON_OFF', says: `Holidays not paid: switched off ${by(p)}`, firmSays }
  }
  if (p && p.paid) {
    return { paid: true, firmPays, source: 'PERSON_ON', says: `Paid for holidays: switched on ${by(p)}`, firmSays }
  }
  return integrator
    ? { paid: true, firmPays, source: 'INTEGRATOR_DEFAULT', says: 'Paid for holidays: on for everybody here', firmSays }
    : {
        paid: false,
        firmPays,
        source: 'NOT_SWITCHED_ON',
        says: 'Holidays not paid: holiday pay is on for this firm, and nobody has switched it on for them',
        firmSays,
      }
}
