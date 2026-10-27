/**
 * Etyme attests that a check happened. It never declares a person fit.
 *
 * ── The problem this solves ──────────────────────────────────────────
 *
 * A consultant working through six suppliers hands the same passport to
 * six firms, and each keeps a copy. Nobody knows how many copies exist.
 * That is the real data breach surface in staffing, and it is caused by
 * the same document being collected over and over because no supplier
 * can see that anybody else already checked.
 *
 * The fix is not to move the documents around more efficiently. It is to
 * move a FACT ABOUT A CHECK instead of the document — who verified what,
 * when, against which authority, and when it expires. The document stays
 * with the person.
 *
 * ── The line that cannot be crossed ──────────────────────────────────
 *
 * There is an obvious next step that would kill the company, so it is
 * worth naming why it is not taken.
 *
 * **We attest. We do not declare.** A record saying "right to work was
 * verified by Acme on 12 March, expires 4 August" is a fact about an
 * event. A badge saying "Etyme verified — cleared to place" is a
 * judgment about a person, and it fails four ways at once:
 *
 *   1. **It transfers nothing.** In the United States the employer of
 *      record must personally examine the documents and complete the
 *      I-9. No third party's attestation discharges that. In the United
 *      Kingdom the statutory excuse attaches to the employer who did the
 *      check. A supplier who relies on our badge instead of doing their
 *      own is out of compliance, and will say we told them it was fine.
 *
 *   2. **It makes us the liability sink.** The moment a client acts on
 *      our declaration and it is wrong — a forged degree, a visa that
 *      lapsed last week — the claim arrives here. Nothing in a
 *      per-seat price can carry that.
 *
 *   3. **It makes us a credit reporting agency.** Assembling information
 *      about a person's background and furnishing it to third parties
 *      for hiring decisions is the statutory definition of one in the
 *      United States. That is a licensed, regulated business with
 *      dispute, reinvestigation and adverse-action duties. It is a fine
 *      business. It is not this one, and drifting into it by accident is
 *      the worst way to enter it.
 *
 *   4. **It breaks neutrality.** A platform that decides who is worth
 *      placing is competing with the suppliers it depends on. Etyme
 *      never runs a bench and never places anybody, and deciding who is
 *      "worthy" is placing.
 *
 * So: the status is always a sentence with a name and a date in it,
 * never a tick. And `mayRelyOn` exists to say no, loudly, on exactly the
 * checks where saying yes would be the expensive mistake.
 */

import { plainDate } from '@/lib/plain-date'


export type CheckKind =
  | 'RIGHT_TO_WORK'
  | 'I9_EVERIFY'
  | 'BACKGROUND_CHECK'
  | 'DRUG_SCREENING'
  | 'EDUCATION_VERIFICATION'
  | 'EMPLOYMENT_VERIFICATION'
  | 'REFERENCE_CHECK'
  | 'CERTIFICATION'
  | 'IDENTITY'

/** Who actually performed it. Not who is telling you about it. */
export type Verifier =
  /** The firm employing the person, doing its own statutory check. */
  | 'EMPLOYER'
  /** A licensed screening company. */
  | 'AGENCY'
  /** The awarding body, a university, a registry. */
  | 'AUTHORITY'
  /** An identity service provider acting for an employer. */
  | 'IDSP'
  /** Somebody at a supplier eyeballed it. Honest, and worth less. */
  | 'SELF_ASSERTED'

/**
 * Whether another party may act on this check, or must run their own.
 *
 * The distinction the whole file exists for.
 */
export type Reuse =
  /** A fact about the world. Anybody may rely on it. */
  | 'FREELY'
  /** Reusable, but the person has to agree to this recipient seeing it. */
  | 'WITH_CONSENT'
  /**
   * The check is real and somebody else's reliance on it is worthless —
   * the law puts the duty on the employer personally.
   */
  | 'EMPLOYER_MUST_REDO'
  /**
   * Point in time, and the point has passed. A client asking for a fresh
   * one is not being difficult.
   */
  | 'POINT_IN_TIME'

interface Rule {
  reuse: Reuse
  /** Months the attestation is worth showing at all. Null = indefinite. */
  validMonths: number | null
  /** Said whenever somebody asks whether they can rely on it. */
  because: string
}

const RULES: Record<CheckKind, Rule> = {
  RIGHT_TO_WORK: {
    reuse: 'EMPLOYER_MUST_REDO',
    validMonths: null,
    because:
      'The duty is on the employer personally. Knowing somebody else checked tells ' +
      'you the person is real and saves asking for the document twice — it does not ' +
      'discharge your own check, and no attestation from us can.',
  },
  I9_EVERIFY: {
    reuse: 'EMPLOYER_MUST_REDO',
    validMonths: null,
    because:
      'The employer of record examines the documents and completes the form. There ' +
      'is no version of this that a third party can do for you.',
  },
  IDENTITY: {
    reuse: 'WITH_CONSENT',
    validMonths: 60,
    because:
      'A person is who they say they are, and that does not change. Their consent ' +
      'to you seeing it does.',
  },
  BACKGROUND_CHECK: {
    reuse: 'POINT_IN_TIME',
    validMonths: 12,
    because:
      'It was true on the day it was run. A client asking for a fresh one is not ' +
      'being difficult, and passing on somebody else’s report is a regulated act ' +
      'in its own right.',
  },
  DRUG_SCREENING: {
    reuse: 'POINT_IN_TIME',
    validMonths: 12,
    because: 'A medical test describes a day. Most client sites want their own.',
  },
  EDUCATION_VERIFICATION: {
    reuse: 'FREELY',
    validMonths: null,
    because:
      'A degree does not stop being true, and the awarding body said so. This is ' +
      'the clearest case for checking once and never again.',
  },
  EMPLOYMENT_VERIFICATION: {
    reuse: 'FREELY',
    validMonths: 24,
    because: 'That somebody worked somewhere between two dates is a fact about the past.',
  },
  REFERENCE_CHECK: {
    reuse: 'WITH_CONSENT',
    validMonths: 24,
    because:
      'A named person said something about them. Whether they said it to you is a ' +
      'different question, and the referee agreed to one conversation, not a file.',
  },
  CERTIFICATION: {
    reuse: 'FREELY',
    validMonths: 36,
    because: 'The registry is public. Anybody can check it, so anybody may rely on it.',
  },
}

export interface Attestation {
  kind: CheckKind
  verifier: Verifier
  /** The firm or body that did it, by name. Never "Etyme". */
  verifiedBy: string
  verifiedAt: Date
  /** When the underlying thing expires, where it does. */
  subjectExpiresAt?: Date | null
  /** Their case number, so somebody can go and ask. */
  reference?: string | null
}

export interface Standing {
  kind: CheckKind
  reuse: Reuse
  /** Whether it is still worth showing at all. */
  current: boolean
  daysOld: number
  /**
   * What a reader is told. Always a sentence with a name and a date in
   * it, never a tick — because a tick is a judgment and a sentence is a
   * fact.
   */
  says: string
}

const DAY = 86_400_000

export function standingOf(a: Attestation, on: Date): Standing {
  const rule = RULES[a.kind]
  const daysOld = Math.max(0, Math.floor((on.getTime() - a.verifiedAt.getTime()) / DAY))
  const staleAfter = rule.validMonths == null ? null : rule.validMonths * 30
  const lapsed = a.subjectExpiresAt != null && a.subjectExpiresAt.getTime() < on.getTime()
  const current = !lapsed && (staleAfter == null || daysOld <= staleAfter)

  const when = plainDate(a.verifiedAt.toISOString())
  const head = `${label(a.kind)} verified by ${a.verifiedBy} on ${when}`
  const tail = lapsed
    ? `. The document it was against expired on ${plainDate(a.subjectExpiresAt!.toISOString())}.`
    : a.subjectExpiresAt
      ? `, valid to ${plainDate(a.subjectExpiresAt.toISOString())}.`
      : !current
        ? `. That is ${daysOld} days ago and this kind of check is usually redone sooner.`
        : '.'

  return { kind: a.kind, reuse: rule.reuse, current, daysOld, says: head + tail }
}

export interface Reliance {
  mayRely: boolean
  mustRedo: boolean
  says: string
}

/**
 * Whether the party reading this may act on it.
 *
 * Deliberately blunt on the statutory checks. Somebody reading a green
 * line about a right-to-work check and concluding they do not need to do
 * their own is the single most expensive misunderstanding this product
 * could cause, so it is answered before it is asked.
 */
export function mayRelyOn(kind: CheckKind, standing: Standing): Reliance {
  const rule = RULES[kind]

  if (rule.reuse === 'EMPLOYER_MUST_REDO') {
    return {
      mayRely: false,
      mustRedo: true,
      says: `You still have to run your own. ${rule.because}`,
    }
  }

  if (!standing.current) {
    return {
      mayRely: false,
      mustRedo: true,
      says: `This one is out of date. ${rule.because}`,
    }
  }

  if (rule.reuse === 'POINT_IN_TIME') {
    return {
      mayRely: false,
      mustRedo: true,
      says: `Take it as background, not as a check you have run. ${rule.because}`,
    }
  }

  return {
    mayRely: true,
    mustRedo: false,
    says: `You can act on this one without asking again. ${rule.because}`,
  }
}

// ── What actually crosses the wire ────────────────────────────────────

