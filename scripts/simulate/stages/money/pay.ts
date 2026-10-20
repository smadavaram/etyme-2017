/**
 * Stage: pay. Owned by money.
 *
 * The AP clerk at each payer pays what came through the check, and only
 * that, through the one gate a payment asks at the moment money leaves:
 *   - a bill raised here is paid on its page
 *     (`POST /api/invoices/:id/payments`), which runs the same gate the
 *     twin reads (`payGate` over `matchInvoice`, as `mayPayInvoiceReceipt`
 *     does), in whole currency, the amount still owed;
 *   - an invoice keyed in is paid on the receipts list
 *     (`PATCH /api/ap/bills`), which runs the keyed check again.
 *
 * Every payment says who paid whom: read back off the record, a payment
 * row with no payer or no payee is a money fault.
 *
 * And the rule held on purpose: the receipt left held over its hours is
 * not paid.
 */
import { defineStage, type PaymentFact } from '../../stage'
import { seatWith, placementsOf, todayIso, dollars, says } from './book'

export default defineStage({
  name: 'pay',
  domain: 'MONEY',
  async run(ctx) {
    const { placements, endedUnbilled } = await placementsOf(ctx)
    const all = [...placements, ...endedUnbilled]
    const personOf = (r: { extra?: Record<string, unknown> }) => all.find((p) => p.id === r.extra?.placementId)?.personId ?? ''
    const receipts = ctx.world.receipts
    if (receipts.length === 0) return { closed: 0, says: 'Nothing has reached a payer to pay.' }

    let paid = 0
    let cents = 0
    const payable = receipts.filter((r) => (r.extra?.kind === 'PLATFORM' && r.extra?.matched !== false) || (r.extra?.kind === 'KEYED' && r.status !== 'DISPUTED'))
    await ctx.parallel(payable, async (r) => {
      const clerk = await seatWith(ctx, String(r.extra!.payerId), 'payments.record', [personOf(r)])
      if (!clerk) return
      const res = r.extra!.kind === 'PLATFORM'
        ? await clerk.post(`/api/invoices/${r.id}/payments`, { amount: r.totalCents / 100, method: 'ACH', reference: `ACH-${r.id.slice(-8)}` })
        : await clerk.patch('/api/ap/bills', { id: r.id, paidAt: todayIso(), method: 'ACH', reference: `ACH-${r.id.slice(-8)}` })
      if (!res.ok) return
      paid++
      cents += r.totalCents
      r.status = 'PAID'
      const fact: PaymentFact = { id: r.id, by: clerk.key, billId: r.id, amountCents: r.totalCents, extra: { kind: r.extra!.kind } }
      ctx.world.payments.push(fact)
    })

    // ── The rule, held on purpose: a held receipt is not paid ───────────
    const held = receipts.find((r) => r.extra?.kind === 'KEYED' && r.status === 'DISPUTED')
    if (held) {
      const clerk = await seatWith(ctx, String(held.extra!.payerId), 'payments.record', [personOf(held)])
      if (clerk) {
        await ctx.expectRefusal(clerk, (a) => a.patch('/api/ap/bills', { id: held.id, paidAt: todayIso() }), /does not pass|disputed|held|exception/i)
      }
    }

    // ── Who paid whom, read back off the record ─────────────────────────
    const rows = await ctx.read.payment.findMany({
      where: { OR: [{ invoiceId: { in: ctx.world.payments.map((p) => p.billId) } }, { vendorBillId: { in: ctx.world.payments.map((p) => p.billId) } }] },
      select: { payerCompanyId: true, receivedByCompanyId: true, amount: true },
    })
    const nameless = rows.filter((r) => !r.payerCompanyId || !r.receivedByCompanyId).length
    for (let i = 0; i < Math.min(nameless, 5); i++) ctx.log('money fault: a payment row names no payer or no payee.')

    return {
      closed: paid,
      of: payable.length,
      says: says([
        `${paid} of ${payable.length} invoice receipts paid by the payer's AP clerk through the one gate, ${dollars(cents)} (USD).`,
        `${rows.length - nameless} of ${rows.length} payment rows name who paid whom${nameless ? `; ${nameless} do not, a money fault` : ''}.`,
      ]),
    }
  },
})
