/**
 * What may be asked for, and when.
 *
 * ── Why this is two lists and not one ────────────────────────────────
 *
 * A business wants to know, before it puts somebody forward, that this is
 * a real person who can lawfully do the work — otherwise it wastes a
 * client's time and its own. That instinct is right and the usual
 * implementation of it is unlawful.
 *
 * Asking a candidate for a passport, a green card or a visa notice before
 * an offer is **document abuse** in the United States: the employer picks
 * which document it wants to see, before the point at which the law lets
 * it ask at all. The question that IS allowed is a question — are you
 * authorized to work here, and will you need sponsorship now or later.
 * The United Kingdom is the same shape: the right-to-work check belongs
 * before the first day, not before the application, and running it early
 * on some applicants and not others is the discrimination itself. Across
 * the EU, collecting identity documents from somebody you have not
 * offered a job to fails data minimization on its own.
 *
 * So there are two stages and the split is not a preference:
 *
 *   **Application** — questions, attestations, and things a person
 *   volunteers about themselves. Enough to know they are real and can
 *   lawfully be placed. No identity documents.
 *
 *   **Engagement** — after an offer or an award. The documents
 *   themselves, with issue dates, expiry dates, and somebody's name
 *   against having seen them.
 *
 * ── What made the 2017 version buggy ─────────────────────────────────
 *
 * It had one list. Everything was collected as early as possible because
 * early felt safer, expiry was a nullable column nobody swept, and the
 * per-country differences were a comment. The result was a system that
 * held documents it should not have had and let expired ones through.
 *
 * A firm whose own counsel takes a different position can override any
 * rule here. What it cannot do is fall into the wrong stage by default.
 */

export type Stage = 'APPLICATION' | 'ENGAGEMENT'

export type Jurisdiction = 'US' | 'UK' | 'EU' | 'CA' | 'AU' | 'IN' | 'DEFAULT'

/** Which way the paperwork is traveling. */
export type Direction =
  /** We are asking somebody else for it. */
  | 'INBOUND'
  /**
   * Somebody is asking US for it — a client screening us as a supplier,
   * or a prime screening a sub. The same machinery, pointed outward.
   */
  | 'OUTBOUND'

export type AskKind =
  /** A yes or no, or a short answer. No file. */
  | 'QUESTION'
  /** A statement the person signs. Carries weight, holds no identity data. */
  | 'ATTESTATION'
  /** A real document, with dates. */
  | 'DOCUMENT'
  /** A check run by a third party with the person's consent. */
  | 'VERIFICATION'

export interface Ask {
  key: string
  label: string
  kind: AskKind
  /** The earliest stage this may be asked at. */
  stage: Stage
  /** What the person is actually being asked, in their words. */
  hint: string
  required: boolean
  /** Months an accepted answer counts for. Null = does not expire. */
  validMonths: number | null
  /**
   * Where this had to be moved to a later stage, why — in the words you
   * would use to a business owner who thinks you are being difficult.
   */
  movedBecause?: string
  /** The question that IS allowed earlier, where the document is not. */
  insteadAsk?: string
}

// ── The rule table ────────────────────────────────────────────────────
//
// One row per thing anybody asks for. Written as data rather than code so
// that a change of law is a change of a line, and so that somebody who is
// not a programmer can be walked through why a field moved.

interface Rule {
  /** The earliest lawful stage, by jurisdiction. DEFAULT covers the rest. */
  earliest: Partial<Record<Jurisdiction, Stage>> & { DEFAULT: Stage }
  kind: AskKind
  validMonths: number | null
  /** Said when the item is pushed to the later stage. */
  because?: Partial<Record<Jurisdiction, string>> & { DEFAULT?: string }
  /** What may be asked at application instead. */
  insteadAsk?: string
}

