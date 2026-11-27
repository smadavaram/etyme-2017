/**
 * What the card checkers share (record 123, plan C3): finding the cards an
 * agent opened for one dedupe link, the way `openOnce` finds them, and the
 * seat each kind of card is owed by, re-read from the firm's seats. Reads
 * only.
 */
import type { PrismaClient } from '@prisma/client'
import { firmSeats, seatAtFirm } from '@/lib/decision-items'
import { pickOwner } from '@/lib/money/agent-owners'
import type { ReadDb } from '../checker'

export type Link = { recordType: string; recordId: string }
export interface FoundCard { state: string; ownerPersonId: string; createdAt: Date }

/** Cards whose own first link is this link, and whose words are `question` where one is given (a card that only shows the record beside its own link is a different card). */
export async function cardsAt(read: ReadDb<PrismaClient>, companyId: string, link: Link, question?: string): Promise<FoundCard[]> {
  const rows = await read.decisionItem.findMany({
    where: { companyId, proofLinks: { array_contains: [link] }, agentTasks: { none: {} }, ...(question ? { question } : {}) },
    select: { state: true, ownerPersonId: true, createdAt: true, proofLinks: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.filter((d) => {
    const first = Array.isArray(d.proofLinks) ? (d.proofLinks[0] as Partial<Link> | undefined) : undefined
    return first?.recordType === link.recordType && first?.recordId === link.recordId
  })
}

/** The person who owes a card for these roles on this day: the first role with a working seat, else the Owner. */
export async function ownerFor(read: ReadDb<PrismaClient>, companyId: string, roles: readonly string[], at: Date): Promise<string | null> {
  return pickOwner(await firmSeats(companyId, read as any), roles, at)
}

/** The signatory named on a line where she works at the firm that day, else the Owner. */
export async function signatoryOrOwner(read: ReadDb<PrismaClient>, companyId: string, signatoryPersonId: string | null, at: Date): Promise<string | null> {
  const seats = await firmSeats(companyId, read as any)
  const working = !!signatoryPersonId && seats.some((s) => s.personId === signatoryPersonId && seatAtFirm(s, seats, at) !== null)
  return working ? signatoryPersonId : pickOwner(seats, [], at)
}

/**
 * The one answer every card skill gives about its cards: at least one was
 * opened for the link, no more than one is open, and the open one (else the
 * latest) is owed by the seat the owner reader names today.
 */
export function judgeCards(cards: readonly FoundCard[], expectedOwner: string | null, what: string, evidence: string) {
  if (cards.length === 0) return { verdict: 'FAIL' as const, reason: `No card is on the record for ${what}.`, evidence, unitsFound: 0 }
  const open = cards.filter((c) => c.state === 'OPEN')
  if (open.length > 1) return { verdict: 'FAIL' as const, reason: `${open.length} cards are open for ${what}, and there should be one.`, evidence, unitsFound: 0 }
  const card = open[0] ?? cards[cards.length - 1]
  if (expectedOwner && card.ownerPersonId !== expectedOwner) return { verdict: 'FAIL' as const, reason: `The card for ${what} is owed by a seat the owner reader does not name.`, evidence, unitsFound: 0 }
  return { verdict: 'PASS' as const, reason: `One card for ${what}, ${open.length ? 'open' : 'decided'}, owed by the seat the owner reader names.`, evidence, unitsFound: 1 }
}
