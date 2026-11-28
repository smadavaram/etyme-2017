/**
 * Whether a round may be booked for this person, on the job's permit rule.
 *
 * Decided by the founder, 2026-11-03 ("Work authorization is checked where
 * the work is done"): a person the record already says the job may
 * lawfully turn away is never interviewed for it. The interview door asks
 * the two questions the put-forward and screening ask, and says their
 * sentence, so a round is never booked past a refusal:
 *
 *  - the sponsorship refusal at the put-forward (`sponsorshipAtSubmission`,
 *    BLOCK only where the job recorded its basis and the work is in the US);
 *  - screening's FAIL on the permit (`authDecision`, BLOCK only on a
 *    recorded lawful basis). An offshore person is never refused over a
 *    no-sponsorship policy, because a US petition does not come into it;
 *    export control, a clearance or a statute still applies wherever the
 *    work is done.
 *
 * A WARN never stops a round: the person stays in the pile, and the
 * warning is on the row already. Pure: the route reads the facts.
 */
import { jobRestriction } from '@/lib/checks'
import { authDecision, type WorkAuth } from '@/lib/work-authorisation'
import { sponsorshipAtSubmission } from '../../work-authorization'

export function permitRefusal(args: {
  personName: string
  /** The person's recorded status, where somebody recorded one. */
  workAuth: string | null
  needsSponsorship: boolean | null
  saidAt: Date | null
  quote: string | null
  job: { workAuthRequired: string | null; workAuthBasis: string | null; workAuthCite: string | null }
  work: { country: string; offshore: boolean } | null
}): string | null {
  const sponsor = sponsorshipAtSubmission(args)
  if (sponsor.outcome === 'BLOCK') return sponsor.says

  const r = jobRestriction(args.job.workAuthRequired, args.job.workAuthBasis, args.job.workAuthCite)
  if (!r || !r.basis || !args.workAuth) return null
  if (args.work?.offshore && r.basis === 'SPONSORSHIP_UNAVAILABLE') return null
  const d = authDecision(r, args.workAuth.toUpperCase() as WorkAuth)
  return d.verdict === 'BLOCK' ? `${d.reason} Held back.` : null
}