const RULES: Record<string, Rule> = {
  RESUME: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'DOCUMENT',
    validMonths: null,
  },

  // The question, which is lawful everywhere and is what businesses
  // actually need to know before they spend a client's time.
  WORK_AUTH_QUESTION: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'QUESTION',
    validMonths: null,
  },

  // The document, which is not.
  RIGHT_TO_WORK: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'DOCUMENT',
    validMonths: null,
    because: {
      US:
        'Asking for a passport or a green card before an offer is document abuse — ' +
        'the law lets you verify after the offer, and lets the person choose which ' +
        'document to show. Ask the question now and take the document at award.',
      UK:
        'The right-to-work check belongs before the first day, not before the ' +
        'application. Running it early on some applicants and not others is the ' +
        'discrimination itself.',
      EU:
        'Holding identity documents for somebody you have not offered a job to ' +
        'fails data minimization. Ask at offer.',
      DEFAULT:
        'Identity documents belong after an offer. Ask whether they are authorized ' +
        'to work, and take the document at award.',
    },
    insteadAsk:
      'Are you authorized to work in this country, and will you need sponsorship ' +
      'now or in the future?',
  },

  I9_EVERIFY: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'DOCUMENT',
    validMonths: null,
    because: {
      DEFAULT:
        'The I-9 is completed after acceptance of an offer and within three days of ' +
        'starting. It cannot lawfully be run earlier.',
    },
  },

  // Criminal record checks. Ban-the-box is now the norm rather than the
  // exception across most US states and much of Europe.
  BACKGROUND_CHECK: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'VERIFICATION',
    validMonths: 12,
    because: {
      US:
        'Most states and cities bar asking about criminal history before a ' +
        'conditional offer. Run it at award, on the offer.',
      UK:
        'A DBS check is made against a role that has been offered, and only where ' +
        'the role is eligible for one.',
      EU:
        'A criminal record check needs a lawful basis tied to the specific role. ' +
        'Before an offer there is not one.',
      DEFAULT:
        'Criminal record checks run against an offer, not an application.',
    },
    insteadAsk:
      'Is there anything that would prevent you passing a background check for ' +
      'this kind of work?',
  },

  DRUG_SCREENING: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'VERIFICATION',
    validMonths: 12,
    because: {
      DEFAULT: 'A medical test is taken against a conditional offer, never before one.',
    },
  },

  // Employment and education history — these a candidate volunteers, and
  // verifying them is ordinary. Consent is still needed to contact a
  // former employer, which is why it is a VERIFICATION rather than a
  // question.
  EMPLOYMENT_HISTORY: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'ATTESTATION',
    validMonths: null,
  },
  EMPLOYMENT_VERIFICATION: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'VERIFICATION',
    validMonths: 24,
    because: {
      DEFAULT:
        'Contacting a current employer before an offer can cost somebody their job. ' +
        'Verify past employers now if they consent, the current one at award.',
    },
  },
  EDUCATION_HISTORY: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'ATTESTATION',
    validMonths: null,
  },
  EDUCATION_VERIFICATION: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'VERIFICATION',
    // A degree does not stop being true. The evaluation is done once.
    validMonths: null,
  },
  REFERENCE_CHECK: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'VERIFICATION',
    validMonths: 24,
  },

  // Things about the person that are none of anybody's business until
  // they are being paid.
  BANK_DETAILS: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'DOCUMENT',
    validMonths: null,
    because: {
      DEFAULT:
        'Bank details are for paying somebody. Asking before there is anything to ' +
        'pay is how a candidate database becomes a fraud target.',
    },
  },
  TAX_FORM: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'DOCUMENT',
    validMonths: null,
  },
  DOB_SSN: {
    earliest: { DEFAULT: 'ENGAGEMENT' },
    kind: 'DOCUMENT',
    validMonths: null,
    because: {
      DEFAULT:
        'A date of birth or a national insurance number before an offer invites an ' +
        'age discrimination claim and gives you nothing you need yet.',
    },
  },

  // Professional standing, which is about the work and may be asked early.
  CERTIFICATION: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'DOCUMENT',
    validMonths: 36,
  },

  // The license a regulator issues a person to do the work at all — a
  // state RN registration, a professional engineer's stamp, a pharmacy
  // license, a commercial driver's license.
  //
  // APPLICATION, and that is not the two-stage rule being relaxed. The
  // rule exists because identity documents reveal national origin,
  // immigration status and age, and asking for them before an offer lets
  // an employer pick which one it wants to see. A license number is none
  // of that: it is a qualification, it is published on the issuing
  // board's own public register, and a hospital that may not ask a nurse
  // whether she is licensed in the state cannot staff a shift. Asking
  // early protects the candidate first — being put forward for work she
  // is not licensed to do wastes her time before it wastes anybody's.
  //
  // VERIFICATION rather than DOCUMENT for the same reason: the answer is
  // checked against the board's register, not collected as a file.
  //
  // `validMonths: null` because renewal cycles differ by state and by
  // profession — Wisconsin renews an RN every two years, other boards
  // every one or three — and a number invented here would put a computed
  // expiry on a license nobody had ever dated. The kind still expires;
  // `licenseGate` says so without guessing when.
  PROFESSIONAL_LICENSE: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'VERIFICATION',
    validMonths: null,
  },
  SECURITY_CLEARANCE: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'ATTESTATION',
    validMonths: null,
  },
  NDA: {
    earliest: { DEFAULT: 'APPLICATION' },
    kind: 'DOCUMENT',
    validMonths: null,
  },

  // Company-level. No stage question — a supplier is not a job applicant.
  W9: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: null },
  INSURANCE_GL: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: 12 },
  INSURANCE_WC: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: 12 },
  INSURANCE_EO: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: 12 },
  INSURANCE_CYBER: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: 12 },
  BANK_LETTER: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: null },
  BUSINESS_PARTNER: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: null },
  SOC2: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: 12 },
  FINANCIALS: { earliest: { DEFAULT: 'APPLICATION' }, kind: 'DOCUMENT', validMonths: 12 },
}

function pick<T>(
  table: Partial<Record<Jurisdiction, T>> & { DEFAULT: T },
  j: Jurisdiction
): T {
  return table[j] ?? table.DEFAULT
}

/**
 * The earliest stage an item may be asked at, and why if it moved.
 *
 * Unknown keys stay where the business put them. Refusing to carry an
 * item we have no rule for would make the product unusable in the first
 * country nobody thought about.
 */
export function stageFor(
  key: string,
  jurisdiction: Jurisdiction = 'DEFAULT'
): { stage: Stage; because?: string; insteadAsk?: string } {
  const rule = RULES[key]
  if (!rule) return { stage: 'APPLICATION' }

  const stage = pick(rule.earliest, jurisdiction)
  const because = rule.because
    ? rule.because[jurisdiction] ?? rule.because.DEFAULT
    : undefined

  return { stage, because, insteadAsk: rule.insteadAsk }
}

export interface Wish {
  key: string
  label: string
  hint: string
  required: boolean
  /** Where the business wanted it. */
  wantedAt: Stage
}

export interface Compiled {
  application: Ask[]
  engagement: Ask[]
  /** What was moved, so the business is told rather than quietly overruled. */
  moved: { key: string; label: string; because: string; insteadAsk?: string }[]
}

