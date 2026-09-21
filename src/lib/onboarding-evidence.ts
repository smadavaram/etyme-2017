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
 * No database in here. It returns the row to write; the route writes it.
 * That is deliberate — the supplier's own company row does not exist
 * until Finance approves the firm, so when the write happens is the
 * caller's problem and what to write is this file's.
 */

import { typeByKey, type DefinedType } from '@/lib/document-type'

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
  const compliance = keys.filter((k) => {
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
      `The nightly watch will chase the renewal before it runs out.`,
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
