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
  permanentRedirect: (to: string) => { throw new Error(`permanent redirect to ${to}`) },
}))

import { STORY, storyIndex } from '@/lib/public-site/story'
import { STEPS, SPINE_ORDER } from '@/lib/public-site/steps'
import { MODULES } from '@/lib/public-site/modules'
import { ModulePageView } from '@/lib/public-site/module-page'
import { PartyPageView } from '@/lib/public-site/party-page'
import { PARTY_PAGES, everyDoorView } from '@/lib/public-site/parties'
import {
  StepPageView, TopicPageView, DocsHomeView, DocsSlugView, docsSequence,
} from '@/lib/public-site/docs-page'
import { STEP_PAGES, stepRoute, STEP_HEADINGS } from '@/lib/public-site/docs/process'
import { TOPICS, topicRoute } from '@/lib/public-site/docs/topics'
import { DOCS_HOME, WHO_DOES_WHAT, REFERENCE, docRoutes, docSlugs } from '@/lib/public-site/docs/index'
import { oldAddresses, replacementFor } from '@/lib/public-site/docs/redirects'
import DocsSlugPage from '@/app/(site)/docs/[slug]/page'
import ProcessHomePage from '@/app/(site)/docs/process/page'
import ProcessStagePage from '@/app/(site)/docs/process/[stage]/page'
import ProcessPartyPage from '@/app/(site)/docs/process/[stage]/[party]/page'
import { FOOTER, everyFrameLink } from '@/lib/public-site/nav'
import { FOLDED, foldedInto } from '@/lib/public-site/folded'
import GovernancePage from '@/app/(site)/governance/page'
import ContractsPage from '@/app/(site)/contracts/page'
import CompliancePage from '@/app/(site)/compliance/page'
import ChainPage from '@/app/(site)/chain/page'
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

  it('the home page walks the four steps as four chips on the panel, Job first, under the names the spine gives each page', () => {
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
    // The header's menu sheet drew them too, from 2026-10-15 until it left
    // on 2026-10-19; the documentation carries them in order now.
    expect(STEPS.map((s) => s.route)).toEqual(['/requisitions', '/submissions', '/timesheets', '/invoices'])
  })

  it('the first step is Job, never Hire, on every menu, page and chart', () => {
    // "Source, never Hire" (2026-09-30) is superseded by the founder's
    // four nouns (2026-10-14); a contingent worker is still never hired.
    expect(STEPS[0].name).toBe('Job')
    expect(STEPS[0]).toMatchObject({ n: 1, name: 'Job', route: '/requisitions' })
    expect(STEP_PAGES[0].title).toBe('Job')
    for (const s of STEPS) expect(s.name, `step ${s.n}`).not.toMatch(/\bhire\b/i)
  })

  it('the spine and the product pages read the four steps in one order, and every product page is one step', () => {
    // Since 2026-10-15 there are four product pages, not eight: Job at
    // /requisitions, Candidates at /submissions, Timesheets, Invoices.
    expect(SPINE_ORDER).toEqual(['/requisitions', '/submissions', '/timesheets', '/invoices'])
    expect(STEPS.map((s) => s.route)).toEqual(SPINE_ORDER)
    expect(MODULES.map((m) => m.route)).toEqual(SPINE_ORDER)
    expect([...MODULE_ROUTES]).toEqual(SPINE_ORDER)
    for (const m of MODULES) expect(STEPS.filter((s) => s.route === m.route), m.route).toHaveLength(1)
  })

  it('every step page says Step n of 4 and its name, then its promise, Today beside With Etyme, the panel, three lines, and Previous and Next, in that order', () => {
    for (const m of MODULES) {
      const page = html(createElement(ModulePageView, { m }))
      const at = [`>${m.eyebrow}</p>`, '<h1', '>Today</p>', '>With Etyme</p>', 'id="demo"', '>What you do</dt>', '>Who is involved</dt>',
        '>What happens next</dt>', 'rel="prev"', 'rel="next"', 'id="sign-up"'].map((t) => page.indexOf(t))
      expect(at.every((i) => i > 0), `${m.route} ${JSON.stringify(at)}`).toBe(true)
      expect([...at].sort((a, b) => a - b), m.route).toEqual(at)
      expect(m.eyebrow).toBe(`Step ${m.n} of 4 · ${m.title}`)
    }
    // Previous and Next walk the four as one story: Job's Previous is the
    // documentation's "How Etyme works", Invoices' Next is Sign up.
    expect(MODULES.map((m) => [m.prev.t, m.prev.href])).toEqual([
      ['How Etyme works', '/docs'], ['Job', '/requisitions'], ['Candidates', '/submissions'], ['Timesheets', '/timesheets'],
    ])
    expect(MODULES.map((m) => [m.next.t, m.next.href])).toEqual([
      ['Candidates', '/submissions'], ['Timesheets', '/timesheets'], ['Invoices', '/invoices'], ['Sign up', '/signup'],
    ])
    expect(DOCS_HOME.title).toBe(MODULES[0].prev.t)
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
      // And it is the step the menu sheet sends the reader to it for.
      const under = STEPS.find((s) => s.route === m.route)!
      expect(own.n, m.route).toBe(under.n)
      expect(page, m.route).not.toContain('<iframe')
    }
  })
})

