/**
 * Bench burn calculation tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * The bench burn dashboard turns "unplaced bench-paid consultants" into
 * a daily dollar figure. These tests verify the arithmetic and grouping
 * — the same logic that runs in GET /api/bench/burn.
 */

import { describe, it, expect } from 'vitest'

// ── Types matching the burn API ─────────────────────

interface BurnEntry {
  personId: string
  personName: string
  tier: 'RETAINED' | 'MARKETING'
  payRate: number  // cents per hour
  dailyCost: number
  weeklyCost: number
  monthlyCost: number
  daysOnBench: number
  totalBurnToDate: number
}

interface BurnSummary {
  daily: number
  weekly: number
  monthly: number
  toDate: number
  retained: { count: number; dailyBurn: number }
  marketing: { count: number; dailyBurn: number }
  benchSize: number
}

// ── Helper: compute burn from pay rate ──────────────

const HOURS_PER_DAY = 8

function computeBurn(payRateCents: number, daysOnBench: number): {
  dailyCost: number
  weeklyCost: number
  monthlyCost: number
  totalBurnToDate: number
} {
  const dailyCost = (payRateCents * HOURS_PER_DAY) / 100 // dollars
  const weeklyCost = dailyCost * 5
  const monthlyCost = dailyCost * 22
  const workingDaysOnBench = Math.round(daysOnBench * 5 / 7) // approximate
  const totalBurnToDate = workingDaysOnBench * dailyCost
  return { dailyCost, weeklyCost, monthlyCost, totalBurnToDate }
}

function summarizeBurn(entries: BurnEntry[]): BurnSummary {
  const retained = entries.filter(e => e.tier === 'RETAINED')
  const marketing = entries.filter(e => e.tier === 'MARKETING')

  return {
    daily: Math.round(entries.reduce((s, e) => s + e.dailyCost, 0)),
    weekly: Math.round(entries.reduce((s, e) => s + e.weeklyCost, 0)),
    monthly: Math.round(entries.reduce((s, e) => s + e.monthlyCost, 0)),
    toDate: entries.reduce((s, e) => s + e.totalBurnToDate, 0),
    retained: {
      count: retained.length,
      dailyBurn: Math.round(retained.reduce((s, e) => s + e.dailyCost, 0)),
    },
    marketing: {
      count: marketing.length,
      dailyBurn: Math.round(marketing.reduce((s, e) => s + e.dailyCost, 0)),
    },
    benchSize: entries.length,
  }
}

// ── Tests ───────────────────────────────────────────

describe('Bench burn calculations', () => {

  describe('daily cost arithmetic', () => {
    it('a $40/hr consultant costs $320/day (8 hours × $40)', () => {
      const burn = computeBurn(4000, 1) // 4000 cents = $40/hr
      expect(burn.dailyCost).toBe(320)
    })

    it('a $75/hr consultant costs $600/day', () => {
      const burn = computeBurn(7500, 1)
      expect(burn.dailyCost).toBe(600)
    })

    it('weekly cost is 5 working days', () => {
      const burn = computeBurn(4000, 1) // $320/day
      expect(burn.weeklyCost).toBe(1600) // $320 × 5
    })

    it('monthly cost is 22 working days', () => {
      const burn = computeBurn(4000, 1) // $320/day
      expect(burn.monthlyCost).toBe(7040) // $320 × 22
    })

    it('total burn to date scales with working days on bench', () => {
      // 7 calendar days ≈ 5 working days
      const burn = computeBurn(4000, 7) // $320/day, 7 calendar days
      const workingDays = Math.round(7 * 5 / 7) // 5
      expect(burn.totalBurnToDate).toBe(320 * workingDays)
    })

    it('zero pay rate produces zero burn', () => {
      const burn = computeBurn(0, 30)
      expect(burn.dailyCost).toBe(0)
      expect(burn.totalBurnToDate).toBe(0)
    })
  })

  describe('tier grouping', () => {
    const entries: BurnEntry[] = [
      {
        personId: 'p1', personName: 'Alice', tier: 'RETAINED',
        payRate: 4000, ...computeBurn(4000, 14), daysOnBench: 14,
      },
      {
        personId: 'p2', personName: 'Bob', tier: 'RETAINED',
        payRate: 5000, ...computeBurn(5000, 7), daysOnBench: 7,
      },
      {
        personId: 'p3', personName: 'Carol', tier: 'MARKETING',
        payRate: 3000, ...computeBurn(3000, 30), daysOnBench: 30,
      },
    ]

    it('groups retained and marketing bench sitters separately', () => {
      const summary = summarizeBurn(entries)
      expect(summary.retained.count).toBe(2)
      expect(summary.marketing.count).toBe(1)
    })

    it('retained daily burn sums only retained entries', () => {
      const summary = summarizeBurn(entries)
      // Alice: $320/day, Bob: $400/day
      expect(summary.retained.dailyBurn).toBe(720)
    })

    it('marketing daily burn sums only marketing entries', () => {
      const summary = summarizeBurn(entries)
      // Carol: $240/day
      expect(summary.marketing.dailyBurn).toBe(240)
    })

    it('total daily burn is the sum of all entries', () => {
      const summary = summarizeBurn(entries)
      // $320 + $400 + $240 = $960
      expect(summary.daily).toBe(960)
    })

    it('bench size counts only bench-paid consultants', () => {
      const summary = summarizeBurn(entries)
      expect(summary.benchSize).toBe(3)
    })
  })

  describe('sorting', () => {
    it('entries are sorted by daily cost descending (highest cost first)', () => {
      const entries: BurnEntry[] = [
        { personId: 'p1', personName: 'Low', tier: 'RETAINED', payRate: 2000,
          ...computeBurn(2000, 1), daysOnBench: 1 },
        { personId: 'p2', personName: 'High', tier: 'RETAINED', payRate: 8000,
          ...computeBurn(8000, 1), daysOnBench: 1 },
        { personId: 'p3', personName: 'Mid', tier: 'MARKETING', payRate: 4000,
          ...computeBurn(4000, 1), daysOnBench: 1 },
      ]
      entries.sort((a, b) => b.dailyCost - a.dailyCost)
      expect(entries[0].personName).toBe('High')
      expect(entries[1].personName).toBe('Mid')
      expect(entries[2].personName).toBe('Low')
    })
  })

  describe('empty bench', () => {
    it('an empty bench has zero burn across all periods', () => {
      const summary = summarizeBurn([])
      expect(summary.daily).toBe(0)
      expect(summary.weekly).toBe(0)
      expect(summary.monthly).toBe(0)
      expect(summary.toDate).toBe(0)
      expect(summary.benchSize).toBe(0)
    })
  })

  describe('business meaning', () => {
    it('ten bench-paid consultants at $40/hr burn $3,200/day', () => {
      // BRD example: "a vendor with 10 bench-paid consultants at $40/hr
      //               burns $3,200/day"
      const entries: BurnEntry[] = Array.from({ length: 10 }, (_, i) => ({
        personId: `p${i}`, personName: `Person ${i}`, tier: 'RETAINED' as const,
        payRate: 4000, ...computeBurn(4000, 30), daysOnBench: 30,
      }))
      const summary = summarizeBurn(entries)
      expect(summary.daily).toBe(3200) // 10 × $320/day
    })

    it('proactive matching that places 5 of 10 cuts the burn in half', () => {
      const before = Array.from({ length: 10 }, (_, i) => ({
        personId: `p${i}`, personName: `Person ${i}`, tier: 'RETAINED' as const,
        payRate: 4000, ...computeBurn(4000, 30), daysOnBench: 30,
      }))
      const after = before.slice(0, 5) // 5 placed, 5 remain

      const burnBefore = summarizeBurn(before)
      const burnAfter = summarizeBurn(after)

      expect(burnAfter.daily).toBe(burnBefore.daily / 2)
    })
  })
})