/**
 * Turns what a business wants to collect into what it may collect, when.
 *
 * Nothing is dropped. An item asked for too early is moved to the stage
 * where it is lawful, and where a question can stand in for it at the
 * earlier stage, that question is added. A checklist that silently loses
 * an item is worse than one that argues with you.
 */
export function compile(
  wishes: Wish[],
  jurisdiction: Jurisdiction = 'DEFAULT'
): Compiled {
  const application: Ask[] = []
  const engagement: Ask[] = []
  const moved: Compiled['moved'] = []
  const seenAtApplication = new Set<string>()

  for (const w of wishes) {
    const rule = RULES[w.key]
    const { stage: earliest, because, insteadAsk } = stageFor(w.key, jurisdiction)

    // A business may always collect later than it has to. It may never
    // collect earlier.
    const at: Stage = w.wantedAt === 'ENGAGEMENT' ? 'ENGAGEMENT' : earliest
    const pushed = w.wantedAt === 'APPLICATION' && earliest === 'ENGAGEMENT'

    const ask: Ask = {
      key: w.key,
      label: w.label,
      kind: rule?.kind ?? 'DOCUMENT',
      stage: at,
      hint: w.hint,
      required: w.required,
      validMonths: rule?.validMonths ?? null,
      ...(pushed && because ? { movedBecause: because } : {}),
      ...(pushed && insteadAsk ? { insteadAsk } : {}),
    }

    if (at === 'APPLICATION') {
      application.push(ask)
      seenAtApplication.add(w.key)
    } else {
      engagement.push(ask)
    }

    if (pushed && because) {
      moved.push({ key: w.key, label: w.label, because, insteadAsk })

      // The question that stands in for the document. Added at
      // application so the business still finds out what it needed to
      // know, which is the whole point of having asked.
      if (insteadAsk && !seenAtApplication.has(`${w.key}_Q`)) {
        application.push({
          key: `${w.key}_Q`,
          label: `${w.label} — the question`,
          kind: 'QUESTION',
          stage: 'APPLICATION',
          hint: insteadAsk,
          required: w.required,
          validMonths: null,
        })
        seenAtApplication.add(`${w.key}_Q`)
      }
    }
  }

  return { application, engagement, moved }
}

// ── Expiry ────────────────────────────────────────────────────────────

/**
 * NOT_YET_VALID was added on 2026-09-16 and is the one that was missing.
 * A certificate of insurance printed in August for cover that starts on
 * 1 September is on file, is not expired, and covers nobody starting in
 * August. Checking only the ceiling made that read as VALID — a
 * compliance answer that is simply wrong, on the one document Addendum E
 * names as a block.
 */
export type Standing =
  | 'MISSING'
  | 'NOT_YET_VALID'
  | 'VALID'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'NO_EXPIRY_RECORDED'

/** Chase this far ahead. Long enough to renew an insurance certificate. */
export const WARN_WITHIN_DAYS = 30

export interface Held {
  key: string
  label: string
  issuedAt?: Date | null
  /**
   * The day cover actually begins, where the paper says so. Falls back to
   * `issuedAt`, because for most documents the day it was issued is the
   * day it starts. Both absent means there is no floor at all — which is
   * the truth for a degree certificate and a lie for a policy.
   */
  validFrom?: Date | null
  expiresAt?: Date | null
  /** Who confirmed they had seen it, and when. */
  verifiedById?: string | null
  verifiedAt?: Date | null
}

export interface DocStanding {
  key: string
  label: string
  standing: Standing
  daysLeft: number | null
  /** True where it is on file but nobody ever said they had looked at it. */
  unverified: boolean
  says: string
}

/**
 * Where one document stands today.
 *
 * The 2017 version had an expiry column that nothing swept, so a
 * certificate that lapsed in March was still green in July. Expiry is
 * only useful as a thing that is checked, which is why this is a
 * function and not a status field.
 */