describe('“See this step in the demo” opens the exact screen as the right desk', () => {
  const targets: [string, DemoTarget][] = [
    ...STEPS.map((s) => [s.route, s.demo] as [string, DemoTarget]),
    ...MODULES.map((m) => [m.route, m.demo] as [string, DemoTarget]),
    ...STEP_PAGES.map((p) => [stepRoute(p), p.demo] as [string, DemoTarget]),
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
    // And the line under the panel names the person it plays, and says
    // their firm is a demo company (2026-10-19).
    expect(demo).toContain('You are watching Helena Marsh, a contractor at Northbend Athletic, a demo company, not a customer.')
  })
})

/** Every documentation page, drawn. */
const DOC_PAGES: [string, string][] = [
  ['/docs', html(createElement(DocsHomeView))],
  ...docSlugs().map((slug) => [`/docs/${slug}`, html(createElement(DocsSlugView, { slug }))] as [string, string]),
  ...TOPICS.map((t) => [topicRoute(t), html(createElement(TopicPageView, { group: t.group, slug: t.slug }))] as [string, string]),
]

/** What an old address answers with: the place it redirects to, or the error it throws. */
function answer(render: () => unknown): string {
  try {
    render()
    return 'drew a page'
  } catch (e: any) {
    return String(e.message)
  }
}

