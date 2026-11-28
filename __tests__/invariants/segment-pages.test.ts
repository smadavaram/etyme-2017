/**
 * The six segment pages of the owner's sales-ready batch, 2026-11-22
 * (docs/decisions/110, item 2): prime vendors, sub-vendors, bench vendors,
 * solopreneurs, integrators and contractors, each at a plain address a
 * salesperson can send.
 *
 * Two are standing doors. The other four are one tab of a standing door
 * each, drawn at an address of its own (`SEGMENT_PAGES` in
 * lib/public-site/parties). The sentences below are what was built, read
 * against the data and against each page as the server draws it.
 */
import { describe, it, expect, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }))
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PARTY_PAGES, SEGMENT_PAGES, SEGMENT_ROUTES, copyOfPartyPage, everyDoorView, partyAt, segmentAt, segmentView, tabAddress, tabHref,
} from '@/lib/public-site/parties'
import { PartyPageView, SegmentPageView, partyMetadata, segmentMetadata } from '@/lib/public-site/party-page'
import { PUBLIC_PAGES, pageAt } from '@/lib/public-site/pages'
import { DOOR_MAPS } from '@/lib/public-site/door-maps'
import { FIRM_NAMES } from '@/lib/public-site/door-map-seed'
import { STORIES } from '@/lib/public-site/story'
import { CATEGORY, FOOTER_LINKS, MOST_WORDS, SECURITY, bandWords, countWords } from '@/lib/public-site/skeleton-words'
import {
  check, namedCompanies, priceClaims, sizesTheBuyer, unverifiableClaims, vendorManagementSystem, wordsNobodyUses, britishSpellings,
  readsAsAimedAtSuppliers, longSentences,
} from '@/lib/positioning'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const draw = (slug: (typeof SEGMENT_PAGES)[number]['slug'], q: { tab?: string; seat?: string } = {}) =>
  renderToStaticMarkup(createElement(SegmentPageView, { slug, params: { searchParams: q } }))
const words = (s: (typeof SEGMENT_PAGES)[number]) => copyOfPartyPage(partyAt(s.door)!, s.tab)
const text = (s: (typeof SEGMENT_PAGES)[number]) => { const c = words(s); return [...c.hero, ...c.body].join(' ') }
const hrefs = (page: string) => [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))

