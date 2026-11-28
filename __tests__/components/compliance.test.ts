import { describe, it, expect } from 'vitest'

/**
 * Compliance page logic tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * Addendum E §E.6: "Every cleared requisition records the basis on
 * which it cleared."
 *
 * Tests the compliance health scoring, evaluation classification,
 * and enforcement mode display logic without rendering.
 */

// ── Types ─────────────────────────────────────────────────

type VerificationStatus = 'CLEAR' | 'PENDING' | 'IN_PROGRESS' | 'FLAGGED' | 'FAILED' | 'CONDITIONAL' | 'EXPIRED'
type EvaluationOutcome = 'PASS' | 'WARN' | 'BLOCK'
type EnforcementMode = 'BLOCK' | 'WARN'

type Verification = {
  type: string
  status: VerificationStatus
}

type Evaluation = {
  id: string
  outcome: EvaluationOutcome
  overriddenBy: string | null
}

// ── Health scoring ───────────────────────────────────────

describe('Compliance health scoring', () => {
  function computeHealth(verifications: Verification[]) {
    const total = verifications.length
    const clear = verifications.filter(v => v.status === 'CLEAR').length
    const pending = verifications.filter(v => v.status === 'PENDING' || v.status === 'IN_PROGRESS').length
    const flagged = verifications.filter(v => v.status === 'FLAGGED' || v.status === 'FAILED' || v.status === 'CONDITIONAL').length
    const expired = verifications.filter(v => v.status === 'EXPIRED').length

    return {
      totalChecks: total,
      clear,
      pending,
      flagged,
      expired,
      clearPercentage: total > 0 ? Math.round((clear / total) * 100) : 100,
    }
  }

  it('clear percentage is 100 when all verifications are CLEAR', () => {
    const health = computeHealth([
      { type: 'I9_EVERIFY', status: 'CLEAR' },
      { type: 'BACKGROUND_CHECK', status: 'CLEAR' },
      { type: 'DRUG_SCREENING', status: 'CLEAR' },
    ])
    expect(health.clearPercentage).toBe(100)
    expect(health.flagged).toBe(0)
    expect(health.pending).toBe(0)
  })

  it('pending verifications reduce the clear percentage', () => {
    const health = computeHealth([
      { type: 'I9_EVERIFY', status: 'CLEAR' },
      { type: 'BACKGROUND_CHECK', status: 'PENDING' },
      { type: 'DRUG_SCREENING', status: 'CLEAR' },
      { type: 'INSURANCE_GL', status: 'IN_PROGRESS' },
    ])
    expect(health.clearPercentage).toBe(50)
    expect(health.pending).toBe(2)
  })

  it('flagged verifications are counted separately from pending', () => {
    const health = computeHealth([
      { type: 'I9_EVERIFY', status: 'CLEAR' },
      { type: 'BACKGROUND_CHECK', status: 'FLAGGED' },
      { type: 'DRUG_SCREENING', status: 'FAILED' },
      { type: 'INSURANCE_GL', status: 'CONDITIONAL' },
    ])
    expect(health.flagged).toBe(3)
    expect(health.pending).toBe(0)
    expect(health.clearPercentage).toBe(25)
  })

  it('an empty verification list has 100% clear rate', () => {
    const health = computeHealth([])
    expect(health.clearPercentage).toBe(100)
    expect(health.totalChecks).toBe(0)
  })

  it('expired verifications are tracked as their own category', () => {
    const health = computeHealth([
      { type: 'I9_EVERIFY', status: 'CLEAR' },
      { type: 'INSURANCE_GL', status: 'EXPIRED' },
    ])
    expect(health.expired).toBe(1)
    expect(health.clear).toBe(1)
    expect(health.clearPercentage).toBe(50)
  })
})

// ── Evaluation summary ──────────────────────────────────

describe('Evaluation summary classification', () => {
  function summarizeEvaluations(evaluations: Evaluation[]) {
    return {
      total: evaluations.length,
      pass: evaluations.filter(e => e.outcome === 'PASS').length,
      warn: evaluations.filter(e => e.outcome === 'WARN').length,
      block: evaluations.filter(e => e.outcome === 'BLOCK').length,
      overridden: evaluations.filter(e => e.overriddenBy !== null).length,
    }
  }

  it('counts PASS, WARN, and BLOCK outcomes separately', () => {
    const summary = summarizeEvaluations([
      { id: '1', outcome: 'PASS', overriddenBy: null },
      { id: '2', outcome: 'PASS', overriddenBy: null },
      { id: '3', outcome: 'WARN', overriddenBy: null },
      { id: '4', outcome: 'BLOCK', overriddenBy: null },
    ])
    expect(summary.total).toBe(4)
    expect(summary.pass).toBe(2)
    expect(summary.warn).toBe(1)
    expect(summary.block).toBe(1)
  })

  it('tracks overridden evaluations regardless of outcome', () => {
    const summary = summarizeEvaluations([
      { id: '1', outcome: 'WARN', overriddenBy: 'admin-id' },
      { id: '2', outcome: 'BLOCK', overriddenBy: 'admin-id' },
      { id: '3', outcome: 'PASS', overriddenBy: null },
    ])
    expect(summary.overridden).toBe(2)
  })

  it('an empty evaluation list returns all zeros', () => {
    const summary = summarizeEvaluations([])
    expect(summary.total).toBe(0)
    expect(summary.pass).toBe(0)
    expect(summary.warn).toBe(0)
    expect(summary.block).toBe(0)
    expect(summary.overridden).toBe(0)
  })
})

// ── Enforcement mode display ─────────────────────────────

describe('Enforcement mode display', () => {
  function enforcementLabel(mode: EnforcementMode): { label: string; severity: 'hard' | 'soft' } {
    if (mode === 'BLOCK') return { label: 'BLOCK', severity: 'hard' }
    return { label: 'WARN', severity: 'soft' }
  }

  it('BLOCK enforcement is classified as hard stop', () => {
    const result = enforcementLabel('BLOCK')
    expect(result.label).toBe('BLOCK')
    expect(result.severity).toBe('hard')
  })

  it('WARN enforcement is classified as soft advisory', () => {
    const result = enforcementLabel('WARN')
    expect(result.label).toBe('WARN')
    expect(result.severity).toBe('soft')
  })
})

// ── Rule type formatting ─────────────────────────────────

describe('Rule type formatting', () => {
  function formatRuleType(type: string): string {
    return type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  it('converts TENURE_CAP to a readable label', () => {
    expect(formatRuleType('TENURE_CAP')).toBe('Tenure Cap')
  })

  it('converts BREAK_IN_SERVICE to a readable label', () => {
    expect(formatRuleType('BREAK_IN_SERVICE')).toBe('Break In Service')
  })

  it('converts RATE_BAND to a readable label', () => {
    expect(formatRuleType('RATE_BAND')).toBe('Rate Band')
  })

  it('converts SEGREGATION_OF_DUTIES to a readable label', () => {
    expect(formatRuleType('SEGREGATION_OF_DUTIES')).toBe('Segregation Of Duties')
  })
})
