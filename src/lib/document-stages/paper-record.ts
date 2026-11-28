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
  sellContractId: true, buyContractId: true, subjectType: true, subjectId: true, examinedAt: true,
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
  /** Who looked at it, and when. Read only where a reader asks for what was examined. */
  examinedAt?: Date | null
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

// ── One answer for a person, across every line the firms share ─────────
//
// The fourth screen walk (2026-11-03, R1): Rosa Delgado's product
// confidentiality undertaking, accepted on Paperwork, read on file on her
// placement and "Not on file" in a fresh W-2 request. The paper is
// Brightmoor's; the type it answers, PRODUCT_CONFIDENTIALITY, is
// Northbend's, named on Northbend's order. The placement reads a paper
// back to its type through the dictionary of both firms on the line; the
// request read only the asking firm's, so the name matched nothing and
// the paper answered nothing. The backfill read the same way (R1b), and
// the worker's own page never read the firm's papers at all (R3).
//
// So which lines, which firms and which names are read is said here once
// (`linesOfPerson`, `heldOnRecord`), and the request builder, the
// backfill and the worker's page read through it, the way the placement
// does: per line, the papers against it, about the person and about
// either firm on it, typed by both firms' names for their papers.

/** One line a person is on, and the two firms on it: the one paid and the one paying. */
export interface PersonLine {
  sellContractId?: string | null
  buyContractId?: string | null
  /** The supplier and the customer on the line, as the placement reads them. */
  firms: string[]
}

type LineReadDb = Pick<typeof prisma, 'sellContract' | 'buyContract'>

/**
 * The lines a person is on, with the firms on each. Where a firm is named,
 * only the lines that firm is a party to, from either end; where `live`,
 * only lines still running.
 */
export async function linesOfPerson(
  personId: string | null,
  opts: { firm?: string | null; live?: boolean } = {},
  db: LineReadDb = prisma
): Promise<PersonLine[]> {
  if (!personId) return []
  const live = opts.live ? { state: { notIn: ['ENDED', 'CANCELLED'] as never[] } } : {}
  const [sells, buys] = await Promise.all([
    db.sellContract.findMany({
      where: {
        personId, ...live,
        ...(opts.firm ? { OR: [{ companyId: opts.firm }, { clientCompanyId: opts.firm }] } : {}),
      },
      select: { id: true, companyId: true, clientCompanyId: true },
      orderBy: { id: 'asc' },
      take: 50,
    }),
    db.buyContract.findMany({
      where: {
        ...live,
        candidates: { some: { personId, ...(opts.live ? { state: 'ACTIVE' } : {}) } },
        ...(opts.firm ? { OR: [{ companyId: opts.firm }, { vendorCompanyId: opts.firm }] } : {}),
      },
      select: { id: true, companyId: true, vendorCompanyId: true },
      orderBy: { id: 'asc' },
      take: 50,
    }),
  ])
  return [
    ...sells.map((l) => ({ sellContractId: l.id, firms: [l.companyId, l.clientCompanyId].filter((v): v is string => !!v) })),
    ...buys.map((l) => ({ buyContractId: l.id, firms: [l.vendorCompanyId ?? l.companyId, l.companyId].filter((v, i, a): v is string => !!v && a.indexOf(v) === i) })),
  ]
}

/** A firm's own name for one of its papers. */
export interface FirmType { companyId: string | null; key: string; label: string }

/**
 * What is held for a person, read the way the placement reads it: per
 * line, the papers on it typed by the names of both firms on that line,
 * and, beside the lines, the papers about the person and the asking firms
 * typed by those firms' names. `examinedOnly` leaves out a file that
 * arrived and nobody looked at, for the person's own page, which says
 * "sent, waiting" of it. Pure.
 */
export function heldAcross(
  record: PapersOnRecord,
  types: FirmType[],
  at: { personId: string | null; firms: string[]; lines: PersonLine[]; examinedOnly?: boolean }
): HeldDocument[] {
  const r: PapersOnRecord = at.examinedOnly
    ? { ...record, papers: record.papers.filter((p) => !(p.status === 'UPLOADED' && !p.examinedAt)) }
    : record
  const typesOf = (firms: string[]) => {
    const set = new Set(firms)
    return types.filter((t) => !!t.companyId && set.has(t.companyId)).map((t) => ({ key: t.key, label: t.label }))
  }
  return [
    ...heldAbout(r, { personId: at.personId, companyIds: at.firms, types: typesOf(at.firms) }),
    ...at.lines.flatMap((l) =>
      heldAbout(r, {
        personId: at.personId, companyIds: l.firms, types: typesOf(l.firms),
        ...(l.sellContractId ? { sellContractId: l.sellContractId } : { buyContractId: l.buyContractId ?? null }),
      })
    ),
  ]
}

type HeldReadDb = Pick<typeof prisma, 'packetItem' | 'docInstance' | 'documentType'>

/** Read and answer `heldAcross` for a person and the firms asking, in three reads. */
export async function heldOnRecord(
  at: { personId: string | null; firms: string[]; lines: PersonLine[]; examinedOnly?: boolean },
  db: HeldReadDb = prisma
): Promise<HeldDocument[]> {
  const allFirms = [...new Set([...at.firms, ...at.lines.flatMap((l) => l.firms)].filter(Boolean))]
  const [record, types] = await Promise.all([
    papersOnRecord({
      personIds: at.personId ? [at.personId] : [], companyIds: allFirms,
      sellContractIds: at.lines.map((l) => l.sellContractId).filter((v): v is string => !!v),
      buyContractIds: at.lines.map((l) => l.buyContractId).filter((v): v is string => !!v),
    }, db as never),
    allFirms.length
      ? db.documentType.findMany({ where: { companyId: { in: allFirms } }, select: { companyId: true, key: true, label: true }, orderBy: { id: 'asc' } }).catch(() => [])
      : Promise.resolve([]),
  ])
  return heldAcross(record, types as FirmType[], at)
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
