/**
 * What a vendor is shown of an invitation.
 *
 * CLAUDE.md invariant:
 *   "Rate bands live on RequirementInvitation, never on Requirement where a
 *    recipient could read another vendor's rate."
 *
 * The schema keeps half of that. This function keeps the other half, and it
 * is separate from the route so the shape can be asserted by test rather
 * than trusted by review.
 *
 * The projection is written out field by field on purpose. Never spread the
 * requirement here: the realistic failure is not a deliberate leak, it is a
 * field added to Requirement in eighteen months quietly riding out on a
 * spread, long after whoever wrote the invariant has gone.
 */

export interface InvitationRow {
  id: string
  toCompanyId: string
  payMin: number | null
  payMax: number | null
  message: string | null
  status: string
  expiresAt: Date
  createdAt: Date
  fromCompany: { id: string; name: string; slug: string }
  requirement: {
    id: string
    title: string
    skills: string[]
    location: string | null
    headcount: number
    months: number | null
    neededBy: Date | null
    status: string
    /** The client's own ceiling. Present on the row, never in the output. */
    billMin: number | null
    billMax: number | null
    invitationCount: number
  }
}

export interface VendorInvitationView {
  id: string
  requirement: {
    id: string
    title: string
    skills: string[]
    location: string | null
    headcount: number
    months: number | null
    neededBy: string | null
    status: string
  }
  from: { id: string; name: string; slug: string }
  band: { payMin: number | null; payMax: number | null }
  message: string | null
  status: string
  expiresAt: string
  expired: boolean
  otherInviteeCount: number
  submittedCount: number
  createdAt: string
}

export function projectInvitationForVendor(
  inv: InvitationRow,
  submittedCount: number,
  now: Date
): VendorInvitationView {
  const r = inv.requirement
  const expired = inv.expiresAt < now

  return {
    id: inv.id,
    requirement: {
      id: r.id,
      title: r.title,
      skills: r.skills,
      location: r.location,
      headcount: r.headcount,
      months: r.months,
      neededBy: r.neededBy?.toISOString() ?? null,
      status: r.status,
      // billMin / billMax deliberately absent — omitted, not nulled.
    },
    from: inv.fromCompany,
    // This vendor's band, and only this vendor's.
    band: { payMin: inv.payMin, payMax: inv.payMax },
    message: inv.message,
    // The vendor's own answer outranks the clock: having declined is more
    // informative than having run out of time.
    status: expired && inv.status === 'SENT' ? 'EXPIRED' : inv.status,
    expiresAt: inv.expiresAt.toISOString(),
    expired,
    // A number, not a list. Being one of four is fair to know; who the
    // other three are, and what they were offered, is not.
    otherInviteeCount: Math.max(0, r.invitationCount - 1),
    submittedCount,
    createdAt: inv.createdAt.toISOString(),
  }
}
