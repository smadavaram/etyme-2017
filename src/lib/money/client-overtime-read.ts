/**
 * The top of the ladder over each filing line — the contract the end
 * client pays — read for the rule in `lib/money/client-overtime`: below
 * the top, which hours are overtime is the client's answer.
 *
 * One recursive question for every line (`laddersOver`), so a bill or a
 * receipt with many weeks does not ask once per week.
 */

import { laddersOver } from '@/lib/work-chain-read'
import { carriedOvertime, type Carried, type DecisionRow, type TopLeg } from '@/lib/money/client-overtime'

/** The top of the ladder over each line the hours are filed on. Null where the ladder could not be read. */
export async function topLegsOver(hoursOn: readonly string[]): Promise<Map<string, TopLeg | null>> {
  const out = new Map<string, TopLeg | null>()
  const ids = [...new Set(hoursOn)]
  if (ids.length === 0) return out
  const ladders = await laddersOver(ids)
  for (const id of ids) {
    const top = ladders.get(id)?.[0]
    out.set(id, top ? { sellContractId: top.sellContractId, clientCompanyId: top.endClientCompanyId ?? top.clientCompanyId } : null)
  }
  return out
}

/** One line of a platform bill, as far as this rule needs it. */
export interface BilledLine {
  id: string
  /** The contract the line bills — the seller's own line to the payer. */
  sellContractId: string | null
  sellContract?: { overtimeMultiplierBps: number } | null
  person?: { name: string } | null
  timesheet: {
    sellContractId: string
    overtimeDecisions: DecisionRow[]
  } | null
}

/**
 * For each hours line of a bill sent on the platform that bills a rung
 * below the top, what its overtime is priced on: the client's answer, at
 * the multiplier on the seller's own line to the payer. A line billing
 * the top — every direct placement, and the prime's bill to the client —
 * is not in the map: the client's answer on its own leg prices it, at the
 * multiplier the client chose, as it always has.
 */
export async function carriedForLines(lines: readonly BilledLine[]): Promise<Map<string, Carried>> {
  const out = new Map<string, Carried>()
  const hours = lines.filter((l) => l.timesheet && l.sellContractId)
  if (hours.length === 0) return out
  const tops = await topLegsOver(hours.map((l) => l.timesheet!.sellContractId))
  for (const l of hours) {
    const top = tops.get(l.timesheet!.sellContractId) ?? null
    if (top && top.sellContractId === l.sellContractId) continue
    out.set(
      l.id,
      carriedOvertime(l.timesheet!.overtimeDecisions, top, l.sellContract?.overtimeMultiplierBps ?? NaN, l.person?.name ?? 'this person')
    )
  }
  return out
}
