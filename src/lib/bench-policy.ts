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
  /** What they earn per working day when they are billing, in cents. */
  billingDayRateCents: number
  /** What is in their own pot, in cents. Only meaningful when reserve funded. */
  reserveCents?: number
  /** Housing, and anything else carried for them per idle day. */
  housingPerDayCents?: number
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
  says: string
}

/** Working days in a calendar span. Five in seven, near enough for a bench. */
function workingDays(calendarDays: number): number {
  return Math.round(Math.max(0, calendarDays) * (5 / 7))
}

export function benchCost(p: Policy, f: BenchFacts): BenchCost {
  const idle = Math.max(0, f.idleDays)
  const days = workingDays(idle)
  const housing = Math.round(idle * (f.housingPerDayCents ?? 0))
  const reserve = Math.max(0, f.reserveCents ?? 0)

  const dueForRelease = p.carryDays != null && idle > p.carryDays
  const daysLeft = p.carryDays == null ? null : Math.max(0, p.carryDays - idle)

  // Where a firm carries somebody for a fixed window, it stops paying at
  // the end of it. Charging for the whole idle period would show a cost
  // the firm never actually incurred.
  const paidDays =
    p.carryDays == null ? days : Math.min(days, workingDays(p.carryDays))

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

  return {
    costCents: payCents + housing,
    fromReserveCents: fromReserve,
    fromFirmCents: fromFirm,
    reserveLeftCents: Math.max(0, reserve - fromReserve),
    dueForRelease,
    daysLeft,
    says: saysFor(p, idle, payCents, housing, fromReserve, dueForRelease, daysLeft),
  }
}

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
