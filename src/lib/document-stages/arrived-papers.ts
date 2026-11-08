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
import { typeKeyForTemplate } from '@/lib/document-request'
import { examineNeedsOf } from '@/lib/document-stages/examine-form'
import { paperExaminersAt } from '@/lib/notify/paper-examiners'
import { employerOfRecord, employmentOf } from '@/app/api/compliance/verifications/record'
import { itemFollowsPaper } from '@/app/api/packets/examination'
import { logBulkAccess } from '@/lib/access-log'
import { requirementsWhereWorkIsDoneForSellLines } from '@/lib/document-stages/where-work-is-done'
import { arrivalReads, paperDoorsFor, type ArrivedPaper, type DoorCaller, type DoorPaper, type PaperDoors } from './paper-doors'

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
 * Every paper on one placement's checklist, with its door for this seat.
 *
 * What demand's placement page draws beside each chip, keyed by the
 * paper's type. Reads the line, who employs the person on the chain under
 * it, and what arrived about her at any firm on her lines.
 */
export async function paperDoorsForLine(input: {
  contractId: string
  caller: DoorCaller
  items: { key: string; label: string; state: string; owedBy?: string | null }[]
}, db: typeof prisma = prisma): Promise<Record<string, PaperDoors>> {
  const line = await db.sellContract.findUnique({
    where: { id: input.contractId },
    select: { id: true, personId: true, companyId: true, person: { select: { name: true } }, company: { select: { name: true } } },
  })
  if (!line) return {}
  const [employer, chain] = await Promise.all([
    employerOfRecord(line.personId, line.id),
    employmentOf(line.personId),
  ])
  const firmIds = [...new Set([line.companyId, ...chain.lines.map((l) => l.companyId), ...chain.facts.map((f) => f.companyId)])]
  const arrived = await arrivedAbout({ personId: line.personId, personName: line.person.name, firmIds, names: input.items }, db)
  const doorLine = {
    contractId: line.id, personId: line.personId, personName: line.person.name,
    sellerId: line.companyId, sellerName: line.company.name,
    employer: employer ? { companyId: employer.companyId, name: employer.name, how: employer.how } : null,
  }
  const out: Record<string, PaperDoors> = {}
  for (const item of input.items) {
    const paper: DoorPaper = { ...item, arrived: arrived.find((a) => a.key === item.key) ?? null }
    out[item.key] = paperDoorsFor(doorLine, paper, input.caller)
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

/**
 * How many papers arrived at the firm and wait on this seat: none where
 * the seat is not one a paper arriving is told to, so a recruiter is
 * never counted as owing a look. What demand's decisions queue may fold
 * in beside its own rows.
 */
export async function papersWaitingOn(input: { companyId: string; personId: string }, db: typeof prisma = prisma): Promise<{ count: number; paperIds: string[] }> {
  if (!(await examinesAt(input.companyId, input.personId))) return { count: 0, paperIds: [] }
  const rows = await db.docInstance.findMany({
    where: {
      template: { companyId: input.companyId },
      status: 'UPLOADED',
      examinedAt: null,
      NOT: { subjectType: 'PERSON', subjectId: input.personId },
    },
    select: { id: true },
    take: 500,
  })
  return { count: rows.length, paperIds: rows.map((r) => r.id) }
}

/** One paper a client's order asks for, arrived at its supplier and being examined there. */
export interface AtSupplierRow {
  personId: string
  personName: string
  paper: string
  firmName: string
  says: string
}

/**
 * The papers a client's orders ask of the people on its lines that have
 * arrived at their supplier and not yet been examined. Read on the
 * client's Document requests, so "waiting on you 0" is never the whole
 * answer while a supplier holds a paper the client's start needs. Never
 * a door: the client does not examine a supplier's worker's paper. Every
 * person named is a read, logged.
 */
export async function arrivedAtSuppliers(input: {
  clientCompanyId: string
  actorPersonId: string
}, db: typeof prisma = prisma): Promise<AtSupplierRow[]> {
  const lines = await db.sellContract.findMany({
    where: {
      state: { notIn: ['ENDED', 'CANCELLED'] },
      OR: [{ clientCompanyId: input.clientCompanyId }, { endClientCompanyId: input.clientCompanyId }],
      companyId: { not: input.clientCompanyId },
    },
    select: { id: true, personId: true, companyId: true, person: { select: { name: true } } },
    take: 50,
  })
  if (lines.length === 0) return []
  const sets = await requirementsWhereWorkIsDoneForSellLines(lines.map((l) => l.id), db)
  const out: AtSupplierRow[] = []
  for (const l of lines) {
    const set = sets.get(l.id)
    if (!set) continue
    const asked = set.items.filter((i) => !i.waived && i.owedBy === 'WORKER')
    if (asked.length === 0) continue
    const arrived = await arrivedAbout({ personId: l.personId, personName: l.person.name, names: asked.map((i) => ({ key: i.key, label: i.label })) }, db)
    for (const a of arrived) {
      if (a.firmId === input.clientCompanyId) continue
      const item = asked.find((i) => i.key === a.key)
      if (!item) continue
      if (out.some((o) => o.personId === l.personId && o.paper === item.label)) continue
      const read = arrivalReads({ readerCompanyId: input.clientCompanyId, holderCompanyId: a.firmId, holderName: a.firmName, key: a.key })
      out.push({ personId: l.personId, personName: l.person.name, paper: item.label, firmName: a.firmName, says: `${l.person.name}’s ${item.label}: ${read.says ?? 'arrived'}` })
    }
  }
  if (out.length > 0) {
    logBulkAccess([...new Set(out.map((o) => o.personId))], {
      actorPersonId: input.actorPersonId,
      actorCompanyId: input.clientCompanyId,
      action: 'COMPLIANCE_CHECK',
      reason: 'Document requests: papers this client’s orders ask for, arrived at the supplier',
    })
  }
  return out
}
