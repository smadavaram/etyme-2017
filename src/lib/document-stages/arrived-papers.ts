/**
 * Where a paper a worker sent has landed, and who owes it a look.
 *
 * The founder's tester on production, 2026-11-08 (CLAUDE.md, item 1):
 * Noor Rahman sent her I-9 and her right to work from her own page and
 * no seat could check them. These are the reads and the two writes that
 * keep a paper that arrived in front of the people whose work it is:
 *
 *   - the arrival answers the request at the same firm that asked for
 *     that paper about her, so Document requests counts it as waiting;
 *   - the examination closes that request item the same way, so the
 *     request does not go on asking for a paper already accepted;
 *   - each paper on a placement gets its door (`paperDoorsForLine`),
 *     read from the line, the employer on the chain and what arrived;
 *   - a firm's examiners read how many papers wait on them;
 *   - a client reads a paper its order asks for that arrived at its
 *     supplier as "arrived at <supplier>, being examined", and never
 *     examines a supplier's worker's I-9 itself.
 *
 * The rules are `lib/document-stages/paper-doors`; this reads and writes.
 */
import { prisma } from '@/lib/db'
import { BUILT_IN } from '@/lib/document-type'
import { typeKeyForTemplate, waitsToBeExamined, KEPT_BY_HOLDER } from '@/lib/document-request'
import { examineNeedsOf } from '@/lib/document-stages/examine-form'
import { paperExaminersAt } from '@/lib/notify/paper-examiners'
import { employedPairs, employerOfRecord, employmentOf } from '@/app/api/compliance/verifications/record'
import { itemFollowsPaper } from '@/app/api/packets/examination'
import { logBulkAccess } from '@/lib/access-log'
import { startPapers } from '@/app/api/contracts/[id]/activate/papers'
import { paperDoorsFor, type ArrivedPaper, type DoorCaller, type DoorLine, type DoorPaper, type PaperDoors } from './paper-doors'
import { mayNameSubVendors, namesForClient, type SeenName } from '@/lib/chain-names'
import { endClientFilter } from '@/lib/resolve-end-client'
import { EMPLOYER_COMPLETES } from '@/lib/document-stages/employer'
import { hasPermission } from '@/lib/permissions'

/** The address a paper's file is read at: what a request item points at once the paper answers it. */
export const paperFileUrl = (docId: string) => `/api/documents/${docId}/file`

type Names = { key: string; label: string }[]
const builtInNames: Names = BUILT_IN.map((t) => ({ key: t.key, label: t.label }))

/** The type a paper's name reads back to, never guessed. */
export function keyOfPaper(templateName: string, names: Names = []): string | null {
  return typeKeyForTemplate(templateName, [...names, ...builtInNames], { guess: false })
}

/** About this person, whichever way the paper hangs off her. */
const aboutPerson = (personId: string) => ({
  OR: [
    { subjectType: 'PERSON', subjectId: personId },
    { sellContract: { personId } },
    { buyContract: { candidates: { some: { personId, state: 'ACTIVE' } } } },
  ],
})

/**
 * The papers about this person that arrived and nobody has examined, at
 * the firms given (every firm, where none are), each with its type.
 */
export async function arrivedAbout(input: {
  personId: string
  personName: string
  firmIds?: string[]
  names?: Names
}, db: typeof prisma = prisma): Promise<(ArrivedPaper & { key: string })[]> {
  const rows = await db.docInstance.findMany({
    where: {
      status: 'UPLOADED',
      examinedAt: null,
      ...aboutPerson(input.personId),
      ...(input.firmIds ? { template: { companyId: { in: input.firmIds } } } : {}),
    },
    select: {
      id: true, subjectType: true, fileName: true, signedAt: true,
      template: { select: { name: true, company: { select: { id: true, name: true } } } },
    },
    orderBy: [{ signedAt: { sort: 'desc', nulls: 'last' } }],
    take: 100,
  })
  const out: (ArrivedPaper & { key: string })[] = []
  for (const r of rows) {
    const key = keyOfPaper(r.template.name, input.names)
    if (!key || out.some((o) => o.key === key)) continue
    out.push({
      key,
      paperId: r.id,
      firmId: r.template.company.id,
      firmName: r.template.company.name,
      row: {
        id: r.id,
        template: { name: r.template.name },
        subject: input.personName,
        subjectType: r.subjectType,
        aboutAFirm: false,
        fileName: r.fileName,
        examineNeeds: { ...examineNeedsOf(key, false) },
      },
    })
  }
  return out
}

