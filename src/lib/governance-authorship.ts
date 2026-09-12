/**
 * Who may write the rules, and what they may not write into them.
 *
 * Governance is the one setting that decides what everybody else needs
 * permission for. Whoever edits the approval chain can, in one save,
 * remove every approval their own spend would have needed — which is a
 * larger power than any single approval and belongs to fewer people.
 *
 * Two things are held here.
 *
 *   1. Editing governance is its own permission. Not settings.manage,
 *      which is the company address; not rates.write, which is approving
 *      a price. A separate key for a separate door.
 *
 *   2. You cannot be the only approver on a rule you wrote. This is the
 *      same control already enforced on rate rises — nobody approves
 *      their own increase — applied to the thing that decides whether an
 *      approval is needed at all. Leaving it open there and closed here
 *      would have been an odd place to stop.
 *
 * Pure functions. The route does the database work; these decide.
 */

export type Outcome = 'BLOCK' | 'WARN' | 'PASS'

export interface Check {
  code: string
  outcome: Outcome
  reason: string
}

export interface RuleDraft {
  /** Who is saving this. */
  authorPersonId: string
  /** Who the rule sends things to, in rank order. */
  approverPersonIds: string[]
  /** Above what annualised value this rule applies. Null means always. */
  thresholdCents: number | null
  name: string
}

export interface Existing {
  /** Approvers already on other active rules at this company. */
  otherRuleApproverIds: string[]
  /** How many active rules this company has besides the one being saved. */
  otherActiveRules: number
}

export interface Assessment {
  allowed: boolean
  checks: Check[]
  summary: string
}

/**
 * Can this rule be saved as written?
 *
 * BLOCK where the rule would remove a control, WARN where it is merely
 * unusual, following the Addendum E posture: block where legally grounded,
 * warn and capture a reason elsewhere, never silently permit.
 */
export function assessRule(draft: RuleDraft, existing: Existing): Assessment {
  const checks: Check[] = []

  // ── A rule with nobody in it ────────────────────────────────────────
  if (draft.approverPersonIds.length === 0) {
    checks.push({
      code: 'NO_APPROVER',
      outcome: 'BLOCK',
      reason: 'A rule with no approver sends requisitions nowhere and clears everything, which is the same as having no rule but harder to notice.',
    })
  }

  // ── Approving your own rule ─────────────────────────────────────────
  const selfOnly =
    draft.approverPersonIds.length > 0 &&
    draft.approverPersonIds.every((id) => id === draft.authorPersonId)

  if (selfOnly) {
    checks.push({
      code: 'SELF_APPROVAL',
      outcome: 'BLOCK',
      reason: 'You are the only approver on a rule you wrote, so nothing you spend would ever be reviewed by anybody else. Add another approver.',
    })
  } else if (draft.approverPersonIds.includes(draft.authorPersonId)) {
    // Being one of several is normal — a programme manager who both writes
    // the chain and sits in it is ordinary. It is being the whole chain
    // that is not.
    checks.push({
      code: 'SELF_IN_CHAIN',
      outcome: 'WARN',
      reason: 'You are in the chain of a rule you wrote. That is normal where others are too, and it is recorded.',
    })
  }

  // ── Duplicated approvers ────────────────────────────────────────────
  const seen = new Set<string>()
  const duplicated = draft.approverPersonIds.filter((id) => {
    if (seen.has(id)) return true
    seen.add(id)
    return false
  })
  if (duplicated.length > 0) {
    checks.push({
      code: 'DUPLICATE_APPROVER',
      outcome: 'BLOCK',
      reason: 'The same person appears twice in the chain, which asks them to approve the same thing twice and stalls it when they do it once.',
    })
  }

  // ── The threshold ───────────────────────────────────────────────────
  if (draft.thresholdCents !== null && draft.thresholdCents < 0) {
    checks.push({
      code: 'NEGATIVE_THRESHOLD',
      outcome: 'BLOCK',
      reason: 'A threshold below zero applies to everything, including nothing.',
    })
  }

  // Most requisitions must clear without a human. A rule that always
  // applies, at a company with no other rules, sends every requisition to
  // somebody — and governance slower than the workaround produces the
  // workaround.
  if (draft.thresholdCents === null && existing.otherActiveRules === 0) {
    checks.push({
      code: 'CATCHES_EVERYTHING',
      outcome: 'WARN',
      reason: 'This rule has no threshold, so every requisition will wait for a person. Most should clear without one — consider a value above which it applies.',
    })
  }

  if (!checks.some((c) => c.outcome !== 'PASS')) {
    checks.push({
      code: 'OK',
      outcome: 'PASS',
      reason: 'Nothing here removes a control.',
    })
  }

  const blocks = checks.filter((c) => c.outcome === 'BLOCK')
  const warns = checks.filter((c) => c.outcome === 'WARN')

  return {
    allowed: blocks.length === 0,
    checks,
    summary: blocks.length > 0
      ? blocks[0].reason
      : warns.length > 0
        ? warns.map((w) => w.reason).join(' ')
        : `${draft.name} saved.`,
  }
}

/**
 * Would deleting this rule leave the company with no governance at all?
 *
 * Not blocked — a company is entitled to decide it needs no approvals, and
 * "most requisitions must clear without a human" makes that a defensible
 * choice rather than a mistake. But it is said out loud and recorded,
 * because the person who finds out six months later is an auditor.
 */
export function assessDeletion(existing: { otherActiveRules: number }): Check {
  if (existing.otherActiveRules === 0) {
    return {
      code: 'LAST_RULE',
      outcome: 'WARN',
      reason: 'This is your last approval rule. Removing it means every requisition clears without anybody approving it. That is a valid choice — it is being recorded as one.',
    }
  }
  return {
    code: 'OK',
    outcome: 'PASS',
    reason: `${existing.otherActiveRules} other rule(s) still apply.`,
  }
}