export function standingOf(
  held: Held | null,
  spec: {
    key: string
    label: string
    validMonths: number | null
    /**
     * Whether this kind expires at all, where the answer is not "every N
     * months".
     *
     * A certificate of insurance is good for twelve, so `validMonths`
     * said two things at once: how long it counts for, and that it counts
     * for a limited time. A state license says neither — renewal cycles
     * differ by board, so there is no honest number — and it plainly
     * expires. Left to `validMonths` alone, a license on file with
     * nobody's expiry date against it read as "on file and does not
     * expire", which is the exact 2017 bug this function exists to kill,
     * arriving through a different door.
     *
     * Defaults to `validMonths != null`, so every caller written before
     * this keeps the answer it already had.
     */
    expires?: boolean
  },
  on: Date
): DocStanding {
  const kindExpires = spec.expires ?? spec.validMonths != null
  if (!held) {
    return {
      key: spec.key,
      label: spec.label,
      standing: 'MISSING',
      daysLeft: null,
      unverified: false,
      says: `${spec.label} has not been collected.`,
    }
  }

  const unverified = !held.verifiedAt

  // ── The floor ──
  //
  // Read before anything else, because a document that has not started is
  // not "valid but early" — it covers nobody today, whatever its expiry
  // says. `spec.validMonths == null` means the kind does not expire, and a
  // kind that does not expire does not have a start worth enforcing
  // either; the floor is only asked of paper that covers a period.
  const floor = held.validFrom ?? held.issuedAt ?? null
  if (kindExpires && floor && floor.getTime() > on.getTime()) {
    const until = Math.ceil((floor.getTime() - on.getTime()) / 86_400_000)
    const day = floor.toISOString().slice(0, 10)
    return {
      key: spec.key,
      label: spec.label,
      standing: 'NOT_YET_VALID',
      daysLeft: null,
      unverified,
      says:
        `${spec.label} is on file but does not start until ${day} — ` +
        `${until} day${until === 1 ? '' : 's'} away. It does not cover today.`,
    }
  }

  // Where the item expires but the document does not carry a date, fall
  // back to the issue date plus the window. Where neither is known, say
  // so rather than assuming it is fine.
  const expires =
    held.expiresAt ??
    (spec.validMonths != null && held.issuedAt
      ? new Date(
          Date.UTC(
            held.issuedAt.getUTCFullYear(),
            held.issuedAt.getUTCMonth() + spec.validMonths,
            held.issuedAt.getUTCDate()
          )
        )
      : null)

  if (!expires) {
    if (!kindExpires) {
      return {
        key: spec.key,
        label: spec.label,
        standing: 'VALID',
        daysLeft: null,
        unverified,
        says: unverified
          ? `${spec.label} is on file. Nobody has confirmed they checked it.`
          : `${spec.label} is on file and does not expire.`,
      }
    }
    return {
      key: spec.key,
      label: spec.label,
      standing: 'NO_EXPIRY_RECORDED',
      daysLeft: null,
      unverified,
      says:
        `${spec.label} is on file with no expiry date recorded, and this kind ` +
        `expires. Add the date — an unknown expiry passes every check until the ` +
        `day somebody audits it.`,
    }
  }

  const days = Math.floor((expires.getTime() - on.getTime()) / 86_400_000)

  if (days < 0) {
    return {
      key: spec.key,
      label: spec.label,
      standing: 'EXPIRED',
      daysLeft: days,
      unverified,
      says: `${spec.label} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`,
    }
  }
  if (days <= WARN_WITHIN_DAYS) {
    return {
      key: spec.key,
      label: spec.label,
      standing: 'EXPIRING',
      daysLeft: days,
      unverified,
      says: `${spec.label} expires in ${days} day${days === 1 ? '' : 's'}. Ask for the renewal now.`,
    }
  }

  return {
    key: spec.key,
    label: spec.label,
    standing: 'VALID',
    daysLeft: days,
    unverified,
    says: unverified
      ? `${spec.label} is valid for ${days} more days. Nobody has confirmed they checked it.`
      : `${spec.label} is valid for ${days} more days.`,
  }
}

export interface Clearance {
  clear: boolean
  /** The ones that stop somebody starting. */
  blocking: DocStanding[]
  /** The ones worth chasing that do not stop anything today. */
  chasing: DocStanding[]
  says: string
}

/**
 * Whether somebody may start.
 *
 * A required document that is missing or expired blocks. Everything else
 * is a chase. The distinction matters because a system that blocks on
 * everything gets switched off, and one that blocks on nothing is
 * decoration.
 */
export function clearance(
  asks: Ask[],
  held: Map<string, Held>,
  on: Date
): Clearance {
  const standings = asks.map((a) =>
    standingOf(held.get(a.key) ?? null, a, on)
  )

  const blocking = standings.filter((s, i) => {
    if (!asks[i].required) return false
    // NOT_YET_VALID sits with EXPIRED and not with EXPIRING: both are a
    // document on file that does not cover the day somebody starts, and
    // the exposure is identical.
    return s.standing === 'MISSING' || s.standing === 'EXPIRED' || s.standing === 'NOT_YET_VALID'
  })

  const chasing = standings.filter(
    (s) =>
      !blocking.includes(s) &&
      (s.standing === 'EXPIRING' ||
        s.standing === 'NO_EXPIRY_RECORDED' ||
        s.standing === 'MISSING' ||
        s.unverified)
  )

  return {
    clear: blocking.length === 0,
    blocking,
    chasing,
    says:
      blocking.length === 0
        ? chasing.length === 0
          ? 'Everything required is on file and in date.'
          : `Cleared to start. ${chasing.length} thing${chasing.length === 1 ? '' : 's'} to chase.`
        : blocking.length === 1
          ? blocking[0].says
          : `${blocking.length} required documents are missing or out of date — ${blocking[0].label} among them.`,
  }
}

// ── Supplier insurance, at the point of submission ────────────────────
//
// Addendum E lists lapsed supplier insurance among the five things that
// BLOCK rather than warn. Until now the certificate was collected (the
// packet asks for it) and checked at award (`checkCover` in
// worker-classification.ts), which is one step too late: a client has by
// then read a CV, run an interview and made an offer against a supplier
// who could not lawfully put anybody on their site.
//
// Three deliberate lines here, because "insurance blocks" on its own
// would be both wrong and unusable.
//
// **A lapse blocks; an absence chases.** A certificate the supplier gave
// us with an expiry date that has passed is a fact — nothing is being
// judged. A certificate that was never collected is a different thing
// entirely, and refusing every supplier who has not yet been asked would
// make Etyme the party deciding what cover a client requires. That is a
// screening judgment, and screening judgments are not ours to make.
// Which cover is mandatory varies: workers' compensation is state-funded
// in the monopolistic states, the UK equivalent is employers' liability,
// and a fully remote engagement may reasonably need neither.
//
// **So the client's own list escalates it.** `requiredTypes` is data.
// A client that insists on general liability gets a block on its absence,
// not because we decided so but because they did.
//
// **The two defaults are general liability and workers' compensation**,
// because those are the two that answer when somebody is hurt on a site.
// Errors and omissions and cyber lapse into a chase unless asked for.

/** Cover whose lapse stops a placement wherever a client has said nothing. */
export const COVER_THAT_STOPS_WORK = ['INSURANCE_GL', 'INSURANCE_WC'] as const

