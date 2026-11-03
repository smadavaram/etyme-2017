import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify, notifyBulk } from '@/lib/notify'
import { emit } from '@/lib/events'
import { logAccess, recordAccess, recordRefusal, accessActor } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import { hasPermission } from '@/lib/permissions'
import { mayExamine, standingOn, typeKeyForTemplate } from '@/lib/document-request'
import { BUILT_IN, typeByKey } from '@/lib/document-type'
import { RECORDABLE_ABOUT_A_FIRM, examinedFromAPacket, orderedNotCollected, reportRunsOutOn } from '@/lib/attestation'
import { paperSubject } from '@/lib/document-stages/firm-papers'
import { COMPLETED_FROM_SHOWN } from '@/lib/document-stages/examine-form'
import { answerOpenAsks, buyerMayExamineKept, examinationBody, examinationOf, itemFollowsPaper, recordSupplierPaper, type Door } from '@/app/api/packets/examination'

/**
 * POST /api/documents/:id/examine
 *
 *   { verdict: 'ACCEPT', validFrom?, expiresAt?, edition?, issuer?, reference? }
 *   { verdict: 'SEND_BACK', reason }
 *
 * The firm that asked for a paper looks at what arrived. The rule is
 * `mayExamine` in lib/document-request; this loads the facts, writes the
 * examination on the paper, and tells whoever sent it.
 *
 * Accepted: the dates and the edition printed on it go on the paper, and
 * a paper both sides sign is countersigned for the firm that asked. A
 * supplier's certificate of insurance or of good standing, examined by
 * a firm that buys from it, also becomes the recorded check the start
 * reads (`checkToRecord`, `writeCheck` — the same writer as Record a
 * check), so the supplier's standing and the paper cannot disagree.
 *
 * A paper kept from a document request is about the request's subject
 * (a supplier for a supplier set), and the request's item follows the
 * verdict, so Paperwork, Document requests and the supplier's standing
 * read one answer (the Tapin walk, 2026-10-29: Brightmoor accepted
 * Tapin's insurance here and the award still refused, because the paper
 * read as about nobody). A paper a supplier filed on its own record is
 * examined the same way by a client that buys from it.
 *
 * Sent back: the paper is asked for again with the reason on it, the
 * file that was refused is not kept as an answer, and the sender is told
 * why. Every look at a person's paper writes an access log row, the
 * refusals before they are sent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const doc = await prisma.docInstance.findUnique({
    where: { id },
    select: {
      id: true, status: true, subjectType: true, subjectId: true, note: true,
      template: { select: { name: true, needsSignature: true, company: { select: { id: true, name: true } } } },
      sellContract: { select: { personId: true } },
      buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, select: { personId: true }, take: 1 } } },
      file: { select: { id: true } },
    },
  })
  if (!doc) return refuse(404, 'NOT_FOUND', 'That document is not here.')

  // A request item's answer: the item, and whom the request is about.
  const item = doc.subjectType === 'PACKET_ITEM'
    ? await prisma.packetItem.findUnique({
        where: { id: doc.subjectId },
        select: { id: true, key: true, label: true, packet: { select: { id: true, subjectCompanyId: true, subjectPersonId: true } } },
      })
    : null
  const about = paperSubject({
    subjectType: doc.subjectType,
    subjectId: doc.subjectId,
    packet: item?.packet ?? null,
    contractPersonId:
      doc.subjectType === 'SELL_CONTRACT'
        ? doc.sellContract?.personId ?? null
        : doc.subjectType === 'BUY_CONTRACT'
          ? doc.buyContract?.candidates[0]?.personId ?? null
          : null,
  })
  const subjectPersonId = about.kind === 'PERSON' ? about.personId : null
  const subjectCompanyId = about.kind === 'FIRM' ? about.companyId : null
  const holds = (p: string) => hasPermission(caller.permissions ?? [], p as never)

  // A paper the supplier filed itself, opened by a client that buys from it.
  const keptForBuyer = await buyerMayExamineKept(
    { companyId: caller.company?.id ?? null, isConsultantSeat: caller.context.type === 'CONSULTANT', holds },
    { status: doc.status, subjectType: doc.subjectType, subjectId: doc.subjectId }
  )
  const issuer = keptForBuyer && caller.company ? { id: caller.company.id, name: caller.company.name } : doc.template.company
  const atSubjectCompany = subjectCompanyId !== null && caller.company?.id === subjectCompanyId

  // Whose hands it is in: the same rule as opening the file. Examining a
  // paper is reading it, and reading it is the paperwork team's work.
  const standing = keptForBuyer ? { ok: true as const, staffOfIssuer: true } : standingOn('open', { templateName: doc.template.name, subjectPersonId }, {
    personId: caller.person.id,
    atIssuer: caller.company?.id === issuer.id && caller.context.type !== 'CONSULTANT',
    atSubjectCompany,
    permissions: caller.permissions ?? [],
    companyName: caller.company?.name ?? null,
  })
  if (!standing.ok) {
    // The person's or the firm's: a company's paper is the company's
    // data, written with the company as the subject (2026-11-02).
    const refusedOf = subjectPersonId && caller.person.id !== subjectPersonId
      ? { personId: subjectPersonId }
      : subjectCompanyId && caller.company?.id !== subjectCompanyId
        ? { companyId: subjectCompanyId }
        : null
    if (refusedOf) {
      await recordRefusal([refusedOf], {
        ...accessActor(caller),
        action: 'COMPLIANCE_CHECK',
        reason: `Refused examining ${doc.template.name}: the seat does not work this firm’s paperwork`,
      })
    }
    return refuse(standing.status, standing.code, standing.message)
  }

  const [person, company] = await Promise.all([
    subjectPersonId ? prisma.person.findUnique({ where: { id: subjectPersonId }, select: { name: true } }) : null,
    subjectCompanyId ? prisma.company.findUnique({ where: { id: subjectCompanyId }, select: { id: true, name: true } }) : null,
  ])
  const senderName = person?.name ?? company?.name ?? 'the firm that sent it'
  // A request item names its type; any other paper is read off its name.
  const key = item?.key ?? typeKeyForTemplate(doc.template.name, BUILT_IN.map((t) => ({ key: t.key, label: t.label })), { guess: false })
  const spec = key ? typeByKey(key) : null

  const dateOf = (field: string): Date | null | 'BAD' => {
    const v = body[field]
    if (v == null || v === '') return null
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? 'BAD' : d
  }
  const validFrom = dateOf('validFrom')
  let expiresAt = dateOf('expiresAt')
  if (validFrom === 'BAD') return refuse(422, 'VALIDATION', 'Give the day it starts as a date, like 2026-11-01.', 'validFrom')
  if (expiresAt === 'BAD') return refuse(422, 'VALIDATION', 'Give the day it runs out as a date, like 2027-10-31.', 'expiresAt')
  // A screening company's report about a person prints the day it
  // reported, not an end: it counts for its months from that day, the
  // same count the record makes (2026-11-03).
  const renderedOn = dateOf('renderedOn')
  if (renderedOn === 'BAD') return refuse(422, 'VALIDATION', 'Give the day they reported as a date, like 2026-10-28.', 'renderedOn')
  if (!expiresAt && renderedOn && subjectPersonId && key && orderedNotCollected(key)) expiresAt = reportRunsOutOn(key, renderedOn)

  const now = new Date()
  const verdict = mayExamine(
    {
      // A paper its holder kept is on file, as far as the buyer looking at it is concerned.
      status: keptForBuyer ? 'UPLOADED' : doc.status,
      templateName: doc.template.name,
      needsSignature: doc.template.needsSignature,
      issuerName: issuer.name,
      senderName,
      type: spec ? { key: spec.key, label: spec.label, validityShape: spec.validityShape, signedBy: spec.signedBy, reissued: spec.reissued } : null,
    },
    {
      staffOfIssuer: standing.staffOfIssuer,
      isSender: caller.person.id === subjectPersonId || atSubjectCompany,
      examinerName: caller.person.name,
    },
    {
      verdict: String(body.verdict ?? '').toUpperCase(),
      reason: typeof body.reason === 'string' ? body.reason : null,
      validFrom, expiresAt,
      edition: typeof body.edition === 'string' ? body.edition : null,
    },
    now
  )
  if (!verdict.ok) {
    return refuse(verdict.code === 'NOT_YOURS' ? 403 : verdict.code === 'NOTHING_ARRIVED' ? 409 : 422, verdict.code, verdict.message, verdict.field)
  }

  // ── What the look puts on the record ──
  // One writer for a supplier's certificate, whichever door accepted it
  // (`recordSupplierPaper`), and the request's own reading for an item.
  let verificationId: string | null = null
  let checkSays: string | null = null
  // Where it can be recorded, where this look could not record it.
  let door: Door | null = null
  if (verdict.verdict === 'ACCEPT' && caller.company) {
    const buyer = {
      companyId: caller.company.id, companyName: caller.company.name,
      personId: caller.person.id, personName: caller.person.name, holds,
      actor: accessActor(caller),
    }
    const str = (k: string): string | null => (typeof body[k] === 'string' && (body[k] as string).trim() ? (body[k] as string).trim() : null)
    // An I-9 records its examination whichever way it arrived: as a
    // request's item, or as a paper the employer asked for on Paperwork.
    // Until 2026-11-02 only the first did, so an I-9 accepted on Paperwork
    // cleared nothing and the start stayed held.
    const asItem = item ?? (subjectPersonId && key && COMPLETED_FROM_SHOWN.includes(key) && examinedFromAPacket(key)
      ? { id: doc.id, key, label: doc.template.name, packet: { id: doc.id, subjectPersonId, subjectCompanyId: null } }
      : null)
    const examined = asItem
      ? await examinationOf({
          packet: asItem.packet, item: asItem,
          body: examinationBody(body),
          validUntil: verdict.expiresAt, now, caller: buyer,
        })
      : company && key && (RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(key)
        ? await recordSupplierPaper({
            buyer, supplier: company, key,
            issuer: str('issuer'), reference: str('reference'),
            validFrom: verdict.validFrom, expiresAt: verdict.expiresAt, now,
          })
        : null
    if (examined?.refused) return refuse(examined.refused.status, examined.refused.code, examined.refused.message, examined.refused.field, examined.refused.door)
    verificationId = examined?.verificationId ?? null
    checkSays = examined?.says ?? null
    door = examined?.door ?? null
  }

  const note = [doc.note, verdict.note].filter(Boolean).join('\n').slice(-2000)
  await prisma.$transaction(async (tx) => {
    if (verdict.verdict === 'ACCEPT') {
      await tx.docInstance.update({
        where: { id },
        data: {
          note,
          // Who looked at it and when: the paper reads as examined from this, not from a note.
          examinedById: caller.person.id, examinedAt: now,
          ...(verdict.validFrom ? { validFrom: verdict.validFrom } : {}),
          ...(verdict.expiresAt ? { expiresAt: verdict.expiresAt } : {}),
          ...(verdict.edition ? { edition: verdict.edition } : {}),
          ...(verdict.countersign ? { countersignedAt: now, countersignedById: caller.person.id } : {}),
        },
      })
    } else if (keptForBuyer) {
      // The supplier's own copy stays on its record with the reason on it,
      // and the supplier is told to file a current one. Not stamped as
      // examined: on every screen, the examiner's and the holder's, an
      // examination on a paper reads as accepted (the second Tapin walk,
      // 2026-10-30, where one stamp meant two things).
      await tx.docInstance.update({ where: { id }, data: { note } })
    } else {
      // A paper sent back is not held. The refused file goes with it, the
      // same as a packet item sent back, so nothing reads it as an answer.
      await tx.docInstance.update({
        where: { id },
        data: {
          status: 'SENT', sentAt: now, note,
          signedAt: null, signedById: null, signedFileUrl: null, fileName: null,
          countersignedAt: null, countersignedById: null,
          examinedById: null, examinedAt: null,
        },
      })
      if (doc.file) await tx.docFile.delete({ where: { docInstanceId: id } })
    }
  })
  // A supplier's own copy accepted answers this buyer's open asks for the
  // same paper, so the request stops asking (the second Tapin walk).
  if (keptForBuyer && verdict.verdict === 'ACCEPT' && caller.company && subjectCompanyId && key) {
    await answerOpenAsks({
      buyerId: caller.company.id, supplierId: subjectCompanyId, key,
      verificationId, reviewerId: caller.person.id, validUntil: verdict.expiresAt, now,
    })
  }
  if (item) {
    await itemFollowsPaper({
      itemId: item.id,
      accepted: verdict.verdict === 'ACCEPT',
      reviewerId: caller.person.id,
      note: verdict.verdict === 'ACCEPT' ? null : verdict.note,
      validUntil: verdict.expiresAt,
      verificationId,
    })
  }

  if (subjectPersonId) {
    logAccess({
      subjectId: subjectPersonId,
      ...accessActor(caller),
      action: 'COMPLIANCE_CHECK',
      reason: `${verdict.verdict === 'ACCEPT' ? 'Examined' : 'Sent back'} ${doc.template.name} for ${issuer.name}`,
    })
  } else if (subjectCompanyId && caller.company?.id !== subjectCompanyId) {
    // A firm's paper looked at by another firm is a read of that firm's
    // data, and it was never logged (2026-11-02). Written with the firm as
    // its subject; the examination has already been written, so a row
    // that cannot be written is reported rather than undoing it.
    try {
      await recordAccess([{ companyId: subjectCompanyId }], {
        ...accessActor(caller),
        action: 'COMPLIANCE_CHECK',
        reason: `${verdict.verdict === 'ACCEPT' ? 'Examined' : 'Sent back'} ${doc.template.name} for ${issuer.name}`,
      })
    } catch (err) {
      await reportError('access-log', err, { personId: caller.person.id, companyId: caller.company?.id })
    }
  }
  void emit({
    type: 'verification.recorded',
    companyId: issuer.id,
    subjectType: 'DocInstance',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: { action: verdict.verdict === 'ACCEPT' ? 'examined' : 'sent_back', typeKey: key, verificationId, note: verdict.note },
  })

  // The sender hears either way: a paper accepted is one they need not
  // chase, and a paper sent back is one they must answer again.
  const title = verdict.verdict === 'ACCEPT'
    ? `${issuer.name} accepted ${doc.template.name}`
    : `${issuer.name} sent back ${doc.template.name}`
  const noticeBody = verdict.verdict === 'ACCEPT' ? verdict.says : `${verdict.note}. Send the right one from your paperwork page.`
  if (subjectPersonId) {
    void notify({ personId: subjectPersonId, companyId: issuer.id, type: 'SYSTEM', title, body: noticeBody, entityId: id })
  } else if (subjectCompanyId) {
    const staff = await prisma.context.findMany({
      where: { companyId: subjectCompanyId, revokedAt: null, NOT: { roleId: null }, type: { not: 'CONSULTANT' } },
      select: { personId: true },
      take: 10,
    })
    void notifyBulk(staff.map((s) => ({ personId: s.personId, companyId: subjectCompanyId, type: 'SYSTEM' as const, title, body: noticeBody, entityId: id })))
  }

  return NextResponse.json({
    data: {
      id,
      verdict: verdict.verdict,
      status: verdict.next,
      countersigned: verdict.countersign,
      verificationId,
      says: checkSays ? `${verdict.says} ${checkSays}` : verdict.says,
      ...(door ? { door } : {}),
    },
  })
}

function refuse(status: number, code: string, message: string, field?: string, door?: Door | null) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}), ...(door ? { door } : {}) } }, { status })
}
