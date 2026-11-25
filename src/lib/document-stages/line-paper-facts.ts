/**
 * What was asked, what arrived and who examined it, for each paper on a
 * contract line (record 117, step 2).
 *
 * These are facts about events, read from the rows a request and an
 * upload already leave: `PacketItem`, `DocInstance` and, for a screening
 * company's report, the `Verification` the firm recorded. They sit BESIDE
 * the checklist item's state and never decide it. The state is
 * `contractClearance`'s alone; nothing here says a paper stands, and
 * nothing here judges a person.
 *
 * A screening verdict is a third party's word. It is carried exactly as
 * it was recorded, with the provider's name, reference and date, and where
 * nobody has recorded a word the word is null.
 */
import { prisma } from '@/lib/db'
import { VerificationType } from '@prisma/client'
import { orderedNotCollected } from '@/lib/attestation'
import { keyOfPaper } from '@/lib/document-stages/arrived-papers'
import { employmentOf } from '@/app/api/compliance/verifications/record'

/** A request item and the request it sits in. */
export interface ItemRow {
  key: string
  /** PENDING · RECEIVED · ACCEPTED · REJECTED */
  state: string
  receivedAt: Date | null
  fileName: string | null
  reviewedAt: Date | null
  reviewerName: string | null
  packetCreatedAt: Date
  firmId: string
  firmName: string
}

/** A paper kept for the person, by its type. */
export interface DocRow {
  key: string
  /** PENDING · SENT · SIGNED · UPLOADED */
  status: string
  sentAt: Date | null
  signedAt: Date | null
  fileName: string | null
  examinedAt: Date | null
  examinerName: string | null
  firmId: string
  firmName: string
}

/** The recorded result of a check a screening company rendered. */
export interface CheckRow {
  status: string
  providerSays: string | null
  provider: string | null
  reference: string | null
  date: Date | null
}

export interface PaperFacts {
  asked: { when: Date; via: 'REQUEST' | 'PAPER'; firmId: string; firmName: string } | null
  received: { when: Date; fileName: string | null; firmId: string; firmName: string } | null
  examined: { state: 'NOT_EXAMINED' | 'ACCEPTED' | 'SENT_BACK'; by: string | null; when: Date | null; firmId: string; firmName: string } | null
  verdict: { word: string | null; provider: string | null; reference: string | null; date: Date | null } | null
}

export const NO_FACTS: PaperFacts = { asked: null, received: null, examined: null, verdict: null }

const ARRIVED_ITEM = ['RECEIVED', 'ACCEPTED', 'REJECTED']

