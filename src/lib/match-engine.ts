import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { sift, DEFAULT_SHORTLIST, type Candidate as Siftable } from '@/lib/bench-filter'
import { record } from '@/lib/agent-run'

/**
 * Match Engine — the core differentiator.
 *
 * CLAUDE.md: "Match scores always carry factors, basis, confidence and unknowns.
 *             A bare number is a bug."
 *
 * Takes a Requirement and finds the best-fit consultants from the bench.
 * Uses Claude for semantic skill matching (e.g., "React" ↔ "Next.js"),
 * then scores on five dimensions:
 *   1. Skill overlap (semantic, not string equality)
 *   2. Location compatibility
 *   3. Availability window
 *   4. Work authorisation fit
 *   5. Rate compatibility
 *
 * Returns structured Match records with factors, basis, confidence, unknowns.
 */

const anthropic = new Anthropic()

/**
 * Which model does the scoring.
 *
 * Settable, because this is the single biggest line in the cost of a
 * submission and the right answer changes with the price list. The ledger
 * records the model on every run, so switching it is a decision somebody
 * can make from real numbers rather than a hunch.
 */
const MODEL = process.env.MATCH_MODEL ?? 'claude-opus-5'

interface MatchFactor {
  label: string
  value: number // 0-100
  weight: number // how much this factor contributed to the total
  detail?: string
}

interface MatchResult {
  consultantId: string
  personId: string
  score: number // 0-100
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  factors: MatchFactor[]
  basis: string
  unknowns: string | null
}

interface RequirementData {
  id: string
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  months: number | null
  startDate: Date | null
  companyId: string
}

interface CandidateData {
  consultantId: string
  personId: string
  personName: string
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  rateFloor: number | null
  availableFrom: Date | null
  listingCompanyId: string
  listingTier: string
  listingRateMin: number | null
  listingRateMax: number | null
  /// When the person themselves last said any of this was still true.
  confirmedAt: Date | null
}

/**
 * Run the match engine for a requirement.
 * Creates Match records in the database and returns them.
 *
 * @param requirementId - the requirement to match against
 * @param options.limit - max candidates to return (default 20)
 * @param options.forceRefresh - delete existing matches and recompute
 */
