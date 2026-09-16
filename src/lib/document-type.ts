/**
 * What kind of thing a document is, said by the company that holds it.
 *
 * ── Why the list is not ours ─────────────────────────────────────────
 *
 * CLAUDE.md writes down seven documents from the founder's own account —
 * master agreement, visa, I-9, license, education, certificate of
 * insurance, certificate of good standing — and the tempting move is to
 * model those seven. That is the mistake `VerificationType` already made.
 * Its ten values are the ten somebody thought of, so a firm asked for an
 * export license, a site induction certificate, a client's own security
 * attestation or a state contractor registration has nowhere to put it
 * and waits for a migration to record paper it is already being chased
 * for.
 *
 * So the list belongs to the company. What belongs to us is the SHAPE a
 * type can take, and the founder's table is the test of that shape: a
 * change here is wrong if it makes one of those seven harder to express.
 *
 * ── Purpose is behavior, not a label ─────────────────────────────────
 *
 *   COMPLIANCE  has a validity window, is watched for expiry, gates a
 *               start, and gets chased. I-9, insurance, licenses,
 *               background checks, a certificate of good standing.
 *   AGREEMENT   is signed — sometimes by both sides — has a term, and is
 *               amended and versioned. MSA, NDA, SOW.
 *   PROOF       is attached as evidence. Usually never expires, and
 *               supports something else rather than standing alone.
 *               Degrees, transcripts, certifications.
 *
 * That maps onto the model clusters this codebase already grew, which is
 * the point rather than a coincidence: `Verification` is roughly
 * COMPLIANCE, `DocInstance` with `MasterAgreement` is roughly AGREEMENT,
 * attachments are PROOF. `DocumentPacket` is orthogonal to all three —
 * it is the request-and-collect mechanism and any purpose can be asked
 * for through it.
 *
 * ── Validity is three shapes, and the floor was never read ───────────
 *
 * NONE (a degree is true forever), END_ONLY (a visa runs out),
 * START_AND_END (insurance cover, a certificate of good standing). The
 * start is the live bug this file exists for: `Verification.issuedAt`
 * has been on the model all along and nothing has ever read it, so a
 * certificate whose cover begins on the first of next month passes today
 * as held, and somebody starts uninsured while the screen says green.
 *
 * ── Defaults ship in code ────────────────────────────────────────────
 *
 * A new US staffing firm can hire on its first day without defining an
 * I-9. `BUILT_IN` below is the dictionary every company starts with;
 * `typesFor` merges a company's own rows over it by key. A company that
 * has changed nothing has no rows at all, so a default added next month
 * reaches a company formed last month with no migration — the same rule
 * `lib/company-roles` already follows for roles.
 *
 * Nothing in here touches a database. Owned by etyme-architect because
 * compliance, money and demand all read it.
 */

// ── The words ─────────────────────────────────────────────────────────

export type Purpose = 'COMPLIANCE' | 'AGREEMENT' | 'PROOF'

export const PURPOSES: Purpose[] = ['COMPLIANCE', 'AGREEMENT', 'PROOF']

export const PURPOSE_SAYS: Record<Purpose, string> = {
  COMPLIANCE:
    'Has to be in date. It is watched, it is chased before it runs out, and a lapse can stop somebody working.',
  AGREEMENT:
    'Is signed, sometimes by both sides. It has a term, it is amended rather than overwritten, and every version is kept.',
  PROOF:
    'Is evidence. It usually never expires, and it stands behind something else rather than on its own.',
}

/** The three shapes validity comes in. Not a preference — see the table. */
export type ValidityShape = 'NONE' | 'END_ONLY' | 'START_AND_END'

export const VALIDITY_SHAPES: ValidityShape[] = ['NONE', 'END_ONLY', 'START_AND_END']

export const SHAPE_SAYS: Record<ValidityShape, string> = {
  NONE: 'Never expires. A degree earned in 2009 is still a degree.',
  END_ONLY: 'Runs out on a date. Nothing says when it started and nothing needs to.',
  START_AND_END:
    'Covers a period. Cover that begins next month covers nobody who starts this week, so the start is checked as well as the end.',
}

