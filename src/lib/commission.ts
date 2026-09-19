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
}

export interface CommissionResult {
  earnedCents: number
  /** After the cap. What gets posted. */
  amountCents: number
  capped: boolean
  says: string
}

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function commissionFor(f: CommissionFacts): CommissionResult {
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