export async function runMatchEngine(
  requirementId: string,
  options: { limit?: number; forceRefresh?: boolean } = {}
): Promise<{ matches: MatchResult[]; basis: string }> {
  const limit = options.limit ?? 20

  // 1. Load the requirement
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true,
      title: true,
      skills: true,
      location: true,
      billMin: true,
      billMax: true,
      months: true,
      startDate: true,
      companyId: true,
    },
  })

  if (!requirement) {
    throw new Error(`Requirement ${requirementId} not found`)
  }

  // 2. If forceRefresh, delete existing matches
  if (options.forceRefresh) {
    await prisma.match.deleteMany({ where: { requirementId } })
  }

  // 3. Load candidate pool — consultants with active bench listings
  //    Exclude people already submitted to this requirement
  const existingSubmissions = await prisma.submission.findMany({
    where: { requirementId },
    select: { personId: true },
  })
  const excludedPersonIds = new Set(existingSubmissions.map((s) => s.personId))

  const listings = await prisma.benchListing.findMany({
    where: {
      revokedAt: null,
      consultant: {
        person: {
          id: { notIn: Array.from(excludedPersonIds) },
        },
      },
    },
    include: {
      consultant: {
        include: {
          person: { select: { id: true, name: true } },
        },
      },
    },
    // Take a reasonable pool to evaluate
    take: 200,
  })

  if (listings.length === 0) {
    return { matches: [], basis: 'No candidates with active bench listings found' }
  }

  // 4. Deduplicate by person (a consultant may have multiple listings)
  //    Prefer RETAINED over MARKETING tier
  const candidateMap = new Map<string, CandidateData>()
  for (const listing of listings) {
    const personId = listing.consultant.person.id
    const existing = candidateMap.get(personId)

    // Keep the better listing (RETAINED > MARKETING)
    if (existing && existing.listingTier === 'RETAINED' && listing.tier !== 'RETAINED') {
      continue
    }

    candidateMap.set(personId, {
      consultantId: listing.consultantId,
      personId,
      personName: listing.consultant.person.name,
      headline: listing.consultant.headline,
      skills: listing.consultant.skills,
      location: listing.consultant.location,
      workAuth: listing.consultant.workAuth,
      rateFloor: listing.consultant.rateFloor,
      availableFrom: listing.consultant.availableFrom,
      listingCompanyId: listing.companyId,
      listingTier: listing.tier,
      listingRateMin: listing.rateMin,
      listingRateMax: listing.rateMax,
      confirmedAt: listing.consultant.confirmedAt,
    })
  }

  const everyone = Array.from(candidateMap.values())

  // 5. Filter with plain rules before paying a model for anything.
  //
  //    This sent all two hundred to the model. Any overlapping skills at
  //    all, rate floor under the ceiling, free before the start date,
  //    permit matches — every one of those is string and date comparison.
  //    Free, instant, right every time, and on a forty-person bench the
  //    difference between $53 a month and $140.
  //
  //    The model is kept for the one judgement that needs it: whether a
  //    skill claim is real, and how close two differently-worded skills
  //    actually are.
  const sifted = sift(
    {
      skills: requirement.skills,
      location: requirement.location,
      billMin: requirement.billMin,
      billMax: requirement.billMax,
      startDate: requirement.startDate,
      workAuth: null,
    },
    everyone.map(
      (c): Siftable => ({
        personId: c.personId,
        name: c.personName,
        skills: c.skills,
        location: c.location,
        workAuth: c.workAuth,
        rateFloor: c.rateFloor,
        availableFrom: c.availableFrom,
        confirmedAt: c.confirmedAt,
      })
    ),
    { shortlist: Math.max(limit, DEFAULT_SHORTLIST) }
  )

  const byPerson = new Map(everyone.map((c) => [c.personId, c]))
  const candidates = sifted.kept
    .map((k) => byPerson.get(k.candidate.personId))
    .filter((c): c is CandidateData => c !== undefined)

  // The rules alone are a run worth recording. A ledger that only counts
  // the calls that cost money makes the free half invisible, and the free
  // half is where the margin comes from.
  await record({
    companyId: requirement.companyId,
    agent: 'match.sift',
    recordType: 'REQUIREMENT',
    recordId: requirement.id,
    verdict: candidates.length > 0 ? 'PASS' : 'FAIL',
    failReason: candidates.length === 0 ? sifted.summary : null,
    ms: 0,
    consideredCount: sifted.considered,
    scoredCount: candidates.length,
  })

  if (candidates.length === 0) {
    return { matches: [], basis: sifted.summary }
  }

  // 6. Score what survived
  const matchResults = await scoreWithClaude(requirement, candidates, limit, sifted.considered)

  // 6. Write Match records to the database
  const now = new Date()
  for (const result of matchResults) {
    await prisma.match.upsert({
      where: {
        requirementId_consultantId: {
          requirementId,
          consultantId: result.consultantId,
        },
      },
      update: {
        score: result.score,
        confidence: result.confidence,
        factors: result.factors as any,
        basis: result.basis,
        unknowns: result.unknowns,
        computedAt: now,
      },
      create: {
        requirementId,
        consultantId: result.consultantId,
        score: result.score,
        confidence: result.confidence,
        factors: result.factors as any,
        basis: result.basis,
        unknowns: result.unknowns,
        computedAt: now,
      },
    })
  }

  return {
    matches: matchResults,
    // Says what the rules did as well as what the model did, so "only
    // three matched" is answerable without reading code.
    basis: `${sifted.summary} Scored against "${requirement.title}" (${requirement.skills.join(', ')}).`,
  }
}

/**
 * Use Claude to semantically score candidates against a requirement.
 *
 * Instead of exact string matching ("React" !== "React.js"), Claude understands
 * that Next.js implies React, that "full-stack" covers both frontend and backend,
 * and that "AWS" partially satisfies "cloud infrastructure".
 */
