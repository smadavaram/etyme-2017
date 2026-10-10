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

import { STEPS, SPINE_ORDER } from '@/lib/public-site/steps'
import { MODULES } from '@/lib/public-site/modules'
import { MORE_DEMO } from '@/lib/public-site/more-demo'
import { StepPageView, MorePageView } from '@/lib/public-site/module-page'
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

  it('the home page summarizes the four steps as three — Connect, Control, Reconcile — and its Platform band still draws the four steps with every part under its step', () => {
    // The founder's brief, 2026-10-09: the four steps stay the spine of the
    // product pages and the documentation; the home page says them as three.
    const page = read('src/app/page.tsx')
    const how = page.slice(page.indexOf('const HOW'), page.indexOf('const SECURITY_DONE'))
    expect([...how.matchAll(/n: '0\d', t: '([^']+)'/g)].map((m) => m[1])).toEqual(['Connect', 'Control', 'Reconcile'])
    expect(page).toContain('Read the whole process, step by step')
    expect(page).toContain('PRODUCT_STAGES.map((stage)')
    expect(PRODUCT_STAGES.map((g) => g.items[0].href)).toEqual(STEPS.map((s) => s.route))
  })

  it('the first step is Source, never Hire, on every menu, page and chart', () => {
    expect(STEPS[0].name).toBe('Source')
    expect(PRODUCT_STAGES[0].heading).toBe('Step 1 · Source')
    expect(PROCESS[0].title.startsWith('Source')).toBe(true)
    for (const s of STEPS) expect(s.name, `step ${s.n}`).not.toMatch(/\bhire\b/i)
  })

  it('the header’s Product menu, the home page’s tiles and the product pages all read the four steps in one order', () => {
    expect(PRODUCT_STAGES.map((g) => g.items.map((i) => i.href))).toEqual(STEPS.map((s) => [s.route, ...s.more]))
    expect(MODULES.map((m) => m.route)).toEqual(SPINE_ORDER)
    expect([...MODULE_ROUTES]).toEqual(SPINE_ORDER)
    // Every product page is a step, or hangs under exactly one.
    for (const m of MODULES) {
      const homes = STEPS.filter((s) => s.route === m.route || s.more.includes(m.route))
      expect(homes, m.route).toHaveLength(1)
    }
  })

  it('every step page says “Step n of 4” and has Previous and Next at its top and at its bottom', () => {
    for (const step of STEPS) {
      const m = MODULES.find((x) => x.route === step.route)!
      const page = html(createElement(StepPageView, { m, step }))
      expect(page, step.route).toContain(`Step ${step.n} of 4`)
      expect(page.match(/data-prev-next="top"/g), step.route).toHaveLength(1)
      expect(page.match(/data-prev-next="bottom"/g), step.route).toHaveLength(1)
      // Top before the heading, bottom after the demo.
      expect(page.indexOf('data-prev-next="top"')).toBeLessThan(page.indexOf('<h1'))
      expect(page.indexOf('See this step in the demo')).toBeLessThan(page.indexOf('data-prev-next="bottom"'))
      // Previous and Next are the neighbouring steps; the first comes from the overview, the last leads to the process.
      const before = STEPS.find((s) => s.n === step.n - 1)?.route ?? '/'
      const after = STEPS.find((s) => s.n === step.n + 1)?.route ?? '/docs/process'
      const links = hrefs(page)
      expect(links, step.route).toContain(before)
      expect(links, step.route).toContain(after)
      expect(page.match(new RegExp(`rel="prev" class="[^"]*" href="${before}"|href="${before}" rel="prev"`, 'g'))?.length ?? 0,
        `${step.route} Previous`).toBe(2)
      expect(page.match(new RegExp(`href="${after}" rel="next"`, 'g'))?.length ?? 0, `${step.route} Next`).toBe(2)
    }
  })

  it('every step page reads what you do, the real screen, who is involved and what happens next, and ends on the demo', () => {
    for (const step of STEPS) {
      const m = MODULES.find((x) => x.route === step.route)!
      const page = html(createElement(StepPageView, { m, step }))
      const at = ['What you do', 'data-flow-chart', 'The real screen', m.screen.img, 'Who is involved', 'What happens next', 'See this step in the demo']
        .map((t) => page.indexOf(t))
      expect(at.every((i) => i > 0), `${step.route}: ${JSON.stringify(at)}`).toBe(true)
      expect([...at].sort((a, b) => a - b), step.route).toEqual(at)
      expect(step.involved.length, step.route).toBeGreaterThanOrEqual(3)
      expect(boxesSayWho(step.flow), `${step.route}: a box that does not say who does it`).toBe(true)
    }
  })

  it('every product page under a step lists as “More in this step” and leads back to its step at its top and its bottom', () => {
    for (const step of STEPS) {
      const m = MODULES.find((x) => x.route === step.route)!
      const page = html(createElement(StepPageView, { m, step }))
      for (const route of step.more) {
        expect(page, `${step.route} lists ${route}`).toContain(`href="${route}"`)
        const under = MODULES.find((x) => x.route === route)!
        const more = html(createElement(MorePageView, { m: under, step }))
        expect(more, route).toContain(`More in step ${step.n} of 4`)
        expect(more, route).toMatch(new RegExp(`href="${step.route}" data-back-to-step="top"|data-back-to-step="top"[^>]*href="${step.route}"`))
        expect(more, route).toMatch(new RegExp(`href="${step.route}" data-back-to-step="bottom"|data-back-to-step="bottom"[^>]*href="${step.route}"`))
        expect(more.match(/data-prev-next="(top|bottom)"/g), route).toHaveLength(2)
      }
      if (step.more.length) expect(page, step.route).toContain('More in this step')
    }
  })
})

