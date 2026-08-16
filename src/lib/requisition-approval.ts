/**
 * Whether a requisition clears itself, or needs a person.
 *
 * Addendum E, the governing sentence:
 *   "Most requisitions must clear without human approval. Governance slower
 *    than the workaround produces the workaround."
 *
 * So the default is to CLEAR, and every route to a human has to earn itself
 * against a fact — over plan, over budget, over band. A requisition that
 * clears by rule is not an unreviewed one: the review was executed by rule
 * and the reason is recorded, which is what makes it auditable later.
 *
 * The other Addendum E rule applies too — BLOCK only where legally grounded,
 * WARN and route everywhere else, never silently permit.
 */

export type CheckOutcome = 'PASS' | 'ROUTE' | 'BLOCK'

export interface RequisitionCheck {
  code: 'HEADCOUNT_PLAN' | 'BUDGET' | 'RATE_BAND' | 'COST_CENTER' | 'DURATION'
  outcome: CheckOutcome
  /** Plain English, always present — this is what the approver reads. */
  reason: string
}

export interface RequisitionFacts {
  /** Annualised value of the requisition, in cents. */
  annualValueCents: number
  headcount: number
  /** Highest hourly rate the client will pay, in cents. Null = not stated. */
  billMaxCents: number | null
  /** Median hourly rate already paid for this skill at this client, in cents. */
  skillMedianCents: number | null
  costCenter: {
    id: string
    code: string
    /** Positions the plan allows for the period. Null = no plan on file. */
    approvedHeads: number | null
    /** Heads already filled or committed against the plan. */
    committedHeads: number
    /** Authorised spend for the period, in cents. Null = no plan on file. */
    annualBudgetCents: number | null
    /** Spend already committed from live contracts, in cents. */
    committedSpendCents: number
  } | null
  months: number | null
}

export interface ApprovalRuleFacts {
  id: string
  name: string
  approverId: string
  approverName: string
  /** Applies when the requisition's annual value exceeds this. Null = always. */
  thresholdCents: number | null
  rank: number
}

export interface RequisitionDecision {
  /** AUTO_APPROVED when nothing routed it; PENDING_APPROVAL otherwise. */
  state: 'AUTO_APPROVED' | 'PENDING_APPROVAL' | 'BLOCKED'
  checks: RequisitionCheck[]
  /** Approvers to route to, in rank order. Empty when auto-approved. */
  route: ApprovalRuleFacts[]
  /** One-line summary for the requisition list and the automation log. */
  summary: string
}

/** How far above the going rate is worth a conversation. */
const RATE_TOLERANCE_PERCENT = 15

/**
 * Run the checks. Pure — no database, no clock — so the rules are testable
 * on their own and the same facts always produce the same decision.
 */
