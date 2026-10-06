/**
 * Whom a firm may record a placement for, and from what day it is owed
 * reminders.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * "Record a placement" (`POST /api/contracts`) took any person id. A firm
 * could write a sell line, a pay line and the cycles behind them for
 * somebody who was nobody to it — no seat at the firm, no listing on its
 * bench, no earlier contract, never put forward by it or to it. That is a
 * placement on the record of a person who never agreed to be anybody's,
 * and the tenure, paperwork and pay it writes all attach to them.
 *
 * So the firm must already have a record of the person, in one of five
 * ways, any one of which is enough:
 *
 *   - a seat: the person works at the firm (an EMPLOYEE or CONSULTANT
 *     context that has not been revoked) — the employment is the consent,
 *     the same carve-out the submission door makes;
 *   - a listing: the person is on the firm's bench and has not withdrawn
 *     (`BenchListing`, not revoked, not declined);
 *   - a contract: the firm already holds a line for them, either side —
 *     a placement it bills or one it pays;
 *   - a submission: the firm put them forward, or they were put forward
 *     to it;
 *   - their own company: the person's own corporation recording its own
 *     work.
 *
 * A person with none of the five is refused in a sentence that names the
 * two ways in: invite them (a seat) or list them (a bench listing with
 * their consent).
 *
 * Pure. The route reads the ties; this decides.
 */

export interface PersonTies {
  /** A live EMPLOYEE or CONSULTANT context at the firm. */
  seat: boolean
  /** A bench listing at the firm, neither revoked nor declined. */
  listing: boolean
  /** A sell line the firm bills, or a pay line the firm pays, for them. */
  contract: boolean
  /** A submission of them by the firm, or to it. */
  putForward: boolean
  /** The firm is the person's own company. */
  ownCompany: boolean
}

export type RecordedPerson =
  | { ok: true; via: keyof PersonTies }
  | { ok: false; code: 'NO_RECORD_OF_PERSON'; says: string; field: 'personId' }

const ORDER: readonly (keyof PersonTies)[] = ['seat', 'listing', 'contract', 'putForward', 'ownCompany']

export function mayRecordFor(ties: PersonTies, personName: string): RecordedPerson {
  for (const tie of ORDER) {
    if (ties[tie]) return { ok: true, via: tie }
  }
  return {
    ok: false,
    code: 'NO_RECORD_OF_PERSON',
    says: `${personName} is not on your bench, your payroll or any contract of yours; invite them or list them first.`,
    field: 'personId',
  }
}

/**
 * The due-date floor for a recorded placement: the recording day, at
 * midnight UTC.
 *
 * A firm records work it is already running, so the start is often in
 * the past. The contract's dates are the truth about the work and stay
 * as typed; but a reminder dated before the day it was written is overdue
 * the moment it exists and nobody can act on it. The award uses the same
 * floor, by due date rather than by period, so a week that ended
 * yesterday and is due tomorrow still gets its reminder.
 *
 * Read off the UTC calendar, never the server's local day: the cycle
 * engine keys its dates by UTC midnight.
 */
export function recordingFloor(now: Date): Date {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)
}
