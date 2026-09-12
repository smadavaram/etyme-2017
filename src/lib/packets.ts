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
 * So the most common thing a real programme does every week — chase a
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

// ── The packets a staffing programme actually runs ────────────────────

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
      // offered a job to fails data minimisation across the EU.
      //
      // The business still finds out what it needed to know. The document
      // itself is collected at award, in CONTRACT_START.
      { key: 'WORK_AUTH_QUESTION', label: 'Work authorisation', hint: 'Are you authorised to work in this country, and will you need sponsorship now or in the future?', required: true, validMonths: null },
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
      { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', hint: 'Federal work authorisation. Nobody may start without it.', required: true, validMonths: null },
      { key: 'BACKGROUND_CHECK', label: 'Background check', hint: 'Through our provider, or yours if the client accepts it.', required: true, validMonths: 12 },
      { key: 'DRUG_SCREENING', label: 'Drug screening', hint: 'Where the client site requires it.', required: false, validMonths: 12 },
      { key: 'NDA', label: 'Signed non-disclosure agreement', hint: 'Ours, unless the client supplies their own.', required: true, validMonths: null },
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
  /** When it stops counting. Null means it does not expire. */
  expiresAt: Date | null
  /** Only a document that actually passed counts as held. */
  accepted: boolean
}

export type ItemState = 'ALREADY_HELD' | 'EXPIRING' | 'EXPIRED' | 'NEEDED'

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
  const byKey = new Map<string, HeldDocument>()
  for (const h of held) {
    if (!h.accepted) continue
    const existing = byKey.get(h.key)
    // Where several are held, the one that lasts longest is the one that
    // counts.
    if (!existing) byKey.set(h.key, h)
    else if (existing.expiresAt && (!h.expiresAt || h.expiresAt > existing.expiresAt)) byKey.set(h.key, h)
  }

  return spec.items.map((item) => {
    const h = byKey.get(item.key)

    if (!h) {
      return { ...item, state: 'NEEDED', note: 'Not on file', expiresAt: null }
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
  const bad = resolved.filter((r) => r.required && (r.state === 'EXPIRED' || r.state === 'EXPIRING'))
  return {
    reopen: bad.length > 0,
    because: bad.map((b) => `${b.label}: ${b.note.toLowerCase()}`),
  }
}
