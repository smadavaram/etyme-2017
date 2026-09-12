/**
 * Whether a requisition clears itself, or needs a person — and which.
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
 * ── Three desks, not a dollar line ───────────────────────────────────
 *
 * The chain used to be "over $250k → a VP", one flat list of people in
 * rank order, and every rule on Nike pointed at the same person. The
 * founder's description of how it actually works:
 *
 *   A hiring manager who needs people raises it, against a cost centre
 *   they may or may not own. Alongside them, HR checks it is a
 *   legitimate contingent role that fits the plan, and the indirect
 *   procurement lead audits which suppliers are eligible. The final
 *   word is the hiring line's — the lead who owns the cost centre. Never
 *   the requester themselves.
 *
 * So a requisition has three stages, each a desk with its own question:
 *
 *   ROLE      HR              is this a role, and is it in the plan
 *   SOURCING  Procurement     who may supply it, at what rate
 *   FINAL     the lead        the one human yes on the money
 *
 * ROLE and SOURCING sit at the same rank and decide alongside each
 * other; FINAL waits for both. Within plan, ROLE and SOURCING clear by
 * rule — recorded, with the reason — and the requisition lands with the
 * lead. A miss goes to the desk that owns the miss: over the plan → HR,
 * above the band → Procurement, over budget → the lead. HR and
 * Procurement are standing desks named per business unit (an ApprovalRule
 * of kind HR or PROCUREMENT, scoped to the unit); the requisition
 * inherits them, and nobody picks approvers on a requisition.
 *
 * The lead is whoever owns the cost centre. When that is the person who
 * raised it, or the owner it is for, the final word goes one level up —
 * the segregation-of-duties line Addendum E draws as a BLOCK, not a
 * warning. A rule on the money (kind VALUE — the old threshold rules,
 * and the old "programme lead" catch-all) still asks its approver, at
 * the FINAL rank, so nothing a client already configured stops working.
 *
 * The other Addendum E rule applies too — BLOCK only where legally
 * grounded, WARN and route everywhere else, never silently permit.
 */

export type CheckOutcome = 'PASS' | 'ROUTE' | 'BLOCK'

/** Which desk a check belongs to. */
export type Stage = 'ROLE' | 'SOURCING' | 'FINAL'

export interface RequisitionCheck {
  code: 'HEADCOUNT_PLAN' | 'BUDGET' | 'RATE_BAND' | 'COST_CENTER' | 'DURATION' | 'VALUE'
  outcome: CheckOutcome
  /** Plain English, always present — this is what the approver reads. */
  reason: string
  /** The desk that answers for a miss on this check. */
  stage: Stage
}

/** A person in a chair. */
export interface Seat {
  personId: string
  name: string
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

  // ── Who ───────────────────────────────────────────────────────────
  /** Who typed it. */
  raisedById?: string | null
  /** Whose need it is — the hiring manager it is for. Defaults to the raiser. */
  ownerId?: string | null
  /** Who owns the cost centre's budget: the lead, and the final word. */
  lead?: Seat | null
  /** The next lead up the tree, for when the lead raised it or is its owner. */
  escalation?: Seat | null
  /** The business unit's name, for the sentences. */
  unitName?: string | null
}

export type RuleKind = 'VALUE' | 'HR' | 'PROCUREMENT'

export interface ApprovalRuleFacts {
  id: string
  name: string
  approverId: string
  approverName: string
  /** VALUE: applies when the annual value exceeds this. Null = always. */
  thresholdCents: number | null
  rank: number
  /** Which desk this rule names. Absent reads as VALUE, the old shape. */
  kind?: RuleKind
  /**
   * How close to the unit the rule is scoped: 0 is company-wide, 1 the
   * top of the tree, and so on down. The nearest desk wins, so a
   * business unit's own HR partner outranks the company default.
   */
  specificity?: number
}

/** One row of the chain as it will be written. */
export interface ApprovalStep {
  stage: Stage
  rank: number
  /** Null when cleared by rule, or when nobody is named to decide it. */
  approverId: string | null
  approverName: string | null
  outcome: 'PENDING' | 'AUTO_CLEARED'
  reason: string
  /** The rule that put this person here, when a rule did. */
  ruleId?: string
}

export interface RequisitionDecision {
  /** AUTO_APPROVED when nothing waits on a person; PENDING_APPROVAL otherwise. */
  state: 'AUTO_APPROVED' | 'PENDING_APPROVAL' | 'BLOCKED'
  checks: RequisitionCheck[]
  /** The chain, one row per desk, in the order it is asked. */
  steps: ApprovalStep[]
  /** The people who will be asked, in rank order. Empty when nobody is. */
  route: ApprovalRuleFacts[]
  /** One-line summary for the requisition list and the automation log. */
  summary: string
}

