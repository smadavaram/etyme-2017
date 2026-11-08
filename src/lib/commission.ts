/**
 * What a commission agent is owed for a period.
 *
 * A commission-type buy contract — a recruiter on a placement fee, a
 * partner on a margin share, a referrer paid by the hour — has carried
 * its type, rate and cap on the schema since the buy contract was
 * designed, and nothing ever computed a figure, posted it, or paid it.
 * OrderPosting had a COMMISSION kind the profitability page could read
 * and nothing wrote.
 *
 * Four models, each a one-line rule on the period's facts:
 *
 *   PER_HOUR          cents × hours approved on the linked contracts
 *   FIXED_PER_PERIOD  cents, once per run
 *   ON_PLACEMENT      cents, once per linked contract that started in the period
 *   MARGIN_SHARE      basis points of (bill − pay) × hours on the linked contracts
 *
 * A cap is a ceiling on the total ever paid under the contract; the
 * amount is what is left under it. Pure: the run gathers the facts.
 */

import { spendInReporting, type RateTable } from '@/lib/money/reporting-currency'
import { amount as formatAmount } from '@/lib/money-display'

export type CommissionType = 'PER_HOUR' | 'FIXED_PER_PERIOD' | 'ON_PLACEMENT' | 'MARGIN_SHARE'

export interface CommissionFacts {
  type: CommissionType | string
  /** Cents, or basis points for MARGIN_SHARE. */
  rate: number
  capCents: number | null
  /** Everything posted under this contract before this run. */
  alreadyCents: number
  /** Hours approved on the linked sell contracts in the period. */
  hours: number
  /** (bill − pay) × hours across the linked contracts, in cents. */
  marginCents: number
  /** Linked sell contracts that started inside the period. */
  placementsStarted: number
  /** The currency every amount above is in; omitted, dollars. */
  currency?: string | null
}

export interface CommissionResult {
  earnedCents: number
  /** After the cap. What gets posted. */
  amountCents: number
  capped: boolean
  says: string
}


export function commissionFor(f: CommissionFacts): CommissionResult {
  // In the agreement's own currency and its decimals, through the one formatter.
  const money = (c: number) => formatAmount(c, f.currency || 'USD')
  let earned = 0
  let basis = ''
  switch (f.type) {
    case 'PER_HOUR':
      earned = Math.round(f.rate * f.hours)
      basis = `${f.hours} hours at ${money(f.rate)} an hour`
      break
    case 'FIXED_PER_PERIOD':
      earned = Math.round(f.rate)
      basis = `${money(f.rate)} for the period`
      break
    case 'ON_PLACEMENT':
      earned = Math.round(f.rate * f.placementsStarted)
      basis = `${f.placementsStarted} placement${f.placementsStarted === 1 ? '' : 's'} at ${money(f.rate)}`
      break
    case 'MARGIN_SHARE':
      earned = Math.round((f.marginCents * f.rate) / 10_000)
      basis = `${(f.rate / 100).toFixed(2)}% of ${money(f.marginCents)} margin`
      break
    default:
      return { earnedCents: 0, amountCents: 0, capped: false, says: `No commission model on this contract.` }
  }
  const room = f.capCents == null ? Infinity : Math.max(0, f.capCents - f.alreadyCents)
  const amount = Math.max(0, Math.min(earned, room))
  const capped = amount < earned
  const says =
    amount === 0 && earned === 0
      ? `Nothing earned: ${basis}.`
      : capped
        ? `${money(amount)} of ${money(earned)} earned (${basis}); the ${money(f.capCents!)} cap is reached.`
        : `${money(amount)}: ${basis}.`
  return { earnedCents: earned, amountCents: amount, capped, says }
}

// ── A margin share across sell lines in two currencies ────────────────

export type MarginForCommission =
  | { ok: true; marginCents: number; currency: string; converted: string | null }
  | { ok: false; says: string }

/**
 * The margin a margin-share agreement is paid on, where its sell lines
 * bill in more than one currency.
 *
 * Coordinator's call, 2026-11-08, reversible by the founder in a sentence:
 * two currencies are never added as raw numbers. One currency: its margin,
 * as before. Several, and the company has set rates of its own: each
 * currency's margin converted once into the reporting currency at those
 * rates, and the sentence says which. Several and no rates of its own (the
 * shipped sample is never used for money that is paid): no figure, and the
 * sentence names each currency's margin on its own.
 */
export function marginForCommission(
  margins: readonly { currency: string; minor: number }[],
  table: RateTable | null,
  on: Date,
): MarginForCommission {
  const byCurrency = new Map<string, number>()
  for (const m of margins) {
    const c = (m.currency || 'USD').toUpperCase()
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + m.minor)
  }
  const live = [...byCurrency.entries()].filter(([, v]) => v !== 0)
  if (live.length <= 1) {
    const [currency, marginCents] = live[0] ?? [[...byCurrency.keys()][0] ?? 'USD', 0]
    return { ok: true, marginCents, currency, converted: null }
  }
  const each = live.map(([c, v]) => formatAmount(v, c)).join(' and ')
  if (!table || table.sample) {
    return {
      ok: false,
      says: `The margin is ${each}, in two currencies, and they are never added as they stand. Set your own rate to your reporting currency and the run converts them once at it.`,
    }
  }
  const spend = spendInReporting(live.map(([currency, minor]) => ({ currency, minor })), table.reportingCurrency, table, on)
  if (!spend.total) return { ok: false, says: `The margin is ${each}. ${spend.says}` }
  return { ok: true, marginCents: spend.total.minor, currency: spend.reportingCurrency, converted: `Margin converted: ${each} is ${spend.says}` }
}
