/**
 * Whether a consultant's record is finished enough to sell.
 *
 * ── What 2017 did, and what it got right ─────────────────────────────
 *
 * The `candidates` table carried nine boolean columns — is_number_verify,
 * is_personal_info_update, is_skill_update, is_documents_submit and the
 * rest — and `is_profile_active` opened only when they were all set.
 * A half-built record could not be marketed.
 *
 * That instinct was right and this file keeps it. A bench full of stubs
 * that look exactly like finished people is worse than a small bench,
 * because every filter, score and shortlist downstream treats them as
 * equals.
 *
 * ── Why this is derived instead of stored ────────────────────────────
 *
 * Nine columns is the wrong shape for the same idea.
 *
 *   Every new step is a migration, so steps stop being added.
 *   A flag and the data disagree the moment either is written without
 *   the other, and the flag is the one that gets believed.
 *   A boolean cannot say why it matters or what to do about it.
 *   One set of steps has to fit a W2 contractor and a one-person
 *   corporation, which have genuinely different requirements.
 *
 * So nothing is stored. Readiness is computed from the record itself,
 * every time, and cannot drift from it. It also needs no schema change,
 * which matters when four are already queued.
 *
 * ── And one thing 2017 got wrong ─────────────────────────────────────
 *
 * All-or-nothing. One missing field and the profile was invisible, which
 * is why real benches filled with records nobody bothered to finish —
 * the gate was too blunt to be worth passing.
 *
 * Here a step either BLOCKS or ADVISES. Blocking means a client cannot
 * make a decision at all: no skills is unmatchable, nowhere to work is
 * unplaceable, no way to reach them is unsubmittable. Everything else
 * lowers the odds and says so. Somebody missing only a headline is
 * weaker, not hidden.
 */

export type Weight = 'BLOCKS' | 'ADVISES'

export interface Step {
  key: string
  /** Said to the consultant, in their own terms. */
  label: string
  /** Why it matters to them, not to us. */
  why: string
  weight: Weight
  done: boolean
}

/**
 * The record, as facts rather than flags.
 *
 * Everything here already exists on ConsultantProfile, Person and
 * Resume. Nothing new is stored.
 */
export interface Record_ {
  name: string | null
  email: string | null
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  rateFloorCents: number | null
  availableFrom: Date | null
  resumeCount: number
  /** When they last confirmed the record themselves. */
  confirmedAt: Date | null
  /** Set when they trade through their own company rather than as an individual. */
  ownCompanyId: string | null
}

export interface Readiness {
  steps: Step[]
  /** Blocking steps outstanding. Zero means they can be put forward. */
  blocking: number
  /** Advisory steps outstanding. */
  weakening: number
  /**
   * Whether a vendor may market them at all.
   *
   * The gate 2017 had, narrowed to the things a client genuinely cannot
   * decide without.
   */
  marketable: boolean
  /**
   * The single next thing, or null when finished.
   *
   * One instruction, not a list of nine. A checklist of nine is a
   * checklist nobody starts.
   */
  next: Step | null
  says: string
}

/** How stale a confirmation may be before it counts as unconfirmed. */
const CONFIRMED_WITHIN_DAYS = 60

