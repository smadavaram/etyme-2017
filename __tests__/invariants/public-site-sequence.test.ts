import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  notFound: () => { throw new Error('not found') },
}))

import { STORY, storyIndex } from '@/lib/public-site/story'
import { STEPS, SPINE_ORDER } from '@/lib/public-site/steps'
import { MODULES } from '@/lib/public-site/modules'
import { ModulePageView } from '@/lib/public-site/module-page'
import { PartyPageView } from '@/lib/public-site/party-page'
import { PARTY_PAGES } from '@/lib/public-site/parties'
import {
  ProcessPageView, ProcessHomeView, TopicPageView, DocsHomeView, PartyDocView,
} from '@/lib/public-site/docs-page'
import { PROCESS, partiesFor, sectionsOf, processRoute } from '@/lib/public-site/docs/process'
import { TOPICS, topicRoute } from '@/lib/public-site/docs/topics'
import { PARTIES, DOCS_HOME, docRoutes } from '@/lib/public-site/docs/index'
import { NAV_MENUS, FOOTER, ROLES, PRODUCT_STAGES, itemsOf } from '@/lib/public-site/nav'
import { PUBLIC_PAGES, MODULE_ROUTES, pageAt } from '@/lib/public-site/pages'
import { demoRequest } from '@/lib/public-site/demo-link'
import { DESKS } from '@/lib/demo-desks'
import { CLIENT_DESKS } from '@/app/demo/seats'
import { longSentences } from '@/lib/positioning'
import type { DemoTarget, FlowBox } from '@/lib/public-site/flow'

/**
 * The public site and the documentation follow one sequence.
 *
 * Decided by the founder on 2026-09-30, after the home page's four steps
 * landed readers "abruptly on sites in the middle of the page, with no
 * links to the previous or next content, and not explaining the complete
 * functional process". The sentences below are what was decided, read
 * against the pages as they are drawn.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const html = (el: any) => renderToStaticMarkup(el)

/** Every href a rendered page carries. */
const hrefs = (page: string) => [...page.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))