async function scoreWithClaude(
  req: RequirementData,
  candidates: CandidateData[],
  limit: number,
  considered: number
): Promise<MatchResult[]> {
  // No key: score with arithmetic instead, and say so in the ledger.
  //
  // Recording nothing here would have been the worst of both. A week where
  // the key was misconfigured would read as a week where the model got
  // free, the cost-per-submission line would fall, and somebody would
  // conclude the product had improved.
  if (!process.env.ANTHROPIC_API_KEY) {
    const started = Date.now()
    const results = scoreDeterministic(req, candidates, limit)
    await record({
      companyId: req.companyId,
      agent: 'match.score.deterministic',
      recordType: 'REQUIREMENT',
      recordId: req.id,
      verdict: 'PASS',
      failReason: 'no ANTHROPIC_API_KEY — scored with rules, not the model',
      ms: Date.now() - started,
      consideredCount: considered,
      scoredCount: candidates.length,
    })
    return results
  }

  // Batch candidates into groups of 25 for the API call
  const batchSize = 25
  const allResults: MatchResult[] = []

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)

    const candidateList = batch.map((c, idx) => ({
      idx,
      name: c.personName,
      skills: c.skills,
      headline: c.headline,
      location: c.location,
      workAuth: c.workAuth,
      rateFloor: c.rateFloor ? `$${(c.rateFloor / 100).toFixed(0)}/hr` : null,
      availableFrom: c.availableFrom?.toISOString().slice(0, 10) ?? null,
    }))

    // The prompt is built in two halves on purpose.
    //
    // Everything above the candidates is identical for every batch of the
    // same requirement — the role, the scoring rules, the output shape.
    // Put stably first and marked cacheable, it is charged at a tenth on
    // every batch after the first. Eight batches become one full price and
    // seven cheap ones.
    //
    // Anything volatile below the breakpoint, or the cache never hits.
    const rules = `You are a staffing match engine. Score each candidate against this requirement.

REQUIREMENT:
- Title: ${req.title}
- Required Skills: ${req.skills.join(', ')}
- Location: ${req.location ?? 'Not specified'}
- Rate Range: ${req.billMin && req.billMax ? `$${(req.billMin / 100).toFixed(0)}-$${(req.billMax / 100).toFixed(0)}/hr` : 'Not specified'}
- Duration: ${req.months ? `${req.months} months` : 'Not specified'}
- Start Date: ${req.startDate?.toISOString().slice(0, 10) ?? 'Not specified'}

These candidates have already passed the plain rules — they have at least
one overlapping skill, their rate floor is under the ceiling, they are free
in time, and their work authorisation fits. Do not re-check any of that.
Judge the thing rules cannot: how close the skills really are, and whether
the claim is credible.

For each candidate, return a JSON array. Each element must have:
- idx: the candidate index
- score: 0-100 overall match score
- confidence: "HIGH" | "MODERATE" | "LOW"
- factors: array of { label, value (0-100), weight (0.0-1.0), detail (brief explanation) }
  Required factor labels: "Skill Match", "Location", "Availability", "Rate Fit"
  Optional: "Work Authorization", "Experience Level"
- basis: one sentence describing what data drove the score
- unknowns: what you couldn't assess (null if nothing)

SCORING RULES:
- Skill Match (weight ~0.45): Semantic matching. "React.js" = "React". "Next.js" implies React. "Full-stack" covers frontend+backend. Score partial overlaps proportionally.
- Location (weight ~0.15): "Remote" matches anything. Same city = 100. Same state = 80. Same country = 60. Different country = 20. Both null = 50.
- Availability (weight ~0.15): Available before start date = 100. Within 2 weeks after = 80. Within month = 50. Unknown = 40.
- Rate Fit (weight ~0.15): Within range = 100. Floor above max = proportional penalty. Unknown = 50.
- Work Auth (weight ~0.10): Match required auth if location is US. Unknown = 30.

Return ONLY a JSON array, no other text.`

    const started = Date.now()

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // Adaptive thinking at low effort. This is a bounded judgement on
        // fifteen rows, not an open problem, and effort is the dial that
        // decides what it costs.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: rules,
                cache_control: { type: 'ephemeral' },
              },
              {
                type: 'text',
                text: `CANDIDATES:\n${JSON.stringify(candidateList, null, 2)}`,
              },
            ],
          },
        ],
      })

      // Written whether it passed or failed. The runs that error are the
      // ones worth counting.
      await record({
        companyId: req.companyId,
        agent: 'match.score',
        recordType: 'REQUIREMENT',
        recordId: req.id,
        verdict: 'PASS',
        model: MODEL,
        usage: response.usage,
        ms: Date.now() - started,
        consideredCount: considered,
        scoredCount: batch.length,
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.error('Match engine: Could not parse Claude response, falling back to deterministic')
        allResults.push(...scoreDeterministic(req, batch, batch.length))
        continue
      }

      const scored = JSON.parse(jsonMatch[0]) as Array<{
        idx: number
        score: number
        confidence: string
        factors: MatchFactor[]
        basis: string
        unknowns: string | null
      }>

      for (const s of scored) {
        const candidate = batch[s.idx]
        if (!candidate) continue

        allResults.push({
          consultantId: candidate.consultantId,
          personId: candidate.personId,
          score: Math.max(0, Math.min(100, Math.round(s.score))),
          confidence: (['HIGH', 'MODERATE', 'LOW'].includes(s.confidence) ? s.confidence : 'LOW') as 'HIGH' | 'MODERATE' | 'LOW',
          factors: (s.factors ?? []).map((f) => ({
            label: f.label,
            value: Math.max(0, Math.min(100, Math.round(f.value))),
            weight: Math.max(0, Math.min(1, f.weight)),
            detail: f.detail,
          })),
          basis: s.basis ?? `Matched against "${req.title}"`,
          unknowns: s.unknowns ?? null,
        })
      }
    } catch (err: any) {
      // A degraded result presented as a good one is the failure worth
      // avoiding. The fallback is labelled in the ledger, so a week where
      // the key was wrong does not read as a week where the model got
      // cheaper.
      await record({
        companyId: req.companyId,
        agent: 'match.score',
        recordType: 'REQUIREMENT',
        recordId: req.id,
        verdict: 'ERROR',
        failReason: String(err?.message ?? err).slice(0, 300),
        model: MODEL,
        ms: Date.now() - started,
        consideredCount: considered,
        scoredCount: batch.length,
      })
      console.error('Match engine: Claude API call failed, falling back to deterministic', err)
      allResults.push(...scoreDeterministic(req, batch, batch.length))
    }
  }

  // Sort by score descending, take top N
  allResults.sort((a, b) => b.score - a.score)
  return allResults.slice(0, limit)
}

