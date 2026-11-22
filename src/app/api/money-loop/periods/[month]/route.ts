import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logBulkAccess } from '@/lib/access-log'
import { firmToday } from '@/lib/decision-items'
import { loadClosedChain, summarize } from '@/lib/money/money-chain'
import { COUNTED_STATES, NOT_A_MONTH, NO_SUCH_PLACEMENT, historySays, nextMove, readLoadAsk, readMonth, stateLabel } from '@/lib/money-loop'
import { formatDay } from '@/lib/format-date'
import { loopSeat, refuseLoop, refused, refusalOf, logRefusal, stampOf } from '../../door'
import { placementsIn, loadableIn } from '../../read'

/**
 * GET  /api/money-loop/periods/[month] — every chain of the month, the count per state, the
 *                                        total stated on timesheets per currency, and open disputes (B4, B5, B6)
 * POST /api/money-loop/periods/[month] — load one consultant's past month as closed (B4's form)
 *
 * Record 107, Flow B. The total is the sum of what people stated on
 * timesheets, one line per currency, never added across two. A month
 * loaded as history says so, with its source and the day it was true.
 */

type Params = { params: Promise<{ month: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { seat, error } = await loopSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'payroll.read')) return refuseLoop(seat, request, 'read')
  const month = readMonth((await params).month)
  if (!month) return refused(422, NOT_A_MONTH, 'month')
  const placements = await placementsIn(seat, month)
  const withChain = placements.filter((p) => p.chain)
  const decisions = await prisma.decisionItem.findMany({
    where: { companyId: seat.companyId, id: { in: withChain.map((p) => p.chain!.disputeDecisionId).filter((x): x is string => !!x) } },
    select: { id: true, state: true, question: true, ownerPerson: { select: { name: true } } },
  })
  const summary = summarize(withChain.map((p) => ({
    state: p.chain!.state as any, timesheetAmountCents: p.chain!.amounts.timesheet?.cents ?? null, timesheetCurrency: p.chain!.amounts.timesheet?.currency ?? null,
  })))
  logBulkAccess([...new Set(withChain.filter((p) => p.personId !== seat.personId).map((p) => p.personId))], {
    actorPersonId: seat.personId, actorCompanyId: seat.companyId, action: 'PAYROLL_VIEW', reason: `Read ${month.words} for the firm’s consultants, with the stated amounts.`,
  })
  return NextResponse.json({
    data: {
      month: month.key, monthWords: month.words,
      chains: withChain.map((p) => {
        const c = p.chain!
        const decision = decisions.find((d) => d.id === c.disputeDecisionId) ?? null
        return {
          chainId: c.id, sellContractId: p.sellContractId, consultant: p.consultant, client: p.client,
          state: c.state, label: c.label, amounts: c.amounts,
          history: c.source && c.asOf ? historySays(c.source, formatDay(c.asOf)) : null,
          next: seat.mayRun && !c.source ? nextMove(c.state)?.button ?? null : null,
          dispute: decision ? { decisionId: decision.id, open: decision.state === 'OPEN', ownerName: decision.ownerPerson.name, question: decision.question } : null,
        }
      }),
      summary: {
        counts: COUNTED_STATES.map((s) => ({ state: s, label: stateLabel(s), count: summary.counts[s] })),
        statedTotals: summary.statedTotals.map((t) => ({ currency: t.currency, cents: t.cents })),
        notStated: summary.notStated,
      },
      loadable: seat.mayRun ? await loadableIn(seat, month) : [],
      today: (await firmToday(seat.companyId)).toISOString().slice(0, 10),
      mayRun: seat.mayRun, entities: seat.entities,
    },
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const { seat, error } = await loopSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'payroll.read')) return refuseLoop(seat, request, 'read')
  if (!hasPermission(seat.caller.permissions, 'payroll.run')) return refuseLoop(seat, request, 'run')
  const month = readMonth((await params).month)
  if (!month) return refused(422, NOT_A_MONTH, 'month')
  const read = readLoadAsk(await request.json().catch(() => ({})), seat.entities.length > 0)
  if (!read.ok) return refused(422, read.says, read.field)
  const line = await prisma.sellContract.findFirst({ where: { id: read.ask.sellContractId, companyId: seat.companyId }, select: { id: true, person: { select: { name: true } } } })
  if (!line) {
    const other = await prisma.sellContract.findUnique({ where: { id: read.ask.sellContractId }, select: { companyId: true } })
    await logRefusal(seat, { companyId: other?.companyId ?? seat.companyId }, `Refused loading history onto a contract that is not ${seat.companyName}’s (${read.ask.sellContractId}).`)
    return refused(404, NO_SUCH_PLACEMENT, 'sellContractId')
  }
  try {
    const chain = await loadClosedChain({
      ...stampOf(seat, read.ask.actingEntityId), sellContractId: line.id, periodStart: month.start, periodEnd: month.end,
      source: read.ask.source, asOf: read.ask.asOf, amounts: read.ask.amounts,
    }, await firmToday(seat.companyId))
    return NextResponse.json({ data: { chainId: chain.id, message: `Loaded ${month.words} for ${line.person.name} as closed. Its ledger says it was loaded as history.` } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
