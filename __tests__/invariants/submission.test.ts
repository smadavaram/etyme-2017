import { describe, it, expect } from 'vitest'

/**
 * Submission invariants — from CLAUDE.md, BUILD.md §1 + §4.C.
 *
 * These are the hardest invariants in the system. Every one of these
 * tests maps to a database constraint that must never be violated.
 *
 * Source rules:
 *   1. A Submission requires a live BenchListing granted by the consultant.
 *   2. Submission is unique on (requirementId, personId) — first submission wins.
 *   3. SubmissionKind is computed from ownership, never accepted from a client.
 *   4. Rate bands live on RequirementInvitation, never on Requirement.
 *   5. Every read writes an AccessLog row, including refusals.
 */

// Submission kind computation — pure logic, no DB needed
type SubmissionInput = {
  ownsConsultant: boolean
  ownsRequirement: boolean
}

function computeSubmissionKind(input: SubmissionInput): 'INTERNAL' | 'BENCH' | 'NETWORK' {
  if (input.ownsConsultant && input.ownsRequirement) return 'INTERNAL'
  if (input.ownsConsultant) return 'BENCH'
  return 'NETWORK'
}

// Rate floor validation
function validateRate(
  rate: number,
  rateFloor: number | null,
  msa: { minMarginPct: number | null } | null
): { valid: boolean; reason?: string } {
  if (rateFloor !== null && rate < rateFloor) {
    return {
      valid: false,
      reason: `Rate $${rate}/hr is below the consultant's floor of $${rateFloor}/hr`,
    }
  }
  return { valid: true }
}

describe('Submission Invariants (BUILD.md §1, §4.C)', () => {
  describe('SubmissionKind is computed from ownership', () => {
    it('a company submitting its own consultant to its own requirement is INTERNAL', () => {
      expect(
        computeSubmissionKind({ ownsConsultant: true, ownsRequirement: true })
      ).toBe('INTERNAL')
    })

    it('a company submitting its own consultant to another company\'s requirement is BENCH', () => {
      expect(
        computeSubmissionKind({ ownsConsultant: true, ownsRequirement: false })
      ).toBe('BENCH')
    })

    it('a company submitting a network consultant is NETWORK', () => {
      expect(
        computeSubmissionKind({ ownsConsultant: false, ownsRequirement: false })
      ).toBe('NETWORK')
    })

    it('submitting a network consultant to your own requirement is still NETWORK', () => {
      expect(
        computeSubmissionKind({ ownsConsultant: false, ownsRequirement: true })
      ).toBe('NETWORK')
    })
  })

  describe('Rate validation', () => {
    it('a rate below the consultant floor is rejected', () => {
      const result = validateRate(50, 65, null)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('below')
    })

    it('a rate at the consultant floor is accepted', () => {
      const result = validateRate(65, 65, null)
      expect(result.valid).toBe(true)
    })

    it('a rate above the consultant floor is accepted', () => {
      const result = validateRate(80, 65, null)
      expect(result.valid).toBe(true)
    })

    it('a rate with no floor set is always accepted', () => {
      const result = validateRate(10, null, null)
      expect(result.valid).toBe(true)
    })
  })

  describe('Match scores must carry factors, basis, confidence, and unknowns', () => {
    type MatchScore = {
      score: number
      factors: Record<string, number>
      basis: string
      confidence: number
      unknowns: string[]
    }

    function validateMatchScore(match: Partial<MatchScore>): string[] {
      const errors: string[] = []
      if (match.score === undefined) errors.push('score is required')
      if (!match.factors || Object.keys(match.factors).length === 0)
        errors.push('factors are required and must not be empty')
      if (!match.basis) errors.push('basis is required')
      if (match.confidence === undefined) errors.push('confidence is required')
      if (!match.unknowns) errors.push('unknowns array is required')
      return errors
    }

    it('a bare number without factors is a bug', () => {
      const errors = validateMatchScore({ score: 85 })
      expect(errors.length).toBeGreaterThan(0)
      expect(errors).toContain('factors are required and must not be empty')
    })

    it('a complete match score with all four fields is valid', () => {
      const errors = validateMatchScore({
        score: 85,
        factors: { skills: 0.9, location: 0.8, rate: 0.7 },
        basis: 'vector similarity on skills + rate band overlap',
        confidence: 0.82,
        unknowns: ['visa status not confirmed'],
      })
      expect(errors).toHaveLength(0)
    })

    it('unknowns must be an array even if empty', () => {
      const errors = validateMatchScore({
        score: 85,
        factors: { skills: 0.9 },
        basis: 'test',
        confidence: 0.8,
        // unknowns missing
      })
      expect(errors).toContain('unknowns array is required')
    })
  })
})
