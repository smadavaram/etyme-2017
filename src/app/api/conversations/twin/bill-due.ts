/**
 * A drafted bill's due line, read at the moment a card is drawn (walk
 * four, 2026-10-26). The twin stores the due sentence when it drafts the
 * bill; a card read days later must say what sending it today would mean.
 * Money answers that (`pastDueOnSendingNowMany` in lib/money/bill-send);
 * the stored payload stands only where the bill could not be read, and a
 * bill already sent closes its card. Read by Ask Etyme's card and the
 * Teams card alike, so the two doors say one due line.
 */

import { pastDueOnSendingNowMany, pastDueOnSendingNow } from '@/lib/money/bill-send'
import type { BillCardPayload } from '@/lib/money/supplier-bills'
import { billWithDue } from './ask'

/**
 * Each bill with today's due line, keyed as given. A key maps to null where
 * the bill is already sent, so the card closes; to the stored bill where
 * the bill could not be read. Never throws: a failed read keeps every
 * stored line.
 */
export async function billsDueToday<K>(
  bills: ReadonlyArray<{ key: K; bill: BillCardPayload; invoiceId: string }>,
  today: Date = new Date(),
): Promise<Map<K, BillCardPayload | null>> {
  const out = new Map<K, BillCardPayload | null>()
  if (bills.length === 0) return out
  const now = await pastDueOnSendingNowMany(bills.map((b) => b.invoiceId), today).catch(() => new Map())
  for (const b of bills) {
    if (!now.has(b.invoiceId)) { out.set(b.key, b.bill); continue }
    const live = now.get(b.invoiceId)
    out.set(b.key, live ? billWithDue(b.bill, live) : null)
  }
  return out
}

/** One bill, the same way: null where it is already sent. */
export async function billDueToday(bill: BillCardPayload, invoiceId: string, today: Date = new Date()): Promise<BillCardPayload | null> {
  const live = await pastDueOnSendingNow(invoiceId, today, { dueSays: bill.dueSays, pastDue: bill.pastDue ?? null }).catch(() => undefined)
  if (live === undefined) return bill
  return live ? billWithDue(bill, live) : null
}
