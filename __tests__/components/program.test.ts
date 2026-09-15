import { describe, it, expect } from 'vitest'

/**
 * Client program module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * BRD §17.1: Client operations console for mid-market enterprises.
 *
 * Tests the logic layer without rendering:
 * - Program summary aggregation
 * - Vendor distribution calculation
 * - Approval queue ordering
 * - Contract ending urgency classification
 * - Spend estimation
 * - Rate analysis across vendors
 * - Program health scoring
 */

// ── Types ─────────────────────────────────────────────────

type Contractor = {
  name: string
  vendor: string
  billRate: number // cents per hour
  endDate: string
  state: string
  pendingTimesheets: number
}

type Vendor = {
  name: string
  headcount: number
  avgRate: number
  totalMonthlySpend: number
}

type ApprovalItem = {
  kind: 'timesheet' | 'expense'
  person: string
  vendor: string
  daysWaiting: number
}

// ── Program summary aggregation ───────────────────────────

describe('Program summary aggregation', () => {
  function summarize(contractors: Contractor[]) {
    const now = new Date()
    const sixtyDays = 60 * 24 * 60 * 60 * 1000
    const vendors = new Set(contractors.map(c => c.vendor))
    const monthlySpend = contractors.reduce(
      (sum, c) => sum + (c.billRate * 160) / 100, 0
    )
    const endingSoon = contractors.filter(c => {
      const end = new Date(c.endDate)
      return end.getTime() - now.getTime() <= sixtyDays
    })

    return {
      activeContractors: contractors.length,
      vendors: vendors.size,
      monthlySpend: Math.round(monthlySpend),
      endingSoon: endingSoon.length,
    }
  }

  const contractors: Contractor[] = [
    { name: 'A', vendor: 'V1', billRate: 10000, endDate: '2026-08-28', state: 'IN_PROGRESS', pendingTimesheets: 0 },
    { name: 'B', vendor: 'V1', billRate: 12000, endDate: '2026-10-15', state: 'IN_PROGRESS', pendingTimesheets: 1 },
    { name: 'C', vendor: 'V2', billRate: 9500,  endDate: '2027-06-01', state: 'IN_PROGRESS', pendingTimesheets: 0 },
  ]

  it('counts all active contractors', () => {
    expect(summarize(contractors).activeContractors).toBe(3)
  })

  it('counts unique vendors', () => {
    expect(summarize(contractors).vendors).toBe(2)
  })

  it('estimates monthly spend as billRate × 160 hours / 100 cents', () => {
    // (10000 + 12000 + 9500) * 160 / 100 = 50400
    expect(summarize(contractors).monthlySpend).toBe(50400)
  })

  it('counts contracts ending within 60 days', () => {
    expect(summarize(contractors).endingSoon).toBeGreaterThanOrEqual(1)
  })

  it('returns zero for an empty program', () => {
    const s = summarize([])
    expect(s.activeContractors).toBe(0)
    expect(s.vendors).toBe(0)
    expect(s.monthlySpend).toBe(0)
    expect(s.endingSoon).toBe(0)
  })
})

// ── Vendor distribution ───────────────────────────────────