/**
 * Deterministic scoring fallback — used when ANTHROPIC_API_KEY is not set
 * or when the API call fails. Still produces structured Match records
 * with factors, basis, confidence, and unknowns.
 */
function scoreDeterministic(
  req: RequirementData,
  candidates: CandidateData[],
  limit: number
): MatchResult[] {
  const results: MatchResult[] = []

  for (const c of candidates) {
    const factors: MatchFactor[] = []

    // Skill match — case-insensitive intersection
    const reqSkillsLower = req.skills.map((s) => s.toLowerCase().trim())
    const candSkillsLower = c.skills.map((s) => s.toLowerCase().trim())

    // Count direct matches and partial matches
    let directMatches = 0
    let partialMatches = 0
    for (const rs of reqSkillsLower) {
      if (candSkillsLower.includes(rs)) {
        directMatches++
      } else if (candSkillsLower.some((cs) => cs.includes(rs) || rs.includes(cs))) {
        partialMatches++
      }
    }

    const skillScore = req.skills.length > 0
      ? Math.round(((directMatches + partialMatches * 0.5) / req.skills.length) * 100)
      : 50

    factors.push({
      label: 'Skill Match',
      value: Math.min(100, skillScore),
      weight: 0.45,
      detail: `${directMatches} direct, ${partialMatches} partial of ${req.skills.length} required`,
    })

    // Location match
    let locationScore = 50
    let locationDetail = 'Unknown'
    if (!req.location || !c.location) {
      locationScore = 50
      locationDetail = 'Location not specified'
    } else {
      const reqLoc = req.location.toLowerCase()
      const candLoc = c.location.toLowerCase()
      if (candLoc === 'remote' || reqLoc === 'remote') {
        locationScore = 90
        locationDetail = 'Remote compatible'
      } else if (candLoc === reqLoc) {
        locationScore = 100
        locationDetail = 'Exact location match'
      } else if (candLoc.includes(reqLoc) || reqLoc.includes(candLoc)) {
        locationScore = 75
        locationDetail = 'Partial location match'
      } else {
        locationScore = 30
        locationDetail = 'Different location'
      }
    }

    factors.push({ label: 'Location', value: locationScore, weight: 0.15, detail: locationDetail })

    // Availability
    let availScore = 40
    let availDetail = 'Availability unknown'
    if (c.availableFrom && req.startDate) {
      const daysUntilAvailable = (c.availableFrom.getTime() - req.startDate.getTime()) / 86400000
      if (daysUntilAvailable <= 0) {
        availScore = 100
        availDetail = 'Available now'
      } else if (daysUntilAvailable <= 14) {
        availScore = 80
        availDetail = `Available in ${Math.ceil(daysUntilAvailable)} days`
      } else if (daysUntilAvailable <= 30) {
        availScore = 50
        availDetail = `Available in ${Math.ceil(daysUntilAvailable)} days`
      } else {
        availScore = 20
        availDetail = `Not available for ${Math.ceil(daysUntilAvailable)} days`
      }
    }

    factors.push({ label: 'Availability', value: availScore, weight: 0.15, detail: availDetail })

    // Rate fit
    let rateScore = 50
    let rateDetail = 'Rate not specified'
    if (c.rateFloor && req.billMax) {
      if (c.rateFloor <= req.billMax) {
        rateScore = 100
        rateDetail = `Floor $${(c.rateFloor / 100).toFixed(0)}/hr within budget`
      } else {
        const overBy = ((c.rateFloor - req.billMax) / req.billMax) * 100
        rateScore = Math.max(0, Math.round(100 - overBy * 2))
        rateDetail = `Floor $${(c.rateFloor / 100).toFixed(0)}/hr exceeds max by ${overBy.toFixed(0)}%`
      }
    }

    factors.push({ label: 'Rate Fit', value: rateScore, weight: 0.15, detail: rateDetail })

    // Work authorization (only relevant for US roles)
    let authScore = 50
    let authDetail = 'Work authorization not checked'
    if (req.location && req.location.toLowerCase().includes('us')) {
      if (!c.workAuth) {
        authScore = 30
        authDetail = 'Work authorization unknown'
      } else if (['US_CITIZEN', 'GC'].includes(c.workAuth)) {
        authScore = 100
        authDetail = `${c.workAuth} — no restrictions`
      } else if (['H1B', 'OPT'].includes(c.workAuth)) {
        authScore = 70
        authDetail = `${c.workAuth} — requires sponsorship verification`
      } else {
        authScore = 40
        authDetail = `${c.workAuth} — may have restrictions`
      }
      factors.push({ label: 'Work Authorization', value: authScore, weight: 0.10 })
    }

    // Calculate weighted total
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
    const weightedScore = factors.reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight
    const score = Math.round(weightedScore)

    // Determine confidence
    const unknownParts: string[] = []
    if (!c.location) unknownParts.push('location')
    if (!c.workAuth) unknownParts.push('work authorization')
    if (!c.availableFrom) unknownParts.push('availability date')
    if (!c.rateFloor) unknownParts.push('rate expectations')

    let confidence: 'HIGH' | 'MODERATE' | 'LOW' = 'HIGH'
    if (unknownParts.length >= 3) confidence = 'LOW'
    else if (unknownParts.length >= 1) confidence = 'MODERATE'

    results.push({
      consultantId: c.consultantId,
      personId: c.personId,
      score,
      confidence,
      factors,
      basis: `Deterministic scoring against ${req.skills.length} required skills, ${candidates.length} candidates evaluated`,
      unknowns: unknownParts.length > 0 ? `Missing: ${unknownParts.join(', ')}` : null,
    })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
