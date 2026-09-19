/**
 * Passing work up and down a chain without breaching what you signed.
 *
 * ── The shape of the problem ─────────────────────────────────────────
 *
 * A client raises a role. It reaches an MSP, who passes it to a prime,
 * who passes it to two subs, who each ask a bench vendor. Five hops, and
 * at every one somebody forwards an email containing more than they were
 * allowed to send.
 *
 * Going the other way, a bench vendor markets a person up the same chain
 * and the same thing happens in reverse: the consultant's name, their
 * current employer and their rate arrive at a prime who could go direct.
 *
 * Nobody does this maliciously. They do it because the alternative is
 * retyping the requirement by hand at every hop, and the thing they
 * retype is the thing they were sent.
 *
 * ── What each hop is actually allowed to know ────────────────────────
 *
 * **The end client's name is usually confidential.** Most master
 * agreements forbid naming it downstream. But a sub that cannot tell
 * which client this is cannot stop its own consultant being submitted
 * there twice through two chains — so hiding it entirely creates the
 * problem it was meant to avoid.
 *
 * The answer is a **blind key**: a one-way value derived from the client
 * and the seat, stable across chains and meaningless on its own. Two
 * vendors submitting the same person to the same seat collide on it. The
 * platform can say "already submitted through another route" without
 * telling either of them who, by whom, or where.
 *
 * **Rates are confidential per hop.** Each layer's margin is nobody's
 * business above or below. A recipient sees the band they may work
 * within, never the rate the layer above is being paid.
 *
 * **A consultant's identity is withheld until there is a right to
 * represent.** Otherwise a prime can take the name and go direct, which
 * is the single reason bench vendors distrust portals.
 *
 * ── Why the record matters as much as the redaction ──────────────────
 *
 * Redacting correctly and being unable to prove it is nearly as bad as
 * leaking. Every hop writes what was disclosed, what was withheld, and
 * under which agreement — so "did we breach the NDA" has an answer that
 * is not somebody's memory of an email.
 */

export type Layer = 'CLIENT' | 'MSP' | 'PRIME' | 'SUB' | 'BENCH_VENDOR'

export interface Hop {
  fromCompanyId: string
  fromName: string
  toCompanyId: string
  toName: string
  /** Hops from the end client. The client's own post is depth 0. */
  depth: number
  /** The agreement that permits this hop at all. */
  agreementId?: string | null
  /** True where the agreement forbids naming the end client downstream. */
  clientNameConfidential: boolean
  /** True where the recipient has a signed NDA covering this work. */
  ndaInPlace: boolean
  /** True where a right to represent is on file for the person. */
  rightToRepresent?: boolean
}

export type FieldKey =
  | 'endClientName' | 'endClientIndustry' | 'endClientRegion'
  | 'hiringManager' | 'billRate' | 'rateBand' | 'headcount'
  | 'personName' | 'personContact' | 'currentEmployer'
  | 'resume' | 'redactedResume' | 'payRate' | 'otherVendors'

export interface Withheld {
  field: FieldKey
  /** In the words you would use to somebody who asked why. */
  because: string
  /** What they get instead, where anything. */
  insteadGet?: string
}

export interface Disclosure<T> {
  /** What actually crosses the wire. */
  payload: T
  withheld: Withheld[]
  /** For the record, not for the recipient. */
  says: string
}

// ── Going down: a requirement, hop by hop ─────────────────────────────

export interface Requirement {
  id: string
  title: string
  endClientName: string
  endClientIndustry?: string | null
  endClientRegion?: string | null
  hiringManager?: string | null
  /** What the sender is being paid. Never forwarded. */
  billRateCents: number
  /** What the recipient may work within. */
  bandMinCents?: number | null
  bandMaxCents?: number | null
  headcount: number
  /** Who else was invited. Never forwarded, at any depth. */
  otherVendorIds?: string[]
}

export interface ForwardedRequirement {
  id: string
  title: string
  /** The real name, or a description of it. */
  client: string
  /** True where `client` is a description rather than a name. */
  clientIsDescribed: boolean
  region?: string | null
  headcount: number
  bandMinCents?: number | null
  bandMaxCents?: number | null
  /**
   * Stable across every chain reaching this seat, and meaningless alone.
   * Lets a recipient detect that they are looking at a role they have
   * already seen, without being told where it is.
   */
  seatKey: string
  depth: number
}

/**
 * A description a supplier can act on, without the name.
 *
 * "A Fortune 100 insurer in the Charlotte area" is enough to price the
 * work, judge the commute and know whether their consultant is already
 * there. It is not enough to go around the chain.
 */
export function describeClient(r: Requirement): string {
  const bits = [r.endClientIndustry, r.endClientRegion].filter(Boolean)
  return bits.length > 0
    ? `A ${bits.join(' company in ')}`.replace(/ company in$/, '')
    : 'A client we hold the relationship with'
}

