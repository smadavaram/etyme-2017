/**
 * A week over the line is worth more than a week under it — but only
 * once somebody says so.
 *
 * ── Why a week, and not a timesheet ──────────────────────────────────
 *
 * Overtime is a weekly fact. Forty-five hours in one week is five hours
 * of overtime; forty-five hours spread over two weeks is none. A
 * timesheet in this product is usually a week, so "per timesheet" looks
 * equivalent — right up to the semi-monthly client, where a period
 * holds two and a bit weeks and the same arithmetic quietly pays
 * overtime on hours nobody worked overtime for.
 *
 * So this reads the daily hours a timesheet already carries and groups
 * them into real weeks. A period that straddles a week boundary is
 * split at the boundary, not at the period edge, and each week is
 * judged on its own.
 *
 * ── Why a threshold is not a price ───────────────────────────────────
 *
 * This file used to multiply the rate the moment the hours passed the
 * line: a 45-hour week at $100 with a 40-hour threshold billed $4,750,
 * and the $750 was nobody's decision. A multiplier sitting on a
 * contract says what an overtime hour *could* be worth. It does not say
 * what this week's overtime is worth, because three answers are
 * ordinary and none of them is a default:
 *
 *   SAME_RATE  the hours were worked and are paid like any other.
 *   PREMIUM    worth the multiplier the approver chose, this week.
 *   TIME_OFF   not billed at all; banked, and taken as paid leave later.
 *
 * So hours over the threshold are **pending** until a decision exists.
 * Pending hours are not regular hours and they are not overtime hours:
 * they are their own number, excluded from the valuation, so that
 * nothing downstream can print forty-five billed hours with forty hours
 * of money against them.
 *
 * And the price comes from the decision's own `appliedBps`, never from
 * the contract. Amending a contract's terms in March must not restate
 * an invoice sent in February.
 *
 * ── Where the week starts ────────────────────────────────────────────
 *
 * Monday. The Fair Labor Standards Act lets an employer pick any fixed
 * seven-day workweek and most US staffing runs Monday to Sunday, which
 * is also what the cycle engine already assumes for a weekly period.
 *
 * ── Leave never makes overtime ───────────────────────────────────────
 *
 * Paid leave drawn from the bank sits on the sheet as hours, because
 * the consultant is paid for them. It does not count toward the weekly
 * threshold. If it did, banking five hours would buy a week of leave
 * that pushed another week over the line, which would bank more leave —
 * a loop that pays for itself out of the client's money. `leaveDays`
 * is per day for exactly this reason: a sheet total cannot say which
 * week the leave fell in.
 *
 * ── Straight time is the default ─────────────────────────────────────
 *
 * `afterHours: null` means no overtime, and it is what a contract gets
 * unless somebody says otherwise. Most corp-to-corp work is straight
 * time, and a rate that multiplies itself because nobody filled in a
 * field is the kind of error that reaches an invoice before anybody
 * notices.
 */

export interface OvertimePolicy {
  /** Hours in a week past which overtime applies. Null is straight time. */
  afterHours: number | null
  /** Basis points of the rate an overtime hour *could* be worth. 15000 is time and a half. */
  multiplierBps: number
}

export const STRAIGHT_TIME: OvertimePolicy = { afterHours: null, multiplierBps: 15_000 }

/** What a client chose to do with the hours over the line, for one week. */
export type Treatment = 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF'

export const TREATMENTS: Treatment[] = ['SAME_RATE', 'PREMIUM', 'TIME_OFF']

export function isTreatment(x: unknown): x is Treatment {
  return typeof x === 'string' && (TREATMENTS as string[]).includes(x)
}

/**
 * A decision as the split needs to read it.
 *
 * Deliberately not the Prisma row: this file has no database in it, and
 * a caller with a row hands over the four fields that matter.
 */