describe('Six segment pages, each at its own plain address', () => {

  it('the six addresses are /for/prime-vendors, /for/subvendors, /for/bench, /for/solopreneurs, /for/integrators and /for/contractors, and each has a route file on the public list', () => {
    expect([...SEGMENT_ROUTES]).toEqual([
      '/for/prime-vendors', '/for/subvendors', '/for/bench', '/for/solopreneurs', '/for/integrators', '/for/contractors',
    ])
    for (const route of SEGMENT_ROUTES) {
      const page = pageAt(route)
      expect(page?.kind, route).toBe('PARTY')
      expect(existsSync(join(ROOT, page!.routeFile)), `${route} has no route file`).toBe(true)
    }
    // Four are new; the other two are doors that already stood.
    expect(SEGMENT_PAGES.map((s) => s.route)).toEqual(SEGMENT_ROUTES.slice(0, 4))
    expect(PARTY_PAGES.map((p) => p.route)).toEqual(expect.arrayContaining(SEGMENT_ROUTES.slice(4)))
  })

  it('the four standing doors still stand at their own addresses, and ?tab= still opens each tab', () => {
    expect(PARTY_PAGES.map((p) => p.route)).toEqual(['/for/suppliers', '/for/program-offices', '/for/integrators', '/for/contractors'])
    expect(everyDoorView().map((v) => v.href)).toEqual([
      '/for/suppliers', '/for/suppliers?tab=sub', '/for/suppliers?tab=bench',
      '/for/program-offices', '/for/integrators', '/for/contractors', '/for/contractors?tab=solo',
    ])
    const sub = renderToStaticMarkup(createElement(PartyPageView, { slug: 'suppliers', params: { searchParams: { tab: 'sub' } } }))
    expect(sub).toContain('Bill from the same approved week as your prime.')
  })

  it('each new page is a route of at most four lines that names its own segment, and never reads its tab from the address', () => {
    for (const s of SEGMENT_PAGES) {
      const route = read(pageAt(s.route)!.routeFile)
      expect(route.trim().split('\n').length, s.route).toBeLessThanOrEqual(4)
      expect(route, s.route).toContain(`<SegmentPageView slug="${s.slug}" params={params}`)
      expect(route, s.route).toContain(`segmentMetadata('${s.slug}')`)
      // A stray ?tab= on a segment's address changes nothing.
      expect(draw(s.slug, { tab: 'nonsense' }), s.route).toBe(draw(s.slug))
      expect(draw(s.slug, { tab: s.tab === 'sub' ? 'bench' : 'sub' }), s.route).toBe(draw(s.slug))
    }
  })

  it('a prime vendor, a sub-vendor, a bench vendor and a solopreneur each read the words the founder wrote for them, the same at both addresses', () => {
    // One party is never told two things. The segment's words are its
    // door tab's, so every guard that reads the tab reads the segment.
    expect(Object.fromEntries(SEGMENT_PAGES.map((s) => [s.route, [segmentView(s).headline, segmentView(s).purpose]]))).toEqual({
      '/for/prime-vendors': ['Fill your client’s jobs through every sub-vendor at once, and keep your client yours.', 'Each sub-vendor sees its own rate. Your client’s name is yours to share.'],
      '/for/subvendors': ['Bill from the same approved week as your prime.', 'Your rates and your people stay yours.'],
      '/for/bench': ['Your whole bench in front of every firm you sell to, at once.', 'Each person by their own consent.'],
      '/for/solopreneurs': ['What a 50-person firm runs on: timesheets, bills, papers. For a firm of one.', 'File your week, bill your client, get paid.'],
    })
    for (const s of SEGMENT_PAGES) {
      const twin = everyDoorView().find((v) => v.slug === s.door && v.tab?.key === s.tab)!
      const { href: _a, ...mine } = segmentView(s)
      const { href: _b, ...theirs } = twin
      expect(mine, s.route).toEqual(theirs)
    }
  })

  it('each new page sells its party its own next step: add a client, ask your prime to link, put your bench on Etyme, record the contract you have', () => {
    expect(Object.fromEntries(SEGMENT_PAGES.map((s) => { const v = segmentView(s); return [s.route, [bandWords(v.band, v.bandSays).heading, v.signUp.href]] }))).toEqual({
      '/for/prime-vendors': ['Seen enough? Add a client you work with.', '/signup?type=prime'],
      '/for/subvendors': ['Seen enough? Ask your prime to link.', '/signup?type=sub'],
      '/for/bench': ['Seen enough? Put your bench on Etyme.', '/signup?type=bench'],
      '/for/solopreneurs': ['Seen enough? Record the contract you have.', '/signup?type=solo'],
    })
    for (const s of SEGMENT_PAGES) {
      const page = draw(s.slug)
      expect(page, s.route).toContain(bandWords(segmentView(s).band, segmentView(s).bandSays).heading)
      expect(hrefs(page), s.route).toContain(segmentView(s).signUp.href)
    }
  })
})

