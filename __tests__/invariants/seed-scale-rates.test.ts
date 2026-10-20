/**
 * The generated world's rates (etyme-money): the pure half that supply,
 * demand and regulatory import, and the rows money writes from a frame.
 * docs/seed-scale-brief.md sections 3.2 and 5.2; CLAUDE.md, "Nine
 * decisions for the generated world" (2026-10-20).
 */

import { describe, it, expect } from 'vitest'
import type { IndustryKey, RoleTemplate } from '@/lib/seed-scale/types'
import {
  bandFor, chainFor, chainOf, pairFor, pricedLine, seenBy, listingRate, floorFor, marginClassFor,
  MAX_RUNGS, W2_BURDEN, DEFAULT_FLOOR_PCT, FEDERAL_MINIMUM_WAGE_CENTS,
} from '@/lib/seed-scale/rates'

const role = (title: string, seniority: RoleTemplate['seniority'], licensed = false): RoleTemplate => ({
  title, skills: ['Placeholder'], seniority, licensed,
})

/** A spread of roles in every industry, the way the vocabulary will carry them. */
const ROLES: [IndustryKey, RoleTemplate][] = [
  ['IT', role('Junior QA analyst', 'JUNIOR')],
  ['IT', role('Java developer', 'MID')],
  ['IT', role('Cloud solutions architect', 'SENIOR')],
  ['HEALTHCARE', role('Certified nursing assistant', 'JUNIOR', true)],
  ['HEALTHCARE', role('Travel nurse', 'MID', true)],
  ['HEALTHCARE', role('Nurse practitioner', 'SENIOR', true)],
  ['MANUFACTURING', role('Machine operator', 'JUNIOR')],
  ['MANUFACTURING', role('CNC programmer', 'MID')],
  ['MANUFACTURING', role('Validation engineer', 'SENIOR')],
  ['FINANCE', role('Accounts payable clerk', 'JUNIOR')],
  ['FINANCE', role('Treasury analyst', 'MID')],
  ['FINANCE', role('Controller', 'SENIOR')],
]

/** Two hundred people, spread over every role. */
const PEOPLE = Array.from({ length: 200 }, (_, i) => {
  const [industry, r] = ROLES[i % ROLES.length]
  return { id: `sx-person-${String(i).padStart(4, '0')}`, role: r, industry }
})

const dollars = (cents: number) => cents / 100

describe('the generated world’s rates: bands', () => {
  it('a Java developer, a travel nurse, a validation engineer, a CNC programmer and a treasury analyst each get a band a US client would recognize', () => {
    const at = (i: IndustryKey, r: RoleTemplate) => bandFor(r, i)
    const java = at('IT', role('Java developer', 'MID'))
    const nurse = at('HEALTHCARE', role('Travel nurse', 'MID', true))
    const validation = at('MANUFACTURING', role('Validation engineer', 'SENIOR'))
    const cnc = at('MANUFACTURING', role('CNC programmer', 'MID'))
    const treasury = at('FINANCE', role('Treasury analyst', 'MID'))
    expect([dollars(java.minCents), dollars(java.maxCents)]).toEqual([90, 125])
    expect(dollars(nurse.minCents)).toBeGreaterThanOrEqual(85)
    expect(dollars(nurse.maxCents)).toBeLessThanOrEqual(140)
    expect(dollars(validation.minCents)).toBeGreaterThanOrEqual(90)
    expect(dollars(validation.maxCents)).toBeLessThanOrEqual(160)
    expect([dollars(cnc.minCents), dollars(cnc.maxCents)]).toEqual([48, 70])
    expect([dollars(treasury.minCents), dollars(treasury.maxCents)]).toEqual([65, 90])
  })

  it('every role in every industry has a band in whole dollars, in USD, with its minimum under its maximum', () => {
    for (const [i, r] of ROLES) {
      const b = bandFor(r, i)
      expect(b.currency).toBe('USD')
      expect(b.minCents % 100).toBe(0)
      expect(b.maxCents % 100).toBe(0)
      expect(b.minCents).toBeGreaterThan(0)
      expect(b.minCents).toBeLessThan(b.maxCents)
    }
  })

  it('a senior role’s band sits above a junior role’s in the same industry', () => {
    for (const industry of ['IT', 'HEALTHCARE', 'MANUFACTURING', 'FINANCE'] as IndustryKey[]) {
      const [junior, , senior] = ROLES.filter(([i]) => i === industry).map(([i, r]) => bandFor(r, i))
      expect(senior.minCents).toBeGreaterThan(junior.maxCents)
    }
  })

  it('specialist and licensed work carries an expertise margin, and commodity work an arbitrage one', () => {
    expect(marginClassFor(role('Nurse practitioner', 'SENIOR', true))).toBe('EXPERTISE')
    expect(marginClassFor(role('Travel nurse', 'MID', true))).toBe('EXPERTISE')
    expect(marginClassFor(role('Machine operator', 'JUNIOR'))).toBe('ARBITRAGE')
  })
})

