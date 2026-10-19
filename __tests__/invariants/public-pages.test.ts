/**
 * Every public page, read by the guard.
 *
 * The positioning rules in `lib/positioning` were checked against the
 * pages somebody remembered to hand them. On 2026-09-26 the marketing
 * site grew by two dozen pages at once — eight module pages, the
 * documentation, the security position, About and Contact — and a page
 * the guard does not read is a page it cannot catch. So the guard now
 * reads a list (`lib/public-site/pages`), and this file fails on a public
 * page that is not on it.
 *
 * The sentences below are the ones the founder reads to check what was
 * built. Each describes a behavior of the site, not of the code.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  check, copyFrom, priceClaims, namedCompanies, longSentences, incumbentComparison,
  readsAsAimedAtSuppliers, offersTheProgramOffice, sizesAgainstIncumbents,
  type Copy,
} from '@/lib/positioning'
import { PUBLIC_PAGES, NOT_MARKETING, MODULE_ROUTES, DOCS_SLUGS, SITE_GROUP, pageAt } from '@/lib/public-site/pages'
import { MODULES, copyOfModule } from '@/lib/public-site/modules'
import { COMPANY_PAGES, ABOUT, CONTACT, SECURITY, copyOfCompanyPage } from '@/lib/public-site/company'
import {
  REFERENCE, TIME_AND_MONEY, WHO_DOES_WHAT, docSlugs, docRoutes, copyOfDoc, copyOfDocsHome,
} from '@/lib/public-site/docs/index'
import { modulePage } from '@/lib/public-site/module-page'
import { PARTY_PAGES, copyOfPartyPage, partyAt as doorAt, everyDoorView, tabHref } from '@/lib/public-site/parties'
import { storyChromeCopy } from '@/lib/public-site/story'
import { BAND, DOORS, FOOTER_LINKS as SKELETON_FOOTER, ON_SCREEN_DOOR, MOST_WORDS, MOST_STEP_WORDS, countWords } from '@/lib/public-site/skeleton-words'
import { EMBED_STEPS } from '@/lib/sample-seat'
import { STEP_PAGES } from '@/lib/public-site/docs/process'
import { companyPage } from '@/lib/public-site/company-page'
import { docsHomeMetadata, docMetadata } from '@/lib/public-site/docs-page'
import { FOOTER, FOOTER as SITE_FOOTER, HEADER, everyFrameLink, frameCopy } from '@/lib/public-site/nav'
import { STEPS } from '@/lib/public-site/steps'
import { demoRequest } from '@/lib/public-site/demo-link'
import { TOPICS } from '@/lib/public-site/docs/topics'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── What each page says, as the guard reads it ─────────────────────────

/**
 * The copy of every page on the list. Pages whose words live in data are
 * read from the data, exactly; pages written as JSX are read with the
 * same crude reader the home page's own test uses.
 */
function copyOf(route: string): Copy | null {
  const m = MODULES.find((x) => x.route === route)
  if (m) return copyOfModule(m)
  const c = COMPANY_PAGES.find((x) => x.route === route)
  if (c) return copyOfCompanyPage(c)
  if (route === '/docs') return copyOfDocsHome()
  if (route.startsWith('/docs/')) return copyOfDoc(route.slice('/docs/'.length))
  if (route.startsWith('/for/')) {
    // A door's tab is its own address, `/for/suppliers?tab=sub`, and is
    // read as a page of its own (founder, 2026-10-16).
    const [slug, query] = route.slice('/for/'.length).split('?tab=')
    const door = doorAt(slug)
    return door ? copyOfPartyPage(door, query ?? null) : null
  }
  const page = pageAt(route)
  if (!page || !existsSync(join(ROOT, page.routeFile))) return null
  const words = copyFrom(read(page.routeFile))
  return { hero: words.slice(0, 12), body: words.slice(12) }
}

/** The marketing pages: everything on the list except the legal documents. */
const MARKETING = PUBLIC_PAGES.filter((p) => p.kind !== 'LEGAL')
/** The pages whose words were written in this change, and are held to every rule. */
const NEW_PAGES = PUBLIC_PAGES.filter((p) => ['MODULE', 'DOCS', 'COMPANY', 'PARTY'].includes(p.kind))
/**
 * A page, or each tab of a door as a page of its own. The suppliers' and
 * workers' doors carry tabs since 2026-10-16, each at its own address and
 * each read by every guard below, not only the tab a reader meets first.
 */
const withTabs = <P extends { route: string; kind: string }>(p: P): P[] =>
  p.kind === 'PARTY' ? everyDoorView().filter((v) => v.route === p.route).map((v) => ({ ...p, route: v.href })) : [p]

const all = (c: Copy) => [...c.hero, ...c.body].join(' ')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name === 'page.tsx') out.push(relative(ROOT, full))
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────

describe('The guard reads every public page, so a new one cannot be added outside it', () => {

  it('every page outside the dashboard is on the public list or named as not marketing, with a reason', () => {
    const registered = new Set(PUBLIC_PAGES.map((p) => p.routeFile))
    const stray = walk(join(ROOT, 'src/app')).filter(
      (f) => !registered.has(f) && !NOT_MARKETING.some((n) => f.startsWith(n.prefix))
    )
    expect(stray, 'add each to PUBLIC_PAGES, or to NOT_MARKETING with the reason it is exempt').toEqual([])
  })

  it('every exemption says why, in a sentence', () => {
    for (const n of NOT_MARKETING) expect(n.why.split(' ').length, n.prefix).toBeGreaterThan(2)
  })

  it('every page on the public list is read by the guard and yields real words', () => {
    for (const p of MARKETING.flatMap(withTabs)) {
      if (!existsSync(join(ROOT, p.routeFile)) && !NEW_PAGES.some((n) => n.routeFile === p.routeFile)) continue
      const c = copyOf(p.route)
      expect(c, `${p.route} has no words the guard can read`).not.toBeNull()
      expect(all(c!).split(' ').length, `${p.route} reads as nearly empty`).toBeGreaterThan(20)
    }
  })

  it('a page waiting for its route is always one of the new site pages, never an existing page gone missing', () => {
    // The words of the new pages live in lib/public-site, which is the
    // market's. The route files that mount them sit under app/(site),
    // which needs an owner in lib/domains before anybody may write there.
    // Until then they are listed here by what they are, not hidden.
    const waiting = PUBLIC_PAGES.filter((p) => !existsSync(join(ROOT, p.routeFile)))
    for (const p of waiting) expect(p.routeFile.startsWith(SITE_GROUP), `${p.route} is missing its route`).toBe(true)
  })
})

