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
 * authorised to work here, and will you need sponsorship now or later.
 * The United Kingdom is the same shape: the right-to-work check belongs
 * before the first day, not before the application, and running it early
 * on some applicants and not others is the discrimination itself. Across
 * the EU, collecting identity documents from somebody you have not
 * offered a job to fails data minimisation on its own.
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

/** Which way the paperwork is travelling. */
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
        'fails data minimisation. Ask at offer.',
      DEFAULT:
        'Identity documents belong after an offer. Ask whether they are authorised ' +
        'to work, and take the document at award.',
    },
    insteadAsk:
      'Are you authorised to work in this country, and will you need sponsorship ' +
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

export type Standing = 'MISSING' | 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NO_EXPIRY_RECORDED'

/** Chase this far ahead. Long enough to renew an insurance certificate. */
export const WARN_WITHIN_DAYS = 30

export interface Held {
  key: string
  label: string
  issuedAt?: Date | null
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
  spec: { key: string; label: string; validMonths: number | null },
  on: Date
): DocStanding {
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
    if (spec.validMonths == null) {
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
    return s.standing === 'MISSING' || s.standing === 'EXPIRED'
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
// screening judgement, and screening judgements are not ours to make.
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
    const best = produced.slice().sort((a, b) => {
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

    const stops =
      mustNotLapse.has(kind) &&
      (standing.standing === 'EXPIRED' ||
        (standing.standing === 'MISSING' && required.includes(kind)))

    if (stops) blocking.push(standing)
    else if (standing.standing !== 'VALID' || standing.unverified) chasing.push(standing)
  }

  const outcome: CoverGate['outcome'] =
    blocking.length > 0 ? 'BLOCK' : chasing.length > 0 ? 'WARN' : 'PASS'

  const holder = input.clientName ?? 'the client'
  const fix =
    outcome === 'PASS'
      ? null
      : `${input.supplierName}'s broker can issue a replacement certificate, usually the same day, ` +
        `naming ${holder} as certificate holder. Upload it and the submission goes through.`

  let says: string
  if (outcome === 'BLOCK') {
    says =
      blocking.length === 1
        ? `${input.supplierName}: ${lowerFirst(blocking[0].says)} Nobody can be submitted through ${input.supplierName} until it is back in date.`
        : `${input.supplierName} has ${blocking.length} certificates out of date — the ${blocking[0].label} among them. ` +
          `Nobody can be submitted through ${input.supplierName} until they are renewed.`
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
