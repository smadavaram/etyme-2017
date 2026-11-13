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

import { hasPermission, inWords, PERMISSIONS } from '@/lib/permissions'
import { formatDay } from '@/lib/format-date'
import { effectiveMode, isLimitedPublicSeat, narrowForPublicSeat, type CompanyPolicy, type EffectiveMode } from '@/lib/identity/policy'
import { momentFor } from '@/lib/when'
import { clause } from '@/lib/owner-rules'
import { GRANT_LABELS } from '@/lib/permission-grants/words'

export type GrantSensitivity = 'CRITICAL' | 'HIGH' | 'STANDARD' | 'READ_ONLY'

/**
 * Permissions that decide who else gets in. A role holding any is Critical.
 * Exported so the legend on Users & permissions is read from the same list
 * the level is computed from, and cannot drift (founder, 2026-11-12: "two
 * unexplained systems on one row"). Names no permission catalog holds are
 * kept for a role written before the catalog narrowed; they match nothing
 * and are never said.
 */
export const CRITICAL_PERMISSIONS: readonly string[] = ['*', 'settings.manage', 'roles.manage', 'company.manage']
/** Permissions that move money, set rates, or end or extend a placement. A role holding any, and none of the above, is High. */
export const HIGH_PERMISSIONS: readonly string[] = [
  'invoices.approve', 'invoices.issue', 'payments.record',
  'rates.write', 'assignments.write', 'assignments.terminate',
  'governance.write', 'compliance.write',
]
const CRITICAL = CRITICAL_PERMISSIONS
const HIGH = HIGH_PERMISSIONS

export function sensitivityOf(permissions: string[]): GrantSensitivity {
  if (permissions.some(p => CRITICAL.includes(p))) return 'CRITICAL'
  if (permissions.some(p => HIGH.includes(p))) return 'HIGH'
  if (permissions.every(p => p.endsWith('.read'))) return 'READ_ONLY'
  return 'STANDARD'
}

// ── The level, said in words ───────────────────────────────────────────
//
// The founder, on Users & permissions at Tapin: each row showed a role
// ("AP & Payroll") and beside it "high" or "critical" in lower case, with
// nothing saying what either meant or how they relate. They are one
// system: the level is read off what the role can do. So the level is
// said in words, the chip says why in a sentence, and one legend says what
// each level means, every line built from the two lists above and the
// permission words Give access prints (`GRANT_LABELS`).

/** The level as a person reads it. Never the enum. */
export const LEVEL_LABEL: Record<GrantSensitivity, string> = {
  CRITICAL: 'Critical', HIGH: 'High', STANDARD: 'Standard', READ_ONLY: 'Read only',
}
/** The chip on a seat that holds the Member role: it holds nothing yet. */
export const NO_ROLE_LABEL = 'No role yet'

/** What one permission lets somebody do, in Give access's words; '*' is everything. Null for a name the catalog does not hold. */
function permissionSays(p: string): string | null {
  if (p === '*') return 'do everything here'
  return (GRANT_LABELS as Record<string, string>)[p] ?? null
}

/** "a, b or c". */
function orList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

const said = (list: readonly string[]) => list.map(permissionSays).filter((w): w is string => Boolean(w))

/**
 * The legend above "Everyone with access", one short line per level,
 * Critical first. Read from `CRITICAL_PERMISSIONS` and `HIGH_PERMISSIONS`
 * through Give access's words, so a permission moved between the lists
 * moves its words here in the same edit. Pure.
 */
export function levelLegend(): { key: GrantSensitivity | 'NO_ROLE'; label: string; says: string }[] {
  return [
    { key: 'CRITICAL', label: LEVEL_LABEL.CRITICAL, says: `A role that can ${orList(said(CRITICAL_PERMISSIONS))}, so it can change who has access.` },
    { key: 'HIGH', label: LEVEL_LABEL.HIGH, says: `A role that can ${orList(said(HIGH_PERMISSIONS))}.` },
    { key: 'STANDARD', label: LEVEL_LABEL.STANDARD, says: 'A role for everyday work that can do none of that.' },
    { key: 'READ_ONLY', label: LEVEL_LABEL.READ_ONLY, says: 'A role that can look and change nothing.' },
    { key: 'NO_ROLE', label: NO_ROLE_LABEL, says: 'Signed in with no role: they see their own pages and what is sent to them, until somebody gives them one.' },
  ]
}

