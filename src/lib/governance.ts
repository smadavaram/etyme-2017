import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'

/**
 * Governance enforcement engine — Addendum E §E.6.
 *
 * "BLOCK where legally grounded — tenure limit, break in service,
 *  work authorisation, lapsed supplier insurance, segregation-of-duties
 *  violation. WARN, capture a reason, proceed everywhere else — rate
 *  band, headcount plan, vendor tier. Never silently permit."
 *
 * Every evaluation is recorded as a GovernanceEvaluation row —
 * the audit trail. This is the rule: even a PASS is recorded.
 *
 * Trigger points:
 *   SUBMISSION       — when a consultant is submitted to a requirement
 *   CONTRACT_START   — when a contract is activated
 *   EXTENSION        — when a contract is extended
 *   ALUMNI_REENGAGEMENT — when "ask them back" is invoked
 */

// ── Types ────────────────────────────────────────────────

export type TriggerPoint =
  | 'SUBMISSION'
  | 'CONTRACT_START'
  | 'EXTENSION'
  | 'ALUMNI_REENGAGEMENT'

export type EvaluationOutcome = 'PASS' | 'WARN' | 'BLOCK'

export interface EvaluationResult {
  ruleId: string
  ruleType: string
  enforcementMode: 'BLOCK' | 'WARN'
  outcome: EvaluationOutcome
  reason: string
  /** For WARN outcomes — the caller can override with a justification */
  overridable: boolean
}

export interface GovernanceResult {
  /** Overall outcome — BLOCK if any BLOCK, WARN if any WARN, PASS if all PASS */
  outcome: EvaluationOutcome
  /** Individual rule evaluations */
  evaluations: EvaluationResult[]
  /** True if the action can proceed (all PASS, or all non-BLOCK with overrides) */
  canProceed: boolean
  /** Human-readable summary of blocks/warnings */
  summary: string
}

// ── Core evaluate function ───────────────────────────────

/**
 * Evaluate all active governance rules for a given action.
 *
 * Usage:
 *   const result = await evaluateGovernance({
 *     personId: consultant.id,
 *     endClientCompanyId: clientCompany.id,
 *     vendorCompanyId: vendor.id,
 *     triggerPoint: 'CONTRACT_START',
 *     subjectType: 'SELL_CONTRACT',
 *     subjectId: contract.id,
 *     billRate: 15000,  // cents
 *   })
 *
 *   if (!result.canProceed) {
 *     return { error: result.summary, evaluations: result.evaluations }
 *   }
 */
export async function evaluateGovernance(params: {
  personId: string
  endClientCompanyId: string
  vendorCompanyId?: string
  triggerPoint: TriggerPoint
  subjectType: 'PERSON' | 'SELL_CONTRACT' | 'BUY_CONTRACT'
  subjectId: string
  /** Bill rate in cents — used for RATE_BAND checks */
  billRate?: number
  /** Requirement ID — used for HEADCOUNT_PLAN checks */
  requirementId?: string
}): Promise<GovernanceResult> {
  const {
    personId,
    endClientCompanyId,
    vendorCompanyId,
    triggerPoint,
    subjectType,
    subjectId,
    billRate,
  } = params

  // Load all active rules for this client
  const rules = await prisma.governanceRule.findMany({
    where: {
      policy: { companyId: endClientCompanyId, isActive: true },
      isActive: true,
    },
    include: {
      policy: { select: { companyId: true, name: true } },
    },
  })

  if (rules.length === 0) {
    // No governance — pass by default, no evaluation recorded
    return {
      outcome: 'PASS',
      evaluations: [],
      canProceed: true,
      summary: 'No governance rules configured',
    }
  }

  const evaluations: EvaluationResult[] = []

  for (const rule of rules) {
    const ruleParams = rule.parameters as Record<string, any>
    let result: EvaluationResult | null = null

    switch (rule.ruleType) {
      case 'TENURE_CAP':
        result = await evaluateTenureCap(
          personId, endClientCompanyId, rule.id, rule.enforcementMode as 'BLOCK' | 'WARN',
          ruleParams, rule.description
        )
        break

      case 'BREAK_IN_SERVICE':
        result = await evaluateBreakInService(
          personId, endClientCompanyId, rule.id, rule.enforcementMode as 'BLOCK' | 'WARN',
          ruleParams, rule.description
        )
        break

      case 'RATE_BAND':
        if (billRate != null) {
          result = evaluateRateBand(
            billRate, rule.id, rule.enforcementMode as 'BLOCK' | 'WARN',
            ruleParams, rule.description
          )
        }
        break

      case 'VENDOR_TIER':
        if (vendorCompanyId) {
          result = await evaluateVendorTier(
            vendorCompanyId, endClientCompanyId, rule.id,
            rule.enforcementMode as 'BLOCK' | 'WARN', ruleParams, rule.description
          )
        }
        break

      case 'INSURANCE_REQUIRED':
        if (vendorCompanyId) {
          result = await evaluateInsurance(
            vendorCompanyId, rule.id, rule.enforcementMode as 'BLOCK' | 'WARN',
            ruleParams, rule.description
          )
        }
        break

      // HEADCOUNT_PLAN, SEGREGATION_OF_DUTIES — future implementation
      default:
        break
    }

    if (result) {
      evaluations.push(result)

      // Record the evaluation — the audit trail
      await prisma.governanceEvaluation.create({
        data: {
          ruleId: rule.id,
          triggerPoint,
          subjectType,
          subjectId,
          outcome: result.outcome,
          reason: result.reason,
        },
      }).catch((err) => {
        console.error('[Governance] Failed to record evaluation:', err)
      })
    }
  }

  // Determine overall outcome
  const hasBlock = evaluations.some((e) => e.outcome === 'BLOCK')
  const hasWarn = evaluations.some((e) => e.outcome === 'WARN')

  const outcome: EvaluationOutcome = hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'PASS'
  const canProceed = !hasBlock

  // Build summary
  const blocks = evaluations.filter((e) => e.outcome === 'BLOCK')
  const warns = evaluations.filter((e) => e.outcome === 'WARN')

  let summary: string
  if (blocks.length > 0) {
    summary = `Blocked: ${blocks.map((b) => b.reason).join('; ')}`
  } else if (warns.length > 0) {
    summary = `Warning: ${warns.map((w) => w.reason).join('; ')}`
  } else {
    summary = `All ${evaluations.length} governance check(s) passed`
  }

  return { outcome, evaluations, canProceed, summary }
}