/**
 * One placement's line, as a door reads it, and the papers about its
 * person that arrived and nobody examined, at any firm on her lines.
 *
 * The one reader of "what arrived" for a line: the placement's doors
 * (`paperDoorsForLine`) and a client's "At your suppliers" on Document
 * requests (`arrivedAtSuppliers`) both read it, so the placement saying
 * "arrived at Halcyon Talent, being examined" and Document requests
 * saying nothing can never happen again (walk 7, 2026-11-08).
 */
export async function arrivedOnLine(input: {
  contractId: string
  names: Names
}, db: typeof prisma = prisma): Promise<{ line: DoorLine; arrived: (ArrivedPaper & { key: string })[] } | null> {
  const line = await db.sellContract.findUnique({
    where: { id: input.contractId },
    select: { id: true, personId: true, companyId: true, person: { select: { name: true } }, company: { select: { name: true } } },
  })
  if (!line) return null
  const [employer, chain] = await Promise.all([
    employerOfRecord(line.personId, line.id),
    employmentOf(line.personId),
  ])
  const firmIds = [...new Set([line.companyId, ...chain.lines.map((l) => l.companyId), ...chain.facts.map((f) => f.companyId)])]
  const arrived = await arrivedAbout({ personId: line.personId, personName: line.person.name, firmIds, names: input.names }, db)
  return {
    line: {
      contractId: line.id, personId: line.personId, personName: line.person.name,
      sellerId: line.companyId, sellerName: line.company.name,
      employer: employer ? { companyId: employer.companyId, name: employer.name, how: employer.how } : null,
    },
    arrived,
  }
}

/**
 * Every paper on one placement's checklist, with its door for this seat.
 *
 * What demand's placement page draws beside each chip, keyed by the
 * paper's type. Reads the line, who employs the person on the chain under
 * it, and what arrived about her at any firm on her lines (`arrivedOnLine`).
 */
export async function paperDoorsForLine(input: {
  contractId: string
  caller: DoorCaller
  items: { key: string; label: string; state: string; owedBy?: string | null }[]
}, db: typeof prisma = prisma): Promise<Record<string, PaperDoors>> {
  const read = await arrivedOnLine({ contractId: input.contractId, names: input.items }, db)
  if (!read) return {}
  const out: Record<string, PaperDoors> = {}
  for (const item of input.items) {
    const paper: DoorPaper = { ...item, arrived: read.arrived.find((a) => a.key === item.key) ?? null }
    out[item.key] = paperDoorsFor(read.line, paper, input.caller)
  }
  return out
}

/**
 * A paper about a person arrived at `firmId`: every open request item at
 * that firm about her for that paper reads received, pointing at the
 * paper, so Document requests counts it as waiting on the examiners and
 * opens it. Only that firm's own requests, never another firm's: what
 * arrived at CSI is not an answer to what Northbend asked.
 */
export async function itemsFollowArrival(input: {
  docId: string
  firmId: string
  personId: string
  key: string | null
  /** The paper's own name, which answers an item a firm named its own way. */
  paperName?: string | null
  fileName: string | null
  now?: Date
}, db: typeof prisma = prisma): Promise<number> {
  const which = [
    ...(input.key ? [{ key: input.key }] : []),
    ...(input.paperName ? [{ label: { equals: input.paperName, mode: 'insensitive' as const } }] : []),
  ]
  if (which.length === 0) return 0
  const open = await db.packetItem.findMany({
    where: {
      OR: which,
      state: 'PENDING',
      packet: { companyId: input.firmId, subjectPersonId: input.personId, cancelledAt: null },
    },
    select: { id: true },
  })
  if (open.length === 0) return 0
  await db.packetItem.updateMany({
    where: { id: { in: open.map((i) => i.id) } },
    data: { state: 'RECEIVED', receivedAt: input.now ?? new Date(), fileUrl: paperFileUrl(input.docId), fileName: input.fileName },
  })
  return open.length
}