/** How long a certificate of insurance counts for. Brokers issue annually. */
const COVER_VALID_MONTHS = 12

const COVER_LABEL: Record<string, string> = {
  INSURANCE_GL: 'certificate of general liability insurance',
  INSURANCE_WC: "certificate of workers' compensation",
  INSURANCE_EO: 'errors and omissions cover',
  INSURANCE_CYBER: 'cyber liability cover',
}

export function coverLabel(type: string): string {
  return COVER_LABEL[type] ?? type.toLowerCase().replace(/_/g, ' ')
}

/** A verification row, reduced to what the gate needs. */
export interface CoverCertificate {
  /** INSURANCE_GL · INSURANCE_WC · INSURANCE_EO · INSURANCE_CYBER */
  type: string
  /** The Verification status: PENDING · CLEAR · EXPIRED · FAILED · … */
  status: string
  issuedAt?: Date | null
  /** The day the policy period begins, where the certificate says so. */
  validFrom?: Date | null
  expiresAt?: Date | null
  verifiedAt?: Date | null
}

export interface CoverGate {
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  /** Cover whose lapse or absence stops a submission today. */
  blocking: DocStanding[]
  /** Worth chasing; stops nothing yet. */
  chasing: DocStanding[]
  /** One line, in the form somebody acts on. */
  says: string
  /** What to actually do, in the shape the vendor's broker works in. */
  fix: string | null
}

/** A certificate a supplier has actually produced, whatever its dates. */
const A_CERTIFICATE = ['CLEAR', 'CONDITIONAL', 'EXPIRED']

/**
 * Whether this supplier may put anybody forward today.
 *
 * Pure. The caller reads the Verification rows for the supplying company
 * and passes them in; nothing here touches a database, so every branch is
 * testable against a fixed date.
 */
export function supplierCoverGate(input: {
  /** The supplying company, by name. It appears in the refusal. */
  supplierName: string
  certificates: CoverCertificate[]
  /** Cover this client's own policy insists on. Absence of one blocks. */
  requiredTypes?: string[]
  /** Who the certificate holder line should name, where it is known. */
  clientName?: string | null
  on: Date
}): CoverGate {
  const required = input.requiredTypes ?? []
  const mustNotLapse = new Set<string>([...COVER_THAT_STOPS_WORK, ...required])

  // Every kind we have an opinion about: the two defaults, whatever the
  // client added, and anything the supplier has actually filed. A
  // certificate on file that nobody asked for is still worth reporting
  // when it runs out.
  const kinds = [
    ...new Set([
      ...COVER_THAT_STOPS_WORK,
      ...required,
      ...input.certificates.map((c) => c.type).filter((t) => t.startsWith('INSURANCE_')),
    ]),
  ]

  const blocking: DocStanding[] = []
  const chasing: DocStanding[] = []

  for (const kind of kinds) {
    const label = coverLabel(kind)
    const rows = input.certificates.filter((c) => c.type === kind)

    // A request that has not come back is not a certificate. Saying "on
    // file" of a check still running is how a supplier gets waved through
    // on paperwork that does not exist.
    const produced = rows.filter((c) => A_CERTIFICATE.includes(c.status))

    // A renewal supersedes the one it renews, so the certificate that
    // counts is the one that runs longest — not the newest row, which on
    // a back-dated upload is the wrong one.
    //
    // Cover that covers TODAY comes first, ahead of cover that runs
    // longest. A supplier who files next year's certificate early holds
    // two: this year's, expiring in three weeks, and next year's, starting
    // when that one ends. Sorting on expiry alone picks the one that has
    // not started, and reading the floor would then block a supplier for
    // being organized — which is the wrong answer arriving by the door the
    // right answer came in.
    const coversToday = (c: CoverCertificate): boolean => {
      const floor = c.validFrom ?? c.issuedAt ?? null
      if (floor && floor.getTime() > input.on.getTime()) return false
      if (c.expiresAt && c.expiresAt.getTime() < input.on.getTime()) return false
      return true
    }
    const best = produced.slice().sort((a, b) => {
      const at = coversToday(a) ? 1 : 0
      const bt = coversToday(b) ? 1 : 0
      if (at !== bt) return bt - at
      const ae = a.expiresAt?.getTime() ?? -Infinity
      const be = b.expiresAt?.getTime() ?? -Infinity
      if (ae !== be) return be - ae
      return (b.issuedAt?.getTime() ?? 0) - (a.issuedAt?.getTime() ?? 0)
    })[0]

    let standing = standingOf(
      best
        ? {
            key: kind,
            label,
            issuedAt: best.issuedAt ?? null,
            validFrom: best.validFrom ?? null,
            expiresAt: best.expiresAt ?? null,
            verifiedAt: best.verifiedAt ?? null,
          }
        : null,
      { key: kind, label, validMonths: COVER_VALID_MONTHS },
      input.on
    )

    // The supplier's own record says it has run out. Believe them even
    // where no date was ever recorded — a status nobody can reconcile
    // against a date is exactly the state that went green in 2017.
    if (best && best.status === 'EXPIRED' && standing.standing !== 'EXPIRED') {
      standing = {
        ...standing,
        standing: 'EXPIRED',
        daysLeft: null,
        says: `${label} is marked expired on ${input.supplierName}'s own record.`,
      }
    }

    // Cover that has not begun stops work for the same reason lapsed cover
    // does: the person is on a site with nothing behind them. Addendum E
    // names lapsed supplier insurance as a block, and "starts next month"
    // is the same exposure a week earlier.
    const stops =
      mustNotLapse.has(kind) &&
      (standing.standing === 'EXPIRED' ||
        standing.standing === 'NOT_YET_VALID' ||
        (standing.standing === 'MISSING' && required.includes(kind)))

    if (stops) blocking.push(standing)
    else if (standing.standing !== 'VALID' || standing.unverified) chasing.push(standing)
  }

  const outcome: CoverGate['outcome'] =
    blocking.length > 0 ? 'BLOCK' : chasing.length > 0 ? 'WARN' : 'PASS'

  const holder = input.clientName ?? 'the client'
  // A supplier whose only trouble is that its cover starts later cannot
  // act on "ask your broker for a replacement" — it has the certificate.
  // Either the policy is brought forward or the start date moves, and
  // those are the two things to say.
  const onlyEarly =
    blocking.length > 0 && blocking.every((b) => b.standing === 'NOT_YET_VALID')
  const fix =
    outcome === 'PASS'
      ? null
      : onlyEarly
        ? `Either ${input.supplierName}'s broker moves the policy start forward and issues the certificate ` +
          `naming ${holder} as certificate holder, or nobody starts before the cover does.`
        : `${input.supplierName}'s broker can issue a replacement certificate, usually the same day, ` +
          `naming ${holder} as certificate holder. Upload it and the submission goes through.`

  let says: string
  if (outcome === 'BLOCK') {
    // Cover that has not begun is refused for the same reason as cover
    // that ran out, and it is not the same sentence. "Back in date" and
    // "renew it" are instructions somebody cannot follow about a policy
    // that starts in three weeks — the certificate is already the newest
    // one there is. Say what is actually true: nobody starts before the
    // cover does.
    const early = blocking.every((b) => b.standing === 'NOT_YET_VALID')
    says =
      blocking.length === 1
        ? `${input.supplierName}: ${lowerFirst(blocking[0].says)} Nobody can be submitted through ${input.supplierName} ${early ? 'until that cover begins' : 'until it is back in date'}.`
        : `${input.supplierName} has ${blocking.length} certificates that do not cover today — the ${blocking[0].label} among them. ` +
          `Nobody can be submitted through ${input.supplierName} until ${early ? 'they begin' : 'they are renewed'}.`
  } else if (outcome === 'WARN') {
    says =
      chasing.length === 1
        ? `${input.supplierName}: ${lowerFirst(chasing[0].says)}`
        : `${input.supplierName} has ${chasing.length} certificates worth chasing — the ${chasing[0].label} among them.`
  } else {
    says = `${input.supplierName}'s cover is on file and in date.`
  }

  return { outcome, blocking, chasing, says, fix }
}

