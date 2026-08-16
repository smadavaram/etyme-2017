import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'

/**
 * POST /api/timesheets/:id/approve
 *
 * BUILD.md: "writes the ledger, increments payable"
 *
 * Approver approves a submitted timesheet.
 * Timesheets are on the sell side — billRate comes from the SellContract.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true, name: true },
  })

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      sellContract: {
        select: { id: true, billRate: true, billCurrency: true, companyId: true },
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
  const billAmount = hours * timesheet.sellContract.billRate / 100 // billRate is in cents

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
        companyId: timesheet.sellContract.companyId,
        action: 'TIMESHEET_APPROVED',
        summary: `Timesheet approved: ${hours}h × $${(timesheet.sellContract.billRate / 100).toFixed(2)}/hr = $${billAmount.toFixed(2)} billable`,
        reason: `Approved by ${person?.name ?? email}`,
        payload: {
          timesheetId: id,
          hours,
          billRate: timesheet.sellContract.billRate,
          billAmount,
        },
        reversible: true,
      },
    }),
  ])

  // Notify the timesheet owner that their timesheet was approved
  notify({
    personId: timesheet.personId,
    companyId: timesheet.sellContract.companyId,
    type: 'TIMESHEET',
    title: 'Timesheet approved',
    body: `Your timesheet for ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)} (${hours}h, $${billAmount.toFixed(2)}) was approved`,
    entityId: id,
    data: { hours, billAmount, approvedBy: person?.name ?? email },
  })

  return NextResponse.json({
    data: {
      id,
      status: 'APPROVED',
      totalHours: hours,
      billAmount,
      approvedBy: person?.name ?? email,
      message: `Approved ${hours}h — $${billAmount.toFixed(2)} billable`,
    },
  })
}