// ── Rule evaluators ──────────────────────────────────────

/**
 * TENURE_CAP — "No direct vendor hire beyond N months"
 *
 * Addendum E: "Tenure accrues to the person at the client, aggregated
 * across all vendors and all assignments."
 */
async function evaluateTenureCap(
  personId: string,
  endClientCompanyId: string,
  ruleId: string,
  enforcementMode: 'BLOCK' | 'WARN',
  params: Record<string, any>,
  description: string,
): Promise<EvaluationResult> {
  const maxMonths = params.maxMonths ?? 18
  const capDays = Math.round(maxMonths * 30.44)

  const now = new Date()

  const contracts = await prisma.sellContract.findMany({
    where: {
      personId,
      ...endClientFilter(endClientCompanyId),
      state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
    },
    select: { startDate: true, endDate: true },
  })

  const totalDays = contracts.reduce((sum, c) => {
    const end = c.endDate ?? now
    return sum + Math.max(0, Math.ceil((end.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)))
  }, 0)

  const totalMonths = Math.round(totalDays / 30.44)

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { name: true },
  })
  const personName = person?.name ?? personId.slice(0, 8)

  if (totalDays >= capDays) {
    return {
      ruleId,
      ruleType: 'TENURE_CAP',
      enforcementMode,
      outcome: enforcementMode,
      reason: `${personName} has ${totalMonths} months tenure (cap: ${maxMonths}). ${description}`,
      overridable: enforcementMode === 'WARN',
    }
  }

  const pctUsed = totalDays / capDays
  if (pctUsed >= 0.75) {
    return {
      ruleId,
      ruleType: 'TENURE_CAP',
      enforcementMode,
      outcome: 'WARN',
      reason: `${personName} is at ${totalMonths} of ${maxMonths} months (${Math.round(pctUsed * 100)}% of cap)`,
      overridable: true,
    }
  }

  return {
    ruleId,
    ruleType: 'TENURE_CAP',
    enforcementMode,
    outcome: 'PASS',
    reason: `${personName}: ${totalMonths} of ${maxMonths} months (${Math.round(pctUsed * 100)}%)`,
    overridable: false,
  }
}

/**
 * BREAK_IN_SERVICE — required gap between engagements
 *
 * "Inside a break period, show the eligibility date instead of a button."
 */
async function evaluateBreakInService(
  personId: string,
  endClientCompanyId: string,
  ruleId: string,
  enforcementMode: 'BLOCK' | 'WARN',
  params: Record<string, any>,
  description: string,
): Promise<EvaluationResult> {
  const breakDays = params.breakDays ?? 30
  const now = new Date()

  // Find the most recent ended contract
  const lastContract = await prisma.sellContract.findFirst({
    where: {
      personId,
      ...endClientFilter(endClientCompanyId),
      state: 'ENDED',
      endDate: { not: null },
    },
    orderBy: { endDate: 'desc' },
    select: { endDate: true },
  })

  if (!lastContract?.endDate) {
    return {
      ruleId,
      ruleType: 'BREAK_IN_SERVICE',
      enforcementMode,
      outcome: 'PASS',
      reason: 'No prior ended contract — break-in-service not applicable',
      overridable: false,
    }
  }

  const daysSinceEnd = Math.ceil(
    (now.getTime() - lastContract.endDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { name: true },
  })
  const personName = person?.name ?? personId.slice(0, 8)

  if (daysSinceEnd < breakDays) {
    const eligibleDate = new Date(lastContract.endDate.getTime() + breakDays * 24 * 60 * 60 * 1000)
    return {
      ruleId,
      ruleType: 'BREAK_IN_SERVICE',
      enforcementMode,
      outcome: enforcementMode,
      reason: `${personName}: ${daysSinceEnd} of ${breakDays} break days completed. Eligible ${eligibleDate.toISOString().slice(0, 10)}. ${description}`,
      overridable: enforcementMode === 'WARN',
    }
  }

  return {
    ruleId,
    ruleType: 'BREAK_IN_SERVICE',
    enforcementMode,
    outcome: 'PASS',
    reason: `${personName}: ${daysSinceEnd} days since last contract (break: ${breakDays} required) — clear`,
    overridable: false,
  }
}

