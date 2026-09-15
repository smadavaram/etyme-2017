/**
 * The buyer's number: how long until the first submission worth reading.
 *
 * The supply side has one already — good submissions a day, per role. It
 * measures output, which is the right thing to measure when you are the
 * one producing. A client produces nothing. What a hiring manager
 * actually experiences is waiting, and then reading, and the second is
 * usually worse than the first.
 *
 * So this counts from the moment a role opens to the moment somebody
 * arrives that survives the screen. Not the first CV — the first good
 * one. A supplier can flood an inbox in an hour and that is not the same
 * as somebody worth an interview, and a number that cannot tell those
 * apart is a number that rewards flooding.
 *
 * ── Why this one and not the others ──────────────────────────────────
 *
 * "Share worth reading" is a supplier measure and already lives on the
 * scorecards. "Time to fill" is real but arrives too late to act on —
 * by the time it moves, the quarter is over. "Submissions received" is
 * the number every VMS reports and the number nobody can use.
 *
 * This one moves within days, cannot be gamed by sending more, and is a
 * figure every client already knows for their current process. That last
 * part matters most: a number they cannot compare against how things are
 * today is a number they will not trust.
 *
 * ── The second figure, and why it is not the headline ────────────────
 *
 * How many they did not have to read. It is the work being done and it
 * belongs on the same screen — but as evidence, not as the target. Made
 * the headline, it would reward a screen that holds everything back.
 */

/** Two days. Beyond that a hiring manager has moved on to something else. */
export const TARGET_HOURS = 48

/** Below this many closed roles, no median — one role is not a pattern. */
export const ENOUGH_ROLES = 3

export interface Arrival {
  at: Date
  /**
   * Whether it survived the screen.
   *
   * Null where nobody has screened it. Not the same as failing, and
   * counting it as either would be a lie in a different direction.
   */
  cleared: boolean | null
}

export interface Role {
  requirementId: string
  title: string
  openedAt: Date
  arrivals: Arrival[]
}

export interface RoleTime {
  requirementId: string
  title: string
  /** Hours from opening to the first one worth reading. */
  hours: number | null
  /** Hours to the first submission of any quality, for the comparison. */
  anyHours: number | null
  arrived: number
  worthReading: number
  says: string
}

export interface Number_ {
  /** The median hours across roles that got there. */
  hours: number | null
  /** How many roles the median is drawn from. */
  of: number
  /** Roles opened in the window that still have nothing worth reading. */
  waiting: number
  /** Whether the median is inside the target. */
  hit: boolean
  says: string
  /** The roles still waiting, worst first. Where the work is. */
  stuck: RoleTime[]
}

export interface Reading {
  arrived: number
  worthReading: number
  heldBack: number
  says: string
}

/**
 * One role: how long until something worth reading turned up.
 *
 * Reports the gap between the first CV and the first good one, because
 * that gap is the whole product. A role where they arrived in two hours
 * and the first good one took nine days is a role where somebody read
 * for nine days.
 */
export function roleTime(role: Role, now: Date): RoleTime {
  const inOrder = [...role.arrivals].sort((a, b) => a.at.getTime() - b.at.getTime())
  const first = inOrder[0] ?? null
  const good = inOrder.find((a) => a.cleared === true) ?? null

  const hoursFrom = (at: Date) => (at.getTime() - role.openedAt.getTime()) / 3_600_000

  const hours = good ? Math.max(0, hoursFrom(good.at)) : null
  const anyHours = first ? Math.max(0, hoursFrom(first.at)) : null
  const worthReading = inOrder.filter((a) => a.cleared === true).length
  const waitingHours = Math.max(0, (now.getTime() - role.openedAt.getTime()) / 3_600_000)

  return {
    requirementId: role.requirementId,
    title: role.title,
    hours,
    anyHours,
    arrived: inOrder.length,
    worthReading,
    says: roleSays(role.title, hours, anyHours, inOrder.length, waitingHours),
  }
}

function roleSays(
  title: string,
  hours: number | null,
  anyHours: number | null,
  arrived: number,
  waitingHours: number
): string {
  if (arrived === 0) {
    return `${title}: nothing has arrived in ${plain(waitingHours)}.`
  }

  if (hours == null) {
    return (
      `${title}: ${arrived} arrived over ${plain(waitingHours)}, ` +
      `none worth reading yet.`
    )
  }

  // The gap between the first CV and the first good one is the product.
  // A role where CVs arrived in two hours and the first good one took
  // nine days is a role where somebody read for nine days.
  if (anyHours != null && hours - anyHours >= 24) {
    return (
      `${title}: first CV in ${plain(anyHours)}, first one worth reading in ` +
      `${plain(hours)}. ${plain(hours - anyHours)} of reading in between.`
    )
  }

  return `${title}: first one worth reading in ${plain(hours)}.`
}

/**
 * The number.
 *
 * The median, not the mean. One role that sat open for three months
 * because nobody funded it would drag an average past the point of
 * meaning anything, and the median is what a hiring manager's experience
 * actually feels like.
 */
