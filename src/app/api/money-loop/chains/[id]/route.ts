import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { advanceChain, resolveDispute } from '@/lib/money/money-chain'
import { ownersOnOffer, DECIDER_READS_PAYROLL } from '@/lib/decision-items'
import { NO_SUCH_CHAIN, readAdvanceAsk, readResolveAsk, stateLabel } from '@/lib/money-loop'
import { loopSeat, refuseLoop, refused, refusalOf, logRefusal, stampOf } from '../../door'

/**
 * POST /api/money-loop/chains/[id] — one move on one consultant's month, by a seat that runs payroll
 *   { act: 'ADVANCE', to, amount, currency, actingEntityId, disputeOwnerPersonId }
 *   { act: 'RESOLVE', actingEntityId }
 *
 * Record 107, Flow B. ADVANCE moves the chain one state forward, with the
 * amount a person states where the move asks one; an amount that disagrees
 * with one already stated disputes the chain and opens a decision owed by
 * the person named. RESOLVE returns a disputed chain once that decision is
 * recorded. Another firm's chain is refused, logged first. Who decides a
 * disagreement is somebody whose working seat reads payroll, the picker's
 * own list (`ownersOnOffer` holding `payroll.read`): nobody else is taken.
 */

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { seat, error } = await loopSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'payroll.read')) return refuseLoop(seat, request, 'read')
  if (!hasPermission(seat.caller.permissions, 'payroll.run')) return refuseLoop(seat, request, 'run')
  const { id } = await params
  const chain = await prisma.moneyChain.findFirst({ where: { id, companyId: seat.companyId }, select: { id: true } })
  if (!chain) {
    const other = await prisma.moneyChain.findUnique({ where: { id }, select: { companyId: true } })
    await logRefusal(seat, { companyId: other?.companyId ?? seat.companyId }, `Refused a move on a consultant’s month that is not ${seat.companyName}’s (${id}).`)
    return refused(404, NO_SUCH_CHAIN)
  }
  const body = await request.json().catch(() => ({}))
  const hasEntities = seat.entities.length > 0
  try {
    if (body?.act === 'RESOLVE') {
      const read = readResolveAsk(body, hasEntities)
      if (!read.ok) return refused(422, read.says, read.field)
      const now = await resolveDispute({ ...stampOf(seat, read.actingEntityId), chainId: chain.id })
      return NextResponse.json({ data: { state: now.state, label: stateLabel(now.state), message: `The decision is recorded. This month is back at “${stateLabel(now.state)}”, and the amount is stated again on the next move.` } })
    }
    if (body?.act !== 'ADVANCE') return refused(422, 'Say what to do with this month: move it forward, or return it from its dispute.', 'act')
    const read = readAdvanceAsk(body, hasEntities)
    if (!read.ok) return refused(422, read.says, read.field)
    if (read.ask.disputeOwnerPersonId) {
      const offered = await ownersOnOffer(seat.companyId, new Date(), prisma, 'payroll.read')
      if (!offered.some((p) => p.id === read.ask.disputeOwnerPersonId)) return refused(422, DECIDER_READS_PAYROLL, 'disputeOwnerPersonId')
    }
    const now = await advanceChain({
      ...stampOf(seat, read.ask.actingEntityId), chainId: chain.id, to: read.ask.to, stated: read.ask.stated,
      // A move that states no amount can find no disagreement; the rule still wants a name.
      disputeOwnerPersonId: read.ask.disputeOwnerPersonId ?? seat.personId,
    })
    const disputed = now.state === 'DISPUTED'
    return NextResponse.json({
      data: {
        state: now.state, label: stateLabel(now.state), disputeDecisionId: disputed ? now.disputeDecisionId : null,
        message: disputed ? 'That amount disagrees with one already stated. This month is disputed, and a decision is open on the queue.' : `Recorded. This month is at “${stateLabel(now.state)}”.`,
      },
    })
  } catch (e) {
    return refusalOf(e)
  }
}
