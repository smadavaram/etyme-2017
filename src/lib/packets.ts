/**
 * Packets — a named list of what you need from somebody, or what you send.
 *
 * Four models covered pieces of documents and none of them was a list.
 * DocTemplate sent your papers out for signature. Verification recorded a
 * check on a person or company. DocumentShare pushed files to a lawyer by
 * expiring link. Nothing could express "to onboard as a vendor I need your
 * W-9, your certificate of insurance, a signed agreement and a bank
 * letter" and then show three of four arriving.
 *
 * So the most common thing a real program does every week — chase a
 * partner for documents — had no home, and the reverse, sending your own
 * pack during a submission, was manual.
 *
 * Two ideas make this small rather than large.
 *
 * **One object, both directions.** Collecting and sending are the same
 * thing seen from two ends. A packet definition describes a set of
 * documents and a purpose; whether you are asking or answering is a
 * property of the request, not of the list.
 *
 * **Never ask for what you already hold.** A packet resolves against
 * existing verifications first and asks only for the gaps. Asking a
 * supplier for a certificate of insurance you are already holding, that
 * does not expire for eight months, is how a system teaches people to
 * ignore it.
 */

export type Purpose =
  | 'VENDOR_ONBOARDING'
  | 'CLIENT_ONBOARDING'
  | 'SUBMISSION'
  | 'CONTRACT_START'
  | 'COMPLIANCE_ANNUAL'
  | 'IMMIGRATION'
  // ── The other direction ────────────────────────────────────────────
  //
  // A staffing vendor spends as much time being screened as screening.
  // These are the reasons somebody asks US for documents; the packs
  // themselves live in src/lib/outbound-pack.ts because what may go out
  // is a different question from what may be asked for. Added here so
  // both directions share one Purpose rather than drifting into two.
  | 'CLIENT_SCREENING'
  | 'INSURANCE_PROOF'
  | 'SECURITY_REVIEW'
  | 'RFP_BID'
  | 'PAYMENT_SETUP'

/** Who the packet is about — a company, or a person. */
export type SubjectKind = 'COMPANY' | 'PERSON'

export interface ItemSpec {
  /** Matches VerificationType where one applies, or a free name. */
  key: string
  label: string
  /** What the counterparty is actually being asked for, in their words. */
  hint: string
  /** A packet that is not complete without it. */
  required: boolean
  /**
   * How long an accepted document counts for. Null means it does not
   * expire — an incorporation certificate is not reissued annually.
   */
  validMonths: number | null
}

export interface PacketSpec {
  key: string
  label: string
  purpose: Purpose
  subject: SubjectKind
  /** Said to the counterparty at the top of the page. */
  preamble: string
  items: ItemSpec[]
}

// ── The packets a staffing program actually runs ────────────────────