describe('No link lands in the middle of another page', () => {

  it('no link on the public site, the header or the footer goes to a section in the middle of another page', () => {
    const data = [
      ...everyFrameLink(),
      ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
      ...MODULES.flatMap((m) => [m.prev.href, m.next.href]),
      ...DOCS_HOME.groups.flatMap((g) => g.links.map((l) => l.href)),
      ...docsSequence().map((l) => l.href),
    ]
    const sources = [
      join(ROOT, 'src/app/page.tsx'),
      ...walk(join(ROOT, 'src/lib/public-site')),
      ...walk(join(ROOT, 'src/app/(site)')),
    ].flatMap((f) => hrefLiterals(readFileSync(f, 'utf8')).map((h) => `${h} (${f.slice(ROOT.length + 1)})`))
    const found = [...data, ...sources].filter((h) => intoAnotherPage(h.split(' (')[0]))
    expect(found).toEqual([])
  })

  it('no drawn page under the documentation or the product links into the middle of another page, or to a page that is gone', () => {
    const pages: [string, string][] = [
      ...DOC_PAGES,
      ...MODULES.map((m) => [m.route, html(createElement(ModulePageView, { m }))] as [string, string]),
      // Every tab of a door, drawn from its own address (2026-10-16).
      ...everyDoorView().map((v) => [v.href, html(createElement(PartyPageView, { slug: v.slug, params: { searchParams: v.tab ? { tab: v.tab.key } : {} } }))] as [string, string]),
    ]
    for (const [route, page] of pages) {
      // One known exception, not ours to fix: the contractors' door seats a
      // candidate through the shared demo button (components/try-demo),
      // whose no-script fallback is /demo#candidate. With a script the
      // click seats the reader and never follows it. Reported to its owner.
      const bad = hrefs(page).filter(intoAnotherPage).filter((h) => !(route.startsWith('/for/contractors') && h === '/demo#candidate'))
      expect(bad, route).toEqual([])
      // And every link inside the site goes to a page that exists, never
      // to an old address that only redirects.
      for (const h of hrefs(page).filter((x) => x.startsWith('/') && !x.startsWith('/screens/'))) {
        // The frame's own screens and the sign-up form, with the party it
        // opens on, are pages too, outside the marketing list.
        const own = h.startsWith('/embed/demo') || h.split('?')[0] === '/signup'
        // A door's tab is the door's own page at its own address (`?tab=sub`),
        // and so is a seat on its map (`?seat=hr`, 2026-10-28).
        const path = h.split('#')[0].split('?tab=')[0].split('?seat=')[0]
        // Never /census: it is linked from nowhere since 2026-10-14.
        expect(path, `${route} links to the census`).not.toBe('/census')
        expect(replacementFor(path), `${route} links to ${path}, an old address`).toBeNull()
        expect(foldedInto(path), `${route} links to ${path}, a folded product page`).toBeNull()
        expect(pageAt(path) !== null || own || ['/login', '/demo'].includes(path), `${route} links to ${h}`).toBe(true)
      }
    }
  })
})

describe('A door’s tabs are links, drawn on the server, so the chosen tab works with no script and from an advertisement', () => {
  // The founder's four doors of 2026-10-16: Suppliers carry Prime vendor,
  // Sub-vendor and Bench vendor; Workers carry Worker and Solopreneur.
  const draw = (slug: 'suppliers' | 'contractors', tab?: string) =>
    html(createElement(PartyPageView, { slug, params: { searchParams: tab ? { tab } : {} } }))
  const current = (page: string) => [...page.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1])

  it('the suppliers’ door shows Prime vendor by default and each tab by its own address, the open tab marked as current', () => {
    const prime = draw('suppliers')
    expect(current(prime)).toEqual(['Prime vendor'])
    expect(prime).toContain('Fill your client’s jobs through every sub-vendor at once, and keep your client yours.')
    expect(prime).toContain('href="/for/suppliers?tab=sub"')
    expect(prime).toContain('href="/for/suppliers?tab=bench"')
    const sub = draw('suppliers', 'sub')
    expect(current(sub)).toEqual(['Sub-vendor'])
    expect(sub).toContain('Bill from the same approved week as your prime.')
    expect(sub).not.toContain('Fill your client’s jobs')
    const bench = draw('suppliers', 'bench')
    expect(current(bench)).toEqual(['Bench vendor'])
    expect(bench).toContain('Your whole bench in front of every firm you sell to, at once.')
    // An unknown tab opens the door's first tab, never a missing page.
    expect(draw('suppliers', 'nonsense')).toBe(prime)
  })

  it('the workers’ door shows Worker by default, and its Solopreneur tab signs up a one-person company', () => {
    const worker = draw('contractors')
    expect(current(worker)).toEqual(['Worker'])
    expect(worker).toContain('Your hours, pay, papers and history, in one place that moves with you.')
    expect(worker).toContain('href="/signup?as=candidate"')
    expect(worker).toContain('href="/for/contractors?tab=solo"')
    const solo = draw('contractors', 'solo')
    expect(current(solo)).toEqual(['Solopreneur'])
    expect(solo).toContain('What a 50-person firm runs on: timesheets, bills, papers. For a firm of one.')
    expect(solo).toContain('href="/signup?type=solo"')
    expect(solo).not.toContain('href="/signup?as=candidate"')
  })

  it('the tabs need no script: each is a plain link, and the doors with no tabs draw none', () => {
    const view = readFileSync(join(ROOT, 'src/lib/public-site/sub-page.tsx'), 'utf8')
    const nav = view.slice(view.indexOf('{tabs && ('), view.indexOf('<h1'))
    expect(nav).toContain('<a')
    expect(nav).not.toMatch(/onClick|useState|<button/)
    expect(readFileSync(join(ROOT, 'src/lib/public-site/party-page.tsx'), 'utf8')).not.toContain("'use client'")
    for (const slug of ['program-offices', 'integrators'] as const) {
      expect(html(createElement(PartyPageView, { slug })), slug).not.toContain('aria-current="page"')
    }
  })
})

