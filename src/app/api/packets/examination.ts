import { prisma } from '@/lib/db'
import { logAccess, recordRefusal, accessActor } from '@/lib/access-log'
import {
  RECORDABLE_ABOUT_A_FIRM,
  checkToRecord,
  examinedFromAPacket,
  mayRecordCheck,
  orderedNotCollected,
  recordLabel,
  withArticle,
  type ExaminedEvidence,
} from '@/lib/attestation'
import { buysFrom as buysOn } from '@/lib/document-stages/firm-papers'
import { writeCheck } from '@/app/api/compliance/verifications/record'

/**
 * What a firm's look at a paper that arrived puts on the record: one
 * module for every door a paper is accepted through, Paperwork and
 * Document requests (`POST /api/documents/:id/examine`) and the request's
 * own review (`POST /api/packets/:id/review`).
 *
 * Found by the Tapin walk, 2026-10-29: insurance Brightmoor accepted on
 * its Paperwork screen never reached Tapin's standing, because the paper
 * was kept as the request's and read as about nobody, and the review
 * recorded checks about people only. So the award refused Tapin every
 * time. A supplier's certificate is now recorded by `recordSupplierPaper`
 * and nothing else, whichever door accepted it, into the `Verification`
 * row the award, the start check and the nightly watch all read.
 */

type Buyer = {
  companyId: string
  companyName: string
  personId: string
  personName: string
  holds: (permission: string) => boolean
}

/** Whether the client buys from the supplier, read from every tie the two can have. */
export async function clientBuysFrom(buyerId: string, supplierId: string): Promise<boolean> {
  const [invited, submitted, line, register, asked] = await Promise.all([
    prisma.requirementInvitation.findFirst({ where: { fromCompanyId: buyerId, toCompanyId: supplierId }, select: { id: true } }),
    prisma.submission.findFirst({ where: { fromCompanyId: supplierId, toCompanyId: buyerId }, select: { id: true } }),
    prisma.sellContract.findFirst({
      where: { companyId: supplierId, OR: [{ clientCompanyId: buyerId }, { endClientCompanyId: buyerId }] },
      select: { id: true },
    }),
    prisma.counterparty.findFirst({
      where: { companyId: buyerId, otherCompanyId: supplierId, relationship: 'SUPPLIER', status: { not: 'BLOCKED' } },
      select: { id: true },
    }),
    prisma.documentPacket.findFirst({
      where: { companyId: buyerId, subjectCompanyId: supplierId, cancelledAt: null },
      select: { id: true },
    }),
  ])
  return buysOn({
    invited: !!invited, submitted: !!submitted, onALine: !!line,
    onRegisterAsSupplier: !!register, askedForItsPapers: !!asked,
  })
}

/**
 * A supplier's certificate of insurance or good standing, examined by a
 * client, onto the supplier's standing. The one writer.
 *
 * Returns the row it became; or a sentence saying why it is not on the
 * standing (the paper itself is still accepted); or a refusal where what
 * was given is wrong and nothing should change.
 */
export async function recordSupplierPaper(input: {
  buyer: Buyer
  supplier: { id: string; name: string }
  key: string
  issuer: string | null
  reference: string | null
  validFrom: Date | null
  expiresAt: Date | null
  now: Date
}): Promise<Examined> {
  const { buyer, supplier, key, now } = input
  const buys = await clientBuysFrom(buyer.companyId, supplier.id)
  const may = mayRecordCheck({
    about: 'FIRM', side: buys ? 'BUYER' : null, type: key,
    holds: buyer.holds,
    callerFirm: buyer.companyName, subjectName: supplier.name, employerName: supplier.name, buyerName: buyer.companyName,
  })
  if (!may.ok) return { says: `It is not recorded on ${supplier.name}’s standing: ${may.message}` }
  const check = checkToRecord(
    {
      about: 'FIRM', type: key, subjectName: supplier.name, recordedBy: buyer.personName,
      issuer: input.issuer, reference: input.reference,
      validFrom: input.validFrom, expiresAt: input.expiresAt,
    },
    now
  )
  if (!check.ok) return { refused: { status: 422, code: check.code, message: check.message, field: check.field } }
  const written = await writeCheck({
    row: check.row, subject: { companyId: supplier.id }, personId: null,
    recordedById: buyer.personId, recordingCompanyId: buyer.companyId, now,
  })
  return { verificationId: written.id, says: check.says }
}

// ── The examination, recorded through the one rule ───────────────────

/** The fields a recorded check takes, beyond the date a packet already asks for. */
export const EXAMINATION_FIELDS = ['formEdition', 'evidence', 'issuer', 'licenseNumber', 'licenseState', 'issuedOn', 'validFrom', 'reference', 'expiresAt'] as const

