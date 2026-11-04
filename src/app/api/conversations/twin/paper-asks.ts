/**
 * "<Firm> needs one paper from you: …", read against the record on the day
 * the greeting says it, never as it was written.
 *
 * The fifth screen walk (2026-11-04, C8): Rosa Delgado's greeting, under
 * "Since you last looked", still said "Brightmoor Staffing needs one paper
 * from you: a product confidentiality undertaking" after Brightmoor had
 * accepted it. The notice was written when the request was sent and nothing
 * read it again. So a notice of a paper request is said only for what the
 * person still owes: an item nobody has answered yet or one sent back, and
 * not already held on the record through the one reader every other page
 * uses (`heldOnRecord` in lib/document-stages/paper-record, with the
 * accepted items of the person's other requests). Where nothing is owed the
 * notice is not said and is marked read with the rest; where less is owed
 * than was asked, it names only what is left.
 */

import { prisma } from '@/lib/db'
import type { HeldDocument } from '@/lib/packets'
import { papersAsked } from '@/lib/contract-clearance'
import { heldFromAcceptedItems, heldOnRecord, linesOfPerson } from '@/lib/document-stages/paper-record'

/** One item on a request, as this reader needs it. */
export interface AskedItem { key: string; label: string; state: string }

/** The states in which the person still owes the paper: never answered, or sent back. */
const STILL_OWED = new Set(['PENDING', 'REJECTED'])

/** Whether a document held counts today: accepted, started, and not run out. Pure. */
export function holdsToday(h: HeldDocument, now: Date): boolean {
  if (!h.accepted) return false
  if (h.validFrom && h.validFrom.getTime() > now.getTime()) return false
  return !h.expiresAt || h.expiresAt.getTime() > now.getTime()
}

/**
 * The items on a request the person still owes today: not yet answered or
 * sent back, and not held on the record by another road. Pure.
 */
export function stillOwed(items: readonly AskedItem[], held: readonly HeldDocument[], now: Date): AskedItem[] {
  const onFile = new Set(held.filter((h) => holdsToday(h, now)).map((h) => h.key))
  return items.filter((i) => STILL_OWED.has(i.state) && !onFile.has(i.key))
}

/** What the notice says of what is left: "<Firm> needs one paper from you: a W-9". Pure. */
export function paperAskSays(firm: string, owed: readonly AskedItem[]): string {
  const asked = papersAsked(owed.map((i) => ({ key: i.key, label: i.label })))
  return `${firm} needs ${asked.counted} from you: ${asked.named}`
}

/** How a request notice reads today: not at all, or with the title of what is left. */
export type AskReads = { kind: 'ANSWERED' } | { kind: 'LEFT'; title: string }

/** Whether a stored notice title is a paper request's (`app/api/packets`, the in-app notice). Pure. */
export function isPaperAskTitle(title: string): boolean {
  return /\bneeds .+ from you: /.test(title)
}

/**
 * For each notice of a paper request among these, how it reads today.
 * Read in a handful of queries, never per notice. A notice whose request
 * cannot be found is left as it was.
 */
export async function paperAsksToday(
  rows: ReadonlyArray<{ id: string; title: string; entityId: string | null }>,
  now = new Date(),
): Promise<Map<string, AskReads>> {
  const out = new Map<string, AskReads>()
  const asks = rows.filter((r) => r.entityId && isPaperAskTitle(r.title))
  if (asks.length === 0) return out
  const packets = await prisma.documentPacket.findMany({
    where: { id: { in: [...new Set(asks.map((r) => r.entityId!))] } },
    select: {
      id: true, companyId: true, subjectPersonId: true, subjectCompanyId: true,
      company: { select: { name: true } },
      items: { select: { key: true, label: true, state: true }, orderBy: { position: 'asc' } },
    },
  })
  const byId = new Map(packets.map((p) => [p.id, p]))
  // What is on the record, once per person and asking firm.
  const heldFor = new Map<string, Promise<HeldDocument[]>>()
  const held = (p: (typeof packets)[number]): Promise<HeldDocument[]> => {
    const k = `${p.subjectPersonId ?? ''}:${p.companyId}`
    let got = heldFor.get(k)
    if (!got) {
      got = (async () => {
        if (!p.subjectPersonId) return []
        const firms = [p.companyId, ...(p.subjectCompanyId ? [p.subjectCompanyId] : [])]
        const [lines, prior] = await Promise.all([
          linesOfPerson(p.subjectPersonId, { firm: p.companyId }),
          prisma.packetItem.findMany({
            where: { state: 'ACCEPTED', packet: { subjectPersonId: p.subjectPersonId } },
            select: { key: true, state: true, validUntil: true, verificationId: true },
          }),
        ])
        return [...heldFromAcceptedItems(prior), ...(await heldOnRecord({ personId: p.subjectPersonId, firms, lines }))]
      })().catch(() => [])
      heldFor.set(k, got)
    }
    return got
  }
  for (const r of asks) {
    const p = byId.get(r.entityId!)
    if (!p) continue
    const owed = stillOwed(p.items, await held(p), now)
    if (owed.length === 0) out.set(r.id, { kind: 'ANSWERED' })
    else if (owed.length < p.items.length) out.set(r.id, { kind: 'LEFT', title: paperAskSays(p.company.name, owed) })
  }
  return out
}
