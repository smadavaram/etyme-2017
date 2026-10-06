/**
 * The time limit, asked at the door where a person is put forward.
 *
 * Addendum E: tenure accrues to the person at the client, across every
 * supplier, and a tenure limit and a break in service are BLOCKs because
 * they are legally grounded. They were asked at the award and at
 * activation — one step too late, the same lesson as lapsed insurance:
 * by then the client has read a CV, run interviews and made an offer for
 * somebody it could never take on.
 *
 * So the door asks three questions, in this order:
 *
 *  1. Has the person already reached the client's limit? BLOCK, with the
 *     day they are eligible again where the client's rules give one.
 *  2. Are they inside the break the client requires after somebody
 *     leaves? BLOCK, with the day the break ends.
 *  3. Would this job, at its own length, carry them past the limit?
 *     WARN — the job may be cut short, or extended by a different firm —
 *     so the submitter gives a reason, and it is recorded.
 *
 * What counts is regulatory's, called and never rewritten: the days on
 * site are `daysOnSite` (the union of the periods, so a chain's two rungs
 * are one stretch), the limit is `daysFor`, months served are `monthsOf`,
 * and the day the limit falls is `limitReachedOn` — the same arithmetic
 * the tenure ledger and the award use, so this door and that page cannot
 * disagree about whether somebody is past the limit.
 *
 * Eligibility follows the tenure ledger (`app/api/tenure`): somebody at
 * the limit is eligible again once the client's break has been served
 * after their last day. A client with a limit and no break rule has said
 * nothing about when that is, and this says so rather than inventing one.
 *
 * Pure. The route reads the rows and passes `now`.
 */
import { daysFor, daysOnSite, limitReachedOn, monthsOf, type Period } from '@/lib/tenure-days'
import { plainDate } from '@/lib/plain-date'

const DAY = 86_400_000

export type Mode = 'BLOCK' | 'WARN'

/** The client's own rules, as its governance policy states them. */
export interface TimeLimitRules {
  /** The limit in months, or null where the client has none. */
  capMonths: number | null
  capMode: Mode
  /** Days away the client requires before somebody may come back, or null. */
  breakDays: number | null
  breakMode: Mode
}

/** One contract that put the person on this client's site, from any supplier. */
export interface SiteContract {
  startDate: Date
  endDate: Date | null
  /** ENDED, or live (IN_PROGRESS, PAUSED). */
  state: string
}

/** The job they are being put forward to. */
export interface JobLength {
  startDate: Date | null
  /** How long the job runs, in months. Null: nobody said. */
  months: number | null
}

export type TimeLimitCode = 'TIME_LIMIT_REACHED' | 'IN_BREAK' | 'RUNS_PAST_LIMIT'

export type TimeLimitVerdict =
  | {
      outcome: 'PASS'
      /** A question this could not answer, said plainly; null where nothing was unknown. */
      unknown: string | null
    }
  | {
      outcome: 'BLOCK' | 'WARN'
      code: TimeLimitCode
      says: string
      /** The day they may be put forward again; null where the rules give none. */
      eligibleOn: Date | null
      /** For RUNS_PAST_LIMIT: the day the limit would be reached on this job. */
      reachedOn: Date | null
    }

function day(d: Date): string {
  return plainDate(d.toISOString().slice(0, 10))
}

function months(n: number): string {
  return `${n} month${n === 1 ? '' : 's'}`
}

/** Calendar months on from a day, in UTC, the way a job's length is meant. */
export function addMonths(from: Date, n: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, from.getUTCDate()))
  // Jan 31 + 1 month lands on Mar 3 in Date arithmetic; a month on from
  // the 31st is the last day of the shorter month instead.
  if (d.getUTCDate() !== from.getUTCDate()) d.setUTCDate(0)
  return d
}

function isLive(c: SiteContract): boolean {
  return c.state !== 'ENDED'
}