/** Every string literal given to an href in a source file. */
function hrefLiterals(src: string): string[] {
  return [
    ...[...src.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/href=\{['"`]([^'"`]+)['"`]/g)].map((m) => m[1]),
    ...[...src.matchAll(/href:\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]),
  ]
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** A link into the middle of another page: a path, then a #. A bare #section is this page's own. */
const intoAnotherPage = (href: string) => /^\/[^#]*#/.test(href)

/** The words of a rendered page, one line per element that holds text. */
function linesOf(page: string): string[] {
  return page
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .split(/<\/(?:p|li|h1|h2|h3|figcaption|a|span|td|th)>/)
    .map((l) => l.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const boxesSayWho = (boxes: FlowBox[]) => boxes.every((b) => b.who !== undefined)

// ────────────────────────────────────────────────────────────────────────

describe('The four steps are the one spine of the site', () => {

  it('the home page walks the four steps as four chips on the panel, Job first, and the Platform menu draws the four steps with every part under its step', () => {
    // The founder's home page of 2026-10-14 replaced the three steps of
    // 2026-10-09 (Connect, Control, Reconcile) and the four step cards with
    // four chips; his "Build it" the same evening put them on the panel
    // that shows the product working, named Job, Candidates, Timesheets
    // and Invoices. The four steps stay the spine of the product pages
    // and the documentation, under the same names.
    const page = read('src/app/page.tsx')
    expect(STORY.map((s) => s.chip)).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices'])
    expect(STORY.map((s) => s.chip)).toEqual(STEPS.map((s) => s.name))
    expect(page).not.toContain('const HOW')
    expect(PRODUCT_STAGES.map((g) => g.items[0].href)).toEqual(STEPS.map((s) => s.route))
  })

  it('the first step is Job, never Hire, on every menu, page and chart', () => {
    // "Source, never Hire" (2026-09-30) is superseded by the founder's
    // four nouns (2026-10-14); a contingent worker is still never hired.
    expect(STEPS[0].name).toBe('Job')
    expect(PRODUCT_STAGES[0].heading).toBe('Step 1 · Job')
    expect(PROCESS[0].title.startsWith('Job')).toBe(true)
    for (const s of STEPS) expect(s.name, `step ${s.n}`).not.toMatch(/\bhire\b/i)
  })

  it('the header’s Platform menu and the product pages all read the four steps in one order', () => {
    expect(PRODUCT_STAGES.map((g) => g.items.map((i) => i.href))).toEqual(STEPS.map((s) => [s.route, ...s.more]))
    expect(MODULES.map((m) => m.route)).toEqual(SPINE_ORDER)
    expect([...MODULE_ROUTES]).toEqual(SPINE_ORDER)
    // Every product page is a step, or hangs under exactly one.
    for (const m of MODULES) {
      const homes = STEPS.filter((s) => s.route === m.route || s.more.includes(m.route))
      expect(homes, m.route).toHaveLength(1)
    }
  })

  // Until 2026-10-14 a step page said "Step n of 4" with Previous and
  // Next at its top and bottom, read what you do, the real screen, who is
  // involved and what happens next, and listed the pages under it as "More
  // in this step"; three sentences here held that. The founder put every
  // product page in the home page's shape that day, so the step is now the
  // screen the page's frame opens at, and the four chips under it walk the
  // rest. The step-by-step reading, with Previous and Next, is the
  // documentation's, held further down this file.
  it('every product page opens the panel at its own step, with the four chips on it so a reader can walk on', () => {
    for (const m of MODULES) {
      const page = html(createElement(ModulePageView, { m }))
      const own = STORY[storyIndex(m.step)]
      // The page's own step is the one shown before anything plays, and its chip is pressed.
      expect(page, m.route).toMatch(new RegExp(`data-story-step="${own.n}"(?! hidden)`))
      for (const s of STORY) expect(page, `${m.route} has the ${s.chip} chip`).toContain(`${s.chip}</button>`)
      expect(page, m.route).toMatch(new RegExp(`aria-pressed="true"[^>]*>(?:<span[^>]*>${own.n}</span>)${own.chip}</button>`))
      // And it is the step the Platform menu files the page under.
      const under = STEPS.find((s) => s.route === m.route || s.more.includes(m.route))!
      expect(own.n, m.route).toBe(under.n)
      expect(page, m.route).not.toContain('<iframe')
    }
  })
})

describe('“See this step in the demo” opens the exact screen as the right desk', () => {
  const targets: [string, DemoTarget][] = [
    ...STEPS.map((s) => [s.route, s.demo] as [string, DemoTarget]),
    ...MODULES.map((m) => [m.route, m.demo] as [string, DemoTarget]),
    ...PROCESS.filter((p) => p.demo).map((p) => [processRoute(p.slug), p.demo!] as [string, DemoTarget]),
    ...TOPICS.filter((t) => t.demo).map((t) => [topicRoute(t), t.demo!] as [string, DemoTarget]),
  ]

  it('every step has a demo door, and every product page has one too, under its frame', () => {
    for (const s of STEPS) expect(s.demo, s.route).toBeTruthy()
    for (const m of MODULES) expect(m.demo, m.route).toBeTruthy()
  })

  it('every demo door names a seeded client desk the demo door already seats, and a screen that exists', () => {
    const clientDesks = CLIENT_DESKS.map((d) => d.desk)
    for (const [where, t] of targets) {
      expect(t.as, where).toBe('world-nike')
      expect(DESKS as readonly string[], `${where}: ${t.desk}`).toContain(t.desk)
      expect(clientDesks, `${where}: ${t.desk}`).toContain(t.desk)
      expect(t.screen.startsWith('/dashboard/'), where).toBe(true)
      expect(existsSync(join(ROOT, 'src/app', t.screen, 'page.tsx')), `${where}: ${t.screen} has no page`).toBe(true)
    }
  })

  it('a click posts the desk to the existing demo door and then opens the step’s own screen', () => {
    const step = STEPS[2]
    expect(demoRequest(step.demo)).toEqual({
      url: '/api/demo',
      body: { as: 'world-nike', desk: 'hiring' },
      then: '/dashboard/timesheets',
    })
    // The timesheets page's button seats the same desk at the same screen.
    const m = MODULES.find((x) => x.route === step.route)!
    expect(demoRequest(m.demo)).toEqual(demoRequest(step.demo))
    // Without a script the same link still reaches the page of desks.
    const page = html(createElement(ModulePageView, { m }))
    const demo = page.slice(page.indexOf('id="demo"'))
    expect(demo).toMatch(/<a href="\/demo"/)
    // And every firm on the panel is said to be a demo company, under it.
    expect(demo).toContain('Every firm on this screen is a demo company, not a customer.')
  })
})

describe('No link lands in the middle of another page', () => {

  it('no link on the public site, the header or the footer goes to a section in the middle of another page', () => {
    const data = [
      ...NAV_MENUS.flatMap((m) => itemsOf(m).map((i) => i.href)),
      ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
      ...ROLES.map((r) => r.href),
      ...DOCS_HOME.parts.map((p) => p.href),
      ...DOCS_HOME.reference.map((p) => p.href),
      ...PARTIES.flatMap((p) => p.doc.thisParty.map((l) => l.href)),
      ...PARTIES.flatMap((p) => [...p.doc.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])),
    ]
    const sources = [
      join(ROOT, 'src/app/page.tsx'),
      ...walk(join(ROOT, 'src/lib/public-site')),
      ...walk(join(ROOT, 'src/app/(site)')),
    ].flatMap((f) => hrefLiterals(readFileSync(f, 'utf8')).map((h) => `${h} (${f.slice(ROOT.length + 1)})`))
    const found = [...data, ...sources].filter((h) => intoAnotherPage(h.split(' (')[0]))
    expect(found).toEqual([])
  })

  it('no drawn page under the documentation or the product links into the middle of another page', () => {
    const pages: [string, string][] = [
      ['/docs', html(createElement(DocsHomeView))],
      ['/docs/process', html(createElement(ProcessHomeView))],
      ...PROCESS.map((p) => [processRoute(p.slug), html(createElement(ProcessPageView, { slug: p.slug }))] as [string, string]),
      ...TOPICS.map((t) => [topicRoute(t), html(createElement(TopicPageView, { group: t.group, slug: t.slug }))] as [string, string]),
      ...PARTIES.map((p) => [`/docs/${p.doc.slug}`, html(createElement(PartyDocView, { doc: p.doc }))] as [string, string]),
      ...MODULES.map((m) => [m.route, html(createElement(ModulePageView, { m }))] as [string, string]),
      ...PARTY_PAGES.map((p) => [p.route, html(createElement(PartyPageView, { slug: p.slug }))] as [string, string]),
    ]
    for (const [route, page] of pages) {
      // One known exception, not ours to fix: the contractors' door seats a
      // candidate through the shared demo button (components/try-demo),
      // whose no-script fallback is /demo#candidate. With a script the
      // click seats the reader and never follows it. Reported to its owner.
      const bad = hrefs(page).filter(intoAnotherPage).filter((h) => !(route === '/for/contractors' && h === '/demo#candidate'))
      expect(bad, route).toEqual([])
      // And every link inside the site goes to a page that exists.
      for (const h of hrefs(page).filter((x) => x.startsWith('/') && !x.startsWith('/model/') && !x.startsWith('/screens/'))) {
        // The frame's own screens and the sign-up form, with the party it
        // opens on, are pages too, outside the marketing list.
        const own = h.startsWith('/embed/demo') || h.split('?')[0] === '/signup'
        const path = h.split('#')[0]
        // Never /census: it is linked from nowhere since 2026-10-14.
        expect(path, `${route} links to the census`).not.toBe('/census')
        expect(pageAt(path) !== null || own || ['/login', '/demo'].includes(path), `${route} links to ${h}`).toBe(true)
      }
    }
  })
})

describe('The documentation is split in three: the process, master data and recruiting', () => {

  it('the process runs from a job request to pay and the end of the work, in the order of the four steps', () => {
    expect(PROCESS.map((p) => p.slug)).toEqual([
      'source-to-contract', 'contract-to-onboard', 'work-to-approve', 'expenses',
      'approve-to-bill', 'approve-to-pay', 'record-to-report', 'govern-and-protect', 'when-work-ends',
    ])
    // The stages tied to a step come in the steps' order.
    const tied = PROCESS.filter((p) => p.step !== null).map((p) => p.step!)
    expect([...tied].sort()).toEqual(tied)
    // Every step's process pages are real stages.
    for (const s of STEPS) for (const slug of s.process) expect(PROCESS.map((p) => p.slug), s.route).toContain(slug)
  })

  it('master data is customers, suppliers and consultants; recruiting is matching, screening and application tracking', () => {
    expect(TOPICS.filter((t) => t.group === 'master-data').map((t) => t.slug)).toEqual(['customers', 'suppliers', 'consultants'])
    expect(TOPICS.filter((t) => t.group === 'recruiting').map((t) => t.slug)).toEqual(['matching', 'screening', 'application-tracking'])
    expect(DOCS_HOME.parts.map((p) => p.t)).toEqual(['The process', 'Master data', 'Recruiting'])
  })

  it('every section of every party page is shown on a page of its own, so no fact was lost in the split', () => {
    const shown = new Set(PROCESS.map((p) => p.section).filter(Boolean))
    for (const { doc } of PARTIES) {
      for (const s of sectionsOf(doc)) {
        // The opening section stays on the party page; the client's one hire, on the process overview.
        if (s.id === null) continue
        if (doc.slug === 'client' && s.id === 'one-hire') continue
        expect(shown.has(s.id), `${doc.slug}#${s.id} is on no page`).toBe(true)
      }
      // And the pieces add back up to the page as written.
      expect(sectionsOf(doc).map((s) => s.html).join('').replace(/\s+/g, '')).toBe(doc.html.replace(/\s+/g, ''))
    }
    const overview = html(createElement(ProcessHomeView))
    expect(overview).toContain('/model/client-p2.png')
  })

  it('every party is a way to read the same process pages, and each of its stages is a page of its own', () => {
    for (const { doc } of PARTIES) {
      for (const l of doc.thisParty) expect(pageAt(l.href), `${doc.slug}: ${l.href}`).toBeTruthy()
    }
    for (const p of PROCESS) {
      for (const d of partiesFor(p)) expect(pageAt(processRoute(p.slug, d.slug)), `${p.slug} as ${d.slug}`).toBeTruthy()
    }
    for (const r of docRoutes()) expect(pageAt(r), r).toBeTruthy()
    expect(PUBLIC_PAGES.filter((p) => p.route.startsWith('/docs/process/')).length).toBeGreaterThan(PROCESS.length)
  })
})

