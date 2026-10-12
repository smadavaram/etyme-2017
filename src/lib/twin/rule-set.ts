/**
 * The numbers a company sets for the twin's rules, read in one place.
 *
 * `RuleSet` holds only the twin's own numbers: the days before the time
 * limit at which it warns, and how far billed hours may sit from
 * accepted hours before an invoice receipt is raised to a person. The
 * limit and the break themselves stay the client's governance rules,
 * which every door already reads. No row means the shipped defaults,
 * and `source` says so, so a sentence never passes a default off as a
 * company's choice.
 *
 * The rules themselves are regulatory's (lib/twin/rules/tenure) and
 * money's (lib/twin/rules/invoice). They read their numbers through
 * `ruleSetFor`; nothing here decides anything with them.
 */

import { prisma } from '@/lib/db'

export interface TwinRuleSet {
  version: number
  source: 'DEFAULT' | 'COMPANY'
  /** Widest first: [90, 60, 30]. */
  tenureWarnAtDays: number[]
  /** Basis points: 200 is 2%. */
  hoursToleranceBps: number
  /** The same number as a per cent, the unit the invoice rule reads. */
  hoursTolerancePct: number
}

export const DEFAULT_RULE_SET: TwinRuleSet = {
  version: 0,
  source: 'DEFAULT',
  tenureWarnAtDays: [90, 60, 30],
  hoursToleranceBps: 200,
  hoursTolerancePct: 2,
}

/** Why these numbers cannot be saved, in sentences. Empty when they can. */
export function checkRuleSet(r: { tenureWarnAtDays: number[]; hoursToleranceBps: number }): string[] {
  const out: string[] = []
  const days = r.tenureWarnAtDays
  if (!Array.isArray(days) || days.length === 0) out.push('Give at least one warning day before the time limit.')
  else if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) out.push('Each warning day is a whole number of days from 1 to 365.')
  else if (new Set(days).size !== days.length) out.push('Each warning day appears once.')
  const bps = r.hoursToleranceBps
  if (!Number.isInteger(bps) || bps < 0) out.push('The hours tolerance is a whole number of basis points, zero or more.')
  // The invoice rule refuses a tolerance over 25% (refuseRules); the same
  // ceiling here, so a number saved is a number the rule will use.
  else if (bps > 2500) out.push('An hours tolerance over 25% would let a quarter of a week through unseen. Set 25% or less.')
  return out
}

export async function ruleSetFor(companyId: string): Promise<TwinRuleSet> {
  const row = await prisma.ruleSet.findFirst({
    where: { companyId },
    orderBy: { version: 'desc' },
    select: { version: true, tenureWarnAtDays: true, hoursToleranceBps: true },
  })
  if (!row) return DEFAULT_RULE_SET
  return {
    version: row.version,
    source: 'COMPANY',
    tenureWarnAtDays: [...row.tenureWarnAtDays].sort((a, b) => b - a),
    hoursToleranceBps: row.hoursToleranceBps,
    hoursTolerancePct: row.hoursToleranceBps / 100,
  }
}

/** A new version, never an overwrite, with an automation-log row beside it. */
export async function setRuleSet(args: {
  companyId: string
  personId: string
  reason: string
  tenureWarnAtDays: number[]
  hoursToleranceBps: number
}): Promise<{ ok: true; version: number } | { ok: false; says: string[] }> {
  const reason = args.reason.trim()
  const says = checkRuleSet(args)
  if (!reason) says.push('Say why the numbers are changing.')
  if (says.length) return { ok: false, says }
  const days = [...args.tenureWarnAtDays].sort((a, b) => b - a)

  const version = await prisma.$transaction(async (tx) => {
    const last = await tx.ruleSet.findFirst({
      where: { companyId: args.companyId }, orderBy: { version: 'desc' }, select: { version: true },
    })
    const v = (last?.version ?? 0) + 1
    const row = await tx.ruleSet.create({
      data: {
        companyId: args.companyId, version: v, tenureWarnAtDays: days,
        hoursToleranceBps: args.hoursToleranceBps, setByPersonId: args.personId, reason,
      },
      select: { id: true },
    })
    await tx.automationLog.create({
      data: {
        companyId: args.companyId,
        action: 'TWIN_RULE_SET_SET',
        summary: `The twin now warns ${days.join(', ')} days before the time limit and raises hours more than ${args.hoursToleranceBps / 100}% off.`,
        reason,
        payload: { ruleSetId: row.id, version: v, byPersonId: args.personId, tenureWarnAtDays: days, hoursToleranceBps: args.hoursToleranceBps },
        reversible: true,
      },
    })
    return v
  })
  return { ok: true, version }
}
