import { prisma } from '@/lib/db'

/**
 * What Settings > Approvals and Settings > Cost centers say about who
 * approves a job request, built from one count so the two tabs cannot
 * disagree again (fix list of 2026-11-14, E4: Approvals said "every job
 * request clears", Cost centers said "every job request will be routed").
 *
 * Each sentence is the engine's own answer (`evaluateRequisition` in
 * lib/requisition-approval, read only here), said for the firm's counts:
 *   - A job request with no cost center is routed, and asks the
 *     "applies to everything" rules; with none, an HR or Procurement
 *     contact; with nobody named, it clears with a note on it.
 *   - A value rule asks its person only above its value.
 *   - A cost center's owner is asked when a job request charged to it
 *     needs a person's yes.
 * Nobody named anywhere never refuses: it clears with a note (Addendum E,
 * "a role nobody has named falls back; it never refuses").
 *
 * A job request with no cost center names no team, so the requisitions
 * route loads only the company-wide rules for it (`orgUnitId: null`). The
 * no-cost-center sentence counts those alone; a rule scoped to one
 * department is said apart (the press of 2026-11-15: one department's
 * "applies to everything" rule read as if it caught every job request,
 * and the engine cleared the job by itself).
 */

/**
 * The rules a job request naming no team is routed by: the company-wide
 * ones. The requisitions route's company-wide branch is this filter, and
 * a test holds the two together.
 */
export const NO_TEAM_RULES = { orgUnitId: null } as const

/** What a rule scoped to one department means, said once. */
export function scopedSays(scoped: number): string {
  if (scoped === 0) return ''
  return scoped === 1
    ? ' One rule is set for one department. It applies only to job requests for that department.'
    : ` ${scoped} rules are set for one department each. Each applies only to job requests for its department.`
}

export interface ApprovalCount {
  /** Active approval rules of every kind, wherever they are scoped. */
  rules: number
  /**
   * Active rules a job request naming no team reads: the company-wide ones
   * (`NO_TEAM_RULES`). A rule scoped to one department is not among them.
   */
  companyWide: number
  /** Active company-wide value rules with no value: "applies to everything". */
  everything: number
  /** Active company-wide HR or Procurement contacts. */
  contacts: number
  /** Active rules scoped to one department: they apply only to its job requests. */
  scoped: number
  /** Active cost centers. */
  costCenters: number
  /** Active cost centers with an owner named. */
  ownedCostCenters: number
}

export interface ApprovalWords {
  approvals: string
  costCenters: string
}

/** The two sentences, from one count. Pure. */
export function approvalWords(c: ApprovalCount): ApprovalWords {
  // Who a job request with no cost center goes to.
  const noCostCenter =
    c.everything > 0 || c.contacts > 0
      ? 'A job request with no cost center goes to the person your approval rules name.'
      : c.companyWide > 0
        ? 'A job request with no cost center goes to a person only when its value is above one of your approval rules. Otherwise it clears by itself, with a note on it.'
        : c.rules > 0
        ? 'A job request with no cost center clears by itself, with a note on it, because no rule for the whole company names a person to ask.'
        : 'A job request with no cost center clears by itself, with a note on it, because no approval rule names a person to ask.'
  const owners =
    c.ownedCostCenters > 0
      ? ' A job request charged to a cost center with an owner goes to that owner when it needs a yes.'
      : ''

  const scoped = scopedSays(c.scoped)

  const approvals =
    c.rules === 0
      ? `No approval rules. ${noCostCenter}${owners}`
      : `${c.rules === 1 ? 'One rule' : `${c.rules} rules`}. A job request waits for a person when it matches one. ${noCostCenter}${scoped}${owners}`

  const costCenters =
    c.costCenters === 0
      ? `None yet. ${noCostCenter}${scoped}`
      : `${noCostCenter}${scoped}${owners}`

  return { approvals, costCenters }
}

/** The count both tabs read, in one place. */
export async function readApprovalCount(companyId: string): Promise<ApprovalCount> {
  const [rules, companyWide, everything, contacts, costCenters, ownedCostCenters] = await Promise.all([
    prisma.approvalRule.count({ where: { companyId, isActive: true } }),
    prisma.approvalRule.count({ where: { companyId, isActive: true, ...NO_TEAM_RULES } }),
    prisma.approvalRule.count({ where: { companyId, isActive: true, ...NO_TEAM_RULES, kind: 'VALUE', thresholdAmount: null } }),
    prisma.approvalRule.count({ where: { companyId, isActive: true, ...NO_TEAM_RULES, kind: { in: ['HR', 'PROCUREMENT'] } } }),
    prisma.costCenter.count({ where: { companyId, isActive: true } }),
    prisma.costCenter.count({ where: { companyId, isActive: true, ownerId: { not: null } } }),
  ])
  return { rules, companyWide, everything, contacts, scoped: rules - companyWide, costCenters, ownedCostCenters }
}
