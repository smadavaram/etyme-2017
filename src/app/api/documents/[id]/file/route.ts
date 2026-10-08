import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { standingOn } from '@/lib/document-request'

/**
 * GET /api/documents/:id/file — the document itself.
 *
 * The other half of the door that takes it. A worker photographs her
 * I-9 and sends it; somebody at the firm that asked for it opens it and
 * decides whether it answers what was asked. Until 2026-09-21 the bytes
 * had nowhere to live, so neither half existed and a chase ended at a
 * sentence saying "upload it" with nothing behind it.
 *
 * ── Who may open it ──────────────────────────────────────────────────
 *
 * Two, and no third: **the person the document is about**, because it is
 * theirs, and **the paperwork desk of the firm that asked for it**,
 * because it cannot decide whether a document answers a requirement
 * without reading it. A company document is readable by that company.
 * Until 2026-10-08 any seat at the asking firm could open the file, so an
 * Accounts Receivable clerk could read a contractor's passport; a seat
 * there without the paperwork desk is now refused in a sentence. Everybody else is told it is not
 * here rather than that they may not have it — a refusal that confirms
 * a document exists is a refusal that leaked something.
 *
 * A supplier further up a chain is deliberately not on that list. The
 * client sees the STANDING of whoever employs somebody on its site and
 * never the person's papers, which is CLAUDE.md's rule for the chain
 * said about bytes instead of about names.
 *
 * ── Every read is logged, including a refusal ────────────────────────
 *
 * This is a read of another person's data in the plainest sense there
 * is: their passport, their license, the form they signed. The
 * `AccessLog` row goes in before the verdict is acted on, so a refusal
 * leaves a trail too — somebody trying to open a stranger's I-9 is
 * exactly what an audit is looking for, and it is the attempt rather
 * than the success that says so.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const doc = await prisma.docInstance.findUnique({
    where: { id },
    select: {
      id: true,
      subjectType: true,
      subjectId: true,
      signedFileUrl: true,
      template: { select: { name: true, company: { select: { id: true, name: true } } } },
      sellContract: { select: { personId: true } },
      buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, select: { personId: true }, take: 1 } } },
      file: { select: { fileName: true, contentType: true, bytes: true, sizeBytes: true } },
    },
  })

  const missing = NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'That document is not here.' } },
    { status: 404 }
  )
  if (!doc) return missing

  const subjectPersonId =
    doc.subjectType === 'PERSON'
      ? doc.subjectId
      : doc.subjectType === 'SELL_CONTRACT'
        ? doc.sellContract?.personId ?? null
        : doc.subjectType === 'BUY_CONTRACT'
          ? doc.buyContract?.candidates[0]?.personId ?? null
          : null

  const issuer = doc.template.company

  // Whose hands this is in — the same rule as sending, signing and
  // uploading (`standingOn` in lib/document-request). The firm that asked
  // reads the file through its paperwork desk only; a seat there with no
  // such desk — an Accounts Receivable clerk, a Member — is refused in a
  // sentence, because billing a client is not reading a contractor's
  // passport. The person it is about reads their own. A company's own
  // paper reaches it. Everybody else is told nothing is here.
  const standing = standingOn('open', { templateName: doc.template.name, subjectPersonId }, {
    personId: caller.person.id,
    atIssuer: caller.company?.id === issuer.id && caller.context.type !== 'CONSULTANT',
    atSubjectCompany: doc.subjectType === 'COMPANY' && caller.company?.id === doc.subjectId,
    permissions: caller.permissions ?? [],
    companyName: caller.company?.name ?? null,
  })
  const allowed = standing.ok
  const mine = subjectPersonId !== null && caller.person.id === subjectPersonId

  const why = standing.ok
    ? standing.staffOfIssuer
      ? `${issuer.name} asked for this document and its paperwork desk is reading the answer.`
      : mine
        ? 'Their own document.'
        : 'The company the document is about.'
    : standing.code === 'NO_DESK'
      ? `A seat at ${issuer.name} that does not work its paperwork, opening somebody else's document.`
      : `Neither the person this document is about nor ${issuer.name}, who asked for it.`

  // Before the verdict is acted on, so a refused attempt leaves a trail.
  // A log where every row is a success is a log that answers the wrong
  // question.
  await prisma.accessLog
    .create({
      data: {
        subjectId: subjectPersonId ?? doc.subjectId,
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id ?? null,
        action: 'DOCUMENT_FILE_READ',
        allowed,
        reason: why,
      },
    })
    .catch(() => {})

  if (!standing.ok) {
    // A colleague without the desk is told what its seat lacks, never a
    // permission key. A stranger is told nothing is here rather than that
    // they may not have it: saying "you may not read Helena Marsh's I-9"
    // confirms there is one.
    if (standing.code === 'NO_DESK') {
      return NextResponse.json({ error: { code: standing.code, message: standing.message } }, { status: 403 })
    }
    return missing
  }

  // A firm that sent a link rather than a file is a real case and is not
  // deprecated. The address is where the document is.
  if (!doc.file && doc.signedFileUrl && !doc.signedFileUrl.startsWith('file://')) {
    return NextResponse.redirect(doc.signedFileUrl)
  }

  if (!doc.file) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_FILE',
          message:
            `Nothing has been sent for ${doc.template.name} yet. It has been asked for, and whoever ` +
            `owes it has not answered.`,
        },
      },
      { status: 410 }
    )
  }

  return new NextResponse(new Uint8Array(doc.file.bytes), {
    headers: {
      'Content-Type': doc.file.contentType,
      // Inline: somebody checking a certificate wants to look at it, not
      // to collect a copy on their own laptop.
      'Content-Disposition': `inline; filename="${doc.file.fileName.replace(/"/g, '')}"`,
      'Content-Length': String(doc.file.sizeBytes),
      'Cache-Control': 'private, no-store',
    },
  })
}