export interface Decision {
  /** The Monday the week began — `weekStart()`, the same function the split uses. */
  weekOf: string
  treatment: Treatment
  /** What was actually applied. 10000 flat, the approver's choice, or 0 for time off. */
  appliedBps: number
  /** Hours over the line when somebody decided. A different number now means the sheet was amended. */
  overtimeHours: number
  /** Hours banked per overtime hour. Read only when TIME_OFF. */
  accrualBps?: number
}

export interface WeekLine {
  weekOf: string
  /** Everything on the sheet for this week — worked and leave together. */
  hours: number
  /** Hours actually worked. Only these are judged against the threshold. */
  workedHours: number
  /** Paid leave drawn from the bank. Billed flat, never overtime. */
  leaveHours: number
  /** Worked hours at or under the threshold. */
  regularHours: number
  /** Worked hours over the threshold, whatever anybody has decided about them. */
  overHours: number
  /** Of those: the ones a decision prices. */
  overtimeHours: number
  /** Of those: the ones banked as time off instead of billed. */
  bankedHours: number
  /** Of those: the ones nobody has decided yet. Not billable, not regular. */
  pendingHours: number
  treatment: Treatment | null
  /** The rate multiplier the decision applied. Null where nobody has decided. */
  appliedBps: number | null
  /** A decision exists, and the week no longer has the hours it was made about. */
  stale: boolean
}

export interface Split {
  /** Worked hours at or under the threshold. */
  regularHours: number
  /** Paid leave drawn from the bank, billed flat. */
  leaveHours: number
  /** Decided, billable overtime. Zero until somebody decides. */
  overtimeHours: number
  /** Over the line and undecided. Excluded from every figure below. */
  pendingHours: number
  /** Decided as time off — billed by nobody, owed to the consultant. */
  bankedHours: number
  weeks: WeekLine[]
}

export interface SplitOptions {
  /** One per week, from `OvertimeDecision`. Absent means nobody has decided. */
  decisions?: Decision[]
  /** ISO date → hours of paid leave. The sheet's `leaveDays`, a subset of `days`. */
  leaveDays?: Record<string, number>
}

/** Hours are Decimal(7,2) in the database; keep the arithmetic there too. */
const round2 = (n: number): number => Math.round(n * 100) / 100

/** The Monday on or before this day. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  // getUTCDay: 0 Sunday … 6 Saturday. Monday is the start, so Sunday
  // belongs to the week that began six days earlier.
  const back = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

/** Sum a day map into weeks, ignoring blanks and anything that is not a number. */
function byWeek(days: Record<string, number> | null | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const [day, hours] of Object.entries(days ?? {})) {
    const n = Number(hours)
    if (!Number.isFinite(n) || n <= 0) continue
    const week = weekStart(day)
    out.set(week, round2((out.get(week) ?? 0) + n))
  }
  return out
}

/**
 * Split a timesheet's daily hours into regular, leave, overtime and
 * hours still waiting on somebody.
 *
 * `days` is the map the timesheet already stores: ISO date → hours.
 * No rate goes in here. What a week is worth is `valueOf`'s job, and
 * splitting hours into weeks needs no money to do it.
 */
