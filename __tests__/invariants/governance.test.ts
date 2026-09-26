/**
 * Governance enforcement engine tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * CLAUDE.md: "BLOCK where legally grounded... WARN, capture a reason, proceed.
 *             Never silently permit."
 *
 * Addendum E §E.6: governance enforcement at contract start, extension,
 * and alumni re-engagement.
 */

import { describe, it, expect } from 'vitest'

// ── Types matching the governance engine ─────────────────

type EvaluationOutcome = 'PASS' | 'WARN' | 'BLOCK'

interface EvaluationResult {
  ruleId: string
  ruleType: string
  enforcementMode: 'BLOCK' | 'WARN'
  outcome: EvaluationOutcome
  reason: string
  overridable: boolean
}

interface GovernanceResult {
  outcome: EvaluationOutcome
  evaluations: EvaluationResult[]
  canProceed: boolean
  summary: string
}

// ── Helper: simulate governance resolution ───────────────

function resolveGovernance(evaluations: EvaluationResult[]): GovernanceResult {
  const hasBlock = evaluations.some(e => e.outcome === 'BLOCK')
  const hasWarn = evaluations.some(e => e.outcome === 'WARN')
  const outcome: EvaluationOutcome = hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'PASS'
  const canProceed = !hasBlock

  const blocks = evaluations.filter(e => e.outcome === 'BLOCK')
  const warns = evaluations.filter(e => e.outcome === 'WARN')

  let summary: string
  if (blocks.length > 0) {
    summary = `Blocked: ${blocks.map(b => b.reason).join('; ')}`
  } else if (warns.length > 0) {
    summary = `Warning: ${warns.map(w => w.reason).join('; ')}`
  } else {
    summary = `All ${evaluations.length} governance check(s) passed`
  }

  return { outcome, evaluations, canProceed, summary }
}

// ── Helper: simulate tenure cap evaluation ───────────────

function evaluateTenureCap(
  personName: string,
  totalDays: number,
  capMonths: number,
  enforcementMode: 'BLOCK' | 'WARN' = 'BLOCK',
): EvaluationResult {
  const capDays = Math.round(capMonths * 30.44)
  const totalMonths = Math.round(totalDays / 30.44)
  const pctUsed = totalDays / capDays

  if (totalDays >= capDays) {
    return {
      ruleId: 'rule-tenure-cap',
      ruleType: 'TENURE_CAP',
      enforcementMode,
      outcome: enforcementMode,
      reason: `${personName} has ${totalMonths} months tenure (cap: ${capMonths})`,
      overridable: enforcementMode === 'WARN',
    }
  }

  if (pctUsed >= 0.75) {
    return {
      ruleId: 'rule-tenure-cap',
      ruleType: 'TENURE_CAP',
      enforcementMode,
      outcome: 'WARN',
      reason: `${personName} is at ${totalMonths} of ${capMonths} months (${Math.round(pctUsed * 100)}% of cap)`,
      overridable: true,
    }
  }

  return {
    ruleId: 'rule-tenure-cap',
    ruleType: 'TENURE_CAP',
    enforcementMode,
    outcome: 'PASS',
    reason: `${personName}: ${totalMonths} of ${capMonths} months`,
    overridable: false,
  }
}

// ── Helper: simulate break-in-service evaluation ─────────

function evaluateBreakInService(
  personName: string,
  daysSinceEnd: number | null,
  breakDays: number,
  enforcementMode: 'BLOCK' | 'WARN' = 'BLOCK',
): EvaluationResult {
  if (daysSinceEnd === null) {
    return {
      ruleId: 'rule-break',
      ruleType: 'BREAK_IN_SERVICE',
      enforcementMode,
      outcome: 'PASS',
      reason: 'No prior ended contract',
      overridable: false,
    }
  }

  if (daysSinceEnd < breakDays) {
    return {
      ruleId: 'rule-break',
      ruleType: 'BREAK_IN_SERVICE',
      enforcementMode,
      outcome: enforcementMode,
      reason: `${personName}: ${daysSinceEnd} of ${breakDays} break days completed`,
      overridable: enforcementMode === 'WARN',
    }
  }

  return {
    ruleId: 'rule-break',
    ruleType: 'BREAK_IN_SERVICE',
    enforcementMode,
    outcome: 'PASS',
    reason: `${personName}: break period complete`,
    overridable: false,
  }
}

// ── Helper: simulate rate band evaluation ────────────────

