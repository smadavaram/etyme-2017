/**
 * One truth for every paper accepted through a document request.
 *
 * The founder's tester, on production 2026-11-03: Brightmoor accepted
 * Rajesh Iyer's background check, drug screen, NDA and confidentiality
 * undertaking on Paperwork ("Requests 6, on file through Nov 1, 2027"),
 * and the placement still read all four as "needed / Not on file" while a
 * fresh W-2 request refused with "everything is already on file and
 * current". Two readers, two truths: the request counted an accepted item
 * as held whatever it was, and the start read only the record behind it.
 *
 * The rule now, in two halves, read by both:
 *
 *   **A paper whose standing is a recorded check** (an I-9, a passport, a
 *   license, a screening company's report, a supplier's certificate)
 *   stands only on that record. Accepting it writes the record through
 *   the one writer for its kind (`examinationOf`, `recordSupplierPaper`
 *   in app/api/packets/examination); an item accepted with no record
 *   behind it is not held anywhere, because a file a worker sent is not
 *   a screening company's verdict.
 *
 *   **A paper whose standing is the paper itself** (an NDA, a
 *   confidentiality undertaking, a company's own induction form) is held
 *   from the request's own acceptance, by the firm that asked, for the
 *   person it asked. The start reads those through `acceptedRequestPapers`,
 *   the same rows the request reads.
 */
import { prisma } from '@/lib/db'
import { RECORDABLE_ABOUT_A_FIRM, RECORDABLE_ABOUT_A_PERSON } from '@/lib/attestation'
import type { HeldDocument } from '@/lib/packets'
import { heldFromDocInstances } from '@/lib/document-request'

/** Papers whose standing is a recorded check, never the request's acceptance on its own. */
export const RECORDED_AS_A_CHECK: readonly string[] = [...RECORDABLE_ABOUT_A_PERSON, ...RECORDABLE_ABOUT_A_FIRM]

/** Whether accepting a paper of this kind stands on a recorded check rather than on the paper. Pure. */
export function standsOnACheck(key: string): boolean {
  return RECORDED_AS_A_CHECK.includes(key.toUpperCase())
}

/**
 * Whether an accepted request item is held, on its own reading.
 *
 * A paper that stands on a check is held only where the item points at
 * the check it became; the check itself is read from `Verification` by
 * every reader, so this answers "the item says nothing on its own". Any
 * other paper is held from the acceptance. Pure.
 */
export function acceptedItemStands(item: { key: string; state: string; verificationId?: string | null }): boolean {
  if (item.state !== 'ACCEPTED') return false
  return !standsOnACheck(item.key)
}

/** An accepted request item, as the readers need it. */
export interface AcceptedRequestItem {
  key: string
  state: string
  validUntil: Date | null
  verificationId?: string | null
}

/** Accepted request items, as documents held. Only the ones that stand on the paper. Pure. */
export function heldFromAcceptedItems(items: AcceptedRequestItem[]): HeldDocument[] {
  return items
    .filter((i) => acceptedItemStands(i))
    // A request item records the life of the document, not its start:
    // there is no floor to read, and claiming one would invent a date.
    .map((i) => ({ key: i.key, validFrom: null, expiresAt: i.validUntil ?? null, accepted: true }))
}

/** One accepted paper about a person, from a request the firm made. */
export interface AcceptedRequestPaper extends AcceptedRequestItem {
  personId: string
  /** The firm that asked, and accepted it. */
  companyId: string
}

type Db = Pick<typeof prisma, 'packetItem'>

/**
 * The papers firms asked these people for and accepted, which stand on
 * the paper itself. Read once for many people, so the start, the
 * compliance page and the request read the same rows.
 *
 * Only the firms named: an NDA Brightmoor accepted stands on Brightmoor's
 * lines, never on another employer's.
 */