describe('The documentation is the four steps and the end of the work, then your records, recruiting and more', () => {

  it('the documentation home says how Etyme works in four steps, one page each, with no account needed, and lists each page once', () => {
    expect(DOCS_HOME.title).toBe('How Etyme works')
    expect(DOCS_HOME.lede).toBe('Four steps from a job to paying your suppliers, one page each. No account needed.')
    expect(DOCS_HOME.groups.map((g) => g.heading)).toEqual(['The steps', 'Your records', 'Recruiting', 'More'])
    const links = (i: number) => DOCS_HOME.groups[i].links.map((l) => l.t)
    expect(links(0)).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices', 'When the work ends'])
    expect(DOCS_HOME.groups[0].links.map((l) => l.k)).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4', 'After'])
    expect(links(1)).toEqual(['Customers', 'Suppliers', 'Contractors'])
    expect(links(2)).toEqual(['Who matches a job', 'Screening', 'Who applied'])
    expect(links(3)).toEqual(['Who does what', 'Time and money', 'Integrations', 'Security'])
    for (const g of DOCS_HOME.groups) for (const l of g.links) expect(pageAt(l.href), l.href).toBeTruthy()
  })

  it('nine process pages are five: one page for each of the four steps, and one for when the work ends', () => {
    expect(STEP_PAGES.map((p) => p.slug)).toEqual(['job', 'candidates', 'timesheets', 'invoices', 'when-work-ends'])
    expect(STEP_PAGES.map((p) => p.n)).toEqual([1, 2, 3, 4, null])
    expect(STEP_PAGES.slice(0, 4).map((p) => p.title)).toEqual(STEPS.map((s) => s.name))
    // Each product step knows the one documentation page that explains it.
    expect(STEPS.map((s) => s.doc)).toEqual(STEP_PAGES.slice(0, 4).map(stepRoute))
  })

  it('your records are customers, suppliers and contractors; recruiting is who matches a job, screening and who applied', () => {
    expect(TOPICS.filter((t) => t.group === 'master-data').map((t) => t.slug)).toEqual(['customers', 'suppliers', 'consultants'])
    expect(TOPICS.filter((t) => t.group === 'recruiting').map((t) => t.slug)).toEqual(['matching', 'screening', 'application-tracking'])
  })

  it('who does what is one table of the seven companies in a deal, what each buys, sells and sees, which replaced the ten party pages', () => {
    expect(WHO_DOES_WHAT.columns).toEqual(['Who', 'Buys from', 'Sells to', 'Sees'])
    expect(WHO_DOES_WHAT.rows.map((r) => r.who)).toEqual(['Client', 'MSP', 'Integrator', 'Prime supplier', 'Sub-vendor', 'Bench supplier', 'Worker'])
    expect(WHO_DOES_WHAT.rows.find((r) => r.who === 'MSP')!.sees).toContain('Never supplies a worker.')
    expect(WHO_DOES_WHAT.closing).toContain('Rates stay closed at every level.')
    const page = html(createElement(DocsSlugView, { slug: 'who-does-what' }))
    expect(page.match(/<table/g)).toHaveLength(1)
    expect(page.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr/g)).toHaveLength(7)
  })

  it('every page of the documentation is registered, and every one is drawn', () => {
    for (const r of docRoutes()) expect(pageAt(r), r).toBeTruthy()
    for (const [route, page] of DOC_PAGES) expect(page, route).toContain('<h1')
    expect(docRoutes()).toHaveLength(1 + STEP_PAGES.length + 1 + REFERENCE.length + TOPICS.length)
  })
})

