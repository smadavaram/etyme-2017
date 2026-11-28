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

// ─────────────────────────────────────────────────────────────────────
// Who a listing reaches, and who may move it
// ─────────────────────────────────────────────────────────────────────
//
// Found on the founder's full lifecycle walk, 2026-09-28: a consultant a
// bench vendor added landed as RETAINED and stayed there forever. Nothing
// in the product wrote `BenchListing.tier` after the row was created, the
// network bench showed partners MARKETING listings only, and so the
// person's own "yes, market me" changed nothing any prime could see. The
// consent was real and it reached nobody.
//
// Two facts decide how far a listing reaches, and they belong to two
// different people:
//
//   **consent** is the consultant's — INVITED, GRANTED, DECLINED, or
//   taken back — and nothing reaches past the firm that asked until it
//   is GRANTED;
//
//   **tier** is the firm's — RETAINED keeps the person to the firm that
//   carries them, MARKETING shows them to the firms on its register.
//
// Before this, the network bench read the tier and ignored the consent,
// so a MARKETING listing nobody had answered — or one the person had
// declined — was shown to every partner of the firm that asked.

export type ListingTier = 'RETAINED' | 'MARKETING'
export type ListingConsent = 'INVITED' | 'GRANTED' | 'DECLINED'

export interface ListingFacts {
  tier: ListingTier
  state: ListingConsent | string
  revokedAt: Date | null
}

/**
 * How far a listing reaches.
 *
 *   NOBODY     taken back; the listing is spent and no screen shows it
 *   FIRM_ONLY  the firm that holds it, and no other
 *   NETWORK    the firm, and the firms on that firm's register
 */
export type Reach = 'NOBODY' | 'FIRM_ONLY' | 'NETWORK'

export interface ReachVerdict {
  reach: Reach
  /** Said to the firm that holds the listing, about the person. */
  says: string
}

export function whoSees(l: ListingFacts): ReachVerdict {
  if (l.revokedAt) {
    return { reach: 'NOBODY', says: 'They took this listing back. Nobody sees them through it.' }
  }
  if (l.state === 'DECLINED') {
    return {
      reach: 'FIRM_ONLY',
      says: 'They declined. Only you see this row, as a record of having asked; nobody else is shown them.',
    }
  }
  if (l.state !== 'GRANTED') {
    return {
      reach: 'FIRM_ONLY',
      says: 'Not answered yet. Only you see them until they say yes.',
    }
  }
  if (l.tier === 'RETAINED') {
    return {
      reach: 'FIRM_ONLY',
      says: 'Retained: only you see them. Market them to show them to the firms you work with.',
    }
  }
  return {
    reach: 'NETWORK',
    says: 'They agreed to be marketed, so the firms you work with see them on their network bench.',
  }
}

/**
 * What a partner's network bench asks the database for.
 *
 * Exactly the listings `whoSees` says reach the network, and nothing
 * wider: live, answered yes, and marketed. Spread into a Prisma `where`
 * beside the partner company filter.
 */
export const NETWORK_VISIBLE = {
  revokedAt: null,
  state: 'GRANTED',
  tier: 'MARKETING',
} as const

export interface TierChange {
  listing: ListingFacts
  to: string
  /**
   * Whether another firm holds a live, granted RETAINED listing on the
   * same person. Asked of the database by the caller; never named here.
   */
  retainedElsewhere: boolean
}

export interface TierVerdict {
  ok: boolean
  /** True where the listing already has the tier asked for. */
  unchanged?: boolean
  code?: 'VALIDATION' | 'TAKEN_BACK' | 'DECLINED' | 'RETAINED_ELSEWHERE'
  says: string
}

/**
 * Whether a firm may move one of its own listings between tiers.
 *
 * The tier is the firm's commercial choice and needs no fresh consent:
 * the person agreed to be put forward by this firm, and whether the firm
 * also shows them to its partners is how it does that, not a new thing
 * it does to them. What the tier cannot do is outrun the consent — a
 * listing the person declined or took back is not the firm's to move.
 *
 * And a person has one retained bench. Retaining is a claim to carry
 * somebody between assignments, and two firms each claiming it is the
 * state `demo-seed-consultant` already calls the one that should never
 * exist. The refusal says so without saying who, because a consultant on
 * two benches is nobody's business but theirs.
 */
export function mayChangeTier(c: TierChange): TierVerdict {
  if (c.to !== 'RETAINED' && c.to !== 'MARKETING') {
    return { ok: false, code: 'VALIDATION', says: 'A listing is either retained or marketing.' }
  }
  if (c.listing.revokedAt) {
    return {
      ok: false,
      code: 'TAKEN_BACK',
      says: 'They took this listing back, so it is not yours to change. Ask them again if you want them on your bench.',
    }
  }
  if (c.listing.state === 'DECLINED') {
    return {
      ok: false,
      code: 'DECLINED',
      says: 'They declined to be marketed by you, so there is no listing to change. Asking again is a conversation.',
    }
  }
  if (c.listing.tier === c.to) {
    return { ok: true, unchanged: true, says: whoSees(c.listing).says }
  }
  if (c.to === 'RETAINED' && c.retainedElsewhere) {
    return {
      ok: false,
      code: 'RETAINED_ELSEWHERE',
      says:
        'Another firm already retains them, and a person has one retained bench. ' +
        'You can still market them.',
    }
  }
  const after = whoSees({ ...c.listing, tier: c.to })
  return {
    ok: true,
    says:
      c.to === 'MARKETING'
        ? `Marketed. ${after.says}`
        : 'Retained. The firms you work with no longer see them on their network bench; you still can.',
  }
}

/**
 * The one line under a submission on a person's own "Every time you were
 * put forward" list. A placement is the end of the road, so it never also
 * reads "not sent on yet" — Helena Marsh's row said both at once (bench
 * tester, 2026-09-30). Otherwise: where it went, or that it is still with
 * the firm that has it.
 */
export function historyLine(h: { status: string; client: string; sentOnTo: string | null }): string {
  if (h.status === 'PLACED') return `placed at ${h.client}`
  if (h.sentOnTo) return `sent on to ${h.sentOnTo}`
  return 'still with them \u2014 not sent on yet'
}