export async function acceptedRequestPapers(
  personIds: string[],
  companyIds: string[],
  db: Db = prisma
): Promise<AcceptedRequestPaper[]> {
  const people = [...new Set(personIds.filter(Boolean))]
  const firms = [...new Set(companyIds.filter(Boolean))]
  if (people.length === 0 || firms.length === 0) return []
  const rows = await db.packetItem.findMany({
    where: {
      state: 'ACCEPTED',
      key: { notIn: [...RECORDED_AS_A_CHECK] },
      packet: { subjectPersonId: { in: people }, companyId: { in: firms }, cancelledAt: null },
    },
    select: { key: true, state: true, validUntil: true, verificationId: true, packet: { select: { subjectPersonId: true, companyId: true } } },
    orderBy: { id: 'asc' },
  })
  return rows.map((r) => ({
    key: r.key, state: r.state, validUntil: r.validUntil, verificationId: r.verificationId,
    personId: r.packet.subjectPersonId!, companyId: r.packet.companyId,
  }))
}

// ── One reader of what is on file, for a person and a line ─────────────
//
// The release walk on f2f342723 (2026-11-03): an undertaking accepted on
// Paperwork read "on file" on Omar Haddad's placement, and a fresh W-2
// request asked for it again, Compliance listed it as owed, and the older
// requests from Nov 1 stayed at "0 of 4". The placement read the papers
// signed or sent against the line, about the person and about either
// firm; the request read verifications and accepted items only; the
// Compliance page read the line's own papers only. Three readers, three
// truths about one worker.
//
// So what counts as a paper on file is said here once: which papers are
// read (`paperInstancesWhere`), and how they become documents held
// (`heldAbout`). The placement, the request builder, the Compliance page
// and the backfill all read through it.

/** The statuses of a paper that is on file: signed, or a file that arrived. */
export const PAPER_ON_FILE: readonly string[] = ['SIGNED', 'UPLOADED']

export interface PaperScope {
  sellContractIds?: string[]
  buyContractIds?: string[]
  /** The people the papers are about. */
  personIds?: string[]
  /** The firms the papers are about (a supplier's NDA with its client). */
  companyIds?: string[]
}

/** The `DocInstance` filter for every paper on file in this scope. Pure. */
export function paperInstancesWhere(scope: PaperScope) {
  const sells = [...new Set((scope.sellContractIds ?? []).filter(Boolean))]
  const buys = [...new Set((scope.buyContractIds ?? []).filter(Boolean))]
  const people = [...new Set((scope.personIds ?? []).filter(Boolean))]
  const firms = [...new Set((scope.companyIds ?? []).filter(Boolean))]
  const or: Record<string, unknown>[] = [
    ...(sells.length ? [{ sellContractId: { in: sells } }] : []),
    ...(buys.length ? [{ buyContractId: { in: buys } }] : []),
    ...(people.length ? [{ subjectType: 'PERSON', subjectId: { in: people } }] : []),
    ...(firms.length ? [{ subjectType: 'COMPANY', subjectId: { in: firms } }] : []),
  ]
  return { status: { in: [...PAPER_ON_FILE] }, OR: or.length ? or : [{ id: '__none__' }] }
}

/** What each reader selects of a paper on file. */
export const PAPER_ON_FILE_SELECT = {
  id: true, status: true, validFrom: true, expiresAt: true, signedAt: true, countersignedAt: true,
  sellContractId: true, buyContractId: true, subjectType: true, subjectId: true,
  template: { select: { name: true, needsSignature: true } },
} as const

export interface PaperOnFile {
  id: string
  status: string
  validFrom: Date | null
  expiresAt: Date | null
  signedAt: Date | null
  countersignedAt: Date | null
  sellContractId: string | null
  buyContractId: string | null
  subjectType: string
  subjectId: string
  template: { name: string; needsSignature: boolean }
}

/** Everything on file in a scope, in two reads: the papers, and what requests accepted. */
export interface PapersOnRecord {
  papers: PaperOnFile[]
  accepted: AcceptedRequestPaper[]
}

type RecordDb = Pick<typeof prisma, 'packetItem' | 'docInstance'>