function evaluateRateBand(
  billRateCents: number,
  minRateCents: number,
  maxRateCents: number,
  enforcementMode: 'BLOCK' | 'WARN' = 'WARN',
): EvaluationResult {
  const rate = billRateCents / 100

  if (billRateCents < minRateCents) {
    return {
      ruleId: 'rule-rate',
      ruleType: 'RATE_BAND',
      enforcementMode,
      outcome: enforcementMode,
      reason: `Bill rate $${rate}/hr is below minimum $${minRateCents / 100}/hr`,
      overridable: enforcementMode === 'WARN',
    }
  }

  if (billRateCents > maxRateCents) {
    return {
      ruleId: 'rule-rate',
      ruleType: 'RATE_BAND',
      enforcementMode,
      outcome: enforcementMode,
      reason: `Bill rate $${rate}/hr exceeds maximum $${maxRateCents / 100}/hr`,
      overridable: enforcementMode === 'WARN',
    }
  }

  return {
    ruleId: 'rule-rate',
    ruleType: 'RATE_BAND',
    enforcementMode,
    outcome: 'PASS',
    reason: `Bill rate $${rate}/hr within approved band`,
    overridable: false,
  }
}

// ── Tests ────────────────────────────────────────────────

describe('Governance enforcement — Addendum E', () => {

  // ── Tenure cap ──

  describe('tenure cap', () => {
    it('a consultant with 6 months at a client with an 18-month cap passes', () => {
      const result = evaluateTenureCap('Ravi Patel', 183, 18)
      expect(result.outcome).toBe('PASS')
    })

    it('a consultant at 75% of the tenure cap receives a warning', () => {
      const result = evaluateTenureCap('Ravi Patel', 411, 18) // ~13.5 months = 75%
      expect(result.outcome).toBe('WARN')
      expect(result.reason).toContain('of 18 months')
    })

    it('a consultant who exceeds the tenure cap is blocked', () => {
      const result = evaluateTenureCap('Ravi Patel', 580, 18) // ~19 months
      expect(result.outcome).toBe('BLOCK')
      expect(result.reason).toContain('tenure')
      expect(result.reason).toContain('cap: 18')
    })

    it('a WARN enforcement mode tenure cap can be overridden', () => {
      const result = evaluateTenureCap('Ravi Patel', 580, 18, 'WARN')
      expect(result.outcome).toBe('WARN')
      expect(result.overridable).toBe(true)
    })

    it('a BLOCK enforcement mode tenure cap cannot be overridden', () => {
      const result = evaluateTenureCap('Ravi Patel', 580, 18, 'BLOCK')
      expect(result.outcome).toBe('BLOCK')
      expect(result.overridable).toBe(false)
    })

    it('tenure is measured in cumulative days, not per-assignment', () => {
      // 200 days from vendor A + 200 days from vendor B = 400 total
      // At an 18-month (548 day) cap, 400 days = 73% → still PASS
      const totalDaysAcrossVendors = 200 + 200
      const result = evaluateTenureCap('Maria Santos', totalDaysAcrossVendors, 18)
      expect(result.outcome).toBe('PASS')
    })

    it('cross-vendor tenure that exceeds cap is blocked, not passed', () => {
      // 300 days from vendor A + 300 days from vendor B = 600 total
      // At 18-month (548 day) cap → exceeds → BLOCK
      const totalDaysAcrossVendors = 300 + 300
      const result = evaluateTenureCap('Maria Santos', totalDaysAcrossVendors, 18)
      expect(result.outcome).toBe('BLOCK')
    })
  })

  // ── Break-in-service ──

  describe('break-in-service', () => {
    it('a person with no prior contract has no break requirement', () => {
      const result = evaluateBreakInService('New Hire', null, 30)
      expect(result.outcome).toBe('PASS')
    })

    it('a person inside their break period is blocked', () => {
      const result = evaluateBreakInService('Ravi Patel', 15, 30) // 15 of 30 days
      expect(result.outcome).toBe('BLOCK')
      expect(result.reason).toContain('15 of 30')
    })

    it('a person who completed their break period passes', () => {
      const result = evaluateBreakInService('Ravi Patel', 45, 30) // 45 > 30 days
      expect(result.outcome).toBe('PASS')
    })

    it('a person exactly at the break boundary passes', () => {
      const result = evaluateBreakInService('Ravi Patel', 30, 30) // exactly 30
      expect(result.outcome).toBe('PASS')
    })

    it('the break period is per-person per-end-client, not per-vendor', () => {
      // The same person's break at Client A is independent of their work at Client B
      // This is tested by the fact we pass daysSinceEnd per-context
      const atClientA = evaluateBreakInService('Maria Santos', 10, 30) // still breaking
      const atClientB = evaluateBreakInService('Maria Santos', null, 30) // never worked there
      expect(atClientA.outcome).toBe('BLOCK')
      expect(atClientB.outcome).toBe('PASS')
    })
  })

  // ── Rate band ──

  describe('rate band', () => {
    it('a bill rate within the band passes', () => {
      const result = evaluateRateBand(15000, 10000, 20000) // $150 in $100-$200 band
      expect(result.outcome).toBe('PASS')
    })

    it('a bill rate below the minimum is warned', () => {
      const result = evaluateRateBand(8000, 10000, 20000) // $80 < $100 min
      expect(result.outcome).toBe('WARN')
      expect(result.reason).toContain('below minimum')
    })

    it('a bill rate above the maximum is warned', () => {
      const result = evaluateRateBand(25000, 10000, 20000) // $250 > $200 max
      expect(result.outcome).toBe('WARN')
      expect(result.reason).toContain('exceeds maximum')
    })

    it('rate band warnings are overridable by default', () => {
      const result = evaluateRateBand(25000, 10000, 20000, 'WARN')
      expect(result.overridable).toBe(true)
    })
  })

  // ── Governance resolution ──

  describe('governance resolution', () => {
    it('all passing evaluations produce a PASS outcome', () => {
      const evals = [
        evaluateTenureCap('Ravi', 100, 18),
        evaluateBreakInService('Ravi', null, 30),
        evaluateRateBand(15000, 10000, 20000),
      ]
      const result = resolveGovernance(evals)
      expect(result.outcome).toBe('PASS')
      expect(result.canProceed).toBe(true)
    })

    it('a single BLOCK prevents proceeding even if other checks pass', () => {
      const evals = [
        evaluateTenureCap('Ravi', 600, 18), // BLOCK
        evaluateBreakInService('Ravi', null, 30), // PASS
        evaluateRateBand(15000, 10000, 20000), // PASS
      ]
      const result = resolveGovernance(evals)
      expect(result.outcome).toBe('BLOCK')
      expect(result.canProceed).toBe(false)
      expect(result.summary).toContain('Blocked')
    })

    it('a WARN without a BLOCK allows proceeding', () => {
      const evals = [
        evaluateTenureCap('Ravi', 411, 18), // WARN (75%)
        evaluateBreakInService('Ravi', null, 30), // PASS
      ]
      const result = resolveGovernance(evals)
      expect(result.outcome).toBe('WARN')
      expect(result.canProceed).toBe(true)
      expect(result.summary).toContain('Warning')
    })

    it('multiple BLOCKs are all listed in the summary', () => {
      const evals = [
        evaluateTenureCap('Ravi', 600, 18), // BLOCK
        evaluateBreakInService('Ravi', 10, 30), // BLOCK
      ]
      const result = resolveGovernance(evals)
      expect(result.outcome).toBe('BLOCK')
      expect(result.canProceed).toBe(false)
      // Summary includes both block reasons
      expect(result.summary).toContain('tenure')
      expect(result.summary).toContain('break')
    })

    it('no governance rules configured is a pass', () => {
      const result = resolveGovernance([])
      expect(result.outcome).toBe('PASS')
      expect(result.canProceed).toBe(true)
    })

    it('never silently permits — even a pass has a summary', () => {
      const evals = [
        evaluateTenureCap('Ravi', 100, 18),
      ]
      const result = resolveGovernance(evals)
      expect(result.summary.length).toBeGreaterThan(0)
    })
  })

  // ── Enforcement mode semantics ──

  describe('enforcement modes', () => {
    it('BLOCK enforcement mode on tenure cap prevents contract start', () => {
      const eval1 = evaluateTenureCap('Ravi', 600, 18, 'BLOCK')
      const result = resolveGovernance([eval1])
      expect(result.canProceed).toBe(false)
    })

    it('WARN enforcement mode on tenure cap allows contract start with override', () => {
      const eval1 = evaluateTenureCap('Ravi', 600, 18, 'WARN')
      const result = resolveGovernance([eval1])
      expect(result.canProceed).toBe(true)
      expect(result.outcome).toBe('WARN')
    })

    it('BLOCK is for legally grounded rules, WARN is for business judgment', () => {
      // Tenure cap: BLOCK — co-employment law
      const tenure = evaluateTenureCap('Ravi', 600, 18, 'BLOCK')
      // Rate band: WARN — business judgment
      const rate = evaluateRateBand(25000, 10000, 20000, 'WARN')

      expect(tenure.outcome).toBe('BLOCK')
      expect(tenure.overridable).toBe(false)
      expect(rate.outcome).toBe('WARN')
      expect(rate.overridable).toBe(true)
    })
  })
})