/**
 * The paper was accepted or sent back: every request item it answered
 * follows it, so the request and the paper never say two things.
 */
export async function itemsFollowExamination(input: {
  docId: string
  accepted: boolean
  reviewerId: string
  note: string | null
  validUntil: Date | null
  verificationId: string | null
}, db: typeof prisma = prisma): Promise<number> {
  const items = await db.packetItem.findMany({
    where: { fileUrl: paperFileUrl(input.docId), state: 'RECEIVED' },
    select: { id: true },
  })
  for (const i of items) {
    await itemFollowsPaper({ itemId: i.id, accepted: input.accepted, reviewerId: input.reviewerId, note: input.note, validUntil: input.validUntil, verificationId: input.verificationId })
  }
  return items.length
}

/** Whether this person is one of the seats a paper arriving at the firm is told to. */
export async function examinesAt(companyId: string, personId: string): Promise<boolean> {
  return (await paperExaminersAt(companyId, null)).includes(personId)
}

// ── What waits on this seat: one count, read by Paperwork and Document requests ──
//
// Walk 7, 2026-11-08: Ingrid Sørensen's own I-9 upload read "2 papers
// arrived and are waiting on you" on Pinnacle's Paperwork and "Waiting on
// you 0" on its Document requests, because one page counted papers and
// the other counted request items, and her upload answered no request.
// Both now read `waitingOnYou`: every paper that arrived at this firm and
// nobody examined, and every request answer that came with no paper (a
// question answered in words), each once.

/** A paper at this firm, as the count reads it. */
export interface WaitingPaper {
  id: string
  status: string
  examinedAt: Date | null
  /** Its type, where its name or its request item says. */
  key: string | null
  /** The person it is about, where it is about one. */
  aboutPersonId: string | null
}

/** A request answer at this firm (a `PacketItem` RECEIVED). */
export interface WaitingItem {
  id: string
  key: string
  aboutPersonId: string | null
  /** The paper the answer is kept as, where a file came with it. */
  paperId: string | null
}

/** The paper an answer is kept as: its file lives at /api/documents/<id>/file. */
export function paperIdOfFileUrl(fileUrl: string | null): string | null {
  const m = fileUrl ? /^\/api\/documents\/([^/]+)\/file$/.exec(fileUrl) : null
  return m ? m[1] : null
}

const EMPLOYER_ONLY = new Set<string>(EMPLOYER_COMPLETES)

/**
 * The count, decided. Pure.
 *
 * Never the seat's own paper; never an I-9 or a right to work check
 * about somebody another firm employs (that firm examines it, never this
 * one); a request answer kept as a paper counts once, as the paper.
 */
export function countWaiting(input: {
  papers: WaitingPaper[]
  items: WaitingItem[]
  seatPersonId: string
  /** Whether another firm, and not this one, employs the person. */
  employedElsewhere: (personId: string) => boolean
}): { count: number; paperIds: string[]; itemIds: string[] } {
  const notOurs = (key: string | null, personId: string | null) =>
    !!key && !!personId && EMPLOYER_ONLY.has(key) && input.employedElsewhere(personId)
  const paperIds: string[] = []
  for (const p of input.papers) {
    if (!waitsToBeExamined(p)) continue
    if (p.aboutPersonId === input.seatPersonId) continue
    if (notOurs(p.key, p.aboutPersonId)) continue
    paperIds.push(p.id)
  }
  const seenPaper = new Set(input.papers.map((p) => p.id))
  const itemIds: string[] = []
  for (const i of input.items) {
    // Its paper decides: counted above if it waits, and not twice.
    if (i.paperId && seenPaper.has(i.paperId)) continue
    if (i.aboutPersonId === input.seatPersonId) continue
    if (notOurs(i.key, i.aboutPersonId)) continue
    itemIds.push(i.id)
  }
  return { count: paperIds.length + itemIds.length, paperIds, itemIds }
}

