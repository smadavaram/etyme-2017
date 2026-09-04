/**
 * Can this role actually be filled?
 *
 * The first loop written against the harness rather than by hand, and the
 * proof that a second one costs an hour instead of a day. Every part of it
 * below is the declaration of what to check; the running, the ledger, the
 * Check rows, the attempt cap, the fix list and the human sample all come
 * from `loop.ts` because that is what the harness is for.
 *
 * ── Why this check earns its place ───────────────────────────────────
 *
 * A role with a rate below what the work clears at, four must-have skills
 * that nobody has together, and a start date next Monday is not a role. It
 * is a month of everybody's time, and at the end of it the vendor looks
 * bad and the manager concludes that contractors are hard to find.
 *
 * Every hour spent on an unfillable role is an hour not spent on a
 * fillable one, and it is the cheapest thing in this system to catch,
 * because the answer is already in our own submission history.
 *
 * ── Every check here is arithmetic ───────────────────────────────────
 *
 * Not one of them needs a model. Rate against what has cleared, count of
 * must-haves, days until the start date, whether anybody on the bench
 * could plausibly do it. That is comparison and counting, which is free
 * and right every time.
 */

import type { Finding, Step } from '@/lib/loop'
import { band, warnAbout, ENOUGH, type Observation } from '@/lib/benchmark'

/** More than this many hard requirements and the list is a wish. */
export const TOO_MANY_MUST_HAVES = 6

/** Under this many days to fill, somebody is going to be disappointed. */
export const TOO_SOON_DAYS = 7

export interface Role {
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  startDate: Date | null
  /** How many people on the bench have any overlap with it at all. */
  plausibleOnBench: number
  /** Our own history, for the rate question. */
  history: Observation[]
  now: Date
}

// ── The checks ────────────────────────────────────────────────────────

/**
 * Is the money realistic.
 *
 * Against what has actually cleared for work like this, not against a
 * survey. A ceiling below the bottom quartile is the single commonest
 * reason a role sits open for a month, and it is knowable on the day it
 * is written down.
 */
export function rateRealistic(r: Role): Finding | null {
  const market = band(r.history, { skills: r.skills, location: r.location }, r.now)

  if (!market || market.sample < ENOUGH) {
    // Nothing to say. A quality score built on three observations would
    // fail good roles and be switched off inside a week.
    return null
  }

  const d = (c: number) => `$${Math.round(c / 100)}`

  if (r.billMax !== null && r.billMax < market.p25) {
    return {
      code: 'RATE_REALISTIC',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `This tops out at ${d(r.billMax)} and nothing under ${d(market.p25)} has cleared for work like this in ${market.sample} submissions. Raise the ceiling or expect it to sit open.`,
      evidence: `billMax ${r.billMax} < p25 ${market.p25} (n=${market.sample})`,
    }
  }

  // Above the market is not a fault. It is a role that will fill fast, and
  // saying so is more useful than saying nothing.
  const above = warnAbout(r.billMax ?? 0, market)
  if (r.billMax !== null && above.where === 'ABOVE') {
    return {
      code: 'RATE_REALISTIC',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `At ${d(r.billMax)} this is above the ${d(market.p75)} most of these clear at. It should fill quickly.`,
      evidence: `billMax ${r.billMax} > p75 ${market.p75} (n=${market.sample})`,
    }
  }

  return {
    code: 'RATE_REALISTIC',
    checker: 'RULE',
    verdict: 'PASS',
    reason: `${d(r.billMax ?? market.p50)} is inside what these clear at — ${d(market.p25)} to ${d(market.p75)}.`,
    evidence: `n=${market.sample}`,
  }
}

/**
 * Is the must-have list a list or a wish.
 *
 * Six is generous. Past that the intersection is usually one person in the
 * country and they are not looking.
 */
export function askableSkills(r: Role): Finding {
  if (r.skills.length === 0) {
    return {
      code: 'SKILLS_ASKABLE',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: 'No skills on this role. Nothing can be matched against it and nobody can be scored.',
    }
  }

  if (r.skills.length > TOO_MANY_MUST_HAVES) {
    return {
      code: 'SKILLS_ASKABLE',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `${r.skills.length} required skills. Past ${TOO_MANY_MUST_HAVES} the list stops describing a person — decide which two or three actually matter.`,
      evidence: r.skills.join(', '),
    }
  }

  return {
    code: 'SKILLS_ASKABLE',
    checker: 'RULE',
    verdict: 'PASS',
    reason: `${r.skills.length} required skill${r.skills.length === 1 ? '' : 's'}.`,
  }
}