export interface Examined {
  /** The recorded check the item became. */
  verificationId?: string
  /** What the answer adds, in a sentence. */
  says?: string
  /** Nothing changes, and why. */
  refused?: { status: number; code: string; message: string; field?: string }
}

export async function examinationOf(input: {
  packet: { id: string; subjectPersonId: string | null; subjectCompanyId?: string | null }
  item: { id: string; key: string; label: string }
  body: Record<string, unknown>
  validUntil: Date | null
  now: Date
  caller: {
    companyId: string
    companyName: string
    personId: string
    personName: string
    holds: (permission: string) => boolean
    actor: ReturnType<typeof accessActor>
  }
}): Promise<Examined | null> {
  const { packet, item, body, caller, now } = input
  // A supplier set is about the firm: its certificates go on its standing,
  // through the same writer as every other door (the Tapin walk, 2026-10-29).
  if (packet.subjectCompanyId) {
    if (!(RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(item.key)) return null
    const supplier = await prisma.company.findUnique({ where: { id: packet.subjectCompanyId }, select: { id: true, name: true } })
    if (!supplier) return null
    const str = (k: string): string | null => (typeof body[k] === 'string' && (body[k] as string).trim() ? (body[k] as string).trim() : null)
    const day = (k: string): Date | null | 'BAD' => {
      const v = body[k]
      if (v == null || v === '') return null
      const d = new Date(String(v))
      return Number.isNaN(d.getTime()) ? 'BAD' : d
    }
    const validFrom = day('validFrom')
    const expiresAt = day('expiresAt')
    if (validFrom === 'BAD') return { refused: { status: 422, code: 'VALIDATION', message: 'Give the day it starts as a date, like 2026-11-01.', field: 'validFrom' } }
    if (expiresAt === 'BAD') return { refused: { status: 422, code: 'VALIDATION', message: 'Give the day it runs out as a date, like 2027-10-31.', field: 'expiresAt' } }
    return recordSupplierPaper({
      buyer: caller,
      supplier,
      key: item.key,
      issuer: str('issuer'),
      reference: str('reference'),
      validFrom,
      expiresAt: expiresAt ?? input.validUntil,
      now,
    })
  }
  const personId = packet.subjectPersonId
  if (!personId) return null

  if (orderedNotCollected(item.key)) {
    return {
      says:
        `The ${recordLabel(item.key)} itself counts toward the start once the screening company’s report is recorded; ` +
        `a file sent here is not their report.`,
    }
  }
  if (!examinedFromAPacket(item.key)) return null

  const given = EXAMINATION_FIELDS.some((f) => {
    const v = body[f]
    return Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''
  })
  const refuse = (status: number, code: string, message: string, field?: string): Examined | { says: string } =>
    given ? { refused: { status, code, message, field } } : { says: `It does not count toward the start yet. ${message}` }

  const [person, line] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, select: { name: true } }),
    // The placement this firm employs or places the person on, newest
    // first. A firm with none is not the employer, and records nothing.
    prisma.sellContract.findFirst({
      where: {
        companyId: caller.companyId,
        personId,
        state: { notIn: ['CANCELLED'] },
        ...(typeof body.contractId === 'string' && body.contractId ? { id: body.contractId } : {}),
      },
      orderBy: { startDate: 'desc' },
      select: { id: true, clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } } },
    }),
  ])
  const subjectName = person?.name ?? 'this person'
  const buyerName = line ? (line.endClientCompany?.name ?? line.clientCompany.name) : 'the client'

  const may = mayRecordCheck({
    about: 'PERSON',
    side: line ? 'EMPLOYER' : null,
    holds: caller.holds,
    callerFirm: caller.companyName,
    subjectName,
    employerName: line ? caller.companyName : 'the firm that employs or places them',
    buyerName,
    type: item.key,
  })
  if (!may.ok) {
    if (given) {
      await recordRefusal([personId], {
        ...caller.actor,
        action: 'COMPLIANCE_CHECK',
        reason: `Refused recording ${withArticle(recordLabel(item.key))} from a document request: not this seat’s or this firm’s to record`,
      })
    }
    return refuse(403, may.code, may.message)
  }

  // ── Dates and evidence, as the paper prints them ──
  const dateOf = (v: unknown): Date | null | 'BAD' => {
    if (v == null || v === '') return null
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? 'BAD' : d
  }
  const dates: Record<string, Date | null> = {}
  for (const [f, words] of [['issuedOn', 'the day it was issued'], ['validFrom', 'the day it starts'], ['expiresAt', 'the day it runs out']] as const) {
    const d = dateOf(body[f])
    if (d === 'BAD') return { refused: { status: 422, code: 'VALIDATION', message: `Give ${words} as a date, like 2027-06-30.`, field: f } }
    dates[f] = d
  }
  const evidence: ExaminedEvidence[] = []
  if (Array.isArray(body.evidence)) {
    for (const e of body.evidence as Record<string, unknown>[]) {
      const at = e?.expiresAt ? new Date(String(e.expiresAt)) : null
      if (at && Number.isNaN(at.getTime())) {
        return { refused: { status: 422, code: 'VALIDATION', message: 'Give each document’s expiry as a date, like 2031-04-30.', field: 'evidence' } }
      }
      evidence.push({
        type: String(e?.type ?? '').toUpperCase(),
        issuer: typeof e?.issuer === 'string' ? e.issuer : null,
        reference: typeof e?.reference === 'string' ? e.reference : null,
        expiresAt: at,
      })
    }
  }
  const str = (k: string): string | null => (typeof body[k] === 'string' ? (body[k] as string) : null)

  const verdict = checkToRecord(
    {
      about: 'PERSON', type: item.key, subjectName, recordedBy: caller.personName,
      issuer: str('issuer'), issuedOn: dates.issuedOn, validFrom: dates.validFrom,
      // The packet's own date is the paper's expiry where nothing else names one.
      expiresAt: dates.expiresAt ?? input.validUntil,
      formEdition: str('formEdition'), evidence, reference: str('reference'),
      licenseNumber: str('licenseNumber'), licenseState: str('licenseState'),
    },
    now
  )
  if (!verdict.ok) return refuse(422, verdict.code, verdict.message, verdict.field)

  const written = await writeCheck({
    row: verdict.row,
    subject: { personId },
    personId,
    recordedById: caller.personId,
    recordingCompanyId: caller.companyId,
    now,
  })
  logAccess({
    subjectId: personId,
    ...caller.actor,
    action: 'COMPLIANCE_CHECK',
    reason: `Recorded ${withArticle(recordLabel(item.key))} from a document request, for the placement at ${buyerName}`,
  })
  return {
    verificationId: written.id,
    says: `${verdict.says} It counts toward the start.`,
  }
}

