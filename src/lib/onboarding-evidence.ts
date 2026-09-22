/**
 * What a desk verified at onboarding, turned into a row the compliance
 * record can read.
 *
 * ── The crack ────────────────────────────────────────────────────────
 *
 * HR clears a supplier's certificate of insurance on the way in, and the
 * compliance page goes on saying the firm has no cover on file. Both are
 * true at once, because they are two different records: the four-desk
 * walk keeps its answers in `SupplierRequest.checklist`, a JSON blob
 * holding a file name, a verdict and an hour — and `Verification`, which
 * is what every gate in the product actually reads, never hears about
 * it. A firm HR personally cleared on Tuesday blocks a start on
 * Wednesday, and the refusal names a document that is sitting in the
 * onboarding record.
 *
 * ── Why the dates are the whole of it ────────────────────────────────
 *
 * The checklist cannot become a verification today, and not for want of
 * plumbing: a `Verification` has a life — the day cover begins and the
 * day it runs out — and a checklist item has neither. Writing one anyway
 * would put a certificate on the compliance record with no expiry, and
 * `lib/document-type` is explicit about what that means: *"an unknown
 * expiry passes every check until the day somebody audits it."* A row
 * that never expires is worse than no row, because the nightly watch
 * will never chase it and the screen will read green forever.
 *
 * So the desk is asked for the two dates at the moment it says
 * "verified", which is the one moment somebody has the certificate open
 * in front of them. No dates, no row, and a sentence saying which dates
 * are wanted and why.
 *
 * ── What becomes a verification and what does not ────────────────────
 *
 * Only COMPLIANCE documents. A `Verification` is a thing with a validity
 * window that gets watched and chased; a signed agreement is not one of
 * those (it is `MasterAgreement` and `DocInstance`), and neither is a
 * reference somebody took up. `lib/document-type` already knows which is
 * which, and this asks it rather than keeping a second list.
 *
 * ── And what no desk may render at all ───────────────────────────────
 *
 * The founder, 2026-09-22: *“Ultimately background check companies are
 * the ones that confirm background pass or fail — the risk is passed
 * there to background check companies; our job would be to collect all
 * info and pass it to them to verify.”*
 *
 * This file writes `status: 'CLEAR'` with the clicking desk as
 * `verifiedById`, and until 2026-09-22 it did that for anything with a
 * compliance purpose and two dates on it. For a certificate of insurance
 * that is exactly right — the insurer asserted the cover and printed
 * the dates, and the desk is repeating an assertion somebody else made.
 * For a background check or a drug screen it is Etyme declaring a person
 * clear to work, which is the line `lib/attestation` exists to hold:
 * *“we attest, we do not declare.”*
 *
 * It has fired honestly so far, because the shipped checklist only wires
 * `answers` for insurance, good standing, the MSA and the W-9 — every
 * one of them somebody else's assertion, already printed. Honestly by
 * accident, though: the required set is deliberately open-ended, so a
 * client whose order asks its suppliers for a background check folds
 * that item onto the same checklist, `withOrderedItems` gives it
 * `answers: ['BACKGROUND_CHECK']`, and the client's own HR desk is
 * handed the button.
 *
 * So the gate is on the kind of assertion rather than on the list, and
 * it is asked of `lib/attestation` rather than answered from a second
 * table here. That file now says, per check, who renders it: a screening
 * company, the employer of record personally, an awarding body, or the
 * person themselves. A desk may record what an issuing body already
 * asserted and printed. It may not render a provider's verdict, and it
 * may not stand in for an employer's own statutory check.
 *
 * Two lists would be two answers to one question, and the one that went
 * stale would be the one letting a desk clear a background check. So
 * there is one: `checkKindOf` and `whoRendersCheck`, in regulation's file.
 *
 * The refusal names the party whose opinion it is, so the desk leaves
 * with somebody to ask rather than with a fault of its own — and the
 * answer stays on the checklist, where “Veritan sent us Sterling’s
 * report on 12 March” is a true thing to have written down.
 *
 * No database in here. It returns the row to write; the route writes it.
 * That is deliberate — the supplier's own company row does not exist
 * until Finance approves the firm, so when the write happens is the
 * caller's problem and what to write is this file's.
 */

import { typeByKey, type DefinedType } from '@/lib/document-type'
import { checkKindOf, whoRendersCheck } from '@/lib/attestation'

/**
 * A checklist item as `lib/supplier-onboarding` holds it, plus the two
 * dates this file needs.
 *
 * Structural rather than imported: `ChecklistItem` belongs to
 * etyme-demand, this file belongs to the platform, and a shape both can
 * satisfy is cheaper than a dependency either way. The two date fields
 * are the addition demand makes to its own type — they ride in the same
 * JSON the rest of the item already rides in, so there is no schema
 * change and nothing to migrate.
 */
export interface OnboardingEvidenceItem {
  key: string
  label: string
  /** MISSING · PROVIDED · HELD · WAIVED */
  state: string
  /** The document types in `lib/document-type` this item answers. */
  answers?: string[]
  fileName?: string | null
  note?: string | null
  /** The day cover begins, as the certificate says. ISO, or a Date. */
  validFrom?: string | Date | null
  /** The day it runs out. ISO, or a Date. */
  validUntil?: string | Date | null
}

