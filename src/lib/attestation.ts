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

  const when = a.verifiedAt.toISOString().slice(0, 10)
  const head = `${label(a.kind)} verified by ${a.verifiedBy} on ${when}`
  const tail = lapsed
    ? `. The document it was against expired on ${a.subjectExpiresAt!.toISOString().slice(0, 10)}.`
    : a.subjectExpiresAt
      ? `, valid to ${a.subjectExpiresAt.toISOString().slice(0, 10)}.`
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
  return d ? d.toISOString().slice(0, 10) : null
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
 *   Sterling reported clear on 2026-03-12, reference 4471.
 *   Recorded here by Dana Whitfield on 2026-03-12. No screening company
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
