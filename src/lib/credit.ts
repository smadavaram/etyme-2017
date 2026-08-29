/**
 * How much of this customer we are actually carrying.
 *
 * ── Not a credit score ───────────────────────────────────────────────
 *
 * A score is a bureau's opinion about a company in general. Exposure is
 * a fact about this relationship in particular, and it is the one that
 * decides whether a vendor can meet payroll if a client goes quiet.
 * Nothing here rates anybody. It counts.
 *
 * ── Why unpaid invoices are the smallest part of it ──────────────────
 *
 * Almost every system in this industry reports exposure as "what they
 * owe us", meaning the AR balance, and that number is wrong by a
 * multiple. A client that owes £100,000 and has four contractors on site
 * for another six months is not exposed for £100,000. If they stop
 * paying tomorrow, the vendor is still on the hook for six months of
 * wages against invoices that will never be settled.
 *
 * So exposure has three parts and they are always shown as three:
 *
 *   **Billed and unpaid** — the AR balance. The only part most systems
 *   count, and the part that is already visible.
 *
 *   **Delivered and unbilled** — hours worked, approved by the client,
 *   and not yet on an invoice. Real work with real wages behind it. In a
 *   monthly billing cycle this is routinely a month's revenue sitting
 *   invisible, and on a semi-monthly one with a late timesheet chase it
 *   can be six weeks.
 *
 *   **Committed and not yet worked** — the rest of the assignment. This
 *   is where the industry's real risk lives, because the vendor cannot
 *   simply stop: pulling four contractors off a site to protect a
 *   receivable ends the account, and the consultants are usually on
 *   contracts of their own that keep paying either way.
 *
 * ── Where it refuses to answer ───────────────────────────────────────
 *
 * An assignment with no end date has no countable commitment. It is
 * named and counted separately rather than assumed to run for a year,
 * because a guess dressed as a figure is worse than a gap: nobody audits
 * a number that looks reasonable.
 *
 * Where the work ledger was not read, unbilled is null rather than zero.
 * Zero says "there is none", and that is a claim this file is not
 * entitled to make.
 *
 * ── What happens on a breach ─────────────────────────────────────────
 *
 * This codebase's rule, from Addendum E: **BLOCK where legally grounded,
 * WARN and capture a reason and proceed everywhere else, never silently
 * permit.**
 *
 * A credit limit is a commercial judgement, not a legal one. Nobody is
 * breaking the law by placing a fifth contractor at a client who is over
 * their limit — they are taking a risk that somebody senior should be
 * the one to take. So a breach here NEVER blocks. It warns, it names who
 * has to approve, and it demands a reason that is written down, so that
 * six months later the question "who decided to keep going" has an
 * answer.
 *
 * ── Units ────────────────────────────────────────────────────────────
 *
 * Minor units throughout — cents, pence. Conversion from Prisma Decimals
 * happens at the edge. No database import here.
 */

const DAY = 86_400_000
const WEEK = 7

/**
 * How far forward a commitment is counted.
 *
 * Six months. Beyond that an assignment is a forecast rather than a
 * commitment: extensions are renegotiated, budgets reset at the client's
 * year end, and most contracts in this industry terminate on thirty
 * days' notice either way. Counting a two-year placement at its full
 * face value produces an exposure figure so large that nobody acts on
 * any of it.
 *
 * The horizon is stated on every result rather than buried, because the
 * figure means nothing without it.
 */
export const COMMITMENT_HORIZON_DAYS = 180

/**
 * Hours assumed per week where the ledger has not yet said otherwise.
 *
 * Forty, and it is an assumption rather than a fact — a half-time
 * assignment counted at forty overstates its commitment by double. Every
 * result says whether the number came from observed hours or from this,
 * and a book resting entirely on the assumption is worth less than one
 * resting on the ledger.
 */
export const ASSUMED_HOURS_PER_WEEK = 40

/** Where a warning starts, short of the limit. */
export const APPROACHING_BPS = 8_000

// ── Committed work ───────────────────────────────────────────────────