export function evaluateRequisition(
  facts: RequisitionFacts,
  rules: ApprovalRuleFacts[]
): RequisitionDecision {
  const checks: RequisitionCheck[] = []

  // ── A cost centre must be named ──
  // Not legally grounded, but a requisition with no budget behind it cannot
  // be reconciled later, so it routes rather than clears.
  if (!facts.costCenter) {
    checks.push({
      code: 'COST_CENTER',
      outcome: 'ROUTE',
      reason: 'No cost centre named — nobody owns this spend',
    })
  } else {
    checks.push({
      code: 'COST_CENTER',
      outcome: 'PASS',
      reason: `Charged to ${facts.costCenter.code}`,
    })

    // ── Headcount plan ──
    const cc = facts.costCenter
    if (cc.approvedHeads === null) {
      checks.push({
        code: 'HEADCOUNT_PLAN',
        outcome: 'ROUTE',
        reason: `No headcount plan on file for ${cc.code}`,
      })
    } else {
      const after = cc.committedHeads + facts.headcount
      if (after > cc.approvedHeads) {
        checks.push({
          code: 'HEADCOUNT_PLAN',
          outcome: 'ROUTE',
          reason: `Takes ${cc.code} to ${after} of ${cc.approvedHeads} approved heads`,
        })
      } else {
        checks.push({
          code: 'HEADCOUNT_PLAN',
          outcome: 'PASS',
          reason: `${after} of ${cc.approvedHeads} approved heads`,
        })
      }
    }

    // ── Budget ──
    if (cc.annualBudgetCents === null) {
      checks.push({
        code: 'BUDGET',
        outcome: 'ROUTE',
        reason: `No budget on file for ${cc.code}`,
      })
    } else {
      const after = cc.committedSpendCents + facts.annualValueCents
      if (after > cc.annualBudgetCents) {
        const over = after - cc.annualBudgetCents
        checks.push({
          code: 'BUDGET',
          outcome: 'ROUTE',
          reason: `Exceeds ${cc.code} budget by $${Math.round(over / 100).toLocaleString()}`,
        })
      } else {
        const left = cc.annualBudgetCents - after
        checks.push({
          code: 'BUDGET',
          outcome: 'PASS',
          reason: `$${Math.round(left / 100).toLocaleString()} left in ${cc.code}`,
        })
      }
    }
  }

  // ── Rate band ──
  // Measured against what this client already pays for the skill, not an
  // abstract market rate. Asking above the going rate is a conversation,
  // not a refusal — sometimes the premium is the point.
  if (facts.billMaxCents !== null && facts.skillMedianCents !== null && facts.skillMedianCents > 0) {
    const overPercent = Math.round(
      ((facts.billMaxCents - facts.skillMedianCents) / facts.skillMedianCents) * 100
    )
    if (overPercent > RATE_TOLERANCE_PERCENT) {
      checks.push({
        code: 'RATE_BAND',
        outcome: 'ROUTE',
        reason: `$${Math.round(facts.billMaxCents / 100)}/hr is ${overPercent}% above the $${Math.round(facts.skillMedianCents / 100)}/hr you already pay for this skill`,
      })
    } else {
      checks.push({
        code: 'RATE_BAND',
        outcome: 'PASS',
        reason: `$${Math.round(facts.billMaxCents / 100)}/hr is in line with the $${Math.round(facts.skillMedianCents / 100)}/hr you already pay`,
      })
    }
  } else {
    checks.push({
      code: 'RATE_BAND',
      outcome: 'PASS',
      reason: facts.skillMedianCents === null
        ? 'No comparable rate at this client yet'
        : 'No rate ceiling stated',
    })
  }

  // ── Outcome ──
  const blocked = checks.filter(c => c.outcome === 'BLOCK')
  if (blocked.length > 0) {
    return {
      state: 'BLOCKED',
      checks,
      route: [],
      summary: blocked[0].reason,
    }
  }

  const routed = checks.filter(c => c.outcome === 'ROUTE')

  // Threshold rules apply on value alone, regardless of whether a check
  // routed — a large requisition is seen by a human even when every fact
  // is inside plan.
  const byThreshold = rules.filter(
    r => r.thresholdCents !== null && facts.annualValueCents > r.thresholdCents
  )
  // Catch-all rules apply only when something actually routed.
  const byCheck = routed.length > 0
    ? rules.filter(r => r.thresholdCents === null)
    : []

  const route = [...new Map([...byThreshold, ...byCheck].map(r => [r.id, r])).values()]
    .sort((a, b) => a.rank - b.rank)

  if (route.length === 0) {
    // Nothing routed it, or nothing is configured to catch it. Clear it and
    // say why — an auto-clearance must be as legible as a refusal.
    return {
      state: 'AUTO_APPROVED',
      checks,
      summary: routed.length > 0
        ? `Cleared automatically — ${routed.length} note(s), no approver configured to review them`
        : `Cleared automatically — within plan, budget and rate`,
      route: [],
    }
  }

  return {
    state: 'PENDING_APPROVAL',
    checks,
    route,
    summary: routed.length > 0
      ? `${routed[0].reason} — routed to ${route[0].approverName}`
      : `Above ${route[0].approverName}'s threshold — routed for approval`,
  }
}

/**
 * Annualised value of a requisition, in cents.
 *
 * Uses the stated ceiling because that is what the budget must cover; the
 * actual placement usually lands lower. Duration is capped at twelve months
 * so a three-year requisition does not consume three years of one budget.
 */
export function annualisedValueCents(input: {
  billMaxCents: number | null
  headcount: number
  months: number | null
  hoursPerMonth?: number
}): number {
  const { billMaxCents, headcount, months, hoursPerMonth = 160 } = input
  if (!billMaxCents || billMaxCents <= 0) return 0
  const effectiveMonths = Math.min(months ?? 12, 12)
  return billMaxCents * hoursPerMonth * effectiveMonths * headcount
}
