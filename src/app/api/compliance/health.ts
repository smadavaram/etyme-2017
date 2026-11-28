/**
 * How the checks on the compliance page are counted.
 *
 * Pure, and apart from the route, so the founder can read what it does in
 * test names.
 *
 * ── Why this is not a count of the stored status ─────────────────────
 *
 * The page counted `status === 'CLEAR'` and called it the clear rate. A
 * stored status is a claim about the day somebody last touched the row;
 * whether the document still holds is a separate question about today.
 * So Brightmoor Staffing's liability certificate, nineteen days from
 * running out, was drawn "Expiring" in the table and counted "Clear" in
 * the header over it — "100% clear, 0 flagged" above a certificate the
 * page itself said to chase. That is the 2017 expiry column again, one
 * layer up: an expiry that is recorded and not counted.
 *
 * A check counts as clear only where the stored answer is clear AND the
 * document still holds today with more than the chase window left on it.
 * Everything else is something a desk has to do, and is counted as such.
 */

import { WARN_WITHIN_DAYS } from '@/lib/document-stages'

export interface CountedCheck {
  /** CLEAR · PENDING · IN_PROGRESS · FLAGGED · FAILED · CONDITIONAL · EXPIRED */
  status: string
  /**
   * The computed standing, where the route computed one (insurance, good
   * standing, a license). Null for a check nobody has a standing rule for.
   */
  standing?: string | null
  /** The day it runs out, where one was recorded. */
  expiresAt?: string | Date | null
  /** The day it starts holding, where the paper says so. */
  validFrom?: string | Date | null
}

export interface Health {
  totalChecks: number
  /** Clear on the record and still holding today, with room to spare. */
  clear: number
  /** Sent off and not back yet. */
  pending: number
  /** A provider's answer that was not clear. */
  failed: number
  /** Still holding, but inside the chase window — or no end recorded where one is expected. */
  expiring: number
  /** Ran out, or has not started yet. Either way it holds nothing today. */
  lapsed: number
  /**
   * Everything a desk has to act on: failed, expiring and lapsed together.
   * This is the number the header calls "flagged".
   */
  flagged: number
  /** Kept for readers of the old shape: the lapsed count under its old name. */
  expired: number
  /** Of the checks, and of nothing else. Null over no checks at all. */
  clearPercentage: number | null
}

const DAY = 86_400_000

function asDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null
  const t = d instanceof Date ? d : new Date(d)
  return Number.isNaN(t.getTime()) ? null : t
}

/** Which one bucket a single check falls in today. */
export function bucketOf(
  c: CountedCheck,
  on: Date
): 'clear' | 'pending' | 'failed' | 'expiring' | 'lapsed' {
  // The computed standing first, because it is about today.
  if (c.standing === 'EXPIRED' || c.standing === 'NOT_YET_VALID') return 'lapsed'
  if (c.status === 'EXPIRED') return 'lapsed'
  if (c.status === 'FLAGGED' || c.status === 'FAILED' || c.status === 'CONDITIONAL') return 'failed'
  if (c.status === 'PENDING' || c.status === 'IN_PROGRESS') return 'pending'
  if (c.standing === 'EXPIRING' || c.standing === 'NO_EXPIRY_RECORDED') return 'expiring'

  // No standing rule for this kind: read the dates on the row directly,
  // with the same window the standing rule uses, so a background check
  // whose report ran out yesterday is not counted clear either.
  if (!c.standing) {
    const from = asDate(c.validFrom)
    if (from && from.getTime() > on.getTime()) return 'lapsed'
    const until = asDate(c.expiresAt)
    if (until) {
      const days = Math.floor((until.getTime() - on.getTime()) / DAY)
      if (days < 0) return 'lapsed'
      if (days <= WARN_WITHIN_DAYS) return 'expiring'
    }
  }

  return c.status === 'CLEAR' ? 'clear' : 'pending'
}

export function checkHealth(checks: readonly CountedCheck[], on: Date): Health {
  const n = { clear: 0, pending: 0, failed: 0, expiring: 0, lapsed: 0 }
  for (const c of checks) n[bucketOf(c, on)]++
  const total = checks.length
  return {
    totalChecks: total,
    ...n,
    flagged: n.failed + n.expiring + n.lapsed,
    expired: n.lapsed,
    clearPercentage: total > 0 ? Math.round((n.clear / total) * 100) : null,
  }
}
