/**
 * What the card owners read and write: the draft each accepted email
 * became, the card drawn for it, the decision on it, and a file filed as
 * evidence.
 *
 * Every read is scoped to the company at the query, never only on a
 * screen: an email belongs to the company whose address it reached, and
 * nobody at another company can name it. The body is deliberately not on
 * the draft. Whoever shows it to a person reads it from the row and logs
 * that read as another person's data.
 */
import { prisma } from '@/lib/db'
import type { IntakeDraft, IntakeFields, IntakeKind } from './sort'

function asFields(v: unknown): IntakeFields {
  const f = (v && typeof v === 'object' ? v : {}) as Partial<IntakeFields>
  return {
    senderCompanyId: f.senderCompanyId ?? null,
    senderRelationship: f.senderRelationship ?? null,
    orderNumbers: Array.isArray(f.orderNumbers) ? f.orderNumbers : [],
    billNumbers: Array.isArray(f.billNumbers) ? f.billNumbers : [],
    receiptNumbers: Array.isArray(f.receiptNumbers) ? f.receiptNumbers : [],
    periodStart: f.periodStart ?? null,
    periodEnd: f.periodEnd ?? null,
    hours: f.hours ?? null,
    amountCents: f.amountCents ?? null,
    currency: f.currency ?? null,
  }
}

const SELECT = {
  id: true, companyId: true, kind: true, receivedAt: true, forwarderPersonId: true, forwarderAddress: true,
  originalSender: true, fields: true, sortReasons: true,
  attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, filedAt: true }, orderBy: { createdAt: 'asc' as const } },
} as const

type Row = { id: string; companyId: string | null; kind: string | null; receivedAt: Date; forwarderPersonId: string | null; forwarderAddress: string | null; originalSender: string | null; fields: unknown; sortReasons: string[]; attachments: { id: string; fileName: string; contentType: string; sizeBytes: number; filedAt: Date | null }[] }

function toDraft(r: Row): IntakeDraft {
  return {
    inboundEmailId: r.id,
    companyId: r.companyId!,
    kind: (r.kind ?? 'UNSORTED') as IntakeKind,
    receivedAt: r.receivedAt,
    forwarderPersonId: r.forwarderPersonId!,
    forwarderAddress: r.forwarderAddress!,
    originalSender: r.originalSender,
    fields: asFields(r.fields),
    reasons: r.sortReasons,
    attachments: r.attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes, filed: a.filedAt !== null })),
  }
}

/** One accepted email's draft, at this company only. Null for anything else, including another company's. */
export async function intakeDraft(inboundEmailId: string, companyId: string): Promise<IntakeDraft | null> {
  const r = await prisma.inboundEmail.findFirst({
    where: { id: inboundEmailId, companyId, verdict: 'ACCEPTED', deletedAt: null },
    select: SELECT,
  })
  return r ? toDraft(r as Row) : null
}

/** The company's accepted emails nobody has decided yet, newest first. */
export async function undecidedDrafts(companyId: string, take = 50): Promise<IntakeDraft[]> {
  const rows = await prisma.inboundEmail.findMany({
    where: { companyId, verdict: 'ACCEPTED', deletedAt: null, decidedAt: null },
    select: SELECT,
    orderBy: { receivedAt: 'desc' },
    take,
  })
  return rows.map((r) => toDraft(r as Row))
}

/** Record the card an email became. */
export async function recordIntakeCard(inboundEmailId: string, companyId: string, cardRef: string): Promise<boolean> {
  const out = await prisma.inboundEmail.updateMany({
    where: { id: inboundEmailId, companyId, verdict: 'ACCEPTED', deletedAt: null },
    data: { cardRef },
  })
  return out.count === 1
}

/** A person decided the card. The body goes on the next nightly run. */
export async function markIntakeDecided(inboundEmailId: string, companyId: string, decidedById: string, at = new Date()): Promise<boolean> {
  const out = await prisma.inboundEmail.updateMany({
    where: { id: inboundEmailId, companyId, verdict: 'ACCEPTED', decidedAt: null },
    data: { decidedAt: at, decidedById },
  })
  return out.count === 1
}

/** A file filed as evidence somewhere ("DocFile:<id>"), so it outlives the body. */
export async function fileIntakeAttachment(attachmentId: string, companyId: string, filedAs: string, filedById: string): Promise<boolean> {
  const out = await prisma.inboundEmailAttachment.updateMany({
    where: { id: attachmentId, filedAt: null, inboundEmail: { companyId, verdict: 'ACCEPTED' } },
    data: { filedAt: new Date(), filedAs, filedById },
  })
  return out.count === 1
}
