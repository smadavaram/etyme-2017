import { prisma } from '@/lib/db'
import { decimalsFor } from '@/lib/money'

/**
 * What has already been drawn on a purchase order, by both of the ways a
 * supplier's invoice reaches the record.
 *
 * A supplier on the platform sends its bill here as an `Invoice`; the
 * payer keys in what an off-platform supplier sent as a `VendorBill`.
 * Both draw on the same order, and each check counted only its own kind:
 * the typed-in intake counted typed-in receipts, the platform check
 * counted platform invoices. So an order could be filled once by each
 * and paid twice past its ceiling. One door now, read by both checks.
 *
 * Only documents in the order's own currency are added. Anything drawn
 * in another currency is returned by number rather than added, because
 * rupees and dollars are never added; the caller refuses the ceiling
 * check rather than guess at an exchange rate.
 *
 * Counted: platform invoices sent (not a draft, not cancelled or void),
 * and typed-in receipts not cancelled. A disputed receipt counts: it is
 * a claim on the order until somebody cancels it.
 */
export async function drawnOnOrder(
  order: { id: string; currency: string },
  except: { invoiceId?: string | null; vendorBillId?: string | null; only?: 'RECEIPTS' } = {},
): Promise<{ cents: number; foreign: string[] }> {
  const ccy = order.currency.toUpperCase()
  const [invoices, receipts] = await Promise.all([
    except.only === 'RECEIPTS'
      ? Promise.resolve([] as { number: string; total: unknown; currency: string }[])
      : prisma.invoice.findMany({
          where: {
            workOrderId: order.id,
            status: { notIn: ['VOID', 'CANCELLED', 'DRAFT'] },
            ...(except.invoiceId ? { id: { not: except.invoiceId } } : {}),
          },
          select: { number: true, total: true, currency: true },
        }),
    prisma.vendorBill.findMany({
      where: {
        workOrderId: order.id,
        status: { not: 'CANCELLED' },
        ...(except.vendorBillId ? { id: { not: except.vendorBillId } } : {}),
      },
      select: { number: true, totalCents: true, currency: true },
    }),
  ])
  let cents = 0
  const foreign: string[] = []
  for (const i of invoices) {
    if (i.currency.toUpperCase() !== ccy) foreign.push(i.number)
    else cents += Math.round(parseFloat(String(i.total)) * 10 ** decimalsFor(ccy))
  }
  for (const r of receipts) {
    if (r.currency.toUpperCase() !== ccy) foreign.push(r.number)
    else cents += r.totalCents
  }
  return { cents, foreign }
}
