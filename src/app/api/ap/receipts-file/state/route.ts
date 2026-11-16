import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { recordRefusal } from '@/lib/access-log'
import { standingMessage, standingOfRows, supplierLineSays } from '@/lib/money/bill-feed'
import { partiesOf } from '@/lib/money/invoice-parties'

/**
 * GET /api/ap/receipts-file/state?bill=<invoice receipt id>
 *     or ?invoice=<the supplier's own bill id>
 *
 * The second asks by the bill the supplier sees on its own Bills page: the
 * client's record of it is the one the client keyed under the same number.
 *
 * What the client's system said about each line of an invoice the caller
 * sent: sent, accepted, rejected with the client's reason, or paid with
 * the day and the client's reference (Layer 9, slices 2 and 3). Read by
 * the supplier that issued the invoice, for its own lines only. It shows
 * no cost center, no GL account and no code of the client's.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The state of an invoice’s lines')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'An invoice belongs to the firm that sent it' } }, { status: 403 })
  }
  const billParam = request.nextUrl.searchParams.get('bill')
  const invoiceParam = request.nextUrl.searchParams.get('invoice')
  if (!billParam && !invoiceParam) return NextResponse.json({ error: { code: 'VALIDATION', field: 'bill', message: 'Which invoice?' } }, { status: 422 })

  const select = {
    id: true, number: true, vendorCompanyId: true, companyId: true,
    company: { select: { name: true } },
    lines: { select: { id: true, amountCents: true, person: { select: { name: true } } }, orderBy: { createdAt: 'asc' as const } },
  }
  let billId = billParam ?? ''
  if (!billParam && invoiceParam) {
    // The supplier's own bill, found at the client by the number the client keyed.
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceParam },
      select: {
        number: true,
        workOrder: { select: { issuedById: true, issuedToId: true } },
        engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
      },
    })
    const parties = inv ? partiesOf({ agreement: inv.engagement.msa, order: inv.workOrder }) : null
    if (!inv || !parties || parties.vendor?.id !== caller.company.id || !parties.client) {
      await recordRefusal([{ companyId: caller.company.id }], {
        actorPersonId: caller.isService ? undefined : caller.person.id,
        actorCompanyId: caller.company.id,
        action: 'CONTRACT_VIEW',
        reason: `Refused the state of bill ${invoiceParam}: it is not the reader's own bill.`,
      })
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such invoice here' } }, { status: 404 })
    }
    const at = await prisma.vendorBill.findUnique({
      where: { companyId_vendorCompanyId_number: { companyId: parties.client.id, vendorCompanyId: caller.company.id, number: inv.number } },
      select: { id: true },
    })
    if (!at) {
      const client = await prisma.company.findUnique({ where: { id: parties.client.id }, select: { name: true } })
      return NextResponse.json({
        data: {
          billId: null, number: inv.number, client: client?.name ?? null, lines: [],
          says: 'Not sent yet',
        },
      })
    }
    billId = at.id
  }

  const bill = await prisma.vendorBill.findUnique({ where: { id: billId }, select })
  if (!bill || bill.vendorCompanyId !== caller.company.id) {
    // Written before the refusal is sent; another firm's invoice answers as a missing one.
    await recordRefusal([{ companyId: bill?.vendorCompanyId ?? caller.company.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused the state of invoice ${billId}: it is not the reader's own invoice.`,
    })
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such invoice here' } }, { status: 404 })
  }
  const msgs = await prisma.billFeedMessage.findMany({
    where: { vendorBillId: bill.id },
    select: { lineId: true, shareKey: true, direction: true, state: true, reason: true, externalRef: true, answeredAt: true, createdAt: true },
  })
  const lines = bill.lines.map((l) => {
    const rows = new Map<string, typeof msgs>()
    for (const m of msgs.filter((x) => x.lineId === l.id)) rows.set(m.shareKey, [...(rows.get(m.shareKey) ?? []), m])
    const stands = standingOfRows(
      [...rows.values()].map((ms) => standingMessage(ms.map((m) => ({ ...m, direction: m.direction as 'OUT' | 'IN', state: m.state as never })))),
    )
    const sent = msgs
      .filter((x) => x.lineId === l.id && x.direction === 'OUT' && x.state === 'SENT')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const words = supplierLineSays({ stands, sentAt: sent?.createdAt ?? null, clientName: bill.company.name })
    return {
      lineId: l.id, person: l.person?.name ?? null, amountCents: l.amountCents,
      state: stands ? stands.state : 'NOT_SENT',
      says: words.says, next: words.next,
    }
  })
  return NextResponse.json({ data: { billId: bill.id, number: bill.number, client: bill.company.name, lines } })
}