export type SignedBy = 'NOBODY' | 'ONE_PARTY' | 'BOTH_PARTIES'

export const SIGNED_BY: SignedBy[] = ['NOBODY', 'ONE_PARTY', 'BOTH_PARTIES']

/** Who owes it, which is who gets chased for it. */
export type SuppliedBy = 'CANDIDATE' | 'SUPPLIER' | 'CLIENT' | 'EMPLOYEE' | 'GOVERNMENT'

export const SUPPLIED_BY: SuppliedBy[] = ['CANDIDATE', 'SUPPLIER', 'CLIENT', 'EMPLOYEE', 'GOVERNMENT']

// ── A type, as this file reasons about it ─────────────────────────────

export interface DocumentTypeSpec {
  key: string
  label: string
  hint: string | null
  purpose: Purpose
  validityShape: ValidityShape
  /** Months an accepted one counts for where the paper carries no end date. */
  validMonths: number | null
  /** True where the issuer reissues the form and the edition is a fact about it. */
  reissued: boolean
  /** Keys of types that may back this one. Any ONE of them is enough. */
  backedByAnyOf: string[]
  /** True where a document of this type is not evidence on its own. */
  requiresBacking: boolean
  signedBy: SignedBy
  suppliedBy: SuppliedBy | null
  /** True where a missing or lapsed one stops work. */
  blocks: boolean
  /** True for one of the shipped defaults, whether or not it was renamed. */
  builtIn: boolean
}

function spec(s: Partial<DocumentTypeSpec> & { key: string; label: string; purpose: Purpose }): DocumentTypeSpec {
  return {
    hint: null,
    validityShape: 'NONE',
    validMonths: null,
    reissued: false,
    backedByAnyOf: [],
    requiresBacking: false,
    signedBy: 'NOBODY',
    suppliedBy: null,
    blocks: false,
    builtIn: true,
    ...s,
  }
}

// ── The dictionary a US staffing firm starts with ─────────────────────
//
// Every row here is one of the documents the founder named, plus the ones
// the packets already ask for. Each key matches a `VerificationType` or a
// `packets` item key where one exists, so nothing that already resolves
// stops resolving.

