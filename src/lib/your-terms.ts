/**
 * Where a person agrees their own terms, while a placement of theirs is
 * waiting on them.
 *
 * Since 2026-10-06 an award of a bench-listed person writes no pay line:
 * the placement reads "Awarded, terms pending" until the first firm states
 * how it engages the person and at what rate, and the person agrees
 * (`lib/award/hire-terms`, demand's). The page that happens on is
 * `/dashboard/submissions/[id]/terms`, keyed on the submission the first
 * firm made — the bottom of any chain, the one with nothing below it — and
 * the only way to it was the notification. A page reachable only from a
 * letter is a dead end for anybody who read the letter on Tuesday and came
 * looking on Thursday, which is the same reason "Your paperwork" is on the
 * menu. So the shell asks this, and offers "Your terms" under "You".
 *
 * Whether terms are on record is `termsOnRecordFor` and nothing else, so
 * the menu, the award, the terms page and the contractor list cannot
 * disagree about it. A placement already started, ended or called off is
 * not asked about: its terms are history, not a question.
 */

import { prisma } from '@/lib/db'
import { termsOnRecordFor } from '@/lib/award/terms-on-record'

/** Lines that have not started — the only ones whose terms can be pending. */
export const NOT_STARTED: readonly string[] = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED']

export interface FirstSubmission {
  id: string
  fromCompanyId: string
  requirementId: string
}

export interface LineAt {
  id: string
  companyId: string
  requirementId: string | null
  state: string
}

/**
 * The terms page for the first submission whose own line is not started
 * and whose terms are not on record, oldest first. Pure: the reads are
 * the caller's.
 */
export function pendingTermsHref(
  subs: readonly FirstSubmission[],
  lines: readonly LineAt[],
  onRecord: (sellId: string) => boolean | undefined
): string | null {
  for (const s of subs) {
    const line = lines.find((l) => l.companyId === s.fromCompanyId && l.requirementId === s.requirementId)
    if (!line || !NOT_STARTED.includes(line.state)) continue
    if (onRecord(line.id) === false) return `/dashboard/submissions/${s.id}/terms`
  }
  return null
}

/** The href for this person, or null. Reads; never writes. */
export async function yourTermsHref(personId: string): Promise<string | null> {
  const subs = await prisma.submission.findMany({
    where: { personId, parentSubmissionId: null },
    select: { id: true, fromCompanyId: true, requirementId: true },
    orderBy: { submittedAt: 'asc' },
    take: 50,
  })
  if (subs.length === 0) return null
  const lines = await prisma.sellContract.findMany({
    where: {
      personId,
      state: { in: [...NOT_STARTED] as any },
      OR: subs.map((s) => ({ companyId: s.fromCompanyId, requirementId: s.requirementId })),
    },
    select: { id: true, companyId: true, requirementId: true, state: true },
  })
  if (lines.length === 0) return null
  const terms = await termsOnRecordFor(lines.map((l) => l.id))
  return pendingTermsHref(subs, lines, (id) => terms.get(id)?.onRecord)
}
