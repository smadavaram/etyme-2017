import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import {
  checkUpload, labelFor, mayUpload, visibleTo, lastOne, MAX_BYTES,
} from '@/lib/resumes'

/**
 * GET    /api/me/resumes — every version, newest first
 * POST   /api/me/resumes — upload one (multipart: file, label?, personId?)
 * PATCH  /api/me/resumes — make one current, or rename it
 * DELETE /api/me/resumes?id= — hide one
 *
 * The CV belongs to the person. An agency they are on the bench of may
 * upload on their behalf — a recruiter usually holds the document before
 * the consultant has an account — and who did it is recorded.
 *
 * ?personId= lets a recruiter act for somebody on their bench. Without it
 * the caller is acting for themselves.
 */

async function ownerOf(personId: string) {
  const profile = await prisma.consultantProfile.findUnique({
    where: { personId },
    select: {
      listings: { where: { revokedAt: null }, select: { companyId: true } },
    },
  })
  return { personId, listedTo: profile?.listings.map((l) => l.companyId) ?? [] }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const personId = request.nextUrl.searchParams.get('personId') ?? caller.person.id
  const owner = await ownerOf(personId)

  // Reading somebody else's list is the same permission as adding to it.
  const allowed = mayUpload({ personId: caller.person.id, companyId: caller.company?.id }, owner)
  if (!allowed.ok) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: allowed.reason } }, { status: 403 })
  }

  const rows = await prisma.resume.findMany({
    where: { personId },
    select: {
      id: true, label: true, fileName: true, sizeBytes: true, contentType: true,
      currentKey: true, createdAt: true, deletedAt: true,
      uploadedByCompany: { select: { name: true } },
      submissions: { select: { toCompanyId: true, toCompany: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const versions = rows.map((r) => ({
    id: r.id,
    label: r.label,
    fileName: r.fileName,
    sizeBytes: r.sizeBytes,
    isCurrent: r.currentKey !== null,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
    sentTo: [...new Set(r.submissions.map((s) => s.toCompanyId))],
    sentToNames: [...new Set(r.submissions.map((s) => s.toCompany.name))],
    uploadedBy: r.uploadedByCompany?.name ?? 'you',
  }))

  const shown = visibleTo(versions)

  return NextResponse.json({
    data: {
      versions: shown.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString().slice(0, 10),
        deleted: v.deletedAt !== null,
        url: `/api/resumes/${v.id}/file`,
      })),
      note:
        shown.length === 0
          ? 'No CV on file. A submission can go without one, and the client will ask for it.'
          : 'Each version is kept as it was sent. A client keeps the copy they were given.',
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!form || !(file instanceof File)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Send the CV as a file.' } },
      { status: 422 }
    )
  }

  const personId = (form.get('personId') as string) || caller.person.id
  const owner = await ownerOf(personId)

  const allowed = mayUpload({ personId: caller.person.id, companyId: caller.company?.id }, owner)
  if (!allowed.ok) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: allowed.reason } }, { status: 403 })
  }

  const verdict = checkUpload({ name: file.name, type: file.type, size: file.size })
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: verdict.reason } },
      { status: 422 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That file is over five megabytes.' } },
      { status: 413 }
    )
  }

  const now = new Date()
  const label = (form.get('label') as string)?.trim() || labelFor(file.name, now)

  // The newest upload becomes the current one, which is what somebody
  // uploading a CV means by it. The old one keeps its bytes: a submission
  // may be pointing at it.
  const created = await prisma.$transaction(async (tx) => {
    await tx.resume.updateMany({ where: { personId, currentKey: personId }, data: { currentKey: null } })
    return tx.resume.create({
      data: {
        personId,
        label,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: bytes.byteLength,
        storage: 'DB',
        bytes,
        uploadedById: caller.person.id,
        uploadedByCompanyId: caller.person.id === personId ? null : caller.company?.id ?? null,
        currentKey: personId,
      },
      select: { id: true, label: true, sizeBytes: true },
    })
  })

  void emit({
    type: 'resume.uploaded',
    companyId: caller.company?.id ?? null,
    subjectType: 'Resume',
    subjectId: created.id,
    actorPersonId: caller.person.id,
    payload: { personId, sizeBytes: created.sizeBytes, onBehalf: caller.person.id !== personId },
  })

  return NextResponse.json({
    data: {
      id: created.id,
      label: created.label,
      url: `/api/resumes/${created.id}/file`,
      message: `${verdict.reason} This is the one that goes out from now on.`,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which version?' } },
      { status: 422 }
    )
  }

  const resume = await prisma.resume.findUnique({
    where: { id: body.id },
    select: { id: true, personId: true, label: true, deletedAt: true },
  })
  if (!resume) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such CV.' } }, { status: 404 })
  }

  const owner = await ownerOf(resume.personId)
  const allowed = mayUpload({ personId: caller.person.id, companyId: caller.company?.id }, owner)
  if (!allowed.ok) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: allowed.reason } }, { status: 403 })
  }

  if (body.makeCurrent === true) {
    if (resume.deletedAt !== null) {
      return NextResponse.json(
        {
          error: {
            code: 'DELETED',
            message: 'That version was deleted. Upload it again if you want it going out.',
          },
        },
        { status: 409 }
      )
    }
    await prisma.$transaction([
      prisma.resume.updateMany({
        where: { personId: resume.personId, currentKey: resume.personId },
        data: { currentKey: null },
      }),
      prisma.resume.update({ where: { id: resume.id }, data: { currentKey: resume.personId } }),
    ])
    return NextResponse.json({
      data: { id: resume.id, message: `"${resume.label}" is the one that goes out now.` },
    })
  }

  if (typeof body.label === 'string' && body.label.trim()) {
    const updated = await prisma.resume.update({
      where: { id: resume.id },
      data: { label: body.label.trim().slice(0, 80) },
      select: { label: true },
    })
    return NextResponse.json({ data: { label: updated.label, message: 'Renamed.' } })
  }

  return NextResponse.json(
    { error: { code: 'VALIDATION', message: 'Nothing to change.' } },
    { status: 422 }
  )
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which version?' } }, { status: 422 })
  }

  const resume = await prisma.resume.findUnique({
    where: { id },
    select: { id: true, personId: true, label: true },
  })
  if (!resume) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such CV.' } }, { status: 404 })
  }

  const owner = await ownerOf(resume.personId)
  const allowed = mayUpload({ personId: caller.person.id, companyId: caller.company?.id }, owner)
  if (!allowed.ok) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: allowed.reason } }, { status: 403 })
  }

  const all = await prisma.resume.findMany({
    where: { personId: resume.personId },
    select: {
      id: true, label: true, fileName: true, sizeBytes: true, currentKey: true,
      createdAt: true, deletedAt: true,
      submissions: { select: { toCompanyId: true } },
    },
  })

  const wasLast = lastOne(
    all.map((r) => ({
      id: r.id,
      label: r.label,
      fileName: r.fileName,
      sizeBytes: r.sizeBytes,
      isCurrent: r.currentKey !== null,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
      sentTo: r.submissions.map((s) => s.toCompanyId),
    })),
    resume.id
  )

  // Hidden, not erased. Whoever it was sent to can still open it, because
  // it is in their inbox whatever this row says.
  await prisma.resume.update({
    where: { id: resume.id },
    data: { deletedAt: new Date(), currentKey: null },
  })

  return NextResponse.json({
    data: {
      message: wasLast
        ? `"${resume.label}" is gone from your list. You now have no CV on file — anybody submitting you will be told so.`
        : `"${resume.label}" is gone from your list. Anybody it was already sent to still has their copy.`,
    },
  })
}
