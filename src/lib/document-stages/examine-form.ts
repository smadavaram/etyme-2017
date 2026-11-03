/**
 * What accepting a paper asks for, the fields the dialog draws for it, and
 * the body the dialog posts: one description, read by both lists that open
 * the dialog (Paperwork and Document requests) and by the dialog itself.
 *
 * The founder's walker, 2026-11-01: an I-9 on Document requests offered
 * only "The day it runs out" and "The edition printed on the form", and
 * Accept was refused with "Say which document Rajesh Iyer showed, and when
 * it runs out", a question no field on the screen could answer. So the
 * I-9 could never be accepted from the screen and the start stayed held.
 * The rule this keeps: every question the route asks, the screen has a
 * field for (`__tests__/invariants/every-question-has-a-field.test.ts`).
 *
 * Pure.
 */
import { builtInType } from '@/lib/document-type'
import { orderedNotCollected } from '@/lib/attestation'

/**
 * Papers completed from a document the person shows: the paper has no end
 * of its own, and what is examined is the document behind it (which one,
 * its number, who issued it, the day it runs out).
 */
export const COMPLETED_FROM_SHOWN: readonly string[] = ['I9_EVERIFY']

/**
 * What an I-9 may be completed from, in the words on the document, with
 * who issues it and which list of the form it is on. `key` is the record
 * the document is kept as; `id` tells two documents kept as one record
 * apart on the screen (a passport book and a passport card are both a
 * passport). The founder's tester, 2026-11-03: a passport card, a List A
 * document, was not offered, so a person who showed one could not be
 * recorded as having shown it.
 *
 * A List B document proves identity only and is shown with a List C
 * document for work authorization; a List C document is shown with a
 * List B one. The record keeps the document shown; the pairing is HR's.
 */
export const I9_SHOWN: { id: string; key: string; label: string; issuer: string; list: 'A' | 'B' | 'C' }[] = [
  { id: 'US_PASSPORT', key: 'PASSPORT', label: 'U.S. passport', issuer: 'U.S. Department of State', list: 'A' },
  { id: 'US_PASSPORT_CARD', key: 'PASSPORT', label: 'U.S. passport card', issuer: 'U.S. Department of State', list: 'A' },
  { id: 'GREEN_CARD', key: 'GREEN_CARD', label: 'Permanent resident card (Form I-551)', issuer: 'U.S. Citizenship and Immigration Services', list: 'A' },
  { id: 'FOREIGN_PASSPORT_I551', key: 'GREEN_CARD', label: 'Foreign passport with a temporary I-551 stamp', issuer: '', list: 'A' },
  { id: 'WORK_PERMIT', key: 'WORK_PERMIT', label: 'Employment authorization document (Form I-766)', issuer: 'U.S. Citizenship and Immigration Services', list: 'A' },
  { id: 'FOREIGN_PASSPORT_I94', key: 'VISA', label: 'Foreign passport with Form I-94', issuer: '', list: 'A' },
  { id: 'VISA', key: 'VISA', label: 'Visa', issuer: 'U.S. Department of State', list: 'A' },
  { id: 'DRIVERS_LICENSE', key: 'DRIVERS_LICENSE', label: 'Driver’s license (List B, with a List C document)', issuer: '', list: 'B' },
  { id: 'STATE_ID', key: 'DRIVERS_LICENSE', label: 'State ID card (List B, with a List C document)', issuer: '', list: 'B' },
  { id: 'SSN_CARD', key: 'RIGHT_TO_WORK', label: 'Social Security card (List C, with a List B document)', issuer: 'Social Security Administration', list: 'C' },
  { id: 'BIRTH_CERTIFICATE', key: 'RIGHT_TO_WORK', label: 'U.S. birth certificate (List C, with a List B document)', issuer: '', list: 'C' },
]

/** The document shown, by its screen id, or by its record where an older screen posted that. */
export function shownById(id: string | undefined): (typeof I9_SHOWN)[number] {
  return I9_SHOWN.find((d) => d.id === id) ?? I9_SHOWN.find((d) => d.key === id) ?? I9_SHOWN[0]
}

/**
 * A day typed into one box, read as the record reads it (YYYY-MM-DD), or
 * null where it is not a day on the calendar. Takes 2030-04-30, 04/30/2030
 * and 4/30/30, so a person types the date as it is printed rather than
 * stepping through a picker's month, day and year. Pure.
 */
export function typedDay(raw: string | undefined | null): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t)
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] }
  else if (us) { m = +us[1]; d = +us[2]; y = us[3].length === 2 ? 2000 + +us[3] : +us[3] }
  else return null
  const at = new Date(Date.UTC(y, m - 1, d))
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null
  return at.toISOString().slice(0, 10)
}

export interface ExamineNeeds {
  /** The day it starts, as printed. */
  start: boolean
  /** The day it runs out, as printed on the paper itself. */
  end: boolean
  /** The edition printed on a form the issuer reissues. */
  edition: boolean
  /** The document the person showed, for a paper completed from one. */
  shown: boolean
  /** A license's number and board, so it can be checked on their register. */
  license: boolean
  /** Who issued a firm's certificate: the insurer, or the state. */
  firmIssuer: boolean
  /**
   * A screening company's or a laboratory's report on a person: its name,
   * its reference, the day it reported, its word and its own words. A
   * background check or a drug screen stands only on the provider's
   * verdict (the founder's tester, 2026-11-03), so accepting one records
   * that verdict, and the dialog asks for it.
   */
  verdict?: boolean
}