export const PACKETS: PacketSpec[] = [
  {
    key: 'VENDOR_ONBOARDING_US',
    label: 'Bringing on a supplier (US)',
    purpose: 'VENDOR_ONBOARDING',
    subject: 'COMPANY',
    preamble:
      'Before we can place anybody through you or pay an invoice, we need these on file. Most take a few minutes.',
    items: [
      { key: 'W9', label: 'W-9', hint: 'Signed, current year. This is how we set you up to be paid.', required: true, validMonths: null },
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', hint: 'Naming us as certificate holder. Your broker issues this.', required: true, validMonths: 12 },
      { key: 'INSURANCE_WC', label: "Certificate of workers' compensation", hint: 'Required wherever your people work on our sites.', required: true, validMonths: 12 },
      { key: 'BANK_LETTER', label: 'Bank letter or voided cheque', hint: 'So payments reach the right account. We only keep the last four digits.', required: true, validMonths: null },
      { key: 'BUSINESS_PARTNER', label: 'Business registration', hint: 'Incorporation certificate, or your DUNS number.', required: true, validMonths: null },
      { key: 'INSURANCE_EO', label: 'Errors and omissions insurance', hint: 'Only where your people advise rather than deliver.', required: false, validMonths: 12 },
      { key: 'INSURANCE_CYBER', label: 'Cyber liability insurance', hint: 'Required where your people touch our systems.', required: false, validMonths: 12 },
    ],
  },
  {
    key: 'SUBMISSION_STANDARD',
    label: 'Submitting a candidate',
    purpose: 'SUBMISSION',
    subject: 'PERSON',
    preamble: 'What we need alongside the resume before this person can be put forward.',
    items: [
      { key: 'RESUME', label: 'Resume', hint: 'The current one, as a PDF or Word file.', required: true, validMonths: null },
      // A QUESTION, not a document.
      //
      // This used to ask for "passport, green card, or visa approval
      // notice" at submission — before any offer. That is document abuse
      // under the INA: the employer picks which document it wants to see,
      // before the point the law lets it ask at all. The UK is the same
      // shape, and holding identity papers for somebody you have not
      // offered a job to fails data minimization across the EU.
      //
      // The business still finds out what it needed to know. The document
      // itself is collected at award, in CONTRACT_START.
      { key: 'WORK_AUTH_QUESTION', label: 'Work authorization', hint: 'Are you authorized to work in this country, and will you need sponsorship now or in the future?', required: true, validMonths: null },
      { key: 'REFERENCE_CHECK', label: 'Two references', hint: 'Names and contact details from the last two engagements.', required: false, validMonths: 24 },
    ],
  },
  {
    key: 'CONTRACT_START_W2',
    label: 'Starting somebody (W-2)',
    purpose: 'CONTRACT_START',
    subject: 'PERSON',
    preamble: 'Before the first day. Some of these are legally required before any work is done.',
    items: [
      { key: 'RIGHT_TO_WORK', label: 'Proof of right to work', hint: 'Now that there is an offer, we take the document. You choose which one from the acceptable list — we do not.', required: true, validMonths: null },
      { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', hint: 'Federal work authorization. Nobody may start without it.', required: true, validMonths: null },
      { key: 'BACKGROUND_CHECK', label: 'Background check', hint: 'Through our provider, or yours if the client accepts it.', required: true, validMonths: 12 },
      { key: 'DRUG_SCREENING', label: 'Drug screening', hint: 'Where the client site requires it.', required: false, validMonths: 12 },
      { key: 'NDA', label: 'Signed non-disclosure agreement', hint: 'Ours, unless the client supplies their own.', required: true, validMonths: null },
    ],
  },
  {
    // The licensed twin of CONTRACT_START_W2. Everything that packet asks
    // for, plus the one document the law rather than the client requires:
    // the state license the person practices on.
    //
    // A separate packet rather than an optional item on the W-2 one,
    // because an optional item that is only required for some people is
    // how a required item stops being required. Which of the two a start
    // uses is `startPacketFor` below, off the role.
    key: 'CONTRACT_START_LICENSED',
    label: 'Starting somebody in a licensed role',
    purpose: 'CONTRACT_START',
    subject: 'PERSON',
    preamble:
      'Before the first day. This role cannot lawfully be worked without a current license, so that one is not optional.',
    items: [
      { key: 'PROFESSIONAL_LICENSE', label: 'State license', hint: 'The license you practice on — the number, the state that issued it, and the day it runs out.', required: true, validMonths: null },
      { key: 'RIGHT_TO_WORK', label: 'Proof of right to work', hint: 'Now that there is an offer, we take the document. You choose which one from the acceptable list — we do not.', required: true, validMonths: null },
      { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', hint: 'Federal work authorization. Nobody may start without it.', required: true, validMonths: null },
      { key: 'BACKGROUND_CHECK', label: 'Background check', hint: 'Through our provider, or yours if the client accepts it.', required: true, validMonths: 12 },
      { key: 'DRUG_SCREENING', label: 'Drug screening', hint: 'Where the client site requires it.', required: false, validMonths: 12 },
      { key: 'NDA', label: 'Signed non-disclosure agreement', hint: 'Ours, unless the client supplies their own.', required: true, validMonths: null },
    ],
  },
  {
    // What the nightly chase sends a person whose license is running out.
    //
    // COMPLIANCE_ANNUAL is the company-side version of exactly this, and
    // it is the one the watcher already knows how to raise. A license is
    // a person's, not a firm's, so the subject and the words are
    // different and nothing else is.
    key: 'CREDENTIAL_RENEWAL',
    label: 'Renewing a license',
    purpose: 'COMPLIANCE_ANNUAL',
    subject: 'PERSON',
    preamble:
      'Your license is close to running out. Working on a lapsed license is not something anybody can waive, so this is worth doing before it does.',
    items: [
      { key: 'PROFESSIONAL_LICENSE', label: 'State license — renewal', hint: 'The renewed license: the number and the new expiry date.', required: true, validMonths: null },
    ],
  },
  {
    key: 'COMPLIANCE_ANNUAL',
    label: 'Annual supplier refresh',
    purpose: 'COMPLIANCE_ANNUAL',
    subject: 'COMPANY',
    preamble:
      'Your insurance certificates are close to expiring. Lapsed cover stops us placing anybody through you, so this is worth doing before it does.',
    items: [
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', hint: 'The renewed one.', required: true, validMonths: 12 },
      { key: 'INSURANCE_WC', label: "Certificate of workers' compensation", hint: 'The renewed one.', required: true, validMonths: 12 },
      { key: 'W9', label: 'W-9', hint: 'Only if anything about your entity has changed.', required: false, validMonths: null },
    ],
  },
  {
    key: 'IMMIGRATION_H1B',
    label: 'H-1B petition pack',
    purpose: 'IMMIGRATION',
    subject: 'PERSON',
    preamble:
      'For your attorney. These are what a petition is assembled from — send them once and we will share the file directly with counsel.',
    items: [
      { key: 'PASSPORT', label: 'Passport biographic page', hint: 'All pages with stamps, if you have them.', required: true, validMonths: null },
      { key: 'I94', label: 'Most recent I-94', hint: 'Downloadable from the CBP website.', required: true, validMonths: null },
      { key: 'DEGREE', label: 'Degree certificate and transcripts', hint: 'Plus a credential evaluation if the degree is from outside the US.', required: true, validMonths: null },
      { key: 'EDUCATION_EVALUATION', label: 'Credential evaluation', hint: 'WES or ECE. Only for degrees earned outside the US.', required: false, validMonths: null },
      { key: 'PRIOR_APPROVALS', label: 'Previous approval notices', hint: 'Any I-797 you have been issued before.', required: false, validMonths: null },
    ],
  },
]

// ── Which roles cannot be worked without a license ────────────────────
//
// Data, not a conditional, so a change of law is a change of a line — and
// so that somebody who is not a programmer can be walked through why a
// role asks for a license.
//
// Deliberately narrow. A matcher that fires on "engineer" would ask a
// validation engineer at a pharmaceutical client for a license that does
// not exist, on every start, forever — and a requirement that fires on
// everybody is a click rather than a requirement. Every row here names a
// title where a regulator, not an employer, decides who may do the work.
// A role this table does not recognize asks for nothing extra, which is
// the right failure: the held-license block in `lib/contract-clearance`
// still catches anybody who actually holds one.
//
// Horizontal, per CLAUDE.md: healthcare is the first industry in here and
// is not the only one. A client whose trade is not listed adds its own
// blocking document type instead — see `credentialKeys`.

export interface LicensedOccupation {
  key: string
  label: string
  /** Words that name this occupation in a role title, lowercase. */
  names: string[]
  /** What the license is called, in the words the person would use. */
  credential: string
  /** Who issues it. */
  issuer: string
}

export const LICENSED_OCCUPATIONS: LicensedOccupation[] = [
  // ── Healthcare ──
  { key: 'NURSE', label: 'Nursing', names: ['nurse', 'nursing', 'rn', 'lpn', 'lvn', 'crna', 'cna'], credential: 'state nursing license', issuer: "the state's board of nursing" },
  { key: 'PHYSICIAN', label: 'Medicine', names: ['physician', 'doctor', 'hospitalist', 'surgeon', 'anesthesiologist', 'radiologist'], credential: 'state medical license', issuer: "the state's medical board" },
  { key: 'ADVANCED_PRACTICE', label: 'Advanced practice', names: ['nurse practitioner', 'physician assistant', 'midwife'], credential: 'state practice license', issuer: "the state's licensing board" },
  { key: 'PHARMACY', label: 'Pharmacy', names: ['pharmacist', 'pharmacy technician'], credential: 'state pharmacy license', issuer: "the state's board of pharmacy" },
  { key: 'THERAPY', label: 'Therapy', names: ['physical therapist', 'occupational therapist', 'respiratory therapist', 'speech language pathologist', 'physiotherapist'], credential: 'state therapy license', issuer: "the state's licensing board" },
  { key: 'IMAGING', label: 'Imaging and laboratory', names: ['radiologic technologist', 'sonographer', 'mri technologist', 'medical technologist', 'phlebotomist'], credential: 'state certification', issuer: "the state's health department" },
  { key: 'SOCIAL_WORK', label: 'Social work', names: ['social worker', 'clinical counselor', 'psychologist'], credential: 'state license', issuer: "the state's licensing board" },
  // ── Everything else, so nothing here reads as a healthcare product ──
  { key: 'PROFESSIONAL_ENGINEER', label: 'Professional engineering', names: ['professional engineer', 'licensed engineer', 'structural engineer', 'land surveyor'], credential: 'professional engineer registration', issuer: "the state's board of engineers" },
  { key: 'TRADES', label: 'Licensed trades', names: ['electrician', 'plumber', 'journeyman', 'crane operator', 'hvac technician'], credential: 'trade license', issuer: "the state's licensing authority" },
  { key: 'COMMERCIAL_DRIVER', label: 'Commercial driving', names: ['cdl driver', 'truck driver', 'commercial driver'], credential: 'commercial driver\u2019s license', issuer: "the state's motor vehicle authority" },
  { key: 'ACCOUNTING', label: 'Public accounting', names: ['cpa', 'certified public accountant'], credential: 'CPA license', issuer: "the state's board of accountancy" },
  { key: 'LEGAL', label: 'Law', names: ['attorney', 'solicitor', 'barrister'], credential: 'bar admission', issuer: "the state bar" },
  { key: 'ARCHITECTURE', label: 'Architecture', names: ['licensed architect', 'registered architect'], credential: 'architect registration', issuer: "the state's board of architects" },
]

/**
 * The occupation a role title names, where it names a licensed one.
 *
 * Null is the ordinary answer and is a real one: most work needs no
 * license, and guessing would put a permanent warning on every start.
 * Matched on whole words, so "engineering manager" does not match
 * "engineer" in "professional engineer" and "cna" does not match inside
 * "financial".
 */
export function licensedOccupation(role: string | null | undefined): LicensedOccupation | null {
  if (!role || !role.trim()) return null
  const text = role.toLowerCase()
  // Longest phrase first, so "nurse practitioner" wins over "nurse" and
  // the sentence names the right board.
  const candidates = LICENSED_OCCUPATIONS.flatMap((o) =>
    o.names.map((n) => ({ occupation: o, name: n }))
  ).sort((a, b) => b.name.length - a.name.length)
  for (const { occupation, name } of candidates) {
    const pattern = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`)
    if (pattern.test(text)) return occupation
  }
  return null
}

/**
 * Which start packet a role uses.
 *
 * A licensed role asks for the license; everything else asks for what it
 * always asked for. Callers that do not know the role get the W-2 packet,
 * unchanged — this widens the ask, it never narrows it.
 */
export function startPacketFor(role: string | null | undefined, fallback = 'CONTRACT_START_W2'): string {
  return licensedOccupation(role) ? 'CONTRACT_START_LICENSED' : fallback
}

export function packetByKey(key: string): PacketSpec | null {
  return PACKETS.find((p) => p.key === key) ?? null
}

export function packetsFor(purpose: Purpose): PacketSpec[] {
  return PACKETS.filter((p) => p.purpose === purpose)
}

// ── Resolving against what is already held ────────────────────────────

export interface HeldDocument {
  /** Matches ItemSpec.key. */
  key: string
  /**
   * When it starts counting. Null means there is no floor — which is the
   * truth for a degree certificate and a lie for an insurance policy.
   * Added 2026-09-16: cover beginning next month covers nobody starting
   * this week, and until then this asked only when it ran out.
   */
  validFrom?: Date | null
  /** When it stops counting. Null means it does not expire. */
  expiresAt: Date | null
  /** Only a document that actually passed counts as held. */
  accepted: boolean
}

export type ItemState = 'ALREADY_HELD' | 'EXPIRING' | 'EXPIRED' | 'NOT_YET_VALID' | 'NEEDED'

export interface ResolvedItem extends ItemSpec {
  state: ItemState
  /** In words, for both sides of the conversation. */
  note: string
  expiresAt: Date | null
}

/**
 * What actually needs asking for.
 *
 * A document within sixty days of expiring is asked for again — chasing an
 * insurance certificate the day after it lapses means a placement is
 * already blocked, and the supplier's broker needs a week regardless.
 */
export function resolveItems(
  spec: PacketSpec,
  held: HeldDocument[],
  now: Date,
  expiringWindowDays = 60
): ResolvedItem[] {
  const coversToday = (h: HeldDocument): boolean => {
    if (h.validFrom && h.validFrom.getTime() > now.getTime()) return false
    if (h.expiresAt && h.expiresAt.getTime() < now.getTime()) return false
    return true
  }

  const byKey = new Map<string, HeldDocument>()
  for (const h of held) {
    if (!h.accepted) continue
    const existing = byKey.get(h.key)
    // Where several are held, the one that lasts longest is the one that
    // counts — except that one covering today beats one that runs longer
    // and has not started. A supplier who files next year's certificate
    // early holds both, and picking the future one would report a gap that
    // does not exist.
    if (!existing) {
      byKey.set(h.key, h)
      continue
    }
    const wasCovering = coversToday(existing)
    const isCovering = coversToday(h)
    if (wasCovering !== isCovering) {
      if (isCovering) byKey.set(h.key, h)
      continue
    }
    if (existing.expiresAt && (!h.expiresAt || h.expiresAt > existing.expiresAt)) byKey.set(h.key, h)
  }

  return spec.items.map((item) => {
    const h = byKey.get(item.key)

    if (!h) {
      return { ...item, state: 'NEEDED', note: 'Not on file', expiresAt: null }
    }

    // The floor, read before the ceiling. A document that has not started
    // is on file and holds nothing; saying "already held" of it is how
    // somebody is waved through on cover that begins after they do.
    if (h.validFrom && h.validFrom.getTime() > now.getTime()) {
      const until = Math.ceil((h.validFrom.getTime() - now.getTime()) / 86_400_000)
      return {
        ...item,
        state: 'NOT_YET_VALID',
        note: `Starts ${h.validFrom.toISOString().slice(0, 10)} — ${until} day${until === 1 ? '' : 's'} away, so it does not cover today`,
        expiresAt: h.expiresAt,
      }
    }

    if (h.expiresAt === null) {
      return { ...item, state: 'ALREADY_HELD', note: 'On file, does not expire', expiresAt: null }
    }

    const days = Math.ceil((h.expiresAt.getTime() - now.getTime()) / 86_400_000)

    if (days < 0) {
      return {
        ...item,
        state: 'EXPIRED',
        note: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
        expiresAt: h.expiresAt,
      }
    }
    if (days <= expiringWindowDays) {
      return {
        ...item,
        state: 'EXPIRING',
        note: `Expires in ${days} day${days === 1 ? '' : 's'}`,
        expiresAt: h.expiresAt,
      }
    }
    return {
      ...item,
      state: 'ALREADY_HELD',
      note: `On file until ${h.expiresAt.toISOString().slice(0, 10)}`,
      expiresAt: h.expiresAt,
    }
  })
}

/** The items a request should actually contain. */
export function itemsToAsk(resolved: ResolvedItem[]): ResolvedItem[] {
  return resolved.filter((r) => r.state !== 'ALREADY_HELD')
}

export interface Progress {
  total: number
  received: number
  outstanding: number
  requiredOutstanding: number
  complete: boolean
  /** Said the way somebody would say it on the phone. */
  summary: string
}

/**
 * How far along, in words both sides can read.
 *
 * "Four of six, waiting on your COI and bank letter" removes the phone
 * call this process is otherwise made of.
 */
export function progressOf(
  items: { label: string; required: boolean; received: boolean }[]
): Progress {
  const total = items.length
  const received = items.filter((i) => i.received).length
  const outstandingItems = items.filter((i) => !i.received)
  const requiredOutstanding = outstandingItems.filter((i) => i.required)

  const complete = requiredOutstanding.length === 0

  let summary: string
  if (total === 0) {
    summary = 'Nothing to send — we already hold everything.'
  } else if (complete && received === total) {
    summary = 'Everything is in.'
  } else if (complete) {
    summary = `Everything required is in. ${outstandingItems.length} optional item(s) still open.`
  } else {
    const names = requiredOutstanding.slice(0, 3).map((i) => i.label)
    const andMore = requiredOutstanding.length > 3 ? `, and ${requiredOutstanding.length - 3} more` : ''
    summary = `${received} of ${total}. Waiting on ${names.join(', ')}${andMore}.`
  }

  return {
    total,
    received,
    outstanding: outstandingItems.length,
    requiredOutstanding: requiredOutstanding.length,
    complete,
    summary,
  }
}

/**
 * Should this packet be reopened?
 *
 * Insurance lapsing already blocks a placement under Addendum E. Reopening
 * before it bites rather than after is the difference between a reminder
 * and an emergency.
 */
export function needsReopening(resolved: ResolvedItem[]): { reopen: boolean; because: string[] } {
  const bad = resolved.filter(
    (r) => r.required && (r.state === 'EXPIRED' || r.state === 'EXPIRING' || r.state === 'NOT_YET_VALID')
  )
  return {
    reopen: bad.length > 0,
    because: bad.map((b) => `${b.label}: ${b.note.toLowerCase()}`),
  }
}