export interface RunningAssignment {
  contractId: string
  personName: string
  /** Minor units per hour. */
  billRateMinor: number
  currency: string
  /** Null means open-ended, which cannot be counted to an end. */
  endDate: Date | null
  /**
   * Average approved hours a week from the work ledger, where there are
   * enough approved timesheets to average. Null falls back to the
   * assumption, and says so.
   */
  observedHoursPerWeek: number | null
}

export type CommitmentBasis = 'OBSERVED' | 'ASSUMED_FULL_TIME' | 'MIXED' | 'NONE'

export interface Committed {
  /** Assignments with an end date, counted to it or to the horizon. */
  minor: number
  /**
   * Assignments with no end date, counted to the horizon and kept
   * separate. Real exposure, but on an assumption about duration that
   * nobody has made — so it is never folded into the headline figure.
   */
  openEndedMinor: number
  openEndedCount: number
  contracts: number
  basis: CommitmentBasis
  horizonDays: number
  says: string
}

/** The value of work already committed and not yet done. */
export function committedOf(
  assignments: RunningAssignment[],
  now: Date,
  horizonDays: number = COMMITMENT_HORIZON_DAYS
): Committed {
  const horizonEnd = new Date(now.getTime() + horizonDays * DAY)

  let minor = 0
  let openEndedMinor = 0
  let openEnded = 0
  let observed = 0
  let assumed = 0

  for (const a of assignments) {
    const perWeek = a.observedHoursPerWeek ?? ASSUMED_HOURS_PER_WEEK
    if (a.observedHoursPerWeek == null) assumed += 1
    else observed += 1

    const until = a.endDate == null ? horizonEnd : a.endDate < horizonEnd ? a.endDate : horizonEnd
    const days = (until.getTime() - now.getTime()) / DAY
    if (days <= 0) continue

    const value = Math.round(a.billRateMinor * perWeek * (days / WEEK))

    if (a.endDate == null) {
      openEnded += 1
      openEndedMinor += value
    } else {
      minor += value
    }
  }

  const basis: CommitmentBasis =
    assignments.length === 0
      ? 'NONE'
      : assumed === 0
        ? 'OBSERVED'
        : observed === 0
          ? 'ASSUMED_FULL_TIME'
          : 'MIXED'

  return {
    minor,
    openEndedMinor,
    openEndedCount: openEnded,
    contracts: assignments.length,
    basis,
    horizonDays,
    says: committedSays(basis, assignments.length, openEnded, horizonDays),
  }
}

function committedSays(
  basis: CommitmentBasis,
  contracts: number,
  openEnded: number,
  horizonDays: number
): string {
  if (contracts === 0) return 'Nobody is running here, so nothing is committed.'

  const months = Math.round(horizonDays / 30)
  const head =
    `${contracts} assignment${contracts === 1 ? '' : 's'} running, counted forward ` +
    `${months} month${months === 1 ? '' : 's'} — beyond that an extension is a forecast, not a commitment.`

  const hours =
    basis === 'OBSERVED'
      ? ' Hours come from what has actually been approved.'
      : basis === 'ASSUMED_FULL_TIME'
        ? ' Nothing has been approved yet, so hours are assumed full time. A part-time assignment is overstated here.'
        : ' Some hours are observed and some assumed full time, which overstates any part-time assignment.'

  const open =
    openEnded > 0
      ? ` ${openEnded} of them ha${openEnded === 1 ? 's' : 've'} no end date and ` +
        `${openEnded === 1 ? 'is' : 'are'} shown separately — nobody has said how long ` +
        `${openEnded === 1 ? 'it' : 'they'} run${openEnded === 1 ? 's' : ''}, and guessing would put a made-up number in the total.`
      : ''

  return head + hours + open
}

// ── Exposure ─────────────────────────────────────────────────────────

export interface ExposureInput {
  customerId: string
  customerName: string
  currency: string
  /** Billed and unpaid, from the aged book. */
  receivableMinor: number
  /**
   * Delivered, approved by the client, not yet on an invoice.
   * Null means the work ledger was not read — never zero for that.
   */
  unbilledMinor: number | null
  committed: Committed
}

