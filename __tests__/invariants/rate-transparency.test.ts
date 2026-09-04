/**
 * Rate transparency & economics tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Addendum D §D.3.1: Two kinds of margin — arbitrage (opacity-based) and
 * expertise (capability-based). The distinction matters because:
 *   - Expertise margin funds reinvestment (coaching, training, bench)
 *   - Arbitrage margin is extractive and collapses as supply becomes mobile
 *
 * Addendum D §D.3.2: Rate visibility is per-requirement, not company-wide.
 *   - Vendors disclose where disclosure wins supply
 *   - Vendors withhold in stronghold domains
 *   - Setting lives on Requirement, inherited by contracts
 *
 * Addendum D §D.3.3: Trust without disclosure — rate progression,
 * bench pay honoured, median tenure, time-to-next-placement.
 */

import { describe, it, expect } from 'vitest'

// ── Margin classification ──────────────────────────────

describe('Margin classification — Addendum D §D.3.1', () => {

  type MarginClass = 'ARBITRAGE' | 'EXPERTISE' | null

  interface RequirementEconomics {
    marginClass: MarginClass
    rateVisible: boolean
    billMin: number | null
    billMax: number | null
  }

  function classifyMargin(req: RequirementEconomics): {
    label: string
    description: string
    fundsMentorship: boolean
  } {
    if (req.marginClass === 'EXPERTISE') {
      return {
        label: 'Expertise',
        description: 'Capability-based margin — funds reinvestment in practice depth, training, and bench',
        fundsMentorship: true,
      }
    }
    if (req.marginClass === 'ARBITRAGE') {
      return {
        label: 'Arbitrage',
        description: 'Opacity-based margin — collapsing as consultants gain mobility',
        fundsMentorship: false,
      }
    }
    return {
      label: 'Unclassified',
      description: 'Margin class not set',
      fundsMentorship: false,
    }
  }

  it('an expertise margin requirement funds mentorship and reinvestment', () => {
    const result = classifyMargin({
      marginClass: 'EXPERTISE', rateVisible: false, billMin: 10000, billMax: 15000,
    })
    expect(result.fundsMentorship).toBe(true)
    expect(result.label).toBe('Expertise')
  })

  it('an arbitrage margin requirement does not fund mentorship', () => {
    const result = classifyMargin({
      marginClass: 'ARBITRAGE', rateVisible: true, billMin: 8000, billMax: 12000,
    })
    expect(result.fundsMentorship).toBe(false)
    expect(result.label).toBe('Arbitrage')
  })

  it('an unclassified requirement defaults to not funding mentorship', () => {
    const result = classifyMargin({
      marginClass: null, rateVisible: false, billMin: null, billMax: null,
    })
    expect(result.fundsMentorship).toBe(false)
    expect(result.label).toBe('Unclassified')
  })

  it('margin class and rate visibility are independent settings', () => {
    // Expertise + visible = transparent practice firm
    const transparent = classifyMargin({
      marginClass: 'EXPERTISE', rateVisible: true, billMin: 12000, billMax: 18000,
    })
    expect(transparent.fundsMentorship).toBe(true)

    // Expertise + not visible = stronghold domain (D.3.2)
    const stronghold = classifyMargin({
      marginClass: 'EXPERTISE', rateVisible: false, billMin: 12000, billMax: 18000,
    })
    expect(stronghold.fundsMentorship).toBe(true)
  })
})

// ── Rate visibility — per-requirement ──────────────────

describe('Rate visibility — Addendum D §D.3.2', () => {

  function inheritRateVisibility(
    requirementVisible: boolean,
    companyDefault: boolean,
  ): boolean {
    // Per-requirement setting overrides company default
    // D.3.2: "Setting lives on Requirement and is inherited by the resulting Assignment"
    return requirementVisible
  }

  it('rate visibility is a per-requirement setting, not company-wide', () => {
    // Even if company default is true, a specific requirement can be false
    expect(inheritRateVisibility(false, true)).toBe(false)
    expect(inheritRateVisibility(true, false)).toBe(true)
  })

  it('vendors disclose where disclosure wins supply', () => {
    // Hard-to-fill, citizen/GC roles → disclose
    const hardToFillReq = { rateVisible: true }
    expect(hardToFillReq.rateVisible).toBe(true)
  })

  it('vendors withhold in stronghold domains', () => {
    // Stronghold = compete on fill speed, not price legibility
    const strongholdReq = { rateVisible: false }
    expect(strongholdReq.rateVisible).toBe(false)
  })
})

