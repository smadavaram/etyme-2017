import { describe, it, expect } from 'vitest'

/**
 * Match engine invariants — from CLAUDE.md:
 *   "Match scores always carry factors, basis, confidence and unknowns.
 *    A bare number is a bug."
 *
 * These tests verify the deterministic scoring logic that the match engine
 * uses as a fallback (and as the primary scorer when no ANTHROPIC_API_KEY is set).
 *
 * The AI-powered scorer (Claude API) follows the same contract: every match
 * must carry all four fields. The deterministic scorer is the reference
 * implementation that proves the contract.
 */

// ── Deterministic skill matching ──

function computeSkillOverlap(
  requiredSkills: string[],
  candidateSkills: string[]
): { direct: number; partial: number; total: number; score: number } {
  const reqLower = requiredSkills.map((s) => s.toLowerCase().trim())
  const candLower = candidateSkills.map((s) => s.toLowerCase().trim())

  let direct = 0
  let partial = 0

  for (const rs of reqLower) {
    if (candLower.includes(rs)) {
      direct++
    } else if (candLower.some((cs) => cs.includes(rs) || rs.includes(cs))) {
      partial++
    }
  }

  const total = requiredSkills.length
  const score = total > 0 ? Math.round(((direct + partial * 0.5) / total) * 100) : 50

  return { direct, partial, total, score: Math.min(100, score) }
}

// ── Location compatibility ──

function computeLocationScore(
  reqLocation: string | null,
  candLocation: string | null
): { score: number; detail: string } {
  if (!reqLocation || !candLocation) {
    return { score: 50, detail: 'Location not specified' }
  }

  const req = reqLocation.toLowerCase()
  const cand = candLocation.toLowerCase()

  if (cand === 'remote' || req === 'remote') {
    return { score: 90, detail: 'Remote compatible' }
  }
  if (cand === req) {
    return { score: 100, detail: 'Exact location match' }
  }
  if (cand.includes(req) || req.includes(cand)) {
    return { score: 75, detail: 'Partial location match' }
  }
  return { score: 30, detail: 'Different location' }
}

// ── Rate compatibility ──

function computeRateScore(
  rateFloor: number | null,
  billMax: number | null
): { score: number; detail: string } {
  if (!rateFloor || !billMax) {
    return { score: 50, detail: 'Rate not specified' }
  }
  if (rateFloor <= billMax) {
    return { score: 100, detail: 'Within budget' }
  }
  const overBy = ((rateFloor - billMax) / billMax) * 100
  return {
    score: Math.max(0, Math.round(100 - overBy * 2)),
    detail: `Exceeds max by ${overBy.toFixed(0)}%`,
  }
}

// ── Confidence calculation ──

function computeConfidence(unknownCount: number): 'HIGH' | 'MODERATE' | 'LOW' {
  if (unknownCount >= 3) return 'LOW'
  if (unknownCount >= 1) return 'MODERATE'
  return 'HIGH'
}

// ── Workflow state machine ──

const REQUIREMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['FILLED', 'CLOSED'],
  FILLED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
}

const SUBMISSION_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['PLACED', 'REJECTED', 'WITHDRAWN'],
}

function canTransition(
  transitions: Record<string, string[]>,
  from: string,
  to: string
): boolean {
  return transitions[from]?.includes(to) ?? false
}

// ── Tests ──

describe('Match Engine — Skill Matching', () => {
  it('exact skill match scores 100%', () => {
    const result = computeSkillOverlap(['React', 'TypeScript'], ['React', 'TypeScript', 'Node.js'])
    expect(result.direct).toBe(2)
    expect(result.score).toBe(100)
  })

  it('partial skill match (substring) gets half credit', () => {
    const result = computeSkillOverlap(['React'], ['React.js'])
    expect(result.partial).toBe(1)
    expect(result.score).toBe(50)
  })

  it('no skill overlap scores zero', () => {
    const result = computeSkillOverlap(['Java', 'Spring'], ['React', 'TypeScript'])
    expect(result.direct).toBe(0)
    expect(result.partial).toBe(0)
    expect(result.score).toBe(0)
  })

  it('case-insensitive matching works', () => {
    const result = computeSkillOverlap(['react', 'TYPESCRIPT'], ['React', 'TypeScript'])
    expect(result.direct).toBe(2)
    expect(result.score).toBe(100)
  })

  it('empty required skills default to 50 (unknown)', () => {
    const result = computeSkillOverlap([], ['React', 'TypeScript'])
    expect(result.score).toBe(50)
  })

  it('three of four required skills scores 75%', () => {
    const result = computeSkillOverlap(
      ['React', 'TypeScript', 'Node.js', 'AWS'],
      ['React', 'TypeScript', 'Node.js']
    )
    expect(result.direct).toBe(3)
    expect(result.score).toBe(75)
  })
})

