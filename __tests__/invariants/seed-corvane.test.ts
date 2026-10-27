import { describe, it, expect, beforeAll } from 'vitest'
import {
  CORVANE_PLANTS, CORVANE_REGIONS, CORVANE_SUPPLIERS, CORVANE_COUNTRIES, CORVANE_RECEIPTS, CORVANE_TIME_LIMIT_MONTHS,
  corvaneContractors, plantSuppliers, billRateMinor, corvaneSteps, contractorName,
} from '@/lib/seed-corvane'
import { anchorSeed, day } from '@/lib/seed-days'
import { limitReachedOn } from '@/lib/tenure-days'
import { worldStepNames, WORLD_SLUGS } from '@/lib/seed-world'
import { DESK_ROLES } from '@/lib/demo-desks'

/**
 * Corvane Packaging is the region map as data (founder, 2026-10-27).
 * Every figure the drawing shows is a row here, so these hold the plan
 * to the drawing before anything is written.
 */

beforeAll(() => anchorSeed(new Date(Date.UTC(2026, 9, 27))))

describe('Corvane Packaging is the drawing, plant for plant', () => {
  it('has 31 plants in eight countries, grouped in six regions, each with a time zone', () => {
    expect(CORVANE_PLANTS).toHaveLength(31)
    expect(new Set(CORVANE_PLANTS.map((p) => p.cc)).size).toBe(8)
    expect(CORVANE_REGIONS.map((r) => r.label)).toEqual(['United States', 'Latin America', 'Vietnam', 'India', 'Belgium', 'Northern Ireland'])
    const count = (k: string) => CORVANE_PLANTS.filter((p) => p.region === k).length
    expect([count('us'), count('latam'), count('vn'), count('in'), count('be'), count('ni')]).toEqual([6, 6, 5, 6, 4, 4])
    for (const p of CORVANE_PLANTS) expect(p.timeZone, p.plant).toMatch(/^[A-Z][a-z]+\/[A-Za-z_]+$/)
  })

  it('every plant has a hiring manager of its own, and each region a manager of its own', () => {
    expect(new Set(CORVANE_PLANTS.map((p) => p.manager)).size).toBe(31)
    expect(new Set(CORVANE_REGIONS.map((r) => r.lead)).size).toBe(6)
  })

  it('each plant has the drawing’s count of contractors on site, and one start is on hold at Dayton', () => {
    const { onSite, onHold } = corvaneContractors()
    for (const p of CORVANE_PLANTS) {
      expect(onSite.filter((c) => c.plant.key === p.key).length, p.plant).toBe(p.contractors)
    }
    expect(onSite).toHaveLength(CORVANE_PLANTS.reduce((n, p) => n + p.contractors, 0))
    expect(onHold.plant.key).toBe('dayton')
    expect(onHold.state).toBe('DRAFT')
    expect(onHold.startedDaysAgo).toBeLessThan(0)
  })

  it('no two contractors in one country share a name, and the first plant reads the drawing’s own names', () => {
    const { onSite, onHold } = corvaneContractors()
    for (const cc of Object.keys(CORVANE_COUNTRIES)) {
      const names = [...onSite, onHold].filter((c) => c.plant.cc === cc).map((c) => c.name)
      expect(new Set(names).size, cc).toBe(names.length)
    }
    expect(onSite.slice(0, 3).map((c) => c.name)).toEqual(['Tyler Brooks', 'Keisha Monroe', 'Brandon Lee'])
    expect(contractorName('VN', 0)).toBe('Nguyễn Văn An')
  })

  it('a plant’s suppliers are as many as the drawing says, all from its own country', () => {
    const { onSite } = corvaneContractors()
    for (const p of CORVANE_PLANTS) {
      const sups = plantSuppliers(p)
      expect(sups.length, p.plant).toBe(p.suppliers)
      expect(new Set(sups).size).toBe(sups.length)
      for (const s of sups) expect(CORVANE_SUPPLIERS[p.cc].map((x) => x.name)).toContain(s)
      for (const c of onSite.filter((c) => c.plant.key === p.key)) expect(sups).toContain(c.supplier)
    }
  })

  it(`each plant's nearest time limit is the drawing's day count against ${CORVANE_TIME_LIMIT_MONTHS} months, by the block's own arithmetic`, () => {
    const { onSite } = corvaneContractors()
    for (const p of CORVANE_PLANTS) {
      const here = onSite.filter((c) => c.plant.key === p.key)
      const reach = (c: (typeof here)[number]) =>
        limitReachedOn([{ startDate: day(-c.startedDaysAgo), endDate: null }], CORVANE_TIME_LIMIT_MONTHS)!.getTime()
      const nearest = here.filter((c) => c.nearest)
      expect(nearest, p.plant).toHaveLength(1)
      expect(reach(nearest[0]), p.plant).toBe(day(p.nearestLimitDays).getTime())
      for (const c of here.filter((c) => !c.nearest)) expect(reach(c), `${p.plant}: ${c.name}`).toBeGreaterThan(day(p.nearestLimitDays).getTime())
    }
  })

  it('no line runs past its person’s time limit', () => {
    const { onSite } = corvaneContractors()
    for (const c of onSite) {
      const reach = limitReachedOn([{ startDate: day(-c.startedDaysAgo), endDate: null }], CORVANE_TIME_LIMIT_MONTHS)!
      expect(day(c.endsInDays).getTime(), c.name).toBeLessThanOrEqual(reach.getTime())
    }
  })

  it('rates are in the site’s own currency and its own minor units, and nothing is converted', () => {
    expect(billRateMinor('US')).toBe(2800)
    expect(billRateMinor('VN')).toBe(75000) // the dong has no minor unit
    expect(billRateMinor('CO')).toBe(3200000)
    expect(CORVANE_COUNTRIES.NI.currency).toBe('GBP')
    expect(CORVANE_COUNTRIES.NI.iso).toBe('GB')
  })

  it('Dayton holds one invoice receipt over the accepted hours, and every region one clean receipt', () => {
    const held = CORVANE_RECEIPTS.filter((r) => r.held)
    expect(held).toEqual([{ plant: 'dayton', week: 2, billed: 41.5, accepted: 40, held: true }])
    const clean = CORVANE_RECEIPTS.filter((r) => !r.held)
    const regions = clean.map((r) => CORVANE_PLANTS.find((p) => p.key === r.plant)!.region)
    expect(new Set(regions).size).toBe(6)
    for (const r of clean) expect(r.billed).toBe(r.accepted)
  })

  it('a plant never has more weeks to sign than people to file them', () => {
    for (const p of CORVANE_PLANTS) expect(p.weeksToSign, p.plant).toBeLessThanOrEqual(p.contractors)
  })
})

describe('Corvane in the world', () => {
  it('runs as steps of its own, after the base world and before the seats and the sweep', () => {
    const names = worldStepNames()
    const at = (n: string) => names.indexOf(n)
    for (const s of corvaneSteps()) expect(at(s), s).toBeGreaterThan(-1)
    expect(at('corvane:frame')).toBeGreaterThan(at('payroll-runs:4-of-4'))
    expect(at(corvaneSteps().at(-1)!)).toBeLessThan(at('own-seats'))
  })

  it('is on the roster the rebuild deletes, with every supplier', () => {
    expect(WORLD_SLUGS).toContain('world-corvane')
    expect(WORLD_SLUGS).toContain('world-cv-ridgeline-staffing')
    expect(WORLD_SLUGS).toContain('world-cv-sao-mai-nhan-luc')
    expect(WORLD_SLUGS.filter((s) => s.startsWith('world-cv-'))).toHaveLength(25)
  })

  it('every Corvane seat opens through the demo door by its role', () => {
    expect(DESK_ROLES.region).toEqual(['Regional Manager'])
    expect(DESK_ROLES.operations).toEqual(['Head of Operations'])
    expect(DESK_ROLES.cfo).toEqual(['Chief Financial Officer'])
  })
})
