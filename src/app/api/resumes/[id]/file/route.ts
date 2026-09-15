import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayRead } from '@/lib/resumes'

/**
 * GET /api/resumes/:id/file — the document itself.
 *
 * Three people may open it: the person; an agency currently representing
 * them; and any company it was actually sent to with a submission. That
 * last one is why a version exists — a client keeps the copy they were
 * given, and deleting it here does not reach into their inbox.
 *
 * Every read is logged, like any other read of somebody's file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const resume = await prisma.resume.findUnique({
    where: { id },
    select: {
      id: true, personId: true, fileName: true, contentType: true, bytes: true,
      url: true, storage: true,
      person: {
        select: {
          consultant: {
            select: { listings: { where: { revokedAt: null }, select: { companyId: true } } },
          },
        },
      },
      submissions: { select: { toCompanyId: true } },
    },
  })

  if (!resume) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such CV.' } }, { status: 404 })
  }

  const allowed = mayRead(
    { personId: caller.person.id, companyId: caller.company?.id },
    {
      personId: resume.personId,
      listedTo: resume.person.consultant?.listings.map((l) => l.companyId) ?? [],
    },
    resume.submissions.map((s) => s.toCompanyId)
  )

  await prisma.accessLog.create({
    data: {
      subjectId: resume.personId,
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company?.id ?? null,
      action: 'RESUME_READ',
      allowed: allowed.ok,
      reason: allowed.reason,
    },
  }).catch(() => {})

  if (!allowed.ok) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: allowed.reason } }, { status: 403 })
  }

  if (resume.storage === 'URL' && resume.url) {
    return NextResponse.redirect(resume.url)
  }

  if (!resume.bytes) {
    return NextResponse.json(
      { error: { code: 'NO_FILE', message: 'The file is missing. Upload it again.' } },
      { status: 410 }
    )
  }

  return new NextResponse(new Uint8Array(resume.bytes), {
    headers: {
      'Content-Type': resume.contentType,
      // Inline: a recruiter opening a CV wants to read it, not download it.
      'Content-Disposition': `inline; filename="${resume.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