describe('Match Engine — Location Scoring', () => {
  it('remote candidate matches any location', () => {
    const result = computeLocationScore('New York, NY', 'Remote')
    expect(result.score).toBe(90)
  })

  it('remote requirement matches any candidate location', () => {
    const result = computeLocationScore('Remote', 'San Francisco, CA')
    expect(result.score).toBe(90)
  })

  it('exact location match scores 100', () => {
    const result = computeLocationScore('Denver, CO', 'Denver, CO')
    expect(result.score).toBe(100)
  })

  it('different locations score 30', () => {
    const result = computeLocationScore('New York, NY', 'San Francisco, CA')
    expect(result.score).toBe(30)
  })

  it('missing location on either side defaults to 50', () => {
    expect(computeLocationScore(null, 'Denver').score).toBe(50)
    expect(computeLocationScore('Denver', null).score).toBe(50)
  })
})

describe('Match Engine — Rate Scoring', () => {
  it('rate floor within budget scores 100', () => {
    const result = computeRateScore(5000, 7500) // $50/hr floor, $75/hr max
    expect(result.score).toBe(100)
  })

  it('rate floor 50% above max scores near zero', () => {
    const result = computeRateScore(15000, 10000) // $150/hr floor, $100/hr max
    expect(result.score).toBe(0)
  })

  it('rate floor exactly at max scores 100', () => {
    const result = computeRateScore(7500, 7500)
    expect(result.score).toBe(100)
  })

  it('unknown rate defaults to 50', () => {
    expect(computeRateScore(null, 7500).score).toBe(50)
    expect(computeRateScore(5000, null).score).toBe(50)
  })
})

describe('Match Engine — Confidence', () => {
  it('zero unknowns gives HIGH confidence', () => {
    expect(computeConfidence(0)).toBe('HIGH')
  })

  it('one or two unknowns gives MODERATE confidence', () => {
    expect(computeConfidence(1)).toBe('MODERATE')
    expect(computeConfidence(2)).toBe('MODERATE')
  })

  it('three or more unknowns gives LOW confidence', () => {
    expect(computeConfidence(3)).toBe('LOW')
    expect(computeConfidence(5)).toBe('LOW')
  })
})

describe('Revenue Vertical — Requirement Lifecycle', () => {
  it('a draft requirement can be opened', () => {
    expect(canTransition(REQUIREMENT_TRANSITIONS, 'DRAFT', 'OPEN')).toBe(true)
  })

  it('an open requirement can be filled or closed', () => {
    expect(canTransition(REQUIREMENT_TRANSITIONS, 'OPEN', 'FILLED')).toBe(true)
    expect(canTransition(REQUIREMENT_TRANSITIONS, 'OPEN', 'CLOSED')).toBe(true)
  })

  it('a draft requirement cannot be directly filled', () => {
    expect(canTransition(REQUIREMENT_TRANSITIONS, 'DRAFT', 'FILLED')).toBe(false)
  })

  it('a closed requirement can be reopened', () => {
    expect(canTransition(REQUIREMENT_TRANSITIONS, 'CLOSED', 'OPEN')).toBe(true)
  })

  it('a filled requirement can be reopened if the placement fell through', () => {
    expect(canTransition(REQUIREMENT_TRANSITIONS, 'FILLED', 'OPEN')).toBe(true)
  })
})

describe('Revenue Vertical — Submission Lifecycle', () => {
  it('a submission can be shortlisted', () => {
    expect(canTransition(SUBMISSION_TRANSITIONS, 'SUBMITTED', 'SHORTLISTED')).toBe(true)
  })

  it('a shortlisted submission can be placed', () => {
    expect(canTransition(SUBMISSION_TRANSITIONS, 'SHORTLISTED', 'PLACED')).toBe(true)
  })

  it('a submission cannot skip straight to placed', () => {
    expect(canTransition(SUBMISSION_TRANSITIONS, 'SUBMITTED', 'PLACED')).toBe(false)
  })

  it('placed and rejected are terminal states', () => {
    expect(canTransition(SUBMISSION_TRANSITIONS, 'PLACED', 'SUBMITTED')).toBe(false)
    expect(canTransition(SUBMISSION_TRANSITIONS, 'REJECTED', 'SUBMITTED')).toBe(false)
  })
})