export type Audience = 'SUPPLIER' | 'CLIENT'
export type Point = 'BEFORE_AWARD' | 'AFTER_AWARD'

export interface Shareable {
  /** Attestations — facts about checks. No files. */
  attestations: CheckKind[]
  /** Documents themselves. Empty before an award, always. */
  documents: CheckKind[]
  says: string
}

/**
 * What may be shown, to whom, and when.
 *
 * Before an award nothing but attestations move. That is the point of
 * having them: a supplier does not need the passport to know somebody
 * competent already looked at one.
 *
 * After an award the employer gets what it needs to do its own statutory
 * check — and only the employer. A client does not get a consultant's
 * identity documents at any point, because a client is not their
 * employer and has no lawful reason to hold them.
 */
export function whatToShare(audience: Audience, at: Point, held: CheckKind[]): Shareable {
  const attestations = held.slice()

  if (at === 'BEFORE_AWARD') {
    return {
      attestations,
      documents: [],
      says:
        'Attestations only. Nobody needs to hold the document to know a check happened, ' +
        'and a passport copied into six suppliers’ drives is six chances to lose it.',
    }
  }

  if (audience === 'CLIENT') {
    return {
      attestations,
      // Not a rule we invented. A client is not the employer, so it has
      // no lawful basis to hold identity papers, and asking for them is
      // one of the ways a client accidentally becomes a joint employer.
      documents: [],
      says:
        'The client sees that the checks happened, not the papers. They are not the ' +
        'employer, so holding identity documents gives them exposure and no benefit.',
    }
  }

  // The employer, after the award. Everything it needs to run its own
  // statutory check — which it still has to run.
  return {
    attestations,
    documents: held.filter((k) => RULES[k].reuse !== 'POINT_IN_TIME'),
    says:
      'As the employer you get what you need to complete your own checks. Seeing ' +
      'that somebody else already did theirs saves the candidate a second scan; it ' +
      'does not save you the check.',
  }
}

// ── The number worth putting in front of a privacy officer ────────────

export interface Exposure {
  copies: number
  firms: number
  says: string
}

/**
 * How many firms hold a copy of this person's identity documents.
 *
 * The tenure argument again, one field over: a number no single supplier
 * can compute, that nobody has ever been asked for, and that is a legal
 * exposure rather than an efficiency saving.
 */
export function exposureOf(
  holders: { firm: string; since: Date }[],
  on: Date
): Exposure {
  const firms = new Set(holders.map((h) => h.firm)).size

  if (holders.length === 0) {
    return {
      copies: 0,
      firms: 0,
      says: 'Nobody outside holds a copy of their documents.',
    }
  }

  const oldest = holders.reduce((a, b) => (a.since < b.since ? a : b))
  const years = Math.max(1, Math.round((on.getTime() - oldest.since.getTime()) / (365 * DAY)))

  return {
    copies: holders.length,
    firms,
    says:
      `${holders.length} cop${holders.length === 1 ? 'y' : 'ies'} of their identity ` +
      `documents sit${holders.length === 1 ? 's' : ''} with ${firms} ` +
      `firm${firms === 1 ? '' : 's'}, the oldest for ` +
      `${years} year${years === 1 ? '' : 's'}. None of them can see the others.`,
  }
}

function label(k: CheckKind): string {
  switch (k) {
    case 'RIGHT_TO_WORK': return 'Right to work'
    case 'I9_EVERIFY': return 'I-9 and E-Verify'
    case 'BACKGROUND_CHECK': return 'Background check'
    case 'DRUG_SCREENING': return 'Drug screening'
    case 'EDUCATION_VERIFICATION': return 'Education'
    case 'EMPLOYMENT_VERIFICATION': return 'Employment history'
    case 'REFERENCE_CHECK': return 'References'
    case 'CERTIFICATION': return 'Certification'
    case 'IDENTITY': return 'Identity'
  }
}

/**
 * There is no overall verdict, and that is the design.
 *
 * Exported so that anybody reaching for one finds this instead of adding
 * a boolean somewhere quiet. A single fit-or-not answer is the thing that
 * makes us a screening agency, a liability sink and a competitor to our
 * own suppliers, all at once.
 */
export function overallVerdict(): never {
  throw new Error(
    'Etyme does not declare a person fit or unfit. Show the attestations and let ' +
      'the party with the duty decide. A tick is a judgment; a sentence with a name ' +
      'and a date in it is a fact.'
  )
}

// ── Who renders the verdict ───────────────────────────────────────────
//
// The founder, 2026-09-22:
//
//   "Ultimately background check companies are the ones that confirm
//   background pass or fail — the risk is passed there to background
//   check companies; our job would be to collect all info and pass it to
//   them to verify in today's market."
//
// That is the file's own doctrine pointed at one class of check, and it
// settles a question the app had been answering wrongly for a year: a
// background check was carried as a document the worker supplies, the
// same shape as a passport, so her own paperwork page chased her for a
// report she will never hold. The provider sends the report to the firm
// that ordered it and to nobody else. She was being asked for somebody
// else's post.
//
// Two facts decide the shape of every check, and they are not the same
// fact:
//
//   **Who renders it** — whose judgment the record carries. A screening
//   company's, an employer's, a licensing board's, or the person's own.
//
//   **Who holds the output** — who can physically produce the artifact.
//   A nurse holds her license; nobody hands a consultant her own
//   criminal record check.
//
// A licensing board renders a verdict AND the person holds the card, so
// the chase still asks her. A screening company renders a verdict and
// the report goes to the buyer, so the chase must never ask her. One
// column cannot say both, which is why `suppliedBy: 'CANDIDATE'` on
// BACKGROUND_CHECK was wrong rather than merely imprecise.

/** Whose judgment a recorded check carries. */
export type Renderer =
  /** A licensed screening or testing company. The report is theirs. */
  | 'PROVIDER'
  /** The firm employing the person, examining documents itself. */
  | 'EMPLOYER'
  /** A board, a registry, an awarding body. */
  | 'AUTHORITY'
  /** The person, by attestation. Honest, and worth what it is worth. */
  | 'SUBJECT'

/** What the person the check is about is actually asked for. */
export type SubjectOwes =
  /** The document itself. A passport, a license, a degree certificate. */
  | 'THE_DOCUMENT'
  /**
   * Her permission to run it and the identifiers it is run against.
   * Never the result: the result is sent to whoever ordered it.
   */
  | 'CONSENT_AND_IDENTIFIERS'

export interface WhoRenders {
  kind: CheckKind
  renders: Renderer
  /** True where the person can actually produce the artifact. */
  subjectHoldsIt: boolean
  subjectOwes: SubjectOwes
  /** Said on any screen that would otherwise ask her for it. */
  says: string
}

const RENDERS: Record<CheckKind, WhoRenders> = {
  BACKGROUND_CHECK: {
    kind: 'BACKGROUND_CHECK',
    renders: 'PROVIDER',
    subjectHoldsIt: false,
    subjectOwes: 'CONSENT_AND_IDENTIFIERS',
    says:
      'A screening company runs this one and sends the report to the firm that ordered ' +
      'it. What the person gives is permission and the details it is run against — never ' +
      'the report, because she is not sent one.',
  },
  DRUG_SCREENING: {
    kind: 'DRUG_SCREENING',
    renders: 'PROVIDER',
    subjectHoldsIt: false,
    subjectOwes: 'CONSENT_AND_IDENTIFIERS',
    says:
      'A laboratory renders this one and reports to whoever ordered the test. The person ' +
      'consents and attends; the result is not hers to hand over.',
  },
  EMPLOYMENT_VERIFICATION: {
    kind: 'EMPLOYMENT_VERIFICATION',
    renders: 'PROVIDER',
    subjectHoldsIt: false,
    subjectOwes: 'CONSENT_AND_IDENTIFIERS',
    says:
      'Somebody calls the former employer and writes down what was said. The person ' +
      'consents to the call and names the employer; the answer comes back to the caller.',
  },
  I9_EVERIFY: {
    kind: 'I9_EVERIFY',
    renders: 'EMPLOYER',
    // She holds what the form is completed FROM, which is why the chase
    // still reaches her — and the form itself is the employer's, which is
    // why no third party's copy discharges anybody.
    subjectHoldsIt: true,
    subjectOwes: 'THE_DOCUMENT',
    says:
      'The employer of record examines the documents and completes the form. The person ' +
      'produces the documents; nobody else can complete it for either of them.',
  },
  RIGHT_TO_WORK: {
    kind: 'RIGHT_TO_WORK',
    renders: 'EMPLOYER',
    subjectHoldsIt: true,
    subjectOwes: 'THE_DOCUMENT',
    says:
      'The employer looks at the document and records what it saw. The document is the ' +
      "person's, and which one she shows is hers to choose.",
  },
  IDENTITY: {
    kind: 'IDENTITY',
    renders: 'EMPLOYER',
    subjectHoldsIt: true,
    subjectOwes: 'THE_DOCUMENT',
    says: 'The person holds the document. Somebody looks at it and records that they did.',
  },
  EDUCATION_VERIFICATION: {
    kind: 'EDUCATION_VERIFICATION',
    renders: 'AUTHORITY',
    // WES and ECE issue the evaluation to the applicant, who forwards it.
    // It is hers, and asking her for it is asking the right party.
    subjectHoldsIt: true,
    subjectOwes: 'THE_DOCUMENT',
    says:
      'The awarding body or the evaluation service says it, and issues the evaluation to ' +
      'the person. She forwards it, which is why asking her for it is asking the right party.',
  },
  CERTIFICATION: {
    kind: 'CERTIFICATION',
    renders: 'AUTHORITY',
    subjectHoldsIt: true,
    subjectOwes: 'THE_DOCUMENT',
    says: 'The registry issued it and publishes it. The person holds the certificate.',
  },
  REFERENCE_CHECK: {
    kind: 'REFERENCE_CHECK',
    renders: 'SUBJECT',
    // As shipped this item asks for names and contact details, which is
    // the person's to give. Where a firm turns it into a called-and-
    // recorded check it becomes the provider's, and the type is the
    // company's own to redefine.
    subjectHoldsIt: true,
    subjectOwes: 'THE_DOCUMENT',
    says:
      'The person names the referees and how to reach them. What the referee then says is ' +
      'said to whoever calls, and is not hers to produce.',
  },
}

