import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkShare } from '@/lib/document-share'

/**
 * GET /api/shared/:token
 *
 * The recipient's side. Deliberately unauthenticated: a lawyer asked to
 * create an account will ask you to email the files instead, and then the
 * files are in an inbox forever with no record of anything.
 *
 * The token is the credential. That is only acceptable because a share
 * always expires, can be killed instantly, and records every open — for the
 * person whose documents these are, not just for the company.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const share = await prisma.documentShare.findUnique({
    where: { token },
    include: {
      items: { select: { id: true, kind: true, refId: true, label: true } },
      company: { select: { name: true } },
      subjectPerson: { select: { name: true } },
    },
  })

  // An unknown token and a revoked one look the same from outside, so a
  // withdrawn link cannot be told apart from a guess.
  if (!share) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This link is not valid.' } },
      { status: 404 }
    )
  }

  const verdict = checkShare(
    { expiresAt: share.expiresAt, revokedAt: share.revokedAt },
    new Date()
  )

  if (!verdict.readable) {
    return NextResponse.json(
      { error: { code: verdict.state, message: verdict.message } },
      { status: 410 }
    )
  }

  // Record the open before returning anything.
  await prisma.documentShareAccess.create({
    data: {
      shareId: share.id,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
    },
  })

  // And on the subject's own record, where they can see it.
  if (share.subjectPersonId) {
    await prisma.accessLog.create({
      data: {
        subjectId: share.subjectPersonId,
        actorCompanyId: share.companyId,
        action: 'SHARED_DOCUMENTS_OPENED',
        allowed: true,
        reason: `Opened by ${share.recipientEmail} — ${share.purpose}`,
      },
    })
  }

  return NextResponse.json({
    data: {
      from: share.company.name,
      purpose: share.purpose,
      about: share.subjectPerson?.name ?? null,
      expiresAt: share.expiresAt.toISOString().slice(0, 10),
      documents: share.items.map(i => ({
        id: i.id,
        label: i.label,
        kind: i.kind,
        // The file itself is fetched per document, so opening one is
        // recorded separately from opening the index.
        href: `/api/shared/${token}/document/${i.id}`,
      })),
      notice: 'Whoever sent this can see when you opened it, and can withdraw the link at any time.',
    },
  })
}