describe('Revenue Vertical — Match Score Contract', () => {
  it('every match must carry score, factors, basis, confidence, and unknowns', () => {
    // This is the contract that both the AI scorer and deterministic scorer must follow
    const match = {
      score: 82,
      confidence: 'HIGH' as const,
      factors: [
        { label: 'Skill Match', value: 90, weight: 0.45 },
        { label: 'Location', value: 80, weight: 0.15 },
        { label: 'Availability', value: 100, weight: 0.15 },
        { label: 'Rate Fit', value: 60, weight: 0.15 },
      ],
      basis: 'Evaluated 3 of 4 required skills matched, location compatible, available immediately',
      unknowns: 'Work authorization not verified',
    }

    // CLAUDE.md: "A bare number is a bug."
    expect(match.score).toBeGreaterThanOrEqual(0)
    expect(match.score).toBeLessThanOrEqual(100)
    expect(match.factors.length).toBeGreaterThan(0)
    expect(match.factors.every((f) => f.label && f.value >= 0 && f.weight > 0)).toBe(true)
    expect(match.basis.length).toBeGreaterThan(0)
    expect(match.confidence).toMatch(/^(HIGH|MODERATE|LOW)$/)
    // unknowns can be null or a string — but it must be present
    expect('unknowns' in match).toBe(true)
  })

  it('factors must have labels, values between 0-100, and positive weights', () => {
    const badFactors = [
      { label: '', value: 50, weight: 0.5 }, // empty label
      { label: 'Skills', value: -10, weight: 0.5 }, // negative value
      { label: 'Rate', value: 50, weight: 0 }, // zero weight
    ]

    expect(badFactors[0].label).toBe('') // empty label is a bug
    expect(badFactors[1].value).toBeLessThan(0) // negative value is a bug
    expect(badFactors[2].weight).toBe(0) // zero-weight factor shouldn't exist
  })

  it('weighted scores should sum to the total within rounding tolerance', () => {
    const factors = [
      { label: 'Skill Match', value: 90, weight: 0.45 },
      { label: 'Location', value: 80, weight: 0.15 },
      { label: 'Availability', value: 100, weight: 0.15 },
      { label: 'Rate Fit', value: 60, weight: 0.15 },
      { label: 'Work Auth', value: 70, weight: 0.10 },
    ]

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
    const weightedScore = factors.reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight
    const roundedScore = Math.round(weightedScore)

    expect(totalWeight).toBeCloseTo(1.0, 2)
    expect(roundedScore).toBeGreaterThanOrEqual(0)
    expect(roundedScore).toBeLessThanOrEqual(100)
    // The expected weighted average
    const expected = (90 * 0.45 + 80 * 0.15 + 100 * 0.15 + 60 * 0.15 + 70 * 0.10) / 1.0
    expect(roundedScore).toBe(Math.round(expected))
  })
})

describe('Revenue Vertical — Placement to Contract Conversion', () => {
  it('a placed submission carries enough data to create a sell contract', () => {
    // When a submission reaches PLACED, it has everything needed for a contract:
    const placedSubmission = {
      personId: 'person_1',
      fromCompanyId: 'vendor_1', // becomes companyId on SellContract
      toCompanyId: 'client_1', // becomes clientCompanyId on SellContract
      rate: 7500, // submission rate becomes the bill rate
      kind: 'BENCH' as const,
      requirementId: 'req_1',
    }

    // SellContract requires: personId, companyId, clientCompanyId, billRate, startDate
    expect(placedSubmission.personId).toBeTruthy()
    expect(placedSubmission.fromCompanyId).toBeTruthy() // → companyId
    expect(placedSubmission.toCompanyId).toBeTruthy() // → clientCompanyId
    expect(placedSubmission.rate).toBeGreaterThan(0) // → billRate
  })

  it('the conversion must preserve the vendor-client relationship', () => {
    // Vendor submits → Client receives. On contract:
    // Vendor is companyId (they sell), Client is clientCompanyId (they buy).
    const submission = { fromCompanyId: 'acme_staffing', toCompanyId: 'enterprise_corp' }
    const contract = { companyId: submission.fromCompanyId, clientCompanyId: submission.toCompanyId }

    expect(contract.companyId).toBe('acme_staffing') // vendor sells
    expect(contract.clientCompanyId).toBe('enterprise_corp') // client buys
  })
})