export function splitWeeks(
  days: Record<string, number>,
  policy: OvertimePolicy,
  opts: SplitOptions = {}
): Split {
  const worked = byWeek(days)
  const leave = byWeek(opts.leaveDays)
  const decisions = new Map((opts.decisions ?? []).map((d) => [d.weekOf, d]))

  const all = [...new Set([...worked.keys(), ...leave.keys()])].sort((a, b) => a.localeCompare(b))

  const weeks: WeekLine[] = all.map((weekOf) => {
    const hours = round2(worked.get(weekOf) ?? 0)
    const leaveHours = Math.min(round2(leave.get(weekOf) ?? 0), hours)
    // Leave sits inside the sheet's hours and is paid, but it was not
    // worked — so the threshold never sees it.
    const workedHours = round2(hours - leaveHours)
    const overHours =
      policy.afterHours == null ? 0 : round2(Math.max(0, workedHours - policy.afterHours))
    const regularHours = round2(workedHours - overHours)

    const d = decisions.get(weekOf)
    const stale = !!d && overHours > 0 && round2(d.overtimeHours) !== overHours
    const live = d && !stale && overHours > 0 ? d : null

    return {
      weekOf,
      hours,
      workedHours,
      leaveHours,
      regularHours,
      overHours,
      overtimeHours: live && live.treatment !== 'TIME_OFF' ? overHours : 0,
      bankedHours: live && live.treatment === 'TIME_OFF' ? overHours : 0,
      pendingHours: live ? 0 : overHours,
      treatment: live ? live.treatment : null,
      appliedBps: live ? live.appliedBps : null,
      stale,
    }
  })

  const sum = (pick: (w: WeekLine) => number) => round2(weeks.reduce((n, w) => n + pick(w), 0))

  return {
    regularHours: sum((w) => w.regularHours),
    leaveHours: sum((w) => w.leaveHours),
    overtimeHours: sum((w) => w.overtimeHours),
    pendingHours: sum((w) => w.pendingHours),
    bankedHours: sum((w) => w.bankedHours),
    weeks,
  }
}

export interface Valuation {
  /** Worked hours at or under the threshold. */
  regularCents: number
  /** Paid leave, at the plain rate. */
  leaveCents: number
  /** Decided overtime, at the multiplier each week's approver applied. */
  overtimeCents: number
  /** regular + leave + overtime. Never includes a pending hour. */
  totalCents: number
  /** Hours excluded because nobody has decided them. Say so; never bill them. */
  pendingHours: number
}

/**
 * What a split is worth at a rate, in cents.
 *
 * Priced week by week from each decision's own `appliedBps` — never
 * from `policy.multiplierBps`, which is what makes amending a contract
 * unable to restate an invoice already sent.
 *
 * Rounded once per band rather than per day: rounding forty times and
 * adding it up is how a line disagrees with the invoice it is on by a
 * few cents, which nobody can explain and everybody has to reconcile.
 */
export function valueOf(split: Split, rateCents: number): Valuation {
  const regularCents = Math.round(split.regularHours * rateCents)
  const leaveCents = Math.round(split.leaveHours * rateCents)
  const overtimeCents = split.weeks.reduce(
    (n, w) => n + Math.round(w.overtimeHours * rateCents * ((w.appliedBps ?? 0) / 10_000)),
    0
  )
  return {
    regularCents,
    leaveCents,
    overtimeCents,
    totalCents: regularCents + leaveCents + overtimeCents,
    pendingHours: split.pendingHours,
  }
}

/**
 * The whole job in one call: hours in, money out.
 *
 * Every place that turns a timesheet into money goes through this, so
 * an invoice, a budget and a three-way match cannot disagree about what
 * a week was worth.
 */
export function valueOfWeek(
  days: Record<string, number>,
  rateCents: number,
  policy: OvertimePolicy,
  opts: SplitOptions = {}
): Valuation & { split: Split } {
  const split = splitWeeks(days, policy, opts)
  return { split, ...valueOf(split, rateCents) }
}

/**
 * The hours a caller may put on an invoice.
 *
 * Regular, leave and decided overtime. A pending hour is not here, and
 * that is the point: a caller cannot accidentally bill a week nobody
 * has decided, and a caller that wants to know how many hours it left
 * behind reads `pendingHours` and says so on the screen.
 */
export function billableHours(split: Split): number {
  return round2(split.regularHours + split.leaveHours + split.overtimeHours)
}

/** The policy a contract or requirement carries, read safely. */
export function policyOf(row: {
  overtimeAfterHours?: number | null
  overtimeMultiplierBps?: number | null
} | null | undefined): OvertimePolicy {
  return {
    afterHours: row?.overtimeAfterHours ?? null,
    multiplierBps: row?.overtimeMultiplierBps ?? 15_000,
  }
}

