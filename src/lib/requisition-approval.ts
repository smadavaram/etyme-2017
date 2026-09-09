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
  code: 'HEADCOUNT_PLAN' | 'BUDGET' | 'RATE_BAND' | 'COST_CENTER' | 'DURATION' | 'VALUE'
  outcome: CheckOutcome
  /** Plain English, always present — this is what the approver reads. */
  reason: string
}

export interface RequisitionFacts {
  /** Annualised value of the requisition, in cents. */
  annualValueCents: number
  /**
   * Where that figure came from, and how it reads in a sentence.
   *
   * Carried so a routed requisition can say which number routed it.
   * Somebody told they need a VP's approval is entitled to know whether
   * that rests on a budget they stated or an estimate the system made.
   */
  valueBasis?: ValueBasis
  valueSays?: string
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

  // Say which number did it, and whether anybody typed that number.
  //
  // A requisition routed on an estimate the system made from a rate is a
  // different conversation from one routed on a budget somebody signed
  // off, and the person being asked to wait cannot tell the two apart
  // unless it is written down.
  if (byThreshold.length > 0 && facts.valueSays) {
    checks.push({
      code: 'VALUE',
      outcome: 'ROUTE',
      reason:
        facts.valueBasis === 'ESTIMATE'
          ? `Routed on ${facts.valueSays} — state a budget and it routes on that instead`
          : `Routed on ${facts.valueSays}`,
    })
  } else if (facts.valueSays) {
    checks.push({ code: 'VALUE', outcome: 'PASS', reason: facts.valueSays })
  }
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

// ─────────────────────────────────────────────
// ADVANCING THE CHAIN
// ─────────────────────────────────────────────

export interface PendingApproval {
  id: string
  approverId: string | null
  rank: number
  outcome: string
}

export interface ChainAdvance {
  /** The approval this decision lands on. Null when there is nothing to decide. */
  current: PendingApproval | null
  /** Set when the caller may not decide it. */
  refusal: 'NOTHING_PENDING' | 'NOT_YOUR_APPROVAL' | null
  /** True when this decision was the last one needed. */
  completesChain: boolean
  /** Ranks still to be asked after this decision. */
  remaining: PendingApproval[]
  /** Requirement state after the decision. */
  nextState: 'APPROVED' | 'REJECTED' | 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | null
  /** Requirement status after the decision. Only an approved chain opens it. */
  nextStatus: 'OPEN' | 'CLOSED' | null
}

/**
 * Work out what one approve/reject decision does to a chain.
 *
 * Ranks clear in order — rank 1 is asked before rank 2, so a chain never
 * troubles three people with a request the first would have rejected. A
 * requisition reaches the market only when every rank has approved; that
 * gate is what makes the approval mean anything.
 *
 * Rejection is terminal. Later ranks are never asked, because a request
 * that has already been refused is not improved by more signatures.
 */
/**
 * ── Handing it back ──────────────────────────────────────────────────
 *
 * There were two moves, approve and reject, and rejection was terminal.
 * So a reviewer who wanted to say "bring it to $120 an hour and I will
 * sign" had to either refuse it — forcing a fresh requisition and losing
 * the thread — or approve something they disagreed with. People do the
 * second, and the control quietly stops meaning anything.
 *
 * `changes` is neither. It returns the requisition to whoever raised it,
 * editable, with a note saying what to change, and nobody further up is
 * asked in the meantime.
 *
 * When it comes back it RESUMES at the rank that asked, rather than
 * starting again at rank one. Re-asking rank one for a change rank two
 * requested is how people learn to stop reading these — and rank one
 * already said yes to a version that was cheaper or smaller than the one
 * now in front of them, so their approval still stands.
 */
export function advanceApprovalChain(
  approvals: PendingApproval[],
  action: 'approve' | 'reject' | 'changes',
  callerPersonId: string
): ChainAdvance {
  const pending = approvals
    .filter(a => a.outcome === 'PENDING')
    .sort((a, b) => a.rank - b.rank)

  const current = pending[0] ?? null

  if (!current) {
    return {
      current: null,
      refusal: 'NOTHING_PENDING',
      completesChain: false,
      remaining: [],
      nextState: null,
      nextStatus: null,
    }
  }

  // An approval someone else can click is not an approval.
  if (current.approverId !== callerPersonId) {
    return {
      current,
      refusal: 'NOT_YOUR_APPROVAL',
      completesChain: false,
      remaining: pending.slice(1),
      nextState: null,
      nextStatus: null,
    }
  }

  const remaining = pending.slice(1)

  if (action === 'changes') {
    return {
      current,
      refusal: null,
      // Nothing is settled — this rank stays owed a decision, and gets
      // it back at this rank when the requisition returns.
      completesChain: false,
      remaining,
      nextState: 'CHANGES_REQUESTED',
      // Back to a draft its raiser can edit. It was never open, so
      // nothing is being withdrawn from a supplier.
      nextStatus: null,
    }
  }

  if (action === 'reject') {
    return {
      current,
      refusal: null,
      completesChain: true,
      remaining: [], // nobody else is asked
      nextState: 'REJECTED',
      nextStatus: 'CLOSED',
    }
  }

  if (remaining.length > 0) {
    return {
      current,
      refusal: null,
      completesChain: false,
      remaining,
      nextState: 'PENDING_APPROVAL',
      nextStatus: null, // stays where it was — not yet open
    }
  }

  return {
    current,
    refusal: null,
    completesChain: true,
    remaining: [],
    nextState: 'APPROVED',
    nextStatus: 'OPEN',
  }
}

/** Only an approved requisition may be put in front of vendors. */
export function mayDistribute(approvalState: string): boolean {
  return approvalState === 'APPROVED' || approvalState === 'AUTO_APPROVED'
}

/** Where the number that routes a requisition came from. */
export type ValueBasis =
  /** Somebody stated a budget. Their number, used as given. */
  | 'BUDGET'
  /** Nobody did, so it was estimated from the rate and the duration. */
  | 'ESTIMATE'
  /** Neither a budget nor a rate. Nothing to measure. */
  | 'UNKNOWN'

export interface AnnualValue {
  cents: number
  basis: ValueBasis
  /** One line, for the person being told why they need an approval. */
  says: string
}

/**
 * Annualised value of a requisition, in cents, and where it came from.
 *
 * A stated budget wins. It is what finance actually committed, and until
 * this existed the figure that decided who had to approve was derived
 * from a rate and a hardcoded 160 hours a month — so a manager with
 * $200,000 signed off and a system computing $288,000 disagreed silently,
 * and the system's number won without ever being shown.
 *
 * Where nobody stated one, the estimate still answers, and the basis says
 * that it is an estimate. A guess presented as a commitment is the part
 * that was wrong, not the guess.
 *
 * Duration is capped at twelve months either way, so a three-year
 * requisition does not consume three years of one budget.
 */
export function annualValue(input: {
  budgetCents?: number | null
  billMaxCents: number | null
  headcount: number
  months: number | null
  /** Hours a week this seat works. Null or absent means full time. */
  hoursPerWeek?: number | null
}): AnnualValue {
  const { budgetCents, billMaxCents, headcount, months, hoursPerWeek } = input
  const effectiveMonths = Math.min(months ?? 12, 12)

  if (budgetCents && budgetCents > 0) {
    const over = months ?? 12
    // A budget spanning more than a year is spread across the years it
    // covers, so a two-year commitment does not read as twice the annual
    // spend it actually is.
    const cents = over > 12 ? Math.round((budgetCents * 12) / over) : budgetCents
    return {
      cents,
      basis: 'BUDGET',
      says:
        over > 12
          ? `$${Math.round(cents / 100).toLocaleString()} a year, from the $${Math.round(budgetCents / 100).toLocaleString()} budget stated over ${over} months`
          : `$${Math.round(cents / 100).toLocaleString()}, the budget stated`,
    }
  }

  if (!billMaxCents || billMaxCents <= 0) {
    return { cents: 0, basis: 'UNKNOWN', says: 'No budget and no rate ceiling, so there is nothing to measure' }
  }

  // Four weeks to the month, which is where the old constant of 160 came
  // from. Kept exactly so a full-time seat values the same as it always
  // did, and a part-time one finally values as itself.
  const hoursPerMonth = (hoursPerWeek && hoursPerWeek > 0 ? hoursPerWeek : 40) * 4
  const cents = billMaxCents * hoursPerMonth * effectiveMonths * headcount
  return {
    cents,
    basis: 'ESTIMATE',
    says:
      `about $${Math.round(cents / 100).toLocaleString()}, estimated from ` +
      `$${Math.round(billMaxCents / 100)}/hr at ${hoursPerMonth / 4} hours a week ` +
      `for ${effectiveMonths} month${effectiveMonths === 1 ? '' : 's'}` +
      `${headcount > 1 ? ` across ${headcount} people` : ''}`,
  }
}

/**
 * The older shape, kept so callers that only want the number still work.
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
