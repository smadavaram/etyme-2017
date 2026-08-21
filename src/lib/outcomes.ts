/**
 * Why it won or lost, and the one number that says whether any of this
 * works.
 *
 * ── Why the reason is required ───────────────────────────────────────
 *
 * Every feature in this product can be built by somebody else in a
 * quarter. Twelve months of real rejection reasons, across a vendor chain,
 * tied to real submissions, cannot be bought at any price. It is the only
 * asset that compounds.
 *
 * The build stored `status` and nothing else, so a rejection was a state
 * change with no information in it. "Rejected" tells a recruiter to try
 * again; "rejected on rate, third time this month at this client" tells
 * them to stop bidding at that number.
 *
 * ── The one number ───────────────────────────────────────────────────
 *
 * Good submissions per day, per requirement. Not users, not logins, not
 * model accuracy, not requirements processed.
 *
 * A submission is good when it passed every automatic check and was not
 * thrown out by the client on rate, work authorisation or basic fit.
 * Rubbish does not count, and both sides agree the definition up front —
 * otherwise you send six weak ones and claim the bar.
 *
 * Five a day and there is a business. Two, and something is wrong that no
 * further feature will fix.
 */

/** The bar. */
export const TARGET_PER_DAY = 5

/**
 * Why a submission ended.
 *
 * A closed list on purpose. Free text is what a recruiter types at eight
 * at night and nobody can count afterwards; six buttons is what actually
 * gets pressed, and what makes a rate benchmark possible a year from now.
 *
 * Split into the three that mean the submission was bad and the three
 * that mean it was fine and lost anyway. Only the first three count
 * against the bar — a good candidate beaten by a better one is not a
 * failure of the product.
 */
export type Reason =
  /** Priced above what they would pay. */
  | 'RATE'
  /** Did not have the skills after all. */
  | 'SKILLS'
  /** Wrong permit, or it expires too soon. */
  | 'WORK_AUTH'
  /** Could not start when they needed. */
  | 'AVAILABILITY'
  /** Interviewed and did not land it. */
  | 'INTERVIEW'
  /** Somebody else got there first, or the role was pulled. */
  | 'TIMING'
  /** Withdrew, took something else, stopped answering. */
  | 'CANDIDATE_WITHDREW'
  /** The client never said. Common, and worth counting separately. */
  | 'NO_REPLY'

/** The three that mean the submission itself was poor. */
const BAD_SUBMISSION: Reason[] = ['RATE', 'SKILLS', 'WORK_AUTH']

export const REASONS: { code: Reason; label: string; hint: string }[] = [
  { code: 'RATE', label: 'Rate', hint: 'Priced above what they would pay' },
  { code: 'SKILLS', label: 'Skills', hint: 'Did not have them after all' },
  { code: 'WORK_AUTH', label: 'Work authorisation', hint: 'Wrong permit, or expiring too soon' },
  { code: 'AVAILABILITY', label: 'Availability', hint: 'Could not start when they needed' },
  { code: 'INTERVIEW', label: 'Interview', hint: 'Interviewed and did not land it' },
  { code: 'TIMING', label: 'Timing', hint: 'Beaten to it, or the role was pulled' },
  { code: 'CANDIDATE_WITHDREW', label: 'They withdrew', hint: 'Took something else, or stopped answering' },
  { code: 'NO_REPLY', label: 'No reply', hint: 'The client never came back' },
]

export function isBadSubmission(reason: Reason): boolean {
  return BAD_SUBMISSION.includes(reason)
}

/**
 * A rejection with no reason is a state change with no information in it.
 *
 * Required, and a closed list — but the free-text note is optional,
 * because the code is what gets counted and the note is what gets read.
 */
export function checkOutcome(input: {
  reason?: string | null
  note?: string | null
}): { ok: boolean; reason: string } {
  if (!input.reason) {
    return {
      ok: false,
      reason: 'Say why. This is the only thing about a rejection that is worth anything later.',
    }
  }

  if (!REASONS.some((r) => r.code === input.reason)) {
    return { ok: false, reason: `"${input.reason}" is not one of the reasons.` }
  }

  return { ok: true, reason: 'Recorded.' }
}