// ── Who may decide, and what they may decide ───────────────────────────

export interface Verdict {
  ok: boolean
  says: string
}

export interface Leg {
  /** The consultant whose hours these are. */
  personId: string
  /** The company that employs and pays them on this leg. */
  employerCompanyId: string
  /** The company that is billed for them. */
  clientCompanyId: string
  endClientCompanyId?: string | null
  clientName?: string | null
  employerName?: string | null
}

/**
 * Whether this caller may say what happens to this week's overtime.
 *
 * Two refusals, both in sentences:
 *
 * **Their own hours.** Somebody deciding that their own week is worth
 * time and a half has awarded themselves a raise, which is why a
 * timesheet has two signatures in the first place.
 *
 * **Somebody else's leg.** A decision belongs to a contract, and a
 * contract has two parties. A sub-vendor reading the client's answer
 * would be pricing its work off an agreement it is not on — the same
 * error the rate bands exist to prevent one rung up. Each leg decides
 * its own, and the sub's answer may honestly differ from the client's.
 */
export function mayDecide(
  caller: { personId: string; companyId?: string | null },
  leg: Leg
): Verdict {
  if (caller.personId === leg.personId) {
    return { ok: false, says: 'Nobody decides overtime on hours they worked themselves.' }
  }

  const parties = [leg.employerCompanyId, leg.clientCompanyId, leg.endClientCompanyId].filter(
    Boolean
  ) as string[]

  if (!caller.companyId || !parties.includes(caller.companyId)) {
    const client = leg.clientName ?? 'the client'
    const employer = leg.employerName ?? 'the supplier'
    return {
      ok: false,
      says:
        `That week is between ${client} and ${employer}. ` +
        'Decide what you pay on your own contract.',
    }
  }

  return { ok: true, says: 'A party to this contract may say what the week is worth.' }
}

export interface Chosen {
  treatment: Treatment
  /** Only read for PREMIUM. Absent means the contract's own multiplier. */
  multiplierBps?: number | null
  reason?: string | null
}

export interface Priced extends Verdict {
  /** What to store. Only meaningful when ok. */
  appliedBps: number
  accrualBps: number
}

/**
 * Turn a choice into the number an invoice will price from.
 *
 * SAME_RATE is 10000 — the plain rate, no premium. TIME_OFF is 0,
 * because nothing is billed now. PREMIUM is whatever the approver
 * chose, which defaults to the contract's multiplier but is not bound
 * by it: a client may agree to double time for one bad week without
 * amending a contract, and may not quietly pay less than the plain rate
 * by calling it a premium.
 *
 * A reason is asked for where the answer costs somebody something they
 * did not sign up for: banking hours instead of paying them, or a
 * multiplier the contract never said.
 */
export function priceChoice(chosen: Chosen, policy: OvertimePolicy): Priced {
  const reason = (chosen.reason ?? '').trim()

  if (chosen.treatment === 'SAME_RATE') {
    return { ok: true, says: 'Paid at the usual rate.', appliedBps: 10_000, accrualBps: 10_000 }
  }

  if (chosen.treatment === 'TIME_OFF') {
    if (!reason) {
      return {
        ok: false,
        says: 'Say why these hours are going into the bank rather than onto the invoice.',
        appliedBps: 0,
        accrualBps: 10_000,
      }
    }
    return { ok: true, says: 'Banked as paid time off.', appliedBps: 0, accrualBps: 10_000 }
  }

  const bps = chosen.multiplierBps == null ? policy.multiplierBps : Math.round(chosen.multiplierBps)

  if (!Number.isFinite(bps) || bps < 10_000) {
    return {
      ok: false,
      says: 'A premium cannot be less than the usual rate. Pay them at the usual rate instead.',
      appliedBps: 10_000,
      accrualBps: 10_000,
    }
  }
  if (bps > 30_000) {
    return {
      ok: false,
      says: 'More than three times the rate is not a premium anybody meant. Check the number.',
      appliedBps: 10_000,
      accrualBps: 10_000,
    }
  }
  if (bps !== policy.multiplierBps && !reason) {
    return {
      ok: false,
      says: `The contract says ${multipleWord(policy.multiplierBps)}. Say why this week is different.`,
      appliedBps: bps,
      accrualBps: 10_000,
    }
  }

  return { ok: true, says: `Paid at ${multipleWord(bps)}.`, appliedBps: bps, accrualBps: 10_000 }
}