export const BUILT_IN: DocumentTypeSpec[] = [
  // ── COMPLIANCE ──
  spec({
    key: 'I9_EVERIFY',
    label: 'I-9 and E-Verify',
    hint: 'Federal work authorization. Nobody may start without it.',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    // The form itself does not expire; a work authorization behind it
    // does, and that date is recorded on the I-9 row when there is one.
    validMonths: null,
    reissued: true,
    // The invariant that matters: an I-9 is a form, not evidence. Which
    // list a document belongs to under the real rules is not modeled —
    // any one of these is recorded as what the form was completed from.
    backedByAnyOf: ['PASSPORT', 'GREEN_CARD', 'VISA', 'DRIVERS_LICENSE', 'RIGHT_TO_WORK', 'WORK_PERMIT'],
    requiresBacking: true,
    signedBy: 'BOTH_PARTIES',
    suppliedBy: 'EMPLOYEE',
    blocks: true,
  }),
  spec({
    key: 'RIGHT_TO_WORK',
    label: 'Proof of right to work',
    hint: 'Now that there is an offer, we take the document. You choose which one from the acceptable list — we do not.',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    suppliedBy: 'EMPLOYEE',
    blocks: true,
  }),
  spec({
    key: 'VISA',
    label: 'Visa',
    hint: 'The approval notice or the stamp, whichever you have.',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    suppliedBy: 'GOVERNMENT',
    blocks: true,
  }),
  spec({
    key: 'GREEN_CARD',
    label: 'Permanent resident card',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    suppliedBy: 'GOVERNMENT',
  }),
  spec({
    key: 'PASSPORT',
    label: 'Passport',
    hint: 'The biographic page. All pages with stamps, if you have them.',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    suppliedBy: 'CANDIDATE',
  }),
  spec({
    key: 'DRIVERS_LICENSE',
    label: 'Driver’s license',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    suppliedBy: 'CANDIDATE',
  }),
  spec({
    key: 'BACKGROUND_CHECK',
    label: 'Background check',
    hint: 'Through our provider, or yours if the client accepts it.',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    validMonths: 12,
    suppliedBy: 'CANDIDATE',
  }),
  spec({
    key: 'DRUG_SCREENING',
    label: 'Drug screening',
    hint: 'Where the client site requires it.',
    purpose: 'COMPLIANCE',
    validityShape: 'END_ONLY',
    validMonths: 12,
    suppliedBy: 'CANDIDATE',
  }),
  // The two the founder named as having a start AND an end. Cover printed
  // in August for a policy starting 1 September is the whole reason the
  // floor exists.
  spec({
    key: 'INSURANCE_GL',
    label: 'Certificate of general liability insurance',
    hint: 'Naming us as certificate holder. Your broker issues this.',
    purpose: 'COMPLIANCE',
    validityShape: 'START_AND_END',
    validMonths: 12,
    suppliedBy: 'SUPPLIER',
    blocks: true,
  }),
  spec({
    key: 'INSURANCE_WC',
    label: 'Certificate of workers’ compensation',
    hint: 'Required wherever your people work on our sites.',
    purpose: 'COMPLIANCE',
    validityShape: 'START_AND_END',
    validMonths: 12,
    suppliedBy: 'SUPPLIER',
    blocks: true,
  }),
  spec({
    key: 'INSURANCE_EO',
    label: 'Errors and omissions insurance',
    hint: 'Only where your people advise rather than deliver.',
    purpose: 'COMPLIANCE',
    validityShape: 'START_AND_END',
    validMonths: 12,
    suppliedBy: 'SUPPLIER',
  }),
  spec({
    key: 'INSURANCE_CYBER',
    label: 'Cyber liability insurance',
    hint: 'Required where your people touch our systems.',
    purpose: 'COMPLIANCE',
    validityShape: 'START_AND_END',
    validMonths: 12,
    suppliedBy: 'SUPPLIER',
  }),
  spec({
    key: 'GOOD_STANDING',
    label: 'Certificate of good standing',
    hint: 'From the state you are registered in, dated inside the last year.',
    purpose: 'COMPLIANCE',
    validityShape: 'START_AND_END',
    validMonths: 12,
    suppliedBy: 'SUPPLIER',
  }),
  spec({
    key: 'W9',
    label: 'W-9',
    hint: 'Signed, current year. This is how we set you up to be paid.',
    purpose: 'COMPLIANCE',
    validityShape: 'NONE',
    reissued: true,
    signedBy: 'ONE_PARTY',
    suppliedBy: 'SUPPLIER',
  }),
  spec({
    key: 'BUSINESS_PARTNER',
    label: 'Business registration',
    hint: 'Incorporation certificate, or your DUNS number.',
    purpose: 'COMPLIANCE',
    validityShape: 'NONE',
    suppliedBy: 'SUPPLIER',
  }),

  // ── AGREEMENT ──
  spec({
    key: 'MSA',
    label: 'Master service agreement',
    hint: 'The executed copy, signed by both firms.',
    purpose: 'AGREEMENT',
    validityShape: 'START_AND_END',
    signedBy: 'BOTH_PARTIES',
    suppliedBy: 'CLIENT',
  }),
  spec({
    key: 'NDA',
    label: 'Non-disclosure agreement',
    hint: 'Ours, unless the client supplies their own.',
    purpose: 'AGREEMENT',
    validityShape: 'START_AND_END',
    signedBy: 'BOTH_PARTIES',
    suppliedBy: 'CLIENT',
  }),
  spec({
    key: 'SOW',
    label: 'Statement of work',
    purpose: 'AGREEMENT',
    validityShape: 'START_AND_END',
    signedBy: 'BOTH_PARTIES',
    suppliedBy: 'CLIENT',
  }),

  // ── PROOF ──
  spec({
    key: 'RESUME',
    label: 'Resume',
    hint: 'The current one, as a PDF or Word file.',
    purpose: 'PROOF',
    suppliedBy: 'CANDIDATE',
  }),
  spec({
    key: 'DEGREE',
    label: 'Degree certificate and transcripts',
    hint: 'Plus a credential evaluation if the degree is from outside the US.',
    purpose: 'PROOF',
    suppliedBy: 'CANDIDATE',
  }),
  spec({
    key: 'EDUCATION_EVALUATION',
    label: 'Credential evaluation',
    hint: 'WES or ECE. Only for degrees earned outside the US.',
    purpose: 'PROOF',
    suppliedBy: 'CANDIDATE',
  }),
  spec({
    key: 'REFERENCE_CHECK',
    label: 'References',
    hint: 'Names and contact details from the last two engagements.',
    purpose: 'PROOF',
    validityShape: 'END_ONLY',
    validMonths: 24,
    suppliedBy: 'CANDIDATE',
  }),
]