/** One paper's facts, from the rows read for it. Pure. */
export function paperFactsOf(key: string, rows: { items: ItemRow[]; docs: DocRow[]; check: CheckRow | null }): PaperFacts {
  const items = rows.items.filter((i) => i.key === key)
  const docs = rows.docs.filter((d) => d.key === key)

  // Asked: the latest ask, by a request link or on the paper.
  const asks: NonNullable<PaperFacts['asked']>[] = [
    ...items.map((i) => ({ when: i.packetCreatedAt, via: 'REQUEST' as const, firmId: i.firmId, firmName: i.firmName })),
    ...docs.filter((d) => d.sentAt).map((d) => ({ when: d.sentAt as Date, via: 'PAPER' as const, firmId: d.firmId, firmName: d.firmName })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime())
  const asked = asks[0] ?? null

  // Received and examined: the latest arrival, and what became of that one.
  type Arrival = { when: Date; fileName: string | null; firmId: string; firmName: string; examined: PaperFacts['examined'] }
  const arrivals: Arrival[] = []
  for (const i of items) {
    if (!ARRIVED_ITEM.includes(i.state) || !i.receivedAt) continue
    const state = i.state === 'ACCEPTED' ? 'ACCEPTED' : i.state === 'REJECTED' ? 'SENT_BACK' : 'NOT_EXAMINED'
    arrivals.push({
      when: i.receivedAt, fileName: i.fileName, firmId: i.firmId, firmName: i.firmName,
      examined: { state, by: state === 'NOT_EXAMINED' ? null : i.reviewerName, when: state === 'NOT_EXAMINED' ? null : i.reviewedAt, firmId: i.firmId, firmName: i.firmName },
    })
  }
  for (const d of docs) {
    if (!d.signedAt) continue
    if (d.status === 'UPLOADED') {
      arrivals.push({
        when: d.signedAt, fileName: d.fileName, firmId: d.firmId, firmName: d.firmName,
        examined: d.examinedAt
          ? { state: 'ACCEPTED', by: d.examinerName, when: d.examinedAt, firmId: d.firmId, firmName: d.firmName }
          : { state: 'NOT_EXAMINED', by: null, when: null, firmId: d.firmId, firmName: d.firmName },
      })
    } else if (d.status === 'SIGNED') {
      // A signature is not an examination: nothing is claimed about one.
      arrivals.push({ when: d.signedAt, fileName: d.fileName, firmId: d.firmId, firmName: d.firmName, examined: null })
    }
  }
  arrivals.sort((a, b) => b.when.getTime() - a.when.getTime())
  const last = arrivals[0] ?? null

  const verdict = orderedNotCollected(key) && rows.check
    ? { word: rows.check.providerSays, provider: rows.check.provider, reference: rows.check.reference, date: rows.check.date }
    : null

  return {
    asked,
    received: last ? { when: last.when, fileName: last.fileName, firmId: last.firmId, firmName: last.firmName } : null,
    examined: last?.examined ?? null,
    verdict,
  }
}

/** The checklist's items with the facts beside them. Every other field is the item's own, untouched. Pure. */
export function attachPaperFacts<T extends { key: string }>(items: T[], facts: Record<string, PaperFacts>): (T & PaperFacts)[] {
  return items.map((it) => ({ ...it, ...(facts[it.key] ?? NO_FACTS) }))
}

const SCREENING_TYPES = new Set<string>(Object.values(VerificationType))

/**
 * Read the facts for these paper types, about one person at the firms on
 * her line. The same person and the same firms `arrivedOnLine` reads.
 */
export async function readPaperFacts(input: {
  personId: string
  firmIds: string[]
  keys: { key: string; label: string }[]
}, db: typeof prisma = prisma): Promise<Record<string, PaperFacts>> {
  const names = input.keys
  const [packetItems, docs, checks] = await Promise.all([
    db.packetItem.findMany({
      where: { key: { in: names.map((n) => n.key) }, packet: { subjectPersonId: input.personId, companyId: { in: input.firmIds }, cancelledAt: null, direction: 'COLLECT' } },
      select: {
        key: true, state: true, receivedAt: true, fileName: true, reviewedAt: true,
        reviewedBy: { select: { name: true } },
        packet: { select: { createdAt: true, company: { select: { id: true, name: true } } } },
      },
    }),
    db.docInstance.findMany({
      where: {
        status: { in: ['SENT', 'SIGNED', 'UPLOADED'] },
        template: { companyId: { in: input.firmIds } },
        OR: [
          { subjectType: 'PERSON', subjectId: input.personId },
          { sellContract: { personId: input.personId } },
          { buyContract: { candidates: { some: { personId: input.personId, state: 'ACTIVE' } } } },
        ],
      },
      select: {
        status: true, sentAt: true, signedAt: true, fileName: true, examinedAt: true, examinedById: true,
        template: { select: { name: true, company: { select: { id: true, name: true } } } },
      },
      take: 200,
    }),
    db.verification.findMany({
      where: { personId: input.personId, type: { in: names.map((n) => n.key).filter((k) => orderedNotCollected(k) && SCREENING_TYPES.has(k)) as VerificationType[] } },
      orderBy: [{ verifiedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { type: true, status: true, provider: true, referenceId: true, verifiedAt: true, result: true },
    }),
  ])
  const examiners = await db.person.findMany({
    where: { id: { in: [...new Set(docs.map((d) => d.examinedById).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(examiners.map((p) => [p.id, p.name]))

  const itemRows: ItemRow[] = packetItems.map((i) => ({
    key: i.key, state: i.state, receivedAt: i.receivedAt, fileName: i.fileName, reviewedAt: i.reviewedAt,
    reviewerName: i.reviewedBy?.name ?? null, packetCreatedAt: i.packet.createdAt, firmId: i.packet.company.id, firmName: i.packet.company.name,
  }))
  const docRows: DocRow[] = []
  for (const d of docs) {
    const key = keyOfPaper(d.template.name, names)
    if (!key) continue
    docRows.push({
      key, status: d.status, sentAt: d.sentAt, signedAt: d.signedAt, fileName: d.fileName, examinedAt: d.examinedAt,
      examinerName: d.examinedById ? nameOf.get(d.examinedById) ?? null : null, firmId: d.template.company.id, firmName: d.template.company.name,
    })
  }
  const out: Record<string, PaperFacts> = {}
  for (const n of names) {
    const c = checks.find((v) => v.type === n.key)
    const said = c?.result && typeof c.result === 'object' && !Array.isArray(c.result) ? (c.result as Record<string, unknown>).providerSays : null
    out[n.key] = paperFactsOf(n.key, {
      items: itemRows, docs: docRows,
      check: c ? { status: c.status, providerSays: typeof said === 'string' ? said : null, provider: c.provider, reference: c.referenceId, date: c.verifiedAt } : null,
    })
  }
  return out
}

/**
 * The facts for every paper on one sell line's checklist: the firms read
 * are the line's seller and every firm on the chain under the person, the
 * same set `arrivedOnLine` reads. Null where the line is not found: the
 * door is only ever a sell line, so a buy line's id reads nothing.
 */
export async function paperFactsForLine(input: {
  contractId: string
  items: { key: string; label: string }[]
}, db: typeof prisma = prisma): Promise<Record<string, PaperFacts> | null> {
  const line = await db.sellContract.findUnique({ where: { id: input.contractId }, select: { personId: true, companyId: true } })
  if (!line) return null
  const chain = await employmentOf(line.personId)
  const firmIds = [...new Set([line.companyId, ...chain.lines.map((l) => l.companyId), ...chain.facts.map((f) => f.companyId)])]
  return readPaperFacts({ personId: line.personId, firmIds, keys: input.items.map((i) => ({ key: i.key, label: i.label })) }, db)
}
