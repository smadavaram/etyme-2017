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
 * Where the person stands is regulatory's, read and never rewritten:
 * `standingAgainstLimit` in lib/tenure-days, the one answer the award,
 * activation, extension and the tenure ledger read too (2026-10-06). A
 * served break resets the count against the limit; a break starts only
 * when no line at the client is live; past the limit with no break rule
 * is refused with no day. The day the limit would fall on this job is
 * `limitReachedOn` over `linesCounted`, the lines the limit still counts.
 * So this door and every other door give the same answer about the same
 * person on the same day.
 *
 * Pure. The route reads the rows and passes `now`.
 */
import { limitReachedOn, linesCounted, monthsOf, standingAgainstLimit, type Period } from '@/lib/tenure-days'
import { plainDate } from '@/lib/plain-date'

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
  const cap = rules.capMonths != null && rules.capMonths > 0 ? rules.capMonths : null
  const breakDays = rules.breakDays != null && rules.breakDays > 0 ? rules.breakDays : null
  if (cap == null && breakDays == null) return { outcome: 'PASS', unknown: null }

  const s = standingAgainstLimit(
    contracts.map((c) => ({ startDate: c.startDate, endDate: c.endDate, live: isLive(c) })),
    { capMonths: cap, breakDays },
    now
  )

  // What is counted against the limit, said plainly: since the last break
  // served where one reset the count, every day otherwise.
  const counted = monthsOf(s.countedDays)
  const servedSays = cap == null ? '' : s.countsFrom
    ? `${personName} has ${months(counted)} counted against ${clientName}'s ${months(cap)} time limit since their last break, across every supplier.`
    : `${personName} has served ${months(counted)} at ${clientName}, across every supplier, against its ${months(cap)} time limit.`

  // ── Past the limit, or inside the break ─────────────────────────────
  if (s.state === 'PAST_ON_SITE') {
    return {
      outcome: rules.capMode,
      code: 'TIME_LIMIT_REACHED',
      eligibleOn: s.eligibleOn,
      reachedOn: null,
      says:
        servedSays +
        ' They are still on site, so they cannot be put forward for another job there. ' +
        (s.eligibleOn
          ? `With the ${breakDays}-day break ${clientName} requires after they leave, the earliest day is ${day(s.eligibleOn)}.`
          : breakDays != null
            ? 'Their current contract has no end date, so there is no day yet on which they are eligible again.'
            : `${clientName}'s rules set no break after the limit, so they give no day on which ${personName} is eligible again.`),
    }
  }
  if (s.state === 'PAST_NO_RETURN') {
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
  if (s.state === 'IN_BREAK') {
    const eligibleOn = s.eligibleOn
    if (s.pastLimit) {
      return {
        outcome: rules.capMode === 'BLOCK' || rules.breakMode === 'BLOCK' ? 'BLOCK' : 'WARN',
        code: 'TIME_LIMIT_REACHED',
        eligibleOn,
        reachedOn: null,
        says:
          servedSays +
          ` ${clientName} requires a ${breakDays}-day break after the limit; it ends on ${day(eligibleOn!)}, ` +
          'and they can be put forward from that day.',
      }
    }
    return {
      outcome: rules.breakMode,
      code: 'IN_BREAK',
      eligibleOn,
      reachedOn: null,
      says:
        `${personName} left ${clientName} on ${day(s.lastDay!)}, and ${clientName} requires a ${breakDays}-day break ` +
        `before anybody comes back. They can be put forward from ${day(eligibleOn!)}.`,
    }
  }

  // UNDER, APPROACHING, or BREAK_SERVED: the count is open, so the one
  // question left is whether this job carries them past the limit.
  if (cap == null) return { outcome: 'PASS', unknown: null }

  // ── Would this job carry them past the limit? ───────────────────────
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
  // The lines the limit still counts, with booked ends where the paper
  // has them. A live line with no end is counted to today, because
  // nothing on the record says how long it runs and this asks about the
  // job, not about that line.
  const booked: Period[] = linesCounted(contracts, s).map((c) => ({
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
        `${personName} has ${months(counted)} counted against ${clientName}'s ${months(cap)} time limit. ` +
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
