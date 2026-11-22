import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logAccess } from '@/lib/access-log'
import { recordTimeline } from '@/lib/record-ledger'
import { firmToday, ownersOnOffer } from '@/lib/decision-items'
import { CHAIN_RECORD } from '@/lib/money/money-chain'
import { NOT_A_MONTH, NO_SUCH_PLACEMENT, monthKeyOf, nextMove, readMonth } from '@/lib/money-loop'
import { loopSeat, refuseLoop, refused, logRefusal } from '../../door'
import { LINE_SELECT, RATE_WITHHELD, chainRow, placementRow, readsRate } from '../../read'

/**
 * GET /api/money-loop/placements/[id]?month=YYYY-MM — one placement and its month (B3)
 *
 * Record 107, Flow B. The consultant, the client, the agreed rate and its
 * start, the rate history where one is on record, the month's chain with
 * its ledger, and what the next move asks. Another firm's contract is
 * refused, logged first.
 */

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { seat, error } = await loopSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'payroll.read')) return refuseLoop(seat, request, 'read')
  const { id } = await params
  const line = await prisma.sellContract.findFirst({ where: { id, companyId: seat.companyId }, select: LINE_SELECT })
  if (!line) {
    const other = await prisma.sellContract.findUnique({ where: { id }, select: { companyId: true } })
    await logRefusal(seat, { companyId: other?.companyId ?? seat.companyId }, `Refused a contract that is not ${seat.companyName}’s on the money loop (${id}).`)
    return refused(404, NO_SUCH_PLACEMENT)
  }
  const month = readMonth(request.nextUrl.searchParams.get('month') ?? monthKeyOf(await firmToday(seat.companyId)))
  if (!month) return refused(422, NOT_A_MONTH, 'month')
  const chains = await prisma.moneyChain.findMany({
    where: { companyId: seat.companyId, sellContractId: line.id },
    include: { disputeDecision: { select: { id: true, state: true, ownerPerson: { select: { name: true } } } } },
    orderBy: { periodStart: 'desc' },
  })
  const chain = chains.find((c) => c.periodStart.getTime() === month.start.getTime()) ?? null
  const [ledger, history, people] = await Promise.all([
    chain ? recordTimeline(seat.companyId, CHAIN_RECORD, chain.id) : [],
    // Only what is on record: an approved change to this line's rate. Nothing is made up where none exists.
    readsRate(seat)
      ? prisma.rateHistory.findMany({ where: { contractType: 'SELL', contractId: line.id, approvalState: 'APPROVED' }, select: { id: true, rate: true, fromDate: true, toDate: true, reason: true }, orderBy: { fromDate: 'asc' } })
      : [],
    seat.mayRun ? ownersOnOffer(seat.companyId) : [],
  ])
  if (line.personId !== seat.personId) {
    logAccess({ subjectId: line.personId, actorPersonId: seat.personId, actorCompanyId: seat.companyId, action: 'PAYROLL_VIEW', reason: `Read ${month.words} on the consultant’s contract, with its stated amounts.` })
  }
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return NextResponse.json({
    data: {
      month: month.key, monthWords: month.words,
      placement: placementRow(seat, line),
      rateWithheld: readsRate(seat) ? null : RATE_WITHHELD,
      rateHistory: history.map((h) => ({ id: h.id, cents: h.rate, currency: line.billCurrency, from: day(h.fromDate), to: day(h.toDate), reason: h.reason })),
      contractHref: `/dashboard/placements/${line.id}`,
      chain: chain ? {
        ...chainRow(chain),
        stateBeforeDispute: chain.stateBeforeDispute,
        next: seat.mayRun ? nextMove(chain.state) : null,
        dispute: chain.state === 'DISPUTED' && chain.disputeDecision
          ? { decisionId: chain.disputeDecision.id, open: chain.disputeDecision.state === 'OPEN', ownerName: chain.disputeDecision.ownerPerson.name }
          : null,
      } : null,
      ledger: ledger.map((r) => ({ id: r.id, at: r.createdAt, summary: r.summary, entityName: r.actingEntity?.name ?? null, by: r.person.name, heldAs: r.heldAs })),
      months: chains.map((c) => ({ month: monthKeyOf(c.periodStart), label: chainRow(c).label })),
      mayRun: seat.mayRun, people, entities: seat.entities,
    },
  })
}