/** How far above the going rate is worth a conversation. */
const RATE_TOLERANCE_PERCENT = 15

/** The nearest desk of a kind, or none. */
export function deskFor(rules: ApprovalRuleFacts[], kind: 'HR' | 'PROCUREMENT'): (Seat & { ruleId: string }) | null {
  const named = rules.filter((r) => r.kind === kind)
  if (named.length === 0) return null
  const nearest = [...named].sort((a, b) => (b.specificity ?? 0) - (a.specificity ?? 0) || a.rank - b.rank)[0]
  return { personId: nearest.approverId, name: nearest.approverName, ruleId: nearest.id }
}

const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`

/**
 * Run the checks and build the chain. Pure — no database, no clock — so
 * the rules are testable on their own and the same facts always produce
 * the same decision.
 */
export function evaluateRequisition(
  facts: RequisitionFacts,
  rules: ApprovalRuleFacts[]
): RequisitionDecision {
  const checks: RequisitionCheck[] = []

  // ── A cost centre must be named ──
  // Not legally grounded, but a requisition with no budget behind it cannot
  // be reconciled later, so it routes rather than clears — to the lead,
  // because the money is the lead's question.
  if (!facts.costCenter) {
    checks.push({
      code: 'COST_CENTER',
      outcome: 'ROUTE',
      stage: 'FINAL',
      reason: 'No cost centre named — nobody owns this spend',
    })
  } else {
    checks.push({
      code: 'COST_CENTER',
      outcome: 'PASS',
      stage: 'FINAL',
      reason: `Charged to ${facts.costCenter.code}`,
    })

    // ── Headcount plan — HR's question ──
    const cc = facts.costCenter
    if (cc.approvedHeads === null) {
      checks.push({
        code: 'HEADCOUNT_PLAN',
        outcome: 'ROUTE',
        stage: 'ROLE',
        reason: `No headcount plan on file for ${cc.code}`,
      })
    } else {
      const after = cc.committedHeads + facts.headcount
      if (after > cc.approvedHeads) {
        checks.push({
          code: 'HEADCOUNT_PLAN',
          outcome: 'ROUTE',
          stage: 'ROLE',
          reason: `Takes ${cc.code} to ${after} of ${cc.approvedHeads} approved heads`,
        })
      } else {
        checks.push({
          code: 'HEADCOUNT_PLAN',
          outcome: 'PASS',
          stage: 'ROLE',
          reason: `${after} of ${cc.approvedHeads} approved heads`,
        })
      }
    }

    // ── Budget — the lead's question ──
    if (cc.annualBudgetCents === null) {
      checks.push({
        code: 'BUDGET',
        outcome: 'ROUTE',
        stage: 'FINAL',
        reason: `No budget on file for ${cc.code}`,
      })
    } else {
      const after = cc.committedSpendCents + facts.annualValueCents
      if (after > cc.annualBudgetCents) {
        const over = after - cc.annualBudgetCents
        checks.push({
          code: 'BUDGET',
          outcome: 'ROUTE',
          stage: 'FINAL',
          reason: `Exceeds ${cc.code} budget by ${dollars(over)}`,
        })
      } else {
        const left = cc.annualBudgetCents - after
        checks.push({
          code: 'BUDGET',
          outcome: 'PASS',
          stage: 'FINAL',
          reason: `${dollars(left)} left in ${cc.code}`,
        })
      }
    }
  }

  // ── Rate band — Procurement's question ──
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
        stage: 'SOURCING',
        reason: `$${Math.round(facts.billMaxCents / 100)}/hr is ${overPercent}% above the $${Math.round(facts.skillMedianCents / 100)}/hr you already pay for this skill`,
      })
    } else {
      checks.push({
        code: 'RATE_BAND',
        outcome: 'PASS',
        stage: 'SOURCING',
        reason: `$${Math.round(facts.billMaxCents / 100)}/hr is in line with the $${Math.round(facts.skillMedianCents / 100)}/hr you already pay`,
      })
    }
  } else {
    checks.push({
      code: 'RATE_BAND',
      outcome: 'PASS',
      stage: 'SOURCING',
      reason: facts.skillMedianCents === null
        ? 'No comparable rate at this client yet'
        : 'No rate ceiling stated',
    })
  }

  // ── Rules on the money ──
  // Threshold rules apply on value alone, regardless of whether a check
  // routed — a large requisition is seen by a human even when every fact
  // is inside plan.
  const moneyRules = rules.filter((r) => (r.kind ?? 'VALUE') === 'VALUE')
  const byThreshold = moneyRules.filter(
    (r) => r.thresholdCents !== null && facts.annualValueCents > r.thresholdCents
  )

  // Say which number did it, and whether anybody typed that number.
  if (byThreshold.length > 0 && facts.valueSays) {
    checks.push({
      code: 'VALUE',
      outcome: 'ROUTE',
      stage: 'FINAL',
      reason:
        facts.valueBasis === 'ESTIMATE'
          ? `Routed on ${facts.valueSays} — state a budget and it routes on that instead`
          : `Routed on ${facts.valueSays}`,
    })
  } else if (facts.valueSays) {
    checks.push({ code: 'VALUE', outcome: 'PASS', stage: 'FINAL', reason: facts.valueSays })
  }

  // ── Outcome ──
  const blocked = checks.filter((c) => c.outcome === 'BLOCK')
  if (blocked.length > 0) {
    return { state: 'BLOCKED', checks, steps: [], route: [], summary: blocked[0].reason }
  }

  const routed = checks.filter((c) => c.outcome === 'ROUTE')
  const missesFor = (stage: Stage) => routed.filter((c) => c.stage === stage)
  const passesFor = (stage: Stage) => checks.filter((c) => c.stage === stage && c.outcome === 'PASS')
  const unit = facts.unitName ?? 'this unit'
  const steps: ApprovalStep[] = []

  // ── ROLE and SOURCING — alongside each other, rank 1 ──
  for (const [stage, kind, what] of [
    ['ROLE', 'HR', 'the plan'],
    ['SOURCING', 'PROCUREMENT', 'the going rate'],
  ] as const) {
    const desk = deskFor(rules, kind)
    const misses = missesFor(stage)
    const deskWord = kind === 'HR' ? 'HR' : 'Procurement'
    if (misses.length === 0) {
      const why = passesFor(stage).map((c) => c.reason).join('; ')
      steps.push({
        stage, rank: 1, approverId: null, approverName: null, outcome: 'AUTO_CLEARED',
        reason: `Within ${what} — ${why || 'nothing to review'}.${desk ? ` ${deskWord} (${desk.name}) not needed.` : ''}`,
        ...(desk ? { ruleId: desk.ruleId } : {}),
      })
    } else if (desk) {
      steps.push({
        stage, rank: 1, approverId: desk.personId, approverName: desk.name, outcome: 'PENDING',
        reason: misses.map((c) => c.reason).join('; '), ruleId: desk.ruleId,
      })
    } else {
      // Never silently: a miss with nobody to read it is cleared with the
      // note in plain sight, and says who to name so the next one is read.
      steps.push({
        stage, rank: 1, approverId: null, approverName: null, outcome: 'AUTO_CLEARED',
        reason: `${misses.map((c) => c.reason).join('; ')} — no ${deskWord} desk named for ${unit}, so cleared with this note. Name one under Programme team.`,
      })
    }
  }

  // ── FINAL — the lead's one human yes, rank 2 ──
  const finalMisses = missesFor('FINAL')
  const finalWhy = (finalMisses.length ? finalMisses : passesFor('FINAL')).map((c) => c.reason).join('; ')
  const asked: Seat[] = []
  const notes: string[] = []

  let lead = facts.lead ?? null
  const ownersOwn = (p: string) => p === facts.raisedById || p === facts.ownerId
  if (lead && ownersOwn(lead.personId)) {
    // Nobody signs their own requisition. One level up, or nobody.
    notes.push(`${lead.name} owns the budget and raised it — the final word goes one level up`)
    lead = facts.escalation ?? null
  }
  if (lead) asked.push(lead)

  // Rules on the money: the threshold ones that fired, and the catch-alls
  // (the old "programme lead") when something routed or nobody else can
  // give the final word.
  const catchAll = moneyRules.filter((r) => r.thresholdCents === null)
  const moneyAsked = [...byThreshold, ...(routed.length > 0 || !lead ? catchAll : [])]
    .sort((a, b) => a.rank - b.rank)
  for (const r of moneyAsked) {
    if (ownersOwn(r.approverId)) { notes.push(`${r.approverName} raised it, so is not asked to approve it`); continue }
    if (!asked.some((s) => s.personId === r.approverId)) asked.push({ personId: r.approverId, name: r.approverName })
  }

  // Nobody on the money? A standing desk gives the final word before
  // nobody does: Procurement, then HR. And with nobody at all, it clears
  // with the note in plain sight and who to name — never stuck on a row
  // no person can decide, never silently.
  if (asked.length === 0) {
    const fallback = deskFor(rules, 'PROCUREMENT') ?? deskFor(rules, 'HR')
    if (fallback && !ownersOwn(fallback.personId)) {
      notes.push(`no lead owns the money here, so ${fallback.name} gives the final word`)
      asked.push({ personId: fallback.personId, name: fallback.name })
    }
  }

  // Within plan, budget and rate, with no rule on the money fired, nothing
  // needs a person — Addendum E's governing sentence, and the founder's
  // own choice: "within plan clears itself". The lead's yes is recorded
  // as not needed, by name, so the row still says who would have been
  // asked. The lead is the ultimate approver of anything that does need
  // approving, not a signature on everything.
  const needsAPerson = routed.length > 0 || byThreshold.length > 0
  if (!needsAPerson) {
    steps.push({
      stage: 'FINAL', rank: 2, approverId: null, approverName: null, outcome: 'AUTO_CLEARED',
      reason:
        `Within plan, budget and rate — ${finalWhy}.` +
        (asked[0] ? ` ${asked[0].name}'s yes not needed.` : ''),
    })
  } else if (asked.length === 0) {
    steps.push({
      stage: 'FINAL', rank: 2, approverId: null, approverName: null, outcome: 'AUTO_CLEARED',
      reason:
        `Nobody is named to give the final word — cleared with this note. ` +
        `Name who owns ${facts.costCenter ? `cost centre ${facts.costCenter.code}` : 'the cost centre'}, or a desk under Programme team.` +
        `${notes.length ? ` ${notes.join('. ')}.` : ''}`,
    })
  } else {
    for (const seat of asked) {
      const rule = moneyAsked.find((r) => r.approverId === seat.personId)
      steps.push({
        stage: 'FINAL', rank: 2, approverId: seat.personId, approverName: seat.name, outcome: 'PENDING',
        reason:
          (seat === lead ? `The final word on ${unit}'s spend — ${finalWhy}` : `${rule?.name ?? 'Rule'}: ${finalWhy}`) +
          (notes.length ? `. ${notes.join('. ')}` : ''),
        ...(rule ? { ruleId: rule.id } : {}),
      })
    }
  }

  const pendingSteps = steps.filter((s) => s.outcome === 'PENDING')
  const route: ApprovalRuleFacts[] = pendingSteps
    .filter((s) => s.approverId)
    .map((s) => ({
      id: s.ruleId ?? `lead:${s.approverId}`,
      name: s.stage === 'ROLE' ? 'HR' : s.stage === 'SOURCING' ? 'Procurement' : 'The lead',
      approverId: s.approverId!, approverName: s.approverName!, thresholdCents: null, rank: s.rank,
    }))

  if (pendingSteps.length === 0) {
    const finalNote = steps.find((s) => s.stage === 'FINAL')?.reason ?? ''
    return {
      state: 'AUTO_APPROVED', checks, steps, route: [],
      summary: finalNote.startsWith('Nobody is named')
        ? `Cleared automatically — ${finalNote}`
        : 'Cleared automatically — within plan, budget and rate',
    }
  }

  const waitingOn = pendingSteps.filter((s) => s.approverName)
  const first = routed[0]?.reason ?? 'Within plan, budget and rate'
  const names = (rank: number) => waitingOn.filter((s) => s.rank === rank).map((s) => `${s.stage === 'ROLE' ? 'HR' : s.stage === 'SOURCING' ? 'Procurement' : ''}${s.stage === 'FINAL' ? '' : ' '}(${s.approverName})`.trim().replace(/^\((.*)\)$/, '$1'))
  const rank1 = names(1)
  const rank2 = names(2)
  const summary = `${first} — waiting on ${[rank1.join(' and '), rank2.length ? `${rank1.length ? 'then ' : ''}${rank2.join(' and ')}'s yes` : ''].filter(Boolean).join(', ')}`

  return { state: 'PENDING_APPROVAL', checks, steps, route, summary }
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
 * troubles three people with a request the first would have rejected.
 * Within a rank, the desks decide alongside each other, in any order. A
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

  if (pending.length === 0) {
    return {
      current: null,
      refusal: 'NOTHING_PENDING',
      completesChain: false,
      remaining: [],
      nextState: null,
      nextStatus: null,
    }
  }

  // ── Alongside, at one rank ────────────────────────────────────────
  //
  // HR and Procurement sit at the same rank and decide in either order;
  // the lead at the next rank waits for both. So "the one in play" is
  // not a single row but a rank, and the caller's row within it. A rank
  // above is still not asked until the rank below is done.
  const lowest = pending[0].rank
  const atLowest = pending.filter(a => a.rank === lowest)
  const current = atLowest.find(a => a.approverId === callerPersonId) ?? null

  // An approval someone else can click is not an approval.
  if (!current) {
    return {
      current: atLowest[0],
      refusal: 'NOT_YOUR_APPROVAL',
      completesChain: false,
      remaining: pending,
      nextState: null,
      nextStatus: null,
    }
  }

  const remaining = pending.filter(a => a.id !== current.id)

  if (action === 'changes') {
    return {
      current,
      refusal: null,
      // Nothing is settled — this desk stays owed a decision, and gets
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
