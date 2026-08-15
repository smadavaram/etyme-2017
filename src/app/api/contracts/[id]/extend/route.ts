import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/contracts/:id/extend
 *
 * Extends a sell contract's end date by 3 months (default) or a specified number of months.
 * Body: { months?: number } — defaults to 3
 *
 * Only IN_PROGRESS or PAUSED contracts can be extended.
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
  const body = await request.json().catch(() => ({}))
  const months = body.months ?? 3

  if (typeof months !== 'number' || months < 1 || months > 24) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'months must be between 1 and 24' } },
      { status: 422 }
    )
  }

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      company: { select: { id: true, name: true } },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  if (!['IN_PROGRESS', 'PAUSED'].includes(contract.state)) {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Cannot extend a ${contract.state} contract` } },
      { status: 409 }
    )
  }

  const oldEnd = contract.endDate
  const baseDate = oldEnd ?? new Date()
  const newEnd = new Date(baseDate)
  newEnd.setMonth(newEnd.getMonth() + months)

  await prisma.$transaction([
    prisma.sellContract.update({
      where: { id },
      data: { endDate: newEnd },
    }),
    prisma.automationLog.create({
      data: {
        companyId: contract.clientCompany.id,
        action: 'CONTRACT_EXTENDED',
        summary: `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} extended by ${months} month${months !== 1 ? 's' : ''} to ${newEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        reason: 'Extended via Program dashboard',
        payload: {
          contractId: id,
          personId: contract.person.id,
          vendorId: contract.company.id,
          clientId: contract.clientCompany.id,
          oldEndDate: oldEnd?.toISOString() ?? null,
          newEndDate: newEnd.toISOString(),
          months,
        },
        reversible: true,
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id,
      personName: contract.person.name,
      newEndDate: newEnd.toISOString(),
      message: `Contract extended by ${months} month${months !== 1 ? 's' : ''}`,
    },
  })
}