/**
 * Who renders the verdict on a check of this kind.
 *
 * Named apart from `whoRenders` in `lib/document-type`, which is the
 * architect's same question asked of a document TYPE. Two tables saying
 * one thing is the duplication this file exists to argue against, and
 * reconciling them — this one reading that one — is the architect's
 * call rather than a rename made from here.
 */
export function whoRendersCheck(kind: CheckKind): WhoRenders {
  return RENDERS[kind]
}

/**
 * The check a document type key is, where it is one at all.
 *
 * Document keys are the company's own dictionary and this table is not,
 * so a key nobody here has heard of answers null rather than guessing.
 * A wrong guess here would either chase somebody for a report she cannot
 * produce, or stop chasing her for a document she can.
 */
export function checkKindOf(documentKey: string): CheckKind | null {
  switch (documentKey) {
    case 'BACKGROUND_CHECK': return 'BACKGROUND_CHECK'
    case 'DRUG_SCREENING': return 'DRUG_SCREENING'
    case 'EMPLOYMENT_VERIFICATION': return 'EMPLOYMENT_VERIFICATION'
    case 'I9_EVERIFY': return 'I9_EVERIFY'
    case 'RIGHT_TO_WORK': return 'RIGHT_TO_WORK'
    case 'EDUCATION_EVALUATION':
    case 'EDUCATION_VERIFICATION': return 'EDUCATION_VERIFICATION'
    case 'REFERENCE_CHECK': return 'REFERENCE_CHECK'
    case 'CERTIFICATION': return 'CERTIFICATION'
    case 'PASSPORT':
    case 'DRIVERS_LICENSE': return 'IDENTITY'
    default: return null
  }
}

/**
 * Whether a check of this type is ordered from a third party rather than
 * collected from the person.
 *
 * The one predicate every chase, every list and every upload door should
 * ask before it puts a document on somebody's own page. False for a key
 * nobody recognizes, because a type a client invented is a document it
 * asked somebody for and the safe default is to keep asking.
 */
export function orderedNotCollected(documentKey: string): boolean {
  const kind = checkKindOf(documentKey)
  return kind != null && RENDERS[kind].renders === 'PROVIDER'
}

/**
 * Whether a packet item of this kind can become a recorded check when the
 * employer accepts it: a document somebody else issued, examined by the
 * firm that employs or places the person — an I-9 completed from the
 * evidence shown, a license, a passport, a visa. Never a screening
 * company's verdict: the report goes to whoever ordered it, and a file a
 * worker sent is not it.
 */
export function examinedFromAPacket(documentKey: string): boolean {
  return (RECORDABLE_ABOUT_A_PERSON as readonly string[]).includes(documentKey) && !orderedNotCollected(documentKey)
}

/**
 * What to say on a row for a check somebody else orders.
 *
 * `firm` is whoever is responsible for ordering it on this line. Null
 * where nothing names one — and it says so rather than inventing a
 * party, because "your supplier will order it" about a line with no
 * supplier on it is a sentence nobody can act on.
 */
export function orderedBySays(documentKey: string, firm: string | null): string | null {
  const kind = checkKindOf(documentKey)
  if (!kind || RENDERS[kind].renders !== 'PROVIDER') return null
  const who = firm ?? 'The firm placing you'
  return (
    `${who} orders this from a screening company, and the report goes to them. ` +
    `What you are asked for is your consent and the details it is run against.`
  )
}

// ── Telling a provider's report from somebody ticking a box ───────────
//
// `Verification` has carried `provider` and `referenceId` since it was
// written and nothing in production sets either. So a row saying CLEAR
// could be Sterling's report or it could be a desk that clicked a
// button, and no reader could tell the two apart. That is the 2017
// expiry column again: a field that exists, is never written, and is
// read as though it were.
//
// This does not invent the missing half. It reports what is on the row
// and refuses to dress it up: where nobody is named, the sentence says
// nobody is named.

export interface RecordedCheck {
  /** The document type key — BACKGROUND_CHECK, DRUG_SCREENING, … */
  key: string
  /** CLEAR · CONDITIONAL · PENDING · IN_PROGRESS · EXPIRED · FAILED */
  status: string
  /** The screening company, as written on the row. */
  provider?: string | null
  /** Their case number, so somebody can go and ask. */
  reference?: string | null
  /** The day the verdict was rendered, or the day it was recorded here. */
  on?: Date | null
  /** Whoever at this firm recorded it, where a person did. */
  recordedBy?: string | null
}

export interface VerdictReading {
  /**
   * True only where a named third party rendered it. A row with no
   * provider on it is our own note, however green its status.
   */
  rendered: boolean
  /** The screening company by name, or null. */
  renderedBy: string | null
  /** True where the check has not come back at all. */
  running: boolean
  /** A sentence with a name and a date in it, or an honest absence. */
  says: string
}

/** Statuses that mean the provider has answered. */
const ANSWERED_BY_PROVIDER = ['CLEAR', 'CONDITIONAL', 'FAILED', 'EXPIRED']

function day(d: Date | null | undefined): string | null {
  // A day as a person reads it — "Mar 6, 2026", never "2026-03-06".
  return d ? plainDate(d.toISOString()) : null
}

function outcomeWord(status: string): string {
  switch (status) {
    case 'CLEAR': return 'clear'
    case 'CONDITIONAL': return 'clear with conditions'
    case 'FAILED': return 'not clear'
    case 'EXPIRED': return 'clear, and it has since run out'
    default: return status.toLowerCase().replace(/_/g, ' ')
  }
}

/**
 * What a reader can honestly be told about a recorded check.
 *
 * Three answers, and the middle one is the whole point:
 *
 *   Sterling reported clear on Mar 12, 2026, reference 4471.
 *   Recorded here by Dana Whitfield on Mar 12, 2026. No screening company
 *     is named on it, so it is this firm's own note rather than a
 *     provider's report.
 *   Ordered from Sterling and not back yet.
 */
export function readVerdict(r: RecordedCheck): VerdictReading {
  const label = labelOf(r.key)
  const when = day(r.on)
  const running = !ANSWERED_BY_PROVIDER.includes(r.status)
  const provider = r.provider?.trim() || null

  if (running) {
    return {
      rendered: false,
      renderedBy: provider,
      running: true,
      says: provider
        ? `${label} is with ${provider} and has not come back. Nothing is on file yet.`
        : `${label} has been opened and nothing has come back. ` +
          `No screening company is named on it, so there is nobody to chase for it.`,
    }
  }

  if (provider) {
    const ref = r.reference?.trim() ? `, reference ${r.reference.trim()}` : ''
    return {
      rendered: true,
      renderedBy: provider,
      running: false,
      says: when
        ? `${provider} reported ${outcomeWord(r.status)} on ${when}${ref}.`
        : `${provider} reported ${outcomeWord(r.status)}${ref}. No date was recorded against it.`,
    }
  }

  const who = r.recordedBy?.trim() || null
  return {
    rendered: false,
    renderedBy: null,
    running: false,
    says:
      `${label} was recorded here${who ? ` by ${who}` : ''}${when ? ` on ${when}` : ''}. ` +
      `No screening company is named on it, so it is this firm's own note rather than a ` +
      `provider's report.`,
  }
}

