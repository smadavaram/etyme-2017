/**
 * What the compliance routes of chains 3 and 6 share: the day a body names,
 * the legal entity an act is for, and a body's text field. Kept beside the
 * routes because a route file may export only its handlers.
 */

import type { QueueSeat } from '../../decision-items/door'

/** A day typed as 2026-11-23, or null where it is not one. */
export function dayFrom(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null
  const d = new Date(`${v.trim()}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.trim() ? null : d
}

export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The entity the act is for: the firm's only one, the one named, or a sentence asking which. */
export function entityFor(seat: Pick<QueueSeat, 'entities'>, named: unknown): { ok: true; id: string | null } | { ok: false; says: string } {
  const { entities } = seat
  if (entities.length === 0) return { ok: true, id: null }
  if (typeof named === 'string' && entities.some((e) => e.id === named)) return { ok: true, id: named }
  if (entities.length === 1) return { ok: true, id: entities[0].id }
  return { ok: false, says: 'This company has legal entities. Choose which one this act is done for.' }
}
