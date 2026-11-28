/**
 * Pay, said on a screen. Pure, so a page can import it without a
 * database coming with it.
 */

import { DEFAULT_CURRENCY, compact } from '@/lib/money-display'

/**
 * Who said yes or no to a rate change, in words. A change that cleared
 * on its own was approved by its proposer under the threshold, and says
 * so — it is the one case the proposer and the approver are one person.
 */
export function decidedBy(row: { approvalState: string; approvedByName?: string | null; changedByName: string }): string {
  if (row.approvalState === 'PROPOSED') return 'Waiting'
  const who = row.approvedByName ?? 'Unknown'
  if (row.approvalState === 'REJECTED') return `Rejected by ${who}`
  return row.approvedByName && row.approvedByName === row.changedByName ? `${who} (within the threshold)` : who
}

/**
 * The rates a period was paid at, where there was more than one:
 * "16 h at $66 · 24 h at $70". Null where one rate covers it all.
 */
export function ratesSay(
  rates: Array<{ rateCents: number; hours: number }> | null | undefined,
  currency: string = DEFAULT_CURRENCY
): string | null {
  if (!rates || rates.length < 2) return null
  return [...rates]
    .map((r) => `${Math.round(r.hours * 100) / 100} h at ${compact(r.rateCents, currency)}`)
    .join(' · ')
}
