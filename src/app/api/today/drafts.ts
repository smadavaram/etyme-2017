import type { CurrencyTotal } from '@/lib/money/firm-today'

/** A drafted bill's own figures, read off the bill: its total, expense lines included, and the weeks it holds. */
export interface DraftBillFacts { totalMinor: number; currency: string; weeks: number }

/**
 * The drafts among a client's unbilled weeks, one per bill. Each carries
 * the bill's own total and the number of weeks the bill itself holds,
 * never a sum of the weeks' hour values: a draft of 192 hours and a $576
 * expense is $22,080, not $21,504 (walk 9, item 6). A draft whose bill was
 * not read says its amount is not priced rather than a partial sum.
 */
export function draftsOf(
  rows: readonly { draft: { invoiceId: string; number: string; status?: string; says?: string } | null; currency: string }[],
  bills: ReadonlyMap<string, DraftBillFacts>,
): { invoiceId: string; number: string; status?: string; says?: string; weeks: number; amountMinor: number | null; currency: string }[] {
  const by = new Map<string, { invoiceId: string; number: string; status?: string; says?: string; weeks: number; amountMinor: number | null; currency: string }>()
  for (const w of rows) {
    if (!w.draft || by.has(w.draft.invoiceId)) continue
    const bill = bills.get(w.draft.invoiceId)
    by.set(w.draft.invoiceId, {
      ...w.draft,
      weeks: bill?.weeks ?? rows.filter((r) => r.draft?.invoiceId === w.draft!.invoiceId).length,
      amountMinor: bill ? bill.totalMinor : null,
      currency: bill?.currency ?? w.currency,
    })
  }
  return [...by.values()]
}

/**
 * Signed-and-not-billed totals with each line's accepted billable expenses
 * added, per currency, the way the line reader counts them
 * (`notBilled.amountMinor` = the priced weeks + `notBilled.expenseMinor`).
 * The week count is unchanged: an expense is not a week.
 */
export function withExpenses(totals: readonly CurrencyTotal[], expenses: ReadonlyMap<string, number>): CurrencyTotal[] {
  const out = totals.map((t) => ({ ...t }))
  for (const [currency, minor] of expenses) {
    if (!minor) continue
    const at = out.find((t) => t.currency === currency)
    // A whole that is unknown (a week that cannot be priced) stays unknown.
    if (at) { if (at.amountMinor != null) at.amountMinor += minor; at.pricedMinor += minor }
    else out.push({ currency, amountMinor: minor, pricedMinor: minor, count: 0, unpriced: 0 })
  }
  return out
}