const BUILT_IN_BY_KEY = new Map(BUILT_IN.map((t) => [t.key, t]))

export function builtInType(key: string): DocumentTypeSpec | null {
  return BUILT_IN_BY_KEY.get(key) ?? null
}

/**
 * A row as it comes out of the database, loosely typed so a caller can
 * hand a Prisma row straight in.
 */
export interface DefinedType {
  key: string
  label: string
  hint?: string | null
  purpose: string
  validityShape: string
  validMonths?: number | null
  reissued?: boolean
  backedByAnyOf?: string[]
  requiresBacking?: boolean
  signedBy?: string
  suppliedBy?: string | null
  blocks?: boolean
  builtIn?: boolean
  archivedAt?: Date | null
}

function isPurpose(v: string): v is Purpose {
  return (PURPOSES as string[]).includes(v)
}
function isShape(v: string): v is ValidityShape {
  return (VALIDITY_SHAPES as string[]).includes(v)
}

/**
 * The dictionary this company actually works with.
 *
 * Shipped defaults first, the company's own rows over the top by key, and
 * anything the company archived taken out. A firm that has changed
 * nothing has no rows and still gets the whole list, which is why nobody
 * has to define an I-9 before they can hire.
 */
export function typesFor(defined: DefinedType[] = []): DocumentTypeSpec[] {
  const out = new Map<string, DocumentTypeSpec>()
  for (const t of BUILT_IN) out.set(t.key, t)

  for (const row of defined) {
    if (row.archivedAt) {
      out.delete(row.key)
      continue
    }
    const base = out.get(row.key)
    out.set(row.key, {
      key: row.key,
      label: row.label,
      hint: row.hint ?? base?.hint ?? null,
      purpose: isPurpose(row.purpose) ? row.purpose : (base?.purpose ?? 'PROOF'),
      validityShape: isShape(row.validityShape) ? row.validityShape : (base?.validityShape ?? 'NONE'),
      validMonths: row.validMonths ?? null,
      reissued: row.reissued ?? base?.reissued ?? false,
      backedByAnyOf: row.backedByAnyOf ?? base?.backedByAnyOf ?? [],
      requiresBacking: row.requiresBacking ?? base?.requiresBacking ?? false,
      signedBy: ((row.signedBy ?? base?.signedBy ?? 'NOBODY') as SignedBy),
      suppliedBy: ((row.suppliedBy ?? base?.suppliedBy ?? null) as SuppliedBy | null),
      blocks: row.blocks ?? base?.blocks ?? false,
      builtIn: base != null,
    })
  }

  return [...out.values()]
}

export function typeByKey(key: string, defined: DefinedType[] = []): DocumentTypeSpec | null {
  return typesFor(defined).find((t) => t.key === key) ?? null
}

// ── Defining one ──────────────────────────────────────────────────────