describe('No public page says what we agreed never to say', () => {

  it('no public page names a company, a competitor or a peer system, including by comparison', () => {
    for (const p of MARKETING.flatMap(withTabs)) {
      const c = copyOf(p.route)
      if (!c) continue
      expect(namedCompanies(all(c)), `${p.route} names a company`).toEqual([])
    }
    expect(namedCompanies(frameCopy().join(' ')), 'the header or footer names a company').toEqual([])
  })

  it('no public page leads with AI', () => {
    for (const p of MARKETING.flatMap(withTabs)) {
      const c = copyOf(p.route)
      if (!c) continue
      const lead = check(c).filter((f) => f.rule === 'never-lead-with-ai')
      expect(lead, `${p.route} leads with AI`).toEqual([])
    }
  })

  it('every new page names contractors or suppliers above the fold, before it says anything clever; a door, whose headline is a statement to its own party, names them in the panel straight under it', () => {
    // The founder's doors of 2026-10-16 speak to a prime, an integrator or
    // a worker in that reader's own words, and most of those headlines do
    // not name the category. The panel straight under the line does, in
    // its bar ("7 contractors · 4 suppliers"), before anything else is
    // read, so on a door the fold is read through the panel's bar.
    for (const p of NEW_PAGES.flatMap(withTabs)) {
      const page = copyOf(p.route)!
      const door = p.kind === 'PARTY' ? doorAt(p.route.slice('/for/'.length).split('?')[0])! : null
      const c = door ? { hero: [...page.hero, ...storyChromeCopy(door.story)], body: page.body } : page
      const miss = check(c).filter((f) => f.rule === 'category-first' || f.rule === 'module-not-category')
      expect(miss, `${p.route} never says what category it is in its first lines`).toEqual([])
    }
  })

  it('no public page claims Etyme places anybody or runs a bench', () => {
    for (const p of MARKETING.flatMap(withTabs)) {
      const c = copyOf(p.route)
      if (!c) continue
      expect(check(c).filter((f) => f.rule === 'neutrality'), `${p.route} claims to supply people`).toEqual([])
    }
  })

  it('no public page carries a price, a range or a unit, and free while testing is the only thing said about money', () => {
    for (const p of PUBLIC_PAGES) {
      const c = copyOf(p.route)
      if (!c) continue
      expect(priceClaims(all(c)), `${p.route} quotes a price`).toEqual([])
    }
    expect(priceClaims(frameCopy().join(' '))).toEqual([])
    expect(all(copyOfCompanyPage(ABOUT))).toContain('Free while we test with our first companies.')
  })

  it('no sentence on any new page reads as aimed at a supplier', () => {
    for (const p of NEW_PAGES.flatMap(withTabs)) {
      expect(readsAsAimedAtSuppliers(all(copyOf(p.route)!)), p.route).toEqual([])
    }
    expect(readsAsAimedAtSuppliers(frameCopy().join('. '))).toEqual([])
  })

  it('no new page sizes Etyme against the incumbents', () => {
    for (const p of NEW_PAGES.flatMap(withTabs)) expect(sizesAgainstIncumbents(all(copyOf(p.route)!)), p.route).toEqual([])
  })

  it('the program office is offered at most once on a page, and never in a headline', () => {
    for (const p of NEW_PAGES.flatMap(withTabs)) {
      const c = copyOf(p.route)!
      expect(offersTheProgramOffice(all(c)).length, `${p.route} offers to run the program more than once`).toBeLessThanOrEqual(1)
      expect(offersTheProgramOffice(c.hero.join(' ')), `${p.route} offers to run the program in its headline`).toEqual([])
    }
    expect(offersTheProgramOffice(all(copyOfCompanyPage(ABOUT)))).toHaveLength(1)
  })

  it('every sentence a buyer reads on a module or company page is short enough to read once', () => {
    // Line by line: a heading and the sentence under it are two things,
    // and joining them would read as one long sentence that nobody wrote.
    const lines = (c: Copy) => [...c.hero, ...c.body].flatMap((l) => longSentences(l))
    for (const m of MODULES) expect(lines(copyOfModule(m)), m.route).toEqual([])
    for (const c of COMPANY_PAGES) expect(lines(copyOfCompanyPage(c)), c.route).toEqual([])
    for (const r of REFERENCE) expect(lines(copyOfDoc(r.slug)!), r.slug).toEqual([])
  })
})