/** What accepting a paper of this type asks for. Nothing for a type nobody knows. */
export function examineNeedsOf(key: string | null, aboutAFirm: boolean): ExamineNeeds {
  const spec = key ? builtInType(key) : null
  const shown = !!key && COMPLETED_FROM_SHOWN.includes(key)
  const verdict = !!key && !aboutAFirm && orderedNotCollected(key)
  // A screening company's report prints the day it reported, not an end:
  // it counts for its months from that day, and the route counts them.
  const end = !verdict && (spec?.validityShape === 'START_AND_END' || spec?.validityShape === 'END_ONLY')
  return {
    start: spec?.validityShape === 'START_AND_END',
    end: end && !shown,
    edition: spec?.reissued === true,
    shown,
    license: key === 'PROFESSIONAL_LICENSE' && !aboutAFirm,
    firmIssuer: aboutAFirm && end,
    verdict,
  }
}

/** A provider's word, as the report says it, in the order a report reads. */
export const VERDICT_OUTCOMES: { key: string; label: string }[] = [
  { key: 'CLEAR', label: 'Clear' },
  { key: 'CONDITIONAL', label: 'Clear with conditions' },
  { key: 'FLAGGED', label: 'Flagged for review' },
  { key: 'FAILED', label: 'Not clear' },
]

export interface ExamineValues {
  validFrom?: string
  expiresAt?: string
  edition?: string
  issuer?: string
  licenseNumber?: string
  licenseState?: string
  shownType?: string
  /** Which document on the screen's list, where two are kept as one record. */
  shownId?: string
  shownNumber?: string
  shownIssuer?: string
  shownExpiresAt?: string
  provider?: string
  reference?: string
  renderedOn?: string
  outcome?: string
  providerSays?: string
}

/** The fields the dialog draws, in order, each one required. */
export function examineFields(needs: ExamineNeeds): (keyof ExamineValues)[] {
  return [
    ...(needs.start ? ['validFrom' as const] : []),
    ...(needs.end ? ['expiresAt' as const] : []),
    ...(needs.edition ? ['edition' as const] : []),
    ...(needs.shown ? ['shownType' as const, 'shownNumber' as const, 'shownIssuer' as const, 'shownExpiresAt' as const] : []),
    ...(needs.license ? ['licenseNumber' as const, 'issuer' as const] : []),
    ...(needs.firmIssuer ? ['issuer' as const] : []),
    ...(needs.verdict ? ['provider' as const, 'reference' as const, 'renderedOn' as const, 'outcome' as const, 'providerSays' as const] : []),
  ]
}

/** What the dialog posts to accept, from what was typed. Empty fields are left out for the route to name. */
export function examineBody(needs: ExamineNeeds, v: ExamineValues): Record<string, unknown> {
  const put = (k: string, x: string | undefined) => (x && x.trim() ? { [k]: x.trim() } : {})
  // A day typed as printed goes as the record reads it; one that is not a
  // day goes as typed, and the route says so in a sentence.
  const day = (k: string, x: string | undefined) => put(k, typedDay(x) ?? x)
  return {
    verdict: 'ACCEPT',
    ...day('validFrom', v.validFrom),
    ...day('expiresAt', v.expiresAt),
    ...put('edition', v.edition),
    ...put('issuer', v.issuer),
    ...put('licenseNumber', v.licenseNumber),
    ...put('licenseState', v.licenseState),
    ...(needs.verdict
      ? {
          ...put('provider', v.provider),
          ...put('reference', v.reference),
          ...day('renderedOn', v.renderedOn),
          ...put('outcome', v.outcome),
          ...put('providerSays', v.providerSays),
        }
      : {}),
    ...(needs.shown && v.shownType
      ? {
          evidence: [{
            type: v.shownType,
            ...(v.shownIssuer?.trim() ? { issuer: v.shownIssuer.trim() } : {}),
            ...(v.shownNumber?.trim() ? { reference: v.shownNumber.trim() } : {}),
            ...(v.shownExpiresAt?.trim() ? { expiresAt: typedDay(v.shownExpiresAt) ?? v.shownExpiresAt.trim() } : {}),
          }],
        }
      : {}),
  }
}

/** Each field the dialog draws, as the sentence beside a disabled Accept names it. */
export const FIELD_SAYS: Record<keyof ExamineValues, string> = {
  validFrom: 'the day it starts',
  expiresAt: 'the day it runs out',
  edition: 'the edition printed on the form',
  issuer: 'who issued it',
  licenseNumber: 'the license number',
  licenseState: 'the state',
  shownType: 'the document shown',
  shownId: 'the document shown',
  shownNumber: 'the number on the document shown',
  shownIssuer: 'who issued the document shown',
  shownExpiresAt: 'the day the document shown runs out',
  provider: 'the screening company',
  reference: 'their reference',
  renderedOn: 'the day they reported',
  outcome: 'what they reported',
  providerSays: 'their words',
}

const DATE_FIELDS: (keyof ExamineValues)[] = ['validFrom', 'expiresAt', 'shownExpiresAt', 'renderedOn']

/**
 * Why Accept cannot be pressed yet, in a sentence, or null where every
 * field the dialog draws is filled. The founder's tester, 2026-11-03:
 * Accept sat disabled with nothing saying which field was missing. Pure.
 */
export function acceptWaitsOn(needs: ExamineNeeds, v: ExamineValues): { field: keyof ExamineValues; says: string } | null {
  for (const f of examineFields(needs)) {
    const typed = (v[f] ?? '').trim()
    if (!typed) return { field: f, says: `Fill in ${FIELD_SAYS[f]} to accept.` }
    if (DATE_FIELDS.includes(f) && !typedDay(typed)) {
      return { field: f, says: `Type ${FIELD_SAYS[f]} as a date, like 04/30/2030.` }
    }
  }
  return null
}
