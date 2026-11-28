import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Record 133: the door shows what happened on the learning site as counts from
 * the record, and nothing else. Pure rules first, then the reader against a
 * mocked record, then the page drawn.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({
  company: null as Row | null,
  courses: [] as Row[],
  done: [] as Row[],
  badges: 0,
  reads: [] as string[],
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findFirst: async () => h.company },
    pluginSwitch: { count: async () => 0 },
    person: { findMany: async () => [] },
    sellContract: { findMany: async () => [], count: async () => 0 },
    consultantProfile: { findMany: async () => [] },
    verification: { findMany: async () => [] },
    course: { findMany: async (a: Row) => { h.reads.push('course'); return a.where.isPublic ? h.courses : [] } },
    enrollment: { groupBy: async () => { h.reads.push('enrollment'); return h.done } },
    learnBadge: { count: async () => { h.reads.push('badge'); return h.badges } },
    requirement: { findMany: async () => [] },
    submission: { findMany: async () => [] },
    invoice: { findMany: async () => [] },
    benchListing: { findMany: async () => [] },
    context: { findMany: async () => [] },
  },
}))

import { PROOF_FLOOR, floored, completionLine, badgeLine, proofLines, featuredIn, DOOR_OFFER } from '@/lib/public-site/door-proof'
import { readDoorLearn } from '@/lib/public-site/door-proof-read'
import { publicSite, type PublicSite } from '@/lib/public-site'
import { SiteView } from '@/app/site/[slug]/site-view'
import { lookFor, orderFor } from '@/lib/public-site/site-look'
import { brandingFingerprint } from '@/lib/site-settings'

const COURSES = [
  { id: 'c1', title: 'Working with AI', duration: 6 },
  { id: 'c2', title: 'Spark basics', duration: 12 },
  { id: 'c3', title: 'SQL first steps', duration: null },
]

function firm(pluginsOn: string[], over: Row = {}): Row {
  return {
    id: 'co1', name: 'Tapin', slug: 'tapin', kind: 'VENDOR', supplierPosture: 'BENCH', pluginsOn,
    coursesHiddenOnStorefront: false, featuredCourseIds: [], siteLiveAt: new Date('2026-10-29T00:00:00Z'),
    networkVerifiedAt: null, domain: null, domainVerified: false,
    claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
    siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null,
    phone: null, accountsEmail: null, showPeopleOnPage: false, peopleInCharge: [], locations: [],
    siteTemplate: 'ASK_FIRST', sitePages: null, ...over,
  }
}

describe('the count floor', () => {
  it('the floor is 5', () => expect(PROOF_FLOOR).toBe(5))
  it('a count of 4 reads fewer than 5, never the number', () => {
    expect(floored(4)).toBe('fewer than 5')
    expect(completionLine('Spark basics', 4)).toBe('Fewer than 5 people finished Spark basics on Etyme')
    expect(completionLine('Spark basics', 1)).not.toMatch(/\b1\b/)
  })
  it('a count of 5 or more is the record’s own number', () => {
    expect(completionLine('Spark basics', 5)).toBe('5 people finished Spark basics on Etyme')
    expect(completionLine('Spark basics', 12)).toBe('12 people finished Spark basics on Etyme')
    expect(badgeLine(37)).toBe('37 badges earned on Etyme')
  })
  it('a count of zero says nothing rather than a zero', () => {
    expect(floored(0)).toBeNull()
    expect(completionLine('Spark basics', 0)).toBeNull()
    expect(badgeLine(0)).toBeNull()
  })
  it('proof lines are only the courses and badges that have something to count', () => {
    expect(proofLines({ completions: [{ courseId: 'c1', title: 'A', finished: 0 }, { courseId: 'c2', title: 'B', finished: 9 }], badges: 2 }))
      .toEqual(['9 people finished B on Etyme', 'Fewer than 5 badges earned on Etyme'])
  })
})

describe('featured courses', () => {
  const avail = COURSES.map((c) => ({ id: c.id, title: c.title, hours: c.duration }))
  it('come in the Owner’s order', () => {
    expect(featuredIn(['c2', 'c1'], avail).map((c) => c.id)).toEqual(['c2', 'c1'])
  })
  it('leave out a course that is not the firm’s public course, and a repeat', () => {
    expect(featuredIn(['zzz', 'c1', 'c1'], avail).map((c) => c.id)).toEqual(['c1'])
  })
})