export interface ExposurePart {
  key: 'RECEIVABLE' | 'UNBILLED' | 'COMMITTED'
  label: string
  minor: number | null
  says: string
}

export interface Exposure {
  customerId: string
  customerName: string
  currency: string
  /**
   * The three parts added. A FLOOR, not a total: open-ended assignments
   * and an unread ledger both sit outside it, and `complete` says so.
   */
  minor: number
  /** The same figure with open-ended assignments folded in, for comparison. */
  withOpenEndedMinor: number
  parts: ExposurePart[]
  /** False where something real could not be counted. */
  complete: boolean
  /** What is missing, in plain English. Empty when complete. */
  gaps: string[]
  says: string
}

export function exposureOf(input: ExposureInput): Exposure {
  const gaps: string[] = []

  if (input.unbilledMinor == null) {
    gaps.push(
      'Work delivered but not yet invoiced could not be read, so it is not in this figure. ' +
        'On a monthly billing cycle that is routinely a month of revenue.'
    )
  }
  if (input.committed.openEndedCount > 0) {
    gaps.push(
      `${input.committed.openEndedCount} assignment${input.committed.openEndedCount === 1 ? '' : 's'} ` +
        `here ha${input.committed.openEndedCount === 1 ? 's' : 've'} no end date, so nothing is committed ` +
        `for ${input.committed.openEndedCount === 1 ? 'it' : 'them'} that can honestly be counted.`
    )
  }

  const minor = input.receivableMinor + (input.unbilledMinor ?? 0) + input.committed.minor

  const parts: ExposurePart[] = [
    {
      key: 'RECEIVABLE',
      label: 'Billed and unpaid',
      minor: input.receivableMinor,
      says: 'The only part most systems count, and the smallest of the three on a running account.',
    },
    {
      key: 'UNBILLED',
      label: 'Delivered and not yet billed',
      minor: input.unbilledMinor,
      says:
        input.unbilledMinor == null
          ? 'Not read. Left out rather than shown as nothing, because nothing is a claim.'
          : 'Hours approved by the client and not yet on an invoice. The wages behind them are already owed.',
    },
    {
      key: 'COMMITTED',
      label: 'Committed and not yet worked',
      minor: input.committed.minor,
      says: input.committed.says,
    },
  ]

  return {
    customerId: input.customerId,
    customerName: input.customerName,
    currency: input.currency,
    minor,
    withOpenEndedMinor: minor + input.committed.openEndedMinor,
    parts,
    complete: gaps.length === 0,
    gaps,
    says:
      gaps.length === 0
        ? 'Everything owed, everything delivered, and everything promised for the rest of the assignments.'
        : 'At least this much. Some of what is really carried here could not be counted honestly — see below.',
  }
}

// ── The limit ────────────────────────────────────────────────────────

export type CreditOutcome = 'NO_LIMIT_SET' | 'WITHIN' | 'APPROACHING' | 'BREACHED'

/**
 * WARN or PROCEED, and never BLOCK.
 *
 * A tenure limit or a lapsed work authorisation blocks because the law
 * says so. A credit limit is somebody's commercial judgement about risk,
 * and a system that hard-stops a placement on it will be routed around
 * within a week — the placement happens on email and the ledger never
 * sees it, which is strictly worse than warning.
 */
export type CreditAction = 'PROCEED' | 'WARN'

export interface CreditVerdict {
  customerId: string
  customerName: string
  currency: string
  outcome: CreditOutcome
  action: CreditAction
  exposureMinor: number
  limitMinor: number | null
  /** Limit less exposure. Null with no limit, negative on a breach. */
  headroomMinor: number | null
  /** Exposure as a share of the limit, basis points. Null with no limit. */
  usedBps: number | null
  /** Who has to say yes. Null where nothing needs approving. */
  approver: string | null
  /** True where proceeding must record why. */
  reasonRequired: boolean
  says: string
}

