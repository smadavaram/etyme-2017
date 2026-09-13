import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify, notifyBulk } from '@/lib/notify'
import { mayAct, askNotice, type DocAction } from '@/lib/document-request'

/**
 * One move on a document request — send, upload or sign — shared by the
 * three routes beside this file. The rule is lib/document-request; this
 * loads the facts, applies the verdict, and tells whoever needs telling.
 */
export async function actOn(request: NextRequest, id: string, action: DocAction) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const fileUrl = typeof body.fileUrl === 'string' && body.fileUrl.trim() ? body.fileUrl.trim().slice(0, 2000) : null
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 200) : null
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
  const attests = body.attests === true

  const doc = await prisma.docInstance.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, needsSignature: true, company: { select: { id: true, name: true } } } },
      sellContract: { select: { personId: true } },
      buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, select: { personId: true }, take: 1 } } },
    },
  })
  if (!doc) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That document request is not here.' } }, { status: 404 })
  }

  const subjectPersonId =
    doc.subjectType === 'PERSON'
      ? doc.subjectId
      : doc.subjectType === 'SELL_CONTRACT'
        ? doc.sellContract?.personId ?? null
        : doc.subjectType === 'BUY_CONTRACT'
          ? doc.buyContract?.candidates[0]?.personId ?? null
          : null

  const issuer = doc.template.company
  const staffOfIssuer = caller.company?.id === issuer.id && caller.context.type !== 'CONSULTANT'

  // A stranger is told nothing is here rather than that they may not.
  if (!staffOfIssuer && caller.person.id !== subjectPersonId && !(doc.subjectType === 'COMPANY' && caller.company?.id === doc.subjectId)) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That document request is not here.' } }, { status: 404 })
  }

  const facts = {
    status: doc.status,
    templateName: doc.template.name,
    needsSignature: doc.template.needsSignature,
    subjectPersonId,
    issuerName: issuer.name,
  }
  const verdict = mayAct(action, facts, { personId: caller.person.id, staffOfIssuer }, { fileUrl, attests })
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: verdict.code === 'NOT_YOURS' ? 403 : 409 })
  }

  const now = new Date()
  await prisma.docInstance.update({
    where: { id },
    data: {
      status: verdict.next,
      ...(action === 'send' ? { sentAt: now } : {}),
      ...(action !== 'send'
        ? { signedAt: now, signedById: caller.person.id, signedFileUrl: fileUrl ?? doc.signedFileUrl, fileName: fileName ?? doc.fileName, note: note ?? doc.note }
        : {}),
    },
  })

  if (action === 'send') {
    const notice = askNotice(facts)
    if (subjectPersonId) {
      // A candidate is reached by email; a company's own person in the app.
      const seat = await prisma.context.findFirst({
        where: { personId: subjectPersonId, revokedAt: null, type: { not: 'CONSULTANT' } },
        select: { id: true },
      })
      void notify({
        personId: subjectPersonId,
        companyId: issuer.id,
        type: 'SYSTEM',
        title: notice.title,
        body: notice.body,
        entityId: doc.id,
        channel: seat ? 'IN_APP' : 'EMAIL',
      })
    } else if (doc.subjectType === 'COMPANY') {
      const staff = await prisma.context.findMany({
        where: { companyId: doc.subjectId, revokedAt: null, NOT: { roleId: null }, type: { not: 'CONSULTANT' } },
        select: { personId: true },
        take: 10,
      })
      void notifyBulk(staff.map((s) => ({ personId: s.personId, companyId: doc.subjectId, type: 'SYSTEM' as const, title: notice.title, body: notice.body, entityId: doc.id })))
    }
  } else if (subjectPersonId && caller.person.id === subjectPersonId) {
    // The person answered; the company that asked hears it.
    const staff = await prisma.context.findMany({
      where: { companyId: issuer.id, revokedAt: null, NOT: { roleId: null }, type: { not: 'CONSULTANT' } },
      select: { personId: true },
      take: 10,
    })
    void notifyBulk(staff.map((s) => ({
      personId: s.personId, companyId: issuer.id, type: 'SYSTEM' as const,
      title: `${caller.person.name} ${verdict.next === 'SIGNED' ? 'signed' : 'uploaded'} ${doc.template.name}`,
      body: note ?? 'It is on file.',
      entityId: doc.id,
    })))
  }

  return NextResponse.json({ data: { id, status: verdict.next, says: verdict.says } })
}