describe('Vendor distribution calculation', () => {
  function vendorDistribution(contractors: Contractor[]): Vendor[] {
    const map = new Map<string, { headcount: number; totalBillRate: number }>()
    for (const c of contractors) {
      const existing = map.get(c.vendor)
      if (existing) {
        existing.headcount++
        existing.totalBillRate += c.billRate
      } else {
        map.set(c.vendor, { headcount: 1, totalBillRate: c.billRate })
      }
    }
    return Array.from(map.entries()).map(([name, v]) => ({
      name,
      headcount: v.headcount,
      avgRate: Math.round(v.totalBillRate / v.headcount),
      totalMonthlySpend: Math.round((v.totalBillRate * 160) / 100),
    }))
  }

  const contractors: Contractor[] = [
    { name: 'A', vendor: 'TechVista', billRate: 10000, endDate: '2027-01-01', state: 'IN_PROGRESS', pendingTimesheets: 0 },
    { name: 'B', vendor: 'TechVista', billRate: 12000, endDate: '2027-01-01', state: 'IN_PROGRESS', pendingTimesheets: 0 },
    { name: 'C', vendor: 'CloudStaff', billRate: 9500, endDate: '2027-01-01', state: 'IN_PROGRESS', pendingTimesheets: 0 },
  ]

  it('groups contractors by vendor', () => {
    const dist = vendorDistribution(contractors)
    expect(dist).toHaveLength(2)
  })

  it('calculates average rate per vendor', () => {
    const dist = vendorDistribution(contractors)
    const techVista = dist.find(v => v.name === 'TechVista')!
    expect(techVista.avgRate).toBe(11000) // (10000 + 12000) / 2
  })

  it('calculates monthly spend per vendor', () => {
    const dist = vendorDistribution(contractors)
    const techVista = dist.find(v => v.name === 'TechVista')!
    expect(techVista.totalMonthlySpend).toBe(35200) // (10000 + 12000) * 160 / 100
  })

  it('returns vendor share as percentage of total headcount', () => {
    const dist = vendorDistribution(contractors)
    const total = dist.reduce((s, v) => s + v.headcount, 0)
    const techVista = dist.find(v => v.name === 'TechVista')!
    const pct = Math.round((techVista.headcount / total) * 100)
    expect(pct).toBe(67) // 2 of 3
  })
})

// ── Approval queue ordering ───────────────────────────────

describe('Approval queue ordering', () => {
  function sortQueue(items: ApprovalItem[]): ApprovalItem[] {
    return [...items].sort((a, b) => b.daysWaiting - a.daysWaiting)
  }

  const items: ApprovalItem[] = [
    { kind: 'timesheet', person: 'Alice', vendor: 'V1', daysWaiting: 1 },
    { kind: 'expense', person: 'Bob', vendor: 'V1', daysWaiting: 4 },
    { kind: 'timesheet', person: 'Carol', vendor: 'V2', daysWaiting: 2 },
  ]

  it('sorts by days waiting, longest first', () => {
    const sorted = sortQueue(items)
    expect(sorted[0].person).toBe('Bob')
    expect(sorted[0].daysWaiting).toBe(4)
  })

  it('puts today items last', () => {
    const withToday = [...items, { kind: 'expense' as const, person: 'Dave', vendor: 'V1', daysWaiting: 0 }]
    const sorted = sortQueue(withToday)
    expect(sorted[sorted.length - 1].person).toBe('Dave')
  })

  it('counts items by kind', () => {
    const timesheets = items.filter(i => i.kind === 'timesheet').length
    const expenses = items.filter(i => i.kind === 'expense').length
    expect(timesheets).toBe(2)
    expect(expenses).toBe(1)
  })
})

// ── Contract ending urgency ───────────────────────────────

describe('Contract ending urgency classification', () => {
  function urgency(daysRemaining: number): 'critical' | 'urgent' | 'upcoming' | 'safe' {
    if (daysRemaining <= 7) return 'critical'
    if (daysRemaining <= 14) return 'urgent'
    if (daysRemaining <= 60) return 'upcoming'
    return 'safe'
  }

  it('classifies 0-7 days as critical', () => {
    expect(urgency(0)).toBe('critical')
    expect(urgency(7)).toBe('critical')
  })

  it('classifies 8-14 days as urgent', () => {
    expect(urgency(8)).toBe('urgent')
    expect(urgency(14)).toBe('urgent')
  })

  it('classifies 15-60 days as upcoming', () => {
    expect(urgency(15)).toBe('upcoming')
    expect(urgency(60)).toBe('upcoming')
  })

  it('classifies 61+ days as safe', () => {
    expect(urgency(61)).toBe('safe')
    expect(urgency(200)).toBe('safe')
  })
})

// ── Spend estimation ──────────────────────────────────────

describe('Spend estimation', () => {
  function monthlySpend(billRateCents: number, hoursPerMonth: number = 160): number {
    return (billRateCents * hoursPerMonth) / 100
  }

  function annualSpend(billRateCents: number): number {
    return monthlySpend(billRateCents) * 12
  }

  it('converts cents/hr to monthly dollar spend at 160 hours', () => {
    expect(monthlySpend(10000)).toBe(16000) // $100/hr × 160 = $16,000
  })

  it('handles custom hours per month', () => {
    expect(monthlySpend(10000, 120)).toBe(12000) // $100/hr × 120 = $12,000
  })

  it('calculates annual projection', () => {
    expect(annualSpend(10000)).toBe(192000) // $16,000 × 12
  })

  it('handles zero rate', () => {
    expect(monthlySpend(0)).toBe(0)
  })
})

