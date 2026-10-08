/**
 * Who may do what here, and for how long.
 *
 * The assumption this file inverts: that access, once given, continues
 * until somebody remembers to take it away. Nobody ever remembers. The
 * result is every enterprise system on earth — a directory full of people
 * who left, contractors from a project that ended in 2029, and one
 * spreadsheet a year where a manager ticks names they do not recognize.
 *
 * So three rules, in order of how much they change:
 *
 *   Access ends. Every grant has a date. Renewing is a click; forgetting
 *   is safe. Permanent access is possible but has to be argued for, which
 *   is the opposite of today's default.
 *
 *   How long depends on what it can do. A grant that can move money or
 *   change permissions is short and reaffirmed often. A grant that can only
 *   read runs for a year, because pretending otherwise trains people to
 *   click renew without looking.
 *
 *   Unused access is not access, it is exposure. Somebody who has held
 *   invoices.approve for four months and approved nothing does not need it,
 *   and the system can see that without asking anyone.
 *
 * None of this is novel in security thinking. It is rare in products
 * because it is inconvenient to build and slightly inconvenient to use, and
 * the cost of not doing it lands on somebody else years later.
 */

import { hasPermission } from '@/lib/permissions'

export type GrantSensitivity = 'CRITICAL' | 'HIGH' | 'STANDARD' | 'READ_ONLY'

/**
 * Permissions that decide who else gets in, or that move money. These are
 * the ones worth reaffirming often.
 */
const CRITICAL = ['*', 'settings.manage', 'roles.manage', 'company.manage']
const HIGH = [
  'invoices.approve', 'invoices.issue', 'payments.record',
  'rates.write', 'assignments.write', 'assignments.terminate',
  'governance.write', 'compliance.write',
]

export function sensitivityOf(permissions: string[]): GrantSensitivity {
  if (permissions.some(p => CRITICAL.includes(p))) return 'CRITICAL'
  if (permissions.some(p => HIGH.includes(p))) return 'HIGH'
  if (permissions.every(p => p.endsWith('.read'))) return 'READ_ONLY'
  return 'STANDARD'
}

/**
 * How long before it has to be reaffirmed.
 *
 * Read-only runs a year on purpose. Making everything expire in ninety days
 * does not produce vigilance, it produces a monthly ritual of clicking
 * renew on things nobody reads — which is worse than a long expiry
 * honestly set.
 */
export function defaultDurationDays(sensitivity: GrantSensitivity): number {
  switch (sensitivity) {
    case 'CRITICAL': return 90
    case 'HIGH': return 180
    case 'STANDARD': return 270
    case 'READ_ONLY': return 365
  }
}

export interface GrantRequest {
  roleName: string
  permissions: string[]
  /** Null asks for access with no end date. */
  requestedDays: number | null
  reason: string
  /** True when the person granting it is the person receiving it. */
  selfGranted: boolean
  /** Whether anybody else at this company can already do this. */
  otherHoldersOfCritical: number
}

export interface GrantCheck {
  code: 'REASON' | 'SELF_GRANT' | 'DURATION' | 'LAST_ADMIN'
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  reason: string
}

export interface GrantDecision {
  allowed: boolean
  checks: GrantCheck[]
  sensitivity: GrantSensitivity
  /** Null only where permanent access was asked for and permitted. */
  expiresInDays: number | null
  summary: string
}