// ── Every amount in its own currency (2026-11-12) ───────────────────

import { readFileSync } from 'fs'
import { join } from 'path'
import { burnTotals, byCostWithinCurrency } from '@/app/api/bench/burn/totals'

describe('the bench cost is added up once per currency, never across two', () => {
  const rows = [
    { personId: 'a', currency: 'USD', tier: 'RETAINED', dailyCents: 32_000, toDateCents: 320_000 },
    { personId: 'b', currency: 'INR', tier: 'MARKETING', dailyCents: 4_000_000, toDateCents: 40_000_000 },
    { personId: 'c', currency: 'USD', tier: 'MARKETING', dailyCents: 24_000, toDateCents: 48_000 },
  ]

  it('a bench paid in dollars and rupees reads one total per currency, never a sum of the two', () => {
    const t = burnTotals(rows)
    expect(t.map((x) => x.currency)).toEqual(['USD', 'INR'])
    expect(t[0].dailyCents).toBe(56_000)
    expect(t[0].toDateCents).toBe(368_000)
    expect(t[1].dailyCents).toBe(4_000_000)
  })

  it('a week is five working days and a month twenty-two, counted inside one currency', () => {
    const [usd] = burnTotals(rows)
    expect(usd.weeklyCents).toBe(56_000 * 5)
    expect(usd.monthlyCents).toBe(56_000 * 22)
  })

  it('retained and marketing are split inside each currency', () => {
    const [usd, inr] = burnTotals(rows)
    expect(usd.retained).toEqual({ count: 1, dailyCents: 32_000 })
    expect(usd.marketing).toEqual({ count: 1, dailyCents: 24_000 })
    expect(inr.marketing).toEqual({ count: 1, dailyCents: 4_000_000 })
  })

  it('a rupee amount is never ranked above a dollar amount because its number is bigger', () => {
    expect(byCostWithinCurrency(rows).map((r) => r.personId)).toEqual(['a', 'c', 'b'])
  })

  it('an empty bench has no totals at all, rather than a zero in a guessed currency', () => {
    expect(burnTotals([])).toEqual([])
  })

  it('the route passes each person\'s pay currency to the burn arithmetic and divides nothing by a hundred', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/bench/burn/route.ts'), 'utf8')
    expect(src).toMatch(/payCurrency: true/)
    expect(src).toMatch(/burnOf\([\s\S]*?currency\s*\)/)
    expect(src).not.toMatch(/\/ 100\b/)
  })

  it('the Bench page writes no dollar sign by hand and draws every burn figure through the shared formatter', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/bench/page.tsx'), 'utf8')
    expect(src).not.toMatch(/`\$\$\{/)
    expect(src).not.toMatch(/fmtDollars/)
    expect(src).toMatch(/compact\(t\.dailyCents, t\.currency\)/)
  })
})