/**
 * A seat's level and the sentence that says why, from its role's
 * permissions: "Critical because this role can change company settings, so
 * it can change who has access." The Member role, which holds nothing,
 * reads "No role yet", never Standard or Read only. Pure.
 */
export function levelOf(roleName: string | null, permissions: readonly string[]): { key: GrantSensitivity | 'NO_ROLE'; label: string; why: string } {
  if (!roleName || roleName === 'Member') {
    return { key: 'NO_ROLE', label: NO_ROLE_LABEL, why: `${NO_ROLE_LABEL}: they see their own pages and what is sent to them, until somebody gives them a role.` }
  }
  const key = sensitivityOf([...permissions])
  if (key === 'CRITICAL') {
    const by = said(permissions.filter((p) => CRITICAL.includes(p)))
    return { key, label: LEVEL_LABEL.CRITICAL, why: `Critical because this role can ${by[0] ?? 'change company settings'}, so it can change who has access.` }
  }
  if (key === 'HIGH') {
    const by = said(permissions.filter((p) => HIGH.includes(p)))
    return { key, label: LEVEL_LABEL.HIGH, why: `High because this role can ${orList(by.length ? by : ['move money or set rates'])}.` }
  }
  if (key === 'READ_ONLY') return { key, label: LEVEL_LABEL.READ_ONLY, why: 'Read only because this role can look and change nothing.' }
  return { key, label: LEVEL_LABEL.STANDARD, why: 'Standard because this role does everyday work and cannot change who has access, move money or set rates.' }
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
export const DORMANT_DAYS = 60
/** Used once, but not since. */
export const IDLE_DAYS = 120
/** Close enough to expiry to warn somebody. */
export const EXPIRING_DAYS = 14

/** A finding as a person reads it, never the enum ("dormant" was a system word). */
export const FINDING_WORDS: Record<AccessFinding, string> = {
  EXPIRED: 'ended',
  DORMANT: 'never used',
  IDLE: 'not used in a long while',
  EXPIRING: 'ending soon',
  HEALTHY: 'in use',
}

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
  return roleName === MEMBER_DESK ? `${MEMBER_DESK} · give them a role` : roleName
}

/**
 * How many seats need a decision on Users & permissions.
 *
 * Round three of the sign-up walk: the counter read "Needs a decision 0"
 * while Lee sat on the list as "Member · give them a desk" and the owner
 * had been emailed to give him one. A Member holds no permission, so a
 * signed-in Member is somebody waiting for a desk, and that is a decision
 * as much as an expired grant is. Counted once per seat: a Member who is
 * also on the review is one decision, not two.
 */
export function needsDecisionCount(
  review: { contextId: string }[],
  withAccess: { contextId: string; roleName: string }[],
): number {
  return decisionSeats(review, withAccess).size
}

/**
 * The seats "Needs a decision" counts, so the figure and the rows its
 * filter shows are one set and cannot disagree. Pure.
 */
export function decisionSeats(
  review: { contextId: string }[],
  withAccess: { contextId: string; roleName: string }[],
): Set<string> {
  const seats = new Set(review.map((r) => r.contextId))
  for (const s of withAccess) if (s.roleName === MEMBER_DESK) seats.add(s.contextId)
  return seats
}

// ── The figures at the top of Users & permissions ──────────────────────
//
// The founder, 2026-11-12: every figure says what it counts and whose move
// it is, in one line under the number, and a figure is a door to exactly
// the rows it counted. One pure function says them, reading the same day
// constants the review uses, so the words cannot say 60 where the rule
// reads 90.

/** Which rows a figure counts, as the query word in the page's address (`?show=invited`). */
export type FigureKey = 'with-access' | 'invited' | 'waiting-for-role' | 'paused' | 'decision'
export const FIGURE_KEYS: readonly FigureKey[] = ['with-access', 'invited', 'waiting-for-role', 'paused', 'decision']

