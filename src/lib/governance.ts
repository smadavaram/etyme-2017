import { prisma } from '@/lib/db'
import { meets as tierMeets } from '@/lib/supplier-tier'
import { endClientFilter } from '@/lib/resolve-end-client'
import { monthsOf, standingAgainstLimit, type SiteLine, type Standing } from '@/lib/tenure-days'
import { plainDate } from '@/lib/plain-date'

/**
 * Governance enforcement engine — Addendum E §E.6.
 *
 * "BLOCK where legally grounded — tenure limit, break in service,
 *  work authorization, lapsed supplier insurance, segregation-of-duties
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
  /** The moment the rules are asked at. Defaults to now. */
  now?: Date
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

  // ── The time limit and the break, read once ──
  //
  // Both rules ask the same question of the same lines — where is this
  // person against this client's limit and break — and they used to ask
  // it separately and get different answers. The award refused for ever
  // anybody once past the limit, while the ledger and the submission
  // door called a served break eligible; and the break was counted from
  // a rung that ended while another rung ran. One standing now, read by
  // `standingAgainstLimit`, the same function the ledger reads.
  const now = params.now ?? new Date()
  const capRule = rules.find((r) => r.ruleType === 'TENURE_CAP')
  const breakRule = rules.find((r) => r.ruleType === 'BREAK_IN_SERVICE')
  let standing: Standing | null = null
  let personName = personId.slice(0, 8)
  let clientName = 'this client'
  const limitRules = {
    capMonths: capRule ? Number((capRule.parameters as Record<string, any>).maxMonths ?? 18) : null,
    breakDays: breakRule ? Number((breakRule.parameters as Record<string, any>).breakDays ?? 30) : null,
  }
  if (capRule || breakRule) {
    const [lines, person, client] = await Promise.all([
      prisma.sellContract.findMany({
        where: {
          personId,
          ...endClientFilter(endClientCompanyId),
          state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
        },
        select: { startDate: true, endDate: true, state: true },
      }),
      prisma.person.findUnique({ where: { id: personId }, select: { name: true } }),
      prisma.company.findUnique({ where: { id: endClientCompanyId }, select: { name: true } }),
    ])
    const site: SiteLine[] = lines.map((l) => ({ startDate: l.startDate, endDate: l.endDate, live: l.state !== 'ENDED' }))
    standing = standingAgainstLimit(site, limitRules, now)
    if (person?.name) personName = person.name
    if (client?.name) clientName = client.name
  }

  for (const rule of rules) {
    const ruleParams = rule.parameters as Record<string, any>
    let result: EvaluationResult | null = null

    switch (rule.ruleType) {
      case 'TENURE_CAP':
        result = tenureCapVerdict({
          standing: standing!, personName, clientName,
          capMonths: limitRules.capMonths!, breakDays: limitRules.breakDays,
          ruleId: rule.id, enforcementMode: rule.enforcementMode as 'BLOCK' | 'WARN', description: rule.description,
        })
        break

      case 'BREAK_IN_SERVICE':
        result = breakInServiceVerdict({
          standing: standing!, personName, clientName,
          breakDays: limitRules.breakDays!, now,
          ruleId: rule.id, enforcementMode: rule.enforcementMode as 'BLOCK' | 'WARN', description: rule.description,
        })
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

// ── The time limit and the break, as verdicts ─────────────

function day(d: Date): string {
  return plainDate(d.toISOString().slice(0, 10))
}

function months(n: number): string {
  return `${n} month${n === 1 ? '' : 's'}`
}

function withDescription(reason: string, description: string): string {
  return description?.trim() ? `${reason} ${description.trim()}` : reason
}

interface LimitVerdictArgs {
  standing: Standing
  personName: string
  clientName: string
  ruleId: string
  enforcementMode: 'BLOCK' | 'WARN'
  description: string
}

/**
 * TENURE_CAP — the client's time limit, from the one standing.
 *
 * Addendum E: "Tenure accrues to the person at the client, aggregated
 * across all vendors and all assignments." Counted in the days the
 * limit counts — since the last break served — so somebody who served
 * the break is eligible here exactly as they are on the ledger and at
 * the submission door. Pure.
 */
export function tenureCapVerdict(a: LimitVerdictArgs & { capMonths: number; breakDays: number | null }): EvaluationResult {
  const { standing: s, personName, clientName, capMonths, breakDays, ruleId, enforcementMode, description } = a
  const served = months(monthsOf(s.countedDays))
  const limit = `${clientName}’s ${months(capMonths)} time limit`
  // The opening clause is quoted verbatim on the public product page
  // (lib/public-site/modules), so it stays as it reads there.
  const opening = `${personName} has ${monthsOf(s.countedDays)} months tenure (time limit: ${capMonths}).`
  const refuse = (reason: string): EvaluationResult => ({
    ruleId, ruleType: 'TENURE_CAP', enforcementMode, outcome: enforcementMode,
    reason: withDescription(reason, description), overridable: enforcementMode === 'WARN',
  })
  const pass = (reason: string): EvaluationResult => ({
    ruleId, ruleType: 'TENURE_CAP', enforcementMode, outcome: 'PASS', reason, overridable: false,
  })

  switch (s.state) {
    case 'PAST_ON_SITE':
      return refuse(
        `${opening} Counted across every supplier at ${clientName}, and they are still on site. ` +
        (s.eligibleOn
          ? `With the ${breakDays}-day break after they leave, the earliest day they may come back is ${day(s.eligibleOn)}.`
          : breakDays != null
            ? 'Their current contract has no end date, so there is no day yet on which they may come back.'
            : `${clientName}’s rules set no break, so they give no day on which they may come back.`)
      )
    case 'PAST_NO_RETURN':
      return refuse(
        `${opening} Counted across every supplier at ${clientName}. ` +
        `${clientName}’s rules set no break after the limit, so nothing resets the count and there is no day on which they may come back.`
      )
    case 'IN_BREAK':
      if (s.pastLimit) {
        return refuse(
          `${opening} Counted across every supplier at ${clientName}, ` +
          `and they left on ${day(s.lastDay!)}. The ${breakDays}-day break ends on ${day(s.eligibleOn!)}; they may come back from that day.`
        )
      }
      break
    case 'BREAK_SERVED':
      return pass(
        `${personName} served the ${breakDays}-day break after leaving ${clientName} on ${day(s.lastDay!)}, ` +
        `so ${limit} counts again from nought.`
      )
    case 'APPROACHING': {
      const pct = Math.round((s.countedDays / s.limitDays!) * 100)
      return {
        ruleId, ruleType: 'TENURE_CAP', enforcementMode, outcome: 'WARN',
        // Quoted on the public product page, as it reads there.
        reason: `${personName} is at ${monthsOf(s.countedDays)} of ${capMonths} months (${pct}% of the time limit)`,
        overridable: true,
      }
    }
    default:
      break
  }
  const pct = s.limitDays ? Math.round((s.countedDays / s.limitDays) * 100) : 0
  return pass(`${personName}: ${served} of ${limit} (${pct}%).`)
}

/**
 * BREAK_IN_SERVICE — the days away the client requires before somebody
 * comes back, from the one standing.
 *
 * "Inside a break period, show the eligibility date instead of a button."
 * A break starts only when no line at the client is live: a chain's rung
 * that ended while another rung runs is not a break, and blocking
 * somebody mid-placement on it was the bug. Pure.
 */
export function breakInServiceVerdict(a: LimitVerdictArgs & { breakDays: number; now: Date }): EvaluationResult {
  const { standing: s, personName, clientName, breakDays, now, ruleId, enforcementMode, description } = a
  const pass = (reason: string): EvaluationResult => ({
    ruleId, ruleType: 'BREAK_IN_SERVICE', enforcementMode, outcome: 'PASS', reason, overridable: false,
  })
  if (s.onSiteNow) {
    return pass(
      `${personName} is on site at ${clientName} now, so no break is running: a break starts only when no contract there is live.`
    )
  }
  if (!s.lastDay) {
    return pass(`${personName} has not been on site at ${clientName} before, so no break applies.`)
  }
  if (s.state === 'IN_BREAK') {
    return {
      ruleId, ruleType: 'BREAK_IN_SERVICE', enforcementMode, outcome: enforcementMode,
      reason: withDescription(
        `${personName} left ${clientName} on ${day(s.lastDay)}, and ${clientName} requires a ${breakDays}-day break ` +
        `before anybody comes back. They may come back from ${day(s.eligibleOn!)}.`,
        description
      ),
      overridable: enforcementMode === 'WARN',
    }
  }
  const away = Math.floor((now.getTime() - s.lastDay.getTime()) / 86_400_000)
  return pass(`${personName} left ${clientName} on ${day(s.lastDay)}, ${away} days ago, and the ${breakDays}-day break is served.`)
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

  // The standing the client gave this supplier, from its own register;
  // an agreement on file counts as approved where nobody has rated them.
  const [msa, standing, vendor] = await Promise.all([
    prisma.masterAgreement.findFirst({
      where: { vendorId: vendorCompanyId, clientId: endClientCompanyId },
      select: { id: true },
    }),
    prisma.counterparty.findFirst({
      where: { companyId: endClientCompanyId, otherCompanyId: vendorCompanyId, relationship: 'SUPPLIER' },
      select: { tier: true },
    }),
    prisma.company.findUnique({ where: { id: vendorCompanyId }, select: { name: true } }),
  ])
  const vendorName = vendor?.name ?? vendorCompanyId.slice(0, 8)

  const verdict = tierMeets({ supplierName: vendorName, tier: standing?.tier, hasAgreement: Boolean(msa), required: String(requiredTier) })
  return {
    ruleId,
    ruleType: 'VENDOR_TIER',
    enforcementMode,
    outcome: verdict.ok ? 'PASS' : enforcementMode,
    reason: verdict.ok ? verdict.reason : `${verdict.reason} ${description}`,
    overridable: !verdict.ok && enforcementMode === 'WARN',
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
