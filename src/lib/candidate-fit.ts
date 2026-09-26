/**
 * How well does this candidate fit this requisition?
 *
 * The match engine (src/lib/match-engine.ts) asks Claude to search a bench
 * for people worth approaching. This is the other question, asked later and
 * for a different reason: five people have been PUT FORWARD, and the client
 * has to choose between them today.
 *
 * That difference argues for a deterministic answer rather than a model
 * call. It is instant, it costs nothing, it is the same every time it is
 * asked, and it can be tested — all of which matter when a person's
 * livelihood and a client's decision hang on the number.
 *
 * CLAUDE.md: "Match scores always carry factors, basis, confidence and
 * unknowns. A bare number is a bug."
 *
 * The hardest discipline here is honesty about ignorance. A candidate whose
 * only listed skill is "SAP BRIM" against a requisition asking for "SAP MM"
 * is not a 0% match and not an 80% one — the truth is that string
 * comparison cannot tell, and saying so is more useful than a confident
 * guess in either direction. So adjacency is surfaced as an UNKNOWN rather
 * than scored, and thin data caps confidence no matter how good the score
 * looks.
 */

export interface FitFactor {
  label: string
  /** 0–100 for this dimension. */
  value: number
  /** How much of the total this dimension can contribute. */
  weight: number
  detail: string
}

export interface FitAssessment {
  score: number
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  factors: FitFactor[]
  /** What the score is grounded in. */
  basis: string
  /** What it could not account for. Null only when genuinely nothing. */
  unknowns: string | null
}

export interface FitInput {
  required: {
    skills: string[]
    location: string | null
    ceilingCents: number | null
    neededBy: Date | null
  }
  candidate: {
    skills: string[]
    headline: string | null
    location: string | null
    availableFrom: Date | null
  }
  submittedRateCents: number
}

const W_SKILLS = 45
const W_RATE = 25
const W_LOCATION = 15
const W_AVAILABILITY = 15

const norm = (s: string) => s.trim().toLowerCase()

/** Words too common to signal anything on their own. */
const STOPWORDS = new Set(['sap', 'senior', 'lead', 'consultant', 'developer', 'engineer', 'the', 'and'])

