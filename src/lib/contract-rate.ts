/**
 * What rate was in force on a given day.
 *
 * The contract is the authority on price. An invoice that disagrees with it
 * is wrong, not merely unusual — which is only true if the contract can
 * express the thing that actually happens: rates change mid-engagement.
 *
 * Without effective dating there are two bad options and no good one. Update
 * the contract rate and every past invoice retroactively disagrees with it.
 * Leave it and every future invoice fails. The waiver that was reached for
 * instead — "AP said this one is fine" — records the new rate in a free-text
 * note, so next month's invoice fails identically and gets waived again, and
 * the real price of the engagement lives nowhere a system can read.
 *
 * So the rate is resolved as of the work date, from APPROVED amendments
 * only. A proposed change does not bill until somebody with authority has
 * agreed to it, which is what makes the invoice check enforceable rather
 * than advisory.
 */

export interface RatePeriod {
  id: string
  rateCents: number
  fromDate: Date
  /** null means open-ended — in force until something supersedes it. */
  toDate: Date | null
  approvalState: string
}

export interface RateResolution {
  rateCents: number
  /** Which amendment supplied it, or null when it came from the contract. */
  periodId: string | null
  source: 'AMENDMENT' | 'CONTRACT'
}

/**
 * The rate in force on `asOf`.
 *
 * Falls back to the contract's own rate when no amendment covers that date,
 * which is the ordinary case: most engagements never change price.
 *
 * Where amendments overlap — they should not, but data is data — the one
 * starting latest wins, on the reasoning that the most recent agreement
 * about a period is the operative one.
 */
export function rateInForce(
  contractRateCents: number,
  periods: RatePeriod[],
  asOf: Date
): RateResolution {
  const applicable = periods
    .filter(p => p.approvalState === 'APPROVED')
    .filter(p => p.fromDate <= asOf)
    .filter(p => p.toDate === null || p.toDate >= asOf)
    .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime())

  const winner = applicable[0]
  return winner
    ? { rateCents: winner.rateCents, periodId: winner.id, source: 'AMENDMENT' }
    : { rateCents: contractRateCents, periodId: null, source: 'CONTRACT' }
}

/**
 * A timesheet covers a period, and a rate change can land in the middle of
 * one. Billing the whole week at either rate is wrong; whichever way it goes
 * somebody is short.
 *
 * Rather than pretending this cannot happen, it is detected and named, so
 * the timesheet can be split at the boundary before it is billed.
 */
export function spansRateChange(
  periods: RatePeriod[],
  periodStart: Date,
  periodEnd: Date
): { spans: boolean; changeDate: Date | null } {
  const boundary = periods
    .filter(p => p.approvalState === 'APPROVED')
    .map(p => p.fromDate)
    .filter(d => d > periodStart && d <= periodEnd)
    .sort((a, b) => a.getTime() - b.getTime())[0]

  return { spans: Boolean(boundary), changeDate: boundary ?? null }
}

/**
 * Whether a proposed change needs somebody senior, and who.
 *
 * The same shape as requisition approval, and for the same reason: a rate
 * moving by a few percent at renewal is routine, and one moving by a third
 * is a different agreement wearing the same contract number.
 */
export interface RateChangeAssessment {
  changePercent: number
  direction: 'INCREASE' | 'DECREASE' | 'NONE'
  needsApproval: boolean
  reason: string
}

/** Beyond this, a human looks at it. */
const AUTO_APPROVE_PERCENT = 5

export function assessRateChange(
  fromCents: number,
  toCents: number
): RateChangeAssessment {
  if (fromCents === toCents) {
    return { changePercent: 0, direction: 'NONE', needsApproval: false, reason: 'No change' }
  }

  const changePercent = fromCents === 0
    ? 100
    : Math.round(((toCents - fromCents) / fromCents) * 1000) / 10
  const direction = toCents > fromCents ? 'INCREASE' : 'DECREASE'
  const magnitude = Math.abs(changePercent)

  // A decrease costs the client nothing and needs no gate; the vendor
  // agreeing to it is the approval.
  if (direction === 'DECREASE') {
    return {
      changePercent, direction, needsApproval: false,
      reason: `Rate falls ${magnitude}% to $${Math.round(toCents / 100)}/hr`,
    }
  }

  return {
    changePercent,
    direction,
    needsApproval: magnitude > AUTO_APPROVE_PERCENT,
    reason: magnitude > AUTO_APPROVE_PERCENT
      ? `Rate rises ${magnitude}% from $${Math.round(fromCents / 100)} to $${Math.round(toCents / 100)}/hr — above the ${AUTO_APPROVE_PERCENT}% threshold`
      : `Rate rises ${magnitude}% to $${Math.round(toCents / 100)}/hr — within the ${AUTO_APPROVE_PERCENT}% threshold`,
  }
}
