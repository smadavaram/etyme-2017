/**
 * Ending, pausing and restoring somebody's access.
 *
 * Access could be granted and never taken away. An API key could be
 * revoked, a document share could be revoked, a bench listing could be
 * revoked — a person could not. Somebody leaves, and their seat stays
 * live until a database edit.
 *
 * That also made the rest of this system quietly dishonest: the access
 * screen reported dormant grants and the watcher chased them, and neither
 * offered any way to act on what they had found.
 *
 * Four states, and the distinction between the middle two is the whole
 * point:
 *
 *   INVITED    somebody made them a seat; they have never signed in
 *   ACTIVE     working
 *   SUSPENDED  paused, reversibly, and they can be told why
 *   REVOKED    ended
 *
 * **Suspension is not a soft delete.** It is for a real situation — a
 * leave of absence, a lapsed visa, an investigation — where the person is
 * coming back and their history must stay attached to them. Using
 * revocation for that loses the thread; using suspension for a leaver
 * leaves a live-looking seat.
 *
 * Nothing here is ever deleted. A person who worked somewhere worked
 * there, and an audit six months later needs to find them.
 */

export type AccessState = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED'

export interface AccessRow {
  contextId: string
  personId: string
  /** Whether they have ever actually signed in. */
  hasSignedIn: boolean
  roleId: string | null
  rolePermissions: string[]
  suspendedAt: Date | null
  revokedAt: Date | null
}

export function stateOf(row: AccessRow): AccessState {
  if (row.revokedAt) return 'REVOKED'
  if (row.suspendedAt) return 'SUSPENDED'
  if (!row.hasSignedIn) return 'INVITED'
  return 'ACTIVE'
}

export interface Verdict {
  allowed: boolean
  reason: string
  /** What this actually does, said before somebody clicks. */
  consequences: string[]
}

/**
 * Who can still let people in if this one goes.
 *
 * The lockout check. A company that suspends or revokes its last
 * team.manage holder cannot grant anything ever again, and the only
 * remedy is somebody editing the database — which for a customer means a
 * support ticket and for us means touching their data.
 *
 * The same rule already guards role editing. It has to guard this too,
 * because removing the person is the same act as removing the permission.
 */
function othersWhoCanManage(rows: AccessRow[], excludingContextId: string): number {
  return rows.filter(
    (r) =>
      r.contextId !== excludingContextId &&
      !r.revokedAt &&
      !r.suspendedAt &&
      // An invited person who has never signed in cannot rescue anybody.
      r.hasSignedIn &&
      (r.rolePermissions.includes('*') || r.rolePermissions.includes('team.manage'))
  ).length
}

export function canSuspend(target: AccessRow, all: AccessRow[]): Verdict {
  const state = stateOf(target)

  if (state === 'REVOKED') {
    return { allowed: false, reason: 'Their access has already ended.', consequences: [] }
  }
  if (state === 'SUSPENDED') {
    return { allowed: false, reason: 'They are already suspended.', consequences: [] }
  }

  const canManage =
    target.rolePermissions.includes('*') || target.rolePermissions.includes('team.manage')

  if (canManage && othersWhoCanManage(all, target.contextId) === 0) {
    return {
      allowed: false,
      reason:
        'They are the only person here who can manage access. Suspending them would lock everybody out of granting anything, with no way back except somebody editing the database. Give another person team.manage first.',
      consequences: [],
    }
  }

  return {
    allowed: true,
    reason: 'Paused, and reversible.',
    consequences: [
      'They cannot sign in or see anything until this is lifted.',
      'Everything they have done stays attached to them — timesheets, approvals, submissions.',
      'Lifting it puts them back exactly where they were, with the same role.',
    ],
  }
}

export function canReinstate(target: AccessRow): Verdict {
  const state = stateOf(target)

  if (state === 'ACTIVE' || state === 'INVITED') {
    return { allowed: false, reason: 'They are not suspended.', consequences: [] }
  }
  if (state === 'REVOKED') {
    return {
      allowed: false,
      // A revoked seat is a decision somebody made. Undoing it silently
      // would make revocation feel unreliable and suspension pointless.
      reason:
        'Their access was ended rather than paused, so it is not reinstated — give them a fresh seat. Everything they did before is still theirs.',
      consequences: [],
    }
  }

  return {
    allowed: true,
    reason: 'Back where they were.',
    consequences: ['They can sign in again with the same role they had before.'],
  }
}