/**
 * Is there anybody at all who could do it.
 *
 * Not a score — a count. Zero plausible people is not a matching problem
 * to be solved with a better model; it is a role for a bench that does not
 * exist, and knowing that on day one is worth more than knowing it on day
 * thirty.
 */
export function anybodyForIt(r: Role): Finding {
  if (r.plausibleOnBench === 0) {
    return {
      code: 'ANYBODY_FOR_IT',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `Nobody on the bench has any of these skills. Either this goes to the network or somebody gets hired for it.`,
      evidence: '0 plausible',
    }
  }

  if (r.plausibleOnBench < 3) {
    return {
      code: 'ANYBODY_FOR_IT',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `Only ${r.plausibleOnBench} on the bench come close. Worth opening it to the network as well.`,
      evidence: `${r.plausibleOnBench} plausible`,
    }
  }

  return {
    code: 'ANYBODY_FOR_IT',
    checker: 'RULE',
    verdict: 'PASS',
    reason: `${r.plausibleOnBench} on the bench could plausibly do it.`,
  }
}

/**
 * Is there time to fill it.
 *
 * A week is not enough to source, submit, interview and clear paperwork,
 * and a role that starts next Monday is either an extension of somebody
 * already there or a disappointment being scheduled.
 */
export function timeToFill(r: Role): Finding | null {
  if (!r.startDate) return null

  const days = Math.ceil((r.startDate.getTime() - r.now.getTime()) / 86400000)

  if (days < 0) {
    return {
      code: 'TIME_TO_FILL',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `The start date was ${Math.abs(days)} days ago. Move it or close the role.`,
      evidence: r.startDate.toISOString().slice(0, 10),
    }
  }

  if (days < TOO_SOON_DAYS) {
    return {
      code: 'TIME_TO_FILL',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `${days} days to source, submit, interview and clear paperwork. Somebody is going to be disappointed — move the date or say plainly that it will slip.`,
      evidence: `${days} days`,
    }
  }

  return {
    code: 'TIME_TO_FILL',
    checker: 'RULE',
    verdict: 'PASS',
    reason: `${days} days to fill it.`,
  }
}

/**
 * Do the rate bounds contradict each other.
 *
 * Cheap, and it happens: a floor above the ceiling comes from a
 * copy-and-paste and then nothing matches, and nobody knows why.
 */
export function boundsAgree(r: Role): Finding | null {
  if (r.billMin === null || r.billMax === null) return null

  if (r.billMin > r.billMax) {
    return {
      code: 'BOUNDS_AGREE',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `The floor is above the ceiling — $${Math.round(r.billMin / 100)} to $${Math.round(r.billMax / 100)}. Nothing will ever match this.`,
      evidence: `${r.billMin} > ${r.billMax}`,
    }
  }

  return null
}

// ── The declaration ───────────────────────────────────────────────────

export const STEPS: Step<Role>[] = [
  { code: 'BOUNDS_AGREE', checker: 'RULE', run: boundsAgree },
  { code: 'SKILLS_ASKABLE', checker: 'RULE', run: askableSkills },
  { code: 'RATE_REALISTIC', checker: 'RULE', run: rateRealistic },
  { code: 'ANYBODY_FOR_IT', checker: 'RULE', run: anybodyForIt },
  { code: 'TIME_TO_FILL', checker: 'RULE', run: timeToFill },
]

export const SPEC = {
  name: 'requirement.quality',
  recordType: 'REQUIREMENT' as const,
  steps: STEPS,
  // Two, not three. Nothing here is a model and nothing gets better by
  // being asked again — the second run only exists to confirm a fix.
  maxAttempts: 2,
}

/**
 * A score out of a hundred, for the top of the screen.
 *
 * Not a grade on the manager. A shorthand for "how much of this is going
 * to go wrong", and it is only ever shown next to the reasons, because a
 * number alone tells nobody what to change.
 */
export function score(findings: Finding[]): number {
  const counted = findings.filter((f) => !f.unverified)
  if (counted.length === 0) return 100

  const failed = counted.filter((f) => f.verdict === 'FAIL').length
  return Math.round(((counted.length - failed) / counted.length) * 100)
}

/** What the score means, in words. */
export function grade(n: number): string {
  if (n === 100) return 'Nothing wrong with this one.'
  if (n >= 80) return 'Mostly fine, one thing to look at.'
  if (n >= 60) return 'This will be slow unless something changes.'
  return 'This role is unlikely to be filled as written.'
}
