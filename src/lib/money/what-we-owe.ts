/**
 * The one door onto what a firm owes its suppliers.
 *
 * Read by Accounts payable and by the invoice list alike, so the two
 * cannot say two figures. The arithmetic is `owedInAll` in
 * lib/money/supplier-invoices; this only loads both halves.
 */

import { prisma } from '@/lib/db'
import { fromPrismaDecimal } from '@/lib/money'
import { directionFrom, invoiceBetween, partiesOf } from '@/lib/money/invoice-parties'
import { owedInAll, type SupplierInvoiceRow } from '@/lib/money/supplier-invoices'

export async function whatWeOwe(companyId: string, now: Date) {
  const invoices = await prisma.invoice.findMany({
    where: { AND: [invoiceBetween(companyId), { status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] } }] },
    select: {
      id: true, number: true, currency: true, total: true, paid: true, dueAt: true, status: true,
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
  for (const i of invoices) {
    const parties = partiesOf({ agreement: i.engagement.msa, order: i.workOrder })
    if (directionFrom(parties, companyId) !== 'PAYABLE') continue
    generated.push({
      id: i.id, number: i.number, supplierName: parties.vendor?.name ?? null, currency: i.currency,
      totalMinor: fromPrismaDecimal(i.total, i.currency).minor,
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt, status: i.status,
    })
  }
  const bills = await prisma.vendorBill.findMany({
    where: { companyId, status: { notIn: ['CANCELLED', 'VOID'] } },
    select: {
      id: true, number: true, currency: true, totalCents: true, paidCents: true, dueAt: true, status: true,
      vendorCompany: { select: { name: true } },
    },
    take: 5_000,
  })
  const keyed: SupplierInvoiceRow[] = bills.map((b) => ({
    id: b.id, number: b.number, supplierName: b.vendorCompany.name, currency: b.currency,
    totalMinor: b.totalCents, paidMinor: b.paidCents, dueAt: b.dueAt, status: b.status,
  }))
  return owedInAll(generated, keyed, now)
}
