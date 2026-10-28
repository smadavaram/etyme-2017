import { prisma } from '@/lib/db'
import { partiesOf } from '@/lib/money/invoice-parties'
import { mayPayFirm, type Gate } from '@/lib/setup-gates'

/**
 * Whether the firm an invoice receipt pays has had its bank details
 * checked, for a caller that holds only the receipt's id.
 *
 * The setup checklist, 2026-10-28: "no payment to a firm without verified
 * bank details", refused in a sentence that names the step. The rule is
 * `mayPayFirm` in lib/setup-gates; this reads who the receipt is between
 * (`partiesOf`, the same reading the payment write uses) and asks it.
 * Read by `mayPayInvoiceReceipt`, so the twin does not ask a yes the
 * payment would refuse, and by the receipt's page, so it does not draw a
 * Pay the route would refuse. The payment write asks `mayPayFirm` itself.
 *
 * Null where the receipt does not exist or cannot say who it is between;
 * the payment write refuses those in its own sentence.
 */
export async function payeeBankGate(invoiceId: string): Promise<Gate | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
      workOrder: { select: { issuedById: true, issuedToId: true } },
      invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } } },
    },
  })
  if (!invoice) return null
  const parties = partiesOf({
    agreement: invoice.engagement.msa,
    order: invoice.workOrder,
    lines: invoice.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })
  if (!parties.vendor || !parties.client) return null
  return mayPayFirm(parties.client.id, parties.vendor.id)
}