/** Whether this seat looks at the papers suppliers keep on their own record. */
export function looksAtSupplierPapers(permissions: readonly string[]): boolean {
  return ['vendors.manage', 'privacy.manage', 'governance.write'].some((p) => hasPermission(permissions, p as never))
}

/**
 * The suppliers whose own papers, kept on their record, wait for this
 * firm's look: the firms it buys from and the firms it asked, never
 * itself. The rule Paperwork lists them by.
 */
export async function keptBySuppliersOf(companyId: string, db: typeof prisma = prisma): Promise<string[]> {
  const [ties, asked] = await Promise.all([
    db.counterparty.findMany({
      where: { companyId, relationship: 'SUPPLIER', status: { not: 'BLOCKED' } },
      select: { otherCompanyId: true },
      take: 500,
    }),
    db.documentPacket.findMany({
      where: { companyId, subjectCompanyId: { not: null }, cancelledAt: null },
      select: { subjectCompanyId: true },
      take: 500,
    }),
  ])
  return [...new Set([...ties.map((t) => t.otherCompanyId), ...asked.map((a) => a.subjectCompanyId!)])].filter((id) => id !== companyId)
}

/**
 * Every paper and answer that arrived at the firm and waits on this
 * seat: none where the seat is not one a paper arriving is told to, so a
 * recruiter is never counted as owing a look. The one count Paperwork's
 * "waiting on you", Document requests' "Waiting on you" and the
 * decisions queue read.
 */
export async function waitingOnYou(input: {
  companyId: string
  personId: string
  permissions?: readonly string[]
}, db: typeof prisma = prisma): Promise<{ count: number; paperIds: string[]; itemIds: string[] }> {
  if (!(await examinesAt(input.companyId, input.personId))) return { count: 0, paperIds: [], itemIds: [] }
  const kept = input.permissions && looksAtSupplierPapers(input.permissions) ? await keptBySuppliersOf(input.companyId, db) : []
  const [docs, received] = await Promise.all([
    db.docInstance.findMany({
      where: {
        examinedAt: null,
        OR: [
          { template: { companyId: input.companyId }, status: { in: ['UPLOADED', 'SIGNED'] } },
          ...(kept.length ? [{ status: KEPT_BY_HOLDER, subjectType: 'COMPANY', subjectId: { in: kept } }] : []),
        ],
      },
      select: {
        id: true, status: true, examinedAt: true, subjectType: true, subjectId: true,
        template: { select: { name: true } },
        sellContract: { select: { personId: true } },
        buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, take: 1, select: { personId: true } } } },
      },
      take: 1000,
    }),
    db.packetItem.findMany({
      where: { state: 'RECEIVED', packet: { companyId: input.companyId, cancelledAt: null } },
      select: { id: true, key: true, fileUrl: true, packet: { select: { subjectPersonId: true } } },
      take: 1000,
    }),
  ])
  const itemById = new Map(received.map((i) => [i.id, i]))
  // A paper kept from a request item that is no longer RECEIVED still
  // needs its item's key and subject.
  const missingItems = docs.filter((d) => d.subjectType === 'PACKET_ITEM' && !itemById.has(d.subjectId)).map((d) => d.subjectId)
  const otherItems = missingItems.length
    ? await db.packetItem.findMany({ where: { id: { in: missingItems } }, select: { id: true, key: true, fileUrl: true, packet: { select: { subjectPersonId: true } } } })
    : []
  for (const i of otherItems) itemById.set(i.id, i)

  const papers: WaitingPaper[] = docs.map((d) => {
    const item = d.subjectType === 'PACKET_ITEM' ? itemById.get(d.subjectId) : undefined
    const aboutPersonId =
      d.subjectType === 'PERSON' ? d.subjectId
        : d.subjectType === 'PACKET_ITEM' ? item?.packet.subjectPersonId ?? null
          : d.subjectType === 'SELL_CONTRACT' ? d.sellContract?.personId ?? null
            : d.subjectType === 'BUY_CONTRACT' ? d.buyContract?.candidates[0]?.personId ?? null
              : null
    return { id: d.id, status: d.status, examinedAt: d.examinedAt, key: item?.key ?? keyOfPaper(d.template.name), aboutPersonId }
  })
  const items: WaitingItem[] = received.map((i) => ({ id: i.id, key: i.key, aboutPersonId: i.packet.subjectPersonId, paperId: paperIdOfFileUrl(i.fileUrl) }))

  const people = [...new Set([...papers, ...items].filter((x) => x.key && EMPLOYER_ONLY.has(x.key) && x.aboutPersonId).map((x) => x.aboutPersonId!))]
  const employed = people.length ? await employedPairs(people) : new Set<string>()
  const employedElsewhere = (personId: string) =>
    !employed.has(`${input.companyId}:${personId}`) && [...employed].some((pair) => pair.endsWith(`:${personId}`))
  return countWaiting({ papers, items, seatPersonId: input.personId, employedElsewhere })
}