export function assessGrant(req: GrantRequest): GrantDecision {
  const checks: GrantCheck[] = []
  const sensitivity = sensitivityOf(req.permissions)

  // ── A reason, in words ──
  // Not paperwork. The person renewing this in six months is usually not
  // the person granting it now, and "because they asked" tells them nothing.
  const reason = req.reason.trim()
  checks.push(reason.length >= 10
    ? { code: 'REASON', outcome: 'PASS', reason: 'Reason recorded' }
    : {
        code: 'REASON',
        outcome: 'BLOCK',
        reason: 'Say why this person needs this. Whoever reviews it in six months will not know otherwise.',
      })

  // ── Granting yourself ──
  // Blocked outright at the top. Everywhere else it proceeds and is
  // conspicuous, because a small team where one person does everything is
  // a real situation and refusing it just moves the work off the platform.
  if (req.selfGranted && sensitivity === 'CRITICAL') {
    checks.push({
      code: 'SELF_GRANT',
      outcome: 'BLOCK',
      reason: 'You cannot give yourself this. Ask somebody else at your company.',
    })
  } else if (req.selfGranted) {
    checks.push({
      code: 'SELF_GRANT',
      outcome: 'WARN',
      reason: 'You granted this to yourself. It will show that way in the access review.',
    })
  } else {
    checks.push({ code: 'SELF_GRANT', outcome: 'PASS', reason: 'Granted by somebody else' })
  }

  // ── Duration ──
  const suggested = defaultDurationDays(sensitivity)
  let expiresInDays: number | null = req.requestedDays ?? suggested

  if (req.requestedDays === null) {
    // Access with no end date is allowed only where losing it cannot lock
    // the company out of its own account.
    if (sensitivity === 'READ_ONLY') {
      expiresInDays = null
      checks.push({
        code: 'DURATION',
        outcome: 'PASS',
        reason: 'Read-only access with no end date',
      })
    } else {
      expiresInDays = suggested
      checks.push({
        code: 'DURATION',
        outcome: 'WARN',
        reason: `Access that can change things does not run forever. Set to ${suggested} days; renewing is one click.`,
      })
    }
  } else if (req.requestedDays > suggested * 2) {
    expiresInDays = suggested * 2
    checks.push({
      code: 'DURATION',
      outcome: 'WARN',
      reason: `Shortened to ${suggested * 2} days, twice the usual for this level.`,
    })
  } else {
    checks.push({
      code: 'DURATION',
      outcome: 'PASS',
      reason: `Runs for ${expiresInDays} days, then needs reaffirming`,
    })
  }

  // ── Never lock the company out ──
  // The rule that makes expiry safe. Somebody must always be able to let
  // people back in, or a well-designed control becomes a support ticket.
  if (sensitivity === 'CRITICAL' && req.otherHoldersOfCritical === 0 && expiresInDays !== null) {
    checks.push({
      code: 'LAST_ADMIN',
      outcome: 'WARN',
      reason: 'This is the only account that can manage access here. Add a second before this one expires.',
    })
  } else {
    checks.push({ code: 'LAST_ADMIN', outcome: 'PASS', reason: 'Somebody else can also manage access' })
  }

  const blocks = checks.filter(c => c.outcome === 'BLOCK')
  const warns = checks.filter(c => c.outcome === 'WARN')

  return {
    allowed: blocks.length === 0,
    checks,
    sensitivity,
    expiresInDays,
    summary: blocks.length > 0
      ? blocks[0].reason
      : expiresInDays === null
        ? `${req.roleName} — read-only, no end date`
        : `${req.roleName} for ${expiresInDays} days${warns.length ? ` · ${warns.length} note(s)` : ''}`,
  }
}

// ── Reviewing what people already have ─────────────────────

export interface HeldAccess {
  contextId: string
  personName: string
  roleName: string
  permissions: string[]
  grantedAt: Date
  expiresAt: Date | null
  /** When this person last did anything needing this access. Null = never. */
  lastUsedAt: Date | null
}

export type AccessFinding =
  | 'EXPIRING'   // ends soon, still in use
  | 'EXPIRED'    // already past its date
  | 'DORMANT'    // held a while, never used
  | 'IDLE'       // used once, not for a long time
  | 'HEALTHY'

export interface AccessReviewItem {
  contextId: string
  personName: string
  roleName: string
  finding: AccessFinding
  detail: string
  /** What to do, when there is something obvious. */
  suggestion: string | null
}

/** Held this long with no use at all, and it was never needed. */
const DORMANT_DAYS = 60
/** Used once, but not since. */
const IDLE_DAYS = 120
/** Close enough to expiry to warn somebody. */
const EXPIRING_DAYS = 14

const days = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000)

/**
 * What is worth someone's attention, and nothing else.
 *
 * An access review that lists everybody is an access review nobody reads.
 * Healthy grants are counted, not enumerated.
 */
export function reviewAccess(held: HeldAccess[], now: Date): AccessReviewItem[] {
  const out: AccessReviewItem[] = []

  for (const h of held) {
    const heldDays = days(now, h.grantedAt)

    if (h.expiresAt && h.expiresAt <= now) {
      out.push({
        contextId: h.contextId, personName: h.personName, roleName: h.roleName,
        finding: 'EXPIRED',
        detail: `Ended ${days(now, h.expiresAt)} days ago`,
        suggestion: h.lastUsedAt ? 'Renew it, or let it stay closed' : 'Nobody used it. Leave it closed.',
      })
      continue
    }

    if (!h.lastUsedAt && heldDays >= DORMANT_DAYS) {
      out.push({
        contextId: h.contextId, personName: h.personName, roleName: h.roleName,
        finding: 'DORMANT',
        detail: `Held ${heldDays} days, never used`,
        suggestion: 'Remove it. Nothing breaks — they have never used it.',
      })
      continue
    }

    if (h.lastUsedAt && days(now, h.lastUsedAt) >= IDLE_DAYS) {
      out.push({
        contextId: h.contextId, personName: h.personName, roleName: h.roleName,
        finding: 'IDLE',
        detail: `Last used ${days(now, h.lastUsedAt)} days ago`,
        suggestion: 'Ask whether they still need it',
      })
      continue
    }

    if (h.expiresAt && days(h.expiresAt, now) <= EXPIRING_DAYS) {
      out.push({
        contextId: h.contextId, personName: h.personName, roleName: h.roleName,
        finding: 'EXPIRING',
        detail: `Ends in ${days(h.expiresAt, now)} days`,
        // Someone actively using it should not be cut off mid-task.
        suggestion: h.lastUsedAt ? 'In active use — renew it' : 'Let it lapse unless they ask',
      })
    }
  }

  // Worst first: gone, then never used, then stale, then ending.
  const rank: Record<AccessFinding, number> = {
    EXPIRED: 0, DORMANT: 1, IDLE: 2, EXPIRING: 3, HEALTHY: 4,
  }
  return out.sort((a, b) => rank[a.finding] - rank[b.finding])
}

