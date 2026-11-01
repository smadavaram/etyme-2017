/**
 * The editions an issuer printed, as data, and an edition read the way
 * the issuer prints it. A leaf, so the start check (lib/contract-clearance)
 * and the door that records an I-9 (lib/attestation) read one list without
 * importing each other.
 */
import type { Edition } from '@/lib/document-type'

/**
 * The editions an issuer published, for every company that has not
 * recorded its own. Rules live in data: a new edition is a new line.
 *
 * The I-9, from USCIS's edition notices: the 10/21/19 edition was
 * accepted until October 31, 2023; the 08/01/23 edition until its printed
 * expiry, July 31, 2026; the 01/20/25 edition is current.
 */
export const PUBLISHED_EDITIONS: Record<string, Edition[]> = {
  I9_EVERIFY: [
    { edition: '10/21/19', effectiveFrom: new Date('2019-10-21T00:00:00Z'), retiredAt: new Date('2023-11-01T00:00:00Z') },
    { edition: '08/01/23', effectiveFrom: new Date('2023-08-01T00:00:00Z'), retiredAt: new Date('2026-08-01T00:00:00Z') },
    { edition: '01/20/25', effectiveFrom: new Date('2025-01-20T00:00:00Z'), retiredAt: null },
  ],
}

/**
 * The published editions to judge one form against. Two editions are
 * often accepted at once (USCIS let the 08/01/23 I-9 be used for months
 * after the 01/20/25 one came out), so a form signed on an edition still
 * accepted that day is judged against that edition alone and reads as
 * current; anything else is judged against the whole list.
 */
export function publishedFor(type: string, recorded: string, completedOn: Date | null): Edition[] {
  const list = PUBLISHED_EDITIONS[type] ?? []
  const on = completedOn ?? new Date()
  const same = list.find(
    (e) => e.edition === recorded.trim() && e.effectiveFrom.getTime() <= on.getTime() && (!e.retiredAt || e.retiredAt.getTime() > on.getTime())
  )
  return same ? [same] : list
}

/**
 * An edition as the issuer prints it: "MM/DD/YY". A form recorded as
 * "08/01/2023" or "8/1/23" is the same edition as "08/01/23", and reading
 * it as a different one put an audit finding on a current I-9 (found by
 * the simulation, 2026-10-26). Anything that is not a date is left as typed.
 */
export function canonicalEdition(edition: string): string {
  const t = edition.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(t)
  if (!m) return t
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3].slice(-2)}`
}


/**
 * An edition typed by a person, read the way the issuer prints it, or the
 * list of what the issuer did print where it is not one of those.
 *
 * "Rev. 01/20/25", "Edition 1/20/2025" and "01/20/25" are one edition of
 * the I-9, and are kept as "01/20/25" so the start check reads them as the
 * same form. "Rev. March 2024" is no edition USCIS ever printed on an I-9
 * (it is how the IRS prints the W-9's), and recording it would put a form
 * nobody can audit behind a start (the founder's document walk,
 * 2026-11-01). A type the issuer list does not cover is taken as typed.
 */
export function editionAsPrinted(type: string, raw: string): { ok: true; edition: string } | { ok: false; printed: string[] } {
  const list = PUBLISHED_EDITIONS[type] ?? []
  const typed = raw.trim()
  if (list.length === 0) return { ok: true, edition: typed }
  const bare = typed.replace(/^(form\s+i-?9\s+)?(rev(ision)?\.?|edition|ed\.)\s*/i, '').trim()
  const canon = canonicalEdition(bare)
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(canon)) return { ok: true, edition: canon }
  return { ok: false, printed: list.map((e) => e.edition) }
}
