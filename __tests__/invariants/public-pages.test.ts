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
  PARTIES, REFERENCE, INTEGRATIONS, TIME_AND_MONEY, docSlugs, partyAt, copyOfDoc, copyOfDocsHome, textOfHtml,
} from '@/lib/public-site/docs/index'
import { modulePage } from '@/lib/public-site/module-page'
import { companyPage } from '@/lib/public-site/company-page'
import { docsHomeMetadata, docMetadata } from '@/lib/public-site/docs-page'
import {
  NAV_MENUS, NAV_LINKS, SHEET_MORE, FOOTER, SPEND_AUDIT, DOCS_LINK, PRODUCT_STAGES, PRODUCT_ITEMS, ROLES, PRIMARY,
  everyFrameLink, frameCopy, itemsOf,
} from '@/lib/public-site/nav'

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
  const page = pageAt(route)
  if (!page || !existsSync(join(ROOT, page.routeFile))) return null
  const words = copyFrom(read(page.routeFile))
  return { hero: words.slice(0, 12), body: words.slice(12) }
}

/** The marketing pages: everything on the list except the legal documents. */
const MARKETING = PUBLIC_PAGES.filter((p) => p.kind !== 'LEGAL')
/** The pages whose words were written in this change, and are held to every rule. */
const NEW_PAGES = PUBLIC_PAGES.filter((p) => ['MODULE', 'DOCS', 'COMPANY'].includes(p.kind))

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
    expect(all(copyOfCompanyPage(ABOUT))).toContain('free while it is tested')
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

