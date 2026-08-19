/**
 * Who may do what here, and for how long.
 *
 * The assumption this file inverts: that access, once given, continues
 * until somebody remembers to take it away. Nobody ever remembers. The
 * result is every enterprise system on earth — a directory full of people
 * who left, contractors from a project that ended in 2029, and one
 * spreadsheet a year where a manager ticks names they do not recognise.
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
