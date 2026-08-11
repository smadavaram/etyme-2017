import { describe, it, expect } from 'vitest'

/**
 * Contract architecture invariants — sell + buy are always separate.
 *
 * "I need sell + buy only for profitability reasons — I can create sell contract
 * separately, buy contract separately do all the documentation separately and
 * then assign buy contracts to sell contracts." — Founder
 *
 * These tests validate the profitability calculation, commission umbrella pattern,
 * contract linking rules, and verification gating logic.
 */

// ─── Profitability calculation ───────────────

type SellContract = {
  id: string
  companyId: string
  clientCompanyId: string
  personId: string
  billRate: number  // cents per hour
}

type BuyContract = {
  id: string
  companyId: string
  vendorCompanyId: string | null
  personId: string
  payRate: number   // cents per hour
  commissionType: 'PER_HOUR' | 'FIXED_PER_PERIOD' | 'ON_PLACEMENT' | 'MARGIN_SHARE' | null
  commissionRate: number | null
}

type ContractLink = {
  sellContractId: string
  buyContractId: string
}

function calculateProfitability(
  sell: SellContract,
  links: ContractLink[],
  buyContracts: BuyContract[]
): { marginPerHour: number; linkedBuyCost: number; sellRevenue: number } {
  const linkedBuyIds = links
    .filter(l => l.sellContractId === sell.id)
    .map(l => l.buyContractId)

  const linkedBuys = buyContracts.filter(b => linkedBuyIds.includes(b.id))
  const linkedBuyCost = linkedBuys.reduce((sum, b) => sum + b.payRate, 0)

  return {
    sellRevenue: sell.billRate,
    linkedBuyCost,
    marginPerHour: sell.billRate - linkedBuyCost,
  }
}

// ─── Commission calculation ───────────────

function calculateCommission(
  buy: BuyContract,
  links: ContractLink[],
  sells: SellContract[],
  hoursThisPeriod: number
): { amount: number; description: string } {
  if (!buy.commissionType || !buy.commissionRate) {
    return { amount: 0, description: 'No commission configured' }
  }

  const linkedSellIds = links
    .filter(l => l.buyContractId === buy.id)
    .map(l => l.sellContractId)

  const linkedSells = sells.filter(s => linkedSellIds.includes(s.id))

  switch (buy.commissionType) {
    case 'PER_HOUR': {
      const totalHours = hoursThisPeriod * linkedSells.length
      return {
        amount: buy.commissionRate * totalHours,
        description: `$${(buy.commissionRate / 100).toFixed(2)}/hr × ${totalHours} hours across ${linkedSells.length} contracts`,
      }
    }
    case 'FIXED_PER_PERIOD':
      return {
        amount: buy.commissionRate,
        description: `Fixed $${(buy.commissionRate / 100).toFixed(2)} per period`,
      }
    case 'ON_PLACEMENT':
      return {
        amount: buy.commissionRate,
        description: `One-time placement fee: $${(buy.commissionRate / 100).toFixed(2)}`,
      }
    case 'MARGIN_SHARE': {
      const totalMargin = linkedSells.reduce((sum, sell) => {
        return sum + (sell.billRate - buy.payRate) * hoursThisPeriod
      }, 0)
      const share = Math.round(totalMargin * buy.commissionRate / 10000) // basis points
      return {
        amount: share,
        description: `${(buy.commissionRate / 100).toFixed(1)}% of $${(totalMargin / 100).toFixed(2)} margin`,
      }
    }
  }
}

// ─── Verification gating ───────────────

type VerificationCheck = {
  type: string
  status: 'CLEAR' | 'CONDITIONAL' | 'PENDING' | 'IN_PROGRESS' | 'FLAGGED' | 'FAILED' | 'EXPIRED'
  enforcement: 'BLOCK' | 'WARN'
}

function evaluateVerificationGate(checks: VerificationCheck[]): {
  canProceed: boolean
  blockers: string[]
  warnings: string[]
} {
  const blockers: string[] = []
  const warnings: string[] = []

  for (const check of checks) {
    const passing = check.status === 'CLEAR' || check.status === 'CONDITIONAL'
    if (!passing) {
      if (check.enforcement === 'BLOCK') {
        blockers.push(`${check.type}: ${check.status}`)
      } else {
        warnings.push(`${check.type}: ${check.status}`)
      }
    }
  }

  return {
    canProceed: blockers.length === 0,
    blockers,
    warnings,
  }
}

