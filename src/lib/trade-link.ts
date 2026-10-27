/**
 * Two firms already on Etyme, linking by one ask and one yes.
 *
 * Coordinator's call, 2026-10-27, after the second onboarding walk:
 * "Add company" for a firm that is already here made no copy (right) and
 * told each side to ask the other, with no door that did (wrong), so a
 * prime and its sub-vendor could never link and money's agreement and
 * order pickers stayed empty. A register row is what lets a contract name
 * a client (`mayNameCounterparty`), so it is never written on one side's
 * word. One side asks; the other says yes in one click; then each side
 * gets its own row, in its own words.
 *
 * Pure. The routes are `app/api/trade-links`.
 */

import type { Relationship } from '@/lib/counterparty'

export const LINK_RELATIONSHIPS: Relationship[] = ['CLIENT', 'SUPPLIER', 'PRIME', 'MSP']

/**
 * What the asker is to the other firm, given what the other firm is to
 * the asker. A firm that buys from a supplier is its client when it is a
 * client, and its prime when it is a firm that sells the work on.
 */
export function mirrorOf(relationship: Relationship, askerKind: string): Relationship {
  switch (relationship) {
    case 'CLIENT': return 'SUPPLIER'
    case 'SUPPLIER': return askerKind === 'CLIENT' ? 'CLIENT' : 'PRIME'
    case 'PRIME': return 'SUPPLIER'
    case 'MSP': return 'SUPPLIER'
  }
}

/** The word a firm uses for a firm in this place on its own register. */
export function wordFor(relationship: Relationship, readerKind: string): string {
  switch (relationship) {
    case 'CLIENT': return 'client'
    case 'SUPPLIER': return readerKind === 'CLIENT' ? 'supplier' : 'sub-vendor'
    case 'PRIME': return 'prime'
    case 'MSP': return 'MSP'
  }
}

export interface LinkSides {
  asker: { name: string; kind: string }
  other: { name: string; kind: string }
  /** What the other firm is to the asker. */
  relationship: Relationship
}

/** What the asker reads: the other firm, named as the asker names it. */
export function askerReads(o: LinkSides): string {
  return `You asked ${o.other.name} to link as your ${wordFor(o.relationship, o.asker.kind)}. Nothing is on either register until they say yes.`
}

/** What the other side reads: the asker, named as the reader would name it. */
export function readerReads(o: LinkSides & { askedBy: string }): { title: string; body: string } {
  const theirs = wordFor(mirrorOf(o.relationship, o.asker.kind), o.other.kind)
  return {
    title: `${o.asker.name} asks to link as your ${theirs}`,
    body:
      `${o.askedBy} at ${o.asker.name} asks to link with ${o.other.name} on Etyme, as your ${theirs}. ` +
      `Say yes under Companies and each of you can name the other on agreements and orders.`,
  }
}

export interface LinkAsk {
  asker: { id: string; kind: string; name: string }
  /** The firm found, or null where nobody by those facts is on Etyme. */
  other: { id: string; kind: string; name: string } | null
  relationship: string
  /** May the asker put a firm on its register (`vendors.manage`)? */
  mayManage: boolean
  /** The two already work together. */
  linked: boolean
  /** An open ask between the two, either way. */
  open: { fromCompanyId: string } | null
}

export type LinkVerdict =
  | { ok: true }
  | { ok: false; code: string; status: number; says: string }

/** May this firm ask that firm to link, and if not, what it is told. */
export function mayAskToLink(a: LinkAsk): LinkVerdict {
  if (!a.mayManage) {
    return { ok: false, code: 'NOT_YOURS_TO_ASK', status: 403, says: 'Asking a firm to link is for whoever keeps your list of companies: the owner, or a role that manages suppliers.' }
  }
  if (!(LINK_RELATIONSHIPS as string[]).includes(a.relationship)) {
    return { ok: false, code: 'VALIDATION', status: 422, says: 'Say what they are to you: your client, your supplier or sub-vendor, your prime, or the MSP you work in.' }
  }
  if (!a.other) {
    return { ok: false, code: 'NOT_FOUND', status: 404, says: 'No firm by those details is on Etyme. Add them as your own record instead.' }
  }
  if (a.other.id === a.asker.id) {
    return { ok: false, code: 'OWN_COMPANY', status: 422, says: `${a.asker.name} is your own company.` }
  }
  if (a.linked) {
    return { ok: false, code: 'ALREADY_LINKED', status: 409, says: `${a.other.name} already works with you, so add them from Companies and they link at once.` }
  }
  if (a.open) {
    return a.open.fromCompanyId === a.asker.id
      ? { ok: false, code: 'ALREADY_ASKED', status: 409, says: `You already asked ${a.other.name}. They have not answered yet.` }
      : { ok: false, code: 'THEY_ASKED', status: 409, says: `${a.other.name} already asked to link with you. Say yes to their ask under Companies.` }
  }
  return { ok: true }
}