/** "Certificate of X expired" → "certificate of X expired", inside a sentence. */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

// ── The license a person practices on ─────────────────────────────────
//
// The twin of `supplierCoverGate`, on the other side of the same rule.
// Addendum E names five things that BLOCK, and the shared property of all
// five is that the law rather than a client says the work stops: tenure
// limit, break in service, work authorization, lapsed supplier insurance,
// segregation of duties.
//
// A registered nurse on a lapsed state license is practicing without a
// license. That is not a contractual preference a client may waive, it is
// not an audit finding to be tidied up afterwards, and the person who
// carries the exposure is the worker herself — the board disciplines her,
// and every hour she billed unlicensed is a claim the hospital's insurer
// can decline. It is the same shape as lapsed cover and it blocks for the
// same reason.
//
// The three severities, and why each is where it is:
//
//   EXPIRED on the day of the start      BLOCK — unlicensed practice
//   NOT_YET_VALID on the day of the start BLOCK — a license that begins
//                                         next month licenses nobody this
//                                         week, exactly as cover does not
//   runs out inside the assignment        WARN, with the date named. She
//                                         is licensed today; refusing the
//                                         start three weeks early stops
//                                         work the law permits, which is
//                                         the workaround trap. What it
//                                         must never do is go unsaid.
//   NO_EXPIRY_RECORDED                    WARN. The fourth state: on
//                                         file, on a kind that expires,
//                                         with no date anybody can check.
//                                         Blocking would refuse every
//                                         license imported without dates;
//                                         silence is what went green in
//                                         2017.

/** A credential row, reduced to what the gate needs. */
export interface HeldCredential {
  /** The document type key — PROFESSIONAL_LICENSE, or a company's own. */
  type: string
  /** What this company calls it. Falls back to the key, said in words. */
  label?: string | null
  /** The Verification status: PENDING · CLEAR · EXPIRED · FAILED · … */
  status: string
  issuedAt?: Date | null
  validFrom?: Date | null
  expiresAt?: Date | null
  verifiedAt?: Date | null
  /** The number printed on it, where it was recorded. */
  number?: string | null
  /** The state or country whose regulator issued it. */
  state?: string | null
  /** The board or registry that issued it, in its own name. */
  issuer?: string | null
}

export interface LicenseStanding extends DocStanding {
  /** The credential named the way somebody would read it aloud. */
  named: string
  /** Where it was issued, where that was recorded. Null is a real answer. */
  state: string | null
}

export interface LicenseGate {
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  /** Licenses that do not cover the day somebody starts. */
  blocking: LicenseStanding[]
  /** Worth chasing; stops nothing on the first day. */
  chasing: LicenseStanding[]
  /**
   * Licensed on the first day and not on the last. Never a block and
   * never silent: the days after the lapse are named so somebody renews
   * before them rather than after.
   */
  lapsingInside: LicenseStanding[]
  says: string | null
  fix: string | null
}

/** A credential somebody has actually produced, whatever its dates say. */
const A_CREDENTIAL = ['CLEAR', 'CONDITIONAL', 'EXPIRED']

