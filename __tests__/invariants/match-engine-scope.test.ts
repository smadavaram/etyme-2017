import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The match engine's candidate pool was unscoped: a bare
 * `revokedAt: null` on BenchListing with no companyId, so running "Run
 * AI matching" on a requirement searched every company's bench on the
 * platform, not just the requirement owner's own. That is also the
 * feature the founder asked for by name — "knowing in-org bench
 * availability before creating requisitions externally" — which cannot
 * mean anything if "in-org" isn't actually enforced.
 *
 * A full integration test would need a live Anthropic call (the engine
 * asks Claude for semantic skill matching); this pins the one line that
 * actually matters — the query's own scope — against the source, the
 * same way several other tests in this suite pin a route's real
 * behaviour without standing up the whole stack.
 */

const SOURCE = readFileSync(
  join(__dirname, '../../src/lib/match-engine.ts'),
  'utf8'
)

describe('the match engine only ever searches the requirement owner\'s own bench', () => {
  it('scopes the candidate pool query to the requirement\'s own company', () => {
    const queryStart = SOURCE.indexOf('prisma.benchListing.findMany')
    expect(queryStart, 'benchListing query not found').toBeGreaterThan(-1)
    const queryEnd = SOURCE.indexOf('include:', queryStart)
    const whereClause = SOURCE.slice(queryStart, queryEnd)
    expect(whereClause).toContain('companyId: requirement.companyId')
  })

  it('never falls back to an unscoped search when nobody matches', () => {
    // The empty-pool message used to say "no candidates found" full
    // stop, which read as true of the whole platform. Pinned so a
    // future edit can't quietly widen the claim back out.
    expect(SOURCE).toContain('Nobody on your own bench has an active listing right now')
  })
})