/** The parts of "Needs a decision", each seat once. */
export interface DecisionParts { noRole: number; ended: number; neverUsed: number; notUsedLately: number; endingSoon: number }

/**
 * How the decision seats split: each review finding once (a seat has one
 * finding), and a Member seat counted as "no role yet" only where the
 * review has not already counted it, so the parts add up to the figure.
 * Pure.
 */
export function decisionParts(
  review: { contextId: string; finding: AccessFinding }[],
  withAccess: { contextId: string; roleName: string }[],
): DecisionParts {
  const p: DecisionParts = { noRole: 0, ended: 0, neverUsed: 0, notUsedLately: 0, endingSoon: 0 }
  const inReview = new Set<string>()
  for (const r of review) {
    if (inReview.has(r.contextId)) continue
    inReview.add(r.contextId)
    if (r.finding === 'EXPIRED') p.ended++
    else if (r.finding === 'DORMANT') p.neverUsed++
    else if (r.finding === 'IDLE') p.notUsedLately++
    else if (r.finding === 'EXPIRING') p.endingSoon++
  }
  const members = new Set<string>()
  for (const s of withAccess) if (s.roleName === MEMBER_DESK && !inReview.has(s.contextId)) members.add(s.contextId)
  p.noRole = members.size
  return p
}

/** "a, b and c". */
function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export interface FigureWords {
  key: FigureKey
  label: string
  value: number
  /** The line under the number: what it counts, then whose move it is. */
  says: string
  /** Above the list while the figure filters it: "3 invited". */
  showing: string
}

/**
 * One figure's words, or null for a figure of zero, which is not drawn,
 * except "With access", the baseline. Pure.
 */
export function figureWords(key: FigureKey, n: number, parts?: DecisionParts): FigureWords | null {
  if (n <= 0 && key !== 'with-access') return null
  const one = n === 1
  switch (key) {
    case 'with-access':
      return {
        key, label: 'With access', value: n,
        says: n === 0 ? 'Nobody can sign in and work yet. Invite somebody above.' : `${n} can sign in and work. Nothing to do.`,
        showing: `${n} with access`,
      }
    case 'invited':
      return { key, label: 'Invited', value: n, says: `${n} invited, never signed in. Send the invitation again or withdraw it.`, showing: `${n} invited` }
    case 'waiting-for-role':
      return { key, label: 'Waiting for a role', value: n, says: `${n} signed in with no role. Give ${one ? 'them' : 'each'} a role.`, showing: `${n} waiting for a role` }
    case 'paused':
      return { key, label: 'Paused', value: n, says: `${n} paused, cannot sign in. Reinstate or end ${one ? 'the seat' : 'each seat'}.`, showing: `${n} paused` }
    case 'decision': {
      const p = parts ?? { noRole: 0, ended: 0, neverUsed: 0, notUsedLately: 0, endingSoon: 0 }
      const named: string[] = []
      if (p.noRole) named.push(`${p.noRole} with no role yet`)
      if (p.neverUsed) named.push(`${p.neverUsed} never used in ${DORMANT_DAYS} days`)
      if (p.notUsedLately) named.push(`${p.notUsedLately} not used in ${IDLE_DAYS} days`)
      if (p.endingSoon) named.push(`${p.endingSoon} ending within ${EXPIRING_DAYS} days`)
      if (p.ended) named.push(`${p.ended} ended`)
      const what = named.length ? `: ${andList(named)}` : ''
      return {
        key, label: 'Needs a decision', value: n,
        says: `${n} to decide${what}. Give a role, renew it or end it.`,
        showing: `${n} that ${one ? 'needs' : 'need'} a decision`,
      }
    }
  }
}

/** The figures to draw, in order, zeros left out except With access. Pure. */
export function figuresFor(c: { withAccess: number; invited: number; waitingForRole: number; paused: number }, decisions: number, parts: DecisionParts): FigureWords[] {
  return [
    figureWords('with-access', c.withAccess),
    figureWords('invited', c.invited),
    figureWords('waiting-for-role', c.waitingForRole),
    figureWords('paused', c.paused),
    figureWords('decision', decisions, parts),
  ].filter((f): f is FigureWords => f !== null)
}