function labelOf(key: string): string {
  const kind = checkKindOf(key)
  if (kind) return label(kind)
  return key
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

// ── Recording a check, by the people who ran it or received it ────────
//
// The simulation of 2026-10-20 walked a placement from award to start
// and found that nothing in production could put a check on file. The
// worker could open a request and send her paper; the firm could read
// the verdict at activation; and between the two there was no door at
// all. `Verification` was written by the seeds and by supplier
// onboarding, and by nothing a person at a placing firm could press. So
// an I-9 could never be completed on the record, a screening company's
// report could never be entered, and a placement whose person had no
// seeded I-9 could never start.
//
// Two shapes, and the line between them is the whole of this file:
//
//   **A document somebody else issued, examined here.** The I-9 is the
//   employer's own form, completed from a passport or a green card the
//   person showed. A license was issued by a board, a certificate of
//   insurance by an insurer. A desk looks at it and records what it saw
//   — the dates printed on it, the edition, what stood behind it. That
//   is a fact about an examination, never a judgment about a person.
//
//   **A verdict a third party rendered.** A background check or a drug
//   screen is the provider's opinion, on their letterhead, at their
//   liability. It is recorded verbatim — their name, their reference,
//   their date, their words — and nothing here restates it as ours.
//
// What is refused, and why each is a refusal rather than a warning: a
// verdict with no provider named (that is a box somebody ticked, and a
// reader cannot tell it from a report), an I-9 with nothing behind it
// or no edition (an audit finding the day it is written), and anything
// of a kind that runs out recorded with no date (the fourth state — on
// file, no expiry, on a kind that expires — which kept a certificate
// green for four months in 2017). Each is refused in a sentence that
// says what to give, because the person typing has the paper open in
// front of them.

/** What a person's file can hold, recorded by the firm that employs or places them. */
export const RECORDABLE_ABOUT_A_PERSON = [
  'I9_EVERIFY', 'RIGHT_TO_WORK', 'PASSPORT', 'GREEN_CARD', 'VISA', 'DRIVERS_LICENSE', 'WORK_PERMIT', 'I94',
  'PROFESSIONAL_LICENSE', 'BACKGROUND_CHECK', 'DRUG_SCREENING', 'EDUCATION_EVALUATION', 'REFERENCE_CHECK',
] as const

/** What a supplier's file can hold, recorded by the firm that buys from it. */
export const RECORDABLE_ABOUT_A_FIRM = [
  'INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER', 'GOOD_STANDING',
] as const

/** What an I-9 may be completed from, as the dictionary ships it. */
export const I9_EVIDENCE = ['PASSPORT', 'GREEN_CARD', 'VISA', 'DRIVERS_LICENSE', 'RIGHT_TO_WORK', 'WORK_PERMIT'] as const

/**
 * Evidence whose expiry is the day the I-9 must be completed again.
 *
 * A visa or a work permit is time-limited authorization, and US rules
 * ask the employer to reverify before it runs out. A passport or a green
 * card is not reverified when the card itself expires, so its date is
 * recorded on the evidence and never carried onto the form.
 */
const REVERIFY_ON = ['VISA', 'WORK_PERMIT'] as const

/** The documents whose ceiling is printed on them rather than counted in months. */
const PRINTED_END = ['PASSPORT', 'GREEN_CARD', 'VISA', 'DRIVERS_LICENSE', 'WORK_PERMIT', 'I94', 'PROFESSIONAL_LICENSE', 'RIGHT_TO_WORK'] as const

/** How many months a check of this kind is good for, where it is counted rather than printed. */
const COUNTED_MONTHS: Record<string, number> = {
  BACKGROUND_CHECK: 12, DRUG_SCREENING: 12, REFERENCE_CHECK: 24,
  INSURANCE_GL: 12, INSURANCE_WC: 12, INSURANCE_EO: 12, INSURANCE_CYBER: 12, GOOD_STANDING: 12,
}

/** What a provider may have said, in the four words a report uses, or that it went out. */
export const PROVIDER_OUTCOMES = ['ORDERED', 'CLEAR', 'CONDITIONAL', 'FLAGGED', 'FAILED'] as const
export type ProviderOutcome = (typeof PROVIDER_OUTCOMES)[number]

const RECORD_LABEL: Record<string, string> = {
  I9_EVERIFY: 'I-9', RIGHT_TO_WORK: 'right-to-work check', PASSPORT: 'passport', GREEN_CARD: 'green card',
  VISA: 'visa', DRIVERS_LICENSE: 'driver’s license', WORK_PERMIT: 'work permit (EAD)', I94: 'I-94 record',
  PROFESSIONAL_LICENSE: 'professional license', BACKGROUND_CHECK: 'background check',
  DRUG_SCREENING: 'drug screen', EDUCATION_EVALUATION: 'education evaluation', REFERENCE_CHECK: 'reference check',
  INSURANCE_GL: 'general liability certificate', INSURANCE_WC: 'workers’ compensation certificate',
  INSURANCE_EO: 'errors and omissions certificate', INSURANCE_CYBER: 'cyber liability certificate',
  GOOD_STANDING: 'certificate of good standing',
}

/** A check's name as a sentence uses it: "the I-9", "the background check". */
export function recordLabel(key: string): string {
  return RECORD_LABEL[key] ?? key.toLowerCase().replace(/_/g, ' ')
}

/** Letters whose spoken name starts with a vowel sound: an I-9, an NDA, an RN license. */
const VOWEL_SOUNDING_LETTERS = new Set('AEFHILMNORSX'.split(''))

/**
 * A phrase from `sentencePhrases` in lib/contract-clearance, or a check's `recordLabel`, with the article a person would say.
 *
 * Kept as is where it already has one ("an I-9", "a state nursing
 * license"), where it is a mass noun ("proof of right to work") or a
 * plural ("references"). A form's code is read by its letters, so "I-9"
 * takes "an" and "W-9" takes "a"; a word by its first letter.
 */
export function withArticle(phrase: string): string {
  const p = phrase.trim()
  if (!p) return p
  const first = p.split(/\s+/)[0]
  if (/^(a|an|the|your|their|our|proof|evidence)$/i.test(first)) return p
  // A plural, not a possessive: "references", never "driver’s license".
  if (/[^s'’u]s$/i.test(first)) return p
  const isCode = /[A-Z]/.test(first) && (/\d|-/.test(first) || first === first.toUpperCase())
  const an = isCode
    ? VOWEL_SOUNDING_LETTERS.has(first.charAt(0).toUpperCase())
    : (/^[aeio]/i.test(first) && !/^eu/i.test(first)) || (/^u/i.test(first) && !/^u(ni|s[eu]|ti)/i.test(first))
  return `${an ? 'an' : 'a'} ${p}`
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()))
}

/** Which side of the placement the recording firm stands on. */
export type RecordingSide = 'EMPLOYER' | 'BUYER' | null

/**
 * Whether this seat may record this kind of check on this placement.
 *
 * About a person, only the firm that employs or places them: the I-9 is
 * the employer's own form and no client's copy discharges it, and the
 * report on a background check goes to whoever ordered it. About a
 * supplier, only the firm that buys from it: the cover protects the
 * buyer, and a firm verifying its own certificate is not a check.
 *
 * And the seat must be one that does this work — HR or whoever keeps the
 * firm's people, or the compliance officer; for a supplier's certificate,
 * procurement or the compliance officer. Never the AP clerk: paying for
 * the work is not clearing anybody to do it.
 */
export function mayRecordCheck(input: {
  about: 'PERSON' | 'FIRM'
  side: RecordingSide
  holds: (permission: string) => boolean
  callerFirm: string
  subjectName: string
  employerName: string
  buyerName: string
  type: string
}): { ok: true } | { ok: false; code: 'NOT_A_PARTY' | 'NOT_YOURS_TO_RECORD' | 'FORBIDDEN'; message: string } {
  const what = recordLabel(input.type)
  if (!input.side) {
    return {
      ok: false,
      code: 'NOT_A_PARTY',
      message:
        `${input.callerFirm} is not a party to this placement, so it records nothing about it. ` +
        `Only ${input.employerName} or ${input.buyerName} can.`,
    }
  }
  if (input.about === 'PERSON' && input.side !== 'EMPLOYER') {
    return {
      ok: false,
      code: 'NOT_YOURS_TO_RECORD',
      message:
        `The ${what} for ${input.subjectName} is recorded by ${input.employerName}, the firm that employs or places them. ` +
        `${input.buyerName} reads it on the placement; it does not complete it.`,
    }
  }
  if (input.about === 'FIRM' && input.side !== 'BUYER') {
    return {
      ok: false,
      code: 'NOT_YOURS_TO_RECORD',
      message:
        `A firm does not check its own ${what}. ${input.employerName} sends it, and ${input.buyerName} ` +
        `records what it received, because the cover protects ${input.buyerName}.`,
    }
  }
  const may =
    input.about === 'PERSON'
      ? ['consultants.write', 'privacy.manage'].some(input.holds)
      : ['vendors.manage', 'privacy.manage', 'governance.write'].some(input.holds)
  if (!may) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message:
        input.about === 'PERSON'
          ? `Recording a check on ${input.subjectName}’s papers is HR’s or the compliance officer’s work at ${input.callerFirm}. ` +
            `Ask whoever runs Users & permissions for one of those seats.`
          : `Recording a supplier’s certificate is procurement’s or the compliance officer’s work at ${input.callerFirm}. ` +
            `Ask whoever runs Users & permissions for one of those seats.`,
    }
  }
  return { ok: true }
}

/** One document an I-9 was completed from, as the person showed it. */
export interface ExaminedEvidence {
  type: string
  issuer?: string | null
  reference?: string | null
  expiresAt?: Date | null
}

export interface CheckToRecord {
  about: 'PERSON' | 'FIRM'
  type: string
  /** The person or the firm the check is about, by name. */
  subjectName: string
  /** Whoever is recording it, by name. */
  recordedBy: string

  // ── A verdict somebody else rendered ──
  provider?: string | null
  reference?: string | null
  /** The day the provider reported, or the day the package went to them for ORDERED. */
  renderedOn?: Date | null
  outcome?: string | null
  /** The provider's own words, copied as written. */
  providerSays?: string | null
  /** The day the person signed the authorization to run it, where one is on file. */
  consentOn?: Date | null

  // ── A document somebody else issued, examined here ──
  /** The insurer, the board, the state, the government. */
  issuer?: string | null
  issuedOn?: Date | null
  validFrom?: Date | null
  expiresAt?: Date | null
  /** The edition printed on a reissued form — the I-9's "Rev. 01/20/25". */
  formEdition?: string | null
  /** What an I-9 was completed from. */
  evidence?: ExaminedEvidence[]
  licenseNumber?: string | null
  licenseState?: string | null
}

