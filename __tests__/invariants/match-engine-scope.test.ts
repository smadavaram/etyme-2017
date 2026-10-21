import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The match engine's candidate pool was once unscoped: a bare
 * `revokedAt: null` on BenchListing with no companyId, so running
 * matching on a requirement searched every company's bench on the
 * platform. Then it was the requirement owner's own bench and nothing
 * else, which left a client — who has no bench — with nobody to match.
 *
 * Since 2026-09-30 the pool is four circles, each reached by a consent the
 * person gave, and drawn in one place (`lib/match-pool`). These pin the
 * two lines that keep it from ever becoming the whole platform again: the
 * engine reads the pool from that one door, and every listing the door
 * reads is filtered by a firm the viewer deals with or by the person's own
 * yes to be shown beyond it. The behavior itself is walked on the seeded
 * world in `__integration__/bench-matching.test.ts`.
 */

const ENGINE = readFileSync(join(__dirname, '../../src/lib/match-engine.ts'), 'utf8')
const POOL = readFileSync(join(__dirname, '../../src/lib/match-pool.ts'), 'utf8')

describe('the match engine never searches the whole platform', () => {
  it('draws its pool from the one door and never queries listings itself', () => {
    expect(ENGINE).toContain('await poolFor(requirement, viewerCompanyId, { suggest })')
    expect(ENGINE).not.toContain('prisma.benchListing.findMany')
  })

  it('reads only listings of the viewer, of a firm it deals with, or of a person who said yes to being shown', () => {
    const start = POOL.indexOf('const listingWhere = {')
    const end = POOL.indexOf('const listingSelect = {', start)
    expect(start).toBeGreaterThan(-1)
    const where = POOL.slice(start, end)
    expect(where).toContain("revokedAt: null")
    expect(where).toContain("state: 'GRANTED'")
    expect(where).toContain('{ companyId: viewerCompanyId }')
    expect(where).toContain("{ companyId: { in: outside }, tier: 'MARKETING' as const }")
    expect(where).toContain("{ tier: 'MARKETING' as const, showInMatches: true }")
  })

  it('reads the firms a viewer deals with whole, in a fixed order, and cuts only the suggestions beyond its register, narrowed to the job’s skills', () => {
    const start = POOL.indexOf('const listingWhere = {')
    const end = POOL.indexOf('const entries: PoolEntry[] = []', start)
    const read = POOL.slice(start, end)
    // The register's circles: no cut, so nobody on a supplier's bench is dropped by chance.
    const direct = read.slice(read.indexOf('prisma.benchListing.findMany({ where: listingWhere'), read.indexOf('opts.suggest && jobSkills.length'))
    expect(direct).not.toContain('take:')
    expect(direct).toContain("orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }]")
    // Suggestions: only people holding one of the job's skills, ordered before the cut.
    expect(read).toContain('skills: { hasSome: jobSkills }')
    const suggest = read.slice(read.indexOf('where: suggestWhere'))
    expect(suggest.indexOf('orderBy:')).toBeGreaterThan(-1)
    expect(suggest.indexOf('orderBy:')).toBeLessThan(suggest.indexOf('take: SUGGESTIONS_READ'))
    expect(POOL).not.toContain('take: 400')
  })

  it('says an empty pool as the circles it looked in, never as the whole platform', () => {
    expect(ENGINE).toContain('Nobody available matches from your own bench, your suppliers or the firms you work with right now')
  })
})