/**
 * The papers that wait on this seat, as the decisions queue reads them:
 * the papers alone, each one row. Read through `waitingOnYou`, so the
 * mark and Paperwork never count two ways.
 */
export async function papersWaitingOn(input: { companyId: string; personId: string }, db: typeof prisma = prisma): Promise<{ count: number; paperIds: string[] }> {
  const w = await waitingOnYou(input, db)
  return { count: w.paperIds.length, paperIds: w.paperIds }
}

// ── At your suppliers: what a client's orders ask that arrived below it ──

/** One paper a client's order asks for, arrived at its supplier and being examined there. */
export interface AtSupplierRow {
  personId: string
  personName: string
  paper: string
  /** The firm as this client may read it: its own name, or the rung it pays. */
  firmName: string
  says: string
}

/**
 * What a client may call the firm a paper arrived at. Pure.
 *
 * The rule of `lib/chain-names` (2026-09-17): the client reads the rung
 * it pays and nothing below it, unless its agreement with that prime
 * requires disclosure. A firm the chain-names read does not know is never
 * named either: it reads as the paid supplier's supplier.
 */
export function firmAsClientReadsIt(input: {
  firmId: string
  firmName: string
  seen: Map<string, SeenName>
  /** The rung this client pays for the person. */
  paidId: string
  paidName: string
}): string {
  if (input.firmId === input.paidId) {
    const own = input.seen.get(input.paidId)
    return own && own.masked ? own.phrase : input.paidName
  }
  const s = input.seen.get(input.firmId)
  if (s) return s.masked ? s.phrase : s.name
  const paid = input.seen.get(input.paidId)
  const paidPhrase = paid && paid.masked ? paid.phrase : input.paidName
  return `${paidPhrase}’s supplier`
}

/**
 * The papers a client's orders ask of the people on its lines that have
 * arrived at a supplier on their chain and not yet been examined. Read on
 * the client's Document requests through the placement's own reader
 * (`arrivedOnLine`), so "waiting on you 0" is never the whole answer
 * while a supplier holds a paper the client's start needs, and the two
 * pages can never disagree. Every paper the set asks, whoever owes it:
 * an I-9 is the employer's, not the worker's, and walk 7 found it missing
 * here for that reason alone. Never a door: the client does not examine
 * a supplier's worker's paper. Every person named is a read, logged.
 */