/** The row to write, and its evidence. Columns of `Verification`, nothing more. */
export interface CheckRow {
  type: string
  status: 'IN_PROGRESS' | 'CLEAR' | 'CONDITIONAL' | 'FLAGGED' | 'FAILED'
  provider: string | null
  referenceId: string | null
  issuedAt: Date | null
  validFrom: Date | null
  expiresAt: Date | null
  formEdition: string | null
  /** Verbatim where a provider said it; the license's number and state where it is one. */
  result: Record<string, unknown> | null
  /** True where a third party rendered it, so the firm that recorded it is the firm that ordered it. */
  ordered: boolean
  orderedAt: Date | null
  /** The day the verdict was rendered or the examination made. */
  verifiedAt: Date
  evidence: { type: string; provider: string | null; referenceId: string | null; expiresAt: Date | null }[]
}

export type CheckRecordVerdict =
  | { ok: true; row: CheckRow; says: string }
  | { ok: false; code: string; message: string; field?: string }

function no(code: string, message: string, field?: string): CheckRecordVerdict {
  return { ok: false, code, message, ...(field ? { field } : {}) }
}

/**
 * What a desk may put on file, and the sentence that says what it is.
 *
 * Pure: every refusal is a sentence tested by name. `on` is the day it
 * is recorded, which is the day an expired paper is judged against.
 */
export function checkToRecord(input: CheckToRecord, on: Date): CheckRecordVerdict {
  const key = input.type
  const what = recordLabel(key)
  const allowed: readonly string[] = input.about === 'PERSON' ? RECORDABLE_ABOUT_A_PERSON : RECORDABLE_ABOUT_A_FIRM
  if (!allowed.includes(key)) {
    const other: readonly string[] = input.about === 'PERSON' ? RECORDABLE_ABOUT_A_FIRM : RECORDABLE_ABOUT_A_PERSON
    return other.includes(key)
      ? no(
          'WRONG_SUBJECT',
          input.about === 'PERSON'
            ? `The ${what} is about the supplier, not about ${input.subjectName}. Record it on the firm.`
            : `The ${what} is about a person, not about ${input.subjectName}. Record it on the person.`,
          'type'
        )
      : no('UNKNOWN_CHECK', `Say which check this is. ${upperFirst(key.toLowerCase().replace(/_/g, ' '))} is not one that can be recorded here.`, 'type')
  }

  const text = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  // ── A verdict a third party rendered ──────────────────────────────
  if (orderedNotCollected(key)) {
    const provider = text(input.provider)
    if (!provider) {
      return no(
        'NO_PROVIDER',
        `Name the screening company that ran the ${what}. ${upperFirst(withArticle(what))} with nobody named on it is this firm’s own note, ` +
          `and only a provider’s report is recorded as a verdict.`,
        'provider'
      )
    }
    const outcome = text(input.outcome)?.toUpperCase() ?? null
    if (!outcome || !(PROVIDER_OUTCOMES as readonly string[]).includes(outcome)) {
      return no(
        'NO_OUTCOME',
        `Say what ${provider} reported, in their word: clear, clear with conditions, flagged for review or not clear. ` +
          `Or say it was ordered, where nothing has come back yet.`,
        'outcome'
      )
    }
    const reference = text(input.reference)
    if (!reference) {
      return no('NO_REFERENCE', `Give ${provider}’s reference for the ${what}, so anybody reading it can go and ask them.`, 'reference')
    }
    const renderedOn = input.renderedOn ?? null
    if (!renderedOn) {
      return no(
        'NO_DATE',
        outcome === 'ORDERED'
          ? `Give the day the ${what} went to ${provider}.`
          : `Give the day ${provider} reported the ${what}. A verdict with no date cannot be told from last year’s.`,
        'renderedOn'
      )
    }
    if (renderedOn.getTime() > on.getTime()) {
      return no('FUTURE_DATE', `${provider} cannot have reported on a day that has not come yet. Give the date on their report.`, 'renderedOn')
    }
    const says = text(input.providerSays)
    if (outcome !== 'ORDERED' && !says) {
      return no(
        'NOT_VERBATIM',
        `Copy what ${provider} wrote, word for word. The report is their judgment, and it is recorded as they said it.`,
        'providerSays'
      )
    }
    const months = COUNTED_MONTHS[key]
    const expiresAt =
      outcome === 'ORDERED' ? null : (input.expiresAt ?? (months ? addMonthsUtc(renderedOn, months) : null))
    const status: CheckRow['status'] = outcome === 'ORDERED' ? 'IN_PROGRESS' : (outcome as CheckRow['status'])
    const row: CheckRow = {
      type: key,
      status,
      provider,
      referenceId: reference,
      issuedAt: outcome === 'ORDERED' ? null : renderedOn,
      validFrom: outcome === 'ORDERED' ? null : renderedOn,
      expiresAt,
      formEdition: null,
      result: {
        outcome,
        ...(says ? { providerSays: says } : {}),
        consentOn: input.consentOn ? input.consentOn.toISOString() : null,
      },
      ordered: true,
      orderedAt: outcome === 'ORDERED' ? renderedOn : null,
      verifiedAt: renderedOn,
      evidence: [],
    }
    const reading = readVerdict({
      key,
      // `readVerdict` knows FAILED and not FLAGGED; a flag is still the
      // provider's answer, said in its own word below.
      status: status === 'FLAGGED' ? 'FAILED' : status,
      provider,
      reference,
      on: renderedOn,
    })
    const parts = [
      status === 'FLAGGED'
        ? `${provider} flagged the ${what} for review on ${plainDate(renderedOn.toISOString())}, reference ${reference}.`
        : reading.says,
    ]
    if (status === 'FAILED' || status === 'FLAGGED' || status === 'CONDITIONAL') {
      parts.push(
        `Before anything is decided on it, the firm that ordered it sends ${input.subjectName} a notice with a copy ` +
          `of the report, waits, and only then decides. Etyme records the report; those steps are the firm’s.`
      )
    }
    if (!input.consentOn) {
      parts.push(
        `No signed authorization from ${input.subjectName} is named for it. The firm that orders a check needs one ` +
          `before ordering, and this record says it was not named.`
      )
    }
    return { ok: true, row, says: parts.join(' ') }
  }

  // ── A document somebody else issued, examined here ────────────────
  const issuer = text(input.issuer)
  const validFrom = input.validFrom ?? null
  let expiresAt = input.expiresAt ?? null

  if (input.about === 'FIRM') {
    if (!issuer) {
      return no(
        'NO_ISSUER',
        key === 'GOOD_STANDING'
          ? `Say which state issued the ${what}.`
          : `Say which insurer issued the ${what}.`,
        'issuer'
      )
    }
    if (!validFrom) {
      return no(
        'NO_START',
        `Give the day the ${what} starts, as printed on it. Cover that begins after somebody starts covers nobody on their first day.`,
        'validFrom'
      )
    }
    expiresAt = expiresAt ?? addMonthsUtc(validFrom, COUNTED_MONTHS[key] ?? 12)
    if (expiresAt.getTime() <= validFrom.getTime()) {
      return no('ENDS_BEFORE_IT_STARTS', `The ${what} cannot end before it starts. Check the two dates on it.`, 'expiresAt')
    }
    const lapsed = expiresAt.getTime() < on.getTime()
    const notYet = validFrom.getTime() > on.getTime()
    return {
      ok: true,
      row: {
        type: key, status: 'CLEAR', provider: issuer, referenceId: text(input.reference),
        issuedAt: input.issuedOn ?? validFrom, validFrom, expiresAt, formEdition: null, result: null,
        ordered: false, orderedAt: null, verifiedAt: on, evidence: [],
      },
      says:
        `${upperFirst(possessiveOf(input.subjectName))} ${what} from ${issuer} is on file, ` +
        `${plainDate(validFrom.toISOString())} to ${plainDate(expiresAt.toISOString())}, recorded by ${input.recordedBy}.` +
        (lapsed
          ? ` It ran out on ${plainDate(expiresAt.toISOString())}, so nobody starts through ${input.subjectName} until a current one is on file.`
          : notYet
            ? ` It does not start until ${plainDate(validFrom.toISOString())}, so it covers nobody before then.`
            : ''),
    }
  }

  if (key === 'I9_EVERIFY') {
    const edition = text(input.formEdition)
    if (!edition) {
      return no(
        'NO_EDITION',
        `Say which edition of the I-9 it was completed on. The edition date is printed at the foot of every page, ` +
          `and an old edition is an audit finding.`,
        'formEdition'
      )
    }
    const evidence = input.evidence ?? []
    if (evidence.length === 0) {
      return no(
        'NO_EVIDENCE',
        `Say which document ${input.subjectName} showed, and when it runs out. An I-9 is completed from a passport, ` +
          `a green card or another document on the list; on its own it proves nothing.`,
        'evidence'
      )
    }
    for (const e of evidence) {
      if (!(I9_EVIDENCE as readonly string[]).includes(e.type)) {
        return no(
          'NOT_ON_THE_LIST',
          `${upperFirst(withArticle(recordLabel(e.type)))} is not a document an I-9 can be completed from. ` +
            `Use a passport, a green card, a visa, a work permit or a driver’s license.`,
          'evidence'
        )
      }
      if (!e.expiresAt) {
        return no(
          'NO_EXPIRY',
          `Give the day ${possessiveOf(input.subjectName)} ${recordLabel(e.type)} runs out, as printed on it.`,
          'evidence'
        )
      }
      if (e.expiresAt.getTime() < on.getTime()) {
        return no(
          'EXPIRED_EVIDENCE',
          `The ${recordLabel(e.type)} ${input.subjectName} showed ran out on ${plainDate(e.expiresAt.toISOString())}. ` +
            `An expired document cannot stand behind an I-9; ask for one that is in date.`,
          'evidence'
        )
      }
    }
    const reverify = evidence
      .filter((e) => (REVERIFY_ON as readonly string[]).includes(e.type))
      .map((e) => e.expiresAt!)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
    const finalExpiry = expiresAt ?? reverify
    const completed = input.issuedOn ?? on
    return {
      ok: true,
      row: {
        type: key, status: 'CLEAR', provider: issuer ?? 'Employer examination', referenceId: text(input.reference),
        issuedAt: completed, validFrom: null, expiresAt: finalExpiry, formEdition: edition, result: null,
        ordered: false, orderedAt: null, verifiedAt: on,
        evidence: evidence.map((e) => ({
          type: e.type, provider: text(e.issuer), referenceId: text(e.reference), expiresAt: e.expiresAt ?? null,
        })),
      },
      says:
        `${input.recordedBy} examined ${possessiveOf(input.subjectName)} ` +
        `${evidence.map((e) => recordLabel(e.type)).join(' and ')} and completed the I-9 on the ${edition} edition, ` +
        `${plainDate(completed.toISOString())}.` +
        (finalExpiry
          ? ` It has to be completed again before ${plainDate(finalExpiry.toISOString())}, when the ${recordLabel(
              evidence.find((e) => e.expiresAt?.getTime() === finalExpiry.getTime())?.type ?? 'VISA'
            )} runs out.`
          : ''),
    }
  }

  const printed = (PRINTED_END as readonly string[]).includes(key)
  if (printed && !expiresAt) {
    return no(
      'NO_EXPIRY',
      `${upperFirst(withArticle(what))} runs out, so it cannot go on file without the date printed on it. A document with no expiry ` +
        `recorded looks current on every screen until somebody audits it.`,
      'expiresAt'
    )
  }
  if (key === 'PROFESSIONAL_LICENSE') {
    if (!issuer) return no('NO_ISSUER', `Say which board issued the license, so anybody can check it on their register.`, 'issuer')
    if (!text(input.licenseNumber)) {
      return no('NO_NUMBER', `Give the license number. "Licensed" is not something anybody can check; a number on a board’s register is.`, 'licenseNumber')
    }
  }
  if (!printed && !expiresAt && COUNTED_MONTHS[key]) {
    expiresAt = addMonthsUtc(input.issuedOn ?? validFrom ?? on, COUNTED_MONTHS[key])
  }
  if (expiresAt && validFrom && expiresAt.getTime() <= validFrom.getTime()) {
    return no('ENDS_BEFORE_IT_STARTS', `The ${what} cannot end before it starts. Check the two dates on it.`, 'expiresAt')
  }
  const lapsed = expiresAt != null && expiresAt.getTime() < on.getTime()
  const held =
    key === 'PROFESSIONAL_LICENSE'
      ? { license: text(input.licenseNumber), state: text(input.licenseState) }
      : null
  return {
    ok: true,
    row: {
      type: key, status: 'CLEAR', provider: issuer, referenceId: text(input.reference) ?? held?.license ?? null,
      issuedAt: input.issuedOn ?? null, validFrom, expiresAt, formEdition: text(input.formEdition), result: held,
      ordered: false, orderedAt: null, verifiedAt: on, evidence: [],
    },
    says:
      `${input.recordedBy} examined ${possessiveOf(input.subjectName)} ${what}` +
      `${held?.license ? ` ${held.license}${held.state ? `, ${held.state}` : ''}` : ''}` +
      `${issuer ? ` from ${issuer}` : ''}` +
      (expiresAt ? `, good until ${plainDate(expiresAt.toISOString())}.` : '.') +
      (lapsed ? ` It has already run out, so it holds nothing until a renewal is on file.` : ''),
  }
}