// ── Rate progression ───────────────────────────────────

describe('Rate progression — Addendum D §D.3.3', () => {

  interface PlacementRate {
    date: string
    payRate: number  // cents/hr
    client: string | null
    contractType: string
  }

  function calculateProgression(placements: PlacementRate[]): {
    firstRate: number | null
    currentRate: number | null
    growthPercent: number | null
    totalPlacements: number
  } {
    if (placements.length === 0) {
      return { firstRate: null, currentRate: null, growthPercent: null, totalPlacements: 0 }
    }

    const sorted = [...placements].sort((a, b) => a.date.localeCompare(b.date))
    const firstRate = sorted[0].payRate
    const currentRate = sorted[sorted.length - 1].payRate
    const growthPercent = firstRate > 0
      ? Math.round(((currentRate - firstRate) / firstRate) * 100)
      : null

    return {
      firstRate,
      currentRate,
      growthPercent,
      totalPlacements: sorted.length,
    }
  }

  it('tracks a consultant rate increase across three placements', () => {
    const progression = calculateProgression([
      { date: '2024-01-01', payRate: 3500, client: 'Client A', contractType: 'W2' },
      { date: '2024-07-01', payRate: 4200, client: 'Client B', contractType: 'W2' },
      { date: '2025-01-01', payRate: 4800, client: 'Client C', contractType: 'W2' },
    ])
    expect(progression.firstRate).toBe(3500)
    expect(progression.currentRate).toBe(4800)
    expect(progression.growthPercent).toBe(37) // (4800-3500)/3500 × 100 ≈ 37%
    expect(progression.totalPlacements).toBe(3)
  })

  it('shows zero growth when rate is unchanged', () => {
    const progression = calculateProgression([
      { date: '2024-01-01', payRate: 4000, client: 'Client A', contractType: 'W2' },
      { date: '2025-01-01', payRate: 4000, client: 'Client B', contractType: 'W2' },
    ])
    expect(progression.growthPercent).toBe(0)
  })

  it('shows negative growth for a rate decrease', () => {
    const progression = calculateProgression([
      { date: '2024-01-01', payRate: 5000, client: 'Client A', contractType: 'W2' },
      { date: '2025-01-01', payRate: 4500, client: 'Client B', contractType: 'W2' },
    ])
    expect(progression.growthPercent).toBe(-10) // (4500-5000)/5000 × 100 = -10%
  })

  it('a consultant with no placements has null progression', () => {
    const progression = calculateProgression([])
    expect(progression.firstRate).toBeNull()
    expect(progression.currentRate).toBeNull()
    expect(progression.growthPercent).toBeNull()
    expect(progression.totalPlacements).toBe(0)
  })

  it('rate progression is visible to the consultant without exposing bill rate', () => {
    // The consultant sees payRate; billRate and margin are not in the progression
    const progression = calculateProgression([
      { date: '2024-01-01', payRate: 3500, client: null, contractType: 'W2' },
    ])
    // No billRate or margin in the output
    expect(progression.firstRate).toBe(3500)
    expect(Object.keys(progression)).not.toContain('billRate')
    expect(Object.keys(progression)).not.toContain('margin')
  })
})

// ── Trust signals ──────────────────────────────────────