// ── Changing somebody's desk ───────────────────────────────

/**
 * The seat everybody gets by arriving. Spelled here rather than imported
 * because this file has no database and no company defaults in it; the
 * name is `MEMBER_ROLE` in lib/company-defaults and the two are pinned
 * together in `__tests__/invariants/access-desk.test.ts`.
 */
export const MEMBER_DESK = 'Member'
export const OWNER_DESK = 'Owner'

/**
 * What a row on "Everyone with access" says under the person's name.
 *
 * A Member can see their own work and nothing else, so the row says what
 * to do about it. Every other desk is just its name.
 */
export function deskLine(roleName: string): string {
  return roleName === MEMBER_DESK ? `${MEMBER_DESK} · give them a desk` : roleName
}

/**
 * The desks offered in the picker. Owner only to an Owner: an admin who
 * could make somebody an Owner could make themselves one by proxy.
 */
export function desksOffered<R extends { name: string }>(roles: R[], actorIsOwner: boolean): R[] {
  return roles.filter((r) => actorIsOwner || r.name !== OWNER_DESK)
}

export interface DeskChange {
  /** The desk the person holds now. Null for somebody still waiting. */
  fromRole: string | null
  toRole: string
  /** Whether the person changing it holds Owner. */
  actorIsOwner: boolean
  /** Whether the desk they hold now can give desks (settings.manage or everything). */
  fromCanGiveDesks: boolean
  /** Whether the new desk can. */
  toCanGiveDesks: boolean
  /** Other live seats here that can give desks. */
  othersWhoCanGiveDesks: number
  /** The person's name, for the sentence. */
  personName: string
}

export type DeskVerdict = { allowed: true } | { allowed: false; says: string }

/**
 * Whether a desk may move. Four refusals, each a sentence, and every
 * other change goes through `assessGrant` like a first grant does.
 */
export function assessDeskChange(c: DeskChange): DeskVerdict {
  if (c.fromRole === c.toRole) {
    return { allowed: false, says: `${c.personName} already works as ${c.toRole}.` }
  }
  if (c.toRole === OWNER_DESK && !c.actorIsOwner) {
    return { allowed: false, says: 'Only an Owner can make somebody an Owner.' }
  }
  if (c.fromRole === OWNER_DESK && !c.actorIsOwner) {
    return { allowed: false, says: `${c.personName} is an Owner. Only an Owner can change an Owner's desk.` }
  }
  if (c.fromCanGiveDesks && !c.toCanGiveDesks && c.othersWhoCanGiveDesks === 0) {
    return {
      allowed: false,
      says: `${c.personName} is the only one here who can give desks. Give that to somebody else first, then change this one.`,
    }
  }
  return { allowed: true }
}

/** Whether a set of permissions can give desks. */
export function canGiveDesks(permissions: string[]): boolean {
  return hasPermission(permissions, 'settings.manage')
}

// ── Waiting for access ─────────────────────────────────────

/**
 * What a row on "Waiting for access" says beside the address.
 *
 * An invitation is not a sign-in. Somebody invited who never came in has
 * not joined anything, and a row that says "joined today" sends the owner
 * looking for a person who is not there yet.
 */
export function waitingLine(w: { invited: boolean; signedIn: boolean; days: number; desk?: string | null }): string {
  const when = w.days <= 0 ? 'today' : w.days === 1 ? 'yesterday' : `${w.days} days ago`
  if (w.invited && !w.signedIn) {
    const base = `${w.days <= 0 ? 'Invited today' : `Invited ${when}`}, not yet signed in`
    return w.desk ? `${base} · will have the ${w.desk} desk` : base
  }
  return `joined ${when}`
}