describe('Each new page is the door’s own shape', () => {

  it('each new page draws the category line, one headline, the panel, at most three lines, the sign-up band, one security line and the one-row footer, in that order', () => {
    for (const s of SEGMENT_PAGES) {
      const page = draw(s.slug)
      const v = segmentView(s)
      expect(page.match(/<h1/g), s.route).toHaveLength(1)
      expect(v.lines.length, s.route).toBeLessThanOrEqual(3)
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')
      const order = [CATEGORY, v.headline, v.purpose, 'id="demo"', 'id="lines"', v.lines[0], v.lines[2], bandWords(v.band, v.bandSays).heading, SECURITY.line, '<footer']
        .map((t) => page.indexOf(esc(t)))
      expect(order.every((i) => i > 0), `${s.route} ${JSON.stringify(order)}`).toBe(true)
      expect([...order].sort((a, b) => a - b), s.route).toEqual(order)
      // The one-row footer, all thirteen links.
      const footer = page.slice(page.indexOf('<footer'))
      for (const l of FOOTER_LINKS) expect(hrefs(footer), `${s.route} footer lacks ${l.t}`).toContain(l.href)
    }
  })

  it(`no new page carries more than ${MOST_WORDS} words between its header and its footer, and none is a stub`, () => {
    for (const s of SEGMENT_PAGES) {
      const c = words(s)
      const n = countWords([...c.hero, ...c.body])
      expect(n, `${s.route} carries ${n} words`).toBeLessThanOrEqual(MOST_WORDS)
      expect(n, `${s.route} carries ${n} words`).toBeGreaterThan(100)
      for (const l of segmentView(s).lines) expect(l.split(/\s+/).length, `${s.route}: ${l}`).toBeLessThanOrEqual(22)
    }
  })

  it('every new page ends in the shared public footer, the one place page analytics is drawn, and no signed-in screen draws that footer', () => {
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame.slice(frame.indexOf('export function HomeFooter'), frame.indexOf('function FooterRow'))).toContain('<Analytics />')
    expect(read('src/lib/public-site/skeleton.tsx')).toMatch(/export function SkeletonFooter\(\) \{\s*return <HomeFooter/)
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('<SkeletonFooter />')
    const view = read('src/lib/public-site/party-page.tsx')
    expect(view).toContain('<SubPageView')
    expect(view).toContain('return <PartyPageView slug={s.door} params={params} facts={facts} segment={s} />')
    // Nothing under the dashboard imports the public frame or the package.
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []))
    for (const f of [...walk('src/app/dashboard'), ...walk('src/app/(auth)'), 'src/app/layout.tsx']) {
      expect(read(f), f).not.toMatch(/@vercel\/analytics|HomeFooter|SkeletonFooter|SiteFooter|SiteFrame/)
    }
  })
})

