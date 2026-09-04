import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { mayApprove } from '@/lib/timesheet-authority'
import { prisma } from '@/lib/db'

/**
 * POST /api/timesheets/:id/reject
 *
 * Rejects a submitted timesheet, sending it back for correction.
 * Only SUBMITTED → OPEN is valid.
 *
 * Body: { reason: string }
 *
 * CLAUDE.md invariant:
 *   - Writes AutomationLog with plain-English reason and honest reversible flag.
 *   - Creates a Notification for the timesheet owner.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { reason } = body

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'reason is required', field: 'reason' } },
      { status: 422 }
    )
  }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      sellContract: {
        select: {
          id: true, companyId: true, billRate: true, billCurrency: true,
          clientCompanyId: true, endClientCompanyId: true, approverPersonId: true,
        },
      },
    },
  })

  if (!timesheet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Timesheet not found' } },
      { status: 404 }
    )
  }

  // Same authority as approving. Sending somebody's week back is a
  // decision about their pay, and it was open to anybody signed in.
  const allowed = mayApprove(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    {
      personId: timesheet.personId,
      vendorCompanyId: timesheet.sellContract.companyId,
      clientCompanyId: timesheet.sellContract.clientCompanyId,
      endClientCompanyId: timesheet.sellContract.endClientCompanyId,
      approverPersonId: timesheet.sellContract.approverPersonId,
    }
  )
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: allowed.reason } },
      { status: 403 }
    )
  }

  if (timesheet.status !== 'SUBMITTED') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Timesheet is ${timesheet.status}, can only reject from SUBMITTED` } },
      { status: 409 }
    )
  }

  const hours = Number(timesheet.totalHours)

  await prisma.$transaction([
    // Set timesheet back to OPEN for correction
    prisma.timesheet.update({
      where: { id },
      data: {
        status: 'OPEN',
        approvedById: null,
        approvedAt: null,
      },
    }),
    // AutomationLog — CLAUDE.md invariant
    prisma.automationLog.create({
      data: {
        companyId: timesheet.sellContract.companyId,
        action: 'TIMESHEET_REJECTED',
        summary: `Timesheet rejected (${hours}h, ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)}): ${reason}`,
        reason: `Rejected by ${caller.person.name}: ${reason}`,
        payload: {
          timesheetId: id,
          personId: timesheet.personId,
          sellContractId: timesheet.sellContractId,
          hours,
          rejectionReason: reason,
        },
        reversible: true,
      },
    }),
    // Notification for the timesheet owner
    prisma.notification.create({
      data: {
        personId: timesheet.personId,
        companyId: timesheet.sellContract.companyId,
        type: 'TIMESHEET',
        title: 'Timesheet returned for correction',
        body: `Your timesheet for ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)} (${hours}h) was returned: ${reason}`,
        entityId: id,
        channel: 'IN_APP',
        status: 'UNREAD',
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id,
      status: 'OPEN',
      totalHours: hours,
      reason,
      rejectedBy: caller.person.name,
      message: `Timesheet returned for correction: ${reason}`,
    },
  })
}
