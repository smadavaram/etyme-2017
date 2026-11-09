/**
 * The acts on the team structure, the fields each asks for, and the one
 * reading of a request body. Pure, so the screen builds its bodies from
 * the same list the route reads them with, and a test can fill in every
 * field the screen draws and prove the route never refuses for one it did
 * not ("every question a route asks, its screen has a field for",
 * founder, 2026-11-02).
 *
 * Every act is one gesture on the screen and one call here:
 *   ADD             + Under, + Beside, U, B, the menu
 *   RENAME          the name field, the menu's Rename
 *   KIND            the kind field, the menu's Make it a …
 *   LEAD            the lead field, the menu's Name the lead, Make team lead
 *   MOVE            drag a box onto a box or its edge, Move under
 *   DELETE          Delete, with the confirmation that says what moves up
 *   MOVE_PERSON     drag a name, Add a person, Take off this team
 *   MOVE_CONTRACTOR drag a contractor's name: their charging unit only
 *   UNDO            Undo: the company's last change, if it was yours
 */

import { isKnownKind, KINDS_OFFERED } from './tree'

export const ACTS = ['ADD', 'RENAME', 'KIND', 'LEAD', 'MOVE', 'DELETE', 'MOVE_PERSON', 'MOVE_CONTRACTOR', 'UNDO'] as const
export type Act = (typeof ACTS)[number]

/**
 * The fields each act asks for. A field that may be empty on purpose is
 * still asked for: `parentId` empty is the company, `unitId` empty on a
 * person is "on no team", `contextId` empty on a lead clears it.
 */
export const ACT_FIELDS: Record<Act, readonly string[]> = {
  ADD: ['parentId', 'at', 'name', 'kind'],
  RENAME: ['unitId', 'name'],
  KIND: ['unitId', 'kind'],
  LEAD: ['unitId', 'contextId'],
  MOVE: ['unitId', 'parentId', 'at'],
  DELETE: ['unitId'],
  MOVE_PERSON: ['contextId', 'unitId'],
  MOVE_CONTRACTOR: ['sellContractId', 'unitId'],
  UNDO: [],
}

export type ActValues = Partial<Record<'parentId' | 'at' | 'name' | 'kind' | 'unitId' | 'contextId' | 'sellContractId', string | number | null>>

/** What the screen posts for an act: the act and exactly its fields. */
export function actBody(act: Act, v: ActValues): Record<string, unknown> {
  const body: Record<string, unknown> = { act }
  for (const f of ACT_FIELDS[act]) body[f] = (v as Record<string, unknown>)[f] ?? null
  return body
}

export type ActRequest =
  | { act: 'ADD'; parentId: string | null; at: number | null; name: string; kind: string | null }
  | { act: 'RENAME'; unitId: string; name: string }
  | { act: 'KIND'; unitId: string; kind: string }
  | { act: 'LEAD'; unitId: string; contextId: string | null }
  | { act: 'MOVE'; unitId: string; parentId: string | null; at: number | null }
  | { act: 'DELETE'; unitId: string }
  | { act: 'MOVE_PERSON'; contextId: string; unitId: string | null }
  | { act: 'MOVE_CONTRACTOR'; sellContractId: string; unitId: string }
  | { act: 'UNDO' }

export type Read = { ok: true; request: ActRequest } | { ok: false; field: string | null; says: string }

const id = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const place = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : null)
const NAME_MAX = 120

/** One reading of a body, refused in a sentence that names the field. */
export function readAct(body: unknown): Read {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const act = typeof b.act === 'string' ? (b.act.trim().toUpperCase() as Act) : null
  if (!act || !(ACTS as readonly string[]).includes(act)) {
    return { ok: false, field: 'act', says: 'Say what to change: add a box, rename it, change its kind, name its lead, move it, delete it, or move a person.' }
  }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, NAME_MAX) : ''
  const kind = typeof b.kind === 'string' && b.kind.trim() ? b.kind.trim().toUpperCase() : null
  const need = (field: string, says: string): Read => ({ ok: false, field, says })

  switch (act) {
    case 'ADD':
      if (kind && !isKnownKind(kind)) return need('kind', `A box is a ${KINDS_OFFERED.map((k) => k.toLowerCase()).join(', a ')}.`)
      return { ok: true, request: { act, parentId: id(b.parentId), at: place(b.at), name: name || 'New team', kind } }
    case 'RENAME':
      if (!id(b.unitId)) return need('unitId', 'Pick the box to rename.')
      if (!name) return need('name', 'Give the box a name.')
      return { ok: true, request: { act, unitId: id(b.unitId)!, name } }
    case 'KIND':
      if (!id(b.unitId)) return need('unitId', 'Pick the box to change.')
      if (!kind || !(KINDS_OFFERED as readonly string[]).includes(kind)) return need('kind', `Pick what it is: a ${KINDS_OFFERED.map((k) => k.toLowerCase()).join(', a ')}.`)
      return { ok: true, request: { act, unitId: id(b.unitId)!, kind } }
    case 'LEAD':
      if (!id(b.unitId)) return need('unitId', 'Pick the box whose lead you are naming.')
      return { ok: true, request: { act, unitId: id(b.unitId)!, contextId: id(b.contextId) } }
    case 'MOVE':
      if (!id(b.unitId)) return need('unitId', 'Pick the box to move.')
      return { ok: true, request: { act, unitId: id(b.unitId)!, parentId: id(b.parentId), at: place(b.at) } }
    case 'DELETE':
      if (!id(b.unitId)) return need('unitId', 'Pick the box to delete.')
      return { ok: true, request: { act, unitId: id(b.unitId)! } }
    case 'MOVE_PERSON':
      if (!id(b.contextId)) return need('contextId', 'Pick the person to move.')
      return { ok: true, request: { act, contextId: id(b.contextId)!, unitId: id(b.unitId) } }
    case 'MOVE_CONTRACTOR':
      if (!id(b.sellContractId)) return need('sellContractId', 'Pick the contractor to move.')
      if (!id(b.unitId)) return need('unitId', 'A contractor is charged to a box. Pick the box.')
      return { ok: true, request: { act, sellContractId: id(b.sellContractId)!, unitId: id(b.unitId)! } }
    case 'UNDO':
      return { ok: true, request: { act } }
  }
}
