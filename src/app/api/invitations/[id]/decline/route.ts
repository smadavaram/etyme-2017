import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { notifyBulk } from '@/lib/notify'

/**
 * POST /api/invitations/:id/decline   { reason? }
 *
 * "No, thank you." An invitation could be answered with a candidate or
 * left to expire, and nothing else — so a supplier with nobody for the
 * role went quiet, the client's page counted them as silent for three
 * weeks, and the program office chased a firm that had already decided.
 * DECLINED has been a documented status of the invitation since the
 * table existed; this is the first thing that writes it.
 *
 * The client's owner and raiser are told, with the reason if one was
 * given. A supplier that has already put somebody forward cannot
 * decline: that answer was given.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Declining a role')
  if (notStaff) return notStaff

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null

  const invitation = await prisma.requirementInvitation.findFirst({
    where: { id, toCompanyId: caller.company!.id },
    select: {
      id: true, status: true,
      toCompany: { select: { name: true } },
      requirement: { select: { id: true, title: true, companyId: true, ownerId: true, raisedById: true } },
    },
  })
  if (!invitation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That invitation is not yours, or is not here.' } },
      { status: 404 }
    )
  }

  if (invitation.status === 'ACCEPTED') {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_ANSWERED',
          message: `${invitation.toCompany.name} has already put somebody forward for ${invitation.requirement.title}. Withdraw the candidate instead.`,
        },
      },
      { status: 409 }
    )
  }
  if (invitation.status !== 'SENT') {
    return NextResponse.json(
      { error: { code: 'NOT_OPEN', message: `That invitation is ${invitation.status.toLowerCase()} and needs no answer.` } },
      { status: 409 }
    )
  }

  await prisma.requirementInvitation.update({ where: { id }, data: { status: 'DECLINED' } })

  // Whoever is hiring hears it, in the supplier's words when there are any.
  //
  // Awaited, not fired and forgotten: a caller that reads the answer and
  // then looks for the notice — a test, a screen that refreshes itself —
  // raced the write and found nothing there. Telling somebody is part of
  // declining, not a side effect of it.
  const hearers = [...new Set([invitation.requirement.ownerId, invitation.requirement.raisedById].filter(Boolean))] as string[]
  await notifyBulk(
    hearers.map((personId) => ({
      personId,
      companyId: invitation.requirement.companyId,
      type: 'SUBMISSION' as const,
      title: `${invitation.toCompany.name} declined ${invitation.requirement.title}`,
      body: reason ?? 'No reason was given.',
      entityId: invitation.requirement.id,
    }))
  )

  return NextResponse.json({
    data: {
      id,
      status: 'DECLINED',
      says: `Declined. ${invitation.requirement.title} will not be sent to you again, and whoever is hiring has been told${reason ? ' why' : ''}.`,
    },
  })
}
