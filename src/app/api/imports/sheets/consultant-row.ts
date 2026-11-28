/**
 * Where one row of a consultants import may write, read through supply's
 * one rule (`profileEditPlan` in lib/consultant-portfolio/firm-view), never
 * a second one.
 *
 * The import upserted the name and the profile of anybody whose email
 * matched, own account or not: the class closed for the edit route on
 * 2026-11-01 (eaddb1fc2). Now a row about somebody whose record is theirs
 * writes only the firm's own words (title, skills, place) on the firm's
 * bench listing, and leaves their name, work authorization and lowest
 * rate alone; the import's summary says so for that row. Pure.
 */
import { firmViewPatch, profileEditPlan } from '@/lib/consultant-portfolio/firm-view'

export type RowWrite =
  | { write: 'PROFILE' }
  | { write: 'LISTING'; listing: ReturnType<typeof firmViewPatch>; says: string }
  | { write: 'NONE'; says: string }

/** The row's fields that would land on a person's record, as the edit route names them. */
export function rowFields(v: Record<string, unknown>): string[] {
  const out = ['name']
  for (const k of ['headline', 'skills', 'location', 'workAuth', 'rateFloor'] as const) {
    if (v[k] !== undefined && v[k] !== null) out.push(k)
  }
  return out
}

/** Why the row did not reach their own record, never naming another firm. */
function whose(name: string, ownAccount: boolean): string {
  return ownAccount ? `${name} has their own account` : `${name}’s own profile is theirs to change`
}

export function consultantRowPlan(o: {
  isSubject: boolean
  ownAccount: boolean
  otherFirms: number
  hasListing: boolean
  name: string
  firm: string
  values: Record<string, unknown>
}): RowWrite {
  const all = profileEditPlan({ ...o, fields: rowFields(o.values) })
  if (all.ok) return { write: 'PROFILE' }

  // Theirs: only what the firm says about them, and only on its own listing.
  const view: Record<string, unknown> = {}
  for (const k of ['headline', 'skills', 'location'] as const) {
    if (o.values[k] !== undefined && o.values[k] !== null) view[k] = o.values[k]
  }
  const keys = Object.keys(view)
  if (keys.length === 0) {
    return { write: 'NONE', says: `Nothing written; ${whose(o.name, o.ownAccount)}, and this row had only their own details.` }
  }
  const firmOnly = profileEditPlan({ ...o, fields: keys })
  if (firmOnly.ok && firmOnly.listing) {
    return { write: 'LISTING', listing: firmViewPatch(view), says: `Kept on your listing; ${whose(o.name, o.ownAccount)}.` }
  }
  return { write: 'NONE', says: `Nothing written; ${whose(o.name, o.ownAccount)}, and ${o.firm} has no bench listing for them to keep your words on.` }
}
