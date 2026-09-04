import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * PATCH /api/contracts/:id/approver
 *
 * Names — or clears — the one person who may approve this contract's
 * timesheets without holding timesheets.approve company-wide. See
 * SellContract.approverPersonId and src/lib/timesheet-authority.ts.
 *
 * "As a delivery I will have team leads assigned to manage and approve
 * timesheets for the project" — this is the assigning.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const approverPersonId = body?.approverPersonId ?? null

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    select: { id: true, companyId: true, personId: true },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  // Only the employer on this contract assigns who approves it on their
  // own side. Not the client — approving what your own team lead billed
  // is a different signature from approving what happened at your site.
  if (caller.company?.id !== contract.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the company that owns this contract can name its approver' } },
      { status: 403 }
    )
  }

  if (approverPersonId != null) {
    if (approverPersonId === contract.personId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'The person the contract is for cannot approve their own hours', field: 'approverPersonId' } },
        { status: 422 }
      )
    }

    // Has to be somebody actually at this company — naming a stranger as
    // your own approver would hand a person at a different firm a way
    // into your timesheets that no permission check ever granted them.
    const member = await prisma.context.findFirst({
      where: { personId: approverPersonId, companyId: contract.companyId, revokedAt: null },
      select: { id: true, person: { select: { name: true } } },
    })
    if (!member) {
      return NextResponse.json(
        { error: { code: 'NOT_A_MEMBER', message: 'That person is not on this company' } },
        { status: 422 }
      )
    }

    const updated = await prisma.sellContract.update({
      where: { id },
      data: { approverPersonId },
      select: { approver: { select: { id: true, name: true } } },
    })

    await prisma.automationLog.create({
      data: {
        companyId: contract.companyId,
        action: 'CONTRACT_APPROVER_ASSIGNED',
        summary: `${member.person.name} named to approve timesheets on this contract`,
        reason: `Assigned by ${caller.person.name}`,
        payload: { sellContractId: id, approverPersonId },
        reversible: true,
      },
    })

    return NextResponse.json({
      data: { approver: updated.approver, message: `${member.person.name} can now approve this contract's timesheets.` },
    })
  }

  // Clearing — back to whoever at the company holds timesheets.approve.
  await prisma.sellContract.update({ where: { id }, data: { approverPersonId: null } })
  await prisma.automationLog.create({
    data: {
      companyId: contract.companyId,
      action: 'CONTRACT_APPROVER_CLEARED',
      summary: 'No team lead named — back to company-wide approval',
      reason: `Cleared by ${caller.person.name}`,
      payload: { sellContractId: id },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: { approver: null, message: 'Cleared. Anyone with approval rights at your company can approve this contract again.' },
  })
}
