/**
 * What the compliance routes of chains 3 and 6 share: the day a body names,
 * the legal entity an act is for, and a body's text field. Kept beside the
 * routes because a route file may export only its handlers.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { logRefusal, refused, type QueueSeat } from '../../decision-items/door'

/**
 * Petitions, posted notices and public access files are HR's and the
 * compliance officer's work (the lead's ruling, 2026-11-23). The shipped
 * roles that hold governance.read are HR and the Compliance Officer, and
 * neither the Recruiter, the Account Manager nor the Contract Manager do;
 * the Owner and an Admin hold it too.
 */
export const KEEPS_PAPERS = 'governance.read'

export const mayKeepPapers = (seat: Pick<QueueSeat, 'caller' | 'ownerOrAdmin'>): boolean =>
  seat.ownerOrAdmin || hasPermission(seat.caller.permissions, 'governance.read')

/** Null where the seat keeps papers; else the refusal, logged before it is sent. */
export async function refuseUnlessKeeper(seat: QueueSeat, request: NextRequest, says: string): Promise<NextResponse | null> {
  if (mayKeepPapers(seat)) return null
  await logRefusal(seat, { companyId: seat.companyId }, `Refused ${request.method} ${request.nextUrl.pathname} to a seat that does not look after petitions, notices and public access files.`)
  return refused(403, says)
}

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