export interface Verdict {
  ok: boolean
  /** What is missing and what to do. Never a bare code. */
  says: string
}

const KEY_SHAPE = /^[A-Z][A-Z0-9_]{1,39}$/

/**
 * Whether a company may add this type.
 *
 * Every refusal names the thing that is wrong and the next move, because
 * the person adding a document type is a compliance officer and not a
 * programmer, and "INVALID_KEY" tells them nothing they can act on.
 */
export function mayDefine(
  input: { key: string; label: string; purpose: string; validityShape: string; validMonths?: number | null },
  existing: DefinedType[]
): Verdict {
  const key = input.key.trim().toUpperCase()

  if (!KEY_SHAPE.test(key)) {
    return {
      ok: false,
      says:
        'Give the document a short code in capitals, like EXPORT_LICENSE or SITE_INDUCTION. ' +
        'It is what reports and imports match on, so it cannot have spaces or punctuation.',
    }
  }

  if (!input.label.trim()) {
    return {
      ok: false,
      says: 'Name the document the way the person handing it over would name it. That name is what they will see.',
    }
  }

  if (existing.some((t) => t.key === key && !t.archivedAt)) {
    return {
      ok: false,
      says: `You already have a document type called ${key}. Edit that one instead of adding a second with the same code.`,
    }
  }

  if (!isPurpose(input.purpose)) {
    return {
      ok: false,
      says:
        'Say what this document is for: compliance if it has to be in date, ' +
        'an agreement if somebody signs it, or proof if it is evidence behind something else.',
    }
  }

  if (!isShape(input.validityShape)) {
    return {
      ok: false,
      says:
        'Say how long it is good for: never expires, runs out on a date, or covers a period with a start and an end.',
    }
  }

  if (input.validityShape === 'NONE' && input.validMonths != null) {
    return {
      ok: false,
      says:
        'This type is set to never expire, so a number of months has nothing to apply to. ' +
        'Either drop the months, or say it runs out on a date.',
    }
  }

  if (input.validMonths != null && input.validMonths < 1) {
    return {
      ok: false,
      says: 'How many months is a document of this kind good for? It has to be at least one.',
    }
  }

  return { ok: true, says: `${input.label.trim()} added.` }
}

// ── Validity, with the floor read ─────────────────────────────────────

export type Validity =
  /** No dates at all, and the type says it never expires. */
  | 'PERMANENT'
  /** It exists, and the period it covers has not started. */
  | 'NOT_YET_VALID'
  | 'VALID'
  | 'EXPIRING'
  | 'EXPIRED'
  /** The kind expires and nothing on file says when. */
  | 'NO_EXPIRY_RECORDED'

/** Chase this far ahead. Long enough to renew an insurance certificate. */
export const EXPIRING_WITHIN_DAYS = 30

const DAY = 86_400_000

export interface Dates {
  /** The day cover begins, where the paper says so. */
  validFrom?: Date | null
  /** The day the paper was issued. The fallback floor. */
  issuedAt?: Date | null
  expiresAt?: Date | null
}

/**
 * The day this document starts covering anybody, or null for no floor.
 *
 * `validFrom` first because that is the policy period; `issuedAt` second
 * because for most paper the day it was issued is the day it starts. Both
 * null is a real answer — a degree certificate has no floor — and it is
 * why this returns null rather than the epoch.
 */
export function floorOf(d: Dates, shape: ValidityShape): Date | null {
  if (shape !== 'START_AND_END') return null
  return d.validFrom ?? d.issuedAt ?? null
}

/**
 * The day this document stops counting, or null for none.
 *
 * Where the paper carries no end date but the kind expires, the issue
 * date plus the window stands in — the same fallback `document-stages`
 * has always used, kept so nothing changes meaning.
 */
export function ceilingOf(d: Dates, shape: ValidityShape, validMonths: number | null): Date | null {
  if (shape === 'NONE') return null
  if (d.expiresAt) return d.expiresAt
  if (validMonths != null && d.issuedAt) return addMonths(d.issuedAt, validMonths)
  return null
}

