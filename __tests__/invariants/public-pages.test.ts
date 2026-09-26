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
  check, copyFrom, priceClaims, namedCompanies, longSentences,
  readsAsAimedAtSuppliers, offersTheProgramOffice, sizesAgainstIncumbents,
  type Copy,
} from '@/lib/positioning'
import { PUBLIC_PAGES, NOT_MARKETING, MODULE_ROUTES, DOCS_SLUGS, SITE_GROUP, pageAt } from '@/lib/public-site/pages'
import { MODULES, copyOfModule } from '@/lib/public-site/modules'
import { COMPANY_PAGES, ABOUT, CONTACT, SECURITY, copyOfCompanyPage } from '@/lib/public-site/company'
import {
  PARTIES, REFERENCE, INTEGRATIONS, TIME_AND_MONEY, docSlugs, partyAt, copyOfDoc, copyOfDocsHome, textOfHtml,
} from '@/lib/public-site/docs/index'
import { NAV_MENUS, FOOTER, SPEND_AUDIT, DOCS_LINK, everyFrameLink, frameCopy } from '@/lib/public-site/nav'

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
    expect(NAV_MENUS[0].items.map((i) => i.href)).toEqual([...MODULE_ROUTES])
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

  it('every module page carries the six sections, in the order the static site set them', () => {
    const view = read('src/lib/public-site/module-page.tsx')
    const order = ['Key capabilities', 'The complaint', 'What Etyme does', 'What it looks like', 'What it refuses', 'Read the flow']
      .map((t) => view.indexOf(`title="${t}"`))
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

  it('every module page links to the flow it describes in the documentation, and the flow exists', () => {
    for (const m of MODULES) {
      const [path, anchor] = m.flow.href.split('#')
      const slug = path.replace('/docs/', '')
      expect(docSlugs(), m.route).toContain(slug)
      if (anchor) expect(partyAt(slug)!.html, `${m.flow.href} has no section #${anchor}`).toContain(`id="${anchor}"`)
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
    expect(DOCS_LINK.d).toContain('No sign-in')
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

  it('the documentation says what an ERP calls a thing without naming anybody’s ERP', () => {
    for (const p of PARTIES) {
      expect(p.doc.html, p.doc.slug).toContain('What an ERP calls it')
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

  it('the header keeps the live home page’s four menus and adds documentation beside them', () => {
    const home = read('src/app/page.tsx')
    const block = home.slice(home.indexOf('const NAV_MENUS'), home.indexOf('const STEPS'))
    const homeMenus = [...block.matchAll(/^\s{4}label: '([^']+)',$/gm)].map((m) => m[1])
    expect(NAV_MENUS.map((m) => m.label)).toEqual(['Products', 'Industries', 'Compliance', 'Why Etyme'])
    expect(homeMenus).toEqual(['Products', 'Industries', 'Compliance', 'Why Etyme'])
    expect(DOCS_LINK.href).toBe('/docs')
  })

  it('Industries stays one product and says so, with no vertical page behind it', () => {
    const industries = NAV_MENUS.find((m) => m.label === 'Industries')!
    expect(industries.note).toBe('One product. No industry-specific version to buy.')
    for (const i of industries.items) expect(i.href).toBe('/#lifecycle')
  })

  it('every link in the header and footer goes to a registered public page, the demo, sign-in or a section of the home page', () => {
    const routes = new Set([...PUBLIC_PAGES.map((p) => p.route), '/login'])
    for (const href of everyFrameLink()) {
      const path = href.split('#')[0]
      if (href.startsWith('/#')) continue
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