/** Read what is on file for these people, firms and lines, once. */
export async function papersOnRecord(
  scope: PaperScope & { personIds: string[]; companyIds: string[] },
  db: RecordDb = prisma
): Promise<PapersOnRecord> {
  const [papers, accepted] = await Promise.all([
    db.docInstance.findMany({ where: paperInstancesWhere(scope) as never, select: PAPER_ON_FILE_SELECT, orderBy: { id: 'asc' } }),
    acceptedRequestPapers(scope.personIds, scope.companyIds, db as never),
  ])
  return { papers: papers as unknown as PaperOnFile[], accepted }
}

/**
 * The documents held for one person on one line, from what was read: the
 * papers against the line, about the person, about either firm, and what
 * the firms on the line asked the person for and accepted. Pure.
 */
export function heldAbout(
  record: PapersOnRecord,
  at: {
    personId: string | null
    /** The firms on the line: an NDA Brightmoor accepted stands on Brightmoor's lines only. */
    companyIds: string[]
    sellContractId?: string | null
    buyContractId?: string | null
    /** The firms' own names for their papers, so a paper of theirs is read back to its type. */
    types?: { key: string; label: string }[]
  }
): HeldDocument[] {
  const firms = new Set(at.companyIds.filter(Boolean))
  const papers = record.papers.filter((d) =>
    (!!at.sellContractId && d.sellContractId === at.sellContractId) ||
    (!!at.buyContractId && d.buyContractId === at.buyContractId) ||
    (!!at.personId && d.subjectType === 'PERSON' && d.subjectId === at.personId) ||
    (d.subjectType === 'COMPANY' && firms.has(d.subjectId))
  )
  return [
    ...heldFromDocInstances(papers, at.types ?? []),
    ...heldFromAcceptedItems(record.accepted.filter((r) => !!at.personId && r.personId === at.personId && firms.has(r.companyId))),
  ]
}

// ── The person's authorization for a check, read off the record ────────
//
// The release walk, R2: a drug screen's verdict said "No signed
// authorization from Omar Haddad is named for it" an hour after his drug
// screening authorization was accepted on Paperwork. The Accept on a
// request never looked. A screening company's check needs the person's
// signed authorization first, so the one the record holds is named.

const AUTHORIZATION = /authori[sz]ation|consent|disclosure/i
const CHECK_WORDS: Record<string, RegExp> = {
  BACKGROUND_CHECK: /background/i,
  DRUG_SCREENING: /drug/i,
  EDUCATION_EVALUATION: /education|degree/i,
}

/** Whether a paper of this name is the person's authorization for this check. Pure. */
export function isAuthorizationFor(key: string, templateName: string): boolean {
  const words = CHECK_WORDS[key.toUpperCase()]
  return !!words && AUTHORIZATION.test(templateName) && words.test(templateName)
}

/**
 * The day the person signed or sent their authorization for this check,
 * where it is on the record: a paper about them, signed, or a file that
 * arrived and was accepted. Null where none is.
 */
export async function authorizationOnRecord(
  personId: string,
  key: string,
  db: Pick<typeof prisma, 'docInstance' | 'packetItem'> = prisma
): Promise<Date | null> {
  if (!CHECK_WORDS[key.toUpperCase()]) return null
  const items = await db.packetItem.findMany({
    where: { packet: { subjectPersonId: personId, cancelledAt: null } },
    select: { id: true },
  })
  const papers = await db.docInstance.findMany({
    where: {
      OR: [
        { subjectType: 'PERSON', subjectId: personId },
        ...(items.length ? [{ subjectType: 'PACKET_ITEM', subjectId: { in: items.map((i) => i.id) } }] : []),
      ],
      status: { in: [...PAPER_ON_FILE] },
    },
    select: { status: true, signedAt: true, examinedAt: true, template: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })
  let on: Date | null = null
  for (const p of papers) {
    if (!isAuthorizationFor(key, p.template.name)) continue
    // A file that arrived is the person's authorization once somebody looked at it.
    if (p.status === 'UPLOADED' && !p.examinedAt) continue
    const day = p.signedAt ?? p.examinedAt
    if (day && (!on || day > on)) on = day
  }
  return on
}
