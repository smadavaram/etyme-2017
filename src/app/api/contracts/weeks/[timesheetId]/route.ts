import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { logAccess, accessActor } from '@/lib/access-log'
import { prisma } from '@/lib/db'
import { weekBillFor, billThisWeek } from '@/lib/money/week-bill'

/**
 * GET  /api/contracts/weeks/:timesheetId — the week's bill section for this seat.
 * POST /api/contracts/weeks/:timesheetId — "Bill this week": draft its bill.
 *
 * Only the firm whose sell line the week is on reads anything here; the
 * bill is drafted by the Bills page's own generator (lib/money/week-bill).
 */
type Ctx = { params: Promise<{ timesheetId: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { timesheetId } = await params
  const view = await weekBillFor(caller, timesheetId)
  if (!view) return NextResponse.json({ data: null })
  const ts = await prisma.timesheet.findUnique({ where: { id: timesheetId }, select: { personId: true } })
  if (ts) logAccess({ subjectId: ts.personId, ...accessActor(caller), action: 'TIMESHEET_VIEW', reason: 'Read whether a week is on a bill.' })
  return NextResponse.json({ data: view })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { timesheetId } = await params
  const out = await billThisWeek(caller, timesheetId)
  if (!out.ok) return NextResponse.json(out.body, { status: out.status })
  const view = await weekBillFor(caller, timesheetId)
  return NextResponse.json({ data: { ...out.body.data, week: view } }, { status: out.status })
}