export async function arrivedAtSuppliers(input: {
  clientCompanyId: string
  actorPersonId: string
}, db: typeof prisma = prisma): Promise<AtSupplierRow[]> {
  const client = input.clientCompanyId
  const all = await db.sellContract.findMany({
    where: {
      state: { notIn: ['ENDED', 'CANCELLED'] },
      OR: [{ clientCompanyId: client }, { endClientCompanyId: client }],
      companyId: { not: client },
    },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true, endDate: true,
      person: { select: { name: true } }, company: { select: { name: true } },
      clientCompany: { select: { name: true } }, requirement: { select: { title: true } },
    },
    orderBy: { id: 'asc' },
    take: 200,
  })
  if (all.length === 0) return []
  // Only people a paper arrived about and nobody examined: one read, so
  // the start's checklist is worked out only where there is something to say.
  const waiting = await db.docInstance.findMany({
    where: {
      status: 'UPLOADED', examinedAt: null,
      OR: [...new Set(all.map((l) => l.personId))].map((personId) => aboutPerson(personId)),
    },
    select: { subjectType: true, subjectId: true, sellContract: { select: { personId: true } }, buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, select: { personId: true } } } } },
    take: 1000,
  })
  const withArrivals = new Set<string>()
  for (const d of waiting) {
    if (d.subjectType === 'PERSON') withArrivals.add(d.subjectId)
    if (d.sellContract) withArrivals.add(d.sellContract.personId)
    for (const c of d.buyContract?.candidates ?? []) withArrivals.add(c.personId)
  }
  // One line per person: the rung this client pays, where there is one.
  const byPerson = new Map<string, (typeof all)[number]>()
  for (const l of all) {
    if (!withArrivals.has(l.personId)) continue
    const had = byPerson.get(l.personId)
    if (!had || (l.clientCompanyId === client && had.clientCompanyId !== client)) byPerson.set(l.personId, l)
  }
  const lines = [...byPerson.values()].slice(0, 50)
  if (lines.length === 0) return []
  const terms = await db.masterAgreement.findMany({ where: { clientId: client }, select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true } })
  const out: AtSupplierRow[] = []
  for (const l of lines) {
    // The placement's own checklist: the start's verdict, read the way the
    // placement page and the Activate button read it, so an I-9 the
    // employer completes is asked here exactly as it is there.
    const checklist = await startPapers({
      id: l.id, personId: l.personId, companyId: l.companyId, endDate: l.endDate,
      person: { name: l.person.name }, clientCompany: { name: l.clientCompany?.name ?? '' }, requirement: l.requirement,
    })
    const asked = checklist.items
    if (asked.length === 0) continue
    const read = await arrivedOnLine({ contractId: l.id, names: asked.map((i) => ({ key: i.key, label: i.label })) }, db)
    const arrived = (read?.arrived ?? []).filter((a) => a.firmId !== client && asked.some((i) => i.key === a.key))
    if (arrived.length === 0) continue
    const rungs = await db.sellContract.findMany({
      where: { ...endClientFilter(client), personId: l.personId },
      select: { id: true, personId: true, companyId: true, clientCompanyId: true, company: { select: { name: true } } },
    })
    const seen = namesForClient(
      rungs.map((r) => ({ id: r.id, personId: r.personId, companyId: r.companyId, companyName: r.company.name, clientCompanyId: r.clientCompanyId })),
      client,
      (prime) => mayNameSubVendors(terms, client, prime),
    )
    for (const a of arrived) {
      const item = asked.find((i) => i.key === a.key)!
      if (out.some((o) => o.personId === l.personId && o.paper === item.label)) continue
      const firmName = firmAsClientReadsIt({ firmId: a.firmId, firmName: a.firmName, seen, paidId: l.companyId, paidName: l.company.name })
      out.push({ personId: l.personId, personName: l.person.name, paper: item.label, firmName, says: `${l.person.name}’s ${item.label}: arrived at ${firmName}, being examined.` })
    }
  }
  if (out.length > 0) {
    logBulkAccess([...new Set(out.map((o) => o.personId))], {
      actorPersonId: input.actorPersonId,
      actorCompanyId: client,
      action: 'COMPLIANCE_CHECK',
      reason: 'Document requests: papers this client’s orders ask for, arrived at the supplier',
    })
  }
  return out
}
