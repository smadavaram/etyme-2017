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
import { DARK_SITE_SAYS } from '@/lib/plugins'

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
  it('a site live before the flag keeps rendering with no switch written', async () => {
    h.company = firm({ slug: 'any-old-firm' })
    expect((await publicSite('any-old-firm'))?.slug).toBe('any-old-firm')
  })

  it('a site that was never live reads no company at that address', async () => {
    h.company = firm({ siteLiveAt: null })
    expect(await publicSite('northwind')).toBeNull()
    h.company = firm({ siteLiveAt: new Date('2026-11-28T00:00:00Z') })
    expect(await publicSite('northwind')).toBeNull()
  })

  it('a staff switch never ends a site’s grandfathering', async () => {
    await publicSite('northwind')
    expect(h.switchReads).toEqual([{ companyId: 'f1', plugin: 'WEBSITE', on: false, byStaff: false }])
  })

  it('a firm with Website and content off reads no company at that address', async () => {
    h.company = firm({ siteLiveAt: new Date('2026-11-28T00:00:00Z') })
    expect(await publicSite('northwind')).toBeNull()
    expect(DARK_SITE_SAYS).toBe('No company at that address.')
  })

  it('a firm with Website and content on renders', async () => {
    h.company = firm({ pluginsOn: ['WEBSITE'] })
    expect((await publicSite('northwind'))?.name).toBe('Northwind Staffing')
  })

  it('an Owner’s switch-off ends grandfathering for good and the words are kept', async () => {
    h.company = firm({ pluginsOn: [] })
    h.switches = 1 // the Owner's switch-off row
    expect(await publicSite('northwind')).toBeNull()
    // Dark is a read gate only: nothing here ever writes the stored words.
    const src = readFileSync(join(process.cwd(), 'src/lib/public-site.ts'), 'utf8')
    expect(src).not.toMatch(/company\.(update|delete)|siteTagline:\s*null/)
    expect(h.company.siteTagline).toBe('Our own words')
  })

  it('a site switched off and later on again renders only because the switch is on, not because it was grandfathered', async () => {
    h.company = firm({ pluginsOn: ['WEBSITE'] })
    h.switches = 2
    expect(await publicSite('northwind')).not.toBeNull()
    h.company = firm({ pluginsOn: [] })
    expect(await publicSite('northwind')).toBeNull()
  })

  it('a firm’s old address and its own domain go dark with its site', async () => {
    // The lookup resolves alias and domain to the one company; the gate reads that company.
    h.company = firm({ slug: 'northwind', pluginsOn: [], siteLiveAt: new Date('2026-11-28T00:00:00Z') })
    expect(await publicSite('old-northwind')).toBeNull()
    expect(await publicSite('northwind.example')).toBeNull()
    h.company = firm({ slug: 'northwind', pluginsOn: ['WEBSITE'] })
    expect(await publicSite('old-northwind')).not.toBeNull()
  })

  it('an alias of a grandfathered firm renders with it, because grandfathering is read off the firm’s own record', async () => {
    h.company = firm()
    expect(await publicSite('old-northwind')).not.toBeNull()
  })

  it('a firm that was never live before the flag never reads the switch history', async () => {
    h.company = firm({ siteLiveAt: new Date('2026-11-28T00:00:00Z') })
    await publicSite('northwind')
    expect(h.switchReads).toEqual([])
  })
})

describe('a grandfathered site keeps its content editor', () => {
  const old = new Date('2026-10-29T00:00:00Z')
  it('a grandfathered site keeps its content editor', async () => {
    expect(await siteRendersFor({ id: 'f1', siteLiveAt: old, pluginsOn: [] })).toBe(true)
    expect(h.switchReads).toEqual([{ companyId: 'f1', plugin: 'WEBSITE', on: false, byStaff: false }])
  })
  it('the editor is closed for a grandfathered site once its Owner has switched it off', async () => {
    h.switches = 1
    expect(await siteRendersFor({ id: 'f1', siteLiveAt: old, pluginsOn: [] })).toBe(false)
  })
  it('the editor is closed for a site never live while Website and content is off, and open while it is on', async () => {
    const fresh = new Date('2026-11-28T00:00:00Z')
    expect(await siteRendersFor({ id: 'f2', siteLiveAt: fresh, pluginsOn: [] })).toBe(false)
    expect(await siteRendersFor({ id: 'f2', siteLiveAt: fresh, pluginsOn: ['WEBSITE'] })).toBe(true)
  })
})