/** The seats at a client that look at a supplier's papers: procurement and the compliance officer. */
const LOOKS_AT_SUPPLIER_PAPERS = ['vendors.manage', 'privacy.manage', 'governance.write']

/**
 * Whether a client's seat may open and examine a paper a supplier filed
 * on its own record (Company paperwork), before anybody asked for it.
 *
 * The paper is the supplier's; the look is the buyer's, the same as a
 * paper that came back on a request. A firm that does not buy from the
 * supplier reads nothing of it.
 */
export async function buyerMayExamineKept(
  caller: { companyId: string | null; isConsultantSeat: boolean; holds: (permission: string) => boolean },
  doc: { status: string; subjectType: string; subjectId: string }
): Promise<boolean> {
  if (doc.status !== 'KEPT' || doc.subjectType !== 'COMPANY') return false
  if (!caller.companyId || caller.companyId === doc.subjectId || caller.isConsultantSeat) return false
  if (!LOOKS_AT_SUPPLIER_PAPERS.some(caller.holds)) return false
  return clientBuysFrom(caller.companyId, doc.subjectId)
}

/**
 * Keep a request item and the paper kept from it saying the same thing,
 * whichever of the two a firm accepted or sent back.
 */
export async function itemFollowsPaper(input: {
  itemId: string
  accepted: boolean
  reviewerId: string
  note: string | null
  validUntil: Date | null
  verificationId: string | null
}): Promise<void> {
  const item = await prisma.packetItem.update({
    where: { id: input.itemId },
    data: {
      state: input.accepted ? 'ACCEPTED' : 'REJECTED',
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      reviewNote: input.note,
      ...(input.accepted ? { validUntil: input.validUntil } : { fileUrl: null, receivedAt: null }),
      ...(input.verificationId ? { verificationId: input.verificationId } : {}),
    },
    select: { packetId: true },
  })
  // Sending one back reopens a request that had closed.
  if (!input.accepted) await prisma.documentPacket.update({ where: { id: item.packetId }, data: { completedAt: null } })
}

export async function paperFollowsItem(input: {
  itemId: string
  accepted: boolean
  reviewerId: string
  validUntil: Date | null
}): Promise<void> {
  const paper = await prisma.docInstance.findFirst({ where: { subjectType: 'PACKET_ITEM', subjectId: input.itemId }, select: { id: true } })
  if (!paper) return
  const now = new Date()
  if (input.accepted) {
    await prisma.docInstance.update({
      where: { id: paper.id },
      data: { examinedById: input.reviewerId, examinedAt: now, ...(input.validUntil ? { expiresAt: input.validUntil } : {}) },
    })
  } else {
    await prisma.$transaction([
      prisma.docInstance.update({
        where: { id: paper.id },
        data: { status: 'SENT', sentAt: now, signedAt: null, fileName: null, signedFileUrl: null, examinedById: null, examinedAt: null },
      }),
      prisma.docFile.deleteMany({ where: { docInstanceId: paper.id } }),
    ])
  }
}