/**
 * The blind key.
 *
 * Derived from the end client and the seat, so every chain reaching the
 * same seat produces the same value, and the value says nothing on its
 * own. Not a security boundary — anybody holding the client id can
 * compute it — a *disclosure* boundary, which is what is needed: it lets
 * two suppliers find out they collide without either learning anything
 * from the other.
 */
export function seatKey(endClientId: string, requirementId: string, salt: string): string {
  let h = 2_166_136_261
  for (const ch of `${salt}:${endClientId}:${requirementId}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16_777_619)
  }
  return `seat_${(h >>> 0).toString(36).padStart(7, '0')}`
}

export function forward(
  r: Requirement,
  hop: Hop,
  endClientId: string,
  salt: string
): Disclosure<ForwardedRequirement> {
  const withheld: Withheld[] = []

  const named = !hop.clientNameConfidential && hop.ndaInPlace
  if (!named) {
    withheld.push({
      field: 'endClientName',
      because: hop.clientNameConfidential
        ? 'The agreement above this hop forbids naming the end client downstream.'
        : 'No NDA is on file with this recipient, so the client is described rather than named.',
      insteadGet: describeClient(r),
    })
  }

  // Never forwarded, at any depth, to anybody. What the sender is paid
  // is the sender's business, and a band is what a recipient needs.
  withheld.push({
    field: 'billRate',
    because:
      'What the party above is being paid is not part of this. You are given the ' +
      'band you may work within, which is the number that decides whether you bid.',
  })

  if (r.hiringManager) {
    withheld.push({
      field: 'hiringManager',
      because:
        'The manager is reachable through the party that holds the relationship. ' +
        'Contacting them directly ends the relationship for everybody in the chain.',
    })
  }

  if (r.otherVendorIds && r.otherVendorIds.length > 0) {
    withheld.push({
      field: 'otherVendors',
      because: 'Who else was asked is nobody else’s business, at any depth.',
    })
  }

  return {
    payload: {
      id: r.id,
      title: r.title,
      client: named ? r.endClientName : describeClient(r),
      clientIsDescribed: !named,
      region: r.endClientRegion ?? null,
      headcount: r.headcount,
      bandMinCents: r.bandMinCents ?? null,
      bandMaxCents: r.bandMaxCents ?? null,
      seatKey: seatKey(endClientId, r.id, salt),
      depth: hop.depth + 1,
    },
    withheld,
    says:
      `${r.title} sent to ${hop.toName}` +
      (named ? ` naming ${r.endClientName}.` : ` without naming the client.`) +
      ` ${withheld.length} field${withheld.length === 1 ? '' : 's'} withheld.`,
  }
}

// ── Going up: a candidate, hop by hop ─────────────────────────────────

export interface Candidate {
  personId: string
  name: string
  email?: string | null
  phone?: string | null
  currentEmployer?: string | null
  /** What the bench vendor wants for them. */
  askRateCents: number
  /** What they are actually paid. Never forwarded, in either direction. */
  payRateCents?: number | null
  resumeUrl?: string | null
  /** Same résumé with contact details and employer names removed. */
  redactedResumeUrl?: string | null
}

export interface ForwardedCandidate {
  /** A handle, not a name, until there is a right to represent. */
  reference: string
  name: string | null
  named: boolean
  currentEmployer: string | null
  askRateCents: number
  resumeUrl: string | null
  /** Stable across chains. Two routes to the same seat collide here. */
  personKey: string
  depth: number
}

/**
 * A stable handle for one person, meaningless on its own.
 *
 * Two vendors marketing the same consultant to the same seat produce the
 * same pair of keys, so the collision is detectable before a duplicate
 * submission reaches the client — which is the thing that costs a
 * supplier the account.
 */
export function personKey(personId: string, salt: string): string {
  let h = 2_166_136_261
  for (const ch of `${salt}:${personId}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16_777_619)
  }
  return `p_${(h >>> 0).toString(36).padStart(7, '0')}`
}

