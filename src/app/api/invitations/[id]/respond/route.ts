import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'

/**
 * POST /api/invitations/:id/respond   { action: 'accept' | 'decline', reason? }
 *
 * A vendor answers. Declining early is worth as much to a client as
 * accepting — a requirement with three silent vendors looks the same as one
 * with three working it, and the client only learns the difference when
 * nobody submits.
 *
 * Accepting is not a commitment to submit; it says the vendor is working
 * it. Both answers are recorded so the client's vendor scorecard can tell
 * responsiveness from silence later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { action, reason } = body

  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "action must be 'accept' or 'decline'", field: 'action' } },
      { status: 422 }
    )
  }

  const invitation = await prisma.requirementInvitation.findUnique({
    where: { id },
    include: {
      requirement: { select: { id: true, title: true, companyId: true, raisedById: true } },
      toCompany: { select: { id: true, name: true } },
    },
  })

  if (!invitation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invitation not found' } },
      { status: 404 }
    )
  }

  // Only the company it was addressed to may answer it.
  if (invitation.toCompanyId !== caller.company?.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This invitation was not sent to your company' } },
      { status: 403 }
    )
  }

  if (invitation.status === 'DECLINED') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: 'This invitation was already declined' } },
      { status: 409 }
    )
  }

  // An expired invitation cannot be accepted — the client has moved on and
  // a vendor sourcing against it would be wasting its own time.
  if (invitation.expiresAt < new Date() && action === 'accept') {
    return NextResponse.json(
      {
        error: {
          code: 'EXPIRED',
          message: `This invitation closed on ${invitation.expiresAt.toISOString().slice(0, 10)}`,
        },
      },
      { status: 409 }
    )
  }

  const updated = await prisma.requirementInvitation.update({
    where: { id },
    data: { status: action === 'accept' ? 'ACCEPTED' : 'DECLINED' },
  })

  await prisma.automationLog.create({
    data: {
      companyId: invitation.requirement.companyId, // logged for the CLIENT — it is their signal
      action: action === 'accept' ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
      summary: `${invitation.toCompany.name} ${action === 'accept' ? 'accepted' : 'declined'} ${invitation.requirement.title}`,
      reason: String(reason ?? '').trim() || (action === 'accept' ? 'Vendor is working the requirement' : 'No reason given'),
      payload: { invitationId: id, requirementId: invitation.requirementId, vendorId: invitation.toCompanyId },
      reversible: false,
    },
  })

  // A decline is the more useful signal — tell whoever raised it, so they
  // can widen the search before the requirement goes stale.
  if (invitation.requirement.raisedById) {
    notify({
      personId: invitation.requirement.raisedById,
      companyId: invitation.requirement.companyId,
      type: 'SYSTEM',
      title: action === 'accept'
        ? `${invitation.toCompany.name} is working ${invitation.requirement.title}`
        : `${invitation.toCompany.name} declined ${invitation.requirement.title}`,
      body: action === 'accept'
        ? 'They have accepted the requirement and will submit candidates.'
        : `They will not be submitting. ${String(reason ?? '').trim() || 'No reason given.'}`,
      entityId: invitation.requirementId,
      data: { requirementId: invitation.requirementId, invitationId: id },
    })
  }

  return NextResponse.json({
    data: {
      id,
      status: updated.status,
      message: action === 'accept'
        ? 'Accepted — you can now submit candidates against this requirement'
        : 'Declined. The client has been told, so they can look elsewhere.',
    },
  })
}
