/**
 * The two walls inside a firm that both buys and sells people.
 *
 * A staffing vendor lives in the market: everybody there talks to everybody
 * outside, and that is the job. A delivery firm — Infosys, Accenture, a
 * systems integrator with thirty thousand of its own employees and a
 * contractor desk of nine — is the opposite. Almost nobody there has any
 * business seeing the outside market, and the handful who do are hiring
 * contractors, not delivering projects.
 *
 * The same software serves both, so the wall cannot be a product decision.
 * It is a setting, and it has to hold in two directions.
 *
 * ── Looking out ──────────────────────────────────────────────────────
 *
 * What a firm's own people can see of the market: other companies'
 * consultants, who is coming free, which suppliers exist. Wide open for a
 * staffing vendor. Named people only for a delivery firm, where an
 * engineer browsing the contractor market is at best a distraction and at
 * worst somebody taking a supplier list to a competitor.
 *
 * ── Looking sideways ─────────────────────────────────────────────────
 *
 * What one account inside the firm can see of another. A delivery manager
 * on one client's account has no reason to see who is staffed at another
 * client, at what rate, or rolling off when. That is the client's data
 * rather than the firm's, and every client contract says so.
 *
 * Expressed by where somebody sits rather than by another permission: a
 * person attached to an org unit sees that unit and everything under it. A
 * person attached to none is firm-wide — a CFO, a head of delivery — and
 * that absence is the deliberate act.
 */

import { hasPermission, type Permission } from '@/lib/permissions'

// ── Looking out ───────────────────────────────────────────────────────

export type OutsidePosture =
  /** Anybody with the ordinary read permission. A staffing vendor. */
  | 'ALLOWED'
  /** Only roles carrying network.read. A delivery firm or an enterprise. */
  | 'NAMED_ONLY'
  /** Nobody, whatever their role says. */
  | 'CLOSED'

/**
 * Where a company starts.
 *
 * A vendor's business is outside, so the default is open. Everybody else
 * starts closed to all but named people, because the cost of getting this
 * wrong is not symmetrical: a vendor who cannot see the market notices
 * within the hour, and a delivery firm whose engineers can browse the
 * supplier list never notices at all.
 */
export function defaultPostureFor(kind: string): OutsidePosture {
  switch (kind) {
    case 'VENDOR':
    case 'MSP':
      // An MSP runs somebody else's supplier program. Looking outward is
      // the whole engagement.
      return 'ALLOWED'
    case 'GSI':
    case 'CLIENT':
    default:
      return 'NAMED_ONLY'
  }
}

export interface Verdict {
  ok: boolean
  /** Plain enough to show somebody who has just been refused. */
  reason: string
}

/**
 * Whether this person may look outside their own company at all.
 *
 * Checked in addition to whatever permission the surface already wants —
 * never instead of it. Somebody without consultants.read still cannot read
 * consultants; this decides whether the ones outside their own company are
 * even in scope.
 */
export function maySeeOutside(input: {
  /** Read from the company row, so an unrecognised value must not open the door. */
  posture: string
  permissions: readonly string[]
}): Verdict {
  if (input.posture === 'CLOSED') {
    // No role overrides this. It is the point of the setting: an owner can
    // shut the door without auditing every role in the company.
    return {
      ok: false,
      reason: 'Your company does not use the outside market. Nobody here can see it, whatever their role.',
    }
  }

  // Anything that is not plainly ALLOWED is treated as named-only. A
  // typo in a column should narrow the door rather than open it.
  if (input.posture !== 'ALLOWED' && !hasPermission(input.permissions, 'network.read')) {
    return {
      ok: false,
      reason: 'Seeing people and suppliers outside your own company is kept to named people here. Your role does not include it.',
    }
  }

  return { ok: true, reason: 'Allowed.' }
}

/**
 * Whether a client's name may be published to the wider market.
 *
 * Never, unless the company that holds the relationship says so. Somebody
 * agreeing to be listed as coming free agreed about themselves; they cannot
 * agree on behalf of the firm they are working for, and the firm's
 * competitors read the same list.
 */
export function mayNameTheClient(input: {
  /** True when the reader is the company that placed them. */
  ownVendor: boolean
  /** Set deliberately by the company that holds the relationship. */
  disclosed: boolean
}): boolean {
  return input.ownVendor || input.disclosed
}

// ── Looking sideways ──────────────────────────────────────────────────

/**
 * The org units somebody may read, or null for the whole firm.
 *
 * A person sits on one unit and sees it and everything beneath it: an
 * account lead sees their account, a practice head sees the accounts under
 * the practice. A person on no unit sees the firm — which is why attaching
 * somebody to a unit is the act that creates the wall, and detaching them
 * is the act that removes it.
 */
export function unitsVisibleTo(input: {
  /** Whether this company separates its accounts at all. */
  walls: boolean
  /** The unit the viewer sits on, if any. */
  unitId: string | null | undefined
  /** parent → children, for walking down the tree. */
  childrenOf: Map<string, string[]>
}): string[] | null {
  if (!input.walls || !input.unitId) return null

  const seen = new Set<string>()
  const queue = [input.unitId]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const child of input.childrenOf.get(id) ?? []) queue.push(child)
  }

  return [...seen]
}