/**
 * The `VerificationType` each document type is recorded under.
 *
 * `Verification.type` is an enum and a company's own dictionary is not,
 * which is the tension `documentTypeId` exists to resolve: the type
 * stays the closest built-in so every gate keeps resolving, and the
 * company's own key is carried beside it. A key with no enum value here
 * has no verification to write — which is correct rather than a gap, and
 * the sentence says so.
 */
const VERIFICATION_TYPE: Record<string, string> = {
  INSURANCE_GL: 'INSURANCE_GL',
  INSURANCE_WC: 'INSURANCE_WC',
  INSURANCE_EO: 'INSURANCE_EO',
  INSURANCE_CYBER: 'INSURANCE_CYBER',
  GOOD_STANDING: 'GOOD_STANDING',
  BUSINESS_PARTNER: 'BUSINESS_PARTNER',
  REFERENCE_CHECK: 'REFERENCE_CHECK',
  BACKGROUND_CHECK: 'BACKGROUND_CHECK',
  DRUG_SCREENING: 'DRUG_SCREENING',
  I9_EVERIFY: 'I9_EVERIFY',
  RIGHT_TO_WORK: 'RIGHT_TO_WORK',
  PROFESSIONAL_LICENSE: 'PROFESSIONAL_LICENSE',
  EDUCATION_EVALUATION: 'EDUCATION_EVALUATION',
}

/** One row, ready for `prisma.verification.create`. */
export interface VerificationToWrite {
  companyId: string
  /** The enum value. */
  type: string
  /** The company's own key for it, for the row's `documentTypeId` lookup. */
  documentTypeKey: string
  status: 'CLEAR'
  validFrom: Date
  expiresAt: Date
  issuedAt: Date
  verifiedAt: Date
  uploadedById?: string
  verifiedById?: string
  result: { outcome: 'CLEAR'; notes: string }
}

export type EvidenceVerdict =
  | { ok: true; rows: VerificationToWrite[]; says: string; needsDates: false }
  | { ok: false; rows: []; says: string; needsDates: boolean }

function asDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function onDay(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** What these keys are called, in the dictionary's own words. */
function labelsOf(keys: string[]): string {
  const names = keys.map((k) => typeByKey(k)?.label ?? k)
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Whether this document type is one a desk may record at all, and who
 * renders it where it is not.
 *
 * `null` means the desk may record it: either nothing in regulation's
 * table recognizes the key — an insurance certificate, a certificate of
 * good standing, a business registration, all of them somebody else's
 * assertion already printed on paper — or the table says the body that
 * issued it rendered it, or the person themselves did.
 */
function renderedElsewhere(key: string): 'PROVIDER' | 'EMPLOYER' | null {
  const kind = checkKindOf(key)
  if (!kind) return null
  const renders = whoRendersCheck(kind).renders
  return renders === 'PROVIDER' || renders === 'EMPLOYER' ? renders : null
}

/**
 * Why a desk may not call this one verified, and who can.
 *
 * Two things the sentence has to do at once, and the second is the one
 * usually missed: say that the answer is somebody else's, and say whose
 * — so the desk leaves with a next move rather than with a refusal it
 * reads as a fault of its own. It also says what a record of the check
 * would have to carry, because that is the door nobody has built yet and
 * naming it is cheaper than discovering it.
 */
function rendersElsewhereSays(keys: string[]): string {
  const who = renderedElsewhere(keys[0])
  const kind = checkKindOf(keys[0])!
  const what = labelsOf(keys)
  const because = whoRendersCheck(kind).says

  if (who === 'EMPLOYER') {
    return (
      `${what} is the employer of record’s own check, not a document a desk reads the dates off. ${because} ` +
      `Keep what this desk was shown on the checklist; nothing recorded here discharges the firm that employs ` +
      `the person from running its own.`
    )
  }

  return (
    `${what} is a verdict a screening company renders, not a document a desk can read the dates off. ${because} ` +
    `No desk in Etyme renders it, so nothing goes on the compliance record from here — what would go on it is ` +
    `their report, with the company that ran it, their reference number and the day they ran it. Your note and ` +
    `the file stay on the checklist, which is the honest record of what the firm sent.`
  )
}

/**
 * The verification rows a verified checklist item should become, or
 * nothing and a sentence saying why.
 *
 * `needsDates` is the one refusal a screen acts on: it means the desk is
 * being asked for two dates rather than told it did something wrong.
 * Everything else that returns `ok: false` is an item that was never
 * going to be a verification — an unverified one, a waiver, a check
 * somebody ran, a paper somebody signed — and the caller carries on
 * without it.
 */
export function verificationFromChecklistItem(
  item: OnboardingEvidenceItem,
  companyId: string,
  by?: { personId?: string | null; at?: Date; documentTypes?: DefinedType[] }
): EvidenceVerdict {
  const at = by?.at ?? new Date()
  const nothing = (says: string, needsDates = false): EvidenceVerdict => ({ ok: false, rows: [], says, needsDates })

  if (!companyId) {
    return nothing(
      `${item.label} cannot go on a compliance record until the firm itself is on the register. ` +
        `Record it when the supplier is approved.`
    )
  }

  if (item.state !== 'HELD') {
    return nothing(
      item.state === 'WAIVED'
        ? `${item.label} was waived rather than verified, so there is no document to put on the record. The waiver and its reason stay on the checklist.`
        : `${item.label} is not verified yet, so there is nothing to record.`
    )
  }

  const keys = (item.answers ?? []).filter((k) => VERIFICATION_TYPE[k])

  // Whose assertion each one would be. A desk may repeat an assertion
  // somebody else printed; it may not make one on their behalf.
  const theirs = keys.filter((k) => renderedElsewhere(k) != null)
  const ours = keys.filter((k) => renderedElsewhere(k) == null)

  if (ours.length === 0 && theirs.length > 0) {
    return nothing(rendersElsewhereSays(theirs))
  }

  const compliance = ours.filter((k) => {
    const t = typeByKey(k, by?.documentTypes ?? [])
    return t == null || t.purpose === 'COMPLIANCE'
  })

  if (compliance.length === 0) {
    return nothing(
      `${item.label} is this desk’s own check rather than a document with a life of its own, ` +
        `so nothing here expires and there is nothing for the watch to chase. It stays on the checklist.`
    )
  }

  const validFrom = asDate(item.validFrom)
  const validUntil = asDate(item.validUntil)

  if (!validFrom || !validUntil) {
    return nothing(
      `Before ${item.label} counts as verified, say the day it starts and the day it runs out — ` +
        `they are printed on it. Cover that begins next month covers nobody starting this week, and a ` +
        `certificate filed with no expiry passes every check until the day somebody audits it.`,
      true
    )
  }

  if (validUntil.getTime() <= validFrom.getTime()) {
    return nothing(
      `${item.label} is dated as running out on ${onDay(validUntil)}, which is not after the day it ` +
        `starts, ${onDay(validFrom)}. Check the certificate and enter the two dates as printed.`,
      true
    )
  }

  if (validUntil.getTime() < at.getTime()) {
    return nothing(
      `${item.label} ran out on ${onDay(validUntil)}. An expired certificate is not evidence of ` +
        `anything — ask the firm for the current one, then mark it verified.`,
      true
    )
  }

  const notes =
    `Verified at supplier onboarding${item.fileName ? ` against ${item.fileName}` : ''}` +
    `${item.note ? `: ${item.note}` : '.'}`

  const rows: VerificationToWrite[] = compliance.map((key) => ({
    companyId,
    type: VERIFICATION_TYPE[key],
    documentTypeKey: key,
    status: 'CLEAR',
    validFrom,
    expiresAt: validUntil,
    // The day the paper began is the honest issue date where nobody
    // recorded a separate one; the floor is read off `validFrom` either
    // way, so this never becomes the answer to a question it cannot
    // answer.
    issuedAt: validFrom,
    verifiedAt: at,
    ...(by?.personId ? { uploadedById: by.personId, verifiedById: by.personId } : {}),
    result: { outcome: 'CLEAR' as const, notes },
  }))

  const what = rows.length === 1 ? 'a row' : `${rows.length} rows`
  return {
    ok: true,
    rows,
    needsDates: false,
    says:
      `${item.label} goes on the compliance record as ${what}, current until ${onDay(validUntil)}. ` +
      `The nightly watch will chase the renewal before it runs out.` +
      // One item can answer two things at once — a pack holding a
      // certificate and a screening report. What the desk may record is
      // recorded, and what it may not is named rather than dropped
      // silently, because a desk that is told nothing assumes it did the
      // whole job.
      (theirs.length > 0
        ? ` ${labelsOf(theirs)} ${theirs.length === 1 ? 'is not on it, because it is' : 'are not on it, because they are'} ` +
          `not this desk’s to render. ${whoRendersCheck(checkKindOf(theirs[0])!).says}`
        : ''),
  }
}

/**
 * The same answer for a whole checklist, for a caller replaying one at
 * approval.
 *
 * Kept beside the single-item door because a supplier is approved once
 * and its checklist holds several verified certificates by then;
 * iterating at the call site would mean each caller deciding what to do
 * with the refusals, and they all want the same thing — write what can
 * be written, and say what could not.
 */
export function verificationsFromChecklist(
  items: OnboardingEvidenceItem[],
  companyId: string,
  by?: { personId?: string | null; at?: Date; documentTypes?: DefinedType[] }
): { rows: VerificationToWrite[]; skipped: { key: string; says: string; needsDates: boolean }[] } {
  const rows: VerificationToWrite[] = []
  const skipped: { key: string; says: string; needsDates: boolean }[] = []

  for (const item of items) {
    const verdict = verificationFromChecklistItem(item, companyId, by)
    if (verdict.ok) rows.push(...verdict.rows)
    else if (item.state === 'HELD') skipped.push({ key: item.key, says: verdict.says, needsDates: verdict.needsDates })
  }

  return { rows, skipped }
}