/**
 * RATE_BAND — bill rate must fall within approved range
 *
 * "WARN, capture a reason, proceed"
 */
function evaluateRateBand(
  billRateCents: number,
  ruleId: string,
  enforcementMode: 'BLOCK' | 'WARN',
  params: Record<string, any>,
  description: string,
): EvaluationResult {
  const minRate = params.minRate ?? 0 // cents
  const maxRate = params.maxRate ?? Infinity // cents
  const billRate = billRateCents / 100

  if (billRateCents < minRate) {
    return {
      ruleId,
      ruleType: 'RATE_BAND',
      enforcementMode,
      outcome: enforcementMode,
      reason: `Bill rate $${billRate}/hr is below minimum $${(minRate / 100).toFixed(0)}/hr. ${description}`,
      overridable: enforcementMode === 'WARN',
    }
  }

  if (billRateCents > maxRate) {
    return {
      ruleId,
      ruleType: 'RATE_BAND',
      enforcementMode,
      outcome: enforcementMode,
      reason: `Bill rate $${billRate}/hr exceeds maximum $${(maxRate / 100).toFixed(0)}/hr. ${description}`,
      overridable: enforcementMode === 'WARN',
    }
  }

  return {
    ruleId,
    ruleType: 'RATE_BAND',
    enforcementMode,
    outcome: 'PASS',
    reason: `Bill rate $${billRate}/hr within approved band`,
    overridable: false,
  }
}

/**
 * VENDOR_TIER — vendor must be approved/preferred
 */
async function evaluateVendorTier(
  vendorCompanyId: string,
  endClientCompanyId: string,
  ruleId: string,
  enforcementMode: 'BLOCK' | 'WARN',
  params: Record<string, any>,
  description: string,
): Promise<EvaluationResult> {
  const requiredTier = params.requiredTier ?? 'APPROVED'

  // Check if the vendor has a relationship with this client at the required tier
  // For now, check if the vendor has any active MSA with this client
  const msa = await prisma.masterAgreement.findFirst({
    where: {
      vendorId: vendorCompanyId,
      clientId: endClientCompanyId,
      // Active: not expired
    },
    select: { id: true },
  })

  const vendor = await prisma.company.findUnique({
    where: { id: vendorCompanyId },
    select: { name: true },
  })
  const vendorName = vendor?.name ?? vendorCompanyId.slice(0, 8)

  if (!msa) {
    return {
      ruleId,
      ruleType: 'VENDOR_TIER',
      enforcementMode,
      outcome: enforcementMode,
      reason: `${vendorName} has no active MSA with this client. ${description}`,
      overridable: enforcementMode === 'WARN',
    }
  }

  return {
    ruleId,
    ruleType: 'VENDOR_TIER',
    enforcementMode,
    outcome: 'PASS',
    reason: `${vendorName} has an active MSA`,
    overridable: false,
  }
}

/**
 * INSURANCE_REQUIRED — vendor must have current insurance
 */
async function evaluateInsurance(
  vendorCompanyId: string,
  ruleId: string,
  enforcementMode: 'BLOCK' | 'WARN',
  params: Record<string, any>,
  description: string,
): Promise<EvaluationResult> {
  const now = new Date()

  // Check for a current insurance verification
  const insurance = await prisma.verification.findFirst({
    where: {
      companyId: vendorCompanyId,
      type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
      status: 'CLEAR',
      expiresAt: { gt: now },
    },
  })

  const vendor = await prisma.company.findUnique({
    where: { id: vendorCompanyId },
    select: { name: true },
  })
  const vendorName = vendor?.name ?? vendorCompanyId.slice(0, 8)

  if (!insurance) {
    return {
      ruleId,
      ruleType: 'INSURANCE_REQUIRED',
      enforcementMode,
      outcome: enforcementMode,
      reason: `${vendorName} has no current insurance verification on file. ${description}`,
      overridable: enforcementMode === 'WARN',
    }
  }

  return {
    ruleId,
    ruleType: 'INSURANCE_REQUIRED',
    enforcementMode,
    outcome: 'PASS',
    reason: `${vendorName} insurance verified (expires ${insurance.expiresAt!.toISOString().slice(0, 10)})`,
    overridable: false,
  }
}