/** The query word read back, or null for none or a word no figure has. */
export function figureFromQuery(raw: string | null | undefined): FigureKey | null {
  return raw && (FIGURE_KEYS as readonly string[]).includes(raw) ? raw as FigureKey : null
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
    return { allowed: false, says: `${c.personName} is an Owner. Only an Owner can change an Owner's role.` }
  }
  if (c.fromCanGiveDesks && !c.toCanGiveDesks && c.othersWhoCanGiveDesks === 0) {
    return {
      allowed: false,
      says: `${c.personName} is the only one here who can give roles. Give that to somebody else first, then change this one.`,
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
    return w.desk ? `${base} · will have the ${w.desk} role` : base
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
  // A day a person reads, never a machine date (round three, #6).
  const runs = n.expiresAt ? ` It runs until ${formatDay(n.expiresAt)}.` : ''
  return {
    title: `You now have the ${n.roleName} role`,
    body: `You now have the ${n.roleName} role at ${n.companyName}. Sign in to see it.${runs}`,
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

/**
 * DIRECTORY: the company signs in through its own directory only, so the
 * email names the directory and carries no set-password link at all: a
 * password is a door that company has shut (founder, 2026-11-11).
 */
export type InviteDoor = 'PASSWORD' | 'WORK_ACCOUNT' | 'DIRECTORY' | 'NONE'

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
    : `You are in ${l.companyName}. Somebody there will give you a role once you are in.`
  const days = l.linkHours >= 24 ? `${Math.round(l.linkHours / 24)} days` : `${l.linkHours} hours`

  if (l.door === 'PASSWORD' && l.setPasswordUrl) {
    return {
      lines: [
        `Set your password and you are signed in. ${youAre}`,
        `The link works once, for ${days}. After that, use "Forgot password" on the sign-in page.`,
        ...(l.workAccount && l.loginUrl ? [`Or sign in with your work account at ${l.loginUrl}.`] : []),
      ],
      link: l.setPasswordUrl,
    }
  }
  if (l.door === 'DIRECTORY') {
    return {
      lines: [
        l.loginUrl
          ? `Sign in at ${l.loginUrl} through ${l.companyName}’s company directory, with this email address. ${youAre}`
          : `Sign in through ${l.companyName}’s company directory, with this email address. ${youAre}`,
      ],
      link: null,
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


// ── What the inviter is told ──────────────────────────────────────────
//
// The second onboarding walk (2026-10-27): with no email able to leave,
// the inviter read "…has been invited as Program Manager and emailed…
// send them the sign-in address yourself: …/login". Nothing was emailed,
// and the colleague has no password, so the sign-in address was a door
// they could not open. The sentence now follows what actually happened
// to the email, and offers a sign-in address only to somebody who can
// use it: a person who already has a password, or a work-account door.

/**
 * How the invitation email went: SENT, FAILED, NOT_CONFIGURED (no provider
 * here), or DEMO_SKIPPED (a reserved demo address, never sent to).
 */
export type InviteMailState = 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'DEMO_SKIPPED'

/** What the inviter presses on a waiting row to email the same invitation once more. */
export const SEND_AGAIN_LABEL = 'Send the invitation again'
/** What the inviter presses to put a ready message, with no link that takes the seat, on the clipboard. */
export const COPY_LABEL = 'Copy invitation'

/**
 * What the inviter is told, the same for every address (security review,
 * 2026-11-12): whether the person already holds a password, signs in with
 * a work account, or is new to Etyme decides only what the email itself
 * says, never this sentence. A sentence that said "the email has a link to
 * set their password" for one address and not another told the inviter
 * which addresses already have an Etyme account. `personName` is what the
 * inviter typed, else the address's own first part; never the name the
 * record holds for somebody already on Etyme.
 */
export function inviteSays(i: {
  personName: string
  email: string
  roleName: string | null
  mail: InviteMailState
  /**
   * Why the email did not leave, in Etyme's words (`mailFailureSays` in
   * lib/notify/mail-failure), never the provider's. Read on FAILED.
   */
  reason?: string | null
}): string {
  const head = i.roleName ? `${i.personName} has been invited as ${i.roleName}` : `${i.personName} has been invited`
  const seat = i.roleName
    ? ` The seat is theirs when they sign in with ${i.email}.`
    : ' Give them a role when they arrive.'

  if (i.mail === 'SENT') {
    return `${head} and emailed.${seat} The email tells them how to sign in.`
  }
  if (i.mail === 'FAILED') {
    const why = i.reason ? ` ${i.reason}` : ''
    return `${head}, and the email to ${i.email} did not go.${why}${seat} Press ${SEND_AGAIN_LABEL} on their row, or ${COPY_LABEL}.`
  }
  if (i.mail === 'DEMO_SKIPPED') {
    return `${head}.${seat} This is a demo address, so no email went to it.`
  }
  // No email can leave this deployment. One sentence for every address.
  return `${head}.${seat} No email can be sent from here yet. Press ${COPY_LABEL} on their row and send it to them yourself; ` +
    'where they have no password yet, Etyme staff hold a one-time link for them.'
}

/** The name an invitation is said under: what the inviter typed, else the address's first part. Never the record's. */
export function invitedAs(typed: unknown, email: string): string {
  const t = String(typed ?? '').trim()
  return t || email.split('@')[0]
}

// ── Whether the invitation email left, on the reply and on every waiting row ──
//
// The founder, 2026-11-12: three invitations to Tapin each said "did not
// go" and nothing else, and the reason was never on the row he came back
// to. Each waiting row now reads its newest invitation email and says one
// line about it, the reason in Etyme's words and what to do next.

/** The newest invitation email for a seat, as the register reads it off the record. */
export interface InviteMail {
  state: InviteMailState | 'PENDING'
  /** When it left; null where it did not. An ISO string on the wire. */
  at: Date | string | null
  /** Why it did not leave, in Etyme's words; null where it left. */
  why: string | null
}

/**
 * "Email sent Thu, Nov 12, 3:40 PM PST." or "Email not sent: <why> Copy
 * the invitation, or send it again." The moment is printed in the reader's
 * own zone (lib/when). Null where no invitation email is on the record.
 */
export function mailLine(m: InviteMail | null | undefined, zone: string | null): string | null {
  if (!m) return null
  if (m.state === 'SENT' && m.at) return `Email sent ${momentFor(new Date(m.at), zone)}.`
  if (m.state === 'PENDING') return 'Email waiting to go.'
  if (m.state === 'SENT') return 'Email sent.'
  const why = m.why ?? (m.state === 'NOT_CONFIGURED' ? 'No email can be sent from here yet.' : 'It did not leave.')
  const next = m.state === 'DEMO_SKIPPED' ? ''
    : m.state === 'NOT_CONFIGURED' ? ' Copy the invitation and send it to them yourself.'
      : ' Copy the invitation, or send it again.'
  return `Email not sent: ${why}${next}`
}

// ── Copy invitation ────────────────────────────────────────────────────
//
// An invitation's one carrier was the email, so when the email failed the
// founder wrote to his partners by hand. The copied message carries what
// the seat needs and nothing that takes it: the seat is claimed only by a
// sign-in at the invited address (Google and Microsoft vouch for the
// address; a password reset proves the mailbox), so a plain sign-in link is
// no secret. The one-time set-password link IS the seat, and it is never
// put here, on a clipboard, a screen or a log.

export interface CopyInvitation {
  inviterName: string
  companyName: string
  roleName: string | null
  email: string
  /** The app's one address (lib/app-url `appUrl`), with no path. */
  appUrl: string
  /** The company's sign-in mode, read by the one policy function. */
  mode: EffectiveMode
  /** Whether an email can leave this deployment, so "Forgot your password?" can work. */
  mailLeaves: boolean
}

/** The sign-in page with the address carried, so the box is filled. Never a token, never a seat id. */
export function signInLinkFor(appUrl: string, email: string): string {
  return `${appUrl.replace(/\/+$/, '')}/login?email=${encodeURIComponent(email.trim().toLowerCase())}`
}

/** The ready message "Copy invitation" puts on the clipboard. Pure. */
export function copyInvitation(c: CopyInvitation): string {
  const as = c.roleName ? ` as ${c.roleName}` : ''
  const head = `${c.inviterName} invited you to ${c.companyName} on Etyme${as}.`
  const link = signInLinkFor(c.appUrl, c.email)
  if (c.mode === 'SSO_ONLY') {
    return `${head} Open ${link} and sign in through ${c.companyName}’s company directory as ${c.email}.`
  }
  const body = `${head} Open ${link} and continue with Google or Microsoft as ${c.email}, whichever your company uses.`
  // "Forgot your password?" emails a link to a person a firm invited who
  // has no password yet (lib/password-door `requestReset`: a live seat
  // makes them an account), so it is offered only where mail can leave.
  return c.mailLeaves
    ? `${body} No Google or Microsoft account on that address? Choose Forgot your password? on that page and use the link we email you.`
    : body
}

// ── Inviting several at once ───────────────────────────────────────────

/** The most addresses one press of Invite takes. */
export const MAX_ADDRESSES_AT_ONCE = 20
/** The most invitation emails a company sends in an hour, first and again alike, counted from its automation log (`invitationsThisHour`). */
export const INVITES_PER_HOUR = 60
/** The most invitation emails one seat is sent in an hour, the first included. */
export const SENDS_PER_SEAT_PER_HOUR = 3

/**
 * The addresses in a pasted list: one per line, or separated by commas or
 * semicolons, lowercased, each once, in the order typed. What is not a
 * whole address is returned apart, so it is said and never silently
 * dropped. Pure.
 */
export function parseAddresses(raw: string | readonly string[]): { addresses: string[]; notAddresses: string[] } {
  const parts = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,;]+/))
    .map((p) => String(p).trim().replace(/^.*<([^>]+)>\s*$/, '$1').trim().toLowerCase())
    .filter(Boolean)
  const addresses: string[] = []
  const notAddresses: string[] = []
  for (const p of parts) {
    if (!looksLikeAddress(p)) { if (!notAddresses.includes(p)) notAddresses.push(p); continue }
    if (!addresses.includes(p)) addresses.push(p)
  }
  return { addresses, notAddresses }
}

/** The refusal for a list longer than one press takes. */
export function tooManyAtOnceSays(n: number): string {
  return `That is ${n} addresses. Invite at most ${MAX_ADDRESSES_AT_ONCE} at a time, then the rest.`
}

/** The refusal once a company has sent its hour's invitations, with when to try again in the reader's zone. */
export function hourlyCapSays(again: Date, zone: string | null): string {
  return `${INVITES_PER_HOUR} invitations have gone out from here in the last hour. Try again after ${momentFor(again, zone)}.`
}

/** The refusal once one seat has been emailed its hour's invitations. */
export function seatCapSays(email: string, again: Date, zone: string | null): string {
  return `${email} was emailed ${SENDS_PER_SEAT_PER_HOUR} times in the last hour. ${COPY_LABEL} and send it yourself, or send it again after ${momentFor(again, zone)}.`
}

/**
 * The two hourly refusals, said in the reader's own zone. The route sends
 * the moment as an instant (`again`, ISO) beside its sentence, because the
 * server does not know the reader's zone and would print UTC while every
 * other moment on the page is local: one moment, said one way. Null where
 * the refusal is not one of these.
 */
export interface CapRefusal {
  code?: unknown
  again?: unknown
  cap?: unknown
  email?: unknown
}
export function capRefusalSays(err: CapRefusal | null | undefined, zone: string | null): string | null {
  if (!err || err.code !== 'TOO_MANY_THIS_HOUR' || typeof err.again !== 'string') return null
  const again = new Date(err.again)
  if (Number.isNaN(again.getTime())) return null
  if (err.cap === 'SEAT' && typeof err.email === 'string') return seatCapSays(err.email, again, zone)
  if (err.cap === 'HOURLY') return hourlyCapSays(again, zone)
  return null
}

/** What Send the invitation again says once it has run. */
export function sentAgainSays(email: string, mail: InviteMailState, why: string | null): string {
  if (mail === 'SENT') return `Sent again to ${email}. It is the same seat; nothing was duplicated.`
  return `Not sent to ${email}: ${why ?? 'it did not leave.'} It is the same seat; nothing was duplicated. ${COPY_LABEL} and send it to them yourself.`
}

/** The refusal for an address already waiting on an invitation here. */
export function alreadyInvitedSays(email: string): string {
  return `${email} is already invited here. Press ${SEND_AGAIN_LABEL} on their row to email them once more, or ${COPY_LABEL}.`
}

// ── What an outside firm's seat may never hold ─────────────────────────
//
// Decided by regulatory, 2026-10-27, on the coordinator's question after
// the second onboarding walk: may the seat a client grants an MSP ever
// carry a role above the program manager's? The coordinator's call was
// "never the client's Owner". The rule is narrower than that, for three
// reasons that each stand on their own:
//
//   **Seats and rules are the client's.** A role that grants or changes
//   seats (`team.manage`, `settings.manage`) would let the outside firm
//   widen its own seat or seat others. "Under the client's rules" means
//   the client holds the pen. The Owner is the plainest case of this.
//
//   **An MSP is paid a share of what is billed** (CLAUDE.md, "Pricing is
//   unchanged": supplier-funded, a percentage on billings). So it never
//   signs the hours its fee is counted from (`timesheets.approve`, the
//   Hiring Manager's), and never signs the client's money in the approval
//   chain (the Approver). Each is a segregation-of-duties BLOCK, the same
//   as nobody signing their own: it is not a judgment about the firm.
//
//   Everything else — Program Manager, Procurement Lead, HR Partner,
//   AP Clerk, Compliance Officer, Viewer — is the program office's work
//   (CLAUDE.md, "The MSP desks are Etyme's own") and may be granted.
//
// Data, keyed on what a role can do rather than only on its name, so a
// client that renames a role or builds its own cannot slip past it.

/** Roles an outside firm's seat never holds, by name. */
export const OUTSIDE_SEAT_NEVER_ROLES: Record<string, string> = {
  Owner: 'it holds everything, seats included',
  Approver: 'it signs the client’s own money in the approval chain, and an MSP is paid a share of what is billed',
}

/** What a role may not carry for an outside firm to hold it, and why. */
export const OUTSIDE_SEAT_NEVER_PERMISSIONS: Record<string, string> = {
  'team.manage': 'it grants and changes seats, so the firm could widen its own',
  'settings.manage': 'it changes the client’s settings and seats, which are the client’s to keep',
  'timesheets.approve': 'it signs the hours an MSP’s fee is counted from',
}

export type OutsideSeatVerdict = { ok: true } | { ok: false; code: 'NEVER_FOR_AN_OUTSIDE_FIRM'; says: string }

/**
 * Whether a client may grant this role to an outside firm's seat. Pure.
 * `clientName` and `firmName` are said in the refusal.
 */
export function mayHoldOutsideSeat(input: {
  role: { name: string; permissions: readonly string[] }
  clientName: string
  firmName: string
}): OutsideSeatVerdict {
  const byName = OUTSIDE_SEAT_NEVER_ROLES[input.role.name]
  const perm = input.role.permissions.find((p) => p === '*' || p in OUTSIDE_SEAT_NEVER_PERMISSIONS)
  const why = byName ?? (perm === '*' ? OUTSIDE_SEAT_NEVER_ROLES.Owner : perm ? OUTSIDE_SEAT_NEVER_PERMISSIONS[perm] : null)
  if (!why) return { ok: true }
  return {
    ok: false,
    code: 'NEVER_FOR_AN_OUTSIDE_FIRM',
    says:
      `${input.firmName} cannot hold ${input.clientName}’s ${input.role.name} role: ${why}. ` +
      `Choose the role it runs the program in, Program Manager most often.`,
  }
}


// ── The invitation form, in the company's own sign-in terms ────────────

/** What the invitation form says, read from the company's sign-in policy. */
export interface InviteForm {
  /** The mode the one policy function reads; never sent to a reader who cannot manage people. */
  mode: EffectiveMode
  /** The label over the address box. */
  emailLabel: string
  /** One line under the box: who may be invited, and what follows. */
  hint: string
  /** Whether a personal address (Gmail and the rest) may be invited at all. */
  personalWelcome: boolean
}

/**
 * What a seat on a personal address cannot do at this company, in words,
 * or null where the company does not limit one. Read from the one limit
 * (`isLimitedPublicSeat` and `narrowForPublicSeat` in lib/identity/policy,
 * which lib/api-context applies on every request), never retyped here.
 */
export function personalSeatCannot(policy: CompanyPolicy | null): string | null {
  if (!isLimitedPublicSeat(policy, true)) return null
  const keeps = new Set(narrowForPublicSeat(['*'], PERMISSIONS))
  const withheld = PERMISSIONS.filter((p) => !keeps.has(p))
  return withheld.length > 0 ? inWords(withheld) : null
}

/**
 * The invitation form's label and hint, by the company's sign-in mode
 * (founder, 2026-11-12: "Work email" told him a partner on Gmail could not
 * be invited, when his company invites exactly that).
 *
 * - Directory only: an address on the company's own domain may still be
 *   invited (the INVITE door allows it, lib/identity/policy `decideDoor`);
 *   anybody else is added in the company's directory.
 * - Invitation only, hybrid, or nothing set: any address, a personal one
 *   welcome; where the company limits a seat on a personal address (hybrid),
 *   the hint says what that seat cannot do, and where it does not, the hint
 *   says the seat holds everything its role holds.
 * - A one-person firm keeps the form it had.
 */
export function inviteFormWords(args: { policy: CompanyPolicy | null; domain: string | null; oneFirm: boolean }): InviteForm {
  const mode = effectiveMode(args.policy)
  if (args.oneFirm) {
    return {
      mode,
      emailLabel: 'Work email',
      hint: 'Where email can be sent from here, they get a link by email; the seat is theirs the moment they sign in.',
      personalWelcome: mode !== 'SSO_ONLY',
    }
  }
  if (mode === 'SSO_ONLY') {
    return {
      mode,
      emailLabel: args.domain ? `Work email on ${args.domain}` : 'Work email',
      hint: args.domain
        ? `People outside ${args.domain} are added in your company’s directory, and appear here the first time they sign in.`
        : 'People are added in your company’s directory, and appear here the first time they sign in.',
      personalWelcome: false,
    }
  }
  const cannot = personalSeatCannot(args.policy)
  return {
    mode,
    emailLabel: 'Email address',
    hint: cannot
      ? `A company address, or a personal one such as Gmail for a partner. A seat on a personal address cannot ${cannot}.`
      : `A company address, or a personal one such as Gmail for a partner. ${PERSONAL_SEAT_UNLIMITED}`,
    personalWelcome: true,
  }
}

/**
 * Said where the company does not limit a seat on a personal address
 * (invitation only, or nothing set): the record applies the limit at a
 * hybrid company only (`isLimitedPublicSeat`), so the hint says the seat
 * holds what its role holds and the Owner is not surprised later.
 */
export const PERSONAL_SEAT_UNLIMITED = 'A seat on a personal address can do everything its role can, money and signing included.'

/** What the address box says when Invite is pressed with no whole address in it. */
export const INVITE_ADDRESS_MISSING = 'Type the full address, like name@example.com.'

/** Whether the box holds a whole address: the same test the invite route makes (lib/account-lifecycle `checkInvite`). */
export function looksLikeAddress(raw: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.trim())
}


// ── A paused seat, said to the person ─────────────────────────────────

/**
 * What a person whose seat is paused reads, on the refusal and on the page
 * the refusal opens (the Owner walk, 2026-11-12: "…until she is back..
 * Somebody there can lift it."). The reason is somebody's own words, and
 * often ends in its own period, so it is joined through `clause`, which
 * trims the reason's last stop: one period, always.
 */
export function pausedSays(companyName: string | null, reason: string | null): string {
  const why = reason ? clause(reason) : ''
  return `Your access at ${companyName ?? 'this company'} is paused${why ? `: ${why}` : ''}. Somebody there can lift it.`
}
