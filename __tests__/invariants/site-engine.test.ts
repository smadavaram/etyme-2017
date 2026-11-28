import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Record 111, one engine for every tenant's public site; record 79, a template
 * is a layout and never a look. Nothing here touches a database except the one
 * case that reads a stored record through `publicSite`, which is mocked.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({ company: null as Row | null }))
vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findFirst: async () => h.company },
    pluginSwitch: { count: async () => 0 },
    person: { findMany: async () => [] },
    sellContract: { findMany: async () => [], count: async () => 0 },
    consultantProfile: { findMany: async () => [] },
    verification: { findMany: async () => [] },
    course: { findMany: async () => [] },
    enrollment: { groupBy: async () => [] },
    learnBadge: { count: async () => 0 },
    requirement: { findMany: async () => [] },
    submission: { findMany: async () => [] },
    invoice: { findMany: async () => [] },
    benchListing: { findMany: async () => [] },
    context: { findMany: async () => [] },
  },
}))

import { SiteView, PageView } from '@/app/site/[slug]/site-view'
import { publicSite, type PublicSite } from '@/lib/public-site'
import {
  lookFor, lookWarnings, orderFor, layoutOf, SITE_TEMPLATES, type SectionKey, type SiteLook,
} from '@/lib/public-site/site-look'
import { brandingFingerprint } from '@/lib/site-settings'

const BRANDING = { logoRef: 'https://cdn.example/tapin-logo.png', primaryColor: '#1F3A5F', secondaryColor: '#C0622E', fontPairing: 'SERIF_SANS' }
const approved = (b = BRANDING) => ({
  siteLogoRef: b.logoRef, sitePrimaryColor: b.primaryColor, siteSecondaryColor: b.secondaryColor, siteFontPairing: b.fontPairing,
  siteBrandingApprovedAt: new Date('2026-11-20T00:00:00Z'), siteBrandingApprovedHash: brandingFingerprint(b),
})
const PAGES = [{ slug: 'about-us', title: 'About us', body: 'We place data engineers.\n\nWe started in 2021.' }]

function record(look: SiteLook, over: Partial<PublicSite> = {}): PublicSite {
  return {
    name: 'Tapin', slug: 'tapin', does: 'supplies contract staff', kind: 'VENDOR', audience: 'TALENT_AND_BUYERS',
    locations: ['San Antonio, TX'],
    track: { placements: 4, activeNow: 2, clients: 2, isNew: false },
    skills: [{ skill: 'Python', count: 3 }, { skill: 'Spark', count: 1 }],
    credentials: [{ what: 'General liability insurance', until: '2027-06-30' }],
    verifiedDomain: null, inNetwork: false, liveSince: '2026-10-29',
    tagline: 'Data engineers, ready when you are.', intro: 'A small bench firm.', headings: {}, writtenBy: 'RULES',
    openPositions: [], reputation: null,
    comingFree: [{ headline: 'Data engineer', skills: ['Python'], location: 'San Antonio, TX', freeOn: '2026-12-01', daysUntilFree: 0, provenAt: null }],
    comingFreeSummary: '1 person free now.',
    joinBench: true, askBox: true,
    contact: { phone: '(415) 555-0142', accountsEmail: 'accounts@tapin.example', people: [] },
    courses: [{ title: 'Spark basics', hours: 12 }],
    learnOpen: false,
    look,
    ...over,
  }
}

const draw = (site: PublicSite) => renderToStaticMarkup(createElement(SiteView, { site }))
const drawPage = (site: PublicSite, page: { title: string; body: string }) => renderToStaticMarkup(createElement(PageView, { site, page }))
const sectionsIn = (html: string) => [...html.matchAll(/data-section="(\w+)"/g)].map((m) => m[1])
const lookOf = (template: string, stored: Row = {}) => lookFor({ siteTemplate: template, sitePages: PAGES, ...stored })