describe('“See this step in the demo” opens the exact screen as the right desk', () => {
  const targets: [string, DemoTarget][] = [
    ...STEPS.map((s) => [s.route, s.demo] as [string, DemoTarget]),
    ...Object.entries(MORE_DEMO),
    ...PROCESS.filter((p) => p.demo).map((p) => [processRoute(p.slug), p.demo!] as [string, DemoTarget]),
    ...TOPICS.filter((t) => t.demo).map((t) => [topicRoute(t), t.demo!] as [string, DemoTarget]),
  ]

  it('every step has a demo door, and every page under a step has one too', () => {
    for (const s of STEPS) expect(s.demo, s.route).toBeTruthy()
    for (const s of STEPS) for (const r of s.more) expect(MORE_DEMO[r], r).toBeTruthy()
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
    // Without a script the same link still reaches the page of desks.
    const m = MODULES.find((x) => x.route === step.route)!
    const page = html(createElement(StepPageView, { m, step }))
    const demo = page.slice(page.indexOf('id="demo"'))
    expect(demo).toMatch(/<a href="\/demo"/)
    // And the example is named with what it is, in the same sentence.
    expect(demo).toContain('Northbend Athletic, a demo company — not a customer')
  })
})

describe('No link lands in the middle of another page', () => {

  it('no link on the public site, the header or the footer goes to a section in the middle of another page', () => {
    const data = [
      ...NAV_MENUS.flatMap((m) => itemsOf(m).map((i) => i.href)),
      ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
      ...ROLES.map((r) => r.href),
      ...MODULES.map((m) => m.flow.href),
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
      ...STEPS.map((s) => [s.route, html(createElement(StepPageView, { m: MODULES.find((x) => x.route === s.route)!, step: s }))] as [string, string]),
    ]
    for (const [route, page] of pages) {
      const bad = hrefs(page).filter(intoAnotherPage)
      expect(bad, route).toEqual([])
      // And every link inside the site goes to a page that exists.
      for (const h of hrefs(page).filter((x) => x.startsWith('/') && !x.startsWith('/model/') && !x.startsWith('/screens/'))) {
        expect(pageAt(h) !== null || ['/login', '/demo', '/census'].includes(h), `${route} links to ${h}`).toBe(true)
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
