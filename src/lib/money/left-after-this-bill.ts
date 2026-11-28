import { minorFromWhole } from '@/lib/money'
import { poBalance } from '@/lib/purchase-order'
import { drawnOnOrder } from '@/lib/money/order-drawn'

/**
 * What is left on the order a bill draws against, once this bill is on it.
 *
 * The one figure, read by the payer's coding view and by the issuer's own
 * read of its bill (`/api/invoices/:id/own-bill`), so the two sides of one
 * bill cannot read two numbers for one order.
 *
 * The same figure the three-way check's ceiling reads: everything else
 * that draws on the order (`drawnOnOrder`: bills sent and typed-in
 * invoice receipts, never a draft) plus this bill. The release walk of
 * 2026-11-03 read two figures on one page for one order, because the
 * coding route summed every invoice on the order, drafts included. A
 * document in another currency is never added: the figure is then
 * withheld with the sentence, because two currencies are never added.
 */
export type LeftAfterThisBill =
  | (ReturnType<typeof poBalance> & { number: string; afterThisBill: true })
  | { number: string; unreadable: string }
  | null

export async function leftAfterThisBill(invoice: {
  id: string
  number: string
  currency: string
  /** Whole currency, as `Invoice.total` is stored. */
  total: { toString(): string } | number
  workOrder: {
    id: string
    number: string
    amount: { toString(): string } | number
    currency: string | null
    status: string
    endDate: Date | null
  } | null
}): Promise<LeftAfterThisBill> {
  const order = invoice.workOrder
  if (!order) return null
  const ccy = (order.currency ?? invoice.currency).toUpperCase()
  const drawn = await drawnOnOrder({ id: order.id, currency: ccy }, { invoiceId: invoice.id })
  if (drawn.foreign.length > 0 || invoice.currency.toUpperCase() !== ccy) {
    const others = [...drawn.foreign, ...(invoice.currency.toUpperCase() !== ccy ? [invoice.number] : [])]
    return {
      number: order.number,
      unreadable: `What is left on ${order.number} is not given: ${others.join(', ')} ${others.length === 1 ? 'is' : 'are'} in another currency than the order's ${ccy}, and two currencies are never added.`,
    }
  }
  return {
    number: order.number,
    afterThisBill: true,
    ...poBalance({
      amountCents: minorFromWhole(order.amount, ccy),
      invoicedCents: drawn.cents + minorFromWhole(invoice.total, ccy),
      status: order.status as Parameters<typeof poBalance>[0]['status'],
      endDate: order.endDate,
    }),
  }
}
