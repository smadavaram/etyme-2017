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
 * judgement about a person, and it fails four ways at once:
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
   * it, never a tick — because a tick is a judgement and a sentence is a
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
      'the party with the duty decide. A tick is a judgement; a sentence with a name ' +
      'and a date in it is a fact.'
  )
}
