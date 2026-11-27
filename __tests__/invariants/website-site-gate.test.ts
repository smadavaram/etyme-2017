import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Records 121 and 123: the public storefront renders only where Website and
 * content is on, except the two sites that were live before the switch
 * existed, until their Owner first switches one off. A dark site reads "No
 * company at that address", the same as a firm that does not exist.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({ company: null as Row | null, switches: 0, switchReads: [] as Row[] }))

vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findFirst: async () => h.company },
    pluginSwitch: { count: async (q: Row) => { h.switchReads.push(q.where); return h.switches } },
    person: { findMany: async () => [] },
    sellContract: { count: async () => 0, findMany: async () => [] },
    consultantProfile: { findMany: async () => [] },
    verification: { findMany: async () => [] },
    course: { findMany: async () => [] },
    requirement: { findMany: async () => [] },
    submission: { findMany: async () => [] },
    invoice: { findMany: async () => [] },
    benchListing: { findMany: async () => [] },
    context: { findMany: async () => [] },
  },
}))

import { publicSite, siteRendersFor } from '@/lib/public-site'
import { DARK_SITE_SAYS, GRANDFATHERED_SITES } from '@/lib/plugins'
import { RENAMED_FIRMS } from '@/lib/seed-renames'

function firm(over: Row = {}): Row {
  return {
    id: 'f1', name: 'Northwind Staffing', slug: 'northwind', kind: 'VENDOR', supplierPosture: 'BENCH',
    siteLiveAt: new Date('2026-10-29T00:00:00Z'), networkVerifiedAt: null, domain: null, domainVerified: false,
    claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
    siteTagline: 'Our own words', siteIntro: 'Kept as written', siteHeadings: null, siteWrittenBy: 'PERSON',
    phone: null, accountsEmail: null, showPeopleOnPage: false, peopleInCharge: [],
    locations: [], pluginsOn: [], coursesHiddenOnStorefront: false,
    ...over,
  }
}

beforeEach(() => { h.company = firm(); h.switches = 0; h.switchReads = [] })

describe('the public storefront follows the Website and content switch', () => {
  it('the Tapin storefront still renders after the deploy with no switch ever written', async () => {
    h.company = firm({ slug: 'tapin', name: 'Tapin' })
    expect((await publicSite('tapin'))?.slug).toBe('tapin')
  })

  it('the second firm’s storefront still renders the same way', async () => {
    const second = RENAMED_FIRMS.find((r) => r.on === '2026-10-04')!.toSlug
    expect(GRANDFATHERED_SITES).toContain(second)
    h.company = firm({ slug: second })
    expect((await publicSite(second))?.slug).toBe(second)
  })

  it('a firm with Website and content off reads no company at that address', async () => {
    expect(await publicSite('northwind')).toBeNull()
    expect(DARK_SITE_SAYS).toBe('No company at that address.')
  })

  it('a firm with Website and content on renders', async () => {
    h.company = firm({ pluginsOn: ['WEBSITE'] })
    expect((await publicSite('northwind'))?.name).toBe('Northwind Staffing')
  })

  it('an Owner who switches a grandfathered site off takes it dark for good and its words are kept', async () => {
    h.company = firm({ slug: 'tapin', pluginsOn: [] })
    h.switches = 1 // the Owner's switch-off row
    expect(await publicSite('tapin')).toBeNull()
    // Dark is a read gate only: nothing here ever writes the stored words.
    const src = readFileSync(join(process.cwd(), 'src/lib/public-site.ts'), 'utf8')
    expect(src).not.toMatch(/company\.(update|delete)|siteTagline:\s*null/)
    expect(h.company.siteTagline).toBe('Our own words')
  })

  it('a site switched off and later on again renders only because the switch is on, not because it was grandfathered', async () => {
    h.company = firm({ slug: 'tapin', pluginsOn: ['WEBSITE'] })
    h.switches = 2
    expect(await publicSite('tapin')).not.toBeNull()
    h.company = firm({ slug: 'tapin', pluginsOn: [] })
    expect(await publicSite('tapin')).toBeNull()
  })

  it('a firm’s old address and its own domain go dark with its site', async () => {
    // The lookup resolves alias and domain to the one company; the gate reads that company.
    h.company = firm({ slug: 'northwind', pluginsOn: [] })
    expect(await publicSite('old-northwind')).toBeNull()
    expect(await publicSite('northwind.example')).toBeNull()
    h.company = firm({ slug: 'northwind', pluginsOn: ['WEBSITE'] })
    expect(await publicSite('old-northwind')).not.toBeNull()
  })

  it('an alias of a grandfathered firm renders with it, because grandfathering is read off the firm’s own slug', async () => {
    h.company = firm({ slug: 'tapin' })
    expect(await publicSite('old-tapin')).not.toBeNull()
  })

  it('a firm that is not grandfathered never reads the switch history', async () => {
    await publicSite('northwind')
    expect(h.switchReads).toEqual([])
  })
})

describe('a grandfathered site keeps its content editor', () => {
  it('the editor is open for a grandfathered site no Owner has switched off', async () => {
    expect(await siteRendersFor({ id: 'f1', slug: 'tapin', pluginsOn: [] })).toBe(true)
    expect(h.switchReads).toEqual([{ companyId: 'f1', plugin: 'WEBSITE' }])
  })
  it('the editor is closed for a grandfathered site once its Owner has switched it off', async () => {
    h.switches = 1
    expect(await siteRendersFor({ id: 'f1', slug: 'tapin', pluginsOn: [] })).toBe(false)
  })
  it('the editor is closed for any other firm while Website and content is off, and open while it is on', async () => {
    expect(await siteRendersFor({ id: 'f2', slug: 'northwind', pluginsOn: [] })).toBe(false)
    expect(await siteRendersFor({ id: 'f2', slug: 'northwind', pluginsOn: ['WEBSITE'] })).toBe(true)
  })
})

describe('an outreach letter never links to a storefront that is dark', () => {
  it('every outreach door builds its storefront link only from a page that renders', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    expect(read('src/lib/outreach/batch.ts')).toMatch(/\(await publicSite\(slug\)\) \? `\$\{base\}\/site\/\$\{slug\}` : null/)
    expect(read('src/lib/agents/outreach-batch.ts')).toMatch(/\(await publicSite\(firm\.slug\)\) \? `\$\{baseUrl\(\)\}\/site\/\$\{firm\.slug\}` : null/)
    expect(read('src/lib/notify/outreach-interest.ts')).toMatch(/\(await publicSite\(slug\)\) \? `\/site\/\$\{slug\}` : null/)
  })
  it('a dark firm gives those doors nothing to link to', async () => {
    expect(await publicSite('northwind')).toBeNull()
  })
})
