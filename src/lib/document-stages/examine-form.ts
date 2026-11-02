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

/**
 * Papers completed from a document the person shows: the paper has no end
 * of its own, and what is examined is the document behind it (which one,
 * its number, who issued it, the day it runs out).
 */
export const COMPLETED_FROM_SHOWN: readonly string[] = ['I9_EVERIFY']

/** What an I-9 may be completed from, in the words on the document, with who issues it. */
export const I9_SHOWN: { key: string; label: string; issuer: string }[] = [
  { key: 'PASSPORT', label: 'Passport', issuer: 'U.S. Department of State' },
  { key: 'GREEN_CARD', label: 'Permanent resident card', issuer: 'U.S. Citizenship and Immigration Services' },
  { key: 'WORK_PERMIT', label: 'Work permit (EAD)', issuer: 'U.S. Citizenship and Immigration Services' },
  { key: 'VISA', label: 'Visa', issuer: 'U.S. Department of State' },
  { key: 'DRIVERS_LICENSE', label: 'Driver’s license (with another document for work authorization)', issuer: '' },
]

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
}

/** What accepting a paper of this type asks for. Nothing for a type nobody knows. */
export function examineNeedsOf(key: string | null, aboutAFirm: boolean): ExamineNeeds {
  const spec = key ? builtInType(key) : null
  const shown = !!key && COMPLETED_FROM_SHOWN.includes(key)
  const end = spec?.validityShape === 'START_AND_END' || spec?.validityShape === 'END_ONLY'
  return {
    start: spec?.validityShape === 'START_AND_END',
    end: end && !shown,
    edition: spec?.reissued === true,
    shown,
    license: key === 'PROFESSIONAL_LICENSE' && !aboutAFirm,
    firmIssuer: aboutAFirm && end,
  }
}

export interface ExamineValues {
  validFrom?: string
  expiresAt?: string
  edition?: string
  issuer?: string
  licenseNumber?: string
  licenseState?: string
  shownType?: string
  shownNumber?: string
  shownIssuer?: string
  shownExpiresAt?: string
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
  ]
}

/** What the dialog posts to accept, from what was typed. Empty fields are left out for the route to name. */
export function examineBody(needs: ExamineNeeds, v: ExamineValues): Record<string, unknown> {
  const put = (k: string, x: string | undefined) => (x && x.trim() ? { [k]: x.trim() } : {})
  return {
    verdict: 'ACCEPT',
    ...put('validFrom', v.validFrom),
    ...put('expiresAt', v.expiresAt),
    ...put('edition', v.edition),
    ...put('issuer', v.issuer),
    ...put('licenseNumber', v.licenseNumber),
    ...put('licenseState', v.licenseState),
    ...(needs.shown && v.shownType
      ? {
          evidence: [{
            type: v.shownType,
            ...(v.shownIssuer?.trim() ? { issuer: v.shownIssuer.trim() } : {}),
            ...(v.shownNumber?.trim() ? { reference: v.shownNumber.trim() } : {}),
            ...(v.shownExpiresAt?.trim() ? { expiresAt: v.shownExpiresAt.trim() } : {}),
          }],
        }
      : {}),
  }
}
