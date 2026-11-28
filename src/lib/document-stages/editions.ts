/**
 * The editions an issuer printed, as data, and an edition read the way
 * the issuer prints it. A leaf, so the start check (lib/contract-clearance)
 * and the door that records an I-9 (lib/attestation) read one list without
 * importing each other.
 */
import type { Edition } from '@/lib/document-type'
import { formatDay } from '@/lib/format-date'

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

/** What a form is called in a sentence, for a type the issuer list covers. */
const FORM_LABEL: Record<string, string> = { I9_EVERIFY: 'I-9' }

const DAY_MS = 86_400_000

/** A day the way the issuer prints its editions: "07/31/26", read in UTC. */
function asPrinted(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${String(d.getUTCFullYear()).slice(-2)}`
}


export type EditionToRecord =
  | { ok: true; edition: string }
  | { ok: false; code: 'NOT_AN_EDITION' | 'NOT_PRINTED' | 'NOT_YET_PRINTED' | 'RETIRED'; message: string }

/**
 * The one edition rule for every door that records a form on an edition:
 * Paperwork and Document requests (through the examination), the
 * request's own review, Record the I-9 on Compliance, and a firm's own
 * papers. Each reaches it through `checkToRecord` in lib/attestation.
 *
 * Found by the screen walk of 2026-11-03: "07/32/24", a date that does
 * not exist, and the retired 08/01/23 edition completed that day were
 * both accepted and said to count toward the start, because the edition
 * was only read for its shape. Now an edition is recorded only where the
 * issuer printed it and it was still accepted on the day the form was
 * completed. A type the issuer list does not cover is taken as typed.
 */
export function editionToRecord(type: string, raw: string, completedOn: Date): EditionToRecord {
  const list = PUBLISHED_EDITIONS[type] ?? []
  const form = FORM_LABEL[type] ?? 'form'
  const aForm = FORM_LABEL[type] ? `an ${form}` : 'a form'
  const read = editionAsPrinted(type, raw)
  if (!read.ok) {
    const printed = read.printed
    const said = printed.length > 1 ? `${printed.slice(0, -1).join(', ')} and ${printed[printed.length - 1]}` : printed[0]
    return {
      ok: false, code: 'NOT_AN_EDITION',
      message:
        `“${raw.trim()}” is not an edition of the ${form}. The edition is the date printed at the foot of every page, ` +
        `like ${printed[printed.length - 1]}; USCIS has printed ${said}.`,
    }
  }
  if (list.length === 0) return read
  const on = completedOn.getTime()
  const open = list.filter((e) => e.effectiveFrom.getTime() <= on && (!e.retiredAt || e.retiredAt.getTime() > on))
  const due = open[open.length - 1] ?? list[list.length - 1]
  const day = formatDay(completedOn)
  const found = list.find((e) => e.edition === read.edition)
  if (!found) {
    return {
      ok: false, code: 'NOT_PRINTED',
      message: `The ${form} edition ${read.edition} is not one the issuer printed; the current edition is ${due.edition}.`,
    }
  }
  if (found.effectiveFrom.getTime() > on) {
    return {
      ok: false, code: 'NOT_YET_PRINTED',
      message:
        `The ${found.edition} edition was not printed until ${asPrinted(found.effectiveFrom)}; ` +
        `${aForm} completed on ${day} must be on the ${due.edition} edition.`,
    }
  }
  if (found.retiredAt && found.retiredAt.getTime() <= on) {
    // The issuer prints the last day a form is accepted; retiredAt is the day after it.
    return {
      ok: false, code: 'RETIRED',
      message:
        `The ${found.edition} edition was retired on ${asPrinted(new Date(found.retiredAt.getTime() - DAY_MS))}; ` +
        `${aForm} completed on ${day} must be on the ${due.edition} edition.`,
    }
  }
  return read
}


/**
 * The edition a paper's own words print, with the line it was read from,
 * or null where the words print none. Read, never assumed: the founder's
 * tester, 2026-11-03, found the I-9 dialog filled with "01/20/25" for a
 * paper that printed "Rev. March 2024", and HR accepted what the screen
 * had typed for them. What is printed is returned as printed, so an
 * edition the issuer never printed is still refused by `editionToRecord`
 * with its own sentence. Pure.
 */
export function editionReadFrom(text: string): { edition: string; quote: string } | null {
  if (!text) return null
  const re = /\b(?:edition|rev(?:ision)?\.?)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})/i
  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line)
    if (!m) continue
    const word = /^rev/i.test(m[0]) ? 'Rev. ' : ''
    const printed = /\d\/\d/.test(m[1]) ? m[1] : `${word}${m[1]}`
    return { edition: printed.trim(), quote: line.trim().slice(0, 160) }
  }
  return null
}