/**
 * A Prisma fragment restricting a read to the accounts somebody may see.
 *
 * Rows with no unit at all stay visible. A contract nobody has coded to an
 * account is unallocated work, not another account's secret, and hiding it
 * would quietly shrink every total a manager reconciles against.
 */
export function accountScope(units: string[] | null, field = 'orgUnitId'): Record<string, unknown> {
  if (units === null) return {}
  return { OR: [{ [field]: { in: units } }, { [field]: null }] }
}

/**
 * Said to somebody who is seeing less than the whole firm.
 *
 * A number that silently excludes half the company is worse than a smaller
 * number somebody understands, and this is the sentence that makes the
 * difference visible.
 */
export function scopeNote(units: string[] | null, unitName: string | null): string | null {
  if (units === null) return null
  return unitName
    ? `Limited to ${unitName} and anything under it. Other accounts are not shown.`
    : 'Limited to your own account. Other accounts are not shown.'
}

/**
 * Combine query fragments without one silently eating another.
 *
 * Both the company scope and the account scope express themselves as `OR`,
 * and spreading one over the other replaces it — which turns a wall into a
 * wide-open query that still looks filtered. It happened here: a delivery
 * manager scoped to one account was shown every contract on the platform,
 * because `{...scope, ...wall}` kept only the second OR.
 *
 * Empty fragments are dropped so the common case stays a plain object.
 */
export function andAll(...fragments: (Record<string, unknown> | undefined | null)[]): Record<string, unknown> {
  const real = fragments.filter(
    (f): f is Record<string, unknown> => Boolean(f) && Object.keys(f!).length > 0
  )
  if (real.length === 0) return {}
  if (real.length === 1) return real[0]
  return { AND: real }
}

// ── The third wall: a desk one company granted another ────────────────
//
// The two walls above are both inside one firm. This one is between
// firms: a client grants a program office a seat in its own program
// office, the office acts at one of the CLIENT'S roles, and what it may
// read is exactly what that desk may read (`lib/program-seat`, decided
// 2026-09-14, built 2026-09-20).
//
// It needs its own refusal because the ordinary one is wrong here twice
// over. "An owner or administrator can add it under Users and
// permissions" tells the office to go and change a permission at its own
// company, which would do nothing — the permissions are the client's.
// And "this seat does not hold it" reads as a bug to somebody who was
// deliberately seated at a narrower desk. So the sentence names the
// client, the desk the client chose, and the desk it would have to
// choose instead, and it is the client's rule that is quoted rather than
// the platform's.

/** A seat, as much of it as a refusal needs. `LiveSeat` fits. */
export interface SeatedDesk {
  role: { name: string; permissions: readonly string[] }
  clientCompany: { name: string }
  officeCompany: { name: string }
}

export interface SeatVerdict {
  ok: boolean
  /** Null when allowed. Never a code. */
  says: string | null
}

/**
 * May this seat read this, and if not, what is the office told.
 *
 * Pure. `what` is the thing in the reader's own words — "the tenure
 * ledger", "the queue of data requests" — because a refusal that says
 * what was refused is the product and the permission key is for the
 * machine.
 *
 * Nothing here consults the office's own permissions, on purpose. A
 * coordinator at an MSP whose own firm never gave its coordinators
 * `assignments.read` is still the client's program manager inside this
 * seat, and asking the office's own role first would refuse a program
 * the client had deliberately opened.
 */
export function seatMayRead(
  seat: SeatedDesk,
  permission: Permission,
  what: string
): SeatVerdict {
  if (hasPermission(seat.role.permissions, permission)) return { ok: true, says: null }
  return {
    ok: false,
    says:
      `${seat.clientCompany.name} seated ${seat.officeCompany.name} at its ${seat.role.name} desk, ` +
      `and that desk does not read ${what} here. What a program office may do is exactly what the ` +
      `desk it was given may do, so this changes when ${seat.clientCompany.name} changes the desk — ` +
      `an owner or the program manager there can seat ${seat.officeCompany.name} at a desk that ` +
      `reads it, or widen this one.`,
  }
}

/**
 * The rows a seat narrowed to one business unit may read.
 *
 * Strict, unlike `accountScope` above, and the difference is deliberate.
 * An account wall lets a firm-wide row through on a null unit, because a
 * contract nobody charged to a team is the whole firm's. A seat narrowed
 * to a unit is a client saying "this office runs Technology and not the
 * rest", and a contract charged to no team is not charged to Technology.
 * Letting nulls through would hand a unit-scoped office every row the
 * client had never coded, which on most programs is most of them.
 */
export function seatScope(units: string[] | null, field = 'orgUnitId'): Record<string, unknown> {
  if (units === null) return {}
  return { [field]: { in: units } }
}
