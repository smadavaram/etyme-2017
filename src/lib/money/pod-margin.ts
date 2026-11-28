/**
 * What a sold team has earned (record 120, pods). Pure: no database here.
 *
 * Earned margin is the deliverables the client accepted (or that are already
 * on a bill), less what the team cost: the PAY, BURDEN and PREMIUM postings
 * on the project's lines. Nothing else counts, and nothing is estimated.
 *
 * It is null, with the unknown named, rather than a plausible number when:
 *   - nothing has been accepted yet (nothing is earned);
 *   - a member has no pay record on the project (her cost is missing, so the
 *     margin would read as better than it is);
 *   - two currencies are on the project (rupees and dollars are never added);
 *   - the cost is nought (a hundred per cent margin is a missing link, not
 *     good news).
 *
 * Postings are signed: money out is negative. A reversal is a second row
 * that cancels the first, so the net of the rows is the cost.
 */

export const COST_KINDS = ['PAY', 'BURDEN', 'PREMIUM'] as const

/** A deliverable counts as earned once the client accepted it, and while it is on a bill. */
export const EARNED_STATUSES = ['ACCEPTED', 'INVOICED'] as const

export interface PodMarginFacts {
  /** The project's own currency. */
  currency: string
  milestones: { amountCents: number; status: string }[]
  /** The people on the project's lines: one per sell contract. */
  members: { personId: string; name: string }[]
  /** Every posting on the project order. Kinds that are not cost are ignored. */
  postings: { personId: string | null; kind: string; amountCents: number; currency: string }[]
}

export interface PodMargin {
  /** Accepted or billed deliverables, in cents. Always a fact of the record. */
  earnedRevenueCents: number
  /** Null whenever the margin is null. */
  costCents: number | null
  marginCents: number | null
  /** What is missing, one sentence each; empty where the margin is a number. */
  unknowns: string[]
  currency: string
  says: string
}

const isCost = (kind: string): boolean => (COST_KINDS as readonly string[]).includes(kind)

export function podMargin(f: PodMarginFacts): PodMargin {
  const earned = f.milestones.filter((m) => (EARNED_STATUSES as readonly string[]).includes(m.status))
  const earnedRevenueCents = earned.reduce((n, m) => n + m.amountCents, 0)
  const unknowns: string[] = []

  if (earned.length === 0) unknowns.push('No deliverable has been accepted yet, so nothing is earned.')

  const cost = f.postings.filter((p) => isCost(p.kind))

  const currencies = new Set([f.currency, ...cost.map((p) => p.currency)])
  if (currencies.size > 1) {
    unknowns.push(`The project is in ${f.currency} but costs are posted in ${[...currencies].filter((c) => c !== f.currency).sort().join(' and ')}, and two currencies are never added.`)
  }

  for (const m of f.members) {
    const paid = f.postings.filter((p) => p.kind === 'PAY' && p.personId === m.personId).reduce((n, p) => n + p.amountCents, 0)
    if (paid === 0) unknowns.push(`${m.name} has no pay record on this project, so her cost is not known.`)
  }

  const costCents = -cost.reduce((n, p) => n + p.amountCents, 0)
  if (unknowns.length === 0 && costCents <= 0) {
    unknowns.push('The cost of this project is zero, which is a missing link and not a perfect margin.')
  }

  if (unknowns.length > 0) {
    return { earnedRevenueCents, costCents: null, marginCents: null, unknowns, currency: f.currency, says: `Margin is not known: ${unknowns.join(' ')}` }
  }
  const marginCents = earnedRevenueCents - costCents
  return {
    earnedRevenueCents,
    costCents,
    marginCents,
    unknowns,
    currency: f.currency,
    says: 'Earned margin: accepted deliverables less pay, burden and premium on the project.',
  }
}
