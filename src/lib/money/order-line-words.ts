/**
 * What a line on an order is for, said to the firm reading it.
 *
 * `lineDoes` in `lib/order-naming` says a buy line from the buyer's end
 * only: "You pay from this line — Tapin's invoice, received and matched."
 * The seller reads the same order (it is their sales order), and a buy
 * line on it is the buyer's line paying *them*. Tapin read Brightmoor's
 * words about Tapin as though they were its own (the Tapin walk,
 * 2026-10-29). So a line written by the other end is said from this end:
 * the firm on the other side pays this firm from it, on this firm's
 * invoice. A sell line read by the buyer is unchanged in meaning: the
 * supplier bills from it.
 *
 * Pure.
 */
import { lineDoes } from '@/lib/order-naming'

type OrderSide = Parameters<typeof lineDoes>[1]

export function lineDoesForReader(
  line: { side: 'SELL' | 'BUY'; personName: string; paidToName?: string | null },
  readerSide: OrderSide,
  counterpartyName: string
): string {
  if (line.side === 'BUY' && readerSide === 'SELLER') {
    return `${counterpartyName} pays you from this line — your invoice, received and matched.`
  }
  return lineDoes(line, readerSide)
}