describe('Every product page and party door is the home page’s shape, opened at its own step', () => {
  // The founder, 2026-10-14: "Make sure even the sub pages and doors
  // follow the same structure." One question, the live frame at the
  // page's step, at most three lines, the sign-up band, one security line
  // and the footer. Until that day these pages opened on a screenshot and
  // carried capabilities, refusals quoted from the software, a complaint,
  // a flow chart, day-one panels and a growth story; the sentences that
  // held those sections were removed with them.
  const VIEW = read('src/lib/public-site/sub-page.tsx')
  const SKELETON = read('src/lib/public-site/skeleton.tsx')
  const SKELETON_PAGES = PUBLIC_PAGES.filter((p) => p.kind === 'MODULE' || p.kind === 'PARTY')

  it('there are four product pages, one for each step, in the order a hire moves, one for each step on the spine', () => {
    expect(MODULES.map((m) => m.route)).toEqual([...MODULE_ROUTES])
    expect(MODULES.map((m) => m.n)).toEqual([1, 2, 3, 4])
    expect(STEPS.map((s) => s.route)).toEqual([...MODULE_ROUTES])
  })

  it('every party door reads its tabs where it has them, the headline, the live frame, three lines, the sign-up band and the security line, in that order, and nothing else', () => {
    const body = VIEW.slice(VIEW.indexOf('export function SubPageView'))
    const order = ['<SiteHeader />', 'id="top"', '{tabs && (', '<h1', '<LiveDemo', 'id="lines"', '<SignUpBand', '<SecurityLine', '<SkeletonFooter']
      .map((t) => body.indexOf(t))
    expect(order.every((i) => i > 0), JSON.stringify(order)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(read('src/lib/public-site/party-page.tsx')).toContain('<SubPageView')
    // Every word the view draws comes from the page's data or the shared
    // skeleton, so the count below counts what a reader reads.
    expect(copyFrom(body)).toEqual([])
    expect(copyFrom(SKELETON.slice(SKELETON.indexOf('export function LiveDemo')))).toEqual([])
  })

  it('every step page reads the step, the promise, Today and With Etyme, the live panel, three lines, Previous and Next, the sign-up band and the security line, in that order, and nothing else', () => {
    // The founder's drawing of 2026-10-15: the four pages tell one story
    // the same way. The panel and the band are the home page's own.
    const STEP_VIEW = read('src/lib/public-site/module-page.tsx')
    const body = STEP_VIEW.slice(STEP_VIEW.indexOf('export function ModulePageView'), STEP_VIEW.indexOf('export function modulePage'))
    const order = ['<SiteHeader />', 'id="top"', '{m.eyebrow}', '<h1', 'id="pair"', '<LiveDemo', 'id="lines"', 'data-prev-next', '<SignUpBand', '<SecurityLine', '<SkeletonFooter']
      .map((t) => body.indexOf(t))
    expect(order.every((i) => i > 0), JSON.stringify(order)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(copyFrom(body)).toEqual([])
  })

  it('no product page or party door draws a screenshot, a card grid, day-one panels, a growth story or a band of its own', () => {
    // A step page's one two-column row is Today beside With Etyme, as drawn.
    const stepView = read('src/lib/public-site/module-page.tsx')
    expect(stepView.match(/grid-cols-[2-9]/g)).toEqual(['grid-cols-2'])
    expect(stepView).toMatch(/id="pair"[^>]*md:grid-cols-2/)
    for (const src of [VIEW, stepView.replace('md:grid-cols-2', ''), read('src/lib/public-site/party-page.tsx')]) {
      expect(src).not.toContain('<img')
      expect(src).not.toMatch(/grid-cols-[2-9]/)
      expect(src).not.toMatch(/dayOne|grow\.|<Capabilities|<Refuses|<Complaint|<FlowChart|<CloseBand/)
      expect(src).not.toContain('<section id="day-one"')
    }
    expect(existsSync(join(ROOT, 'src/lib/public-site/rhythm.ts')), 'the one-screen bands left with the party pages').toBe(false)
  })

  it(`no party door or tab carries more than ${MOST_WORDS} words between its header and its footer, and no step page more than ${MOST_STEP_WORDS}; the founder's 165, raised from 150 so his door lines stand whole`, () => {
    // A step page carries Today beside With Etyme and Previous and Next,
    // as the founder drew it on 2026-10-15, so its ceiling is its own.
    // Each tab of a door is counted as its own page, its tab labels
    // included (2026-10-16). Two views carry the founder's approved words
    // past the cap, the prime vendor's tab and the MSPs' door; his lines
    // are not trimmed to fit, and the count is pinned here so neither
    // grows by a word without this test saying so.
    expect(SKELETON_PAGES).toHaveLength(8)
    for (const p of SKELETON_PAGES.flatMap(withTabs)) {
      const c = copyOf(p.route)!
      const n = countWords([...c.hero, ...c.body])
      const most = p.kind === 'MODULE' ? MOST_STEP_WORDS : MOST_WORDS
      expect(n, `${p.route} carries ${n} words`).toBeLessThanOrEqual(most)
      // And it is the same shape as the home page, not a stub of it.
      expect(n, `${p.route} carries ${n} words`).toBeGreaterThan(100)
    }
  })

  it('every product page and party door has at most three lines under the frame, each one short', () => {
    for (const x of [...MODULES, ...everyDoorView().map((v) => ({ ...v, route: v.href }))]) {
      expect(x.lines.length, x.route).toBeLessThanOrEqual(3)
      for (const l of x.lines) expect(l.split(/\s+/).length, `${x.route}: ${l}`).toBeLessThanOrEqual(22)
    }
  })

  it('each step page opens the panel at its own step: Job, Candidates, Timesheets, Invoices', () => {
    const at = Object.fromEntries(MODULES.map((m) => [m.route, m.step]))
    expect(at).toEqual({
      '/requisitions': 'source', '/submissions': 'submit', '/timesheets': 'approve', '/invoices': 'pay',
    })
    for (const m of MODULES) expect(EMBED_STEPS, m.route).toContain(m.step)
    expect(VIEW).toContain('<LiveDemo step={step}')
    expect(read('src/lib/public-site/module-page.tsx')).toContain('<LiveDemo step={m.step} label={m.label}>')
  })

  it('each party door opens the frame at the screen its party acts on: suppliers and integrators at Submit, program offices at Source, contractors at Approve', () => {
    const at = Object.fromEntries(PARTY_PAGES.map((p) => [p.route, p.step]))
    expect(at).toEqual({
      '/for/suppliers': 'submit', '/for/program-offices': 'source', '/for/integrators': 'submit', '/for/contractors': 'approve',
    })
  })

  it('each product page’s button under the frame seats the reader at that page’s own screen in the full demo', () => {
    for (const m of MODULES) {
      const screen = m.demo.screen.replace('/dashboard', '')
      expect(existsSync(join(ROOT, 'src/app/dashboard', screen, 'page.tsx')), `${m.route} opens ${m.demo.screen}`).toBe(true)
      expect(m.demo.as, m.route).toBe('world-nike')
    }
    expect(VIEW).toContain('<DemoLink target={demo.target}')
    expect(read('src/lib/public-site/module-page.tsx')).toContain('<DemoLink target={m.demo}')
  })

  it('the documentation says a sub-vendor’s name and rates stay closed, and that the client always sees whether the employer on its site is insured', () => {
    // Said on the chain page until it folded into Invoices on 2026-10-15;
    // the documentation is where a reader who asks finds it.
    const customers = TOPICS.find((t) => t.slug === 'customers')!
    expect(customers.lines).toContain('It sees the supplier it pays and the rate it pays, and nothing below.')
    expect(customers.lines).toContain('It always sees whether the firm employing a person on its site is insured.')
    expect(WHO_DOES_WHAT.closing).toContain('Rates stay closed at every level.')
  })

  it('every step page says what a miss costs the client, in one or two short lines with no figure', () => {
    // The founder, 2026-10-15, bringing back the money side of each risk
    // after the one-screen cut had left only what Etyme stops.
    const view = read('src/lib/public-site/docs-page.tsx')
    expect(view).toContain('<H2>{STEP_HEADINGS.cost}</H2>')
    for (const p of STEP_PAGES) {
      expect(p.cost.length, p.slug).toBeGreaterThanOrEqual(1)
      expect(p.cost.length, p.slug).toBeLessThanOrEqual(2)
      for (const line of p.cost) {
        expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(25)
        expect(line, line).not.toMatch(/\$\s?\d|\d+%/)
      }
    }
  })

  it('every refusal the documentation quotes is on the page of the step where it happens, in the words of the file that says it', () => {
    // At most three per step page since 2026-10-15, when the founder's
    // drawing cut each step to one screen.
    const quoted = STEP_PAGES.flatMap((p) => p.stops.map((r) => ({ at: p.slug, ...r })))
    expect(quoted.length).toBeGreaterThanOrEqual(10)
    for (const p of STEP_PAGES) expect(p.stops.length, p.slug).toBeLessThanOrEqual(3)
    for (const r of quoted) {
      expect(r.says, `${r.at}: the phrase must be part of the sentence`).toContain(r.phrase)
      expect(existsSync(join(ROOT, r.source)), r.source).toBe(true)
      expect(read(r.source), `${r.at}: "${r.phrase}" is not in ${r.source}`).toContain(r.phrase)
    }
    const at = (phrase: string) => quoted.find((r) => r.phrase === phrase)?.at
    expect(at('cannot start without')).toBe('candidates')
    expect(at('Nobody approves their own hours.')).toBe('timesheets')
    expect(at('No line on this invoice is backed by an approved timesheet or expense')).toBe('invoices')
    expect(at('not among the suppliers Procurement cleared for this requirement')).toBe('job')
    expect(at('months tenure (time limit: ')).toBe('when-work-ends')
    // Each step that stops something also shows one thing it lets through with a reason.
    for (const p of STEP_PAGES.filter((x) => x.stops.some((r) => r.kind === 'BLOCK') && x.stops.length > 1)) {
      expect(p.stops.some((r) => r.kind === 'WARN'), p.slug).toBe(true)
    }
  })

  it('the invoices page never claims an order’s ceiling cannot be overridden, and says the hours, the invoice and the contract rate must agree', () => {
    const invoices = all(copyOfModule(MODULES.find((m) => m.slug === 'invoices')!))
    expect(invoices).not.toMatch(/nobody (may )?overrides? the (line|cap|order)|ceiling/i)
    const match = read('src/lib/three-way-match.ts')
    expect(match).toMatch(/PO_BALANCE: true/)
    expect(match).toMatch(/RECEIPT: false/)
    expect(invoices).toContain('The hours, the invoice and the contract rate must agree.')
  })
})

describe('The documentation is public', () => {

  it('the documentation is readable without signing in: no page in it asks for an account', () => {
    const docs = PUBLIC_PAGES.filter((p) => p.kind === 'DOCS')
    expect(docs.map((p) => p.route).sort()).toEqual([...docRoutes()].sort())
    for (const p of docs) {
      const text = all(copyOf(p.route)!)
      expect(text, p.route).not.toMatch(/behind sign-in|sign in to read|needs a sign-in|start free/i)
    }
    expect(all(copyOfDocsHome())).toContain('No account needed.')
    // The thread's line said "behind sign-in". Ours is public: the menu
    // sheet links it with no line that says otherwise (2026-10-15).
    expect(frameCopy().join(' ')).not.toMatch(/behind sign-in|sign in to read/i)
  })

  it('there is a documentation page for each step and the end of the work, for who does what, and for time and money and integrations', () => {
    // Since 2026-10-15 the ten party pages are one table, and the nine
    // process pages are five; the old addresses redirect (public-site-sequence).
    expect(docSlugs()).toEqual([...DOCS_SLUGS])
    expect(docSlugs()).toEqual(['job', 'candidates', 'timesheets', 'invoices', 'when-work-ends', 'who-does-what', 'time-and-money', 'integrations'])
    expect(REFERENCE.map((r) => r.slug)).toEqual(['time-and-money', 'integrations'])
    expect(WHO_DOES_WHAT.rows).toHaveLength(7)
  })

  it('the page of machine-extracted test sentences is held back rather than published half-cut', () => {
    expect(docSlugs()).not.toContain('held-for-everybody')
    for (const r of docRoutes()) {
      const c = r === '/docs' ? copyOfDocsHome() : copyOfDoc(r.slice('/docs/'.length))!
      expect(all(c), r).not.toMatch(/vitest|ETYME_TEST_DB|Proven by \d+ test sentences/)
    }
  })

  it('the documentation explains every term in Etyme’s own words, and says nowhere what an ERP or any other system calls it', () => {
    // The founder, 2026-09-28: naming the incumbents, or explaining the
    // model as a translation of an ERP's, "makes it sound like we copied
    // them". The glossaries left with the party pages on 2026-10-15; the
    // guard stays on every page that is left.
    for (const r of docRoutes()) {
      const text = all(r === '/docs' ? copyOfDocsHome() : copyOfDoc(r.slice('/docs/'.length))!)
      expect(text, r).not.toMatch(/What an ERP calls it/i)
      expect(incumbentComparison(text), r).toEqual([])
      expect(namedCompanies(text), r).toEqual([])
    }
  })

  it('the documentation claims no connector that is not built', () => {
    const everywhere = docRoutes().map((r) => all(r === '/docs' ? copyOfDocsHome() : copyOfDoc(r.slice('/docs/'.length))!)).join(' ')
    expect(everywhere).not.toMatch(/\bConnected\b/)
    expect(everywhere).not.toMatch(/Settings › Integrations/)
    expect(all(copyOfDoc('integrations')!)).toContain('No named connector')
    // What the page says does exist, does.
    for (const route of ['export', 'keys', 'webhooks']) {
      expect(existsSync(join(ROOT, `src/app/api/integrations/${route}/route.ts`)), route).toBe(true)
    }
  })

  it('time and money says which invoice checks a person can waive, the way the match engine decides it', () => {
    const t = all(copyOfDoc(TIME_AND_MONEY.slug)!)
    const match = read('src/lib/three-way-match.ts')
    for (const [code, waivable] of [['RECEIPT', false], ['DUPLICATE', false], ['PRICE', false], ['QUANTITY', true], ['PO_BALANCE', true]] as const) {
      expect(match, code).toMatch(new RegExp(`${code}: ${waivable}`))
    }
    expect(t).toContain('Never waived')
    expect(t).toContain('an order being topped up')
    expect(t).not.toMatch(/both approve|never approves their own expenses/i)
  })

  it(`every documentation and company page fits on one screen: about a hundred and fifty words of its own, a step page about two hundred`, () => {
    // The founder, 2026-10-15: "no one is reading large content". Counted
    // from the page's own words — not the header, the footer, Previous and
    // Next, or the demo line every step shares. "When the work ends"
    // carries the computed list of what runs on its own, which the
    // governance page links to, so it is allowed more.
    const most = (route: string) =>
      route === '/docs/when-work-ends' ? 230
        : STEP_PAGES.some((p) => `/docs/${p.slug}` === route) || route === '/security' ? 200
        : 160
    const pages = [...docRoutes(), '/about', '/security']
    for (const route of pages) {
      const c = copyOf(route)!
      const n = countWords([...c.hero, ...c.body])
      expect(n, `${route} carries ${n} words`).toBeLessThanOrEqual(most(route))
    }
    // 135 since 2026-10-15, when the line on how Etyme is paid as an MSP came back.
    expect(countWords([...copyOfCompanyPage(ABOUT).hero, ...copyOfCompanyPage(ABOUT).body])).toBeLessThanOrEqual(135)
  })
})

describe('Security, About and Contact say only what can be checked', () => {

  it('the security position claims no attestation Etyme does not hold', () => {
    const s = all(copyOfCompanyPage(SECURITY))
    expect(s).toContain('No SOC 2 report, no ISO 27001 certificate, no penetration test.')
    expect(s).not.toMatch(/\b(SOC 2|ISO 27001)\b[^.]*\b(certified|compliant|attested|audited)\b/i)
  })

  it('the security position says what is done, what is not done yet, what is next in order with no date nobody has committed to, and where to report a problem', () => {
    // As drawn, 2026-10-15: Done, Not done yet, Next in this order, Found a problem.
    expect(SECURITY.blocks.map((b) => b.title)).toEqual(['Done', 'Not done yet', 'Next, in this order', 'Found a problem?'])
    expect(SECURITY.blocks.find((b) => b.id === 'done')!.lines).toHaveLength(6)
    expect(SECURITY.blocks.find((b) => b.id === 'not')!.lines).toHaveLength(5)
    const next = SECURITY.blocks.find((b) => b.id === 'next')!
    expect(next.ordered).toEqual(['Penetration test', 'SOC 2 Type I', 'SOC 2 Type II, then ISO 27001'])
    const when = [...next.ordered!, next.note!].join(' ')
    expect(when).not.toMatch(/\b20\d\d\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\bQ[1-4]\b/)
    expect(next.note).toBe('No dates yet, because none is contracted. A date goes here when one is.')
    const report = SECURITY.blocks.find((b) => b.id === 'report')!.paragraphs!.join(' ')
    expect(report).toContain('support@etyme.com')
    expect(report).toContain('Test only on the demo.')
    // The long version is an internal document no reader can open, so no
    // link promises it.
    expect(all(copyOfCompanyPage(SECURITY))).not.toMatch(/long version/i)
  })

  it('contact names Durham, North Carolina and says a person answers, with no promised reply time', () => {
    const c = all(copyOfCompanyPage(CONTACT))
    expect(c).toContain('Durham, North Carolina')
    expect(CONTACT.title).toBe('A person answers.')
    expect(c).not.toMatch(/within \d+ hours|24 hours/i)
    expect(read('src/lib/public-site/company-page.tsx')).toContain('<Ask source="HOME_PAGE" />')
  })

  it('about is five lines: what we build, what we never do, the two ways, the price, and where we are', () => {
    const lines = ABOUT.blocks.flatMap((b) => b.lines ?? [])
    expect(lines.map((l) => l.lead)).toEqual(['What we build.', 'What we never do.', 'Two ways to use it.', 'Price.', 'Where we are.'])
    expect(all(copyOfCompanyPage(ABOUT))).toContain('Etyme never supplies workers and never runs a bench.')
  })

  it('about offers to run the program once, quietly, in the founder’s two labels', () => {
    expect(offersTheProgramOffice(all(copyOfCompanyPage(ABOUT)))).toEqual([
      'Or Etyme runs it for you: Etyme as MSP provider.',
    ])
    expect(all(copyOfCompanyPage(ABOUT))).toContain('Your team runs it: Etyme as VMS software.')
  })

  it('the spend-audit landing page with invented numbers is not brought across', () => {
    const everything = [...NEW_PAGES.flatMap(withTabs).map((p) => all(copyOf(p.route)!)), frameCopy().join(' ')].join(' ')
    expect(everything).not.toMatch(/\$180K|Average cost found|11 days|hidden costs/i)
  })
})

describe('One header and footer on every new page', () => {

  it('every page carries the same header, the logo and Sign in, and the footer carries the doors, the demo, the documentation, About and the rest', () => {
    // The founder's drawing of 2026-10-15 put the four steps on a sheet
    // behind a menu icon; on 2026-10-19 the icon and the sheet left ("Even
    // the menu has very [little] value, it can be on the footer"). One
    // header, drawn by one component, on every page: the logo and Sign in.
    expect(HEADER).toEqual({ signIn: { t: 'Sign in', href: '/login' } })
    // No feature names, no roles, no second way in.
    expect(frameCopy().join(' ')).not.toMatch(/Platform|Solutions|How It Works|By team|Explore the Live Demo|Governance|The chain/)
    // The footer, one row on every page since 2026-10-15, carries what the
    // sheet carried that it did not already: the demo and About.
    expect(FOOTER.flatMap((g) => g.links.map((l) => l.label))).toEqual([
      'Clients', 'MSPs', 'Integrators', 'Suppliers', 'Workers', 'Demo', 'Documentation', 'About', 'Security', 'Privacy', 'Terms', 'DPA', 'Contact',
    ])
    for (const h of ['/demo', '/docs', '/about', '/contact']) expect(FOOTER.flatMap((g) => g.links.map((l) => l.href)), h).toContain(h)
    // The home page draws the same header, rather than a copy of it, with
    // no variant for the home page (2026-10-14).
    const home = read('src/app/page.tsx')
    expect(home).toContain('<SiteHeader />')
    expect(home).not.toContain('const NAV_MENUS')
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame).not.toContain('onHome')
    expect(frame).not.toMatch(/<details|SheetCloser|MENU\./)
    for (const f of ['docs-page.tsx', 'company-page.tsx']) {
      expect(read(`src/lib/public-site/${f}`), f).toContain('<SiteFrame>')
    }
    // The step pages and the party doors draw the same header.
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('<SiteHeader />')
    expect(read('src/lib/public-site/module-page.tsx')).toContain('<SiteHeader />')
  })

  it('every link in the header and the footer goes to the top of a page that exists', () => {
    // A link has one destination everywhere: the top of a page, never the
    // middle of one (2026-09-30).
    for (const h of everyFrameLink()) {
      expect(h, h).not.toContain('#')
      expect(pageAt(h) !== null || ['/signup', '/demo', '/login', '/'].includes(h), h).toBe(true)
    }
    expect(read('src/app/page.tsx')).not.toContain('const DESKS')
  })

  it('the right of every header is Sign in, and no filled button and no menu', () => {
    // The audit was the filled button from 2026-10-09 and the example
    // program before it. From 2026-10-14 the header carried Sign in and a
    // menu icon; since 2026-10-19 it carries Sign in alone.
    const frame = read('src/lib/public-site/frame.tsx')
    const right = frame.slice(frame.indexOf('ml-auto flex'), frame.indexOf('</header>'))
    expect(right).toContain('href={HEADER.signIn.href}')
    expect(right).not.toContain('bg-etyme-action')
    expect(right).not.toMatch(/<summary|aria-label=\{HEADER\.menu\}/)
  })

  it('no public page puts Etyme in its own title, because the layout adds it to every tab', () => {
    const layout = read('src/app/layout.tsx')
    expect(layout).toContain("template: '%s | Etyme'")
    for (const m of MODULES) expect(modulePage(m.route).metadata.title, m.route).not.toMatch(/Etyme/)
    for (const c of COMPANY_PAGES) expect(companyPage(c.route).metadata.title, c.route).not.toMatch(/Etyme/)
    expect(docsHomeMetadata().title).not.toMatch(/Etyme/)
    for (const s of docSlugs()) {
      const md = docMetadata(s)
      expect(md.title, s).not.toMatch(/Etyme/)
      expect((md as { description?: string }).description, `${s} has no description`).toBeTruthy()
    }
    expect(read('src/app/census/page.tsx')).not.toMatch(/title: '[^']*Etyme'/)
  })

  it('every route a public page is registered at is mounted by a file that exists', () => {
    for (const p of PUBLIC_PAGES) expect(existsSync(join(ROOT, p.routeFile)), `${p.route} has no route file`).toBe(true)
  })

  it('there is no Industries menu', () => {
    // The menu had four items leading to one place. The sentence under it
    // lived on About until 2026-10-15, when the founder's drawing cut About
    // to five lines; no page names an industry instead.
    expect(frameCopy()).not.toContain('Industries')
  })

  it('every link in the header and footer goes to a registered public page, the demo, sign-in or a section of the home page', () => {
    const routes = new Set([...PUBLIC_PAGES.map((p) => p.route), '/login', '/signup'])
    const home = read('src/app/page.tsx')
    for (const href of everyFrameLink()) {
      const path = href.split('#')[0]
      if (href.startsWith('/#')) continue
      // A band of the home page, drawn only on the home page.
      if (href.startsWith('#')) {
        expect(home, href).toContain(`id="${href.slice(1)}"`)
        continue
      }
      expect(routes.has(path), href).toBe(true)
    }
  })

  it('no link in the header, the sheet or the footer goes to the census', () => {
    // It was the spend audit's one door; the audit left every page on
    // 2026-10-14 and the census is linked from nowhere until it closes.
    expect(everyFrameLink().filter((h) => h.startsWith('/census'))).toEqual([])
    expect(FOOTER.flatMap((g) => g.links).filter((l) => /audit/i.test(l.label))).toEqual([])
    expect(read('src/lib/public-site/frame.tsx')).not.toMatch(/SPEND_AUDIT|PRIMARY\./)
  })

  it('the footer reaches the terms, the privacy notice, the DPA, contact and the security position', () => {
    const hrefs = FOOTER.flatMap((g) => g.links.map((l) => l.href))
    for (const h of ['/terms', '/privacy', '/dpa', '/contact', '/security']) expect(hrefs, h).toContain(h)
  })

  it('every new page is drawn inside the one frame, or in the home page’s shape', () => {
    for (const f of ['docs-page.tsx', 'company-page.tsx']) {
      const src = read(`src/lib/public-site/${f}`)
      expect(src, f).toContain('<SiteFrame>')
    }
    // The product pages and the party doors, since 2026-10-14: the shared
    // header, the home page's skeleton and its one-row footer.
    const view = read('src/lib/public-site/sub-page.tsx')
    expect(view).toContain('<SiteHeader />')
    expect(view).toContain('<SkeletonFooter />')
  })
})

describe('The documentation is written in plain English for a reader anywhere', () => {
  // The founder, 2026-09-29: plain English that people in India, the US,
  // the UK and Australia, and non-native readers, can read. Short blocks,
  // one idea per line. Until 2026-10-15 this block also held the ten party
  // pages' opening lists and their stations tables against the drawings
  // in docs/lanes; the pages, the tables and the drawings on the site
  // went together, so those sentences went with them.

  it('no sentence on any documentation page runs past twenty-five words', () => {
    for (const r of docRoutes()) {
      const c = r === '/docs' ? copyOfDocsHome() : copyOfDoc(r.slice('/docs/'.length))!
      expect([...c.hero, ...c.body].flatMap((l) => longSentences(l, 25)), r).toEqual([])
    }
  })

  it('no sentence on the documentation home runs past twenty-five words', () => {
    const home = copyOfDocsHome()
    expect([...home.hero, ...home.body].flatMap((l) => longSentences(l, 25))).toEqual([])
  })
})

describe('An address that does not exist opens a page in the brand (sign-up walk, round four, item 20)', () => {
  it('a missing address shows one sentence on the warm canvas and a link home, never the bare framework page', () => {
    const file = 'src/app/not-found.tsx'
    expect(existsSync(join(ROOT, file)), `${file} is missing, so Next draws its own black-and-white 404`).toBe(true)
    const src = read(file)
    expect(src).toContain('There is no page at this address.')
    expect(src).toContain('href="/"')
    expect(src).toContain('bg-etyme-canvas')
    expect(src).toContain('font-serif')
    expect(src).not.toMatch(/404|could not be found/)
  })
})

// ────────────────────────────────────────────────────────────────────────
// The four party doors. Decided 2026-10-13 (CLAUDE.md, "Nine decisions",
// item 2), built from the four drawings the founder approved. Every rule
// above already reads them, because they are on the public list as PARTY
// pages; these are the template's own sentences.

describe('Four doors for the parties who are not the client, reached by link and not from the home page', () => {

  it('there are four doors, at /for/suppliers, /for/program-offices, /for/integrators and /for/contractors, each a three-line route over its words', () => {
    expect(PARTY_PAGES.map((p) => p.route)).toEqual(['/for/suppliers', '/for/program-offices', '/for/integrators', '/for/contractors'])
    for (const p of PARTY_PAGES) {
      const page = pageAt(p.route)
      expect(page?.kind, p.route).toBe('PARTY')
      const route = read(page!.routeFile)
      expect(route.trim().split('\n').length, p.route).toBeLessThanOrEqual(4)
      // A door with tabs hands the address's query to the view, which reads the tab from it.
      expect(route).toContain(p.tabs ? `<PartyPageView slug="${p.slug}" params={params} />` : `<PartyPageView slug="${p.slug}" />`)
    }
  })

  it('no door is in the shared header; every public page carries all four in the one-row footer, and the home page and every product page and door in the sign-up band too', () => {
    // Decided 2026-10-13: the doors are reached by link, not from the menu.
    // The founder's home page of 2026-10-14 adds one small line in the
    // sign-up band, "Your door:", Clients first, and the same links in its
    // one-row footer; since the same day every product page and door draws
    // that band and that footer. The shared header and footer carry none.
    const header = [HEADER.signIn.href]
    for (const p of PARTY_PAGES) expect(header, p.route).not.toContain(p.route)
    for (const p of PARTY_PAGES) {
      expect(DOORS.map((d) => d.href), p.route).toContain(p.route)
      expect(SKELETON_FOOTER.map((d) => d.href), p.route).toContain(p.route)
      expect(SITE_FOOTER.flatMap((g) => g.links.map((l) => l.href)), p.route).toContain(p.route)
    }
    expect(DOORS[0]).toEqual({ t: 'Clients', href: '/signup' })
    const view = read('src/lib/public-site/sub-page.tsx')
    expect(view).toContain('<SignUpBand primary={signUp} band={band} />')
    expect(view).toContain('<SkeletonFooter />')
  })

  it('each door and tab names, under the panel, the person whose screen it plays, and says their firm is a demo company, not a customer', () => {
    // Since 2026-10-19 a door plays its own party's person (founder: "the
    // public pages speak as the party's own person"), so the caption that
    // said "your client's screen" is gone and the line names them.
    const lines = Object.fromEntries(everyDoorView().map((v) => [v.href, v.label]))
    expect(lines).toEqual({
      '/for/suppliers': 'You are watching Marisa Delacroix, account manager at Brightmoor Staffing, a demo company, not a customer.',
      '/for/suppliers?tab=sub': 'You are watching Bhavesh Nair, owner of Techpeple, a demo company, not a customer.',
      '/for/suppliers?tab=bench': 'You are watching Linnea Qadri, recruiter at Techpeple, a demo company, not a customer.',
      '/for/program-offices': `You are watching Rashida Coleman, program manager at Aptiva Workforce, in Cavanaugh Glassworks’ program. ${ON_SCREEN_DOOR}`,
      '/for/integrators': 'You are watching Sunil Raghavan, delivery manager at Teleworld Solutions, a demo company, not a customer.',
      '/for/contractors': 'You are watching Helena Marsh, a contractor at Northbend Athletic, a demo company, not a customer.',
      '/for/contractors?tab=solo': 'You are watching Colleen Byrne, ICU travel nurse and owner of Byrne Critical Care LLC, a demo company, not a customer.',
    })
    for (const v of everyDoorView()) {
      expect(v.caption, v.href).toBeUndefined()
      expect(all(copyOfPartyPage(v, v.tab?.key)), v.href).toContain(v.label!)
    }
    expect(ON_SCREEN_DOOR).toBe('Every firm on this screen is a demo company, not a customer.')
  })

  it('each door’s filled button is its own sign-up, the rest of the band is the home page’s, and a contractor signs up on the same form as a candidate', () => {
    expect(existsSync(join(ROOT, 'src/app/(auth)/signup/page.tsx'))).toBe(true)
    for (const p of PARTY_PAGES) {
      expect(p.signUp.href.startsWith('/signup'), p.route).toBe(true)
      if (p.slug !== 'contractors') {
        expect(all(copyOfPartyPage(p))).toContain(BAND.heading)
        expect(all(copyOfPartyPage(p))).toContain('Free while we are testing.')
      }
    }
    expect(doorAt('program-offices')!.signUp.href).toBe('/signup?type=msp')
    expect(doorAt('integrators')!.signUp.href).toBe('/signup?type=gsi')
    expect(doorAt('contractors')!.signUp.href).toBe('/signup?as=candidate')
    // The workers' door opens Helena Marsh's own seat (2026-10-19), the person its panel plays.
    expect(doorAt('contractors')!.demo).toEqual({ target: { person: 'helena-marsh', seat: 'Helena Marsh' } })
  })

  it('the contractors door’s band asks a person to set up their own page, with the candidate sign-up and the doors line', () => {
    const c = all(copyOfPartyPage(doorAt('contractors')!))
    expect(c).toContain('Seen enough? Set up your own page.')
    expect(c).toContain('Two minutes. Your weeks, your pay and your paperwork in one place. Free.')
    expect(c).not.toContain('Set up your company')
    expect(c).not.toMatch(/spend audit/i)
    expect(c).toContain('Your door:')
    expect(doorAt('contractors')!.band).toBe('SELF')
    // Every other door and every product page keeps the company band.
    for (const p of PARTY_PAGES.filter((x) => x.slug !== 'contractors')) expect(all(copyOfPartyPage(p)), p.route).toContain(BAND.heading)
    expect(read('src/lib/public-site/skeleton.tsx')).toContain("const words = band === 'SELF' ? BAND_FOR_SELF : BAND")
  })

  it('no sentence on a door or any of its tabs is longer than twenty-five words, and the word ecosystem is on none of them', () => {
    for (const p of everyDoorView()) {
      const c = copyOfPartyPage(p, p.tab?.key)
      const long = [...c.hero, ...c.body].flatMap((line) => longSentences(line, 25))
      expect(long, p.route).toEqual([])
      expect(all(c), p.route).not.toMatch(/ecosystem/i)
    }
  })

  it('no door or tab claims Etyme places anybody; the founder’s doors of 2026-10-16 no longer say it never does, and About still says it', () => {
    for (const p of everyDoorView()) expect(check(copyOfPartyPage(p, p.tab?.key)).filter((f) => f.rule === 'neutrality'), p.href).toEqual([])
    // The sentence "Etyme never places anybody." was a line on the
    // suppliers' and the workers' doors from 2026-10-15. The founder's
    // drawing of 2026-10-16 has no line for it and his words are used as
    // drawn, so it left both; reported to him. About keeps the commitment.
    for (const p of everyDoorView()) expect(all(copyOfPartyPage(p, p.tab?.key)), p.href).not.toContain('Etyme never places anybody')
    expect(all(copyOfCompanyPage(ABOUT))).toContain('Etyme never supplies workers and never runs a bench.')
  })

  it('the MSPs’ door plays a sample MSP, Aptiva Workforce, in Cavanaugh Glassworks’ program, and says under the panel whose seat it is', () => {
    // The founder, on this door, 2026-10-15: "use a sample MSP company".
    const p = doorAt('program-offices')!
    expect(p.story).toBe('aptiva')
    expect(p.label).toBe(`You are watching Rashida Coleman, program manager at Aptiva Workforce, in Cavanaugh Glassworks’ program. ${ON_SCREEN_DOOR}`)
    expect(all(copyOfPartyPage(p))).toContain('an MSP running Cavanaugh Glassworks’ program')
    // Every other door and tab plays its own party's person (2026-10-19).
    expect(Object.fromEntries(everyDoorView().map((v) => [v.href, [v.story, v.step]]))).toEqual({
      '/for/suppliers': ['brightmoor', 'submit'],
      '/for/suppliers?tab=sub': ['techpeple-sub', 'approve'],
      '/for/suppliers?tab=bench': ['techpeple-bench', 'submit'],
      '/for/program-offices': ['aptiva', 'source'],
      '/for/integrators': ['teleworld', 'submit'],
      '/for/contractors': ['helena', 'approve'],
      '/for/contractors?tab=solo': ['byrne', 'pay'],
    })
    const view = read('src/lib/public-site/party-page.tsx')
    expect(view).toContain('label={p.label ?? ON_SCREEN_DOOR}')
    expect(view).toContain('story={p.story}')
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('<LiveDemo step={step} caption={caption} label={label} story={story}>')
  })

  it('the MSPs’ door’s button opens the demo as Aptiva Workforce, seated in Cavanaugh Glassworks’ program, on that program’s own screen', () => {
    const p = doorAt('program-offices')!
    expect('target' in p.demo).toBe(true)
    const t = (p.demo as { target: { as: string; desk: string; screen: string } }).target
    // Aptiva's first seat: the demo door seats a firm's first seat when no desk is named.
    expect(t).toMatchObject({ as: 'world-aptiva', desk: '', screen: '/dashboard/program' })
    expect(read('src/app/demo/seats.ts')).toMatch(/slug: 'world-aptiva',\s*name: 'Aptiva Workforce'/)
    const door = read('src/app/api/demo/route.ts')
    expect(door).toContain("...(desk ? { role: { name: { in: DESK_ROLES[desk] } } } : {})")
    // A firm with a live seat in a client's program is told which, and an MSP so seated opens on that program.
    expect(door).toContain('(await seatsHeldBy(company.id))[0]?.clientCompany.name')
    expect(read('src/lib/console-home.ts')).toMatch(/kind === 'MSP' && seated\) \{\s*return \{\s*href: '\/dashboard\/program'/)
    expect(read('src/lib/demo-desks.ts')).toContain("if (asked == null || asked === '') return { desk: null, unknown: null }")
    expect(existsSync(join(ROOT, 'src/app/dashboard/program/page.tsx'))).toBe(true)
  })

  it('the MSPs’ door no longer offers Etyme’s own team, as the founder drew it on 2026-10-16, and About still names the two ways to run a program', () => {
    // Until 2026-10-16 the door's third line was "Etyme as VMS software:
    // you run it. Etyme as MSP provider: Etyme’s own team runs it." The
    // founder's drawing replaced the three lines; the offer stays once,
    // quietly, on About, under his two labels.
    const p = doorAt('program-offices')!
    expect(offersTheProgramOffice(all(copyOfPartyPage(p)))).toEqual([])
    expect(p.lines.join(' ')).not.toContain('MSP provider')
    expect(offersTheProgramOffice(all(copyOfCompanyPage(ABOUT)))).toHaveLength(1)
  })

  it('a door’s headline is a statement in its party’s own words, not a question, as the founder chose on 2026-10-16', () => {
    const heads = Object.fromEntries(everyDoorView().map((v) => [v.href, [v.headline, v.purpose]]))
    expect(heads).toEqual({
      '/for/suppliers': ['Fill your client’s jobs through every sub-vendor at once, and keep your client yours.', 'Each sub-vendor sees its own rate. Your client’s name is yours to share.'],
      '/for/suppliers?tab=sub': ['Bill from the same approved week as your prime.', 'Your rates and your people stay yours.'],
      '/for/suppliers?tab=bench': ['Your whole bench in front of every firm you sell to, at once.', 'Each person by their own consent.'],
      '/for/program-offices': ['Every supplier, every worker, every invoice, across every program you run.', 'Your clients stay yours.'],
      '/for/integrators': ['Staff your next project with your own people first.', 'Buy outside only for the gap.'],
      '/for/contractors': ['Your hours, pay, papers and history, in one place that moves with you.', 'Yours, not the agency’s.'],
      '/for/contractors?tab=solo': ['What a 50-person firm runs on: timesheets, bills, papers. For a firm of one.', 'File your week, bill your client, get paid.'],
    })
    for (const v of everyDoorView()) expect(v.headline, v.href).not.toContain('?')
  })

  it('the suppliers’ door shows Prime vendor by default and each tab by its own address', () => {
    const d = doorAt('suppliers')!
    expect(d.tabs!.map((t) => [t.label, tabHref(d, t.key)])).toEqual([
      ['Prime vendor', '/for/suppliers'], ['Sub-vendor', '/for/suppliers?tab=sub'], ['Bench vendor', '/for/suppliers?tab=bench'],
    ])
    // The door's own address is the prime vendor's words; an unknown tab is the door, never a missing page.
    expect(copyOf('/for/suppliers')).toEqual(copyOf('/for/suppliers?tab=prime'))
    expect(copyOf('/for/suppliers?tab=nonsense')).toEqual(copyOf('/for/suppliers'))
    expect(copyOf('/for/suppliers?tab=sub')!.hero).toContain('Bill from the same approved week as your prime.')
    expect(copyOf('/for/suppliers?tab=bench')!.hero).toContain('Your whole bench in front of every firm you sell to, at once.')
  })

  it('the workers’ door shows Worker by default and Solopreneur at its own address', () => {
    const d = doorAt('contractors')!
    expect(d.tabs!.map((t) => [t.label, tabHref(d, t.key)])).toEqual([
      ['Worker', '/for/contractors'], ['Solopreneur', '/for/contractors?tab=solo'],
    ])
  })

  it('the workers’ door’s Solopreneur tab signs up a one-person company, and the Worker tab keeps the person’s own sign-up', () => {
    const views = Object.fromEntries(everyDoorView().filter((v) => v.slug === 'contractors').map((v) => [v.href, v]))
    expect(views['/for/contractors?tab=solo'].signUp.href).toBe('/signup?type=solo')
    expect(views['/for/contractors?tab=solo'].band).toBe('COMPANY')
    expect(all(copyOf('/for/contractors?tab=solo')!)).toContain('Seen enough? Set up your company.')
    expect(views['/for/contractors'].signUp.href).toBe('/signup?as=candidate')
    expect(views['/for/contractors'].band).toBe('SELF')
    // The sign-up page opens the company form on the one-person kind from that address.
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('?type=solo')
  })

  it('a tab changes the words, the person in the panel, and the button, which opens the demo as that same person', () => {
    // Until 2026-10-19 a tab never changed the panel. Since the founder's
    // drawing of that day each tab plays its own party's person, with the
    // line under the panel naming them, and the button under it seats the
    // reader as that person (coordinator, the same day).
    for (const p of PARTY_PAGES) {
      const views = everyDoorView().filter((x) => x.slug === p.slug)
      if (views.length > 1) expect(new Set(views.map((v) => v.story)).size, p.route).toBe(views.length)
    }
    expect(Object.fromEntries(everyDoorView().map((v) => [v.href, [v.demoLabel, v.demo]]))).toEqual({
      '/for/suppliers': ['Open as a supplier’s account manager, no account',
        { target: { as: 'world-brightmoor', desk: 'account', screen: '/dashboard', seat: 'the account manager' } }],
      '/for/suppliers?tab=sub': ['Open as a sub-vendor, no account',
        { target: { as: 'world-techpeple', desk: '', screen: '/dashboard/timesheets', seat: 'Techpeple’s owner' } }],
      '/for/suppliers?tab=bench': ['Open as a bench vendor’s recruiter, no account',
        { target: { as: 'world-techpeple', desk: 'recruiter', screen: '/dashboard/bench', seat: 'Techpeple’s recruiter' } }],
      '/for/program-offices': ['Open as the program manager, no account',
        { target: { as: 'world-aptiva', desk: '', screen: '/dashboard/program', seat: 'Aptiva Workforce’s program manager' } }],
      '/for/integrators': ['Open as an integrator’s delivery manager, no account',
        { target: { as: 'world-teleworld', desk: 'delivery', screen: '/dashboard/bench', seat: 'a delivery manager' } }],
      '/for/contractors': ['Open Helena’s page, no account', { target: { person: 'helena-marsh', seat: 'Helena Marsh' } }],
      '/for/contractors?tab=solo': ['Open as a one-person firm, no account', { target: { person: 'colleen-byrne', seat: 'Colleen Byrne' } }],
    })
    // Each seat is one the demo door gives: a seeded firm and a desk it knows, or a person on the demo page.
    const seats = read('src/app/demo/seats.ts')
    for (const slug of ['world-brightmoor', 'world-techpeple', 'world-aptiva', 'world-teleworld']) expect(seats, slug).toContain(`slug: '${slug}'`)
    for (const person of ['helena-marsh', 'colleen-byrne']) expect(seats, person).toContain(`slug: '${person}'`)
    expect(read('src/lib/demo-desks.ts')).toContain("recruiter: ['Recruiter']")
    // Techpeple's recruiter is Linnea Qadri, and its first seat is its owner, Bhavesh Nair.
    const world = read('src/lib/seed-world.ts')
    expect(world).toContain("{ desk: 'recruiter',  role: 'Recruiter',        name: 'Linnea Qadri' }")
    expect(world).toMatch(/slug: 'techpeple',\s*name: 'Techpeple',\s*kind: 'VENDOR',\s*seat: 'Bench sales', who: 'Bhavesh Nair'/)
    // A person's seat posts the person, and goes where the door says that person lands.
    expect(demoRequest({ person: 'helena-marsh', seat: 'Helena Marsh' })).toEqual({ url: '/api/demo', body: { person: 'helena-marsh' }, then: null })
    expect(read('src/lib/public-site/demo-link.tsx')).toContain("req.then ?? answer?.data?.landing ?? '/dashboard'")
    expect(read('src/app/api/demo/route.ts')).toContain('const door = CANDIDATE_SEATS.find((c) => c.slug === asPerson)')
    // The door's own address is its first tab, panel included.
    for (const p of PARTY_PAGES.filter((x) => x.tabs)) {
      const first = everyDoorView().find((v) => v.href === p.route)!
      expect([p.story, p.step, p.label]).toEqual([first.story, first.step, first.label])
    }
  })

  it('no door promises “free forever”; the band keeps “Free while we are testing”', () => {
    for (const v of everyDoorView()) expect(all(copyOf(v.href)!), v.href).not.toMatch(/free forever/i)
    expect(all(copyOf('/for/suppliers?tab=bench')!)).toContain('Free while we are testing.')
  })
})