describe('the same record drawn by each template', () => {
  it('Ask first, Feed and Board each draw every section of the same record, in a different order or frame', () => {
    const drawn = SITE_TEMPLATES.map((t) => sectionsIn(draw(record(lookOf(t)))))
    const [ask, feed, board] = drawn
    expect([...ask].sort()).toEqual([...feed].sort())
    expect([...feed].sort()).toEqual([...board].sort())
    expect(ask.length).toBeGreaterThanOrEqual(8)
  })

  it('every template prints the same facts: the firm, who is free, the contact, the skills, the courses and the credentials', () => {
    for (const t of SITE_TEMPLATES) {
      const html = draw(record(lookOf(t)))
      for (const fact of ['Tapin', 'Data engineers, ready when you are.', '1 person free now.', '(415) 555-0142', 'accounts@tapin.example', 'Python', 'Spark basics', 'General liability insurance', 'Join the bench']) {
        expect(html, `${t}: ${fact}`).toContain(fact)
      }
    }
  })

  it('Ask first puts the ask box before who is coming free, and Feed puts it after', () => {
    const order = (t: string) => sectionsIn(draw(record(lookOf(t))))
    expect(order('ASK_FIRST').indexOf('ask')).toBeLessThan(order('ASK_FIRST').indexOf('comingFree'))
    expect(order('FEED').indexOf('comingFree')).toBeLessThan(order('FEED').indexOf('ask'))
  })

  it('Board draws cards in two columns and the other two draw one column with rules between', () => {
    expect(layoutOf('BOARD').columns).toBe(2)
    expect(layoutOf('ASK_FIRST').columns).toBe(1)
    expect(layoutOf('FEED').columns).toBe(1)
    expect(draw(record(lookOf('BOARD')))).toContain('sm:grid-cols-2')
    expect(draw(record(lookOf('FEED')))).not.toContain('sm:grid-cols-2 gap-5')
  })

  it('a template never drops a section the record has, whichever sections it has', () => {
    const all: SectionKey[] = ['ask', 'contact', 'comingFree', 'openPositions', 'reputation', 'track', 'skills', 'courses', 'learn', 'joinBench', 'credentials']
    for (const t of SITE_TEMPLATES) {
      expect([...orderFor(t, all)].sort()).toEqual([...all].sort())
      expect(orderFor(t, ['track', 'ask'])).toHaveLength(2)
    }
  })

  it('a template alone never changes a color or a font', () => {
    const plain = (t: string) => draw(record(lookOf(t)))
    for (const t of SITE_TEMPLATES) {
      expect(plain(t)).not.toMatch(/style="[^"]*color/)
      expect(plain(t)).not.toContain('font-family')
    }
  })

  it('a site that is supplying buyers draws its open jobs and reputation in the same engine', () => {
    const site = record(lookOf('FEED'), {
      audience: 'SUPPLIERS', askBox: false, joinBench: false, comingFree: [], comingFreeSummary: null, courses: [],
      openPositions: [{ id: 'r1', title: 'Validation engineer', skills: ['GxP'], location: 'Denver, CO', heads: 2, postedAt: '2026-11-01', openFor: '3 weeks' }],
    })
    const html = draw(site)
    expect(html).toContain('Validation engineer')
    expect(html).toContain('Rates are agreed with each supplier and are not published here.')
    expect(sectionsIn(html)).toContain('openPositions')
  })
})