describe('the door reads the record', () => {
  it('proof counts equal the record’s counts', async () => {
    h.courses = COURSES; h.done = [{ courseId: 'c2', _count: { _all: 12 } }, { courseId: 'c1', _count: { _all: 3 } }]; h.badges = 20
    const d = await readDoorLearn({ id: 'co1', featuredCourseIds: ['c2'] })
    expect(d.proof).toEqual(['Fewer than 5 people finished Working with AI on Etyme', '12 people finished Spark basics on Etyme', '20 badges earned on Etyme'])
    expect(d.featured.map((c) => c.title)).toEqual(['Spark basics'])
  })
  it('no person is read, so no name can reach the page', async () => {
    h.courses = COURSES; h.done = [{ courseId: 'c2', _count: { _all: 12 } }]; h.badges = 6
    const d = await readDoorLearn({ id: 'co1', featuredCourseIds: [] })
    expect(JSON.stringify(d)).not.toMatch(/personId|email|Priya|name"/)
  })
  it('a firm with the plugin off is read for nothing at all', async () => {
    h.reads = []; h.company = firm([])
    const s = await publicSite('tapin')
    expect(s!.doorLearn).toBeUndefined()
    expect(h.reads).toEqual([])
  })
  it('a firm with the plugin on carries its door section', async () => {
    h.courses = COURSES; h.done = []; h.badges = 0; h.company = firm(['TRAIN_TO_BENCH'], { featuredCourseIds: ['c3'] })
    const s = await publicSite('tapin')
    expect(s!.doorLearn!.featured.map((c) => c.title)).toEqual(['SQL first steps'])
    expect(s!.doorLearn!.proof).toEqual([])
  })
})

const BRANDING = { logoRef: null, primaryColor: '#1F3A5F', secondaryColor: '#B4531A', fontPairing: 'SERIF_SANS' }
const approved = {
  sitePrimaryColor: BRANDING.primaryColor, siteSecondaryColor: BRANDING.secondaryColor, siteFontPairing: BRANDING.fontPairing,
  siteBrandingApprovedAt: new Date('2026-11-20'), siteBrandingApprovedHash: brandingFingerprint(BRANDING),
}
function site(over: Partial<PublicSite> = {}, stored: Row = {}): PublicSite {
  return {
    name: 'Tapin', slug: 'tapin', does: 'supplies contract staff', kind: 'VENDOR', audience: 'TALENT_AND_BUYERS',
    locations: [], track: { placements: 0, activeNow: 0, clients: 0, isNew: true }, skills: [], credentials: [],
    verifiedDomain: null, inNetwork: false, liveSince: '2026-10-29',
    tagline: 'Data engineers.', intro: 'A small bench firm.', headings: {}, writtenBy: 'RULES',
    openPositions: [], reputation: null, comingFree: [], comingFreeSummary: null,
    joinBench: false, askBox: false, contact: null, courses: [], learnOpen: true,
    look: lookFor({ siteTemplate: 'ASK_FIRST', ...stored }),
    doorLearn: {
      featured: [{ id: 'c2', title: 'Spark basics', hours: 12 }],
      proof: ['12 people finished Spark basics on Etyme', 'Fewer than 5 badges earned on Etyme'],
      offer: DOOR_OFFER,
    },
    ...over,
  }
}
const draw = (s: PublicSite) => renderToStaticMarkup(createElement(SiteView, { site: s }))

describe('the door drawn', () => {
  it('shows the featured courses and the proof lines where the plugin is on', () => {
    const html = draw(site())
    expect(html).toContain('Featured courses')
    expect(html).toContain('Spark basics')
    expect(html).toContain('12 people finished Spark basics on Etyme')
    expect(html).toContain('Fewer than 5 badges earned on Etyme')
    expect(html).toContain('No names')
  })
  it('shows nothing of it where the plugin is off, even if the record carried it', () => {
    const html = draw(site({ learnOpen: false }))
    expect(html).not.toContain('Featured courses')
    expect(html).not.toContain('finished Spark basics')
    expect(html).not.toContain('/learn/')
  })
  it('shows no proof section where there is nothing to count', () => {
    const html = draw(site({ doorLearn: { featured: [], proof: [], offer: DOOR_OFFER } }))
    expect(html).not.toContain('What people finished here')
    expect(html).not.toContain('Featured courses')
  })
  it('both sections are placed by the engine in every template', () => {
    const present = ['learn', 'featured', 'proof'] as const
    for (const t of ['ASK_FIRST', 'FEED', 'BOARD'] as const) expect(orderFor(t, [...present])).toEqual(['learn', 'featured', 'proof'])
  })
  it('the featured cards take the tenant’s own color only while the Owner’s yes holds', () => {
    expect(draw(site({}, approved))).toContain('background-color:#B4531A')
    expect(draw(site({}, { ...approved, sitePrimaryColor: '#000000' }))).not.toContain('#B4531A')
  })
  it('the one animation is a response to pointing and stands still under reduced motion', () => {
    const html = draw(site())
    expect(html).toContain('group-hover:w-full')
    expect(html).toContain('motion-reduce:transition-none')
    expect(html).not.toMatch(/animate-|@keyframes|autoplay/)
  })
  it('the applicant is told getting ready is optional, apart from applying, and never shown to a client', () => {
    const html = draw(site())
    expect(html).toMatch(/optional and separate from applying/)
    expect(html).toContain('shown to a client')
  })
  it('nothing on the door reads as a price, a coin, a prize, a chance or a ranking', () => {
    const html = draw(site())
    expect(html).not.toMatch(/\$\d|price|coin|currency|purchase|buy |chance|prize|leaderboard|rank|reward/i)
  })
  it('the door’s own words stay short and name no company but the tenant', () => {
    const words = DOOR_OFFER.split(/\s+/).length
    expect(words).toBeLessThan(26)
    const src = ['door-proof.ts', 'door-proof-read.ts'].map((f) => readFileSync(join(process.cwd(), 'src/lib/public-site', f), 'utf8')).join('\n')
    expect(src).not.toMatch(/leaderboard|\bcoins?\b|\bprice\b|purchase/i)
  })
})