export function marketUp(
  c: Candidate,
  hop: Hop,
  salt: string
): Disclosure<ForwardedCandidate> {
  const withheld: Withheld[] = []

  // The identity is the asset. Handing it over before a right to
  // represent is why bench vendors distrust portals — a prime with the
  // name can go direct and the vendor never finds out.
  const named = hop.rightToRepresent === true
  if (!named) {
    withheld.push({
      field: 'personName',
      because:
        'No right to represent is on file yet. Their name goes with the agreement and ' +
        'not before it, because a prime with the name can go direct and the vendor ' +
        'never finds out — which is the whole reason bench vendors hesitate to use a ' +
        'portal at all.',
      insteadGet: 'A reference that stays the same as this goes up the chain.',
    })
    withheld.push({
      field: 'personContact',
      because: 'Contact details go with the name, and for the same reason.',
    })
  }

  if (c.currentEmployer && !named) {
    withheld.push({
      field: 'currentEmployer',
      because:
        'Naming who they work for now identifies them as surely as their name does, ' +
        'and can cost them the job they still have.',
    })
  }

  // Never forwarded in either direction, to anybody. It is between the
  // person and whoever employs them.
  if (c.payRateCents != null) {
    withheld.push({
      field: 'payRate',
      because:
        'What they are paid is between them and their employer. What is being asked ' +
        'for them is the number this hop needs.',
    })
  }

  const resume = named ? c.resumeUrl : c.redactedResumeUrl
  if (!named && !c.redactedResumeUrl && c.resumeUrl) {
    withheld.push({
      field: 'resume',
      because:
        'The full résumé names them, their employer and their referees. A redacted ' +
        'version has not been prepared, so nothing is sent rather than sending that.',
      insteadGet: 'Skills and dates, once a redacted version exists.',
    })
  }

  const reference = personKey(c.personId, salt)

  return {
    payload: {
      reference,
      name: named ? c.name : null,
      named,
      currentEmployer: named ? (c.currentEmployer ?? null) : null,
      askRateCents: c.askRateCents,
      resumeUrl: resume ?? null,
      personKey: reference,
      depth: hop.depth + 1,
    },
    withheld,
    says: named
      ? `${c.name} put forward to ${hop.toName} under a right to represent.`
      : `A consultant put forward to ${hop.toName} as ${reference}, unnamed until ` +
        `a right to represent is signed. ${withheld.length} fields withheld.`,
  }
}

// ── Collisions, found without telling anybody anything ────────────────

export interface Collision {
  collides: boolean
  says: string
  /** What the party being told may act on. Never who or where. */
  advice: string
}

/**
 * Whether this person has already reached this seat by another route.
 *
 * Answered from the two blind keys alone, so the answer carries no
 * information beyond the fact itself. The vendor learns to stop; it
 * learns nothing about the chain that got there first, which is what
 * makes this usable between competitors.
 */
export function alreadyThere(
  candidate: { personKey: string; seatKey: string },
  existing: { personKey: string; seatKey: string }[]
): Collision {
  const hit = existing.some(
    (e) => e.personKey === candidate.personKey && e.seatKey === candidate.seatKey
  )

  if (!hit) {
    return {
      collides: false,
      says: 'Nobody has put this person forward for this seat.',
      advice: 'Go ahead.',
    }
  }

  return {
    collides: true,
    says: 'This person has already reached this seat through another route.',
    advice:
      'Do not submit. A second submission through a different chain is what costs a ' +
      'supplier the account, and the client sees one person twice with two rates. ' +
      'Who got there first is not ours to tell you.',
  }
}

// ── The record ────────────────────────────────────────────────────────

export interface DisclosureRecord {
  at: Date
  fromCompanyId: string
  toCompanyId: string
  depth: number
  subject: 'REQUIREMENT' | 'CANDIDATE'
  subjectId: string
  agreementId: string | null
  ndaInPlace: boolean
  disclosed: FieldKey[]
  withheld: Withheld[]
  says: string
}

/**
 * What was sent, to whom, under which agreement.
 *
 * Redacting correctly and being unable to prove it is nearly as bad as
 * leaking, because the question is always asked a year later by somebody
 * with a printout. This is the answer that is not a person's memory of
 * an email.
 */
export function record<T>(
  hop: Hop,
  subject: 'REQUIREMENT' | 'CANDIDATE',
  subjectId: string,
  d: Disclosure<T>,
  disclosed: FieldKey[],
  at: Date
): DisclosureRecord {
  return {
    at,
    fromCompanyId: hop.fromCompanyId,
    toCompanyId: hop.toCompanyId,
    depth: hop.depth,
    subject,
    subjectId,
    agreementId: hop.agreementId ?? null,
    ndaInPlace: hop.ndaInPlace,
    disclosed,
    withheld: d.withheld,
    says: d.says,
  }
}

// ── Where the guarantee stops ─────────────────────────────────────────

export interface BlindSpot {
  blind: boolean
  says: string
}

/**
 * Whether anything can be promised about what happens next.
 *
 * A hop to a company that is not on the platform is a hop into an email
 * client. Everything above holds up to that point and not one step past
 * it, and saying so is the difference between a control and a comfort.
 */
export function beyond(hop: Hop, recipientOnPlatform: boolean): BlindSpot {
  if (recipientOnPlatform) {
    return {
      blind: false,
      says: `${hop.toName} is here, so what they forward is redacted the same way.`,
    }
  }

  return {
    blind: true,
    says:
      `${hop.toName} is not on the platform. What we send them is redacted; what they ` +
      `forward afterwards is an email we cannot see. If this chain matters, invite them ` +
      `— that is the only way the next hop is covered.`,
  }
}