export function canRevoke(target: AccessRow, all: AccessRow[]): Verdict {
  if (stateOf(target) === 'REVOKED') {
    return { allowed: false, reason: 'Their access has already ended.', consequences: [] }
  }

  const canManage =
    target.rolePermissions.includes('*') || target.rolePermissions.includes('team.manage')

  if (canManage && othersWhoCanManage(all, target.contextId) === 0) {
    return {
      allowed: false,
      reason:
        'They are the only person here who can manage access. Ending it would lock everybody out with no way back. Give another person team.manage first.',
      consequences: [],
    }
  }

  return {
    allowed: true,
    reason: 'Ended.',
    consequences: [
      'They cannot sign in here again.',
      'Everything they did stays on the record with their name on it — nothing is deleted.',
      'If they come back they get a new seat rather than this one.',
    ],
  }
}

/**
 * Whether a person can be removed outright rather than have access ended.
 *
 * Almost never. A person who approved a timesheet, raised a requisition or
 * was placed on a contract is part of how those things are explained, and
 * deleting them leaves an approval signed by nobody.
 *
 * Only somebody invited who never arrived can genuinely be removed — there
 * is nothing to explain.
 */
export interface Footprint {
  hasSignedIn: boolean
  approvals: number
  submissions: number
  contracts: number
  timesheets: number
  otherCompanies: number
}

export function canDeleteOutright(f: Footprint): Verdict {
  const history = f.approvals + f.submissions + f.contracts + f.timesheets

  if (f.hasSignedIn || history > 0) {
    const bits: string[] = []
    if (f.approvals) bits.push(`${f.approvals} approval(s)`)
    if (f.submissions) bits.push(`${f.submissions} submission(s)`)
    if (f.contracts) bits.push(`${f.contracts} contract(s)`)
    if (f.timesheets) bits.push(`${f.timesheets} timesheet(s)`)

    return {
      allowed: false,
      reason:
        bits.length > 0
          ? `They are attached to ${bits.join(', ')}. Deleting them would leave those signed by nobody. End their access instead — the record stays, and they cannot get back in.`
          : 'They have signed in, so they are part of the record. End their access instead.',
      consequences: [],
    }
  }

  if (f.otherCompanies > 0) {
    return {
      allowed: false,
      reason:
        'They hold a seat at another company as well, so the person is not yours to delete. Removing this seat is all that is needed.',
      consequences: [],
    }
  }

  return {
    allowed: true,
    reason: 'Invited, never arrived, nothing attached.',
    consequences: ['The invitation disappears. If they were meant to be here, invite them again.'],
  }
}

// ── Inviting somebody who has not signed in ───────────────────────────

export interface InviteCheck {
  ok: boolean
  reason: string
  /** True when the address is not on the company's own domain. */
  outsider: boolean
}

/**
 * Whether this address should be given a seat.
 *
 * Anybody on the verified company domain joins by signing in — they do not
 * need an invitation, and offering one duplicates the seat. An invitation
 * is for the case the domain rule cannot cover: a contractor on their own
 * address, somebody at a subsidiary with a different domain.
 *
 * So an invitation to your own domain is refused with the reason, rather
 * than quietly creating a second path in.
 */
export function checkInvite(
  email: string,
  companyDomain: string | null,
  alreadyHere: boolean
): InviteCheck {
  const clean = email.trim().toLowerCase()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, reason: 'That is not an email address.', outsider: false }
  }
  if (alreadyHere) {
    return { ok: false, reason: 'They already have a seat here.', outsider: false }
  }

  const domain = clean.split('@')[1]
  const ownDomain = companyDomain !== null && domain === companyDomain.toLowerCase()

  if (ownDomain) {
    return {
      ok: false,
      reason: `Anybody at ${companyDomain} joins by signing in — they do not need an invitation. Send them the address instead.`,
      outsider: false,
    }
  }

  return {
    ok: true,
    // Said out loud because it is the whole risk of the feature: an
    // invitation is a hole in the domain rule, deliberately punched.
    reason: `${clean} is outside ${companyDomain ?? 'your domain'}, so they can only get in because you asked them.`,
    outsider: true,
  }
}
