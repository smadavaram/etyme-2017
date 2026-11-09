/**
 * The one door onto what a firm owes its suppliers.
 *
 * Read by Accounts payable and by the invoice list alike, so the two
 * cannot say two figures. The arithmetic is `owedInAll` in
 * lib/money/supplier-invoices; this only loads both halves.
 *
 * `payablesOf` is the load itself, with the payments made against each
 * half, so cash flow (lib/money/cash-flow) reads what is due and what
 * was paid from the same rows the page reads what is owed from.
 */

import { prisma } from '@/lib/db'
import { DRAWS_NOTHING } from '@/lib/money/bill-state'
import { fromPrismaDecimal } from '@/lib/money'
import { directionFrom, invoiceBetween, partiesOf } from '@/lib/money/invoice-parties'
import { owedInAll, type SupplierInvoiceRow } from '@/lib/money/supplier-invoices'

/** One payment made to a supplier, in minor units of its own currency. */
export interface PaymentOut {
  currency: string
  minor: number
  /** The day it was paid; null where the record does not say. */
  at: Date | null
}

export async function payablesOf(companyId: string): Promise<{
  generated: SupplierInvoiceRow[]
  keyed: SupplierInvoiceRow[]
  paymentsOut: PaymentOut[]
}> {
  const invoices = await prisma.invoice.findMany({
    where: { AND: [invoiceBetween(companyId), { status: { notIn: [...DRAWS_NOTHING] } }] },
    select: {
      id: true, number: true, currency: true, total: true, paid: true, dueAt: true, status: true,
      payments: { select: { amount: true, currency: true, receivedAt: true } },
      engagement: {
        select: {
          msa: {
            select: {
              vendorId: true, clientId: true,
              vendor: { select: { id: true, name: true } },
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
      workOrder: {
        select: {
          issuedById: true, issuedToId: true, number: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
        },
      },
    },
    take: 5_000,
  })
  const generated: SupplierInvoiceRow[] = []
  const paymentsOut: PaymentOut[] = []
  for (const i of invoices) {
    const parties = partiesOf({ agreement: i.engagement.msa, order: i.workOrder })
    if (directionFrom(parties, companyId) !== 'PAYABLE') continue
    generated.push({
      id: i.id, number: i.number, supplierName: parties.vendor?.name ?? null, currency: i.currency,
      totalMinor: fromPrismaDecimal(i.total, i.currency).minor,
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt, status: i.status,
    })
    for (const p of i.payments) {
      // A payment is in the invoice's currency; a payment row saying
      // another is read in its own and never converted.
      const cur = p.currency || i.currency
      paymentsOut.push({ currency: cur, minor: fromPrismaDecimal(p.amount, cur).minor, at: p.receivedAt })
    }
  }
  const bills = await prisma.vendorBill.findMany({
    where: { companyId, status: { notIn: ['CANCELLED', 'VOID'] } },
    select: {
      id: true, number: true, currency: true, totalCents: true, paidCents: true, dueAt: true, status: true,
      paidAt: true,
      payments: { select: { amount: true, currency: true, receivedAt: true } },
      vendorCompany: { select: { name: true } },
    },
    take: 5_000,
  })
  const keyed: SupplierInvoiceRow[] = bills.map((b) => ({
    id: b.id, number: b.number, supplierName: b.vendorCompany.name, currency: b.currency,
    totalMinor: b.totalCents, paidMinor: b.paidCents, dueAt: b.dueAt, status: b.status,
  }))
  for (const b of bills) {
    if (b.payments.length > 0) {
      for (const p of b.payments) {
        const cur = p.currency || b.currency
        paymentsOut.push({ currency: cur, minor: fromPrismaDecimal(p.amount, cur).minor, at: p.receivedAt })
      }
    } else if (b.paidCents > 0) {
      // A receipt marked paid with no payment row behind it: the amount
      // the receipt carries, on the day it says, or no day where it says none.
      paymentsOut.push({ currency: b.currency, minor: b.paidCents, at: b.paidAt })
    }
  }
  return { generated, keyed, paymentsOut }
}

export async function whatWeOwe(companyId: string, now: Date) {
  const { generated, keyed } = await payablesOf(companyId)
  return owedInAll(generated, keyed, now)
}