/**
 * Whether the person behind a seat has ever signed in.
 *
 * A seat nobody invited was made by a sign-in, so it has. An invited seat
 * has once it was used here, or once the person signed in anywhere on
 * Etyme. The seat's own use date is not enough by itself: a desk change
 * clears it, so a person who signed in last week would read as never
 * having come.
 */
export function hasSignedIn(s: { invitedAt: Date | null; lastUsedAt: Date | null; everSignedIn: boolean }): boolean {
  return s.invitedAt === null || s.lastUsedAt !== null || s.everSignedIn
}

/**
 * Where a seat sits on Users & permissions.
 *
 * Round two of the sign-up walk: Pat Kim was invited as AP Clerk, never
 * signed in, and read under "Everyone with access" as somebody who had
 * it. An invitation is not access, whatever desk it carries. So a seat
 * with no desk, or whose person has never signed in, is WAITING; only a
 * seat with a desk and a person who came in is WITH_ACCESS.
 */
export function seatPlace(s: { roleName: string | null; signedIn: boolean }): 'WAITING' | 'WITH_ACCESS' {
  return s.roleName && s.signedIn ? 'WITH_ACCESS' : 'WAITING'
}

// ── Telling somebody their desk changed ────────────────────

/**
 * The notice a person gets when their desk is given or changed. Sent by
 * email as well as in the app: somebody waiting on a desk is not sitting
 * in the app refreshing it. `landing` is the page their new desk opens on.
 */
export function deskChangedNotice(n: {
  roleName: string
  companyName: string
  expiresAt: Date | null
  landing: string
}): { title: string; body: string; href: string } {
  const runs = n.expiresAt ? ` It runs until ${n.expiresAt.toISOString().slice(0, 10)}.` : ''
  return {
    title: `You now have the ${n.roleName} desk`,
    body: `You now have the ${n.roleName} desk at ${n.companyName}. Sign in to see it.${runs}`,
    href: n.landing,
  }
}

// ── The invitation email ───────────────────────────────────

/**
 * Which way in the invitation can offer.
 *
 * PASSWORD: the deployment can send mail, so the email carries a one-time
 *   link to set a password.
 * WORK_ACCOUNT: Microsoft or Google sign-in is set up, and no mail-based
 *   door; the email gives the sign-in address.
 * NONE: neither. The email still gives the sign-in address, and the
 *   person inviting is told to pass it on, because nothing here can prove
 *   the mailbox yet.
 */
/**
 * How long the set-password link in an invitation works. Longer than a
 * reset's hour, because an invitation is read when the person gets to it,
 * not the minute after they asked. After it lapses, "Forgot password"
 * on the sign-in page sends a fresh one.
 */
export const INVITE_LINK_HOURS = 72

export type InviteDoor = 'PASSWORD' | 'WORK_ACCOUNT' | 'NONE'

export interface InviteLetter {
  door: InviteDoor
  companyName: string
  /** Null where no desk was given yet. */
  roleName: string | null
  /** The one-time set-password link. Required where door is PASSWORD. */
  setPasswordUrl: string | null
  /** The sign-in page, absolute. Empty where this deployment does not know its own address. */
  loginUrl: string
  /** How long the set-password link works, in hours. */
  linkHours: number
  /** Whether Microsoft or Google sign-in is also on. */
  workAccount: boolean
}

/**
 * The words of the invitation email: always a way in, never only an
 * instruction. Returns the lines and the link, so the sender can keep the
 * link out of the stored copy.
 */
export function inviteLetter(l: InviteLetter): { lines: string[]; link: string | null } {
  const youAre = l.roleName
    ? `You are in ${l.companyName} as ${l.roleName}.`
    : `You are in ${l.companyName}. Somebody there will give you a desk once you are in.`
  const days = l.linkHours >= 24 ? `${Math.round(l.linkHours / 24)} days` : `${l.linkHours} hours`

  if (l.door === 'PASSWORD' && l.setPasswordUrl) {
    return {
      lines: [
        `Set your password to sign in. ${youAre}`,
        `The link works once, for ${days}. After that, use "Forgot password" on the sign-in page.`,
        ...(l.workAccount && l.loginUrl ? [`Or sign in with your work account at ${l.loginUrl}.`] : []),
      ],
      link: l.setPasswordUrl,
    }
  }
  if (l.loginUrl) {
    return {
      lines: [
        l.door === 'WORK_ACCOUNT'
          ? `Sign in with your work account at ${l.loginUrl}. ${youAre}`
          : `Sign in at ${l.loginUrl}. ${youAre}`,
      ],
      link: null,
    }
  }
  // No address for this deployment: the email cannot carry a link, so it
  // says so rather than pointing nowhere. The inviter is told the same.
  return {
    lines: [
      `${youAre}`,
      'This invitation could not include a sign-in link. Ask the person who invited you for the address to sign in.',
    ],
    link: null,
  }
}