/** A decision that has reached an invoice is history, not a setting. */
export function mayChange(prior: { billedAt?: Date | string | null } | null | undefined): Verdict {
  if (prior?.billedAt) {
    return {
      ok: false,
      says:
        'This week has already been invoiced, so what was decided about it cannot change. ' +
        'Put the correction on the next invoice.',
    }
  }
  return { ok: true, says: 'Not billed yet, so it can still be changed.' }
}

// ── What the approver is asked, in their words ─────────────────────────

/** The weeks that stop an approval: over the line, and nobody has said what happens. */
export function weeksAwaitingDecision(split: Split): WeekLine[] {
  return split.weeks.filter((w) => w.pendingHours > 0)
}

const DAY = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

const hrs = (n: number): string => `${round2(n)} ${round2(n) === 1 ? 'hour' : 'hours'}`

function multipleWord(bps: number): string {
  const x = bps / 10_000
  if (x === 1) return 'the usual rate'
  if (x === 1.5) return 'time and a half'
  if (x === 2) return 'double time'
  return `${x}×`
}

/** The word for a choice, on a screen, in the trade's language and not the enum's. */
export function treatmentSays(treatment: Treatment, appliedBps: number): string {
  if (treatment === 'SAME_RATE') return 'Paid at the usual rate'
  if (treatment === 'TIME_OFF') return 'Banked as paid time off'
  return `Paid at ${multipleWord(appliedBps)}`
}

/**
 * Why this sheet cannot be approved yet, said to somebody who has never
 * seen this product and has signed a hundred timesheets.
 *
 * Names the person, the week, the hours and the line they went over —
 * never a code, and never "OVERTIME_UNDECIDED".
 */
export function saysAwaiting(
  weeks: WeekLine[],
  personName: string,
  policy: OvertimePolicy
): string {
  const after = policy.afterHours ?? 40
  if (weeks.length === 0) return 'Nothing is waiting on a decision.'
  if (weeks.length === 1) {
    const w = weeks[0]
    return (
      `${personName} worked ${hrs(w.workedHours)} in the week of ${DAY(w.weekOf)} — ` +
      `${hrs(w.pendingHours)} over the ${after} on this contract. ` +
      `Say what happens to ${w.pendingHours === 1 ? 'that hour' : 'those hours'} before you approve the week.`
    )
  }
  const list = weeks.map((w) => `${DAY(w.weekOf)} (${hrs(w.pendingHours)} over)`).join(' and ')
  return (
    `${weeks.length} weeks on this timesheet went over ${after} hours: ${list}. ` +
    'Overtime is decided a week at a time, so each one is its own answer.'
  )
}

/** What the contract's terms say, for a screen. */
export function says(policy: OvertimePolicy): string {
  if (policy.afterHours == null) return 'Straight time — every hour at the same rate.'
  // Not "is time and a half". Since overtime became a decision, the
  // multiplier is one of three outcomes and only after somebody chooses
  // it, so stating it as a contract term is a claim the product cannot
  // make. The sentence says who decides and what the default offer is.
  return (
    `Over ${policy.afterHours} hours in a week, whoever approves the week decides: ` +
    `the usual rate, a premium (${multipleWord(policy.multiplierBps)} unless they say otherwise), ` +
    'or time off in the bank.'
  )
}
