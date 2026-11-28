import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { siteRenders, SEEDED_SITE_LIVE_AT } from '@/lib/plugins'

const seed = readFileSync(join(process.cwd(), 'prisma/seed.ts'), 'utf8')
const lines = seed.split('\n').filter((l) => /^\s*siteLiveAt:/.test(l))

describe('the dev seed storefronts', () => {
  it('the seed writes six storefronts, each with a siteLiveAt', () => {
    expect(lines.length).toBe(6)
  })
  it('no storefront the dev seed writes takes its live date from the day the seed is run', () => {
    for (const l of lines) expect(l).not.toMatch(/new Date\(\)|Date\.now/)
    for (const l of lines) expect(l).toMatch(/SEEDED_SITE_LIVE_AT/)
  })
  it('every storefront the dev seed writes renders whatever day the seed is run, with the Website plugin off', () => {
    expect(siteRenders({ siteLiveAt: SEEDED_SITE_LIVE_AT, pluginsOn: [], ownerSwitchedOff: false })).toBe(true)
  })
})