describe('the generated world’s rates: chains', () => {
  const band = bandFor(role('Java developer', 'MID'), 'IT')

  it('the same key always gives the same chain', () => {
    expect(chainFor(band, 3, 'sx/line/0001')).toEqual(chainFor(band, 3, 'sx/line/0001'))
    expect(chainFor(band, 3, 'sx/line/0001')).not.toEqual(chainFor(band, 3, 'sx/line/0002'))
  })

  it('a chain is one rate per supplier and one for the worker, and the client pays the first, inside the band', () => {
    for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) {
      for (let k = 0; k < 50; k++) {
        const c = chainFor(band, rungs, `k${k}`)
        expect(c).toHaveLength(rungs + 1)
        expect(c[0]).toBeGreaterThanOrEqual(band.minCents)
        expect(c[0]).toBeLessThanOrEqual(band.maxCents)
        expect(c.every((x) => Number.isInteger(x))).toBe(true)
      }
    }
  })

  it('a sub-vendor’s rate never exceeds the prime’s, at any depth', () => {
    for (const p of PEOPLE) {
      for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) {
        const c = chainOf(p, rungs)
        for (let r = 1; r < c.length; r++) expect(c[r]).toBeLessThan(c[r - 1])
      }
    }
  })

  it('every rung keeps at least the agreement’s minimum margin, the firm that employs counted after the W2 burden', () => {
    for (const floorPct of [DEFAULT_FLOOR_PCT, 15, 20]) {
      for (const p of PEOPLE) {
        for (let rungs = 1; rungs <= 3; rungs++) {
          const c = chainOf(p, rungs, { floorPct })
          for (let r = 0; r < rungs; r++) {
            const cost = r === rungs - 1 ? c[r + 1] * (1 + W2_BURDEN) : c[r + 1]
            expect((c[r] - cost) / c[r]).toBeGreaterThanOrEqual(floorPct / 100 - 1e-9)
          }
        }
      }
    }
  })

  it('a floor no chain can clear is refused rather than priced', () => {
    expect(() => chainFor(band, 3, 'k', { floorPct: 100 })).toThrow(/cannot be met/)
    expect(() => chainFor(band, 0, 'k')).toThrow(RangeError)
    expect(() => chainFor(band, MAX_RUNGS + 1, 'k')).toThrow(RangeError)
    expect(() => chainFor({ minCents: 0, maxCents: 0, currency: 'USD' }, 1, 'k')).toThrow(/cannot be priced/)
  })

  it('an expertise job keeps more at the firm that employs the person, and less at the firms that pass the person through', () => {
    let passA = 0, passE = 0, empA = 0, empE = 0
    for (let k = 0; k < 200; k++) {
      const a = chainFor(band, 3, `k${k}`, { marginClass: 'ARBITRAGE' })
      const e = chainFor(band, 3, `k${k}`, { marginClass: 'EXPERTISE' })
      passA += (a[0] - a[1]) / a[0]; passE += (e[0] - e[1]) / e[0]
      empA += (a[2] - a[3] * (1 + W2_BURDEN)) / a[2]; empE += (e[2] - e[3] * (1 + W2_BURDEN)) / e[2]
    }
    expect(passE).toBeLessThan(passA)
    expect(empE).toBeGreaterThan(empA)
  })

  it('a line from years back is priced lower than the same line today', () => {
    const p = PEOPLE[1]
    expect(chainOf(p, 2, { yearsBack: 5 })[0]).toBeLessThan(chainOf(p, 2)[0])
  })
})