function sayKey(key: string): string {
  return key.toLowerCase().replace(/_/g, ' ')
}

/**
 * The credential, named so a person can act on the sentence.
 *
 * "professional license (RN 154-882, WI)" rather than
 * "PROFESSIONAL_LICENSE". The number and the state are what somebody
 * types into a board's renewal page, and they are the two things a
 * compliance officer checks against the register.
 */
export function nameCredential(c: { label?: string | null; type: string; number?: string | null; state?: string | null }): string {
  const base = (c.label ?? sayKey(c.type)).toLowerCase()
  const inside = [c.number, c.state].filter((x): x is string => !!x && !!x.trim())
  return inside.length > 0 ? `${base} (${inside.join(', ')})` : base
}

/**
 * Whether this person may practice today, and through to the last day.
 *
 * Pure. The caller reads the person's Verification rows and passes them
 * in, so every branch is testable against a fixed date — and so the
 * screen that shows the standing and the button that refuses the start
 * cannot drift apart.
 */
export function licenseGate(input: {
  /** The person, by name. They appear in the refusal. */
  personName: string
  credentials: HeldCredential[]
  /**
   * The keys this company treats as a license to practice. Comes from the
   * company's own document dictionary, so a client that defines its own
   * blocking credential is enforced by the same code as a state RN
   * license — see `credentialKeys` in lib/contract-clearance.
   */
  keys: string[]
  on: Date
  /** The last day of the assignment, where the caller knows it. */
  through?: Date | null
}): LicenseGate {
  const blocking: LicenseStanding[] = []
  const chasing: LicenseStanding[] = []
  const lapsingInside: LicenseStanding[] = []

  const kinds = [...new Set(input.credentials.map((c) => c.type).filter((t) => input.keys.includes(t)))]

  for (const kind of kinds) {
    const rows = input.credentials.filter((c) => c.type === kind)
    // A check still running is not a license. Saying "on file" of a
    // verification that has not come back is how somebody is waved onto a
    // ward on a registration nobody confirmed.
    const produced = rows.filter((c) => A_CREDENTIAL.includes(c.status))
    if (produced.length === 0) continue

    // A renewal supersedes the license it renews, and the one that counts
    // is the one covering today ahead of the one running longest — the
    // same order `supplierCoverGate` settled on, and for the same reason:
    // somebody who files the renewal early holds both, and picking the
    // future one would refuse a person for being organized.
    const coversToday = (c: HeldCredential): boolean => {
      const floor = c.validFrom ?? c.issuedAt ?? null
      if (floor && floor.getTime() > input.on.getTime()) return false
      if (c.expiresAt && c.expiresAt.getTime() < input.on.getTime()) return false
      return true
    }
    const best = produced.slice().sort((a, b) => {
      const at = coversToday(a) ? 1 : 0
      const bt = coversToday(b) ? 1 : 0
      if (at !== bt) return bt - at
      const ae = a.expiresAt?.getTime() ?? -Infinity
      const be = b.expiresAt?.getTime() ?? -Infinity
      if (ae !== be) return be - ae
      return (b.issuedAt?.getTime() ?? 0) - (a.issuedAt?.getTime() ?? 0)
    })[0]

    const named = nameCredential(best)
    let standing = standingOf(
      {
        key: kind,
        label: named,
        issuedAt: best.issuedAt ?? null,
        validFrom: best.validFrom ?? null,
        expiresAt: best.expiresAt ?? null,
        verifiedAt: best.verifiedAt ?? null,
      },
      // No month count, and it expires anyway. See `expires` on
      // standingOf: a license with no date against it is the fourth
      // state, not a permanent one.
      { key: kind, label: named, validMonths: null, expires: true },
      input.on
    )

    // The board's own record says it lapsed. Believe it even where no
    // date was recorded — a status nobody can reconcile against a date is
    // exactly the row that went green in 2017.
    if (best.status === 'EXPIRED' && standing.standing !== 'EXPIRED') {
      standing = {
        ...standing,
        standing: 'EXPIRED',
        daysLeft: null,
        says: `${named} is marked expired on ${input.personName}'s own record.`,
      }
    }

    const row: LicenseStanding = { ...standing, named, state: best.state ?? null }

    if (standing.standing === 'EXPIRED' || standing.standing === 'NOT_YET_VALID') {
      blocking.push(row)
      continue
    }

    if (
      input.through &&
      best.expiresAt &&
      best.expiresAt.getTime() < input.through.getTime()
    ) {
      const uncovered = Math.ceil((input.through.getTime() - best.expiresAt.getTime()) / 86_400_000)
      lapsingInside.push({
        ...row,
        says:
          `${input.personName}'s ${named} runs out on ${best.expiresAt.toISOString().slice(0, 10)}, ` +
          `inside the assignment — ${uncovered} day${uncovered === 1 ? '' : 's'} of it fall after the license does. ` +
          `They can start; they cannot work those days until the renewal is on file.`,
      })
      continue
    }

    if (standing.standing !== 'VALID' || standing.unverified) chasing.push(row)
  }

  const outcome: LicenseGate['outcome'] =
    blocking.length > 0 ? 'BLOCK' : chasing.length > 0 || lapsingInside.length > 0 ? 'WARN' : 'PASS'

  if (outcome === 'PASS') return { outcome, blocking, chasing, lapsingInside, says: null, fix: null }

  if (outcome === 'BLOCK') {
    const early = blocking.every((b) => b.standing === 'NOT_YET_VALID')
    const where = [...new Set(blocking.map((b) => b.state).filter((s): s is string => !!s))]
    const issuedIn = where.length > 0 ? ` The license is issued in ${where.join(' and ')}.` : ''
    const says =
      blocking.length === 1
        ? `${input.personName} cannot start: ${lowerFirst(blocking[0].says)} ` +
          (early
            ? `A license that has not begun licenses nobody, so nothing can start before it does.${issuedIn}`
            : `Working on a lapsed license is unlicensed practice, so nobody can start until it is renewed.${issuedIn}`)
        : `${input.personName} holds ${blocking.length} licenses that do not cover today — ${blocking[0].named} among them. ` +
          `Nobody can start until ${early ? 'they begin' : 'they are renewed'}.${issuedIn}`
    const fix = early
      ? `Either the board brings the start date forward, or nobody starts before the license does.`
      : `Record the renewal — the number and the day it runs out — against ${input.personName}'s ${blocking[0].named}, then activate.`
    return { outcome, blocking, chasing, lapsingInside, says, fix }
  }

  const worst = lapsingInside[0] ?? chasing[0]
  return {
    outcome,
    blocking,
    chasing,
    lapsingInside,
    says: worst.says,
    fix:
      lapsingInside.length > 0
        ? `Ask ${input.personName} for the renewal now, so the last weeks of the assignment are covered.`
        : `Ask ${input.personName} for the current ${worst.named}.`,
  }
}