// ── The number ────────────────────────────────────────────────────────

export interface Sub {
  requirementId: string
  submittedAt: Date
  /** READY or SENT means it cleared every check before it left. */
  checkState: string
  /** Set only when somebody pushed it out with checks failing. */
  overriddenAt: Date | null
  /** Null while it is still live. */
  rejectReason: string | null
}

/**
 * Is this one of the five.
 *
 * Passed every automatic check, and not thrown out on rate, skills or
 * work authorisation. A submission sent with the checks failing does not
 * count however it turns out — the override exists so a recruiter is not
 * blocked, not so the number can be gamed.
 */
export function counts(s: Sub): boolean {
  if (s.overriddenAt !== null) return false
  if (s.checkState !== 'READY' && s.checkState !== 'SENT') return false
  if (s.rejectReason && isBadSubmission(s.rejectReason as Reason)) return false
  return true
}

export interface Bar {
  /** Good ones per day, per requirement. */
  rate: number | null
  good: number
  sent: number
  requirements: number
  days: number
  /** One sentence, in front of the customer. */
  says: string
  hit: boolean
}

/**
 * Good submissions per day, per requirement, over a window.
 *
 * Per requirement matters. Five a day across forty roles is an eighth of a
 * submission each and nothing is being filled; five a day on one role is
 * a shortlist by Thursday.
 */
export function bar(subs: Sub[], days: number): Bar {
  const requirements = new Set(subs.map((s) => s.requirementId)).size
  const good = subs.filter(counts).length

  if (days <= 0 || requirements === 0) {
    return {
      rate: null,
      good,
      sent: subs.length,
      requirements,
      days,
      says: 'Nothing open yet. The number starts when the first role does.',
      hit: false,
    }
  }

  const rate = good / days / requirements
  // Two decimals under one. Rounding 0.044 to a single place gives a bare
  // "0" on a fortnight where four good submissions actually went out,
  // which reads as "nothing happened" and is not true.
  const shown = rate < 1 ? Math.round(rate * 100) / 100 : Math.round(rate * 10) / 10
  const hit = rate >= TARGET_PER_DAY

  return {
    rate: shown,
    good,
    sent: subs.length,
    requirements,
    days,
    says: said(shown, good, subs.length, requirements, hit),
    hit,
  }
}

function said(
  rate: number,
  good: number,
  sent: number,
  requirements: number,
  hit: boolean
): string {
  const roles = `${requirements} role${requirements === 1 ? '' : 's'}`

  if (hit) {
    return `${rate} good submissions a day across ${roles}. That is the bar.`
  }

  // Say the gap between sent and good out loud where it is the problem.
  // Volume that does not clear the checks is not progress, and reading it
  // as progress is the thing that lets a bad month look like a good one.
  const wasted = sent - good
  if (wasted > good && sent > 0) {
    return `${rate} a day across ${roles}. ${wasted} of ${sent} did not count — fix those before sending more.`
  }

  return `${rate} a day across ${roles}. The bar is ${TARGET_PER_DAY}.`
}

/**
 * What is actually stopping the number.
 *
 * Ranked, because a recruiter can act on "eleven failed on rate" and
 * cannot act on "the number is low". Only counts the reasons that mean
 * the submission itself was poor — losing a good candidate to a better
 * one is not something to fix.
 */
export function whatIsStopping(
  subs: Sub[]
): { reason: Reason; count: number; label: string }[] {
  const counts = new Map<Reason, number>()

  for (const s of subs) {
    if (!s.rejectReason) continue
    const r = s.rejectReason as Reason
    if (!isBadSubmission(r)) continue
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      label: REASONS.find((x) => x.code === reason)?.label ?? reason,
    }))
    .sort((a, b) => b.count - a.count)
}
