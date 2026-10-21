import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { desksFor, deskPeople, orderedOfSuppliers } from '@/lib/supplier-desks'
import { approvedSays, claimUrl, sentSays } from '@/lib/supplier-link'
import { provideItems, vendorItems, wantsDates, withOrderedItems, type ChecklistItem } from '@/lib/supplier-onboarding'
import { checkDocumentUpload, MAX_DOCUMENT_BYTES, sizeSaid } from '@/lib/document-request'

/**
 * GET  /api/supplier-apply/[token]  — what the client asks for, and what is already in
 * POST /api/supplier-apply/[token]  — the firm supplies its side
 *
 * No sign-in. The link is the firm's, sent to the contact the client
 * named; it stops working once the client has decided. A file arrives
 * whole and is kept the way every other paper's bytes are kept
 * (`DocFile`), on a paper of the client's that the item points at, so
 * the client's paperwork team opens it through the one file door and
 * nobody else can. Until 2026-10-21 only the name and size were kept,
 * and HR had nothing to examine (the document-flow walk). The firm's
 * side goes to PROVIDED, and only the desk's own verifying makes it
 * HELD. In time this page is the supplier's door into the client
 * portal; today it is one page that asks for exactly what the trade
 * asks for.
 */
async function find(token: string) {
  return prisma.supplierRequest.findUnique({
    where: { token },
    include: { company: { select: { name: true } } },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await find(token)
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That link is not one we sent, or it has expired.' } }, { status: 404 })
  // The firm is shown what the client's own orders ask of it as well as
  // the standard walk, with the sentence saying whose order asked. A firm
  // that fills this page in and is then chased for a certificate nobody
  // told it about is the crack this closes at the firm's end.
  const checklist = withOrderedItems(
    row.checklist as unknown as ChecklistItem[],
    await orderedOfSuppliers(row.companyId),
    row.company.name
  )
  const app = (row.application ?? null) as Record<string, unknown> | null
  // Once approved, the same sentence and link the claim email carried, so
  // a firm that opens this link again is pointed at its account rather
  // than told only that the link has done its job.
  let claim: { says: string; url: string } | null = null
  if (row.state === 'APPROVED' && row.contactEmail) {
    const invite = await prisma.supplierInvite.findUnique({
      where: { byId_email: { byId: row.companyId, email: row.contactEmail } },
      select: { token: true, state: true, company: { select: { name: true, claimedAt: true } } },
    })
    if (invite && invite.state === 'PENDING' && !invite.company.claimedAt) {
      claim = { says: approvedSays({ clientName: row.company.name, firmName: invite.company.name }), url: claimUrl(invite.token) }
    }
  }
  return NextResponse.json({
    data: {
      client: row.company.name,
      firm: row.name,
      contactName: row.contactName,
      decided: row.state === 'APPROVED' || row.state === 'DECLINED',
      state: row.state,
      claim,
      asks: vendorItems(checklist).map((i) => ({
        key: i.key, label: i.label, required: i.required, state: i.state,
        fileName: i.fileName ?? null, says: i.says ?? null,
        wantsDates: wantsDates(i), validFrom: i.validFrom ?? null, validUntil: i.validUntil ?? null,
      })),
      application: app,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await find(token)
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That link is not one we sent, or it has expired.' } }, { status: 404 })
  if (row.state === 'APPROVED' || row.state === 'DECLINED') {
    return NextResponse.json({ error: { code: 'DECIDED', message: `${row.company.name} has already decided on ${row.name}; this link has done its job.` } }, { status: 409 })
  }
  const body = await request.json().catch(() => ({}))
  const now = new Date()
  const str = (k: string) => (typeof body?.[k] === 'string' ? body[k].trim() : '')
  const references = Array.isArray(body?.references)
    ? body.references.map((r: any) => ({ name: String(r?.name ?? '').trim(), company: String(r?.company ?? '').trim(), email: String(r?.email ?? '').trim(), phone: String(r?.phone ?? '').trim() })).filter((r: any) => r.name || r.company)
    : []
  // The two dates ride in with the file. They are printed on the
  // certificate the firm is uploading, and asking for them here saves
  // the desk retyping them off a PDF later — the desk still verifies,
  // and corrects them where the firm typed them wrong.
  //
  // The file rides in with them, as `content` in base64: a name with
  // nothing behind it is not an answer, and is refused in a sentence.
  const docs: { key: string; fileName: string; size: number; type: string; bytes: Buffer | null; validFrom: string | null; validUntil: string | null }[] = Array.isArray(body?.docs)
    ? body.docs.filter((d: any) => typeof d?.key === 'string' && typeof d?.fileName === 'string').map((d: any) => ({
        key: d.key,
        fileName: String(d.fileName).slice(0, 200),
        size: Number(d.size ?? 0),
        type: typeof d?.type === 'string' && d.type ? d.type : 'application/octet-stream',
        bytes: typeof d?.content === 'string' && d.content ? Buffer.from(d.content, 'base64') : null,
        validFrom: typeof d?.validFrom === 'string' && d.validFrom.trim() ? d.validFrom.trim() : null,
        validUntil: typeof d?.validUntil === 'string' && d.validUntil.trim() ? d.validUntil.trim() : null,
      }))
    : []
  for (const d of docs) {
    if (!d.bytes || d.bytes.byteLength === 0) {
      return NextResponse.json({ error: { code: 'FILE_REQUIRED', message: `${d.fileName} did not arrive with the file itself. Pick it again and send it.` } }, { status: 422 })
    }
    const verdict = checkDocumentUpload({ name: d.fileName, type: d.type, size: d.bytes.byteLength })
    if (!verdict.ok) return NextResponse.json({ error: { code: 'FILE_REFUSED', message: verdict.says } }, { status: 422 })
    if (d.bytes.byteLength > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: { code: 'FILE_REFUSED', message: `${d.fileName} arrived as ${sizeSaid(d.bytes.byteLength)} and ten megabytes is the limit. Send a smaller copy.` } }, { status: 413 })
    }
  }
  const bank = body?.bank && typeof body.bank === 'object'
    ? { bankName: String(body.bank.bankName ?? '').trim(), accountName: String(body.bank.accountName ?? '').trim(), last4: String(body.bank.last4 ?? '').replace(/\D/g, '').slice(-4) }
    : null
  const skills: string[] = typeof body?.skills === 'string' ? body.skills.split(/[,;]/).map((x: string) => x.trim()).filter(Boolean) : Array.isArray(body?.skills) ? body.skills : []

  const ordered = withOrderedItems(row.checklist as unknown as ChecklistItem[], await orderedOfSuppliers(row.companyId), row.company.name)
  const labelOf = new Map(ordered.map((i) => [i.key, i.label]))
  const provided: { key: string; fileName?: string | null; fileUrl?: string | null; validFrom?: string | null; validUntil?: string | null }[] = []
  for (const d of docs) {
    const fileUrl = await keepTheFile(row.companyId, row.id, d.key, labelOf.get(d.key) ?? d.key, { name: d.fileName, type: d.type, bytes: d.bytes! })
    provided.push({ key: d.key, fileName: d.fileName, fileUrl, validFrom: d.validFrom, validUntil: d.validUntil })
  }
  if (bank?.bankName && bank.accountName && bank.last4.length === 4) provided.push({ key: 'BANK', fileName: `${bank.bankName} ····${bank.last4}` })
  if (str('experience')) provided.push({ key: 'EXPERIENCE', fileName: null })
  if (references.length >= 2) provided.push({ key: 'REFERENCES', fileName: `${references.length} references` })

  const prior = (row.application ?? {}) as Record<string, unknown>
  const application = {
    ...prior,
    legalName: str('legalName') || prior.legalName || null,
    address: str('address') || prior.address || null,
    duns: str('duns') || prior.duns || null,
    website: str('website') || prior.website || null,
    experience: str('experience') || prior.experience || null,
    references: references.length ? references : (prior.references ?? []),
    bank: bank?.last4 ? bank : (prior.bank ?? null),
    skills: skills.length ? skills : (prior.skills ?? []),
    docs: [
      ...((prior.docs as any[]) ?? []).filter((d) => !docs.some((n) => n.key === d.key)),
      // What was sent, never the bytes: those are kept on the paper the item points at.
      ...docs.map(({ bytes: _b, ...d }) => ({ ...d, fileUrl: provided.find((p) => p.key === d.key)?.fileUrl ?? null, at: now.toISOString() })),
    ],
    submittedAt: now.toISOString(),
  }
  const checklist = provideItems(ordered, provided, now)
  await prisma.supplierRequest.update({
    where: { id: row.id },
    data: { application: application as unknown as object, checklist: checklist as unknown as object, state: 'IN_REVIEW', skills: skills.length ? skills : row.skills },
  })

  // Whichever desk it is on hears that the firm's side is in; before
  // the lead has decided, Procurement, whose desk comes first with paper.
  const desks = await desksFor(row.companyId, row.recommendedById)
  const stage = (['PROCUREMENT', 'HR', 'FINANCE'] as const).find((s) => s === row.stage) ?? 'PROCUREMENT'
  for (const personId of await deskPeople(row.companyId, stage, desks)) {
    void notify({
      personId, companyId: row.companyId, type: 'SYSTEM', entityId: row.id,
      title: `${row.name} sent its paperwork`,
      body: `${provided.length} of ${vendorItems(checklist).length} items are in from ${row.name}. Verify them when it reaches you.`,
      data: { href: '/dashboard/suppliers' },
    })
  }

  const still = vendorItems(checklist).filter((i) => i.required && i.state === 'MISSING').map((i) => i.label)
  return NextResponse.json({
    data: {
      asks: vendorItems(checklist).map((i) => ({
        key: i.key, label: i.label, required: i.required, state: i.state,
        fileName: i.fileName ?? null, says: i.says ?? null,
        wantsDates: wantsDates(i), validFrom: i.validFrom ?? null, validUntil: i.validUntil ?? null,
      })),
      says: still.length
        ? `${sentSays(row.company.name)} ${row.company.name} still needs: ${still.join('; ')}. Come back to this link when you have them.`
        : sentSays(row.company.name),
    },
  }, { status: 201 })
}

/**
 * Keep one file the firm sent: a paper of the client's for that item,
 * the bytes on it (`DocFile`), and the address of the one file door.
 * One paper per item of one request; a second answer replaces the bytes,
 * the way a sent-back paper is answered again. The paper is the
 * client's, because the client asked for it: its paperwork team opens
 * it, and nobody at another company can.
 */
async function keepTheFile(clientId: string, requestId: string, key: string, label: string, file: { name: string; type: string; bytes: Buffer }): Promise<string> {
  const name = label.slice(0, 200)
  const template =
    (await prisma.docTemplate.findFirst({ where: { companyId: clientId, name }, select: { id: true } })) ??
    (await prisma.docTemplate.create({ data: { companyId: clientId, name, audience: 'VENDOR', needsSignature: false }, select: { id: true } }))
  const now = new Date()
  const subjectId = `${requestId}:${key}`
  const id = await prisma.$transaction(async (tx) => {
    const paper =
      (await tx.docInstance.findFirst({ where: { subjectType: 'SUPPLIER_REQUEST_ITEM', subjectId }, select: { id: true } })) ??
      (await tx.docInstance.create({
        data: { templateId: template.id, subjectType: 'SUPPLIER_REQUEST_ITEM', subjectId, status: 'UPLOADED', sentAt: now },
        select: { id: true },
      }))
    await tx.docInstance.update({ where: { id: paper.id }, data: { status: 'UPLOADED', signedAt: now, fileName: file.name, signedFileUrl: 'file://on-record' } })
    await tx.docFile.upsert({
      where: { docInstanceId: paper.id },
      create: { docInstanceId: paper.id, fileName: file.name, contentType: file.type, sizeBytes: file.bytes.byteLength, bytes: file.bytes },
      update: { fileName: file.name, contentType: file.type, sizeBytes: file.bytes.byteLength, bytes: file.bytes, uploadedAt: now },
    })
    return paper.id
  })
  return `/api/documents/${id}/file`
}
