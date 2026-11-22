import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logBulkAccess } from '@/lib/access-log'
import { firmToday } from '@/lib/decision-items'
import { openChain, openPeriodRefusal } from '@/lib/money/money-chain'
import { LedgerRefusal } from '@/lib/record-ledger'
import { NOT_A_MONTH, emptyMonthSays, monthKeyOf, readMonth, readOpenMonthAsk } from '@/lib/money-loop'
import { loopSeat, refuseLoop, refused, stampOf } from './door'
import { placementsIn, readsRate, runningIn, RATE_WITHHELD } from './read'

/**
 * GET  /api/money-loop?month=YYYY-MM — the firm's billing placements with the month's state (B2)
 * POST /api/money-loop               — start the month for every running contract, { month, actingEntityId }
 *
 * Record 107, Flow B. Read by a seat that reads payroll; started by a seat
 * that runs it. With no month named, the month holding the firm's own today.
 * A month that has not begun on the firm's own day is never started: the
 * read says so and offers no form (`mayStart`), and the post refuses.
 */

export async function GET(request: NextRequest) {
  const { seat, error } = await loopSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'payroll.read')) return refuseLoop(seat, request, 'read')
  const asked = request.nextUrl.searchParams.get('month')
  const today = await firmToday(seat.companyId)
  const month = readMonth(asked ?? monthKeyOf(today))
  if (!month) return refused(422, NOT_A_MONTH, 'month')
  const placements = await placementsIn(seat, month)
  const notOpened = placements.filter((p) => p.running && !p.chain).length
  const notBegun = openPeriodRefusal({ periodStart: month.start, periodEnd: month.end }, today)
  logBulkAccess([...new Set(placements.filter((p) => p.personId !== seat.personId).map((p) => p.personId))], {
    actorPersonId: seat.personId, actorCompanyId: seat.companyId, action: 'PAYROLL_VIEW', reason: `Read the state of ${month.words} for the firm’s consultants.`,
  })
  return NextResponse.json({
    data: {
      month: month.key, monthWords: month.words,
      placements: placements.map(({ personId: _p, ...row }) => row),
      notOpened, mayRun: seat.mayRun, entities: seat.entities,
      // The form is drawn only where the post below would take it.
      mayStart: seat.mayRun && notOpened > 0 && !notBegun,
      rateWithheld: readsRate(seat) ? null : RATE_WITHHELD,
      emptySays: placements.some((p) => p.chain) ? null : notBegun ?? emptyMonthSays(month.words, notOpened, seat.mayRun),
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await loopSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'payroll.read')) return refuseLoop(seat, request, 'read')
  if (!hasPermission(seat.caller.permissions, 'payroll.run')) return refuseLoop(seat, request, 'run')
  const read = readOpenMonthAsk(await request.json().catch(() => ({})), seat.entities.length > 0)
  if (!read.ok) return refused(422, read.says, read.field)
  const today = await firmToday(seat.companyId)
  const notBegun = openPeriodRefusal({ periodStart: read.month.start, periodEnd: read.month.end }, today)
  if (notBegun) return refused(422, notBegun, 'month')
  const lines = await prisma.sellContract.findMany({
    where: { ...runningIn(seat.companyId, read.month), moneyChains: { none: { periodStart: read.month.start } } },
    select: { id: true },
  })
  if (lines.length === 0) return refused(422, `Every consultant on a running contract in ${read.month.words} already has the month started.`)
  let opened = 0
  for (const l of lines) {
    try {
      await openChain({ ...stampOf(seat, read.actingEntityId), sellContractId: l.id, periodStart: read.month.start, periodEnd: read.month.end }, today)
      opened += 1
    } catch (e) {
      // The first refusal is the entity stamp's or a clash; nothing after it would differ.
      if (e instanceof LedgerRefusal && opened === 0) return refused(422, e.message)
      if (!(e instanceof LedgerRefusal)) throw e
    }
  }
  return NextResponse.json({ data: { opened, message: `Started ${read.month.words} for ${opened === 1 ? '1 consultant' : `${opened} consultants`}, each at “Timesheet owed”.` } }, { status: 201 })
}