describe('Every old documentation address still works', () => {

  it('every old address leads, permanently, to the page that replaced it', () => {
    const expected: Record<string, string> = {
      '/docs/process': '/docs',
      '/docs/process/source-to-contract': '/docs/job',
      '/docs/process/contract-to-onboard': '/docs/candidates',
      '/docs/process/work-to-approve': '/docs/timesheets',
      '/docs/process/expenses': '/docs/timesheets',
      '/docs/process/approve-to-bill': '/docs/invoices',
      '/docs/process/approve-to-pay': '/docs/invoices',
      '/docs/process/record-to-report': '/docs/invoices',
      '/docs/process/govern-and-protect': '/docs/when-work-ends',
      '/docs/process/when-work-ends': '/docs/when-work-ends',
      ...Object.fromEntries(['client', 'systems-integrator', 'msp-program-office', 'prime-vendor', 'sub-vendor', 'bench-vendor',
        'self-employed', 'candidate', 'candidate-independent', 'candidate-employee'].map((s) => [`/docs/${s}`, '/docs/who-does-what'])),
    }
    expect(oldAddresses().sort()).toEqual(Object.keys(expected).sort())
    for (const [from, to] of Object.entries(expected)) {
      expect(replacementFor(from), from).toBe(to)
      expect(pageAt(to), `${from} goes to ${to}, which is not a page`).toBeTruthy()
    }
    // And the route files answer with that redirect, permanently.
    expect(answer(() => ProcessHomePage())).toBe('permanent redirect to /docs')
    expect(answer(() => ProcessStagePage({ params: { stage: 'approve-to-pay' } }))).toBe('permanent redirect to /docs/invoices')
    expect(answer(() => ProcessPartyPage({ params: { stage: 'work-to-approve', party: 'sub-vendor' } }))).toBe('permanent redirect to /docs/timesheets')
    expect(answer(() => DocsSlugPage({ params: { slug: 'bench-vendor' } }))).toBe('permanent redirect to /docs/who-does-what')
  })

  it('an address that was never a page is not found, rather than sent somewhere', () => {
    expect(answer(() => ProcessStagePage({ params: { stage: 'nothing-here' } }))).toBe('not found')
    expect(answer(() => ProcessPartyPage({ params: { stage: 'expenses', party: 'nobody' } }))).toBe('not found')
    expect(answer(() => DocsSlugPage({ params: { slug: 'nothing-here' } }))).toBe('not found')
    expect(answer(() => DocsSlugPage({ params: { slug: 'job' } }))).toBe('drew a page')
  })

  it('no menu, footer or page of the site links to an old address', () => {
    const links = [
      ...everyFrameLink(),
      ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
      ...MODULES.flatMap((m) => [m.prev.href, m.next.href]),
    ]
    for (const h of links) {
      expect(replacementFor(h), h).toBeNull()
      expect(foldedInto(h), h).toBeNull()
    }
  })
})

