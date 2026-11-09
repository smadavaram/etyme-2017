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
  /** Signed and not billed yet, money's figure, in the cost center's currency. */
  signedNotBilledCents: number
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
  const out: CenterBilled = { billedCents: 0, signedNotBilledCents: 0, signedNotBilledHours: 0, otherCurrencies: [] }
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
    out.signedNotBilledCents += Math.round((s?.notBilled.amountMinor ?? 0) * share)
    out.signedNotBilledHours = Math.round((out.signedNotBilledHours + (s?.notBilled.hours ?? 0) * share) * 100) / 100
  }
  return out
}

/** The program's lines rolled up per currency: billed by bills sent, and signed not billed yet. */
export function programBilled(signed: ReadonlyMap<string, LineBilling>): { currency: string; billedMinor: number; notBilledMinor: number; notBilledHours: number }[] {
  return rollUp([...signed.values()]).map((r) => ({
    currency: r.currency, billedMinor: r.billedMinor, notBilledMinor: r.notBilledMinor, notBilledHours: r.notBilledHours,
  }))
}
