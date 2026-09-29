/**
 * The line a rate row is on, and who is party to it.
 *
 * `RateHistory.contractId` is polymorphic — a sell line or a buy line —
 * so which firms may write or decide a rate on it is read off the line,
 * never off the caller's own permissions. A permission says what a desk
 * may do at its own firm; it says nothing about another firm's contract.
 *
 * A BUY line has one payer — the firm whose money it is — and the firm
 * it buys from, where there is one. A SELL line has the firm selling and
 * the client buying. Nobody else is a party, and the site the work
 * happens at is not one either.
 */

import { prisma } from '@/lib/db'

export interface RateLine {
  /** The firm whose money the rate is. */
  payerId: string
  /** Every firm that is party to the line, the payer included. */
  parties: string[]
  /** What the line itself records, before any change: the pay or bill rate. */
  recordedRateCents: number
  currency: string
  /** The day the line started, for an opening row at its recorded rate. */
  startDate: Date
}

export async function lineFor(contractType: string, contractId: string): Promise<RateLine | null> {
  if (String(contractType).toUpperCase() === 'BUY') {
    const bc = await prisma.buyContract.findUnique({
      where: { id: contractId },
      select: {
        companyId: true, vendorCompanyId: true, payCurrency: true, startDate: true,
        candidates: { select: { payRate: true, payCurrency: true, startDate: true, state: true } },
      },
    })
    if (!bc) return null
    // A rate row sits on the buy line, not on a person, so it can only
    // speak for a line paying one rate. The one live person on it is who
    // it pays; where it names several, the first live one stands in and
    // the approval route says nothing more precise than that.
    const cand = bc.candidates.find((c) => c.state === 'ACTIVE') ?? bc.candidates[0] ?? null
    return {
      payerId: bc.companyId,
      parties: [bc.companyId, ...(bc.vendorCompanyId ? [bc.vendorCompanyId] : [])],
      recordedRateCents: cand?.payRate ?? 0,
      currency: cand?.payCurrency ?? bc.payCurrency,
      startDate: cand?.startDate ?? bc.startDate,
    }
  }
  const sc = await prisma.sellContract.findUnique({
    where: { id: contractId },
    select: { companyId: true, clientCompanyId: true, billRate: true, billCurrency: true, startDate: true },
  })
  if (!sc) return null
  return {
    payerId: sc.clientCompanyId,
    parties: [sc.companyId, sc.clientCompanyId],
    recordedRateCents: sc.billRate,
    currency: sc.billCurrency,
    startDate: sc.startDate,
  }
}