/**
 * Where this customer stands against what they are allowed to owe.
 *
 * `limitMinor` is null when nobody has set one, and that is reported as
 * its own outcome rather than as a pass. A green tick against a limit
 * that does not exist is the most misleading thing this file could show:
 * it reads as "checked and fine" when the truth is "never checked".
 */
export function assess(
  exposure: Exposure,
  limitMinor: number | null,
  opts: { approver?: string } = {}
): CreditVerdict {
  const approver = opts.approver ?? 'whoever owns credit here — a controller or a director'

  const base = {
    customerId: exposure.customerId,
    customerName: exposure.customerName,
    currency: exposure.currency,
    exposureMinor: exposure.minor,
    limitMinor,
  }

  if (limitMinor == null || limitMinor <= 0) {
    return {
      ...base,
      outcome: 'NO_LIMIT_SET',
      action: 'PROCEED',
      headroomMinor: null,
      usedBps: null,
      approver: null,
      reasonRequired: false,
      says:
        `Nobody has said what ${exposure.customerName} may owe, so there is nothing to ` +
        `breach and nothing here has been checked. That is not the same as being within ` +
        `a limit, and it is shown as its own state so it cannot be read as one.`,
    }
  }

  const usedBps = Math.round((exposure.minor / limitMinor) * 10_000)
  const headroom = limitMinor - exposure.minor

  if (usedBps >= 10_000) {
    return {
      ...base,
      outcome: 'BREACHED',
      action: 'WARN',
      headroomMinor: headroom,
      usedBps,
      approver,
      reasonRequired: true,
      says:
        `Over the limit by ${Math.round((usedBps - 10_000) / 100)}%. This does not stop ` +
        `anything — a credit limit is a commercial judgement and not a legal one, and a ` +
        `hard stop would simply be worked around outside the system. Going ahead needs ` +
        `${approver} to say so, and the reason is written down, so that in six months ` +
        `"who decided to keep going" has an answer.` +
        (exposure.complete
          ? ''
          : ' And the exposure is a floor — some of what is carried here could not be counted.'),
    }
  }

  if (usedBps >= APPROACHING_BPS) {
    return {
      ...base,
      outcome: 'APPROACHING',
      action: 'WARN',
      headroomMinor: headroom,
      usedBps,
      approver,
      reasonRequired: false,
      says:
        `${Math.round(usedBps / 100)}% of the limit used. Worth knowing before the next ` +
        `placement here rather than after it — one more contractor usually takes it over.`,
    }
  }

  return {
    ...base,
    outcome: 'WITHIN',
    action: 'PROCEED',
    headroomMinor: headroom,
    usedBps,
    approver: null,
    reasonRequired: false,
    says: `${Math.round(usedBps / 100)}% of the limit used.`,
  }
}

/**
 * A breach that somebody went ahead with anyway, written down.
 *
 * Never silently permit. The verdict alone is not the control — the
 * control is that proceeding leaves a row with a name and a reason on
 * it. This shapes what the caller must record; whoever writes it to the
 * automation log owns that half.
 */
export interface CreditOverride {
  customerId: string
  exposureMinor: number
  limitMinor: number
  usedBps: number
  byPersonId: string
  reason: string
  at: Date
}

/** Whether a proposed override is usable, or what is missing from it. */
export function overrideAcceptable(
  verdict: CreditVerdict,
  proposed: { byPersonId?: string | null; reason?: string | null }
): { ok: boolean; says: string } {
  if (!verdict.reasonRequired) {
    return { ok: true, says: 'Nothing needs overriding here.' }
  }
  if (!proposed.byPersonId) {
    return {
      ok: false,
      says: 'A breach proceeds on somebody’s authority. An unsigned override is an unrecorded decision.',
    }
  }
  if (!proposed.reason || proposed.reason.trim().length < 10) {
    return {
      ok: false,
      says:
        'Say why in a sentence somebody can read in six months. "Approved" is not a reason, ' +
        'and a reason nobody can reconstruct is the same as no record at all.',
    }
  }
  return { ok: true, says: 'Recorded, with a name and a reason against it.' }
}
