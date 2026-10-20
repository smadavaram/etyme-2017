/**
 * Stage: invoice-receipts. Owned by money.
 *
 * What a firm receives from the firm below it, recorded by its own AP
 * clerk. Two ways, because suppliers send them two ways:
 *   - the supplier's bill was raised here and sent, so it lands at the
 *     payer as its invoice receipt, and the clerk records the day it
 *     arrived (`POST /api/invoices/:id/received`), which starts the
 *     clock on its terms;
 *   - the supplier invoices by email, and the clerk keys the invoice in
 *     line by line (`POST /api/ap/bills`), one line per week, each line
 *     matched to the week it bills, at the rate the payer's own buy line
 *     agreed. Every other chain in the run works this way.
 *
 * On one keyed invoice the supplier billed an hour and a half more than
 * the firm accepted (41.5 against 40, 3.75% over): it is recorded and
 * held as disputed, which is the check raising it.
 *
 * And the rule held on purpose: an invoice that bills a week the payer
 * has not accepted is refused outright, with no waiver, naming the week.
 */
import { defineStage, type ReceiptFact } from '../../stage'
import { placementsOf, seatWith, keyedByEmail, weekExtra, addDays, todayIso, dollars, says } from './book'

export default defineStage({
  name: 'invoice-receipts',
  domain: 'MONEY',
  async run(ctx) {
    const { placements } = await placementsOf(ctx)
    const rungOf = (sellId: string) => placements.flatMap((p) => p.ladder.map((r) => ({ r, p }))).find(({ r }) => r.sellId === sellId)

    // ── Bills raised here: the payer records the day each arrived ──────
    let landed = 0
    let landedCents = 0
    const sent = ctx.world.bills.filter((b) => b.status === 'SUBMITTED' && !(b.extra as any)?.ended)
    await ctx.parallel(sent, async (b) => {
      const at = rungOf(String((b.extra as any)?.sellId))
      if (!at) return
      const clerk = (await seatWith(ctx, at.r.buyerId, 'payments.record', [at.p.personId])) ?? (await seatWith(ctx, at.r.buyerId, 'invoices.read', [at.p.personId]))
      if (!clerk) return
      const res = await clerk.post(`/api/invoices/${b.id}/received`, { receivedAt: todayIso() })
      if (!res.ok) return
      landed++
      landedCents += b.totalCents
      const fact: ReceiptFact = {
        id: b.id, by: clerk.key, fromSlug: b.fromSlug, toSlug: b.toSlug, totalCents: b.totalCents, status: 'RECEIVED',
        extra: { kind: 'PLATFORM', placementId: at.p.id, payerId: at.r.buyerId },
      }
      ctx.world.receipts.push(fact)
    })
    // Karthik's bills, too: the client records them like any other.
    const endedBills = ctx.world.bills.filter((b) => b.status === 'SUBMITTED' && (b.extra as any)?.ended)
    const { endedUnbilled } = await placementsOf(ctx)
    await ctx.parallel(endedBills, async (b) => {
      const p = endedUnbilled.find((x) => x.id === (b.extra as any)?.placementId)
      if (!p) return
      const clerk = (await seatWith(ctx, p.bottom.buyerId, 'payments.record', [p.personId])) ?? (await seatWith(ctx, p.bottom.buyerId, 'invoices.read', [p.personId]))
      if (!clerk) return
      const res = await clerk.post(`/api/invoices/${b.id}/received`, { receivedAt: todayIso() })
      if (!res.ok) return
      landed++
      landedCents += b.totalCents
      ctx.world.receipts.push({
        id: b.id, by: clerk.key, fromSlug: b.fromSlug, toSlug: b.toSlug, totalCents: b.totalCents, status: 'RECEIVED',
        extra: { kind: 'PLATFORM', placementId: p.id, payerId: p.bottom.buyerId, ended: true },
      })
    })

    // ── Invoices that came by email: keyed in, line by line ────────────
    const keyed = placements.filter((p) => keyedByEmail(placements, p))
    const buyLines = await ctx.read.buyContract.findMany({
      where: { supplierSellContractId: { in: keyed.map((p) => p.id) } },
      select: { id: true, companyId: true, supplierSellContractId: true, candidates: { select: { personId: true, payRate: true } } },
    })
    let keyedCount = 0
    let keyedCents = 0
    let disputed = 0
    let overCount = 0
    const refusedBlocked: string[] = []
    await ctx.parallel(keyed, async (p, i) => {
      const payerId = p.bottom.buyerId
      const buy = buyLines.find((b) => b.supplierSellContractId === p.id && b.companyId === payerId)
      const rate = buy?.candidates.find((c) => c.personId === p.personId)?.payRate
      if (!buy || !rate) return
      const clerk = (await seatWith(ctx, payerId, 'payments.record', [p.personId])) ?? (await seatWith(ctx, payerId, 'invoices.read', [p.personId]))
      if (!clerk) return
      const weeks = ctx.world.weeks
        .filter((w) => w.contractId === p.id && weekExtra(w).accepted?.[payerId] != null)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      if (weeks.length === 0) return
      // On two invoices, one week billed an hour and a half over on its own:
      // the clerk waives one with a reason and leaves the other held.
      const over = overCount < 2 && weeks.length > 1 ? weeks.shift()! : null
      if (over) overCount++
      // The expenses the payer accepted for this worker ride the same invoice.
      const spent = ctx.world.expenses.filter((e) => e.contractId === p.id && e.status === 'ACCEPTED')
      const send = async (number: string, ws: typeof weeks, overHours: number, withExpenses: boolean) => {
        const lines: Record<string, unknown>[] = ws.map((w) => {
          const hours = weekExtra(w).accepted![payerId] + overHours
          return { timesheetId: w.id, personId: p.personId, hours, rateCents: rate, amountCents: Math.round(hours * rate) }
        })
        if (withExpenses) for (const e of spent) lines.push({ expenseId: e.id, personId: p.personId, amountCents: e.amountCents })
        const total = lines.reduce((a, l) => a + Number(l.amountCents), 0)
        const res = await clerk.post('/api/ap/bills', {
          vendorCompanyId: p.bottom.sellerId, number, currency: 'USD', total: total / 100,
          buyContractId: buy.id, receivedAt: todayIso(), dueAt: addDays(todayIso(), 30), lines,
        })
        const bill = res.json?.data?.bill
        if (!res.ok || !bill?.id) return
        keyedCount++
        keyedCents += total
        if (bill.status === 'DISPUTED') disputed++
        ctx.world.receipts.push({
          id: bill.id, by: clerk.key, fromSlug: p.bottom.sellerSlug, toSlug: p.bottom.buyerSlug, totalCents: total, status: bill.status,
          extra: {
            kind: 'KEYED', placementId: p.id, payerId, number,
            failing: (res.json.data.match?.checks ?? []).filter((c: any) => c.outcome === 'FAIL').map((c: any) => c.code),
          },
        })
      }
      const tag = `${p.bottom.sellerSlug.replace('world-', '').slice(0, 4).toUpperCase()}-${p.id.slice(-5)}`
      await send(`${tag}-${i + 1}`, weeks, 0, true)
      if (over) await send(`${tag}-${i + 1}A`, [over], 1.5, false)
    })

    // ── The rule, held on purpose: a week the payer never accepted ──────
    const blocked = ctx.world.weeks.find((w) => {
      const p = placements.find((q) => q.id === w.contractId)
      return p && p.ladder.length >= 2 && weekExtra(w).accepted?.[p.bottom.buyerId] == null
    })
    const pb = blocked && placements.find((q) => q.id === blocked.contractId)
    if (blocked && pb) {
      const payerId = pb.bottom.buyerId
      const buy = await ctx.read.buyContract.findFirst({
        where: { supplierSellContractId: pb.id, companyId: payerId },
        select: { id: true, candidates: { select: { personId: true, payRate: true } } },
      })
      const rate = buy?.candidates.find((c) => c.personId === pb.personId)?.payRate ?? pb.bottom.billRate
      const clerk = (await seatWith(ctx, payerId, 'payments.record', [pb.personId])) ?? (await seatWith(ctx, payerId, 'invoices.read', [pb.personId]))
      if (clerk) {
        const res = await ctx.expectRefusal(
          clerk,
          (a) => a.post('/api/ap/bills', {
            vendorCompanyId: pb.bottom.sellerId, number: `BLOCK-${pb.id.slice(-6)}`, currency: 'USD', total: (blocked.hours * rate) / 100,
            ...(buy ? { buyContractId: buy.id } : {}), receivedAt: todayIso(), dueAt: addDays(todayIso(), 30),
            lines: [{ timesheetId: blocked.id, personId: pb.personId, hours: blocked.hours, rateCents: rate, amountCents: Math.round(blocked.hours * rate) }],
          }),
          /has not accepted|not accepted/
        )
        if (res.sentence) refusedBlocked.push(res.sentence)
      }
    }

    return {
      closed: landed + keyedCount,
      of: sent.length + endedBills.length + keyed.length,
      says: says([
        `${landed} bills raised here landed at their payers as invoice receipts, ${dollars(landedCents)} (USD).`,
        `${keyedCount} invoices that came by email were keyed in line by line, ${dollars(keyedCents)}; ${disputed} of them held as disputed by the check.`,
      ]),
    }
  },
})

