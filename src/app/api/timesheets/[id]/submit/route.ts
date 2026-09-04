import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { mayEnter } from '@/lib/timesheet-authority'
import { prisma } from '@/lib/db'

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
      id: true, status: true, totalHours: true, personId: true,
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
  // which is somebody else's word about what they did.
  const allowed = mayEnter(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    {
      personId: timesheet.personId,
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

  await prisma.timesheet.update({
    where: { id },
    data: { status: 'SUBMITTED' },
  })

  return NextResponse.json({
    data: {
      id,
      status: 'SUBMITTED',
        // The approval window counts from here.
        submittedAt: new Date(),
      totalHours: Number(timesheet.totalHours),
      message: `Timesheet submitted (${Number(timesheet.totalHours)} hours)`,
    },
  })
}