describe('Each new page plays its own party’s named person, read against the seed', () => {
  const SEED = readdirSync(join(ROOT, 'src/lib')).filter((f) => /^seed.*\.ts$/.test(f)).map((f) => read(`src/lib/${f}`)).join('\n')

  it('a prime vendor watches the account manager at the prime, a sub-vendor the owner of the sub-vendor, a bench vendor its recruiter, and a solopreneur the nurse who owns her own firm', () => {
    expect(Object.fromEntries(SEGMENT_PAGES.map((s) => [s.route, [segmentView(s).story, segmentView(s).step]]))).toEqual({
      '/for/prime-vendors': ['brightmoor', 'submit'],
      '/for/subvendors': ['tecwyn-sub', 'approve'],
      '/for/bench': ['tecwyn-bench', 'submit'],
      '/for/solopreneurs': ['byrne', 'pay'],
    })
    for (const s of SEGMENT_PAGES) {
      const v = segmentView(s)
      // "You are watching <person>[, <what she is>] at|of <firm>, a demo company, not a customer."
      const m = /^You are watching ([^,]+?)(?:, [^,]+?)? (?:at|of) (.+), a demo company, not a customer\.$/.exec(v.label!)
      expect(m, `${s.route}: ${v.label}`).not.toBeNull()
      const [, person, firm] = m!
      expect(SEED, `${s.route} names ${person}, whom the seed does not write`).toContain(person)
      expect(SEED, `${s.route} names ${firm}, which the seed does not write`).toContain(firm)
      // The line is on the drawn page, and the panel's first speaker is the same person.
      expect(draw(s.slug), s.route).toContain(v.label!.replace(/'/g, '&#x27;'))
      expect(STORIES[v.story!].steps.some((st) => st.who.startsWith(person)), `${s.route}: the panel plays somebody other than ${person}`).toBe(true)
    }
  })

  it('the sub-vendor’s and the bench vendor’s firm is named from the one copy of the seed’s name, never typed on the page', () => {
    const src = read('src/lib/public-site/parties.ts') + read('src/lib/public-site/story.ts')
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
    expect(code).not.toContain(`'${FIRM_NAMES.tecwyn}'`)
    expect(code).not.toMatch(new RegExp(`['\`][^'\`\\n]*${FIRM_NAMES.tecwyn}[^'\`\\n$]*['\`]`))
    for (const s of SEGMENT_PAGES.filter((x) => x.tab === 'sub' || x.tab === 'bench')) {
      expect(segmentView(s).label, s.route).toContain(FIRM_NAMES.tecwyn)
      expect(STORIES[segmentView(s).story!].bar.company, s.route).toBe(FIRM_NAMES.tecwyn)
    }
    // And that one copy is the seed's own spelling.
    expect(read('src/lib/seed-world.ts')).toContain(`slug: 'tecwyn',         name: '${FIRM_NAMES.tecwyn}'`)
  })

  it('each new page draws the same map as its door’s tab, and a seat on it links to the page’s own address', () => {
    for (const s of SEGMENT_PAGES) {
      const door = partyAt(s.door)!
      const at = DOOR_MAPS[tabHref(door, s.tab)]
      expect(at, s.route).toBeDefined()
      const inside = hrefs(draw(s.slug)).filter((h) => h.includes('seat='))
      for (const h of inside) expect(h.startsWith(`${s.route}?seat=`), `${s.route} links a seat to ${h}`).toBe(true)
    }
    // A sub-vendor's page opens on its owner and offers its recruiter at the page's own address.
    expect(hrefs(draw('subvendors'))).toContain('/for/subvendors?seat=recruiter')
    expect(draw('subvendors', { seat: 'recruiter' })).toMatch(/aria-current="true"[^>]*>Recruiter</)
    expect(hrefs(draw('prime-vendors'))).toContain('/for/prime-vendors?seat=account')
  })
})

describe('Each new page is reached from the door it belongs to, and found by its own address', () => {

  it('a door’s tab row sends a reader to each plain address, and the open tab is marked on the new page', () => {
    const suppliers = partyAt('suppliers')!
    const workers = partyAt('contractors')!
    expect(suppliers.tabs!.map((t) => [t.label, tabAddress(suppliers, t.key)])).toEqual([
      ['Prime vendor', '/for/prime-vendors'], ['Sub-vendor', '/for/subvendors'], ['Bench vendor', '/for/bench'],
    ])
    // A worker has no page beside the door, so the Worker tab stays the door's own address.
    expect(workers.tabs!.map((t) => [t.label, tabAddress(workers, t.key)])).toEqual([
      ['Worker', '/for/contractors'], ['Solopreneur', '/for/solopreneurs'],
    ])
    const door = renderToStaticMarkup(createElement(PartyPageView, { slug: 'suppliers', params: { searchParams: {} } }))
    for (const r of ['/for/prime-vendors', '/for/subvendors', '/for/bench']) expect(hrefs(door), r).toContain(r)
    expect(hrefs(renderToStaticMarkup(createElement(PartyPageView, { slug: 'contractors', params: { searchParams: {} } })))).toContain('/for/solopreneurs')
    const current = (page: string) => [...page.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1])
    expect(SEGMENT_PAGES.map((s) => current(draw(s.slug)))).toEqual([['Prime vendor'], ['Sub-vendor'], ['Bench vendor'], ['Solopreneur']])
    // The suppliers' and workers' doors are in the footer of every public page, so each new page is two clicks from anywhere.
    for (const s of SEGMENT_PAGES) expect(FOOTER_LINKS.map((l) => l.href), s.route).toContain(partyAt(s.door)!.route)
  })

  it('every link on a new page goes to a page that exists', () => {
    for (const s of SEGMENT_PAGES) {
      for (const h of hrefs(draw(s.slug)).filter((x) => x.startsWith('/'))) {
        const path = h.split('#')[0].split('?')[0]
        const known = pageAt(path) !== null || ['/login', '/signup', '/demo'].includes(path) || path.startsWith('/embed/demo') || path.startsWith('/_next') || /\.(svg|png|ico)$/.test(path)
        expect(known, `${s.route} links to ${h}`).toBe(true)
      }
    }
  })

  it('each new page has its party’s name as its title, its own line as its description, and its own address as the canonical one', () => {
    expect(SEGMENT_PAGES.map((s) => segmentMetadata(s.slug))).toEqual([
      { title: 'For prime vendors', description: 'Each sub-vendor sees its own rate. Your client’s name is yours to share.', alternates: { canonical: '/for/prime-vendors' } },
      { title: 'For sub-vendors', description: 'Your rates and your people stay yours.', alternates: { canonical: '/for/subvendors' } },
      { title: 'For bench vendors', description: 'Each person by their own consent.', alternates: { canonical: '/for/bench' } },
      { title: 'For solopreneurs', description: 'File your week, bill your client, get paid.', alternates: { canonical: '/for/solopreneurs' } },
    ])
    // The door's ?tab= twin names the plain address as canonical; the door itself is unchanged.
    expect(partyMetadata('suppliers', { searchParams: { tab: 'sub' } }).alternates).toEqual({ canonical: '/for/subvendors' })
    expect(partyMetadata('contractors', { searchParams: { tab: 'solo' } }).alternates).toEqual({ canonical: '/for/solopreneurs' })
    expect(partyMetadata('suppliers').alternates).toBeUndefined()
    expect(partyMetadata('integrators').alternates).toBeUndefined()
    // No title carries the product's name twice: the layout adds it.
    for (const s of SEGMENT_PAGES) expect(String(segmentMetadata(s.slug).title), s.route).not.toMatch(/Etyme/)
    // The public list is what the positioning guard walks; a segment is on it once.
    for (const s of SEGMENT_PAGES) expect(PUBLIC_PAGES.filter((p) => p.route === s.route), s.route).toHaveLength(1)
    expect(segmentAt('suppliers')).toBeNull()
  })
})

describe('No new page says what a public page may not', () => {

  it('no new page quotes a price, a company-size range, a promised result, a real company, or a word nobody uses', () => {
    for (const s of SEGMENT_PAGES) {
      const t = text(s)
      expect(priceClaims(t), s.route).toEqual([])
      expect(sizesTheBuyer(t), s.route).toEqual([])
      expect(unverifiableClaims(t), s.route).toEqual([])
      expect(namedCompanies(t), s.route).toEqual([])
      expect(vendorManagementSystem(t), s.route).toEqual([])
      expect(wordsNobodyUses(t), s.route).toEqual([])
      expect(britishSpellings(t), s.route).toEqual([])
      expect(readsAsAimedAtSuppliers(t), s.route).toEqual([])
      expect(t, s.route).not.toMatch(/\b(?:best|leading|fastest|world-class|number one|#1)\b/i)
      expect(check(words(s)).filter((f) => ['neutrality', 'claims-no-stake', 'ai-first'].includes(f.rule)), s.route).toEqual([])
      const c = words(s)
      expect([...c.hero, ...c.body].flatMap((l) => longSentences(l, 25)), s.route).toEqual([])
    }
  })

  it('a page for suppliers may say prime and sub-vendor, and no page written to a client does', () => {
    expect(text(segmentAt('prime-vendors')!)).toMatch(/sub-vendor/)
    expect(text(segmentAt('subvendors')!)).toMatch(/\bprime\b/)
    // The home page is the client's.
    const home = read('src/lib/public-site/home-page-words.ts')
    expect(home).not.toMatch(/\bprime\b|sub-vendor|subvendor/i)
  })
})
