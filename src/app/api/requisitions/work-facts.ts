/**
 * Where a job's work is done, and whether it offers sponsorship, read
 * from what the job request form sent.
 *
 * Decided by the founder, 2026-11-03 ("Work authorization is checked
 * where the work is done"): an onsite or hybrid job is checked against
 * its site's country, a remote one against where the person works from.
 * That needs the work mode on the job, which nothing wrote until now.
 *
 * And a job that offers no sponsorship is the one restriction a hiring
 * manager may set on her own, because it is lawful on its face: it turns
 * away only somebody who would need a visa filed for them. It is written
 * the way lib/work-authorisation reads a restriction — "needs no
 * sponsor", the basis SPONSORSHIP_UNAVAILABLE, and the firm's own words
 * for its policy as the cite — so the screen and the vendor's check hold
 * back exactly the people the policy covers, and never a green card
 * holder or a citizen.
 *
 * Beside the route rather than in src/lib, because a new file there needs
 * an owner in src/lib/domains.ts. Pure: no database, no clock.
 */

import { NEEDS_NO_SPONSOR_VALUE } from '@/lib/checks'

export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const
export type WorkMode = (typeof WORK_MODES)[number]

/** The longest policy sentence kept, so the cite stays a sentence. */
export const POLICY_MAX = 300

export type WorkFacts = {
  /** Null where the caller did not say (an import, an older caller). */
  workMode: WorkMode | null
  /** The three columns, only where the job offers no sponsorship. */
  restriction: { workAuthRequired: string; workAuthBasis: 'SPONSORSHIP_UNAVAILABLE'; workAuthCite: string } | null
}

export type WorkFactsRead =
  | { ok: true; facts: WorkFacts }
  | { ok: false; field: 'workMode' | 'sponsorshipPolicy' | 'sponsorship'; says: string }

/**
 * The form's answers, checked. A work mode that is not one of the three
 * is refused rather than stored, because a reader comparing against
 * REMOTE must never meet "remote-ish". "No" with no words is refused,
 * because a policy nobody can quote is one nobody can check.
 */
export function readWorkFacts(body: {
  workMode?: unknown
  sponsorship?: unknown
  sponsorshipPolicy?: unknown
}): WorkFactsRead {
  let workMode: WorkMode | null = null
  if (body.workMode != null && body.workMode !== '') {
    const m = String(body.workMode).trim().toUpperCase()
    if (!(WORK_MODES as readonly string[]).includes(m)) {
      return { ok: false, field: 'workMode', says: 'Say where the work is done: on site, hybrid or remote.' }
    }
    workMode = m as WorkMode
  }

  const s = body.sponsorship == null || body.sponsorship === '' ? null : String(body.sponsorship).trim().toUpperCase()
  if (s !== null && s !== 'YES' && s !== 'NO') {
    return { ok: false, field: 'sponsorship', says: 'Say whether this job offers sponsorship: yes or no.' }
  }
  if (s !== 'NO') return { ok: true, facts: { workMode, restriction: null } }

  const policy = typeof body.sponsorshipPolicy === 'string' ? body.sponsorshipPolicy.trim() : ''
  if (!policy) {
    return {
      ok: false,
      field: 'sponsorshipPolicy',
      says: 'Say your policy in a few words, for example "We do not sponsor work visas for this role". Suppliers read it, and it is the reason on record when somebody who needs a visa is held back.',
    }
  }
  if (policy.length > POLICY_MAX) {
    return { ok: false, field: 'sponsorshipPolicy', says: `Keep the policy to ${POLICY_MAX} characters; it is one sentence.` }
  }
  return {
    ok: true,
    facts: {
      workMode,
      restriction: {
        workAuthRequired: NEEDS_NO_SPONSOR_VALUE,
        workAuthBasis: 'SPONSORSHIP_UNAVAILABLE',
        workAuthCite: policy,
      },
    },
  }
}
