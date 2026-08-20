import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
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
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const person = { id: caller.person.id, name: caller.person.name }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      sellContract: {
        select: {
          id: true, billRate: true, billCurrency: true, companyId: true,
          clientCompanyId: true, endClientCompanyId: true,
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

  // An approved timesheet is the goods receipt: the invoice, the
  // three-way match, the payment and the margin all rest on it. This
  // required nothing but a session, so any account on the platform could
  // approve any timesheet at any company.
  const parties = {
    personId: timesheet.personId,
    vendorCompanyId: timesheet.sellContract.companyId,
    clientCompanyId: timesheet.sellContract.clientCompanyId,
    endClientCompanyId: timesheet.sellContract.endClientCompanyId,
  }

  if (approvingOwnHours({ personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions }, parties)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Nobody approves their own hours.' } },
      { status: 403 }
    )
  }

  const allowed = mayApprove(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    parties
  )
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: allowed.reason } },
      { status: 403 }
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
        approvedById: person.id,
        approvedAt: new Date(),
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: timesheet.sellContract.companyId,
        action: 'TIMESHEET_APPROVED',
        summary: `Timesheet approved: ${hours}h × $${(timesheet.sellContract.billRate / 100).toFixed(2)}/hr = $${billAmount.toFixed(2)} billable`,
        reason: `Approved by ${person.name} — ${allowed.reason}`,
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

  // The goods receipt. Everything downstream — the match, the invoice,
  // the payment — dates from this moment, so it is the event an ERP
  // integration cares about most.
  void emit({
    type: 'timesheet.approved',
    companyId: timesheet.sellContract.companyId,
    subjectType: 'Timesheet',
    subjectId: id,
    actorPersonId: person?.id ?? null,
    payload: {
      personId: timesheet.personId,
      sellContractId: timesheet.sellContractId,
      hours,
      billRateCents: timesheet.sellContract.billRate,
      billAmount,
    },
  })

  // Notify the timesheet owner that their timesheet was approved
  notify({
    personId: timesheet.personId,
    companyId: timesheet.sellContract.companyId,
    type: 'TIMESHEET',
    title: 'Timesheet approved',
    // Hours, not the amount billed. What the client is charged is the
    // vendor's number, and Addendum D makes disclosing it a per-requirement
    // decision the vendor takes — not something a notification does for
    // them.
    body: `Your timesheet for ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)} (${hours}h) was approved`,
    entityId: id,
    data: { hours, approvedBy: person.name },
  })

  return NextResponse.json({
    data: {
      id,
      status: 'APPROVED',
      totalHours: hours,
      billAmount,
      approvedBy: person.name,
      message: `Approved ${hours}h — $${billAmount.toFixed(2)} billable`,
    },
  })
}
