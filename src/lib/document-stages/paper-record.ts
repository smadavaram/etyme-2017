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