export function theNumber(roles: Role[], now: Date): Number_ {
  const times = roles.map((r) => roleTime(r, now))
  const got = times.filter((t) => t.hours != null)
  const stuck = times
    .filter((t) => t.hours == null)
    .sort((a, b) => b.arrived - a.arrived)

  if (got.length === 0) {
    return {
      hours: null,
      of: 0,
      waiting: stuck.length,
      hit: false,
      says:
        roles.length === 0
          ? 'No roles open yet. The number starts with the first one.'
          : `Nothing worth reading has arrived on any of the ${roles.length} open roles yet.`,
      stuck,
    }
  }

  const median = middle(got.map((t) => t.hours!))
  const hit = median <= TARGET_HOURS && got.length >= ENOUGH_ROLES

  return {
    hours: Math.round(median),
    of: got.length,
    waiting: stuck.length,
    hit,
    says: numberSays(median, got.length, stuck.length, hit),
    stuck,
  }
}

function numberSays(median: number, of: number, waiting: number, hit: boolean): string {
  const tail = waiting
    ? ` ${waiting} role${waiting === 1 ? '' : 's'} still waiting for a first good one.`
    : ''

  if (of < ENOUGH_ROLES) {
    return (
      `${plain(median)} to the first one worth reading, from ${of} ` +
      `role${of === 1 ? '' : 's'}. Too few to call it a pattern.${tail}`
    )
  }

  if (hit) {
    return `${plain(median)} to the first one worth reading, across ${of} roles.${tail}`
  }

  return (
    `${plain(median)} to the first one worth reading, across ${of} roles. ` +
    `The bar is ${plain(TARGET_HOURS)}.${tail}`
  )
}

/**
 * What they did not have to read.
 *
 * Evidence, not the target. As a headline it would reward a screen that
 * holds everything back, which is the failure this whole product is
 * supposed to be the opposite of.
 */
export function reading(roles: Role[]): Reading {
  const all = roles.flatMap((r) => r.arrivals)
  const screened = all.filter((a) => a.cleared !== null)
  const good = screened.filter((a) => a.cleared).length
  const held = screened.length - good

  if (screened.length === 0) {
    return {
      arrived: all.length,
      worthReading: 0,
      heldBack: 0,
      says:
        all.length === 0
          ? 'Nothing has arrived yet.'
          : `${all.length} arrived. None screened yet.`,
    }
  }

  return {
    arrived: all.length,
    worthReading: good,
    heldBack: held,
    says: held === 0
      ? `${screened.length} arrived and all of them were worth reading.`
      : `${held} of ${screened.length} did not reach a hiring manager.`,
  }
}

/**
 * This window against the one before it.
 *
 * Direction, not a percentage. "Down from four days" is something a
 * client repeats to their boss; "a 34% improvement in mean time to
 * qualified submission" is something they do not.
 */
export function trend(
  now: Number_,
  before: Number_
): { better: boolean | null; says: string } {
  if (now.hours == null || before.hours == null) {
    return { better: null, says: 'Not enough history to compare yet.' }
  }

  const diff = before.hours - now.hours
  // Under an hour either way is noise, and calling noise an improvement
  // is how a dashboard stops being believed.
  if (Math.abs(diff) < 1) {
    return { better: null, says: `About the same as before — ${plain(now.hours)}.` }
  }

  return diff > 0
    ? { better: true, says: `Down from ${plain(before.hours)}.` }
    : { better: false, says: `Up from ${plain(before.hours)}.` }
}

// ── Small readers ─────────────────────────────────────────────────────

/** Hours, said the way somebody would say them. */
export function plain(hours: number): string {
  const h = Math.round(hours)
  if (h < 1) return 'under an hour'
  if (h === 1) return '1 hour'
  if (h < 48) return `${h} hours`
  const days = Math.round(h / 24)
  return `${days} days`
}

/** The middle value. Even counts take the lower of the two. */
export function middle(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}

// ── One seat, one role ────────────────────────────────────────────────

export interface SeatRow {
  id: string
  openingId: string | null
  mirrors: { id: string }[]
}

/**
 * Which role each requirement record actually belongs to.
 *
 * A prime forwarding a role produces a second requirement record
 * pointing at the same seat. Counted as a second role it invents an
 * extra opening carrying whatever landed on the mirror — which on a
 * live sandbox read as a role stuck for eight days while the real one
 * had four people worth reading on it.
 *
 * `roles` are the records the client actually opened; `sameSeat` is
 * every record sharing an opening with one of them, mirrors included.
 */
export function seatMap(roles: SeatRow[], sameSeat: { id: string; openingId: string | null }[]): Map<string, string> {
  const parentOf = new Map<string, string>()

  for (const r of roles) {
    parentOf.set(r.id, r.id)
    for (const m of r.mirrors) parentOf.set(m.id, r.id)
  }

  const byOpening = new Map<string, string>()
  for (const r of roles) if (r.openingId) byOpening.set(r.openingId, r.id)

  for (const r of sameSeat) {
    const parent = r.openingId ? byOpening.get(r.openingId) : null
    // Never overwrite a record that is already its own role. A client's
    // own requisition sharing an opening with another of their own is
    // two roles on one seat, and quietly folding one into the other
    // would lose a headcount.
    if (parent && !parentOf.has(r.id)) parentOf.set(r.id, parent)
  }

  return parentOf
}
