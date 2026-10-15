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
import { PARTY_PAGES, copyOfPartyPage, partyAt as doorAt } from '@/lib/public-site/parties'
import { BAND, DOORS, FOOTER_LINKS as SKELETON_FOOTER, ON_SCREEN_DOOR, MOST_WORDS, MOST_STEP_WORDS, countWords } from '@/lib/public-site/skeleton-words'
import { EMBED_STEPS } from '@/lib/sample-seat'
import { STEP_PAGES } from '@/lib/public-site/docs/process'
import { companyPage } from '@/lib/public-site/company-page'
import { docsHomeMetadata, docMetadata } from '@/lib/public-site/docs-page'
import { MENU, FOOTER, FOOTER as SITE_FOOTER, everyFrameLink, frameCopy, menuLinks } from '@/lib/public-site/nav'
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
    const door = doorAt(route.slice('/for/'.length))
    return door ? copyOfPartyPage(door) : null
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
    for (const p of MARKETING) {
      if (!existsSync(join(ROOT, p.routeFile)) && !NEW_PAGES.includes(p)) continue
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
    for (const p of MARKETING) {
      const c = copyOf(p.route)
      if (!c) continue
      expect(namedCompanies(all(c)), `${p.route} names a company`).toEqual([])
    }
    expect(namedCompanies(frameCopy().join(' ')), 'the header or footer names a company').toEqual([])
  })

  it('no public page leads with AI', () => {
    for (const p of MARKETING) {
      const c = copyOf(p.route)
      if (!c) continue
      const lead = check(c).filter((f) => f.rule === 'never-lead-with-ai')
      expect(lead, `${p.route} leads with AI`).toEqual([])
    }
  })

  it('every new page names contractors or suppliers above the fold, before it says anything clever', () => {
    for (const p of NEW_PAGES) {
      const c = copyOf(p.route)!
      const miss = check(c).filter((f) => f.rule === 'category-first' || f.rule === 'module-not-category')
      expect(miss, `${p.route} never says what category it is in its first lines`).toEqual([])
    }
  })

  it('no public page claims Etyme places anybody or runs a bench', () => {
    for (const p of MARKETING) {
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
    for (const p of NEW_PAGES) {
      expect(readsAsAimedAtSuppliers(all(copyOf(p.route)!)), p.route).toEqual([])
    }
    expect(readsAsAimedAtSuppliers(frameCopy().join('. '))).toEqual([])
  })

  it('no new page sizes Etyme against the incumbents', () => {
    for (const p of NEW_PAGES) expect(sizesAgainstIncumbents(all(copyOf(p.route)!)), p.route).toEqual([])
  })

  it('the program office is offered at most once on a page, and never in a headline', () => {
    for (const p of NEW_PAGES) {
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

  it('there are four product pages, one for each step, in the order a hire moves, one for each card on the menu sheet', () => {
    expect(MODULES.map((m) => m.route)).toEqual([...MODULE_ROUTES])
    expect(MODULES.map((m) => m.n)).toEqual([1, 2, 3, 4])
    expect(MENU.steps.map((s) => s.href)).toEqual([...MODULE_ROUTES])
  })

  it('every party door reads the question, the live frame, three lines, the sign-up band and the security line, in that order, and nothing else', () => {
    const body = VIEW.slice(VIEW.indexOf('export function SubPageView'))
    const order = ['<SiteHeader />', 'id="top"', '<h1', '<LiveDemo', 'id="lines"', '<SignUpBand', '<SecurityLine', '<SkeletonFooter']
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

  it(`no party door carries more than ${MOST_WORDS} words between its header and its footer, and no step page more than ${MOST_STEP_WORDS}`, () => {
    // A step page carries Today beside With Etyme and Previous and Next,
    // as the founder drew it on 2026-10-15, so its ceiling is its own.
    expect(SKELETON_PAGES).toHaveLength(8)
    for (const p of SKELETON_PAGES) {
      const c = copyOf(p.route)!
      const n = countWords([...c.hero, ...c.body])
      const most = p.kind === 'MODULE' ? MOST_STEP_WORDS : MOST_WORDS
      expect(n, `${p.route} carries ${n} words`).toBeLessThanOrEqual(most)
      // And it is the same shape as the home page, not a stub of it.
      expect(n, `${p.route} carries ${n} words`).toBeGreaterThan(100)
    }
  })

  it('every product page and party door has at most three lines under the frame, each one short', () => {
    for (const x of [...MODULES, ...PARTY_PAGES]) {
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
    expect(read('src/lib/public-site/module-page.tsx')).toContain('<LiveDemo step={m.step}>')
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
    const everything = [...NEW_PAGES.map((p) => all(copyOf(p.route)!)), frameCopy().join(' ')].join(' ')
    expect(everything).not.toMatch(/\$180K|Average cost found|11 days|hidden costs/i)
  })
})

describe('One header and footer on every new page', () => {

  it('every page carries the same header, and its sheet tells the four steps, then Security, Documentation, About and Contact, the demo and Sign up', () => {
    // The founder's drawing of 2026-10-15, replacing Platform (eight
    // feature names), Solutions (six roles), How It Works and "Explore the
    // Live Demo". One header, drawn by one component, on every page; the
    // sheet sits behind the menu icon at every width.
    expect(MENU.kicker).toBe('How Etyme works')
    expect(MENU.heading).toBe('Four steps. Every contractor, every supplier, one place.')
    expect(MENU.headingPhone).toBe('Four steps. Every contractor, one place.')
    expect(MENU.steps.map((s) => [s.n, s.t, s.l, s.href])).toEqual([
      [1, 'Job', 'Send it once. Every approved supplier gets it.', '/requisitions'],
      [2, 'Candidates', 'Everyone who applied, on one screen.', '/submissions'],
      [3, 'Timesheets', 'Approve the week in one tap.', '/timesheets'],
      [4, 'Invoices', 'Pay only what you approved.', '/invoices'],
    ])
    expect(MENU.small.map((l) => [l.t, l.href])).toEqual([
      ['Security', '/security'], ['Documentation', '/docs'], ['About', '/about'], ['Contact', '/contact'],
    ])
    expect(MENU.small.find((l) => l.href === '/docs')!.short).toBe('Docs')
    expect(MENU.see).toEqual({ t: 'See it working, no account', href: '/demo' })
    expect(MENU.signUp).toEqual({ t: 'Sign up', href: '/signup' })
    // No feature names, no roles, no second way in.
    expect(frameCopy().join(' ')).not.toMatch(/Platform|Solutions|How It Works|By team|Explore the Live Demo|Governance|The chain/)
    // And the footer, one row on every page since 2026-10-15, reaches the
    // documentation and contact.
    for (const h of ['/docs', '/contact']) expect(FOOTER.flatMap((g) => g.links.map((l) => l.href)), h).toContain(h)
    // The home page draws the same header, rather than a copy of it: the
    // logo, Sign in and the menu icon at every width, with no variant for
    // the home page (2026-10-14).
    const home = read('src/app/page.tsx')
    expect(home).toContain('<SiteHeader />')
    expect(home).not.toContain('const NAV_MENUS')
    const header = read('src/lib/public-site/frame.tsx')
    expect(header).not.toContain('onHome')
    for (const f of ['docs-page.tsx', 'company-page.tsx']) {
      expect(read(`src/lib/public-site/${f}`), f).toContain('<SiteFrame>')
    }
    // The step pages and the party doors draw the same header.
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('<SiteHeader />')
    expect(read('src/lib/public-site/module-page.tsx')).toContain('<SiteHeader />')
    // The sheet draws the four cards, the small row and the two buttons once each.
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame.match(/MENU\.steps\.map/g)?.length, 'the sheet draws the four steps, once').toBe(1)
    expect(frame.match(/MENU\.small\.map/g)?.length, 'the sheet draws the small row, once').toBe(1)
    expect(frame).toContain('{MENU.see.t}')
    expect(frame).toContain('{MENU.signUp.t}')
    // On a phone the cards stack, Sign up comes before the demo, and the
    // short heading and "Docs" are drawn, as the drawing shows.
    expect(frame).toMatch(/<ol className="grid gap-2\.5 sm:grid-cols-2/)
    expect(frame).toMatch(/flex-col-reverse[^"]*sm:flex-row/)
    expect(frame.indexOf('{MENU.see.t}')).toBeLessThan(frame.indexOf('{MENU.signUp.t}'))
    expect(frame).toMatch(/<span className="sm:hidden">\{MENU\.headingPhone\}<\/span>/)
    expect(frame).toMatch(/<span className="sm:hidden">\{l\.short\}<\/span>/)
  })

  it('each step card on the menu goes to the top of its step page, and every link on the sheet goes to a page that exists', () => {
    // A card has one destination everywhere: the top of a page, never the
    // middle of one (2026-09-30).
    for (const h of menuLinks()) {
      expect(h, h).not.toContain('#')
      expect(pageAt(h) !== null || ['/signup', '/demo'].includes(h), h).toBe(true)
    }
    for (const c of MENU.steps) expect(pageAt(c.href)?.kind, c.href).toBe('MODULE')
    expect(read('src/app/page.tsx')).not.toContain('const DESKS')
  })

  it('the right of every header is Sign in and the menu icon, and no filled button', () => {
    // The audit was the filled button from 2026-10-09 and the example
    // program before it. Since 2026-10-14 the header carries no button to
    // press but Sign in and the icon (the founder: "Menu into icon").
    const frame = read('src/lib/public-site/frame.tsx')
    // The bar, up to the sheet the icon opens; the sheet's own Sign up
    // (2026-10-15) is behind the icon, not in the bar.
    const right = frame.slice(frame.indexOf('ml-auto flex'), frame.indexOf('</summary>'))
    expect(right).toContain('href={HEADER.signIn.href}')
    expect(right).toContain('aria-label={HEADER.menu}')
    expect(right).not.toContain('bg-etyme-action')
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
      expect(route).toContain(`<PartyPageView slug="${p.slug}" />`)
    }
  })

  it('no door is in the shared header; every public page carries all four in the one-row footer, and the home page and every product page and door in the sign-up band too', () => {
    // Decided 2026-10-13: the doors are reached by link, not from the menu.
    // The founder's home page of 2026-10-14 adds one small line in the
    // sign-up band, "Your door:", Clients first, and the same links in its
    // one-row footer; since the same day every product page and door draws
    // that band and that footer. The shared header and footer carry none.
    const header = menuLinks()
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

  it('each door says whose screen the frame shows, and that every firm on it is a demo company', () => {
    for (const p of PARTY_PAGES) {
      expect(p.caption, p.route).toMatch(/screen/)
      expect(all(copyOfPartyPage(p))).toContain(ON_SCREEN_DOOR)
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
    expect('candidate' in doorAt('contractors')!.demo).toBe(true)
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

  it('no sentence on a door is longer than twenty-five words, and the word ecosystem is on none of them', () => {
    for (const p of PARTY_PAGES) {
      const c = copyOfPartyPage(p)
      const long = [...c.hero, ...c.body].flatMap((line) => longSentences(line, 25))
      expect(long, p.route).toEqual([])
      expect(all(c), p.route).not.toMatch(/ecosystem/i)
    }
  })

  it('no door claims Etyme places anybody, and the supplier and contractor doors say it never does', () => {
    for (const p of PARTY_PAGES) expect(check(copyOfPartyPage(p)).filter((f) => f.rule === 'neutrality'), p.route).toEqual([])
    expect(all(copyOfPartyPage(doorAt('suppliers')!))).toContain('Etyme never places anybody')
    expect(all(copyOfPartyPage(doorAt('contractors')!))).toContain('Etyme never places anybody.')
  })

  it('the MSPs\' door offers Etyme\'s own team once, in its two ways to use it, under the founder\'s two labels', () => {
    const p = doorAt('program-offices')!
    expect(offersTheProgramOffice(all(copyOfPartyPage(p)))).toHaveLength(1)
    expect(p.lines.join(' ')).toContain('Etyme as VMS software')
    expect(p.lines.join(' ')).toContain('Etyme as MSP provider')
  })
})