function possessiveOf(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}

// ── After an unfavorable report: the steps that stay with the firm ────
//
// The founder, 2026-09-22: the screening company renders the verdict and
// carries the risk of it. What does not transfer is the process around
// it. Under the Fair Credit Reporting Act the firm that ordered a
// background check, before it acts on an unfavorable report, gives the
// person a pre-adverse action notice with a copy of the report and the
// summary of their rights, waits long enough for them to answer or
// dispute it with the screening company, and only then gives the final
// notice (15 U.S.C. §1681b(b)(3), §1681m(a)). The matrix row for checks
// said, until 2026-10-21, "nothing in the app knows FCRA exists". This
// is the knowing, as data and a rule.
//
// BLOCK, because it is legally grounded: a final notice before the wait
// is over is refused in a sentence that names the day it may be given.
// Deciding NOT to act on the report needs no wait — it is the outcome
// the wait protects — and is recorded with its reason.

/** How long the person has to answer, per place. Rules live in data: a change of law is a change of a line. */
export const ADVERSE_ACTION_WAIT: Record<string, { businessDays: number; says: string }> = {
  US: {
    businessDays: 5,
    says: 'Federal law sets no number of days; five business days is the period the regulators have accepted as reasonable.',
  },
  'US-CA': {
    businessDays: 5,
    says: 'California’s Fair Chance Act gives at least five business days to answer, and five more where the person says they are disputing the record (Gov. Code §12952).',
  },
  'US-NY-NEW YORK': {
    businessDays: 5,
    says: 'New York City’s Fair Chance Act gives at least five business days after the notice and a copy of the analysis.',
  },
  'US-PA-PHILADELPHIA': {
    businessDays: 10,
    says: 'Philadelphia’s fair criminal record screening law gives ten business days to answer.',
  },
  'US-CA-LOS ANGELES': {
    businessDays: 5,
    says: 'Los Angeles’ Fair Chance Initiative gives at least five business days to answer.',
  },
}

/** The row that applies to a work site: the city's, then the state's, then the country's. Null outside the US: this table carries only US law. */
export function adverseWaitFor(site: { country?: string | null; state?: string | null; city?: string | null }): { key: string; businessDays: number; says: string } | null {
  const country = (site.country ?? 'US').trim().toUpperCase()
  if (country !== 'US' && country !== 'USA') return null
  const state = (site.state ?? '').trim().toUpperCase()
  const city = (site.city ?? '').trim().toUpperCase()
  for (const k of [state && city ? `US-${state}-${city}` : null, state ? `US-${state}` : null, 'US']) {
    if (k && ADVERSE_ACTION_WAIT[k]) return { key: k, ...ADVERSE_ACTION_WAIT[k] }
  }
  return null
}

/** `n` business days after `from`, Monday to Friday, counted from the next day. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  let left = n
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}

export type AdverseStepKind = 'PRE_NOTICE' | 'FINAL' | 'NOT_TAKEN'

/** What has already happened on this report, as written beside it. */
export interface AdverseRecord {
  preNoticeAt?: string | null
  preNoticeDocumentId?: string | null
  waitUntil?: string | null
  waitSays?: string | null
  finalAt?: string | null
  finalDocumentId?: string | null
  decision?: 'ADVERSE' | 'NOT_TAKEN' | null
  decisionReason?: string | null
  decidedBy?: string | null
}

/**
 * One step after an unfavorable report, as the `AdverseAction` table
 * holds it: one row per report and step, written beside the report and
 * never over it. Until 2026-10-21 the steps lived inside the report's own
 * `result` column, which is the screening company's words; a table of
 * their own keeps the firm's acts out of the provider's verdict.
 */
export interface AdverseActionRow {
  step: AdverseStepKind | string
  sentAt: Date
  waitEndsAt?: Date | null
  waitSays?: string | null
  reason?: string | null
  noticeDocumentId?: string | null
  /** Whoever took the step, by name. */
  by?: { name: string } | null
}

/**
 * The record `adverseStep` reads, from the rows on file. Where a report
 * has no rows at all and carries the steps the way they were written
 * before the table existed (`result.adverse`), those are read instead, so
 * a report decided before the move does not read as undecided after it.
 */
export function adverseRecordFrom(rows: readonly AdverseActionRow[], legacy?: unknown): AdverseRecord {
  if (rows.length === 0) {
    const old = (legacy as { adverse?: AdverseRecord } | null | undefined)?.adverse
    return old && typeof old === 'object' ? { ...old } : {}
  }
  const out: AdverseRecord = {}
  for (const r of rows) {
    const step = String(r.step).toUpperCase()
    if (step === 'PRE_NOTICE') {
      out.preNoticeAt = r.sentAt.toISOString()
      out.preNoticeDocumentId = r.noticeDocumentId ?? null
      out.waitUntil = r.waitEndsAt ? r.waitEndsAt.toISOString() : null
      out.waitSays = r.waitSays ?? null
    } else if (step === 'FINAL') {
      out.finalAt = r.sentAt.toISOString()
      out.finalDocumentId = r.noticeDocumentId ?? null
      out.decision = 'ADVERSE'
      out.decisionReason = r.reason ?? null
      out.decidedBy = r.by?.name ?? null
    } else if (step === 'NOT_TAKEN') {
      out.decision = 'NOT_TAKEN'
      out.decisionReason = r.reason ?? null
      out.decidedBy = r.by?.name ?? null
    }
  }
  return out
}

