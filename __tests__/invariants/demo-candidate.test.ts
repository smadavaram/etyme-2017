import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The third demo seat.
 *
 * Only two of the three real populations had a one-click demo: "I'm
 * hiring" and "I have a bench" both seeded a whole company. A candidate
 * is not in charge of a company, so this is not a third copy of the same
 * pattern — it seeds one person, on somebody else's bench, mid-placement.
 *
 * Verified once against real Postgres and a real HTTP round-trip through
 * /api/demo → /api/me/work, /api/me/benches, /api/me/portfolio, all
 * populated rather than empty. These tests pin the wiring so a later
 * edit can't quietly drop the third door without a test noticing.
 */

const ROUTE = readFileSync(join(__dirname, '../../src/app/api/demo/route.ts'), 'utf8')
const PAGE = readFileSync(join(__dirname, '../../src/app/page.tsx'), 'utf8')
const TRY_DEMO = readFileSync(join(__dirname, '../../src/components/try-demo.tsx'), 'utf8')

describe('the candidate demo is a real third door, not just the other two relabelled', () => {
  it('accepts CANDIDATE as a side, alongside HIRING and BENCH', () => {
    expect(ROUTE).toContain("export type Side = 'HIRING' | 'BENCH' | 'CANDIDATE'")
    expect(TRY_DEMO).toContain("'HIRING' | 'BENCH' | 'CANDIDATE'")
  })

  it('seeds a person on a bench, not a company somebody runs', () => {
    // The other two doors seed whoever asks as the owner of a new
    // company. This one deliberately does not — see demo-seed-consultant.ts.
    expect(ROUTE).toContain('seedDemoConsultant')
  })

  it('lands a candidate on their own work, not a company dashboard', () => {
    expect(ROUTE).toMatch(/side === 'CANDIDATE' \? '\/dashboard\/my-work'/)
  })

  it('is reachable from the home page, in both places the other two doors are', () => {
    const count = (PAGE.match(/side="CANDIDATE"/g) ?? []).length
    expect(count).toBe(2)
    expect(PAGE).toContain('See it as a candidate')
  })
})
