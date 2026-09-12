/**
 * One seat, many faces. One person, many faces. They meet in the middle.
 *
 * The demand a sub-vendor works does not arrive as a requisition. It
 * arrives as an advert on Dice, posted by a prime who is hiding the client
 * so their NDA holds — and the same seat is posted by three other primes
 * the same morning, with the title reworded and the rate shaved.
 *
 * That is a diamond:
 *
 *              one real seat at a client
 *             /          |          \
 *        prime A      prime B      direct        ← what you actually see
 *             \          |          /
 *              →   submission   ←                ← the waist
 *             /          |          \
 *        bench A      bench B      own W2        ← how they are represented
 *             \          |          /
 *                  one human being
 *
 * Both cones collapse, and neither collapses by itself. If the top does not
 * collapse, you submit one consultant to the same seat through three primes
 * and the client sees the name three times and rejects all three. If the
 * bottom does not collapse, two agencies do the same thing to the same
 * person. The waist is the only place that can see both, which is the whole
 * argument for a network rather than a tool.
 *
 * The bottom cone is built: a person, their bench listings, the hold. This
 * module is the top one.
 *
 * ── Why the client is allowed to be unknown ──────────────────────────
 *
 * Every model I wrote before this assumed demand names its client. It does
 * not, and the hiding is deliberate rather than sloppy — it is a prime's
 * NDA working as intended. So an Opening is the *inferred seat*: what is
 * plainly true about it (a FICO role, Denver, around $65) without claiming
 * to know whose it is. The client's name arrives late, at interview or on
 * the first day, and sometimes never.
 *
 * Everything downstream keys on the opening rather than the client, which
 * is what makes a hold work on a blind role.
 */

export type Source = 'DICE' | 'LINKEDIN' | 'EMAIL' | 'DIRECT' | 'VMS' | 'OTHER'

/** One advert, email or portal row, exactly as it arrived. */
export interface Lead {
  id: string
  source: Source
  /** The prime who posted it, as text — often a name with no company row. */
  postedBy: string | null
  title: string
  skills: string[]
  /** As written: "Denver, CO (Hybrid)", "Remote — must sit EST". */
  location: string | null
  /** Cents per hour, as posted. A ceiling to bid under, not an offer. */
  rateCents: number | null
  seenAt: Date
  /** The raw text, kept because the fingerprint may need rebuilding later. */
  text?: string
}

/**
 * How sure we are that two adverts are the same seat.
 *
 * The rule CLAUDE.md already sets for people applies here unchanged:
 * deterministic matches merge, probabilistic matches are surfaced for a
 * human, and nothing merges silently.
 */
export type Strength = 'SAME' | 'LIKELY' | 'UNRELATED'

export interface Verdict {
  strength: Strength
  /** Every signal that fired, so a recruiter can disagree with the working. */
  because: string[]
  /** What it could not see. A match with unknowns is still a match. */
  unknowns: string[]
}

const NOISE =
  /\b(urgent|immediate|need|required|requirement|position|opening|opportunity|role|job|hiring|w2|c2c|only|no\s+c2c|usc|gc|contract|remote|onsite|hybrid|hot|new|multiple|openings?)\b/gi

/**
 * A title reduced to what it is actually about.
 *
 * Adverts for one seat rarely share a title. "URGENT!! Sr. SAP FICO
 * Consultant — Denver (Hybrid) — USC/GC only" and "SAP FICO Functional
 * Analyst" are the same job, and every word that differs is noise a prime
 * added to make their posting stand out.
 */
export function normaliseTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9+#/\s-]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\b(sr|senior|jr|junior|lead|principal|staff)\b/g, ' ')
    .replace(/\b(consultant|analyst|engineer|developer|architect|specialist|manager)\b/g, ' ')
    .replace(/\s+/g, ' ')
    // The dash left behind by "Consultant - Immediate Need" once the noise
    // is gone. Punctuation at either end is never part of a job title.
    .replace(/^[\s\-/]+|[\s\-/]+$/g, '')
    .trim()
}