describe('a tenant’s own branding', () => {
  it('a tenant’s colors appear unchanged on its page, in every template', () => {
    for (const t of SITE_TEMPLATES) {
      const html = draw(record(lookOf(t, approved())))
      expect(html, t).toContain('#1F3A5F')
      expect(html, t).toContain('#C0622E')
    }
  })

  it('the saved font pairing sets the headline and body type', () => {
    const html = draw(record(lookOf('ASK_FIRST', approved())))
    expect(html).toContain('Iowan Old Style')
    expect(html).toContain('Inter')
    const sans = draw(record(lookOf('ASK_FIRST', approved({ ...BRANDING, fontPairing: 'SANS_SANS' }))))
    expect(sans).not.toContain('Iowan Old Style')
  })

  it('the Owner’s logo is drawn when it is an https address, and a stored file id is not drawn as a broken image', () => {
    expect(draw(record(lookOf('FEED', approved())))).toContain('src="https://cdn.example/tapin-logo.png"')
    const byId = approved({ ...BRANDING, logoRef: 'ckx1abcdefghijklmnopqrst' })
    expect(draw(record(lookOf('FEED', byId)))).not.toContain('<img')
  })

  it('branding is drawn only while the Owner’s yes still covers the saved values', () => {
    const changedAfterYes = { ...approved(), sitePrimaryColor: '#2B47E5' }
    const html = draw(record(lookOf('FEED', changedAfterYes)))
    expect(html).not.toContain('#2B47E5')
    expect(html).not.toContain('#C0622E')
    const neverApproved = { ...approved(), siteBrandingApprovedAt: null, siteBrandingApprovedHash: null }
    expect(lookOf('FEED', neverApproved).branded).toBe(false)
  })

  it('a failing contrast pair is warned about and the color is kept as the Owner chose it', () => {
    const pale = { ...BRANDING, primaryColor: '#F4F1A8' }
    const warnings = lookWarnings(pale)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('primary')
    expect(warnings.join(' ')).toContain('kept as you chose')
    const look = lookOf('BOARD', approved(pale))
    expect(look.primary).toBe('#F4F1A8')
    expect(draw(record(look))).toContain('#F4F1A8')
  })

  it('a readable pair is not warned about', () => {
    expect(lookWarnings({ primaryColor: '#1F3A5F', secondaryColor: '#4421D6' })).toEqual([])
    expect(lookWarnings({ primaryColor: null, secondaryColor: null })).toEqual([])
  })
})

describe('what Etyme and the people on the page may show', () => {
  it('Etyme’s own brand on a tenant’s page is “Runs on Etyme” and nothing larger', () => {
    const html = draw(record(lookOf('ASK_FIRST', approved()), { locations: [] }))
    expect(html).toContain('Runs on Etyme')
    expect(html).not.toMatch(/Powered by|Built with/)
    // With no place to name, the small label over the firm's name is left out rather than printing Etyme there.
    expect(html).not.toMatch(/tracking-\[0\.12em\][^>]*>Etyme</)
  })

  it('a person is not printed on the page unless the Owner opted in', () => {
    const none = draw(record(lookOf('FEED')))
    for (const never of ['Priya Nair', 'Owner', 'HR']) expect(none).not.toContain(`>${never}<`)
    const opted = record(lookOf('FEED'), { contact: { phone: null, accountsEmail: null, people: [{ role: 'Owner', name: 'Priya Nair' }] } })
    expect(draw(opted)).toContain('Priya Nair')
  })

  it('the view reads a name only from the contact the record carries, and from no other field', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/site/[slug]/site-view.tsx'), 'utf8')
    expect(src).not.toMatch(/peopleInCharge|primaryEmail|seatedName/)
  })
})

describe('a tenant’s own pages', () => {
  it('saved pages are linked from the home page and drawn in the same look on their own address', () => {
    const site = record(lookOf('FEED', approved()))
    expect(draw(site)).toContain('href="/site/tapin/p/about-us"')
    const page = drawPage(site, PAGES[0])
    expect(page).toContain('About us')
    expect(page).toContain('We started in 2021.')
    expect(page).toContain('#1F3A5F')
    expect(page).toContain('Runs on Etyme')
  })

  it('a page body is printed as words, never as markup', () => {
    const page = drawPage(record(lookOf('FEED')), { title: 'Hello', body: '<script>alert(1)</script>' })
    expect(page).not.toContain('<script>')
  })
})

