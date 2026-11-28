import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logBulkAccess } from '@/lib/access-log'
import { firmToday, firmZone, todayIn } from '@/lib/decision-items'
import { CHAIN_RECORD, asOfRefusal, loadClosedChain, loadPeriodRefusal, summarize } from '@/lib/money/money-chain'
import { COUNTED_STATES, NOT_A_MONTH, NO_SUCH_PLACEMENT, decidedSays, historySays, nextMove, readLoadAsk, readMonth, stateLabel } from '@/lib/money-loop'
import { formatDay } from '@/lib/format-date'
import { loopSeat, refuseLoop, refused, refusalOf, logRefusal, stampOf } from '../../door'
import { placementsIn, loadableIn } from '../../read'

/**
 * GET  /api/money-loop/periods/[month] — every chain of the month, the count per state, the
 *                                        total stated on timesheets per currency, and open disputes (B4, B5, B6)
 * POST /api/money-loop/periods/[month] — load one consultant's past month as closed (B4's form)
 *
 * Record 107, Flow B. The total is the sum of what people stated on
 * timesheets, one line per currency, never added across two, with how
 * much of it is on disputed months. A month loaded as history says so,
 * with its source and the day it was true. Only a month that has fully
 * ended on the firm's own day is loaded as closed, as true on a day from
 * its last day to today: the read offers the form only then (`load`), and
 * the post refuses anything else. A month returned from a dispute keeps
 * the link to its recorded decision.
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
  // Every decision a dispute of this month's ever opened and somebody recorded: the month's own link is cleared when it returns.
  const zone = await firmZone(seat.companyId)
  const today = todayIn(zone)
  const recorded = await prisma.decisionItem.findMany({
    where: { companyId: seat.companyId, state: { not: 'OPEN' }, proofLinks: { array_contains: [{ recordType: CHAIN_RECORD }] } },
    select: { id: true, state: true, decidedAt: true, proofLinks: true, decidedBy: { select: { name: true } } },
    orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
  })
  const decidedFor = (chainId: string) => recorded.find((d) => (d.proofLinks as { recordId?: string }[]).some((l) => l.recordId === chainId)) ?? null
  const notEnded = loadPeriodRefusal({ periodStart: month.start, periodEnd: month.end }, today)
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
        const decided = decidedFor(c.id)
        return {
          chainId: c.id, sellContractId: p.sellContractId, consultant: p.consultant, client: p.client,
          state: c.state, label: c.label, amounts: c.amounts,
          history: c.source && c.asOf ? historySays(c.source, formatDay(c.asOf)) : null,
          next: seat.mayRun && !c.source ? nextMove(c.state)?.button ?? null : null,
          dispute: decision ? { decisionId: decision.id, open: decision.state === 'OPEN', ownerName: decision.ownerPerson.name, question: decision.question } : null,
          decided: decided ? { decisionId: decided.id, says: decidedSays(decided.decidedBy?.name ?? null, decided.decidedAt ? formatDay(todayIn(zone, decided.decidedAt)) : null, decided.state) } : null,
        }
      }),
      summary: {
        counts: COUNTED_STATES.map((s) => ({ state: s, label: stateLabel(s), count: summary.counts[s] })),
        statedTotals: summary.statedTotals.map((t) => ({ currency: t.currency, cents: t.cents })),
        disputedTotals: summary.disputedTotals,
        notStated: summary.notStated,
      },
      // The form is drawn only where the post below would take it: the month has fully ended.
      load: { offered: seat.mayRun && !notEnded, says: seat.mayRun ? notEnded : null, earliest: month.end.toISOString().slice(0, 10), latest: today.toISOString().slice(0, 10) },
      loadable: seat.mayRun && !notEnded ? await loadableIn(seat, month) : [],
      today: today.toISOString().slice(0, 10),
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
  const today = await firmToday(seat.companyId)
  const period = { periodStart: month.start, periodEnd: month.end }
  // Before any field is read: a month that has not ended is never saved as paid and closed.
  const notEnded = loadPeriodRefusal(period, today)
  if (notEnded) return refused(422, notEnded, 'month')
  const read = readLoadAsk(await request.json().catch(() => ({})), seat.entities.length > 1)
  if (!read.ok) return refused(422, read.says, read.field)
  const badDay = asOfRefusal(read.ask.asOf, period, today)
  if (badDay) return refused(422, badDay, 'asOf')
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
    }, today)
    return NextResponse.json({ data: { chainId: chain.id, message: `Loaded ${month.words} for ${line.person.name} as closed. Its ledger says it was loaded as history.` } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