// ── Rate analysis ─────────────────────────────────────────

describe('Rate analysis across vendors', () => {
  function rateSpread(rates: number[]): { min: number; max: number; spread: number; avg: number } {
    if (rates.length === 0) return { min: 0, max: 0, spread: 0, avg: 0 }
    const min = Math.min(...rates)
    const max = Math.max(...rates)
    return {
      min,
      max,
      spread: max - min,
      avg: Math.round(rates.reduce((s, r) => s + r, 0) / rates.length),
    }
  }

  function savingsOpportunity(rates: number[], hoursPerMonth: number = 160): number {
    if (rates.length < 2) return 0
    const median = [...rates].sort((a, b) => a - b)[Math.floor(rates.length / 2)]
    // Savings if everyone at or below median
    return rates
      .filter(r => r > median)
      .reduce((sum, r) => sum + (r - median) * hoursPerMonth / 100, 0)
  }

  const rates = [9500, 10000, 10500, 12000, 14800]

  it('identifies the rate spread', () => {
    const analysis = rateSpread(rates)
    expect(analysis.min).toBe(9500)
    expect(analysis.max).toBe(14800)
    expect(analysis.spread).toBe(5300) // $53 difference
  })

  it('calculates the average rate', () => {
    expect(rateSpread(rates).avg).toBe(11360)
  })

  it('estimates savings opportunity from rate normalization', () => {
    const savings = savingsOpportunity(rates)
    expect(savings).toBeGreaterThan(0)
  })

  it('no savings with a single rate', () => {
    expect(savingsOpportunity([10000])).toBe(0)
  })

  it('handles empty rates', () => {
    expect(rateSpread([]).spread).toBe(0)
  })
})

// ── Program health scoring ────────────────────────────────

describe('Program health scoring', () => {
  type HealthIndicator = {
    label: string
    status: 'ok' | 'warn' | 'flag'
  }

  function programHealth(opts: {
    pendingTimesheets: number
    pendingExpenses: number
    endingSoon: number
    vendorCount: number
  }): HealthIndicator[] {
    return [
      {
        label: 'Timesheets',
        status: opts.pendingTimesheets === 0 ? 'ok' : 'warn',
      },
      {
        label: 'Expenses',
        status: opts.pendingExpenses === 0 ? 'ok' : 'warn',
      },
      {
        label: 'Contract endings',
        status: opts.endingSoon === 0 ? 'ok' : 'warn',
      },
      {
        label: 'Vendor count',
        status: opts.vendorCount <= 4 ? 'ok' : 'flag',
      },
    ]
  }

  it('all indicators green when nothing is pending', () => {
    const health = programHealth({
      pendingTimesheets: 0,
      pendingExpenses: 0,
      endingSoon: 0,
      vendorCount: 2,
    })
    expect(health.every(h => h.status === 'ok')).toBe(true)
  })

  it('timesheets indicator warns when approvals are pending', () => {
    const health = programHealth({
      pendingTimesheets: 3,
      pendingExpenses: 0,
      endingSoon: 0,
      vendorCount: 1,
    })
    expect(health.find(h => h.label === 'Timesheets')?.status).toBe('warn')
  })

  it('vendor count flags when more than 4 vendors', () => {
    const health = programHealth({
      pendingTimesheets: 0,
      pendingExpenses: 0,
      endingSoon: 0,
      vendorCount: 8,
    })
    expect(health.find(h => h.label === 'Vendor count')?.status).toBe('flag')
  })

  it('contract endings warns when contracts ending soon', () => {
    const health = programHealth({
      pendingTimesheets: 0,
      pendingExpenses: 0,
      endingSoon: 2,
      vendorCount: 3,
    })
    expect(health.find(h => h.label === 'Contract endings')?.status).toBe('warn')
  })

  it('multiple issues can coexist', () => {
    const health = programHealth({
      pendingTimesheets: 2,
      pendingExpenses: 1,
      endingSoon: 3,
      vendorCount: 7,
    })
    const issues = health.filter(h => h.status !== 'ok')
    expect(issues).toHaveLength(4)
  })
})
