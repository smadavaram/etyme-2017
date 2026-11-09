import type { WatchedPo } from '@/lib/watch'

/**
 * One open order as the nightly watch reads it: its ceiling and what was
 * billed against it, in its own currency.
 *
 * Both figures are the Decimal times a hundred, the unit `WatchedPo`
 * documents, and are said through `orderAmount` in the order's currency,
 * so a dong order reads whole dong. Only invoices in the order's own
 * currency are added up: an invoice in another currency is never summed
 * into it, and its currency is passed on as left out, so the finding says
 * so rather than printing a total that adds two currencies. Pure.
 */
export interface OrderRow {
  id: string
  issuedById: string
  number: string
  amount: unknown
  currency: string
  endDate: Date | null
  status: string
  issuedTo: { name: string }
  invoices: { total: unknown; status: string; currency: string }[]
  sellContracts: { id: string }[]
}

const NOT_BILLED = ['VOID', 'CANCELLED']

export function watchedOrder(po: OrderRow): WatchedPo {
  const live = po.invoices.filter((i) => !NOT_BILLED.includes(i.status))
  const own = live.filter((i) => i.currency === po.currency)
  const otherCurrencies = [...new Set(live.filter((i) => i.currency !== po.currency).map((i) => i.currency))].sort()
  return {
    id: po.id,
    companyId: po.issuedById,
    number: po.number,
    supplierName: po.issuedTo.name,
    amountCents: Math.round(Number(po.amount) * 100),
    invoicedCents: own.reduce((s, i) => s + Math.round(Number(i.total) * 100), 0),
    currency: po.currency,
    otherCurrencies,
    endDate: po.endDate,
    status: po.status,
    liveContracts: po.sellContracts.length,
  }
}