/** A place reduced to a place. "Denver, CO (Hybrid)" and "Denver CO" agree. */
export function normaliseLocation(raw: string | null): string | null {
  if (!raw) return null
  const v = raw
    .toLowerCase()
    .replace(/\((hybrid|onsite|remote|on-site)\)/g, ' ')
    .replace(/[^a-z\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^remote\b/.test(v)) return 'remote'
  // "Denver, CO" and "Denver CO" are one place. Dropping a trailing
  // two-letter state makes them agree without a table of state names.
  return v.split(',')[0].replace(/\s+[a-z]{2}$/, '').trim() || null
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const A = new Set(a.map((s) => s.toLowerCase().trim()))
  const B = new Set(b.map((s) => s.toLowerCase().trim()))
  let shared = 0
  for (const s of A) if (B.has(s)) shared++
  return shared / Math.min(A.size, B.size)
}

const WINDOW_DAYS = 21
/** Primes shave the posted rate. Within a fifth is the same seat. */
const RATE_TOLERANCE = 0.2

/**
 * Whether two adverts are the same seat.
 *
 * Deliberately conservative about SAME. Merging two seats that are actually
 * two seats costs a placement — the second one becomes invisible. Leaving
 * two adverts for one seat unmerged costs a duplicate submission, which is
 * recoverable if somebody is watching. So the strong verdict needs the
 * title, the place and the skills to agree.
 */
export function sameSeat(a: Lead, b: Lead): Verdict {
  const because: string[] = []
  const unknowns: string[] = []

  const days = Math.abs(a.seenAt.getTime() - b.seenAt.getTime()) / 86_400_000
  if (days > WINDOW_DAYS) {
    return {
      strength: 'UNRELATED',
      because: [`seen ${Math.round(days)} days apart, beyond the ${WINDOW_DAYS}-day window`],
      unknowns: [],
    }
  }

  const titleA = normaliseTitle(a.title)
  const titleB = normaliseTitle(b.title)
  const titlesAgree = titleA.length > 0 && (titleA === titleB || titleA.includes(titleB) || titleB.includes(titleA))
  if (titlesAgree) because.push(`both are "${titleA}" once the shouting is removed`)

  const locA = normaliseLocation(a.location)
  const locB = normaliseLocation(b.location)
  const placesAgree = locA !== null && locA === locB
  if (placesAgree) because.push(`both in ${locA}`)
  if (locA === null || locB === null) unknowns.push('one of them does not say where')

  const skillShare = overlap(a.skills, b.skills)
  if (skillShare >= 0.6) because.push(`${Math.round(skillShare * 100)}% of the skills are the same`)
  if (a.skills.length === 0 || b.skills.length === 0) unknowns.push('one of them lists no skills')

  let ratesAgree = false
  if (a.rateCents !== null && b.rateCents !== null) {
    const spread = Math.abs(a.rateCents - b.rateCents) / Math.max(a.rateCents, b.rateCents)
    ratesAgree = spread <= RATE_TOLERANCE
    if (ratesAgree) because.push('the posted rates are within a fifth of each other')
  } else {
    unknowns.push('one of them posts no rate')
  }

  // The same prime posting twice is one seat they are re-advertising.
  const samePrime =
    a.postedBy !== null && b.postedBy !== null &&
    a.postedBy.toLowerCase().trim() === b.postedBy.toLowerCase().trim()
  if (samePrime) because.push(`${a.postedBy} posted both`)

  if (titlesAgree && placesAgree && skillShare >= 0.6) {
    return { strength: 'SAME', because, unknowns }
  }

  // What the work is decides identity. Where it is, who posted it and what
  // it pays are context — a prime posting a FICO seat and a Workday seat in
  // the same city on the same morning shares three of those signals and is
  // plainly two seats.
  if (!titlesAgree && skillShare < 0.4) {
    return { strength: 'UNRELATED', because, unknowns }
  }

  // Beyond that, two signals is worth a recruiter's ten seconds — and never
  // an automatic merge.
  const signals = [titlesAgree, placesAgree, skillShare >= 0.6, ratesAgree, samePrime].filter(Boolean).length
  if (signals >= 2) return { strength: 'LIKELY', because, unknowns }

  return { strength: 'UNRELATED', because, unknowns }
}

export interface Opening {
  id: string
  title: string
  skills: string[]
  location: string | null
  /** Null while the prime is still hiding it, which is most of the time. */
  clientCompanyId: string | null
  /** What can honestly be said instead: "a medical device firm, Denver". */
  inferredClient: string | null
  leadIds: string[]
}

export interface Placement {
  /** Which advert to answer, and why that one. */
  lead: Lead
  because: string
}

/**
 * Which of the several routes to this seat to go through.
 *
 * Not the highest posted rate. A prime who pays in ninety days at $70 is
 * worse than one who pays in thirty at $65, and a prime you already have an
 * agreement with is worth more than either — because the alternative is
 * starting a placement with no paper, which is how a vendor ends up working
 * six weeks for nothing.
 */
export function bestRoute(
  leads: Lead[],
  known: { postedBy: string; msaOnFile: boolean; paysInDays: number | null }[]
): Placement | null {
  if (leads.length === 0) return null

  const scored = leads.map((lead) => {
    const rel = known.find(
      (k) => lead.postedBy !== null && k.postedBy.toLowerCase() === lead.postedBy.toLowerCase()
    )
    let score = 0
    const why: string[] = []

    if (rel?.msaOnFile) {
      score += 100
      why.push('you already have an agreement with them')
    }
    if (rel && rel.paysInDays !== null && rel.paysInDays <= 45) {
      score += 40
      why.push(`they pay in ${rel.paysInDays} days`)
    }
    if (lead.rateCents !== null) {
      score += Math.min(30, lead.rateCents / 1000)
      why.push(`posted at $${Math.round(lead.rateCents / 100)}/hr`)
    }
    if (lead.source === 'DIRECT') {
      score += 60
      why.push('it came to you directly rather than through a board')
    }

    return { lead, score, why }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]

  return {
    lead: top.lead,
    because: top.why.length > 0 ? top.why.join(', ') : 'nothing to choose between them',
  }
}

/**
 * What a hold is keyed to.
 *
 * The client where it is known, and the seat where it is not. Without this
 * a blind role — most of them — cannot be held at all, and two agencies
 * submit the same person to the same seat through two primes, which is the
 * failure the whole hold exists to prevent.
 */
export function holdKeyFor(o: { clientCompanyId: string | null; id: string }): string {
  return o.clientCompanyId ?? `opening:${o.id}`
}

/**
 * What to call the client on screen when nobody knows its name.
 *
 * Most demand is blind, so this is the ordinary case rather than the edge
 * one. Saying "this client" beats a blank, and saying what was inferred —
 * "a medical device firm in Denver" — beats both.
 */
export function clientLabel(o: {
  clientName?: string | null
  inferredClient?: string | null
}): string {
  return o.clientName ?? o.inferredClient ?? 'this client'
}