function tokens(skill: string): string[] {
  return norm(skill).split(/[^a-z0-9+#.]+/).filter(t => t.length > 1)
}

/**
 * Skills the candidate does not have, but which share a distinguishing
 * token with something they do — "SAP MM" against "SAP BRIM" once the
 * shared "sap" is discounted is NOT adjacency; "React" against "React
 * Native" is. Adjacency is reported, never scored.
 */
function adjacencies(required: string[], held: string[]): string[] {
  const heldSet = new Set(held.map(norm))
  const out: string[] = []
  for (const r of required) {
    if (heldSet.has(norm(r))) continue
    const rTokens = tokens(r).filter(t => !STOPWORDS.has(t))
    if (rTokens.length === 0) continue
    const near = held.find(h => {
      const hTokens = tokens(h).filter(t => !STOPWORDS.has(t))
      return hTokens.some(t => rTokens.includes(t))
    })
    if (near) out.push(`${r} — they list ${near}`)
  }
  return out
}

export function assessFit(input: FitInput): FitAssessment {
  const { required, candidate, submittedRateCents } = input
  const factors: FitFactor[] = []
  const unknowns: string[] = []

  // ── Skills ──
  const held = new Set(candidate.skills.map(norm))
  const matched = required.skills.filter(s => held.has(norm(s)))
  const missing = required.skills.filter(s => !held.has(norm(s)))

  let skillValue: number
  if (required.skills.length === 0) {
    skillValue = 50
    unknowns.push('the requisition lists no skills, so there is nothing to match against')
  } else if (candidate.skills.length === 0) {
    skillValue = 0
    unknowns.push('no skills on this candidate’s profile — the score assumes none, which is probably unfair to them')
  } else {
    skillValue = Math.round((matched.length / required.skills.length) * 100)
  }

  factors.push({
    label: 'Skills',
    value: skillValue,
    weight: W_SKILLS,
    detail: required.skills.length === 0
      ? 'No skills required'
      : matched.length === required.skills.length
        ? `Has all ${required.skills.length} skill(s) asked for`
        : matched.length === 0
          ? `None of ${required.skills.join(', ')} listed`
          : `${matched.join(', ')} — missing ${missing.join(', ')}`,
  })

  // Adjacency is a question, not a score.
  const near = adjacencies(required.skills, candidate.skills)
  if (near.length > 0) {
    unknowns.push(`whether related experience transfers: ${near.join('; ')}`)
  }

  // ── Rate ──
  let rateValue = 100
  let rateDetail = 'No ceiling stated'
  if (required.ceilingCents != null) {
    if (submittedRateCents <= required.ceilingCents) {
      // Coming in under budget is good, but cheapest is not best, so the
      // scale flattens rather than rewarding a race to the bottom.
      const headroom = (required.ceilingCents - submittedRateCents) / required.ceilingCents
      rateValue = Math.min(100, 80 + Math.round(headroom * 40))
      rateDetail = `$${Math.round(submittedRateCents / 100)}/hr against a $${Math.round(required.ceilingCents / 100)}/hr ceiling`
    } else {
      // Crossing the ceiling is a step, not a slope. The client named a
      // number; a candidate $6 over it should not score alongside one $18
      // under. Anything above starts well below anything below, then falls
      // with the size of the overage.
      const over = (submittedRateCents - required.ceilingCents) / required.ceilingCents
      rateValue = Math.max(0, Math.round(55 - over * 400))
      rateDetail = `$${Math.round(submittedRateCents / 100)}/hr is over the $${Math.round(required.ceilingCents / 100)}/hr ceiling`
    }
  }
  factors.push({ label: 'Rate', value: rateValue, weight: W_RATE, detail: rateDetail })

  // ── Location ──
  let locValue = 50
  let locDetail = 'Not stated'
  if (!required.location) {
    locValue = 100
    locDetail = 'No location required'
  } else if (!candidate.location) {
    unknowns.push('where this candidate is based')
    locDetail = `Requisition is ${required.location}; candidate location unknown`
  } else {
    const r = norm(required.location)
    const c = norm(candidate.location)
    const remote = r.includes('remote') || c.includes('remote')
    if (remote || r === c) {
      locValue = 100
      locDetail = remote ? 'Remote' : `Both in ${required.location}`
    } else {
      // Same state is a commute or a short relocation; a different one is
      // a conversation. Neither is disqualifying.
      const rTail = r.split(',').pop()?.trim()
      const cTail = c.split(',').pop()?.trim()
      locValue = rTail && rTail === cTail ? 70 : 25
      locDetail = `${candidate.location} against ${required.location}`
    }
  }
  factors.push({ label: 'Location', value: locValue, weight: W_LOCATION, detail: locDetail })

  // ── Availability ──
  let availValue = 50
  let availDetail = 'Not stated'
  if (!candidate.availableFrom) {
    unknowns.push('when this candidate can start')
  } else if (!required.neededBy) {
    availValue = 100
    availDetail = `Available ${candidate.availableFrom.toISOString().slice(0, 10)}; no date required`
  } else {
    const daysLate = Math.round(
      (candidate.availableFrom.getTime() - required.neededBy.getTime()) / 86_400_000
    )
    availValue = daysLate <= 0 ? 100 : Math.max(0, 100 - daysLate * 3)
    availDetail = daysLate <= 0
      ? `Available by ${required.neededBy.toISOString().slice(0, 10)}`
      : `Available ${daysLate} days after you need them`
  }
  factors.push({ label: 'Availability', value: availValue, weight: W_AVAILABILITY, detail: availDetail })

  // ── Total ──
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
  const score = Math.round(
    factors.reduce((s, f) => s + f.value * f.weight, 0) / totalWeight
  )

  // ── Confidence follows what is KNOWN, not what was scored ──
  // A tidy-looking 88 built on two facts and three guesses is not a
  // confident 88, and presenting it as one is the whole failure mode this
  // file exists to avoid.
  const confidence: FitAssessment['confidence'] =
    unknowns.length === 0 ? 'HIGH' : unknowns.length <= 2 ? 'MODERATE' : 'LOW'

  const basis = required.skills.length === 0
    ? 'Rate, location and availability only — the requisition names no skills'
    : `${matched.length} of ${required.skills.length} required skill(s), rate against the stated ceiling, location and start date`

  return {
    score,
    confidence,
    factors,
    basis,
    unknowns: unknowns.length > 0 ? unknowns.join('; ') : null,
  }
}