describe('the generated world’s rates: one line', () => {
  it('pay never exceeds bill at the same rung, and the rung below bills exactly what the rung above pays', () => {
    for (const p of PEOPLE) {
      for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) {
        for (let r = 0; r < rungs; r++) {
          const pair = pairFor(p, r, rungs)
          expect(pair.payCents).toBeLessThan(pair.billCents)
          expect(pair.currency).toBe('USD')
          if (r + 1 < rungs) expect(pairFor(p, r + 1, rungs).billCents).toBe(pair.payCents)
        }
      }
    }
  })

  it('a W2 pay line carries the employer’s burden, and its cost to the firm still clears the margin floor', () => {
    for (const p of PEOPLE) {
      const line = pricedLine(p, 1, 2, 'W2')
      expect(line.burden).toBe(W2_BURDEN)
      expect(line.costCents).toBe(Math.round(line.payCents * (1 + W2_BURDEN)))
      expect(line.costCents).toBeLessThan(line.billCents)
      expect(line.marginPct).toBeGreaterThanOrEqual(DEFAULT_FLOOR_PCT)
    }
  })

  it('a corp-to-corp pair carries no burden, is paid more an hour than the W2 wage, and costs the firm no more than the W2 line', () => {
    for (const p of PEOPLE) {
      const w2 = pricedLine(p, 0, 1, 'W2')
      const c2c = pricedLine(p, 0, 1, 'C2C')
      expect(c2c.burden).toBe(0)
      expect(c2c.costCents).toBe(c2c.payCents)
      expect(c2c.payCents).toBeGreaterThan(w2.payCents)
      expect(c2c.costCents).toBeLessThanOrEqual(w2.costCents)
      expect(c2c.payCents).toBeLessThan(c2c.billCents)
      expect(c2c.marginPct).toBeGreaterThanOrEqual(DEFAULT_FLOOR_PCT)
    }
  })

  it('a firm paying a sub-vendor is never handed a W2 pay line', () => {
    expect(() => pricedLine(PEOPLE[0], 0, 2, 'W2')).toThrow(/not a wage/)
    expect(pricedLine(PEOPLE[0], 0, 2, 'C2C').burden).toBe(0)
  })

  it('a rung that is not on the chain is refused rather than priced', () => {
    expect(() => pairFor(PEOPLE[0], 2, 2)).toThrow(RangeError)
    expect(() => pairFor(PEOPLE[0], -1, 2)).toThrow(RangeError)
  })

  it('the client sees only the rate it pays, and a sub-vendor never sees the client’s rate', () => {
    const c = chainOf(PEOPLE[2], 3)
    expect(seenBy(c, 'CLIENT')).toEqual([c[0]])
    expect(seenBy(c, 0)).toEqual([c[0], c[1]])
    expect(seenBy(c, 1)).not.toContain(c[0])
    expect(seenBy(c, 2)).toEqual([c[2], c[3]])
    expect(() => seenBy(c, 3)).toThrow(RangeError)
  })

  it('a W2 wage at the deepest chain on the lowest band is above the federal minimum wage', () => {
    for (const p of PEOPLE) expect(chainOf(p, MAX_RUNGS)[MAX_RUNGS]).toBeGreaterThan(FEDERAL_MINIMUM_WAGE_CENTS)
  })
})

describe('the generated world’s rates: a person on a bench', () => {
  it('a person’s floor is at or under every W2 wage any chain pays them, and under the top of their role’s band', () => {
    for (const p of PEOPLE) {
      const floor = floorFor(p)
      for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) expect(floor).toBeLessThanOrEqual(pairFor(p, rungs - 1, rungs).payCents)
      expect(floor).toBeLessThan(bandFor(p.role, p.industry).maxCents)
    }
  })

  it('a person’s listing range starts at or above their floor and is a real range', () => {
    for (const p of PEOPLE) {
      const l = listingRate(p)
      expect(l.currency).toBe('USD')
      expect(l.minCents).toBeGreaterThanOrEqual(floorFor(p))
      expect(l.minCents).toBeLessThan(l.maxCents)
    }
  })
})