describe('one engine, read from the tenant’s record', () => {
  it('the stored template, branding and pages reach the page through the one reader, with no build for one tenant', async () => {
    h.company = {
      id: 'tapin', name: 'Tapin', slug: 'tapin', kind: 'VENDOR', supplierPosture: 'BENCH',
      siteLiveAt: new Date('2026-10-29T00:00:00Z'), networkVerifiedAt: null, domain: null, domainVerified: false,
      claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
      siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null,
      phone: null, accountsEmail: null, showPeopleOnPage: false, peopleInCharge: [], locations: [],
      siteTemplate: 'BOARD', sitePages: PAGES, ...approved(),
    }
    const site = (await publicSite('tapin'))!
    expect(site.look.template).toBe('BOARD')
    expect(site.look.primary).toBe('#1F3A5F')
    expect(site.look.pages.map((p) => p.slug)).toEqual(['about-us'])
  })

  it('a firm that stored nothing is drawn as before, in Ask first with no colors', async () => {
    h.company = {
      id: 'tapin', name: 'Tapin', slug: 'tapin', kind: 'VENDOR', supplierPosture: 'BENCH',
      siteLiveAt: new Date('2026-10-29T00:00:00Z'), networkVerifiedAt: null, domain: null, domainVerified: false,
      claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
      siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null,
      phone: null, accountsEmail: null, showPeopleOnPage: false, peopleInCharge: [], locations: [],
      siteTemplate: 'ASK_FIRST', sitePages: null,
    }
    const site = (await publicSite('tapin'))!
    expect(site.look).toMatchObject({ template: 'ASK_FIRST', branded: false, primary: null, pages: [] })
  })

  it('a dark site is the same nothing as before: no record, no page', async () => {
    h.company = { id: 'x', name: 'X', slug: 'x', siteLiveAt: null }
    expect(await publicSite('x')).toBeNull()
  })
})

describe('what the Owner reads in settings about a color', () => {
  it('the Owner is shown a sentence for a color that is hard to read, saying it is kept as chosen, and nothing for a readable one', async () => {
    const { LookWarnings } = await import('@/lib/public-site/site-look-panel')
    const warned = renderToStaticMarkup(createElement(LookWarnings, { branding: { primaryColor: '#F4F1A8', secondaryColor: '#1F3A5F' } }))
    expect(warned).toContain('hard to read')
    expect(warned).toContain('kept as you chose')
    expect(warned).not.toContain('secondary')
    expect(renderToStaticMarkup(createElement(LookWarnings, { branding: { primaryColor: '#1F3A5F', secondaryColor: null } }))).toBe('')
  })
})

describe('the door into the learning site on a firm\u2019s public page', () => {
  const firm = (pluginsOn: string[]) => ({
    id: 'tapin', name: 'Tapin', slug: 'tapin', kind: 'VENDOR', supplierPosture: 'BENCH', pluginsOn,
    siteLiveAt: new Date('2026-10-29T00:00:00Z'), networkVerifiedAt: null, domain: null, domainVerified: false,
    claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
    siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null,
    phone: null, accountsEmail: null, showPeopleOnPage: false, peopleInCharge: [], locations: [],
    siteTemplate: 'ASK_FIRST', sitePages: null,
  })

  it('a firm with Train to bench on is read as having its learning door open', async () => {
    h.company = firm(['TRAIN_TO_BENCH'])
    expect((await publicSite('tapin'))!.learnOpen).toBe(true)
  })

  it('a firm with Train to bench off is read as having its learning door shut', async () => {
    h.company = firm([])
    expect((await publicSite('tapin'))!.learnOpen).toBe(false)
  })

  it('the page links to the firm\u2019s learning site where the plugin is on', () => {
    const html = draw(record(lookOf('ASK_FIRST'), { learnOpen: true }))
    expect(html).toContain('href="/learn/tapin"')
    expect(sectionsIn(html)).toContain('learn')
  })

  it('the page draws no learning link where the plugin is off', () => {
    const html = draw(record(lookOf('ASK_FIRST'), { learnOpen: false }))
    expect(html).not.toContain('/learn/')
    expect(sectionsIn(html)).not.toContain('learn')
  })

  it('hiding the course list does not close the door, and the door does not need a course', () => {
    const html = draw(record(lookOf('ASK_FIRST'), { learnOpen: true, courses: [] }))
    expect(html).toContain('href="/learn/tapin"')
  })

  it('the door is free to take, says so, and names no price', () => {
    const html = draw(record(lookOf('ASK_FIRST'), { learnOpen: true }))
    expect(html).toContain('Free, no sign-in')
    expect(html).not.toMatch(/\$\d|per month|\/month/i)
  })
})
