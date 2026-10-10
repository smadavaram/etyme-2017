import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { mayEnter } from '@/lib/timesheet-authority'
import { prisma } from '@/lib/db'
import { completeCycle } from '@/lib/cycle-complete'

/**
 * POST /api/timesheets/:id/submit
 *
 * Consultant submits their timesheet for approval.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    select: {
      id: true, status: true, totalHours: true, personId: true, sellContractId: true, periodEnd: true,
      person: { select: { name: true } },
      sellContract: {
        select: { companyId: true, clientCompanyId: true, endClientCompanyId: true },
      },
    },
  })

  if (!timesheet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Timesheet not found' } },
      { status: 404 }
    )
  }

  // Whose hours these are. Anybody signed in could submit anybody's week,
  // which is somebody else's word about what they did. The worker's, and
  // since 2026-09-28 the worker's alone — the employer no longer sends a
  // week on their behalf (`lib/timesheet-authority`).
  const allowed = mayEnter(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    {
      personId: timesheet.personId,
      personName: timesheet.person.name,
      vendorCompanyId: timesheet.sellContract.companyId,
      clientCompanyId: timesheet.sellContract.clientCompanyId,
      endClientCompanyId: timesheet.sellContract.endClientCompanyId,
    }
  )
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: allowed.reason } },
      { status: 403 }
    )
  }

  if (timesheet.status !== 'OPEN') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Timesheet is ${timesheet.status}, can only submit from OPEN` } },
      { status: 409 }
    )
  }

  // When it was sent, on the row. The approval window counts from here
  // (`lib/auto-approval`) and the worker's own page says the day. Until
  // 2026-09-29 this step answered with a time and wrote none, so every
  // week filed through the product had no sent date: the worker read
  // "Sent to Northbend Athletic." with no day, and the nightly job, which
  // starts the clock at the run for a sheet it cannot date, never let a
  // window run out on one.
  //
  // A week sent back and sent again is sent now. The client is reading it
  // afresh, so its window starts again; the filing door has already
  // cleared the old time if the hours were corrected (`../../filing`).
  const sentAt = new Date()
  await prisma.timesheet.update({
    where: { id },
    data: { status: 'SUBMITTED', submittedAt: sentAt },
  })

  // The "hours due" cycle for this week is done. Without this the
  // placement timeline said hours were overdue on a week that had been
  // submitted, signed, invoiced and paid.
  await completeCycle(prisma, {
    sellContractId: timesheet.sellContractId,
    kind: 'TIMESHEET_SUBMIT',
    periodEnd: timesheet.periodEnd,
  })

  return NextResponse.json({
    data: {
      id,
      status: 'SUBMITTED',
      // The same moment the row carries, never a second clock read.
      submittedAt: sentAt.toISOString(),
      totalHours: Number(timesheet.totalHours),
      message: `Timesheet submitted (${Number(timesheet.totalHours)} hours)`,
    },
  })
}
