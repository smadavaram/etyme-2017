/**
 * The same human, arriving twice.
 *
 * A client and a bench vendor are both on Etyme; the prime between them
 * is not. So the client's contract names a shell nobody claimed, the
 * bench vendor has their own record of the same person, and nothing
 * links the two. The tenure ledger — the one number this product sells
 * on — counts fourteen months and twelve months as two different people
 * and reports a confidently wrong answer.
 *
 * A wrong number is worse than no number. This is how the two rows find
 * each other.
 *
 * ── The rule, and why it is not negotiable ───────────────────────────
 *
 * Deterministic matching on consented identifiers only. Probabilistic
 * matches are surfaced for a person to confirm and are never merged
 * silently.
 *
 * Merging two different contractors is not a tidy-up gone wrong. One of
 * them gets blocked on a tenure cap they never earned and cannot work;
 * the other gets paid at somebody else's rate. Both are discovered late,
 * by the person affected, and neither is easy to unpick.
 *
 * ── What it will never do ────────────────────────────────────────────
 *
 * Reach outside the company asking. A client may be shown that two
 * people *in their own records* might be one person. They are never told
 * about somebody they have not already been shown — identity resolution
 * that leaks across a company boundary would be a directory of every
 * contractor on the platform, assembled one confirmation at a time.
 */

export type Confidence = 'CERTAIN' | 'LIKELY' | 'POSSIBLE' | 'UNLIKELY'

export interface Candidate {
  personId: string
  name: string
  /** Consented, and the only thing strong enough to link on its own. */
  mobile: string | null
  email: string | null
  location: string | null
  skills: string[]
  /** Assignments at the company doing the asking. */
  stints: { start: Date; end: Date | null; vendorName: string; months: number }[]
}

export interface Signal {
  /** What it is, in the words somebody would use to argue about it. */
  says: string
  /** Positive raises confidence, negative lowers it. */
  weight: number
  /** True where this alone settles it. */
  decisive?: boolean
}

export interface Match {
  aId: string
  bId: string
  name: string
  confidence: Confidence
  score: number
  signals: Signal[]
  /** What confirming would do to their tenure. The reason to bother. */
  monthsIfSame: number
  says: string
}

/** Above this, worth putting in front of somebody. */
export const SURFACE_AT = 40
/** Below this, not shown at all — noise costs more than it finds. */
export const IGNORE_BELOW = 25

// ── Small readers ─────────────────────────────────────────────────────

/** Digits only, so +1 (303) 555-2000 and 3035552000 are one number. */
export function normalPhone(p: string | null): string | null {
  if (!p) return null
  const d = p.replace(/\D/g, '')
  // Last ten, so a country code on one and not the other still matches.
  return d.length >= 10 ? d.slice(-10) : null
}