export function readiness(r: Record_, now: Date): Readiness {
  const has = (s: string | null) => Boolean(s && s.trim())

  const steps: Step[] = [
    {
      key: 'SKILLS',
      label: 'What you do',
      why: 'Nobody can match you to a role without it. This is the one that matters most.',
      weight: 'BLOCKS',
      done: r.skills.filter((s) => s.trim()).length > 0,
    },
    {
      key: 'LOCATION',
      label: 'Where you can work',
      why: 'Most roles are filtered by location before anybody reads a profile.',
      weight: 'BLOCKS',
      done: has(r.location),
    },
    {
      key: 'REACHABLE',
      label: 'A way to reach you',
      why: 'An agency that cannot contact you cannot put you forward.',
      weight: 'BLOCKS',
      done: has(r.email),
    },
    {
      key: 'HEADLINE',
      label: 'A line about yourself',
      why: 'It is the first thing a client reads, and often the only thing.',
      weight: 'ADVISES',
      done: has(r.headline),
    },
    {
      key: 'CV',
      label: 'A CV',
      why: 'Clients ask for one. Without it an agency writes their own version of you.',
      weight: 'ADVISES',
      done: r.resumeCount > 0,
    },
    {
      key: 'RATE',
      label: 'Your rate floor',
      why: 'Set it and nobody can list you below it. Leave it and they guess.',
      weight: 'ADVISES',
      done: r.rateFloorCents !== null && r.rateFloorCents > 0,
    },
    {
      key: 'AVAILABILITY',
      label: 'When you are free',
      why: 'A role starting before you are free is a wasted conversation for both of you.',
      weight: 'ADVISES',
      done: r.availableFrom !== null,
    },
    {
      key: 'WORK_AUTH',
      label: 'Your permission to work',
      why:
        'Recorded so nobody has to ask you the same question five times. ' +
        'It is never used to rule you out without a legal reason.',
      // Deliberately advisory. Unknown status is a question, never a
      // refusal — the same rule lib/work-authorisation enforces on the
      // other side of this.
      weight: 'ADVISES',
      done: has(r.workAuth),
    },
    {
      key: 'CONFIRMED',
      label: 'Confirm this is still true',
      why: 'Records nobody has confirmed rank below records people have.',
      weight: 'ADVISES',
      done:
        r.confirmedAt !== null &&
        (now.getTime() - r.confirmedAt.getTime()) / 86_400_000 <= CONFIRMED_WITHIN_DAYS,
    },
  ]

  // Somebody trading through their own company is answering different
  // questions, and asking an individual for them is noise.
  if (r.ownCompanyId) {
    steps.push({
      key: 'CORP',
      label: 'Your company details',
      why: 'You bill through your own company, so the paperwork is between the two firms.',
      weight: 'ADVISES',
      done: true,
    })
  }

  const outstanding = steps.filter((s) => !s.done)
  const blocking = outstanding.filter((s) => s.weight === 'BLOCKS').length
  const weakening = outstanding.length - blocking

  // Blocking first, then in the order listed — which is roughly the
  // order of how much each one buys.
  const next =
    outstanding.find((s) => s.weight === 'BLOCKS') ?? outstanding[0] ?? null

  return {
    steps,
    blocking,
    weakening,
    marketable: blocking === 0,
    next,
    says: saysOf(blocking, weakening, next),
  }
}

function saysOf(blocking: number, weakening: number, next: Step | null): string {
  if (blocking > 0 && next) {
    return `Not ready to be put forward yet. ${next.label} — ${next.why}`
  }
  if (weakening === 0) {
    return 'Your profile is complete. Nothing is holding you back.'
  }
  if (next) {
    return (
      `You can be put forward. ${weakening} thing${weakening === 1 ? '' : 's'} would make it more likely — ` +
      `start with: ${next.label.toLowerCase()}.`
    )
  }
  return 'Your profile is complete.'
}

/**
 * Said to a vendor looking at their own bench, rather than to the
 * person.
 *
 * Different audience, different sentence. A recruiter does not need
 * coaching; they need to know whether they can send this person
 * anywhere, and whose job it is to fix it if not.
 */
export function saysToVendor(r: Readiness, name: string): string {
  if (r.marketable && r.weakening === 0) return `${name} is ready to send.`
  if (r.marketable) {
    return r.weakening === 1
      ? `${name} can be sent, but one thing is missing — ask them.`
      : `${name} can be sent, but ${r.weakening} things are missing — ask them.`
  }
  return `${name} cannot be put forward: ${r.next?.label.toLowerCase() ?? 'the record is incomplete'} is missing.`
}
