import { rollUp, type LineBilling } from '@/lib/money/signed-unbilled'
import type { LineBilled } from '@/lib/money/order-ledger'

/**
 * Billed, beside Spent: what the client's suppliers have billed it, read
 * from money's one definition, never a second computation here.
 *
 * The coordinator's call, 2026-11-09, reversible by the founder in a
 * sentence: "Spent" keeps its meaning (weeks the client signed, per cost
 * center, walked up to the line the client pays: what the client owes).
 * "Billed" sits beside it as its own figure: what was billed on those
 * lines by bills sent (`linesBilled` in lib/money/order-ledger, the same
 * sent-only rule an order's Billed reads). A draft is in neither figure.
 * Where the two differ, the signed time not billed yet is money's own
 * figure for those lines (`signedAndBilled` and `rollUp` in
 * lib/money/signed-unbilled): valued straight time at the rate in force,
 * which money says once on its basis line.
 *
 * Read per sell line rather than per order: an order can carry lines
 * charged to several cost centers, and its billed total is not one cost
 * center's. A line split across cost centers is shared out by its own
 * share, the way Spent is. Money in another currency than the cost
 * center's budget is left out and named, never converted. Pure.
 */

export interface CenterBilled {
  /** Billed on bills sent, in the cost center's currency, minor units. */
  billedCents: number
  /**
   * Signed and not billed yet, money's figure, in the cost center's
   * currency. Null where any of its lines holds a week the next bill would
   * leave off (money's `notBilled.unpriced`): the priced part is never
   * printed as the whole, and `signedNotBilledSays` says why.
   */
  signedNotBilledCents: number | null
  /** Why there is no signed-not-billed figure; null where there is one. */
  signedNotBilledSays: string | null
  /** Billed for hours past what the client signed, money's figure; inside Billed, said beside it. */
  billedOverSignedCents: number
  /** Hours signed and not billed yet. */
  signedNotBilledHours: number
  /** Currencies of lines left out of both figures because they are not the cost center's. */
  otherCurrencies: string[]
}

export function centerBilled(
  lines: readonly { id: string; shareBps: number }[],
  currency: string,
  billed: ReadonlyMap<string, LineBilled>,
  signed: ReadonlyMap<string, LineBilling>
): CenterBilled {
  const ccy = currency.toUpperCase()
  const out: CenterBilled = { billedCents: 0, signedNotBilledCents: 0, signedNotBilledSays: null, billedOverSignedCents: 0, signedNotBilledHours: 0, otherCurrencies: [] }
  let unpriced = 0
  for (const l of lines) {
    const s = signed.get(l.id)
    const b = billed.get(l.id)
    const lineCcy = (s?.currency ?? b?.currencies[0] ?? ccy).toUpperCase()
    const foreign = lineCcy !== ccy || (b?.currencies ?? []).some((c) => c !== ccy)
    if (foreign) {
      for (const c of [lineCcy, ...(b?.currencies ?? [])]) if (c !== ccy && !out.otherCurrencies.includes(c)) out.otherCurrencies.push(c)
      continue
    }
    const share = l.shareBps / 10_000
    out.billedCents += Math.round((b?.billedMinor ?? 0) * share)
    out.signedNotBilledCents = (out.signedNotBilledCents ?? 0) + Math.round((s?.notBilled.amountMinor ?? 0) * share)
    out.billedOverSignedCents += Math.round((s?.billedOverSigned?.amountMinor ?? 0) * share)
    unpriced += s?.notBilled.unpriced ?? 0
    out.signedNotBilledHours = Math.round((out.signedNotBilledHours + (s?.notBilled.hours ?? 0) * share) * 100) / 100
  }
  if (unpriced > 0) {
    out.signedNotBilledCents = null
    out.signedNotBilledSays =
      `${unpriced} signed ${unpriced === 1 ? 'week has' : 'weeks have'} no amount yet, because the next bill would leave ` +
      `${unpriced === 1 ? 'it' : 'them'} off, so no total is given for what is signed and not billed.`
  }
  return out
}

/** The program's lines rolled up per currency: billed by bills sent, and signed not billed yet. */
export function programBilled(signed: ReadonlyMap<string, LineBilling>): {
  currency: string; billedMinor: number; billedOverSignedMinor: number; notBilledMinor: number | null; notBilledHours: number; unpricedWeeks: number
}[] {
  // A currency holding a week the next bill would leave off has no
  // signed-not-billed total: the priced part is never said as the whole.
  return rollUp([...signed.values()]).map((r) => ({
    currency: r.currency, billedMinor: r.billedMinor, billedOverSignedMinor: r.billedOverSignedMinor,
    notBilledMinor: r.unpricedWeeks > 0 ? null : r.notBilledMinor, notBilledHours: r.notBilledHours, unpricedWeeks: r.unpricedWeeks,
  }))
}

/** One cost center's figures, as the budget's totals read them. */
export interface CenterFigures {
  currency: string
  budgetCents: number | null
  committedCents: number
  actualCents: number
  toPayCents: number
  paidCents: number
  billedCents: number
  signedNotBilledCents: number | null
  billedOverSignedCents: number
}

export interface CurrencyTotal extends Omit<CenterFigures, 'budgetCents'> {
  /** Null where no cost center in this currency has a budget. */
  budgetCents: number | null
  /** Cost centers in this currency. */
  centers: number
}

/**
 * The budget's totals, one per currency, in the order the cost centers
 * came: two currencies are never added. A cost center with no budget adds
 * nothing to Budget and everything else to its currency's figures. Pure.
 */
export function budgetTotals(rows: readonly CenterFigures[]): CurrencyTotal[] {
  const by = new Map<string, CurrencyTotal>()
  for (const r of rows) {
    const c = (r.currency || 'USD').toUpperCase()
    const t = by.get(c) ?? { currency: c, budgetCents: null, committedCents: 0, actualCents: 0, toPayCents: 0, paidCents: 0, billedCents: 0, signedNotBilledCents: 0, billedOverSignedCents: 0, centers: 0 }
    if (r.budgetCents != null) t.budgetCents = (t.budgetCents ?? 0) + r.budgetCents
    t.committedCents += r.committedCents
    t.actualCents += r.actualCents
    t.toPayCents += r.toPayCents
    t.paidCents += r.paidCents
    t.billedCents += r.billedCents
    // One center with no figure leaves its currency with no total.
    t.signedNotBilledCents = t.signedNotBilledCents == null || r.signedNotBilledCents == null ? null : t.signedNotBilledCents + r.signedNotBilledCents
    t.billedOverSignedCents += r.billedOverSignedCents
    t.centers += 1
    by.set(c, t)
  }
  return [...by.values()]
}
