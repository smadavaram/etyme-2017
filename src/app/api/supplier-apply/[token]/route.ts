import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { desksFor, deskPeople, orderedOfSuppliers, keepSupplierPaper } from '@/lib/supplier-desks'
import { applyPrefill, approvedSays, claimUrl, sentSays, type EarlierApplication } from '@/lib/supplier-link'
import { earlierApplications, firmOnRecord, paperIdOf, sessionEmail, signedInAt } from './firm'
import { bankChange } from '@/lib/money/remit-change'
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
    include: { company: { select: { name: true, isDemo: true } } },
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
  // What the form opens with: the firm's own answers on this link, its
  // record, the skills the client typed; and, for a person signed in at
  // the firm, what it sent other clients (lib/supplier-link says why only
  // them). Nothing here is read once the client has decided.
  const decided = row.state === 'APPROVED' || row.state === 'DECLINED'
  const prefill = decided ? null : await prefillFor(row, checklist)
  return NextResponse.json({
    data: {
      prefill,
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

const NOT_A_FILE = new Set(['BANK', 'EXPERIENCE', 'REFERENCES'])

type Found = NonNullable<Awaited<ReturnType<typeof find>>>

/** The firm on this link, whether the visitor sits at it, and what it sent before. */
async function whoApplies(row: Found): Promise<{ firm: Awaited<ReturnType<typeof firmOnRecord>>; atFirm: boolean; earlier: EarlierApplication[] }> {
  const email = await sessionEmail()
  const firm = await firmOnRecord({ ...row, isDemo: row.company.isDemo }, email)
  const atFirm = await signedInAt(firm?.id ?? null, email)
  const earlier = firm && atFirm ? await earlierApplications(row, firm.id, email) : []
  return { firm, atFirm, earlier }
}

async function prefillFor(row: Found, checklist: ChecklistItem[]) {
  const { firm, atFirm, earlier } = await whoApplies(row)
  return {
    ...applyPrefill({
      application: (row.application ?? null) as Record<string, any> | null,
      recommendedSkills: row.skills,
      firm: firm?.record ?? null,
      earlier,
      signedInAtFirm: atFirm,
      // Only an item still waiting for a file is offered a paper sent before.
      fileKeys: vendorItems(checklist).filter((i) => !NOT_A_FILE.has(i.key) && i.state === 'MISSING').map((i) => i.key),
    }),
    signedInAtFirm: atFirm,
  }
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

  // Papers this firm sent another client, sent again in one click. Only
  // for a person signed in at the firm, only from an application that
  // firm made, and the bytes are copied from the paper kept then — the
  // page never holds them. A reuse naming anything else is refused.
  const reuse: { requestId: string; key: string }[] = Array.isArray(body?.reuse)
    ? body.reuse.filter((r: any) => typeof r?.requestId === 'string' && typeof r?.key === 'string').map((r: any) => ({ requestId: r.requestId, key: r.key }))
    : []
  if (reuse.length) {
    const { atFirm, earlier } = await whoApplies(row)
    if (!atFirm) {
      return NextResponse.json({ error: { code: 'SIGN_IN', message: `Sign in as ${row.name} to send papers you sent another client. Or pick the files again.` } }, { status: 403 })
    }
    for (const r of reuse) {
      const from = earlier.find((e) => e.requestId === r.requestId)?.docs.find((d) => d.key === r.key && d.fileUrl)
      const paperId = paperIdOf(from?.fileUrl)
      // The paper must be the one kept for that request's item, nothing else.
      const kept = paperId
        ? await prisma.docFile.findFirst({
            where: { docInstanceId: paperId, docInstance: { subjectType: 'SUPPLIER_REQUEST_ITEM', subjectId: `${r.requestId}:${r.key}` } },
            select: { fileName: true, contentType: true, bytes: true },
          })
        : null
      if (!from || !kept) {
        return NextResponse.json({ error: { code: 'NOT_YOURS', message: `That paper is not one ${row.name} sent before. Pick the file again.` } }, { status: 422 })
      }
      if (docs.some((d) => d.key === r.key)) continue
      // The dates it typed for the first client travel with the paper, unless typed again now.
      const typed = (body?.dates ?? {})[r.key] ?? {}
      docs.push({
        key: r.key, fileName: kept.fileName, size: kept.bytes.byteLength, type: kept.contentType, bytes: Buffer.from(kept.bytes),
        validFrom: (typeof typed.validFrom === 'string' && typed.validFrom.trim()) || from.validFrom || null,
        validUntil: (typeof typed.validUntil === 'string' && typed.validUntil.trim()) || from.validUntil || null,
      })
    }
  }

  // ── A bank changed on the link takes back the client's check of it ──
  //
  // Finance checked the bank the firm sent, not whatever it sends next.
  // So a different bank, account name or last four (bankChange in
  // lib/money/remit-change) reopens the walk's bank item for Finance and
  // clears the check this client's Finance wrote on the firm's own
  // payment details; a resend of the same bank changes nothing.
  const priorBank = ((row.application ?? {}) as Record<string, any>).bank ?? null
  const change = bank?.bankName && bank.accountName && bank.last4.length === 4
    ? bankChange(
        priorBank ? { bankName: priorBank.bankName, accountName: priorBank.accountName, accountLast4: priorBank.last4 } : null,
        { bankName: bank.bankName, accountName: bank.accountName, accountLast4: bank.last4 }
      )
    : { cleared: false as const }
  const heldBefore = (row.checklist as unknown as ChecklistItem[]).find((i) => i.key === 'BANK')?.state === 'HELD'
  const reopened = change.cleared
    ? (row.checklist as unknown as ChecklistItem[]).map((i) => (i.key === 'BANK' && i.state === 'HELD' ? { ...i, state: 'PROVIDED' as const, note: null } : i))
    : (row.checklist as unknown as ChecklistItem[])
  const firmId = row.supplierCompanyId ?? row.firmCompanyId ?? null
  const ordered = withOrderedItems(reopened, await orderedOfSuppliers(row.companyId), row.company.name)
  const labelOf = new Map(ordered.map((i) => [i.key, i.label]))
  const provided: { key: string; fileName?: string | null; fileUrl?: string | null; validFrom?: string | null; validUntil?: string | null }[] = []
  for (const d of docs) {
    const fileUrl = await keepSupplierPaper(row.companyId, row.id, d.key, labelOf.get(d.key) ?? d.key, { name: d.fileName, type: d.type, bytes: d.bytes! })
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
  // Dates typed for a certificate already on file (no new file this time)
  // still reach the item, so HR confirms what the firm gave and never
  // re-types it (second onboarding walk, 2026-10-27).
  const typedDates = body?.dates && typeof body.dates === 'object' ? body.dates as Record<string, { validFrom?: unknown; validUntil?: unknown }> : {}
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ? v.trim().slice(0, 10) : null)
  const checklist = provideItems(ordered, provided, now).map((i) => {
    const t = typedDates[i.key]
    if (!t || i.by !== 'VENDOR' || i.state === 'HELD' || i.state === 'WAIVED') return i
    return { ...i, validFrom: day(t.validFrom) ?? i.validFrom ?? null, validUntil: day(t.validUntil) ?? i.validUntil ?? null }
  })
  const [, uncheck] = await prisma.$transaction([
    prisma.supplierRequest.update({
      where: { id: row.id },
      data: { application: application as unknown as object, checklist: checklist as unknown as object, state: 'IN_REVIEW', skills: skills.length ? skills : row.skills },
    }),
    ...(change.cleared && firmId
      ? [prisma.remitTo.updateMany({ where: { companyId: firmId, verifiedByCompanyId: row.companyId }, data: change.data })]
      : []),
  ])
  const bankSays = change.cleared && (heldBefore || (uncheck?.count ?? 0) > 0) ? change.says : null

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
      says: [
        still.length
          ? `${sentSays(row.company.name)} ${row.company.name} still needs: ${still.join('; ')}. Come back to this link when you have them.`
          : sentSays(row.company.name),
        bankSays,
      ].filter(Boolean).join(' '),
      bankCheckCleared: !!bankSays,
    },
  }, { status: 201 })
}