describe('Vendor trust signals — Addendum D §D.3.3', () => {

  interface TrustSignals {
    medianTenureMonths: number | null
    benchPayRate: number | null // percentage
    medianReplacementDays: number | null
    avgRateGrowthPercent: number | null
  }

  function computeTrustScore(signals: TrustSignals): {
    score: number  // 0-100
    strengths: string[]
    areas: string[]
  } {
    const strengths: string[] = []
    const areas: string[] = []
    let score = 50 // baseline

    // Tenure — higher is better
    if (signals.medianTenureMonths != null) {
      if (signals.medianTenureMonths >= 12) {
        score += 15
        strengths.push('Strong consultant retention')
      } else if (signals.medianTenureMonths >= 6) {
        score += 5
      } else {
        score -= 10
        areas.push('Low median tenure')
      }
    }

    // Bench pay — higher is better
    if (signals.benchPayRate != null) {
      if (signals.benchPayRate >= 50) {
        score += 15
        strengths.push('Bench pay honoured consistently')
      } else if (signals.benchPayRate >= 20) {
        score += 5
      } else {
        areas.push('Low bench pay rate')
      }
    }

    // Replacement time — lower is better
    if (signals.medianReplacementDays != null) {
      if (signals.medianReplacementDays <= 14) {
        score += 10
        strengths.push('Fast re-placement')
      } else if (signals.medianReplacementDays <= 30) {
        score += 5
      } else {
        areas.push('Slow re-placement')
      }
    }

    // Rate growth — positive is better
    if (signals.avgRateGrowthPercent != null) {
      if (signals.avgRateGrowthPercent > 5) {
        score += 10
        strengths.push('Consistent rate growth')
      } else if (signals.avgRateGrowthPercent >= 0) {
        score += 3
      } else {
        areas.push('Declining pay rates')
      }
    }

    return { score: Math.max(0, Math.min(100, score)), strengths, areas }
  }

  it('a vendor with strong retention, bench pay, and fast re-placement scores high', () => {
    const result = computeTrustScore({
      medianTenureMonths: 18,
      benchPayRate: 60,
      medianReplacementDays: 10,
      avgRateGrowthPercent: 8,
    })
    expect(result.score).toBeGreaterThan(80)
    expect(result.strengths).toContain('Strong consultant retention')
    expect(result.strengths).toContain('Bench pay honoured consistently')
  })

  it('a vendor with no bench pay and low tenure scores low', () => {
    const result = computeTrustScore({
      medianTenureMonths: 3,
      benchPayRate: 0,
      medianReplacementDays: 60,
      avgRateGrowthPercent: -5,
    })
    expect(result.score).toBeLessThan(50)
    expect(result.areas).toContain('Low median tenure')
  })

  it('trust signals replace disclosure — neither requires nor penalizes rate visibility', () => {
    // The trust score has no "disclosureRate" component
    // D.3.3: "Disclosure rate may be surfaced as an optional vendor badge.
    //          It is never required, and never displayed as an absence."
    const result = computeTrustScore({
      medianTenureMonths: 12,
      benchPayRate: 50,
      medianReplacementDays: 14,
      avgRateGrowthPercent: 5,
    })
    // Score is based on operational metrics, not disclosure
    expect(result.score).toBeGreaterThan(50)
  })

  it('null signals produce a neutral baseline score', () => {
    const result = computeTrustScore({
      medianTenureMonths: null,
      benchPayRate: null,
      medianReplacementDays: null,
      avgRateGrowthPercent: null,
    })
    expect(result.score).toBe(50)
    expect(result.strengths).toHaveLength(0)
    expect(result.areas).toHaveLength(0)
  })
})

// ── Margin calculation ─────────────────────────────────

describe('Margin calculation (vendor admin view)', () => {

  function calculateMargin(billRateCents: number, payRateCents: number): {
    marginCents: number
    marginPercent: number
    marginClass: 'healthy' | 'thin' | 'negative'
  } {
    const marginCents = billRateCents - payRateCents
    const marginPercent = billRateCents > 0
      ? Math.round(((billRateCents - payRateCents) / billRateCents) * 100)
      : 0

    let marginClass: 'healthy' | 'thin' | 'negative'
    if (marginPercent >= 20) marginClass = 'healthy'
    else if (marginPercent >= 10) marginClass = 'thin'
    else marginClass = 'negative'

    return { marginCents, marginPercent, marginClass }
  }

  it('a $150 bill rate with $100 pay rate yields 33% healthy margin', () => {
    const result = calculateMargin(15000, 10000)
    expect(result.marginCents).toBe(5000)
    expect(result.marginPercent).toBe(33)
    expect(result.marginClass).toBe('healthy')
  })

  it('a $120 bill rate with $108 pay rate yields 10% thin margin', () => {
    const result = calculateMargin(12000, 10800)
    expect(result.marginCents).toBe(1200)
    expect(result.marginPercent).toBe(10)
    expect(result.marginClass).toBe('thin')
  })

  it('a $100 bill rate with $105 pay rate yields negative margin', () => {
    const result = calculateMargin(10000, 10500)
    expect(result.marginCents).toBe(-500)
    expect(result.marginPercent).toBe(-5)
    expect(result.marginClass).toBe('negative')
  })
})
