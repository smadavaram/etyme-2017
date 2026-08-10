import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
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
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    select: { id: true, status: true, totalHours: true },
  })

  if (!timesheet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Timesheet not found' } },
      { status: 404 }
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
      totalHours: Number(timesheet.totalHours),
      message: `Timesheet submitted (${Number(timesheet.totalHours)} hours)`,
    },
  })
}