/**
 * The one row a step writes, from the verdict `adverseStep` returned.
 * The firm and the seat are the caller's; the placement the one named.
 */
export function adverseActionFor(
  step: AdverseStepKind,
  record: AdverseRecord,
  input: { verificationId: string; companyId: string; sellContractId: string | null; byId: string; noticeDocumentId: string | null; on: Date },
): {
  verificationId: string; companyId: string; sellContractId: string | null; step: AdverseStepKind; sentAt: Date
  waitEndsAt: Date | null; waitSays: string | null; byId: string; reason: string | null; reportCopySent: boolean; noticeDocumentId: string | null
} {
  return {
    verificationId: input.verificationId,
    companyId: input.companyId,
    sellContractId: input.sellContractId,
    step,
    sentAt: input.on,
    waitEndsAt: step === 'PRE_NOTICE' && record.waitUntil ? new Date(record.waitUntil) : null,
    waitSays: step === 'PRE_NOTICE' ? record.waitSays ?? null : null,
    byId: input.byId,
    reason: step === 'PRE_NOTICE' ? null : record.decisionReason ?? null,
    // A pre-adverse notice is refused by `adverseStep` unless the copy of the report is attached, so a written one carried it.
    reportCopySent: step === 'PRE_NOTICE',
    noticeDocumentId: step === 'NOT_TAKEN' ? null : input.noticeDocumentId,
  }
}

export interface AdverseInput {
  step: string
  /** The report, as recorded. */
  check: { type: string; status: string; provider: string | null; reference: string | null; orderedByFirm: string | null }
  callerFirm: string
  /** The caller's firm ordered the report. */
  callerOrdered: boolean
  subjectName: string
  record: AdverseRecord
  /** The notice paper named, where one is: about this person, from this firm, with the file on it. */
  notice: { aboutThisPerson: boolean; fromThisFirm: boolean; hasFile: boolean; sent: boolean } | null
  reason?: string | null
  wait: { key: string; businessDays: number; says: string } | null
  by: string
}

export type AdverseVerdict =
  | { ok: true; record: AdverseRecord; says: string }
  | { ok: false; status: 403 | 409 | 422; code: string; message: string; field?: string }

const UNFAVORABLE = ['FLAGGED', 'FAILED', 'CONDITIONAL']

/**
 * One step after an unfavorable report. Pure: `on` is the day the step is
 * taken, and the wait is counted from the day the first notice was given.
 */
export function adverseStep(input: AdverseInput, on: Date): AdverseVerdict {
  const { check, subjectName } = input
  const provider = check.provider ?? 'the screening company'
  const what = recordLabel(check.type)
  if (!orderedNotCollected(check.type)) {
    return { ok: false, status: 422, code: 'NOT_A_REPORT', message: `The ${what} is not a screening company’s report, so there are no notices to give on it.` }
  }
  if (!input.callerOrdered) {
    return {
      ok: false, status: 403, code: 'NOT_YOURS_TO_ACT',
      message: `The notices on ${possessiveOf(subjectName)} ${what} are given by the firm that ordered it${check.orderedByFirm ? `, ${check.orderedByFirm}` : ''}. ${input.callerFirm} did not order it.`,
    }
  }
  if (!UNFAVORABLE.includes(check.status)) {
    return {
      ok: false, status: 409, code: 'NOTHING_ADVERSE',
      message: `${provider} did not report anything unfavorable on the ${what}, so there is nothing to act on and no notice to give.`,
    }
  }
  if (input.record.decision) {
    return {
      ok: false, status: 409, code: 'ALREADY_DECIDED',
      message: input.record.decision === 'NOT_TAKEN'
        ? `${input.record.decidedBy ?? 'The firm'} already decided not to act on the ${what}. It stays on file as ${provider} wrote it.`
        : `The final notice on the ${what} was already given.`,
    }
  }
  const day = (iso: string) => plainDate(iso)
  const step = String(input.step ?? '').toUpperCase()

  if (step === 'NOT_TAKEN') {
    const reason = input.reason?.trim()
    if (!reason) {
      return { ok: false, status: 422, code: 'NO_REASON', field: 'reason', message: `Say why the ${what} does not change the decision. The reason is kept beside ${provider}’s report.` }
    }
    return {
      ok: true,
      record: { ...input.record, decision: 'NOT_TAKEN', decisionReason: reason, decidedBy: input.by },
      says: `${subjectName} goes ahead. ${input.by} decided the ${what} does not change the decision, and why is on file beside ${provider}’s report, which stays as they wrote it.`,
    }
  }

  const noticeOk = (n: AdverseInput['notice'], which: string): AdverseVerdict | null => {
    if (!n) return { ok: false, status: 422, code: 'NO_NOTICE', field: 'noticeDocumentId', message: `Name the ${which} sent to ${subjectName}. It is a paper from your firm, with the copy of the report and the summary of rights attached.` }
    if (!n.aboutThisPerson || !n.fromThisFirm) return { ok: false, status: 422, code: 'NOT_THEIR_NOTICE', field: 'noticeDocumentId', message: `That paper is not a notice from ${input.callerFirm} to ${subjectName}.` }
    if (!n.hasFile) return { ok: false, status: 422, code: 'NO_COPY', field: 'noticeDocumentId', message: `Attach the copy of ${possessiveOf(provider)} report and the summary of rights to the ${which}. It is not given until ${subjectName} has both.` }
    if (!n.sent) return { ok: false, status: 422, code: 'NOT_SENT', field: 'noticeDocumentId', message: `Send the ${which} to ${subjectName} first. A notice nobody received was not given.` }
    return null
  }

  if (step === 'PRE_NOTICE') {
    if (input.record.preNoticeAt) {
      return { ok: false, status: 409, code: 'ALREADY_GIVEN', message: `The pre-adverse action notice was given on ${day(input.record.preNoticeAt)}. ${subjectName} has until ${day(input.record.waitUntil ?? input.record.preNoticeAt)} to answer.` }
    }
    if (!input.wait) {
      return {
        ok: false, status: 422, code: 'NOT_CARRIED',
        message: `The steps after an unfavorable report at a site outside the United States are set by that country’s law, and this table carries only the US rules. Ask counsel; nothing here decides it.`,
      }
    }
    const bad = noticeOk(input.notice, 'pre-adverse action notice')
    if (bad) return bad
    const waitUntil = addBusinessDays(on, input.wait.businessDays).toISOString()
    return {
      ok: true,
      record: { ...input.record, preNoticeAt: on.toISOString(), waitUntil, waitSays: input.wait.says },
      says:
        `${subjectName} has the pre-adverse action notice, a copy of ${possessiveOf(provider)} report and the summary of rights. ` +
        `Nothing is decided on it before ${day(waitUntil)}: ${subjectName} may answer or dispute it with ${provider} until then. ${input.wait.says}`,
    }
  }

  if (step === 'FINAL') {
    if (!input.record.preNoticeAt || !input.record.waitUntil) {
      return { ok: false, status: 409, code: 'NO_PRE_NOTICE', message: `Give ${subjectName} the pre-adverse action notice with a copy of the report first. The final notice is the step after the wait, and the wait has not started.` }
    }
    if (on.getTime() < new Date(input.record.waitUntil).getTime()) {
      return {
        ok: false, status: 409, code: 'WAITING',
        message: `${subjectName} has until ${day(input.record.waitUntil)} to answer the ${what} or dispute it with ${provider}. A final decision before then is the step the law puts after the wait.`,
      }
    }
    const reason = input.reason?.trim()
    if (!reason) {
      return { ok: false, status: 422, code: 'NO_REASON', field: 'reason', message: `Say what was weighed, the job and the time since, before the final notice. The reason is kept with it.` }
    }
    const bad = noticeOk(input.notice, 'final adverse action notice')
    if (bad) return bad
    return {
      ok: true,
      record: { ...input.record, finalAt: on.toISOString(), decision: 'ADVERSE', decisionReason: reason, decidedBy: input.by },
      says: `The final adverse action notice was given to ${subjectName}, naming ${provider} and saying ${provider} did not make the decision. The reason is on file.`,
    }
  }

  return { ok: false, status: 422, code: 'VALIDATION', field: 'step', message: 'Say which step this is: the pre-adverse action notice, the final notice, or a decision not to act on the report.' }
}

// ── What a desk's own check must carry before it is on file ────────────
//
// Found by the release walk, 2026-10-27, in a client's supplier
// onboarding: Procurement ticked the Dun & Bradstreet report "On file" in
// one click with no file behind it, and HR ticked "Vendor screening
// (sanctions, litigation)" "On file" with no screening company, no
// reference and no date. Both read as green on the four-desk walk, and
// neither said anything a reader could check.
//
// The 2026-09-22 rule, applied to the firm rather than the person:
//
//   **A verdict a third party renders** — a sanctions and litigation
//   screening — is recorded the way it came back: their name, their
//   reference, their date and their word. A desk that clicks "on file"
//   with none of those has written a box somebody ticked, and a reader
//   cannot tell it from a report.
//
//   **A document somebody else issued** — a D&B report — is held as the
//   file, or at least as the report's number and the date printed on it,
//   so somebody can go and pull the same report again.
//
//   **A reference taken up** is a conversation, and what is on file is
//   who was spoken to and on what day.
//
// One list here, read by `lib/supplier-onboarding`'s `markItem` (demand)
// before an item goes to HELD, so the walk screen and the rule cannot
// disagree. Pure: no database, the clock handed in.

