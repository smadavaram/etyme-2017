import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/timesheets/:id/approve
 *
 * BUILD.md: "writes the ledger, increments payable"
 *
 * Approver approves a submitted timesheet.
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

  const person = await prisma.person.findUnique({
    where: { primaryEmail: session.user.email },
    select: { id: true, name: true },
  })

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      assignment: {
        select: { id: true, payRate: true, billRate: true, employerCompanyId: true },
      },
    },
  })

  if (!timesheet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Timesheet not found' } },
      { status: 404 }
    )
  }

  if (timesheet.status !== 'SUBMITTED') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Timesheet is ${timesheet.status}, can only approve from SUBMITTED` } },
      { status: 409 }
    )
  }

  const hours = Number(timesheet.totalHours)
  const payAmount = hours * timesheet.assignment.payRate
  const billAmount = timesheet.assignment.billRate ? hours * timesheet.assignment.billRate : null

  await prisma.$transaction([
    prisma.timesheet.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: person?.id ?? null,
        approvedAt: new Date(),
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: timesheet.assignment.employerCompanyId,
        action: 'TIMESHEET_APPROVED',
        summary: `Timesheet approved: ${hours}h × $${timesheet.assignment.payRate}/hr = $${payAmount.toFixed(2)} payable`,
        reason: `Approved by ${person?.name ?? session.user.email}`,
        payload: {
          timesheetId: id,
          hours,
          payRate: timesheet.assignment.payRate,
          payAmount,
          billRate: timesheet.assignment.billRate,
          billAmount,
        },
        reversible: true,
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id,
      status: 'APPROVED',
      totalHours: hours,
      payAmount,
      billAmount,
      approvedBy: person?.name ?? session.user.email,
      message: `Approved ${hours}h — $${payAmount.toFixed(2)} payable${billAmount ? `, $${billAmount.toFixed(2)} billable` : ''}`,
    },
  })
}