// ── Asking for the renewal before it lapses ───────────────────────────
//
// The nightly watcher already reopens a supplier's annual refresh packet
// when a certificate of insurance is inside sixty days of running out. A
// license is the same problem with a different owner: the person holds
// it, the board renews it, and the day it lapses is the day the work
// stops. Chasing it the day after is not a reminder, it is an emergency.
//
// Sixty days rather than thirty, and not because sixty is a rounder
// number. A state board takes weeks: continuing-education hours have to
// be filed, a fee clears, and a renewal filed in the last fortnight of a
// cycle routinely issues after the old one expires. The window is the
// same one the insurance chase uses, for the same reason — the person on
// the other end needs longer than we do.

/** Chase a license this far ahead. A board takes weeks, not days. */
export const CHASE_CREDENTIAL_WITHIN_DAYS = 60

export interface CredentialChase {
  /** The document type to ask for. */
  key: string
  /** The credential, named the way somebody reads it aloud. */
  named: string
  /** Where it was issued. Null where nobody recorded it. */
  state: string | null
  /** Negative once it has lapsed. */
  daysLeft: number | null
  /** Said to the person being asked. Names the board and the state. */
  says: string
}

/**
 * Which of a person's licenses to ask for the renewal of, and in what
 * words.
 *
 * Pure, and it decides nothing about who is told or how — that is the
 * watcher's job and the notifier's. What it settles is the two things
 * that must not be guessed at a call site: whether it is time to ask, and
 * what the ask says.
 *
 * A license already renewed is not asked for again: the renewal on file
 * is the newest one there is, and asking somebody for a document they
 * have already sent is how a system teaches them to ignore it.
 *
 * The fourth state is chased too. A license on file with no expiry date
 * against it is not a license anybody can rely on, and it is the exact
 * row that went green in 2017 — so the ask is for the date, and says so.
 */
export function credentialsToChase(
  credentials: HeldCredential[],
  keys: string[],
  on: Date,
  withinDays = CHASE_CREDENTIAL_WITHIN_DAYS
): CredentialChase[] {
  const out: CredentialChase[] = []

  for (const kind of [...new Set(credentials.map((c) => c.type).filter((t) => keys.includes(t)))]) {
    const produced = credentials.filter((c) => c.type === kind && A_CREDENTIAL.includes(c.status))
    if (produced.length === 0) continue

    // The one that runs longest, which on a person who has already
    // renewed is the renewal. Asking again would be asking for what we
    // hold.
    const best = produced.slice().sort((a, b) => {
      const ae = a.expiresAt?.getTime() ?? Infinity
      const be = b.expiresAt?.getTime() ?? Infinity
      return be - ae
    })[0]

    const named = nameCredential(best)
    const where = best.state ?? null
    const issuedBy = best.issuer ? `${best.issuer}` : where ? `the ${where} board` : 'the issuing board'

    if (!best.expiresAt) {
      if (best.status === 'EXPIRED') {
        out.push({
          key: kind, named, state: where, daysLeft: null,
          says:
            `Your ${named} is marked expired and no date is recorded against it. ` +
            `Send the current one from ${issuedBy} — the number and the day it runs out.`,
        })
      } else {
        out.push({
          key: kind, named, state: where, daysLeft: null,
          says:
            `Your ${named} is on file with no expiry date against it, and a license expires. ` +
            `Tell us the day it runs out — until then nobody can tell whether you are licensed today.`,
        })
      }
      continue
    }

    const days = Math.floor((best.expiresAt.getTime() - on.getTime()) / 86_400_000)
    if (days > withinDays) continue

    out.push({
      key: kind,
      named,
      state: where,
      daysLeft: days,
      says:
        days < 0
          ? `Your ${named} lapsed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago. ` +
            `Working on a lapsed license is not something anybody here can waive, so the work stops until ` +
            `${issuedBy} renews it. Send the renewal and it starts again.`
          : `Your ${named} runs out in ${days} day${days === 1 ? '' : 's'}. ` +
            `${issuedBy} usually takes a few weeks, so this is worth filing now — send us the renewal and ` +
            `nothing has to stop.`,
    })
  }

  return out.sort((a, b) => (a.daysLeft ?? 9_999) - (b.daysLeft ?? 9_999))
}
