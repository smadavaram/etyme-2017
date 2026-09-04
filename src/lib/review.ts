/**
 * Ten a week, reviewed by a person.
 *
 * This is the only thing standing between the product and the failure that
 * kills it quietly: an agent grading its own homework. It reports 96%
 * accuracy, the dashboard is green, and clients stop calling. By the time
 * anybody investigates, the ledger has been lying for months and there is
 * nothing left to reconstruct.
 *
 * So a machine check is never the last word on a machine's work. A sample
 * of what the model decided goes in front of a person every week, they
 * agree or they disagree with a reason, and the agreement rate is a number
 * on a screen rather than a belief.
 *
 * ── Why ten ──────────────────────────────────────────────────────────
 *
 * Small enough that somebody actually does it. A review nobody completes
 * is worse than no review, because the empty queue reads as "nothing to
 * worry about". Ten items is fifteen minutes and it is enough to notice a
 * model that has started being wrong.
 *
 * ── Why disagreement is the valuable half ────────────────────────────
 *
 * An agreement teaches nothing. A disagreement with a written reason is
 * the only input that improves the agent, so the reason is required and
 * the agreements are one tap.
 */

/** How many go in front of a person each week. */
export const SAMPLE_SIZE = 10

/**
 * Below this, stop trusting the check.
 *
 * Not a hard block — a threshold that fires an alarm rather than a gate,
 * because a check that switches itself off silently is the same failure in
 * a different coat.
 */
export const WORRY_BELOW = 80

export interface Reviewable {
  id: string
  code: string
  verdict: 'PASS' | 'FAIL'
  reason: string
  evidence: string | null
  at: Date
  agreed: boolean | null
}

/**
 * Which ten.
 *
 * Only machine checks — a rule cannot be wrong in an interesting way, and
 * putting rules in the queue would bury the model checks in noise.
 *
 * Every FAIL first, then PASSes. A wrong FAIL is a good person rejected
 * and nobody ever finds out; a wrong PASS reaches the client and they tell
 * you. The invisible failure is the one worth spending the sample on.
 *
 * Oldest first inside each group, so nothing sits in the queue forever
 * while fresher items keep jumping it.
 */
export function drawSample(all: Reviewable[], size: number = SAMPLE_SIZE): Reviewable[] {
  const unreviewed = all.filter((c) => c.agreed === null)

  const fails = unreviewed
    .filter((c) => c.verdict === 'FAIL')
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  const passes = unreviewed
    .filter((c) => c.verdict === 'PASS')
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  return [...fails, ...passes].slice(0, size)
}

export interface Agreement {
  reviewed: number
  agreed: number
  /** Null until anything has been reviewed. Never guessed at. */
  percent: number | null
  /** One sentence for the top of the screen. */
  says: string
  worrying: boolean
}

/**
 * How often the person agreed with the machine.
 *
 * Says "not enough yet" rather than showing 100% off two reviews, because
 * a confident number from a sample of two is exactly the false comfort
 * this whole surface exists to prevent.
 */
export function agreement(reviewed: { agreed: boolean | null }[]): Agreement {
  const done = reviewed.filter((r) => r.agreed !== null)
  const yes = done.filter((r) => r.agreed === true).length

  if (done.length === 0) {
    return {
      reviewed: 0,
      agreed: 0,
      percent: null,
      says: 'Nothing reviewed yet. Ten a week is enough.',
      worrying: false,
    }
  }

  const percent = Math.round((yes / done.length) * 100)

  if (done.length < 5) {
    return {
      reviewed: done.length,
      agreed: yes,
      percent,
      says: `${yes} of ${done.length} so far — too few to mean anything yet.`,
      worrying: false,
    }
  }

  return {
    reviewed: done.length,
    agreed: yes,
    percent,
    says:
      percent < WORRY_BELOW
        ? `You disagreed with ${done.length - yes} of the last ${done.length}. This check is not working — read the notes.`
        : `You agreed with ${percent}% of the last ${done.length}.`,
    worrying: percent < WORRY_BELOW,
  }
}

/**
 * Whether this week's ten have been done.
 *
 * Counted by week rather than by rolling window, because "ten a week" is
 * the promise somebody made and a rolling number lets it slip a day at a
 * time until it has stopped.
 */
export function thisWeek(
  reviews: { at: Date }[],
  now: Date
): { done: number; target: number; says: string; behind: boolean } {
  const monday = startOfWeek(now)
  const done = reviews.filter((r) => r.at >= monday).length

  return {
    done,
    target: SAMPLE_SIZE,
    says:
      done >= SAMPLE_SIZE
        ? `${done} reviewed this week. Done.`
        : `${done} of ${SAMPLE_SIZE} reviewed this week.`,
    behind: done < SAMPLE_SIZE,
  }
}

function startOfWeek(now: Date): Date {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  // Monday. getUTCDay() is 0 on Sunday, which is the end of the week here,
  // not the start — a Sunday review belongs to the week that just ended.
  const day = d.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - back)
  return d
}

/**
 * What a reviewer is asked.
 *
 * The machine's decision, what it read, and two buttons. Not "was this
 * correct" in the abstract — a specific claim with its evidence next to
 * it, which somebody can settle in ten seconds without opening anything
 * else.
 */
export function question(c: Reviewable): { asks: string; shows: string } {
  const decided = c.verdict === 'PASS' ? 'passed' : 'failed'
  return {
    asks: `The check ${decided} this. Do you agree?`,
    shows: c.evidence ? `${c.reason}\n\nIt read: ${c.evidence}` : c.reason,
  }
}

/**
 * A disagreement without a reason is a shrug.
 *
 * The note is the only thing that improves the agent, so it is required —
 * and agreement is not, because making somebody type to say "yes, fine"
 * ten times is how a weekly review becomes a weekly non-review.
 */
export function checkReview(input: {
  agreed: boolean
  note?: string | null
}): { ok: boolean; reason: string } {
  if (input.agreed) return { ok: true, reason: 'Agreed.' }

  if (!input.note || input.note.trim().length < 4) {
    return {
      ok: false,
      reason: 'Say what it got wrong. That note is the only thing that improves this check.',
    }
  }

  return { ok: true, reason: 'Disagreement recorded.' }
}