/** The same day, this many months on, and the last day of a short month. */
export function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate()
  const out = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, lastDay))
  return out
}

export interface ValidityVerdict {
  validity: Validity
  /** Days until it runs out. Negative once it has. Null where there is no end. */
  daysLeft: number | null
  /** Days until cover begins. Null once it has, or where there is no floor. */
  daysUntilStart: number | null
  /** True where the document exists but does not cover today. */
  inForce: boolean
  says: string
}

function onDay(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Where a held document stands today — the floor as well as the ceiling.
 *
 * The floor is the whole reason this function exists. `issuedAt` has been
 * on `Verification` since the model was written and nothing has ever read
 * it, so a certificate of insurance whose cover begins on the first of
 * next month reads today as held, and somebody starts on a site with no
 * cover behind them while the screen says green. Checking the ceiling and
 * not the floor is not half a check; on a renewal filed early it is the
 * wrong answer.
 */
export function validityOf(
  d: Dates,
  type: Pick<DocumentTypeSpec, 'label' | 'validityShape' | 'validMonths'>,
  on: Date,
  expiringWithinDays = EXPIRING_WITHIN_DAYS
): ValidityVerdict {
  const floor = floorOf(d, type.validityShape)
  const ceiling = ceilingOf(d, type.validityShape, type.validMonths)

  if (floor && floor.getTime() > on.getTime()) {
    const days = Math.ceil((floor.getTime() - on.getTime()) / DAY)
    return {
      validity: 'NOT_YET_VALID',
      daysLeft: ceiling ? Math.floor((ceiling.getTime() - on.getTime()) / DAY) : null,
      daysUntilStart: days,
      inForce: false,
      says:
        `${type.label} does not start until ${onDay(floor)} — ${plural(days, 'day', 'days')} away. ` +
        `It is on file and it does not cover today.`,
    }
  }

  if (!ceiling) {
    if (type.validityShape === 'NONE') {
      return {
        validity: 'PERMANENT',
        daysLeft: null,
        daysUntilStart: null,
        inForce: true,
        says: `${type.label} is on file and does not expire.`,
      }
    }
    return {
      validity: 'NO_EXPIRY_RECORDED',
      daysLeft: null,
      daysUntilStart: null,
      inForce: true,
      says:
        `${type.label} is on file with no expiry date recorded, and this kind expires. ` +
        `Add the date — an unknown expiry passes every check until the day somebody audits it.`,
    }
  }

  const days = Math.floor((ceiling.getTime() - on.getTime()) / DAY)

  if (days < 0) {
    return {
      validity: 'EXPIRED',
      daysLeft: days,
      daysUntilStart: null,
      inForce: false,
      says: `${type.label} expired ${plural(Math.abs(days), 'day', 'days')} ago.`,
    }
  }
  if (days <= expiringWithinDays) {
    return {
      validity: 'EXPIRING',
      daysLeft: days,
      daysUntilStart: null,
      inForce: true,
      says: `${type.label} expires in ${plural(days, 'day', 'days')}. Ask for the renewal now.`,
    }
  }
  return {
    validity: 'VALID',
    daysLeft: days,
    daysUntilStart: null,
    inForce: true,
    says: `${type.label} is valid for ${plural(days, 'day', 'days')} more.`,
  }
}

// ── Editions ──────────────────────────────────────────────────────────

export interface Edition {
  edition: string
  effectiveFrom: Date
  /** The day the issuer stopped accepting it. Null = still current. */
  retiredAt?: Date | null
}

/**
 * The edition that was the one to use on a given day, or null where the
 * company has not said.
 *
 * Null rather than a guess: handing back the newest edition for a company
 * that never recorded any would declare every historical form out of date
 * on no evidence, which is a plausible wrong answer on hundreds of rows.
 */
export function currentEdition(editions: Edition[], on: Date): Edition | null {
  let best: Edition | null = null
  for (const e of editions) {
    if (e.effectiveFrom.getTime() > on.getTime()) continue
    if (e.retiredAt && e.retiredAt.getTime() <= on.getTime()) continue
    if (!best || e.effectiveFrom.getTime() > best.effectiveFrom.getTime()) best = e
  }
  return best
}

export type EditionStanding =
  /** The type does not say it is reissued, so there is no edition to be wrong. */
  | 'NOT_APPLICABLE'
  /** The company has recorded no editions, so nothing can be judged. */
  | 'UNKNOWN'
  /** Reissued, and nothing on file says which edition was used. */
  | 'UNRECORDED'
  /** The edition in force on the day it was completed. */
  | 'CURRENT'
  /** An edition the issuer had already replaced by the day it was completed. */
  | 'SUPERSEDED'

export interface EditionFinding {
  standing: EditionStanding
  /** The edition that should have been used, where one is known. */
  expected: string | null
  recorded: string | null
  says: string
  /** What to do about it, or null where there is nothing to do. */
  fix: string | null
}

/**
 * Whether the edition somebody signed was the right one on the day.
 *
 * Judged against the day the form was completed, not against today. A
 * 2019 I-9 signed in 2020 was correct when it was signed and stays
 * correct forever; the same edition signed last week is the finding. A
 * system that judged both against today would raise an alarm on every
 * historical form in the file and teach everybody to ignore it.
 *
 * This warns rather than blocks, and that is a choice worth naming.
 * Addendum E allows a block where it is legally grounded — tenure, break
 * in service, work authorization, lapsed cover, segregation of duties. A
 * superseded I-9 edition is none of those: the person IS authorized, the
 * paperwork is wrong, and the remedy is to re-execute the form rather
 * than to stop the work. Refusing the start instead would stop a job over
 * a form revision, which is the workaround trap. The one place to change
 * it, if the founder decides otherwise, is the severity where
 * `contract-clearance` reads this.
 */
export function editionFinding(
  type: Pick<DocumentTypeSpec, 'label' | 'reissued'>,
  recorded: string | null | undefined,
  completedOn: Date | null | undefined,
  editions: Edition[]
): EditionFinding {
  if (!type.reissued) {
    return {
      standing: 'NOT_APPLICABLE',
      expected: null,
      recorded: recorded ?? null,
      says: `${type.label} is not reissued, so there is no edition to check.`,
      fix: null,
    }
  }

  const known = editions.length > 0
  const expected = completedOn ? currentEdition(editions, completedOn) : currentEdition(editions, new Date(0))

  if (!known) {
    return {
      standing: 'UNKNOWN',
      expected: null,
      recorded: recorded ?? null,
      says:
        `Nothing on file says which edition of the ${type.label} is the current one, ` +
        `so no edition can be judged right or wrong.`,
      fix: `Record the editions of the ${type.label} and the day each became current.`,
    }
  }

  if (!recorded || !recorded.trim()) {
    return {
      standing: 'UNRECORDED',
      expected: expected?.edition ?? null,
      recorded: null,
      says:
        `The ${type.label} on file does not say which edition it is. The government reissues this form, ` +
        `and which edition somebody signed is the first thing an auditor asks.`,
      fix: `Open the ${type.label} and record the edition printed on it.`,
    }
  }

  if (!expected) {
    return {
      standing: 'UNKNOWN',
      expected: null,
      recorded: recorded.trim(),
      says:
        `The ${type.label} on file is edition ${recorded.trim()}, and nothing says which edition ` +
        `was current on the day it was completed.`,
      fix: `Record when edition ${recorded.trim()} of the ${type.label} was in force.`,
    }
  }

  if (expected.edition === recorded.trim()) {
    return {
      standing: 'CURRENT',
      expected: expected.edition,
      recorded: recorded.trim(),
      says: `The ${type.label} on file is edition ${expected.edition}, which was the current one when it was signed.`,
      fix: null,
    }
  }

  return {
    standing: 'SUPERSEDED',
    expected: expected.edition,
    recorded: recorded.trim(),
    says:
      `The ${type.label} on file is edition ${recorded.trim()}, and edition ${expected.edition} ` +
      `was the one in force when it was signed. An out-of-date edition is an audit finding.`,
    fix: `Re-execute the ${type.label} on edition ${expected.edition}.`,
  }
}

/** The edition to use today, for a form somebody is about to complete. */
export function editionToUse(editions: Edition[], on: Date): string | null {
  return currentEdition(editions, on)?.edition ?? null
}

// ── Composition ───────────────────────────────────────────────────────

export interface BackingDocument {
  /** The type key of the evidence. */
  key: string
  /** True where the evidence itself covers today. Expired proof is not proof. */
  inForce: boolean
  label?: string
}

export type BackingStanding =
  /** This type stands on its own. */
  | 'NOT_REQUIRED'
  /** Backed by something acceptable, and that something is in date. */
  | 'BACKED'
  /** Backed, but every backing document has expired or has not started. */
  | 'BACKING_NOT_IN_FORCE'
  /** Nothing at all stands behind it. */
  | 'UNSUPPORTED'

export interface BackingFinding {
  standing: BackingStanding
  /** The keys that would satisfy it. */
  acceptable: string[]
  /** The keys actually standing behind it. */
  held: string[]
  says: string
  fix: string | null
}

function orList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/**
 * Whether a form has anything behind it.
 *
 * "A held I-9 with nothing behind it is not held." An I-9 is a form the
 * employer fills in from a document the worker chose to show; the form is
 * a record that somebody looked, and a record of looking with no record
 * of what was looked at is not evidence of anything.
 *
 * The real rules are List A on its own, or one from List B with one from
 * List C. That is not modeled here and deliberately so — the founder
 * asked for the invariant, not the ruleset, and a half-built List B+C
 * would refuse real combinations while looking authoritative. Any one
 * acceptable document counts, and which one was looked at is recorded.
 */
export function backingFinding(
  type: Pick<DocumentTypeSpec, 'label' | 'requiresBacking' | 'backedByAnyOf'>,
  backing: BackingDocument[],
  labelOf: (key: string) => string = (k) => k
): BackingFinding {
  const acceptable = type.backedByAnyOf ?? []

  if (!type.requiresBacking) {
    return {
      standing: 'NOT_REQUIRED',
      acceptable,
      held: [],
      says: `${type.label} stands on its own.`,
      fix: null,
    }
  }

  const relevant = backing.filter((b) => acceptable.length === 0 || acceptable.includes(b.key))
  const live = relevant.filter((b) => b.inForce)

  if (live.length > 0) {
    return {
      standing: 'BACKED',
      acceptable,
      held: live.map((b) => b.key),
      says: `${type.label} was completed from ${orList(live.map((b) => b.label ?? labelOf(b.key)))}.`,
      fix: null,
    }
  }

  if (relevant.length > 0) {
    return {
      standing: 'BACKING_NOT_IN_FORCE',
      acceptable,
      held: relevant.map((b) => b.key),
      says:
        `${type.label} is on file, and the ${orList(relevant.map((b) => b.label ?? labelOf(b.key)))} ` +
        `behind it does not cover today. A form backed by expired proof proves nothing.`,
      fix: `Take a current document and record the ${type.label} against it.`,
    }
  }

  return {
    standing: 'UNSUPPORTED',
    acceptable,
    held: [],
    says:
      `${type.label} is on file with nothing behind it. It is a form, not evidence — ` +
      `it records that somebody looked at a document, and no document is recorded.`,
    fix:
      acceptable.length > 0
        ? `Record the document it was completed from — ${orList(acceptable.map(labelOf))} — against it.`
        : `Record the document it was completed from against it.`,
  }
}

/** Labels for the built-in keys, so a refusal reads in words. */
export function labelFor(key: string, defined: DefinedType[] = []): string {
  return typeByKey(key, defined)?.label ?? key
}
