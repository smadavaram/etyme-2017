/**
 * What one agency may learn about a consultant several agencies share.
 *
 * A contract consultant is on five or ten benches at once. Every one of
 * those agencies can open their profile, and each of them is a competitor
 * of all the others. So the interesting question on this screen is not
 * "what is in the database about this person" but "which of it belongs to
 * the agency asking".
 *
 * Two answers leaked before this existed, and both were one relation away
 * from a rival:
 *
 *   **Where else they work.** The contract list filtered on the person and
 *   nothing else, so any vendor holding assignments.read could see who
 *   else had placed them, at which client, and — with the bill rate
 *   permission — at what price. That is the most commercially damaging
 *   thing one agency can learn about another's consultant.
 *
 *   **Who else is considering them.** Match rows name a requirement. Left
 *   unscoped they say which client is looking at your shared consultant
 *   and how well they scored.
 *
 * The person themselves sees all of it, always. It is their work and their
 * career, and they are the only party here who is not a competitor.
 */

export interface Viewer {
  /** True when the caller is the consultant themselves. */
  isSubject: boolean
  /** The company they are acting for, if any. */
  companyId: string | null | undefined
}

/**
 * Which of a person's contracts this viewer may see.
 *
 * Party to it, or not at all: the vendor who sold them, the customer being
 * billed, or the client where the work happens. Returns a fragment to
 * spread into a Prisma `where` — empty when everything is visible, which
 * is only ever the person themselves.
 */
export function contractScopeFor(v: Viewer): Record<string, unknown> {
  if (v.isSubject) return {}
  if (!v.companyId) {
    // Not the subject and acting for nobody. There is no relationship
    // that could make another person's placements their business.
    return { id: '__none__' }
  }
  return {
    OR: [
      { companyId: v.companyId },
      { clientCompanyId: v.companyId },
      { endClientCompanyId: v.companyId },
    ],
  }
}

/**
 * Which matches this viewer may see.
 *
 * Roles they own, or roles they were invited to bid on. A match against
 * somebody else's requirement is somebody else's business.
 */
export function matchScopeFor(v: Viewer): Record<string, unknown> | null {
  if (!v.companyId) {
    // A consultant with no company sees their own and nothing else.
    return v.isSubject ? {} : null
  }
  return {
    requirement: {
      OR: [
        { companyId: v.companyId },
        { invitations: { some: { toCompanyId: v.companyId } } },
      ],
    },
  }
}

/**
 * Whether a bench listing may be shown to this viewer.
 *
 * Their own, or the person's own screen. Never another agency's — the
 * whole point of being on several benches is that none of them is told
 * about the others.
 */
export function maySeeListing(v: Viewer, listingCompanyId: string): boolean {
  return v.isSubject || listingCompanyId === v.companyId
}
