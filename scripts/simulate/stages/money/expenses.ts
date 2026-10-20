/**
 * Stage: expenses. Owned by money.
 *
 * A worker spends money on the client's work — a flight to the site, a
 * hotel, meals on the road — and is paid it back. An expense is accepted
 * like a week (the founder, 2026-10-19): the worker's employer approves
 * it for reimbursement (`POST /api/expenses/actions`), then each firm
 * above accepts it before it pays it, the client first and then down the
 * chain (`POST /api/expenses/:id/accept`), nobody accepting their own.
 * Whether a kind is billable is the agreement's between each pair; the
 * kind is chosen from what the agreement lists, where it lists any.
 *
 * Today the worker has no door of their own to file an expense: the
 * route raises it from the employer's book, so somebody at the employer raises
 * it from the receipt the worker sent. The run says so, once, by letting
 * the worker try.
 *
 * And the rule held on purpose: a firm in the middle may not accept an
 * expense before the client above it has.
 */
import { defineStage, type ExpenseFact } from '../../stage'
import { placementsOf, seatWith, workerSeat, sundayOf, addDays, todayIso, centsOf, dollars, says } from './book'

interface Spend { category: string; description: string; items: { description: string; quantity: number; unitPrice: number; expenseType: string }[] }

const SPENDS: Spend[] = [
  { category: 'TRAVEL', description: 'Flight to the client site for the release', items: [{ description: 'Return flight', quantity: 1, unitPrice: 412.6, expenseType: 'AIRFARE' }] },
  { category: 'MEALS', description: 'Meals during the release week on site', items: [{ description: 'Per diem meals', quantity: 4, unitPrice: 42.5, expenseType: 'MEALS' }] },
  { category: 'TRAVEL', description: 'Hotel near the client site', items: [{ description: 'Hotel, two nights', quantity: 2, unitPrice: 189, expenseType: 'LODGING' }] },
]

export default defineStage({
  name: 'expenses',
  domain: 'MONEY',
  async run(ctx) {
    const { placements } = await placementsOf(ctx)
    // One expense on every third placement with a worker who can be reached.
    const chosen = placements.filter((p, i) => i % 3 === 0 && workerSeat(ctx, p))
    if (chosen.length === 0) return { closed: 0, says: 'No placement to raise an expense on.' }

    // What each agreement says is billable, as the employer reads its own paper.
    const msas = await ctx.read.sellContract.findMany({
      where: { id: { in: chosen.map((p) => p.id) } },
      select: { id: true, msa: { select: { billableExpenseKinds: true, billableExpenseKindsSaid: true } } },
    })

    const lastWeek = addDays(sundayOf(todayIso()), -7)
    const lastMonthWeek = sundayOf(addDays(`${todayIso().slice(0, 8)}01`, -14))
    // The worker tries their own door first; there is none today.
    const w0 = workerSeat(ctx, chosen[0])!
    const tried = await w0.post('/api/expenses', {
      sellContractId: chosen[0].id, personId: chosen[0].personId, category: 'TRAVEL', billable: true,
      description: 'Flight to the client site', periodStart: lastWeek, periodEnd: addDays(lastWeek, 6),
      items: [{ description: 'Return flight', quantity: 1, unitPrice: 412.6, expenseType: 'AIRFARE' }],
    })
    const workerDoor = tried.ok ? 'The worker raised it from their own seat.' : `The worker could not raise it from their own seat: "${tried.sentence ?? tried.status}"`

    let approved = 0
    let accepted = 0
    let fully = 0
    let cents = 0
    let expectedOnce = false
    const noRaiser: string[] = []
    await ctx.parallel(chosen, async (p, i) => {
      const spend = SPENDS[i % SPENDS.length]
      const agreed = msas.find((m) => m.id === p.id)?.msa
      const category = agreed?.billableExpenseKindsSaid && agreed.billableExpenseKinds.length ? agreed.billableExpenseKinds[0] : spend.category
      const raiser = await seatWith(ctx, p.bottom.sellerId, 'invoices.read', [p.personId])
      if (!raiser) {
        noRaiser.push(`${p.bottom.sellerName} (for ${p.personName})`)
        return
      }
      // Spent in a week the run worked, so it rides that week's bill; where
      // the run filed nothing, in a week of last month, whose bill is due now.
      const week = ctx.world.weeks.filter((w) => w.contractId === p.id).sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0]
      // Never before the placement started.
      const from = week?.weekStart ?? (lastMonthWeek >= p.bottom.startDate ? lastMonthWeek : sundayOf(addDays(p.bottom.startDate, 6)))
      const made = await raiser.post('/api/expenses', {
        sellContractId: p.id, personId: p.personId, category, billable: true, description: spend.description,
        periodStart: from, periodEnd: addDays(from, 6), items: spend.items,
      })
      const e = made.json?.data?.expense
      if (!made.ok || !e?.id) return
      const fact: ExpenseFact = {
        id: e.id, by: raiser.key, contractId: p.id, personId: p.personId, amountCents: centsOf(e.total), status: 'DRAFT',
        extra: { periodEnd: addDays(from, 6), category },
      }
      ctx.world.expenses.push(fact)
      if (!(await raiser.post('/api/expenses/actions', { action: 'submit', expenseIds: [e.id] })).ok) return
      fact.status = 'SUBMITTED'
      // Somebody else at the employer approves it where somebody else can.
      const approver = (await seatWith(ctx, p.bottom.sellerId, 'invoices.read', [p.personId, raiser.spec.personId])) ?? raiser
      if (!(await approver.post('/api/expenses/actions', { action: 'approve', expenseIds: [e.id] })).ok) return
      fact.status = 'APPROVED'
      approved++
      cents += fact.amountCents

      // The firms above, top down: the end client, then each firm in the middle.
      const payers = [p.clientId, ...p.ladder.slice(0, -1).map((r) => r.sellerId)]
      if (payers.length > 1 && !expectedOnce) {
        expectedOnce = true
        const middle = await seatWith(ctx, payers[1], 'timesheets.approve', [p.personId])
        if (middle) {
          await ctx.expectRefusal(middle, (a) => a.post(`/api/expenses/${e.id}/accept`, { decision: 'accept' }), 'first, then')
        }
      }
      for (const companyId of payers) {
        const seat = (await seatWith(ctx, companyId, 'payments.record', [p.personId])) ?? (await seatWith(ctx, companyId, 'timesheets.approve', [p.personId]))
        if (!seat) return
        const res = await seat.post(`/api/expenses/${e.id}/accept`, { decision: 'accept' })
        if (!res.ok) return
        accepted++
      }
      fact.status = 'ACCEPTED'
      fully++
    })

    return {
      closed: fully,
      of: chosen.length,
      says: says([
        `${approved} of ${chosen.length} expenses approved by the worker's employer, ${dollars(cents)} in all (USD);`,
        `${fully} accepted by every firm above, the client first, ${accepted} acceptances in all.`,
        workerDoor,
        noRaiser.length ? `Nobody but the worker could raise it at ${noRaiser.join(', ')}, so nothing was raised there.` : null,
      ]),
    }
  },
})
