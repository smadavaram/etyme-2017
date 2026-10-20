/**
 * Stage: three-way-check. Owned by money.
 *
 * Every invoice receipt is checked against its order and the weeks the
 * payer accepted — the hours, the invoice and the contract rate must all
 * agree — by the payer's AP clerk:
 *   - a bill raised here is checked where the clerk opens it
 *     (`GET /api/invoices/:id/match`);
 *   - an invoice keyed in was checked as it was recorded, and the clerk
 *     reads the check as it stands now on the receipts list
 *     (`GET /api/ap/receipts`).
 *
 * A clean receipt passes. A receipt over the accepted hours is held. The
 * clerk waives a difference with a reason where the firm agrees to pay
 * it (`POST /api/ap/bills/:id/match/override`), and leaves one held, so
 * the payment station can show that a held receipt is not paid. A week
 * the payer never accepted was refused at the door with no waiver
 * (invoice-receipts); nothing here can wave it through.
 */
import { defineStage } from '../../stage'
import { seatWith, placementsOf, dollars, says } from './book'

const WAIVE_REASON = 'The extra hour and a half was worked on the client’s release and agreed by phone; paying it.'

export default defineStage({
  name: 'three-way-check',
  domain: 'MONEY',
  async run(ctx) {
    const { placements, endedUnbilled } = await placementsOf(ctx)
    const all = [...placements, ...endedUnbilled]
    const receipts = ctx.world.receipts
    if (receipts.length === 0) return { closed: 0, says: 'No invoice receipt to check.' }
    const personOf = (r: { extra?: Record<string, unknown> }) => all.find((p) => p.id === r.extra?.placementId)?.personId ?? ''

    let passed = 0
    let failed = 0
    const failures: string[] = []
    await ctx.parallel(receipts.filter((r) => r.extra?.kind === 'PLATFORM'), async (r) => {
      const clerk = (await seatWith(ctx, String(r.extra!.payerId), 'payments.record', [personOf(r)])) ?? (await seatWith(ctx, String(r.extra!.payerId), 'invoices.read', [personOf(r)]))
      if (!clerk) return
      const res = await clerk.get(`/api/invoices/${r.id}/match`)
      if (!res.ok) return
      const matched = Boolean(res.json?.data?.matched)
      r.extra!.matched = matched
      if (matched) passed++
      else {
        failed++
        failures.push(`${r.fromSlug} → ${r.toSlug}: ${res.json?.data?.summary ?? 'did not pass'}`)
      }
    })

    // Keyed receipts: the payer's list says how each stands now.
    const keyed = receipts.filter((r) => r.extra?.kind === 'KEYED')
    const payers = [...new Set(keyed.map((r) => String(r.extra!.payerId)))]
    await ctx.parallel(payers, async (payerId) => {
      const clerk = await seatWith(ctx, payerId, 'payments.record')
      if (clerk) await clerk.get('/api/ap/receipts')
    })
    let keyedClean = 0
    let held = 0
    let waived = 0
    let waivedCents = 0
    const disputed = keyed.filter((r) => r.status === 'DISPUTED')
    keyedClean = keyed.length - disputed.length
    // Every held receipt but the last is waived with a reason; the last stays held.
    const toWaive = disputed.slice(0, Math.max(0, disputed.length - 1))
    await ctx.parallel(toWaive, async (r) => {
      const clerk = await seatWith(ctx, String(r.extra!.payerId), 'payments.record', [personOf(r)])
      if (!clerk) return
      let ok = true
      for (const code of (r.extra!.failing as string[]) ?? []) {
        const res = await clerk.post(`/api/ap/bills/${r.id}/match/override`, { code, reason: WAIVE_REASON })
        if (!res.ok) ok = false
      }
      if (ok) {
        waived++
        waivedCents += r.totalCents
        r.status = 'RECEIVED'
        r.extra!.waived = true
      }
    })
    held = disputed.length - waived

    return {
      closed: passed + keyedClean + waived,
      of: receipts.length,
      says: says([
        `${passed} bills raised here passed the check at their payer${failed ? `, ${failed} did not` : ''}.`,
        `${keyedClean} keyed invoice receipts passed as recorded; ${disputed.length} were held over the accepted hours, ${waived} of them waived with a reason (${dollars(waivedCents)}), ${held} left held.`,
        failures.length ? `Failing: ${failures.slice(0, 3).join(' · ')}` : null,
      ]),
    }
  },
})