/** The three shapes a desk's own check comes in. */
export type DeskEvidenceShape =
  /** A screening company's (or a published list's) result, recorded verbatim. */
  | 'PROVIDER_VERDICT'
  /** A report somebody else issued: the file, or its number and date. */
  | 'ISSUED_REPORT'
  /** A reference spoken to: who and when. */
  | 'CONTACTED'

/** What the desk typed or attached when it said "on file". */
export interface DeskEvidence {
  /** Where the kept file is, through the one file door. */
  fileUrl?: string | null
  /** The screening company, or the list searched. */
  provider?: string | null
  /** Their case or report reference. */
  reference?: string | null
  /** The day on the report, or the day the reference was spoken to. YYYY-MM-DD. */
  on?: string | null
  /** The provider's word: CLEAR · CONDITIONAL · FLAGGED · FAILED. */
  outcome?: string | null
  /** The report's own number (a D&B report number, or the firm's D-U-N-S). */
  reportNumber?: string | null
  /** The person contacted, as a name a reader could ring back. */
  contactName?: string | null
}

export interface DeskEvidenceField {
  name: keyof DeskEvidence
  label: string
  help: string
}

export interface DeskEvidenceNeeds {
  key: string
  shape: DeskEvidenceShape
  /** The fields a screen draws beside "On file", in order. */
  fields: DeskEvidenceField[]
  /** One line under the item saying what "on file" means for it. */
  says: string
}

/** The provider's words a screening result may carry. ORDERED is not one: it has not come back. */
const SCREENING_WORD: Record<string, string> = {
  CLEAR: 'clear', CONDITIONAL: 'clear with conditions', FLAGGED: 'it flagged', FAILED: 'not clear',
}

export const SCREENING_OUTCOMES = ['CLEAR', 'CONDITIONAL', 'FLAGGED', 'FAILED'] as const

const DESK_EVIDENCE: Record<string, DeskEvidenceNeeds> = {
  VENDOR_SCREENING: {
    key: 'VENDOR_SCREENING',
    shape: 'PROVIDER_VERDICT',
    fields: [
      { name: 'provider', label: 'Screening company', help: 'Who ran it, or the list searched, as written on the result.' },
      { name: 'reference', label: 'Their reference', help: 'The case or report number on the result.' },
      { name: 'on', label: 'Date on the result', help: 'The day the result was issued.' },
      { name: 'outcome', label: 'What it says', help: 'Clear, clear with conditions, flagged, or not clear — their word, not ours.' },
    ],
    says: 'On file means the screening company’s result: its name, its reference, its date and its word.',
  },
  DNB_REPORT: {
    key: 'DNB_REPORT',
    shape: 'ISSUED_REPORT',
    fields: [
      { name: 'fileUrl', label: 'The report', help: 'Attach the report as Dun & Bradstreet issued it.' },
      { name: 'reportNumber', label: 'Report number or D-U-N-S', help: 'Where no file is attached, the number on the report.' },
      { name: 'on', label: 'Date on the report', help: 'Where no file is attached, the day printed on the report.' },
    ],
    says: 'On file means the report itself, or its number and the date printed on it.',
  },
  REFERENCE_CHECK: {
    key: 'REFERENCE_CHECK',
    shape: 'CONTACTED',
    fields: [
      { name: 'contactName', label: 'Who you spoke to', help: 'The name, and the firm they are at.' },
      { name: 'on', label: 'When', help: 'The day you spoke to them.' },
    ],
    says: 'On file means who was contacted, and on what day.',
  },
}

/** What "on file" needs for this checklist item, or null where the item has no rule here. */
export function deskEvidenceFor(itemKey: string): DeskEvidenceNeeds | null {
  return DESK_EVIDENCE[itemKey] ?? null
}

export interface DeskEvidenceShortfall {
  code: 'NEEDS_PROVIDER_VERDICT' | 'NOT_BACK_YET' | 'NEEDS_REPORT' | 'NEEDS_CONTACT' | 'DATE_AHEAD' | 'BAD_DATE'
  /** The first field to fill, so a screen can put the cursor there. */
  field: keyof DeskEvidence
  message: string
}

function filled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/** A YYYY-MM-DD day as a UTC midnight, or null where it is not one. */
function dayOf(v: string | null | undefined): Date | null {
  if (!filled(v)) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v!.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3]) ? null : d
}

/** True where `d` is a day after `on`, counted in whole UTC days. */
function ahead(d: Date, on: Date): boolean {
  const today = Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate())
  return d.getTime() > today
}

/**
 * Why this item may not be put on file with this evidence, or null where
 * it may. Only asked when the desk is marking the item on file: waiving
 * still needs only its reason, and unmarking needs nothing.
 *
 * An item with no rule here returns null, so a client's own item is
 * never refused by a list it is not on.
 */
export function deskEvidenceShortfall(itemKey: string, ev: DeskEvidence, on: Date): DeskEvidenceShortfall | null {
  const needs = deskEvidenceFor(itemKey)
  if (!needs) return null

  const date = dayOf(ev.on)
  const badDate = filled(ev.on) && !date
  const dateAhead = !!date && ahead(date, on)

  switch (needs.shape) {
    case 'PROVIDER_VERDICT': {
      const outcome = (ev.outcome ?? '').trim().toUpperCase()
      if (outcome === 'ORDERED') {
        return {
          code: 'NOT_BACK_YET', field: 'outcome',
          message: 'The vendor screening has not come back, so nothing is on file yet. Record it when the screening company sends the result.',
        }
      }
      const missing: [keyof DeskEvidence, string][] = []
      if (!filled(ev.provider)) missing.push(['provider', 'the screening company’s name'])
      if (!filled(ev.reference)) missing.push(['reference', 'their reference'])
      if (!filled(ev.on)) missing.push(['on', 'the date on the result'])
      if (!(SCREENING_OUTCOMES as readonly string[]).includes(outcome)) missing.push(['outcome', 'what the result says'])
      if (missing.length > 0) {
        return {
          code: 'NEEDS_PROVIDER_VERDICT', field: missing[0][0],
          message:
            `A vendor screening is on file only as the screening company’s result. Enter ${listOf(missing.map((m) => m[1]))}. ` +
            `The screening company renders it; the person examining it records what came back.`,
        }
      }
      break
    }
    case 'ISSUED_REPORT': {
      if (filled(ev.fileUrl)) {
        if (badDate) break
        if (dateAhead) break
        return null
      }
      if (!filled(ev.reportNumber) || !filled(ev.on)) {
        return {
          code: 'NEEDS_REPORT', field: filled(ev.reportNumber) ? 'on' : 'fileUrl',
          message:
            'A D&B report is on file only as the report itself, or its number and the date printed on it. ' +
            'Attach the report, or enter its number and date.',
        }
      }
      break
    }
    case 'CONTACTED': {
      if (!filled(ev.contactName) || !filled(ev.on)) {
        return {
          code: 'NEEDS_CONTACT', field: filled(ev.contactName) ? 'on' : 'contactName',
          message: 'References are on file only as who was contacted and on what day. Enter the name and the date.',
        }
      }
      break
    }
  }

  if (badDate) {
    return { code: 'BAD_DATE', field: 'on', message: 'Enter the date as a day on the calendar, such as 2026-03-12.' }
  }
  if (dateAhead) {
    return { code: 'DATE_AHEAD', field: 'on', message: 'That date has not happened yet. Enter the day printed on it, or the day it happened.' }
  }
  return null
}

function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The line a reader sees under an item on file, in the words that came
 * back. Null where the item has no rule here or nothing is recorded.
 *
 *   Dow Jones reported clear on Mar 12, 2026, reference 4471.
 *   D&B report 07-112-4471, dated Mar 2, 2026.
 *   Spoke to Dana Whitfield at Northbend on Mar 9, 2026.
 */
export function deskEvidenceSays(itemKey: string, ev: DeskEvidence): string | null {
  const needs = deskEvidenceFor(itemKey)
  if (!needs) return null
  const date = dayOf(ev.on)
  const when = date ? plainDate(date.toISOString()) : null
  switch (needs.shape) {
    case 'PROVIDER_VERDICT': {
      if (!filled(ev.provider)) return null
      const word = SCREENING_WORD[(ev.outcome ?? '').trim().toUpperCase()]
      if (!word) return null
      const ref = filled(ev.reference) ? `, reference ${ev.reference!.trim()}` : ''
      return `${ev.provider!.trim()} reported ${word}${when ? ` on ${when}` : ''}${ref}.`
    }
    case 'ISSUED_REPORT': {
      if (filled(ev.reportNumber)) return `D&B report ${ev.reportNumber!.trim()}${when ? `, dated ${when}` : ''}${filled(ev.fileUrl) ? ', file kept' : ''}.`
      return filled(ev.fileUrl) ? `D&B report kept as a file${when ? `, dated ${when}` : ''}.` : null
    }
    case 'CONTACTED':
      return filled(ev.contactName) ? `Spoke to ${ev.contactName!.trim()}${when ? ` on ${when}` : ''}.` : null
  }
}
