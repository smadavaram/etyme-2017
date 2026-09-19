import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/document-shares/:id/revoke
 *
 * Kill a link. Immediate, and available to anyone at the company who can
 * see the share — a document sent to the wrong address is an emergency, and
 * an emergency control that needs the right permission is not a control.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const share = await prisma.documentShare.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, revokedAt: true,
      recipientEmail: true, purpose: true, subjectPersonId: true,
      _count: { select: { items: true, accesses: true } },
    },
  })

  if (!share || share.companyId !== caller.company?.id) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Share not found' } },
      { status: 404 }
    )
  }

  if (share.revokedAt) {
    return NextResponse.json({
      data: { id, alreadyRevoked: true, message: 'This link was already withdrawn.' },
    })
  }

  await prisma.documentShare.update({
    where: { id },
    data: { revokedAt: new Date(), revokedById: caller.person.id },
  })

  await prisma.automationLog.create({
    data: {
      companyId: share.companyId,
      action: 'DOCUMENT_SHARE_REVOKED',
      summary: `${caller.person.name} withdrew a share with ${share.recipientEmail}`,
      // Whether it was read before being pulled is the question actually
      // asked afterwards, so it is recorded rather than left to be worked out.
      reason: share._count.accesses === 0
        ? `${share.purpose} — never opened`
        : `${share.purpose} — opened ${share._count.accesses} time(s) before withdrawal`,
      payload: { shareId: id, opened: share._count.accesses },
      reversible: false,
    },
  })

  if (share.subjectPersonId) {
    await prisma.accessLog.create({
      data: {
        subjectId: share.subjectPersonId,
        actorPersonId: caller.person.id,
        actorCompanyId: share.companyId,
        action: 'SHARED_DOCUMENTS_WITHDRAWN',
        allowed: true,
        reason: `Access withdrawn from ${share.recipientEmail}`,
      },
    })
  }

  return NextResponse.json({
    data: {
      id,
      openedBeforeRevoking: share._count.accesses,
      message: share._count.accesses === 0
        ? 'Link withdrawn. It was never opened.'
        : `Link withdrawn. It had been opened ${share._count.accesses} time(s).`,
    },
  })
}
