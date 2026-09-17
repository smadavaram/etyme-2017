import { describe, it, expect } from 'vitest'
import { submissionKind, tellEmployee, blockedSays } from '@/app/api/submissions/kind'

/**
 * Submission invariants — from CLAUDE.md, BUILD.md §1 + §4.C.
 *
 * These are the hardest invariants in the system. Every one of these
 * tests maps to a database constraint that must never be violated.
 *
 * Source rules:
 *   1. A Submission requires a live BenchListing granted by the consultant —
 *      unless the submitting firm employs the person, in which case the
 *      employment is the consent and the employee is told, not asked.
 *   2. Submission is unique on (requirementId, personId) — first submission wins.
 *   3. SubmissionKind is computed from ownership, never accepted from a client.
 *   4. Rate bands live on RequirementInvitation, never on Requirement.
 *   5. Every read writes an AccessLog row, including refusals.
 *
 * The kind tests below used to run against a copy of the rule written
 * out inside this file, which said INTERNAL meant "our consultant, our
 * requirement". The route said something different again, and neither
 * was what INTERNAL means. They now call the function the route calls.
 */

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
    it('a firm putting forward somebody it employs is an internal submission', () => {
      expect(submissionKind({ employedByUs: true, listingTier: null })).toBe('INTERNAL')
    })

    it('a firm putting forward somebody it has retained on its own bench is a bench submission', () => {
      expect(submissionKind({ employedByUs: false, listingTier: 'RETAINED' })).toBe('BENCH')
    })

    it('a firm putting forward somebody it is only marketing is a network submission', () => {
      expect(submissionKind({ employedByUs: false, listingTier: 'MARKETING' })).toBe('NETWORK')
    })

    it('a firm putting forward somebody who is on no bench of its own is a network submission', () => {
      expect(submissionKind({ employedByUs: false, listingTier: null })).toBe('NETWORK')
    })

    it('being on the payroll decides the kind before the bench tier does', () => {
      // An employer that benches its own staff between projects holds
      // both. Payroll is the stronger answer, because it is what decides
      // whether the award writes a W2 leg or a corp-to-corp one.
      expect(submissionKind({ employedByUs: true, listingTier: 'RETAINED' })).toBe('INTERNAL')
    })

    it('a submission is not internal merely because the firm receiving it is the firm sending it', () => {
      // The old rule, and it was wrong twice over: a submission to
      // yourself is refused at the door with NO_RECIPIENT, so the branch
      // never fired, and INTERNAL is about whose employee the person is
      // rather than who is reading the submission.
      expect(submissionKind({ employedByUs: false, listingTier: null })).not.toBe('INTERNAL')
    })
  })

  describe('An employer may submit its own W2, and the employee is told rather than asked', () => {
    const told = tellEmployee({
      employerName: 'Infosys',
      clientName: 'Corning',
      roleTitle: 'Validation engineer',
    })

    it('the employee is told which client they have been put forward to, and for what', () => {
      expect(told).toContain('Corning')
      expect(told).toContain('Validation engineer')
      expect(told).toContain('Infosys')
    })

    it('the employee is told there is nothing for them to accept', () => {
      expect(told).toContain('nothing for you to accept')
    })

    it('the employee is never asked to agree to anything', () => {
      expect(told).not.toMatch(/say yes|accept this|do you agree|approve/i)
    })

    it('a client a person has ruled out is still refused when their own employer submits them', () => {
      expect(blockedSays()).toBe('This person cannot be submitted to this client.')
    })

    it('the refusal names no other firm, no reason and no one else involved', () => {
      expect(blockedSays()).not.toMatch(/agency|vendor|supplier|because|another/i)
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