describe('Every process page is a flow chart first, then short lines', () => {
  const pages = [
    ...PROCESS.map((p) => ({ route: processRoute(p.slug), flow: p.flow, lines: p.lines, lede: p.lede, el: createElement(ProcessPageView, { slug: p.slug }) })),
    ...PROCESS.flatMap((p) => partiesFor(p).map((d) => ({ route: processRoute(p.slug, d.slug), flow: p.flow, lines: p.lines, lede: p.lede, el: createElement(ProcessPageView, { slug: p.slug, party: d.slug }) }))),
    ...TOPICS.map((t) => ({ route: topicRoute(t), flow: t.flow, lines: t.lines, lede: t.lede, el: createElement(TopicPageView, { group: t.group, slug: t.slug }) })),
  ]

  it('every process, master data and recruiting page opens with a flow chart, before any line of its own', () => {
    for (const p of pages) {
      const page = html(p.el)
      const main = page.slice(page.indexOf('<h1'))
      const chart = main.indexOf('data-flow-chart')
      expect(chart, `${p.route} has no flow chart`).toBeGreaterThan(0)
      // Nothing but the lede and the side menu between the heading and the chart.
      const firstLine = main.indexOf(p.lines[0].replace(/’/g, '&#x27;').slice(0, 20))
      expect(chart, p.route).toBeLessThan(firstLine > 0 ? firstLine : main.indexOf(p.lines[0].slice(0, 12)))
      expect(p.flow.length, p.route).toBeGreaterThanOrEqual(3)
      expect(p.flow.length, p.route).toBeLessThanOrEqual(7)
      expect(boxesSayWho(p.flow), `${p.route}: a box that does not say who does it`).toBe(true)
    }
  })

  it('no line written for these pages runs past twenty-five words, and none is a paragraph', () => {
    for (const p of pages) {
      for (const l of [p.lede, ...p.lines, ...p.flow.map((b) => b.t)]) {
        expect(longSentences(l, 25), p.route).toEqual([])
        expect(l.split(/(?<=[.!?])\s+/).length, `${p.route}: “${l}” is a paragraph`).toBeLessThanOrEqual(2)
      }
    }
    for (const s of STEPS) {
      for (const l of [s.next, ...s.involved.map((i) => i.does), ...s.flow.map((b) => b.t)]) {
        expect(longSentences(l, 25), s.route).toEqual([])
      }
    }
  })

  it('no drawn process page carries a paragraph of its own words over twenty-five words', () => {
    for (const p of pages) {
      const page = html(p.el)
      // The drawings’ own captions and tables are the party pages’, held by their own test.
      const own = page.slice(0, page.indexOf('class="etyme-docs') > 0 ? page.indexOf('class="etyme-docs') : undefined)
      const long = linesOf(own).flatMap((l) => longSentences(l, 25))
      expect(long, p.route).toEqual([])
    }
  })

  it('every process page shows the whole process, with “you are here” on the reader’s place', () => {
    for (const p of PROCESS) {
      const page = html(createElement(ProcessPageView, { slug: p.slug }))
      expect(page, p.slug).toContain('The whole process')
      expect(page, p.slug).toMatch(new RegExp(`href="${processRoute(p.slug)}" aria-current="page"`))
      expect(page, p.slug).toContain('You are here')
      for (const q of PROCESS) expect(page, `${p.slug} lists ${q.slug}`).toContain(`href="${processRoute(q.slug)}"`)
      expect(page.match(/data-prev-next="(top|bottom)"/g), p.slug).toHaveLength(2)
    }
  })

  it('a process page read as one party switches between the parties, and Previous and Next stay with that party', () => {
    const p = PROCESS.find((x) => x.slug === 'work-to-approve')!
    const page = html(createElement(ProcessPageView, { slug: p.slug, party: 'sub-vendor' }))
    expect(page).toContain('Read it as')
    for (const d of partiesFor(p)) expect(page).toContain(`href="${processRoute(p.slug, d.slug)}"`)
    expect(page).toContain(`href="${processRoute('contract-to-onboard', 'sub-vendor')}" rel="prev"`)
    expect(page).toContain(`href="${processRoute('expenses', 'sub-vendor')}" rel="next"`)
  })
})