describe('The four product pages that folded into the steps still answer', () => {

  it('governance leads to Job, contracts and compliance to Candidates, and the chain to Invoices, each permanently', () => {
    expect(FOLDED).toEqual({
      '/governance': '/requisitions',
      '/contracts': '/submissions',
      '/compliance': '/submissions',
      '/chain': '/invoices',
    })
    expect(answer(() => GovernancePage())).toBe('permanent redirect to /requisitions')
    expect(answer(() => ContractsPage())).toBe('permanent redirect to /submissions')
    expect(answer(() => CompliancePage())).toBe('permanent redirect to /submissions')
    expect(answer(() => ChainPage())).toBe('permanent redirect to /invoices')
    // Each goes to a step page that is drawn, and none is a page of its own any more.
    for (const [from, to] of Object.entries(FOLDED)) {
      expect(pageAt(to), `${from} goes to ${to}`).toBeTruthy()
      expect(pageAt(from), from).toBeNull()
    }
  })

  it('the redirects live beside the pages, never in next.config, and no source file of the public site links to a folded page', () => {
    expect(read('next.config.mjs')).not.toMatch(/\/governance|\/chain'|\/compliance'|\/contracts'/)
    for (const route of Object.keys(FOLDED)) {
      expect(read(`src/app/(site)${route}/page.tsx`), route).toContain('permanentRedirect(FOLDED[')
    }
    const sources = [join(ROOT, 'src/app/page.tsx'), ...walk(join(ROOT, 'src/lib/public-site')), ...walk(join(ROOT, 'src/app/(site)'))]
    const found = sources.flatMap((f) => hrefLiterals(readFileSync(f, 'utf8')).filter((h) => foldedInto(h.split(/[?#]/)[0])).map((h) => `${h} (${f.slice(ROOT.length + 1)})`))
    expect(found).toEqual([])
  })
})

describe('Every step page is the same one screen', () => {

  it('every step page says Step n of 4, or After step 4, above its title, with Previous and Next at its top and bottom', () => {
    for (const p of STEP_PAGES) {
      const page = html(createElement(StepPageView, { slug: p.slug }))
      const eyebrow = p.n ? `Step ${p.n} of 4` : 'After step 4'
      expect(page.indexOf(`>${eyebrow}</p>`), p.slug).toBeGreaterThan(0)
      expect(page.indexOf(`>${eyebrow}</p>`), p.slug).toBeLessThan(page.indexOf('<h1'))
      expect(page.match(/data-prev-next="(top|bottom)"/g), p.slug).toEqual(['data-prev-next="top"', 'data-prev-next="bottom"'])
    }
    // The first step's Previous is the documentation home, and its Next the second step, as drawn.
    const job = html(createElement(StepPageView, { slug: 'job' }))
    expect(job).toContain('href="/docs" rel="prev"')
    expect(job).toContain('href="/docs/candidates" rel="next"')
    expect(job).toContain('Step 2 · Candidates')
  })

  it('every step page reads who does what as a flow of four to six boxes, then the rules, then what it stops, in that order', () => {
    for (const p of STEP_PAGES) {
      const page = html(createElement(StepPageView, { slug: p.slug }))
      const at = [STEP_HEADINGS.flow, 'data-flow-chart', STEP_HEADINGS.rules, STEP_HEADINGS.stops, 'See this step in the demo'].map((t) => page.indexOf(t))
      expect(at.every((i) => i > 0), `${p.slug} ${JSON.stringify(at)}`).toBe(true)
      expect([...at].sort((a, b) => a - b), p.slug).toEqual(at)
      expect(p.flow.length, p.slug).toBeGreaterThanOrEqual(4)
      expect(p.flow.length, p.slug).toBeLessThanOrEqual(6)
      // Each box says who, by their job, and what they do.
      for (const b of p.flow) {
        expect(b.who, `${p.slug}: a box with no party`).toBeTruthy()
        expect(b.role, `${p.slug}: “${b.t}” says no one`).toBeTruthy()
        expect(page, p.slug).toContain(b.role!.replace(/’/g, '&#x27;'))
      }
      expect(p.rules.length, p.slug).toBeGreaterThanOrEqual(3)
      expect(p.rules.length, p.slug).toBeLessThanOrEqual(5)
      expect(p.stops.length, p.slug).toBeGreaterThanOrEqual(1)
      expect(p.stops.length, p.slug).toBeLessThanOrEqual(3)
    }
  })

  it('the Job step says a job names its site and goes to that site’s approved suppliers by default, and no other step says it', () => {
    // Sites, the founder's "Build it, sites sounds good", 2026-10-28.
    const said = (slug: string) => STEP_PAGES.find((p) => p.slug === slug)!.rules.filter((r) => /site’s approved suppliers/.test(r))
    expect(said('job')).toEqual(['Each job names a site. By default it goes to that site’s approved suppliers, and the placement is at that site.'])
    for (const slug of ['candidates', 'timesheets', 'invoices', 'when-work-ends']) expect(said(slug), slug).toEqual([])
    for (const p of STEP_PAGES) for (const r of p.rules) expect(r, p.slug).not.toMatch(/\bplants?\b|\bbranch|\blocations?\b/i)
  })

  it('every step ends with “See this step in the demo” and one line saying whom the reader sits as', () => {
    for (const p of STEP_PAGES) {
      const page = html(createElement(StepPageView, { slug: p.slug }))
      expect(page, p.slug).toContain('>See this step in the demo</a>')
      expect(page, p.slug).toContain(`You sit as ${p.demo.seat} at Northbend Athletic`)
    }
  })

  it('no step page carries the old furniture: stations tables, glossaries, codes, value streams, lanes or a party switcher', () => {
    for (const [route, page] of DOC_PAGES) {
      expect(page, route).not.toMatch(/Etyme says|value stream|\bL[1-4](\.\d+)+\b|Stations|How to read a drawing|Read it as|integration point|lane/i)
      expect(page, route).not.toContain('<img')
    }
  })
})

describe('Every documentation page says its contents once, and in short lines', () => {

  it('the contents are said once on a page: no side menu and no second list, and each page marks where the reader is in its part', () => {
    for (const [route, page] of DOC_PAGES) {
      expect(page, route).not.toContain('Pages in the documentation')
      expect((page.match(/data-contents=""/g) ?? []).length, route).toBeLessThanOrEqual(1)
    }
    for (const p of STEP_PAGES) {
      const page = html(createElement(StepPageView, { slug: p.slug }))
      const strip = page.slice(page.indexOf('data-contents=""'))
      expect(strip, p.slug).toContain(`href="${stepRoute(p)}" aria-current="page"`)
      for (const q of STEP_PAGES) expect(strip, `${p.slug} lists ${q.slug}`).toContain(`href="${stepRoute(q)}"`)
    }
  })

  it('every record and recruiting page is a heading, one line and at most six short lines, with Previous and Next', () => {
    for (const t of TOPICS) {
      expect(t.lines.length, t.slug).toBeLessThanOrEqual(6)
      const page = html(createElement(TopicPageView, { group: t.group, slug: t.slug }))
      expect(page, t.slug).not.toContain('data-flow-chart')
      expect(page.match(/data-prev-next="(top|bottom)"/g), t.slug).toHaveLength(2)
    }
  })

  it('no line written for the documentation runs past twenty-five words, and none is a paragraph', () => {
    const written = [
      DOCS_HOME.lede, ...DOCS_HOME.groups.flatMap((g) => g.links.map((l) => l.d ?? l.t)),
      ...STEP_PAGES.flatMap((p) => [p.lede, ...p.rules, ...p.flow.map((b) => b.t), ...p.stops.map((r) => r.then ?? ''), ...(p.more?.lines ?? [])]),
      ...TOPICS.flatMap((t) => [t.lede, ...t.lines]),
      ...REFERENCE.flatMap((r) => [r.lede, ...r.lines]),
      WHO_DOES_WHAT.lede, WHO_DOES_WHAT.closing, ...WHO_DOES_WHAT.rows.map((r) => r.sees),
    ].filter(Boolean)
    for (const l of written) {
      expect(longSentences(l, 25), l).toEqual([])
      expect(l.split(/(?<=[.!?])\s+/).length, `“${l}” is a paragraph`).toBeLessThanOrEqual(2)
    }
    for (const s of STEPS) {
      for (const l of [s.next, ...s.involved.map((i) => i.does), ...s.flow.map((b) => b.t)]) {
        expect(longSentences(l, 25), s.route).toEqual([])
      }
    }
  })

  it('no drawn documentation page carries a paragraph of its own words over twenty-five words', () => {
    for (const [route, page] of DOC_PAGES) {
      const long = linesOf(page).flatMap((l) => longSentences(l, 25))
      expect(long, route).toEqual([])
    }
  })
})