describe('Every module page opens on a real screen from the demo', () => {

  it('there are eight module pages, in the order a hire moves, one for each entry under Products', () => {
    expect(MODULES.map((m) => m.route)).toEqual([...MODULE_ROUTES])
    expect(MODULES.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(PRODUCT_ITEMS.map((i) => i.href)).toEqual([...MODULE_ROUTES])
  })

  it('every module page opens on a screen, and the file exists under public/screens', () => {
    const view = read('src/lib/public-site/module-page.tsx')
    // The screen is drawn straight after the lede, before the first section.
    expect(view.indexOf('m.screen.img')).toBeLessThan(view.indexOf('title="Key capabilities"'))
    for (const m of MODULES) {
      expect(m.screen.img.startsWith('/screens/'), m.route).toBe(true)
      expect(existsSync(join(ROOT, 'public', m.screen.img)), `${m.screen.img} does not exist`).toBe(true)
    }
  })

  it('every screen names the desk and route it was taken from, and was taken after the last rename of the demo world', () => {
    const RENAMES_DONE = Date.parse('2026-09-20T22:00:00Z')
    for (const m of MODULES) {
      expect(m.screen.from, m.route).toMatch(/\/dashboard\/.+ as the /)
      expect(Date.parse(m.screen.capturedAt), m.route).toBeGreaterThan(RENAMES_DONE)
      expect(m.screen.alt.length, `${m.route} describes its screen for somebody who cannot see it`).toBeGreaterThan(40)
    }
  })

  it('the five screens taken for these pages are new files, and no two module pages open on the same one', () => {
    const imgs = MODULES.map((m) => m.screen.img)
    expect(new Set(imgs).size).toBe(imgs.length)
    for (const f of ['requisitions', 'contracts', 'compliance', 'chain', 'governance']) {
      expect(imgs).toContain(`/screens/${f}.png`)
    }
  })

  it('every step page reads what you do, the real screen, who is involved, then what happens next, and ends on the demo', () => {
    // The founder's order for a step page, 2026-09-30. The static site's
    // six sections are still on it, between who is involved and what
    // happens next.
    const view = read('src/lib/public-site/module-page.tsx')
    const step = view.slice(view.indexOf('export function StepPageView'), view.indexOf('export function MorePageView'))
    const order = ['title="What you do"', 'title="The real screen"', 'title="Who is involved"', '<Capabilities', '<Refuses',
      'title="More in this step"', 'title="Read the flow"', 'title="What happens next"', 'label="See this step in the demo"']
      .map((t) => step.indexOf(t))
    expect(order.every((i) => i > 0), JSON.stringify(order)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('every page under a step opens on its real screen and keeps the static site’s six sections, in their order', () => {
    const view = read('src/lib/public-site/module-page.tsx')
    const more = view.slice(view.indexOf('export function MorePageView'), view.indexOf('export function ModulePageView'))
    expect(more.indexOf('<Screen m={m} />')).toBeLessThan(more.indexOf('<Capabilities'))
    const order = ['<Capabilities', 'title="What it looks like"', '<Refuses', '<Complaint', 'title="Read the flow"']
      .map((t) => more.indexOf(t))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('every refusal on a module page is the sentence the software says, found in the file that says it', () => {
    for (const m of MODULES) {
      for (const r of m.refuses) {
        expect(r.says, `${m.route}: the phrase must be part of the sentence`).toContain(r.phrase)
        expect(existsSync(join(ROOT, r.source)), r.source).toBe(true)
        expect(read(r.source), `${m.route}: "${r.phrase}" is not in ${r.source}`).toContain(r.phrase)
      }
    }
  })

  it('every module page shows one thing the software stops and one thing it lets through with a reason or sends to a desk', () => {
    for (const m of MODULES) {
      const kinds = m.refuses.map((r) => r.kind)
      expect(kinds, m.route).toContain('BLOCK')
      expect(kinds.some((k) => k === 'WARN' || k === 'ROUTE'), m.route).toBe(true)
    }
  })

  it('a complaint is a situation with the desk that has it, never a quotation from somebody who did not say it', () => {
    for (const m of MODULES) {
      expect(m.complaint.text, m.route).not.toMatch(/^[“"]/)
      expect(m.complaint.whose.length, m.route).toBeGreaterThan(10)
    }
  })

  it('the chain page tells the client its supplier’s rates and sub-vendors’ names stay private, and that it always sees whether the employer is insured and authorized', () => {
    const chain = all(copyOfModule(MODULES.find((m) => m.slug === 'chain')!))
    expect(chain).toContain('Your supplier’s rates and its sub-vendors’ names stay private.')
    expect(chain).toContain('You always see whether the firm employing the person on your site is insured and authorized.')
    // And the name opens only on the client's own agreement, never on the platform's say-so.
    expect(chain).toMatch(/agreement with (it|a supplier|that supplier) requires/)
  })

  it('the invoices page never claims an order’s ceiling cannot be overridden, because a named person can override it', () => {
    const invoices = all(copyOfModule(MODULES.find((m) => m.slug === 'invoices')!))
    expect(invoices).not.toMatch(/nobody (may )?overrides? the (line|cap|order)/i)
    const match = read('src/lib/three-way-match.ts')
    expect(match).toMatch(/PO_BALANCE: true/)
    expect(match).toMatch(/RECEIPT: false/)
    expect(invoices).toContain('nobody can waive it')
  })

  it('every module page links to the flow it describes in the documentation, at the top of a page that exists', () => {
    for (const m of MODULES) {
      expect(m.flow.href, m.route).not.toContain('#')
      expect(pageAt(m.flow.href), `${m.route} links to ${m.flow.href}`).toBeTruthy()
      expect(m.flow.href.startsWith('/docs/'), m.route).toBe(true)
    }
  })
})

describe('The documentation is public', () => {

  it('the documentation is readable without signing in: no page in it asks for an account', () => {
    const docs = PUBLIC_PAGES.filter((p) => p.kind === 'DOCS')
    for (const p of docs) {
      const text = all(copyOfDoc(p.route.replace('/docs/', '')) ?? copyOfDocsHome())
      expect(text, p.route).not.toMatch(/behind sign-in|sign in to read|needs a sign-in|start free/i)
    }
    for (const p of PARTIES) expect(p.doc.html, p.doc.slug).not.toMatch(/href="\/login"/)
    // The thread's line said "behind sign-in". Ours is public, and says so.
    expect(DOCS_LINK.d).toMatch(/public/i)
    expect(DOCS_LINK.d).toMatch(/no sign-in/i)
  })

  it('there is a documentation page for each of the ten parties and for time and money and integrations', () => {
    expect(docSlugs()).toEqual([...DOCS_SLUGS])
    expect(PARTIES).toHaveLength(10)
    expect(REFERENCE.map((r) => r.slug)).toEqual(['time-and-money', 'integrations'])
  })

  it('the page of machine-extracted test sentences is held back rather than published half-cut', () => {
    expect(docSlugs()).not.toContain('held-for-everybody')
    for (const p of PARTIES) {
      expect(p.doc.html, p.doc.slug).not.toMatch(/vitest|ETYME_TEST_DB|Proven by \d+ test sentences/)
    }
  })

  it('every drawing the documentation shows is a file that exists under public/model', () => {
    let drawings = 0
    for (const p of PARTIES) {
      for (const [, src] of p.doc.html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
        drawings++
        expect(src.startsWith('/model/'), src).toBe(true)
        expect(existsSync(join(ROOT, 'public', src)), `${src} does not exist`).toBe(true)
      }
    }
    expect(drawings).toBeGreaterThan(50)
  })

  it('every link in the documentation goes to a page on this site that exists, or to a section on the page', () => {
    const routes = new Set([...PUBLIC_PAGES.map((p) => p.route), '/login'])
    for (const p of PARTIES) {
      for (const [, href] of p.doc.html.matchAll(/<a[^>]*href="([^"]+)"/g)) {
        if (href.startsWith('#')) {
          expect(p.doc.html, `${p.doc.slug} links to #${href.slice(1)}, which is not on the page`).toContain(`id="${href.slice(1)}"`)
          continue
        }
        const [path, anchor] = href.split('#')
        if (path.startsWith('/model/')) continue
        expect(routes.has(path), `${p.doc.slug} links to ${href}`).toBe(true)
        if (anchor && path.startsWith('/docs/')) {
          expect(partyAt(path.slice(6))?.html ?? '', `${href} has no section #${anchor}`).toContain(`id="${anchor}"`)
        }
      }
    }
  })

  it('the documentation explains every term in Etyme’s own words, and says nowhere what an ERP or any other system calls it', () => {
    // The founder, 2026-09-28: naming the incumbents, or explaining the
    // model as a translation of an ERP's, "makes it sound like we copied
    // them". ERP survives only as a place a document crosses to the books.
    for (const p of PARTIES) {
      expect(p.doc.html, p.doc.slug).not.toMatch(/What an ERP calls it/i)
      expect(p.doc.html, p.doc.slug).toContain('Etyme says · what it means')
      expect(incumbentComparison(textOfHtml(p.doc.html)), p.doc.slug).toEqual([])
      expect(namedCompanies(textOfHtml(p.doc.html)), p.doc.slug).toEqual([])
    }
  })

  it('the documentation claims no connector that is not built', () => {
    const everywhere = [...PARTIES.map((p) => textOfHtml(p.doc.html)), all(copyOfDoc('integrations')!)].join(' ')
    expect(everywhere).not.toMatch(/\bConnected\b/)
    expect(everywhere).not.toMatch(/Settings › Integrations/)
    expect(all(copyOfDoc('integrations')!)).toContain('No named connector')
    // What the page says does exist, does.
    for (const route of ['export', 'keys', 'webhooks', 'reconcile']) {
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
})

describe('Security, About and Contact say only what can be checked', () => {

  it('the security position claims no attestation Etyme does not hold', () => {
    const s = all(copyOfCompanyPage(SECURITY))
    expect(s).toContain('Etyme has no SOC 2 report, no ISO 27001 certificate and no third-party penetration test.')
    expect(s).not.toMatch(/\b(SOC 2|ISO 27001)\b[^.]*\b(certified|compliant|attested|audited)\b/i)
  })

  it('the security position says what is done, what is not, and when, with no date nobody has committed to', () => {
    expect(SECURITY.blocks.map((b) => b.id)).toEqual(expect.arrayContaining(['done', 'not', 'when']))
    const when = SECURITY.blocks.find((b) => b.id === 'when')!.paragraphs!.join(' ')
    expect(when).not.toMatch(/\b20\d\d\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\bQ[1-4]\b/)
    expect(when).toContain('No date is published here')
  })

  it('contact names Durham, North Carolina and says a person answers, with no promised reply time', () => {
    const c = all(copyOfCompanyPage(CONTACT))
    expect(c).toContain('Durham, North Carolina')
    expect(CONTACT.title).toBe('A person answers.')
    expect(c).not.toMatch(/within \d+ hours|24 hours/i)
    expect(read('src/lib/public-site/company-page.tsx')).toContain('<Ask source="HOME_PAGE" />')
  })

  it('about says Etyme never runs a bench and never places anybody, and offers to run the program once, quietly', () => {
    const neutral = ABOUT.blocks.find((b) => b.id === 'neutral')!
    expect(neutral.title).toBe('Etyme never runs a bench and never places anybody')
    expect(offersTheProgramOffice(all(copyOfCompanyPage(ABOUT)))).toEqual([
      'If you would rather not staff a program office, Etyme can run it for you on the same record.',
    ])
  })

  it('the spend-audit landing page with invented numbers is not brought across', () => {
    const everything = [...NEW_PAGES.map((p) => all(copyOf(p.route)!)), frameCopy().join(' ')].join(' ')
    expect(everything).not.toMatch(/\$180K|Average cost found|11 days|hidden costs/i)
  })
})

describe('One header and footer on every new page', () => {

  it('every page carries the same compact header: Platform, Solutions, How It Works and Security', () => {
    // The founder's brief, 2026-10-09, replacing Product, Solutions,
    // Resources and Company (the marketing thread's structure, 2026-09-27).
    // One header, drawn by one component, on every page.
    expect(NAV_MENUS.map((m) => m.label)).toEqual(['Platform', 'Solutions'])
    expect(NAV_LINKS.map((l) => l.label)).toEqual(['How It Works', 'Security'])
    expect(PRODUCT_STAGES.map((g) => g.heading)).toEqual(['Step 1 · Source', 'Step 2 · Choose and start', 'Step 3 · Approve the weeks', 'Step 4 · Bill and pay'])
    expect(NAV_MENUS[0].groups).toBe(PRODUCT_STAGES)
    expect(NAV_MENUS[1].groups.map((g) => g.heading)).toEqual(['By desk'])
    expect(itemsOf(NAV_MENUS[1])).toEqual(ROLES)
    // Every item in a menu says what it is in one line under its name.
    for (const m of NAV_MENUS) for (const i of itemsOf(m)) expect(i.d, i.t).toBeTruthy()
    // What the two menus that left carried is still one tap away: the
    // phone sheet and the footer reach the documentation, About, Contact
    // and the demo.
    for (const h of ['/docs', '/about', '/contact', '/demo']) {
      expect(SHEET_MORE.map((i) => i.href), h).toContain(h)
      expect(FOOTER.flatMap((g) => g.links.map((l) => l.href)), h).toContain(h)
    }
    // The home page draws the same header, rather than a copy of it, and
    // tells it it is on the home page so the labels land on its bands.
    const home = read('src/app/page.tsx')
    expect(home).toContain('<SiteHeader onHome />')
    expect(home).not.toContain('const NAV_MENUS')
    for (const f of ['module-page.tsx', 'docs-page.tsx', 'company-page.tsx']) {
      expect(read(`src/lib/public-site/${f}`), f).toContain('<SiteFrame>')
    }
    // And a phone reads the same menus and links, in a sheet.
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame.match(/NAV_MENUS\.map/g)?.length, 'the bar and the sheet both draw every menu').toBe(2)
    expect(frame.match(/NAV_LINKS\.map/g)?.length, 'the bar and the sheet both draw every link').toBe(2)
    expect(frame).toContain('SHEET_MORE.map')
  })

  it('each header label goes somewhere real: a band of the home page on the home page, the top of a page anywhere else', () => {
    const home = read('src/app/page.tsx')
    const labels = [...NAV_MENUS.map((m) => ({ label: m.label, href: m.href })), ...NAV_LINKS]
    expect(labels.map((l) => [l.label, l.href.home])).toEqual([
      ['Platform', '#platform'], ['Solutions', '#solutions'], ['How It Works', '#how-it-works'], ['Security', '/security'],
    ])
    for (const l of labels) {
      if (l.href.home.startsWith('#')) expect(home, `${l.label}: no band ${l.href.home} on the home page`).toContain(`id="${l.href.home.slice(1)}"`)
      // Away from the home page a label never lands in the middle of another page.
      expect(l.href.away, l.label).not.toContain('#')
    }
    // Solutions is the band written to four of the client's desks (the
    // founder's feedback, 2026-10-10), each opening its screen in the demo.
    const desks = home.slice(home.indexOf('const DESKS'), home.indexOf('const HOW'))
    expect([...desks.matchAll(/\n    t: '([^']+)'/g)].map((m) => m[1])).toEqual(['Contingent Workforce Director', 'Procurement', 'HR Operations', 'Finance'])
    expect(home.slice(home.indexOf('id="solutions"'))).toMatch(/^[^]*?DESKS\.map[^]*?<DemoLink target=\{d\.demo\}/)
  })

  it('the Product menu names all eight parts, each under the step it belongs to, the step’s own page first', () => {
    // The four steps are the one spine, decided 2026-09-30; the first is
    // Source, never Hire.
    const stageOf = (route: string) => PRODUCT_STAGES.find((g) => g.items.some((i) => i.href === route))?.heading
    expect(stageOf('/requisitions')).toBe('Step 1 · Source')
    expect(stageOf('/governance')).toBe('Step 1 · Source')
    expect(stageOf('/contracts')).toBe('Step 2 · Choose and start')
    expect(stageOf('/submissions')).toBe('Step 2 · Choose and start')
    expect(stageOf('/compliance')).toBe('Step 2 · Choose and start')
    expect(stageOf('/timesheets')).toBe('Step 3 · Approve the weeks')
    expect(stageOf('/invoices')).toBe('Step 4 · Bill and pay')
    expect(stageOf('/chain')).toBe('Step 4 · Bill and pay')
    expect(PRODUCT_STAGES.map((g) => g.items[0].href)).toEqual(['/requisitions', '/contracts', '/timesheets', '/invoices'])
    // Each item carries the module page's own name and leads to it.
    for (const m of MODULES) {
      expect(PRODUCT_ITEMS.find((i) => i.href === m.route), m.route).toBeTruthy()
    }
    // The bills line is the three-way check's definition, in the founder's
    // words (2026-09-28), because the header is where most readers first
    // meet the term. It still says nothing about room on the order, which
    // a named person can override with a reason.
    const bills = PRODUCT_ITEMS.find((i) => i.href === '/invoices')!
    expect(bills.t).toBe('Bills & the three-way check')
    expect(bills.d).toBe('The three-way check: the hours, the invoice receipt, and the contract rate must all agree.')
    expect(frameCopy().join(' ')).not.toMatch(/room on the order/i)
  })

  it('every role in the solutions menu leads to a page written for that reader', () => {
    // Six roles, and each one lands on a section somebody wrote from that
    // desk: a stage of the client documentation, the finance reference, or
    // the chain page's section a line per supplier position. Never the home
    // page, never About, never a section that is not there.
    expect(ROLES.map((r) => r.t)).toEqual([
      'The program office', 'Procurement', 'HR and compliance', 'Finance', 'Hiring managers', 'Suppliers',
    ])
    // Since 2026-09-30 each lands on the top of a page written for that
    // desk, never on a section in the middle of one.
    const written: Record<string, string> = {
      'The program office': '/docs/process',
      Procurement: '/docs/master-data/suppliers',
      'HR and compliance': '/docs/process/contract-to-onboard',
      Finance: '/docs/time-and-money',
      'Hiring managers': '/docs/process/work-to-approve',
      Suppliers: '/chain',
    }
    for (const role of ROLES) {
      expect(role.href, role.t).toBe(written[role.t])
      expect(role.href, role.t).not.toContain('#')
      expect(pageAt(role.href), `${role.t} leads to ${role.href}, which is not a public page`).toBeTruthy()
      expect(['/', '/about', '/contact'], role.t).not.toContain(role.href)
    }
    // The desks named in each client section are the ones the role is for.
    const section = (id: string) => {
      const html = partyAt('client')!.html
      const at = html.indexOf(`id="${id}"`)
      const next = html.indexOf('<section', at + 1)
      return html.slice(at, next > 0 ? next : undefined)
    }
    expect(section('l1-1')).toMatch(/Procurement/)
    expect(section('l1-2')).toMatch(/HR/)
    expect(section('l1-3')).toMatch(/Hiring Manager/)
    const chain = MODULES.find((m) => m.slug === 'chain')!.more!.items!.map((i) => i.t)
    expect(chain).toEqual(['A prime', 'A sub', 'A bench vendor'])
  })

  it('the solutions menu opens on the home page band\'s four desks, in the band\'s order, then adds hiring managers and suppliers', () => {
    // The band is written to four client desks; the menu on every page
    // keeps two more, the hiring manager who signs weeks and the
    // suppliers' one door to the chain page. The first four must be the
    // band's, so the menu and the band never teach two different maps.
    const page = read('src/app/page.tsx')
    const block = page.slice(page.indexOf('const DESKS'), page.indexOf('const HOW'))
    const bandDesks = [...block.matchAll(/desk: '(\w+)'/g)].map((m) => m[1])
    expect(bandDesks).toEqual(['programme', 'procurement', 'hr', 'ap'])
    expect(ROLES.slice(0, 4).map((r) => r.t)).toEqual(['The program office', 'Procurement', 'HR and compliance', 'Finance'])
    expect(ROLES.slice(4).map((r) => r.t)).toEqual(['Hiring managers', 'Suppliers'])
  })

  it('the right of every header is Sign in and one filled button, which leads to the spend audit', () => {
    // The audit since 2026-10-09 (the founder's brief); the example
    // program until then.
    expect(PRIMARY.href).toBe('/census')
    const frame = read('src/lib/public-site/frame.tsx')
    const right = frame.slice(frame.indexOf('ml-auto flex'), frame.indexOf('<details'))
    expect(right).toContain('href="/login"')
    expect(right).toContain('{PRIMARY.t}')
    expect((right.match(/bg-etyme-action/g) ?? []).length, 'one filled button').toBe(1)
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

  it('there is no Industries menu, and About still says it is one product for every industry', () => {
    // The menu had four items leading to one place. The sentence under it
    // is a fact about the company, and it stays, on About.
    expect(NAV_MENUS.map((m) => m.label)).not.toContain('Industries')
    expect(all(copyOfCompanyPage(ABOUT))).toContain('There is no industry-specific version to buy.')
  })

  it('every link in the header and footer goes to a registered public page, the demo, sign-in or a section of the home page', () => {
    const routes = new Set([...PUBLIC_PAGES.map((p) => p.route), '/login'])
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

  it('the spend audit link on every page goes to the census, and nowhere else', () => {
    expect(SPEND_AUDIT.href).toBe('/census')
    const audit = FOOTER.flatMap((g) => g.links).filter((l) => /spend audit/i.test(l.label))
    expect(audit.length).toBeGreaterThan(0)
    for (const l of audit) expect(l.href).toBe('/census')
    expect(read('src/lib/public-site/frame.tsx')).toContain('href={SPEND_AUDIT.href}')
  })

  it('the footer reaches the terms, the privacy notice, the DPA, contact and the security position', () => {
    const hrefs = FOOTER.flatMap((g) => g.links.map((l) => l.href))
    for (const h of ['/terms', '/privacy', '/dpa', '/contact', '/security']) expect(hrefs, h).toContain(h)
  })

  it('every new page is drawn inside the one frame', () => {
    for (const f of ['module-page.tsx', 'docs-page.tsx', 'company-page.tsx']) {
      const src = read(`src/lib/public-site/${f}`)
      expect(src, f).toContain('<SiteFrame>')
    }
  })
})

describe('The documentation is written in plain English for a reader anywhere', () => {
  // The founder, 2026-09-29: plain English that people in India, the US,
  // the UK and Australia, and non-native readers, can read. Short blocks,
  // one idea per line. The chips are labels, not sentences, so they are
  // left out of the count.
  const words = (html: string) => textOfHtml(html.replace(/<span class="chip[^"]*"[^>]*>[^<]*<\/span>/g, ' '))

  for (const p of PARTIES) {
    it(`no sentence on the ${p.doc.title} documentation page runs past twenty-five words`, () => {
      expect(longSentences(p.doc.lede, 25), p.doc.slug).toEqual([])
      expect(longSentences(words(p.doc.html), 25), p.doc.slug).toEqual([])
    })
  }

  it('no sentence on the documentation home runs past twenty-five words', () => {
    const home = copyOfDocsHome()
    expect([...home.hero, ...home.body].flatMap((l) => longSentences(l, 25))).toEqual([])
  })

  it('every party page says its position on a deal as short lines, and how to read a drawing as a list', () => {
    for (const p of PARTIES) {
      const first = p.doc.html.slice(0, p.doc.html.indexOf('</section>'))
      expect(first, p.doc.slug).toMatch(/<h2>Position on a deal<\/h2><ul class="lines">/)
      expect(first, p.doc.slug).toContain('<h3 class="sub">How to read a drawing</h3><ul class="lines legend">')
      // No paragraph of prose is left in the opening section.
      expect(first.replace(/<p class="eyebrow"[^>]*>[^<]*<\/p>|<p style="margin-top:10px">[\s\S]*?<\/p>/g, ''), p.doc.slug).not.toMatch(/<p[ >]/)
    }
  })

  it('every station in the documentation’s tables is drawn in the same words, so the table and the drawing cannot drift', () => {
    const streams = read('docs/lanes/streams.mjs')
    const drawn = (s: string) => streams.includes(`'${s.replace(/&amp;/g, '&')}'`)
    for (const p of PARTIES) {
      for (const [, label, what, rule] of p.doc.html.matchAll(
        /<tr><td><span class="num">[^<]*<\/span><\/td><td><b>((?:(?!<\/b>).)*)<\/b>.*?<\/td><td>.*?<\/td><td>((?:(?!<\/td>).)*)<\/td><td>((?:(?!<\/td>).)*)<\/td><\/tr>/g,
      )) {
        expect(drawn(label), `${p.doc.slug}: station “${label}” is not drawn`).toBe(true)
        expect(drawn(what), `${p.doc.slug}: “${what}” is not drawn`).toBe(true)
        for (const [, r] of rule.matchAll(/<span class="chip chip--danger">([^<]*)<\/span>/g)) {
          expect(drawn(r), `${p.doc.slug}: refusal “${r}” is not drawn`).toBe(true)
        }
      }
    }
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
