/**
 * The drafts among a client's unbilled weeks, one per bill, each carrying
 * only its own weeks' amount and count. A week holds at most one draft, so
 * no amount is counted under two bills. Exported for its test.
 */
export function draftsOf(rows: readonly { draft: { invoiceId: string; number: string; status?: string; says?: string } | null; amountMinor: number | null; currency: string }[]): {
  invoiceId: string; number: string; status?: string; says?: string
  weeks: number; amountMinor: number | null; currency: string
}[] {
  const by = new Map<string, { invoiceId: string; number: string; status?: string; says?: string; weeks: number; amountMinor: number | null; currency: string }>()
  for (const w of rows) {
    if (!w.draft) continue
    const at = by.get(w.draft.invoiceId) ?? { ...w.draft, weeks: 0, amountMinor: 0 as number | null, currency: w.currency }
    at.weeks += 1
    at.amountMinor = at.amountMinor == null || w.amountMinor == null ? null : at.amountMinor + w.amountMinor
    by.set(w.draft.invoiceId, at)
  }
  return [...by.values()]
}