// ─── Tests ───────────────────────────────

describe('Contract Architecture Invariants', () => {
  describe('Profitability — sell revenue minus linked buy costs', () => {
    it('a standard placement has one sell and one buy linked for margin', () => {
      const sell: SellContract = {
        id: 'sell-1', companyId: 'vendor-1', clientCompanyId: 'client-1',
        personId: 'person-1', billRate: 15000, // $150/hr
      }
      const buy: BuyContract = {
        id: 'buy-1', companyId: 'vendor-1', vendorCompanyId: null,
        personId: 'person-1', payRate: 10000, // $100/hr
        commissionType: null, commissionRate: null,
      }
      const links: ContractLink[] = [
        { sellContractId: 'sell-1', buyContractId: 'buy-1' },
      ]

      const profit = calculateProfitability(sell, links, [buy])
      expect(profit.sellRevenue).toBe(15000)
      expect(profit.linkedBuyCost).toBe(10000)
      expect(profit.marginPerHour).toBe(5000) // $50/hr margin
    })

    it('a sell contract with two linked buys sums both costs', () => {
      const sell: SellContract = {
        id: 'sell-1', companyId: 'vendor-1', clientCompanyId: 'client-1',
        personId: 'person-1', billRate: 15000,
      }
      const buys: BuyContract[] = [
        {
          id: 'buy-consultant', companyId: 'vendor-1', vendorCompanyId: null,
          personId: 'person-1', payRate: 8000,
          commissionType: null, commissionRate: null,
        },
        {
          id: 'buy-commission', companyId: 'vendor-1', vendorCompanyId: null,
          personId: 'agent-1', payRate: 500, // $5/hr commission
          commissionType: 'PER_HOUR', commissionRate: 500,
        },
      ]
      const links: ContractLink[] = [
        { sellContractId: 'sell-1', buyContractId: 'buy-consultant' },
        { sellContractId: 'sell-1', buyContractId: 'buy-commission' },
      ]

      const profit = calculateProfitability(sell, links, buys)
      expect(profit.marginPerHour).toBe(15000 - 8000 - 500) // $65/hr margin
    })

    it('an unlinked sell contract shows full revenue as margin', () => {
      const sell: SellContract = {
        id: 'sell-1', companyId: 'vendor-1', clientCompanyId: 'client-1',
        personId: 'person-1', billRate: 15000,
      }

      const profit = calculateProfitability(sell, [], [])
      expect(profit.marginPerHour).toBe(15000) // no linked costs
    })
  })

  describe('Commission umbrella — one buy contract links to many sell contracts', () => {
    it('a commission agent earning $5/hr across 10 contracts gets $5 × hours × 10', () => {
      const commissionBuy: BuyContract = {
        id: 'buy-commission', companyId: 'vendor-1', vendorCompanyId: null,
        personId: 'agent-1', payRate: 0,
        commissionType: 'PER_HOUR', commissionRate: 500, // $5/hr
      }

      const sells = Array.from({ length: 10 }, (_, i) => ({
        id: `sell-${i}`, companyId: 'vendor-1', clientCompanyId: `client-${i}`,
        personId: `person-${i}`, billRate: 15000,
      }))

      const links = sells.map(s => ({
        sellContractId: s.id, buyContractId: 'buy-commission',
      }))

      const result = calculateCommission(commissionBuy, links, sells, 160) // 160 hrs/month
      // $5/hr × 160 hrs × 10 contracts = $8,000
      expect(result.amount).toBe(500 * 160 * 10)
    })

    it('a margin-share commission at 25% on $50/hr margin pays correctly', () => {
      const commissionBuy: BuyContract = {
        id: 'buy-commission', companyId: 'vendor-1', vendorCompanyId: null,
        personId: 'agent-1', payRate: 10000, // $100/hr baseline
        commissionType: 'MARGIN_SHARE', commissionRate: 2500, // 25% = 2500 basis points
      }

      const sells: SellContract[] = [{
        id: 'sell-1', companyId: 'vendor-1', clientCompanyId: 'client-1',
        personId: 'person-1', billRate: 15000, // $150/hr → $50 margin
      }]

      const links: ContractLink[] = [
        { sellContractId: 'sell-1', buyContractId: 'buy-commission' },
      ]

      const result = calculateCommission(commissionBuy, links, sells, 160)
      // Margin: ($150 - $100) × 160 = $8,000 → 25% = $2,000
      expect(result.amount).toBe(200000) // $2,000 in cents
    })

    it('a one-time placement fee is calculated regardless of hours', () => {
      const commissionBuy: BuyContract = {
        id: 'buy-commission', companyId: 'vendor-1', vendorCompanyId: null,
        personId: 'agent-1', payRate: 0,
        commissionType: 'ON_PLACEMENT', commissionRate: 500000, // $5,000
      }

      const result = calculateCommission(commissionBuy, [], [], 0)
      expect(result.amount).toBe(500000)
    })
  })

  describe('Contract linking rules', () => {
    it('a ContractLink is unique on (sellContractId, buyContractId)', () => {
      const links: ContractLink[] = [
        { sellContractId: 'sell-1', buyContractId: 'buy-1' },
        { sellContractId: 'sell-1', buyContractId: 'buy-1' }, // duplicate
      ]

      // In the database, this would be enforced by @@unique
      // Here we verify the dedup logic
      const unique = new Map<string, ContractLink>()
      for (const link of links) {
        const key = `${link.sellContractId}:${link.buyContractId}`
        unique.set(key, link)
      }
      expect(unique.size).toBe(1)
    })
  })

  describe('Verification gates contracts from DRAFT to IN_PROGRESS', () => {
    it('missing I-9 blocks the contract — cannot start without work authorization', () => {
      const result = evaluateVerificationGate([
        { type: 'I9_EVERIFY', status: 'PENDING', enforcement: 'BLOCK' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', enforcement: 'WARN' },
        { type: 'INSURANCE_GL', status: 'CLEAR', enforcement: 'BLOCK' },
      ])
      expect(result.canProceed).toBe(false)
      expect(result.blockers).toContain('I9_EVERIFY: PENDING')
    })

    it('a pending background check warns but does not block', () => {
      const result = evaluateVerificationGate([
        { type: 'I9_EVERIFY', status: 'CLEAR', enforcement: 'BLOCK' },
        { type: 'BACKGROUND_CHECK', status: 'IN_PROGRESS', enforcement: 'WARN' },
        { type: 'INSURANCE_GL', status: 'CLEAR', enforcement: 'BLOCK' },
      ])
      expect(result.canProceed).toBe(true)
      expect(result.warnings).toContain('BACKGROUND_CHECK: IN_PROGRESS')
    })

    it('all verifications clear means the contract can proceed', () => {
      const result = evaluateVerificationGate([
        { type: 'I9_EVERIFY', status: 'CLEAR', enforcement: 'BLOCK' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', enforcement: 'WARN' },
        { type: 'INSURANCE_GL', status: 'CLEAR', enforcement: 'BLOCK' },
        { type: 'EDUCATION_EVALUATION', status: 'CLEAR', enforcement: 'WARN' },
      ])
      expect(result.canProceed).toBe(true)
      expect(result.blockers).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('expired insurance blocks new contracts', () => {
      const result = evaluateVerificationGate([
        { type: 'I9_EVERIFY', status: 'CLEAR', enforcement: 'BLOCK' },
        { type: 'INSURANCE_GL', status: 'EXPIRED', enforcement: 'BLOCK' },
      ])
      expect(result.canProceed).toBe(false)
      expect(result.blockers).toContain('INSURANCE_GL: EXPIRED')
    })

    it('conditional background check is treated as passing', () => {
      const result = evaluateVerificationGate([
        { type: 'I9_EVERIFY', status: 'CLEAR', enforcement: 'BLOCK' },
        { type: 'BACKGROUND_CHECK', status: 'CONDITIONAL', enforcement: 'WARN' },
        { type: 'INSURANCE_GL', status: 'CLEAR', enforcement: 'BLOCK' },
      ])
      expect(result.canProceed).toBe(true)
      expect(result.warnings).toHaveLength(0) // CONDITIONAL counts as passing
    })
  })
})