export function timeLimitAtSubmission(args: {
  personName: string
  clientName: string
  rules: TimeLimitRules
  contracts: SiteContract[]
  job: JobLength
  now: Date
}): TimeLimitVerdict {
  const { personName, clientName, rules, contracts, job, now } = args
  const today = now.getTime()

  // An ended contract stops on its end or today, whichever is first: an
  // early termination that left the booked end in the future is not
  // somebody still on site (the caller's duty, per `limitReachedOn`).
  const served: Period[] = contracts.map((c) => ({
    startDate: c.startDate,
    endDate: isLive(c) ? c.endDate : new Date(Math.min((c.endDate ?? now).getTime(), today)),
  }))

  const daysServed = daysOnSite(served, now)

  // On site today: a live contract that has begun and not ended.
  const onSiteNow = contracts.some(
    (c) => isLive(c) && c.startDate.getTime() <= today && (c.endDate == null || c.endDate.getTime() > today)
  )
  // Where the current stretch ends, for somebody on site; null where it
  // has no end on the paper.
  const liveEnds = contracts.filter((c) => isLive(c) && c.startDate.getTime() <= today)
  const stretchEnd: Date | null = onSiteNow
    ? liveEnds.some((c) => c.endDate == null)
      ? null
      : new Date(Math.max(...liveEnds.map((c) => c.endDate!.getTime())))
    : null
  // The last day on site, for somebody who is not there now.
  const pastEnds = served
    .map((p) => p.endDate)
    .filter((d): d is Date => d != null && d.getTime() <= today)
  const lastEnd: Date | null = !onSiteNow && pastEnds.length
    ? new Date(Math.max(...pastEnds.map((d) => d.getTime())))
    : null

  const breakDays = rules.breakDays != null && rules.breakDays > 0 ? rules.breakDays : null
  const breakEndsOn = (from: Date) => new Date(from.getTime() + breakDays! * DAY)

  // ── 1. Already at the limit ─────────────────────────────────────────
  const cap = rules.capMonths != null && rules.capMonths > 0 ? rules.capMonths : null
  if (cap != null && daysServed >= daysFor(cap)) {
    const servedSays =
      `${personName} has served ${months(monthsOf(daysServed))} at ${clientName}, across every supplier, ` +
      `against its ${months(cap)} time limit.`

    if (onSiteNow) {
      const eligibleOn = breakDays != null && stretchEnd ? breakEndsOn(stretchEnd) : null
      return {
        outcome: rules.capMode,
        code: 'TIME_LIMIT_REACHED',
        eligibleOn,
        reachedOn: null,
        says:
          servedSays +
          ' They are still on site, so they cannot be put forward for another job there. ' +
          (eligibleOn
            ? `With the ${breakDays}-day break ${clientName} requires after they leave, the earliest day is ${day(eligibleOn)}.`
            : breakDays != null
              ? `Their current contract has no end date, so there is no day yet on which they are eligible again.`
              : `${clientName}'s rules give no day on which they are eligible again.`),
      }
    }

    if (breakDays == null) {
      return {
        outcome: rules.capMode,
        code: 'TIME_LIMIT_REACHED',
        eligibleOn: null,
        reachedOn: null,
        says:
          servedSays +
          ` ${clientName}'s rules set no break after the limit, so they give no day on which ${personName} is eligible again.`,
      }
    }

    const eligibleOn = lastEnd ? breakEndsOn(lastEnd) : null
    if (eligibleOn && eligibleOn.getTime() > today) {
      return {
        outcome: rules.capMode,
        code: 'TIME_LIMIT_REACHED',
        eligibleOn,
        reachedOn: null,
        says:
          servedSays +
          ` ${clientName} requires a ${breakDays}-day break after the limit; it ends on ${day(eligibleOn)}, ` +
          'and they can be put forward from that day.',
      }
    }
    // The break has been served. The tenure ledger reads them eligible
    // again, and this door agrees with the ledger.
    return { outcome: 'PASS', unknown: null }
  }

  // ── 2. Inside a break ──────────────────────────────────────────────
  if (breakDays != null && lastEnd) {
    const eligibleOn = breakEndsOn(lastEnd)
    if (eligibleOn.getTime() > today) {
      return {
        outcome: rules.breakMode,
        code: 'IN_BREAK',
        eligibleOn,
        reachedOn: null,
        says:
          `${personName} left ${clientName} on ${day(lastEnd)}, and ${clientName} requires a ${breakDays}-day break ` +
          `before anybody comes back. They can be put forward from ${day(eligibleOn)}.`,
      }
    }
  }

  if (cap == null) return { outcome: 'PASS', unknown: null }

  // ── 3. Would this job carry them past the limit? ───────────────────
  if (job.months == null || !(job.months > 0)) {
    return {
      outcome: 'PASS',
      unknown:
        `The job has no length, so whether it carries ${personName} past ${clientName}'s ` +
        `${months(cap)} time limit is not known.`,
    }
  }
  const jobStart = new Date(Math.max((job.startDate ?? now).getTime(), today))
  const jobEnd = addMonths(jobStart, job.months)
  // Booked ends where the paper has them; a live contract with no end is
  // counted to today, because nothing on the record says how long it runs
  // and this asks about the job, not about that contract.
  const booked: Period[] = contracts.map((c) => ({
    startDate: c.startDate,
    endDate: isLive(c) ? (c.endDate ?? now) : new Date(Math.min((c.endDate ?? now).getTime(), today)),
  }))
  const reachedOn = limitReachedOn([...booked, { startDate: jobStart, endDate: jobEnd }], cap)
  if (reachedOn && reachedOn.getTime() < jobEnd.getTime()) {
    return {
      outcome: 'WARN',
      code: 'RUNS_PAST_LIMIT',
      eligibleOn: null,
      reachedOn,
      says:
        `${personName} has served ${months(monthsOf(daysServed))} of ${clientName}'s ${months(cap)} time limit. ` +
        `This job runs to ${day(jobEnd)}, and they would reach the limit on ${day(reachedOn)}. ` +
        'Give a reason to put them forward anyway.',
    }
  }
  return { outcome: 'PASS', unknown: null }
}

/**
 * The reason a submitter gave for going ahead past a warning, or null.
 *
 * Accepted per person (`reasons[personId]`) or once for the batch
 * (`reason`). A reason is a sentence somebody can be held to, so a word
 * or two of filler does not count as one.
 */
export function reasonGiven(body: { reason?: unknown; reasons?: unknown }, personId: string): string | null {
  const per =
    body.reasons && typeof body.reasons === 'object' ? (body.reasons as Record<string, unknown>)[personId] : undefined
  const raw = typeof per === 'string' ? per : typeof body.reason === 'string' ? body.reason : ''
  const text = raw.trim()
  return text.length >= 10 ? text : null
}
