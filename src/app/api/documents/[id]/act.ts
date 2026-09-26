import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify, notifyBulk } from '@/lib/notify'
import {
  mayAct,
  askNotice,
  checkDocumentUpload,
  MAX_DOCUMENT_BYTES,
  sizeSaid,
  type DocAction,
} from '@/lib/document-request'

/**
 * One move on a document request — send, upload or sign — shared by the
 * three routes beside this file. The rule is lib/document-request; this
 * loads the facts, applies the verdict, and tells whoever needs telling.
 */
export async function actOn(request: NextRequest, id: string, action: DocAction) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // ── A file, or a link to one ───────────────────────────────────────
  //
  // Until 2026-09-21 this read `request.json()` and nothing else, and
  // nothing in the codebase stored a document's bytes. So a contractor
  // standing in a corridor with a photograph of her I-9 on her phone had
  // nowhere to put it: the only way to answer a chase was to host the
  // file somewhere first and send the address, which is a thing a firm
  // does and a person does not. A multipart POST arrived empty and came
  // back FILE_REQUIRED, which is the app telling her she sent nothing
  // when she had sent the whole thing.
  //
  // Both doors now. **A link is still a way to answer** — a firm sending
  // one from its own document system is a real case and is not
  // deprecated — and a file sent as a file is kept as the file.
  const sent = await whatArrived(request)
  if (sent.refusal) return sent.refusal
  const { fileUrl, fileName, note, attests, file } = sent

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
  // The row and the bytes move together or neither does. A request that
  // says a document arrived with no file behind it is the state this
  // whole area exists to prevent, and a file with no request pointing at
  // it is a file nobody will ever find.
  await prisma.$transaction(async (tx) => {
    await tx.docInstance.update({
      where: { id },
      data: {
        status: verdict.next,
        ...(action === 'send' ? { sentAt: now } : {}),
        ...(action !== 'send'
          ? { signedAt: now, signedById: caller.person.id, signedFileUrl: fileUrl ?? doc.signedFileUrl, fileName: fileName ?? doc.fileName, note: note ?? doc.note }
          : {}),
      },
    })

    if (file) {
      // One file per instance. A reissue is a new `DocInstance` with
      // `reissueOf` set and a file of its own, so the edition somebody
      // signed keeps the bytes they signed — which is the fact an
      // auditor asks for and the reason this is not an overwrite of the
      // old one.
      await tx.docFile.upsert({
        where: { docInstanceId: id },
        create: {
          docInstanceId: id,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.bytes.byteLength,
          bytes: file.bytes,
          uploadedById: caller.person.id,
        },
        update: {
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.bytes.byteLength,
          bytes: file.bytes,
          uploadedAt: now,
          uploadedById: caller.person.id,
        },
      })
    }
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

  return NextResponse.json({
    data: {
      id,
      status: verdict.next,
      says: file ? `${verdict.says} ${file.says}` : verdict.says,
      // What was kept, so a page can say "photo, 2.1MB" rather than
      // leaving somebody to wonder whether the thing went.
      file: file ? { fileName: file.name, contentType: file.type, sizeBytes: file.bytes.byteLength } : null,
    },
  })
}

// ── What arrived, whichever way it was sent ───────────────────────────

interface Arrived {
  fileUrl: string | null
  fileName: string | null
  note: string | null
  attests: boolean
  file: { name: string; type: string; bytes: Buffer; says: string } | null
  refusal?: NextResponse
}

/**
 * The body, as JSON or as a form with a file on it.
 *
 * The check runs BEFORE anything is written, and a refusal says what is
 * wrong and what to do about it. A file refused after the row has moved
 * leaves a request saying a document arrived and a record with nothing
 * in it — worse than either failure on its own, because only one of them
 * is visible.
 */
async function whatArrived(request: NextRequest): Promise<Arrived> {
  const kind = request.headers.get('content-type') ?? ''
  const empty: Arrived = { fileUrl: null, fileName: null, note: null, attests: false, file: null }

  if (!kind.toLowerCase().includes('multipart/form-data')) {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    return {
      ...empty,
      fileUrl: typeof body.fileUrl === 'string' && body.fileUrl.trim() ? body.fileUrl.trim().slice(0, 2000) : null,
      fileName: typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 200) : null,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null,
      attests: body.attests === true,
    }
  }

  const form = await request.formData().catch(() => null)
  if (!form) {
    return {
      ...empty,
      refusal: NextResponse.json(
        { error: { code: 'FILE_REQUIRED', message: 'That did not arrive. Pick the file again and send it.' } },
        { status: 422 }
      ),
    }
  }

  const said = (k: string, max: number): string | null => {
    const v = form.get(k)
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  }
  const rest = {
    fileUrl: said('fileUrl', 2000),
    fileName: said('fileName', 200),
    note: said('note', 500),
    attests: form.get('attests') === 'true',
  }

  const picked = form.get('file')
  if (!(picked instanceof File)) {
    // A form with no file on it is a form: somebody sent a link or a
    // note this way, and that is allowed.
    return { ...rest, file: null }
  }

  const verdict = checkDocumentUpload({ name: picked.name, type: picked.type, size: picked.size })
  if (!verdict.ok) {
    return {
      ...rest,
      file: null,
      refusal: NextResponse.json({ error: { code: 'FILE_REFUSED', message: verdict.says } }, { status: 422 }),
    }
  }

  const bytes = Buffer.from(await picked.arrayBuffer())
  // Checked again on what actually arrived. `size` is what the browser
  // said before sending, and a body larger than the header claimed is
  // the one case where believing the claim writes the thing we refused.
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return {
      ...rest,
      file: null,
      refusal: NextResponse.json(
        {
          error: {
            code: 'FILE_REFUSED',
            message: `That arrived as ${sizeSaid(bytes.byteLength)} and ten megabytes is the limit. Send a smaller photograph.`,
          },
        },
        { status: 413 }
      ),
    }
  }

  return {
    ...rest,
    fileName: rest.fileName ?? picked.name.slice(0, 200),
    // The route's own rule wants a file URL present for an upload, and a
    // file IS the answer to that. Said as what it is rather than as an
    // address, because there is no address — the bytes are here.
    fileUrl: rest.fileUrl ?? 'file://on-record',
    file: {
      name: picked.name.slice(0, 200),
      type: picked.type || 'application/octet-stream',
      bytes,
      says: `Kept as ${verdict.says}`,
    },
  }
}
