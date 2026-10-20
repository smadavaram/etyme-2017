/**
 * Stage: contracts. Owned by money.
 *
 * For every placement — the ones the run's awards wrote, then the seeded
 * world's live ones — the contract manager reads what the award put on
 * the record: one order (the header), a sell line that bills the
 * customer, and a buy line that pays the supplier below or runs payroll
 * for the worker. A W2 line has no order: nobody raises a purchase order
 * to their own employee, so a W2 line with an order is a fault.
 *
 * And the terms. Every term a line is billed or paid on is read
 * agreement first (`termsFor` in lib/money/order-terms, over
 * `agreementFirst` in lib/billing-cascade): the agreement between the
 * two parties, then the order, then the line. A term an order or a line
 * says differently with no reason recorded is set aside, and the report
 * names it.
 *
 * Read-only, as the contract manager's own screen is. The contracts
 * route is read once per firm as its contract manager would open it, so
 * the route's timing is on the ledger.
 */
import { defineStage, type ContractFact } from '../../stage'
import { termsFor, ORDER_HEADER_SELECT, AGREEMENT_TERMS_SELECT, type OrderTerms } from '@/lib/money/order-terms'
import { placementsOf, seatWith, says } from './book'

export default defineStage({
  name: 'contracts',
  domain: 'MONEY',
  async run(ctx) {
    const { placements, unseated, live } = await placementsOf(ctx)
    if (placements.length === 0) return { closed: 0, says: 'No live placement in this world to read contracts for.' }

    const sellIds = [...new Set(placements.flatMap((p) => p.ladder.map((r) => r.sellId)))]
    const sells = await ctx.read.sellContract.findMany({
      where: { id: { in: sellIds } },
      select: {
        id: true, personId: true, companyId: true, clientCompanyId: true, workOrderId: true, state: true,
        startDate: true, endDate: true, billFrequency: true, billAnchor: true, billStraddle: true,
        paymentTerms: true, paymentTermsFrom: true, billCurrency: true, termsDifferReason: true,
        company: { select: { slug: true } }, clientCompany: { select: { slug: true } },
        workOrder: { select: ORDER_HEADER_SELECT },
        msa: { select: AGREEMENT_TERMS_SELECT },
        buyLinks: {
          select: {
            buyContract: {
              select: {
                id: true, companyId: true, vendorCompanyId: true, contractType: true, workOrderId: true, state: true,
                startDate: true, endDate: true, payFrequency: true, payAnchor: true, payStraddle: true,
                paymentTermsFrom: true, payCurrency: true, termsDifferReason: true,
                company: { select: { slug: true } }, vendorCompany: { select: { slug: true } },
                workOrder: { select: ORDER_HEADER_SELECT },
              },
            },
          },
        },
      },
    })

    let lines = 0
    let fromAgreement = 0
    let terms = 0
    let orders = 0
    let w2 = 0
    const setAside: string[] = []
    const faults: string[] = []
    const count = (t: OrderTerms) => {
      for (const v of Object.values(t.source)) {
        terms++
        if (v === 'AGREEMENT') fromAgreement++
      }
      for (const s of t.setAside) if (!setAside.includes(s)) setAside.push(s)
    }

    for (const s of sells) {
      const sellTerms = termsFor('SELL', s)
      count(sellTerms)
      lines++
      if (s.workOrderId) orders++
      const fact: ContractFact = {
        id: s.id, by: 'contracts', side: 'SELL', personId: s.personId,
        sellerSlug: s.company.slug, buyerSlug: s.clientCompany.slug, ...(s.workOrderId ? { orderId: s.workOrderId } : {}),
        extra: { state: s.state, terms: sellTerms.says, setAside: sellTerms.setAside },
      }
      if (!ctx.world.contracts.some((c) => c.id === fact.id)) ctx.world.contracts.push(fact)

      for (const { buyContract: b } of s.buyLinks) {
        lines++
        const buyTerms = termsFor('BUY', b)
        count(buyTerms)
        if (b.contractType === 'W2' && !b.vendorCompanyId) {
          w2++
          if (b.workOrderId) {
            faults.push(`A W2 pay line at ${b.company.slug} carries a purchase order (${b.workOrderId}); nobody raises an order to their own employee.`)
          }
        }
        const buy: ContractFact = {
          id: b.id, by: 'contracts', side: 'BUY', personId: s.personId,
          sellerSlug: b.vendorCompany?.slug ?? '(own employee)', buyerSlug: b.company.slug,
          ...(b.workOrderId ? { orderId: b.workOrderId } : {}),
          extra: { contractType: b.contractType, state: b.state, terms: buyTerms.says, setAside: buyTerms.setAside },
        }
        if (!ctx.world.contracts.some((c) => c.id === buy.id)) ctx.world.contracts.push(buy)
      }
    }

    // The contract manager opens the contracts list at each firm once,
    // so the route that shows them is timed under the load.
    const firms = [...new Set(sells.map((s) => s.companyId))]
    await ctx.parallel(firms, async (companyId) => {
      const seat = await seatWith(ctx, companyId, 'assignments.read')
      if (seat) await seat.get('/api/contracts?side=sell')
    })

    for (const f of faults) ctx.log(f)
    return {
      closed: sells.length,
      of: sells.length,
      says: says([
        `${placements.length} of the world's ${live} live placements read: ${sells.length} sell lines and ${lines - sells.length} buy lines, ${orders} sell lines on an order, ${w2} W2 pay lines.`,
        `${fromAgreement} of ${terms} terms came from the agreement between the two parties; the rest from the order, the line or the shipped default.`,
        setAside.length ? `${setAside.length} terms said differently with no reason were set aside: ${setAside.slice(0, 3).join(' ')}` : 'No term was said differently without a reason.',
        unseated.length ? `${unseated.length} workers on live placements hold no seat anywhere, so the server refuses their own week at every door: ${unseated.join(', ')}.` : null,
        faults.length ? `${faults.length} W2 lines carry an order, which is a fault: ${faults.slice(0, 3).join(' ')}` : 'No W2 line carries an order.',
      ]),
    }
  },
})