/** Case, accents and punctuation removed. "O'Brien" and "OBrien" are one. */
export function normalName(n: string): string {
  return n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function overlaps(
  a: { start: Date; end: Date | null },
  b: { start: Date; end: Date | null }
): boolean {
  const aEnd = a.end?.getTime() ?? Number.MAX_SAFE_INTEGER
  const bEnd = b.end?.getTime() ?? Number.MAX_SAFE_INTEGER
  return a.start.getTime() <= bEnd && b.start.getTime() <= aEnd
}

/**
 * Whether these two records are the same person.
 *
 * Returns the reasoning, not just a verdict. Somebody has to decide this
 * and they cannot decide it from a percentage — they need to see that
 * the mobile numbers match, or that the names are identical and nothing
 * else is.
 */
export function compare(a: Candidate, b: Candidate): Match {
  const signals: Signal[] = []

  // ── Deterministic, on a consented identifier ──────────────────────
  const pa = normalPhone(a.mobile)
  const pb = normalPhone(b.mobile)
  if (pa && pb && pa === pb) {
    signals.push({
      says: 'Same mobile number, which each of them gave us themselves.',
      weight: 100,
      decisive: true,
    })
  }

  const sameName = normalName(a.name) === normalName(b.name)
  if (sameName) {
    signals.push({ says: `Both are recorded as ${a.name}.`, weight: 35 })
  } else {
    // Not a match at all without it. Every other signal here is
    // circumstantial, and circumstantial evidence about two differently
    // named people is not evidence.
    return {
      aId: a.personId,
      bId: b.personId,
      name: a.name,
      confidence: 'UNLIKELY',
      score: 0,
      signals: [{ says: 'Different names.', weight: -100 }],
      monthsIfSame: 0,
      says: 'Different names. Not the same person.',
    }
  }

  if (a.location && b.location && a.location.toLowerCase() === b.location.toLowerCase()) {
    signals.push({ says: `Both are in ${a.location}.`, weight: 15 })
  }

  const shared = a.skills.filter((s) =>
    b.skills.some((t) => t.toLowerCase() === s.toLowerCase())
  )
  if (shared.length >= 3) {
    signals.push({
      says: `${shared.length} skills in common, including ${shared.slice(0, 3).join(', ')}.`,
      weight: 20,
    })
  } else if (shared.length > 0) {
    signals.push({ says: `Only ${shared.length} skill in common.`, weight: 5 })
  } else if (a.skills.length && b.skills.length) {
    signals.push({ says: 'No skills in common, which is odd for one person.', weight: -20 })
  }

  // ── Dates: the one that argues the other way ──────────────────────
  //
  // Two assignments at the same client running at the same time through
  // different suppliers is a strong sign these are two people. One human
  // rarely holds two concurrent contracts at one client, and treating
  // that as a match is how somebody gets blocked on a cap they never
  // earned.
  const concurrent = a.stints.some((x) => b.stints.some((y) => overlaps(x, y)))
  if (concurrent) {
    signals.push({
      says: 'Their assignments here ran at the same time, through different suppliers.',
      weight: -45,
    })
  } else if (a.stints.length && b.stints.length) {
    signals.push({
      says: 'Their assignments here never overlapped, which is what one person looks like.',
      weight: 20,
    })
  }

  const decisive = signals.some((s) => s.decisive)
  const score = decisive
    ? 100
    : Math.max(0, Math.min(100, signals.reduce((n, s) => n + s.weight, 0)))

  const confidence: Confidence = decisive
    ? 'CERTAIN'
    : score >= 70
      ? 'LIKELY'
      : score >= SURFACE_AT
        ? 'POSSIBLE'
        : 'UNLIKELY'

  const monthsIfSame =
    a.stints.reduce((n, s) => n + s.months, 0) + b.stints.reduce((n, s) => n + s.months, 0)

  return {
    aId: a.personId,
    bId: b.personId,
    name: a.name,
    confidence,
    score,
    signals,
    monthsIfSame,
    says: verdict(a.name, confidence, monthsIfSame, a, b),
  }
}

function verdict(
  name: string,
  confidence: Confidence,
  months: number,
  a: Candidate,
  b: Candidate
): string {
  const vendors = [
    ...new Set([...a.stints, ...b.stints].map((s) => s.vendorName)),
  ]

  const via =
    vendors.length > 1
      ? ` through ${vendors.slice(0, -1).join(', ')} and ${vendors[vendors.length - 1]}`
      : vendors.length === 1
        ? ` through ${vendors[0]}`
        : ''

  switch (confidence) {
    case 'CERTAIN':
      return `${name} appears twice. Same mobile number, so this is one person${via} — ${months} months here in total.`
    case 'LIKELY':
      return `${name} may appear twice. If it is one person that is ${months} months here${via}, not two shorter spells.`
    case 'POSSIBLE':
      return `${name} might appear twice. Worth a look — it would be ${months} months here if so.`
    default:
      return `Two people called ${name}. Probably not the same person.`
  }
}

/**
 * What confirming would change, said before anybody confirms it.
 *
 * The tenure consequence is the entire point. "These might be the same
 * person" is a curiosity; "these might be the same person, and if so
 * they are three months past your cap" is a decision.
 */
export function ifConfirmed(
  m: Match,
  capMonths: number | null
): { months: number; overCap: boolean; says: string } {
  const overCap = capMonths != null && m.monthsIfSame > capMonths

  return {
    months: m.monthsIfSame,
    overCap,
    says: overCap
      ? `Confirming makes this ${m.monthsIfSame} months here against a cap of ${capMonths} — ` +
        `they would be ${m.monthsIfSame - capMonths!} months over, and could not be extended.`
      : capMonths != null
        ? `Confirming makes this ${m.monthsIfSame} months here, ${capMonths - m.monthsIfSame} short of your cap.`
        : `Confirming makes this ${m.monthsIfSame} months here.`,
  }
}

/**
 * Which matches are worth a person's time.
 *
 * Certain ones first because they are free to accept, then by what they
 * would change — a match that pushes somebody past a cap matters more
 * than one that moves a number nobody is watching.
 */
export function worthAsking(matches: Match[], capMonths: number | null): Match[] {
  return matches
    .filter((m) => m.score >= IGNORE_BELOW && m.confidence !== 'UNLIKELY')
    .sort((a, b) => {
      const aOver = capMonths != null && a.monthsIfSame > capMonths ? 1 : 0
      const bOver = capMonths != null && b.monthsIfSame > capMonths ? 1 : 0
      if (aOver !== bOver) return bOver - aOver
      return b.score - a.score
    })
}

/**
 * Every person's single strongest match, keyed by personId.
 *
 * Built for a register that shows one row per person and has room to
 * flag at most one thing about them — /dashboard/people, not the
 * identity review queue. Compares every candidate against every other
 * once (O(n²), fine at the size of one client's own register) and keeps
 * whichever pairing scored highest for each side.
 *
 * A touch stricter than `worthAsking`'s own IGNORE_BELOW: this surfaces
 * on a screen a client opens by default, not one they chose to visit to
 * go looking, so the bar for interrupting it is POSSIBLE and up rather
 * than everything not yet ruled out.
 */
export function bestMatchPerPerson(candidates: Candidate[]): Map<string, Match> {
  const best = new Map<string, Match>()
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const m = compare(candidates[i], candidates[j])
      if (m.confidence === 'UNLIKELY') continue
      for (const id of [m.aId, m.bId]) {
        const current = best.get(id)
        if (!current || m.score > current.score) best.set(id, m)
      }
    }
  }
  return best
}

/**
 * The line above the queue.
 *
 * Names the consequence rather than the count. Nobody works a list of
 * "possible duplicates"; somebody will work a list of people who might
 * be past a tenure cap.
 */
export function summarise(matches: Match[], capMonths: number | null): string {
  if (matches.length === 0) return 'Nobody looks like a duplicate.'

  const certain = matches.filter((m) => m.confidence === 'CERTAIN').length
  const overCap =
    capMonths == null ? 0 : matches.filter((m) => m.monthsIfSame > capMonths).length

  const bits: string[] = []
  if (certain) bits.push(`${certain} certain`)
  const rest = matches.length - certain
  if (rest) bits.push(`${rest} worth checking`)

  const tail = overCap
    ? ` ${overCap} of them would be past your tenure cap if confirmed.`
    : ''

  return `${bits.join(', ')}.${tail}`
}
