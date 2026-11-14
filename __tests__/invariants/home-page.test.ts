/**
 * The home page, rebuilt for conversion to the founder's brief of
 * 2026-11-13: "The current page has a strong story but no way to act."
 *
 * The sentences below are the ones the founder reads to check what was
 * built: the lines he marked verbatim are verbatim, Start free leads to
 * the sign-up that exists, the demo is the seed's and sends nothing, the
 * CFO view opens and closes, and the words the page must never carry are
 * not on it. The positioning rules (`positioning.test.ts`), the word
 * ceiling and the footer are held there and in `public-pages.test.ts`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { namedCompanies, sizesTheBuyer, unverifiableClaims, incumbentComparison } from '@/lib/positioning'
import { STORY } from '@/lib/public-site/story'
import { corvaneDemoFacts } from '@/lib/seed-corvane/plan'
import { CATEGORY } from '@/lib/public-site/skeleton-words'
import { homeDemo, homeDemoCopy } from '@/lib/public-site/home-demo'
import { homeLines } from '@/lib/public-site/home-copy'
import { signUpWith } from '@/lib/login-doors'
import { HomeDemoBlock, CfoView, SeeItWork } from '@/lib/public-site/home-parts'
import { homeCfo, homeCfoCopy, homeGlanceHeld } from '@/lib/public-site/home-cfo'
import {
  HOME_EYEBROW, HOME_HEADLINE, HOME_SUBHEAD, COMPLEMENT_LINE, START_FREE, UNDER_START, SEE_IT_WORK,
  DEMO_LABEL, DEMO_SENT, DEMO_SAVED, DEMO_BACK, CFO_SHOW, CFO_HIDE, CFO_LABEL, PROOF_HEADING, PROOF_CARDS_AFTER, PROOF_HELD_NONE, proofCards, STRIP,
  PRICE_LINE, SECURITY_LINE, SECURITY_LINK, FINAL_HEADING, FINAL_LINE, FALLBACK_LINE, HOME_HEADER_BUTTON,
  RECORD_LINE, HOME_NAV, HOME_FIT, PROOF_LABELS, SECURITY_MORE, SAMPLE_NOTE, GLANCE_LINES, DEMO_HEAD, DEMO_YES, DEMO_QUESTION, glanceHeld,
} from '@/lib/public-site/home-words'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('src/app/page.tsx')
const PARTS = read('src/lib/public-site/home-parts.tsx')
const WORDS = read('src/lib/public-site/home-words.ts')
/** Every word the page shows between the header and the footer, the header's own Sign in and Start free beside it. */
const ALL = ['Sign in', START_FREE.t, ...HOME_NAV.map((l) => l.t), ...homeLines()].join(' ')
/** The page's code, without its comments, which record history rather than say anything to a reader. */
const code = (src: string) => src.replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')

afterEach(() => { vi.unstubAllGlobals() })

describe('The home page says the founder’s lines word for word', () => {

  it('the hero is the category, the question and the locked positioning line, exactly as the brief marks them', () => {
    expect(HOME_EYEBROW).toBe('Enterprise contingent workforce management')
    expect(HOME_EYEBROW).toBe(CATEGORY)
    expect(HOME_HEADLINE).toBe('Know what every contractor costs, across every supplier.')
    expect(HOME_SUBHEAD).toBe('Not clever automation. Intelligent control — one explainable record for every contingent worker, supplier, timesheet, and invoice, so every decision can be defended, not just done.')
    expect(UNDER_START).toBe('Free for the first five firms. No card, no contract — we set it up with you.')
  })

  it('the demo, the CFO label, the brief’s section line, the three proof cards and the strip are the brief’s, punctuation included; the first proof card carries the month’s held invoices and what they bill over the signed hours from the seed in the brief’s shape', () => {
    expect(DEMO_LABEL).toBe('Demo — not a customer')
    expect(CFO_LABEL).toBe('Corvane Packaging is a sample company, not a customer. Figures use sample rates.')
    // The reference page draws the brief's section line in the hero, and
    // heads the proof cards "Held until it agrees".
    expect(RECORD_LINE).toBe('Every contractor. Every supplier. One record.')
    expect(PAGE).toContain('{RECORD_LINE}</p>')
    expect(PAGE.indexOf('{RECORD_LINE}')).toBeLessThan(PAGE.indexOf('id="demo"'))
    expect(PROOF_HEADING).toBe('Held until it agrees')
    expect(PROOF_LABELS).toEqual(['01 — Held', '02 — Signed', '03 — Papers'])
    const held = homeGlanceHeld()!
    expect(proofCards(held)).toEqual([
      `${held.invoices} supplier invoices held this month — ${held.amount} billed over the signed hours, each held until the hours agree.`,
      ...PROOF_CARDS_AFTER,
    ])
    // With no held figure the card says the rule and no number.
    expect(proofCards(null)[0]).toBe(PROOF_HELD_NONE)
    expect(PROOF_HELD_NONE).not.toMatch(/\d/)
    expect(PROOF_CARDS_AFTER).toEqual([
      'Nothing is paid on hours nobody signed — the order, the signed week and the invoice must agree.',
      'Nobody starts without papers — documents are asked for, sent and checked before day one. A lapsed insurance certificate blocks the supplier the same way.',
    ])
    expect(STRIP).toBe('In it: Jobs · Submissions · Timesheets · Invoices · Papers · Suppliers. Suppliers and contractors join at no cost. Signs in with your work account. Exports to your accounting system.')
  })

  it('the price, security and last call lines are the founder’s, and security links the one-page security position', () => {
    expect(PRICE_LINE).toBe('Price: free while we test. Founding firms keep their terms.')
    expect(SECURITY_LINE).toBe('Security: no SOC 2 yet; it is next.')
    expect(SECURITY_LINK.href).toBe('/security')
    // The page links the position; it never says "ask and we will send it".
    expect(ALL).not.toMatch(/ask and we will send/i)
    expect(SECURITY_MORE).toBe('Signs in with your work account.')
    expect(existsSync(join(ROOT, 'src/app/(site)/security/page.tsx'))).toBe(true)
    expect(FINAL_HEADING).toBe('Start free with your own contractors.')
    expect(FINAL_LINE).toBe('Etyme is free while we test it with our first firms. The first five pay nothing and keep their terms when pricing starts.')
    expect(FALLBACK_LINE).toBe('Prefer to talk first? Email support@etyme.com — one sentence is enough.')
    expect(PAGE).toContain('href={`mailto:${FALLBACK_ADDRESS}`}')
  })

  it('the site title stays “Etyme | Enterprise contingent workforce management”', () => {
    expect(PAGE).toContain("title: { absolute: 'Etyme | Enterprise contingent workforce management' }")
  })
})

describe('The complement line names no vendor until the founder says so', () => {

  it('sits alongside your HR and finance systems with no rip-and-replace, in one constant, so his two names are a one-line change', () => {
    expect(COMPLEMENT_LINE).toBe('Sits alongside your HR and finance systems. No rip-and-replace.')
    expect((WORDS.match(/export const COMPLEMENT_LINE =/g) ?? []).length).toBe(1)
    expect(PAGE).toContain('{COMPLEMENT_LINE}')
    expect(namedCompanies(COMPLEMENT_LINE)).toEqual([])
  })

  it('the brief’s own line, naming two enterprise software vendors, is still refused by the positioning guard', () => {
    // The founder ruled on 2026-09-20 and 2026-09-28 that no page names a
    // company or an enterprise incumbent. The guard stays as it is.
    expect(namedCompanies('Sits alongside Workday and SAP. No rip-and-replace.')).toEqual(expect.arrayContaining(['workday', 'sap']))
  })
})

describe('Start free leads somewhere real', () => {

  it('Start free opens the sign-up that exists, the page “Create your account” opens', () => {
    expect(START_FREE).toEqual({ t: 'Start free', href: '/signup' })
    expect(signUpWith('')).toBe(START_FREE.href)
    expect(existsSync(join(ROOT, 'src/app/(auth)/signup/page.tsx'))).toBe(true)
  })

  it('is a link drawn as the filled button, in the header, the hero and the last call, and nowhere a form or a mail', () => {
    expect(HOME_HEADER_BUTTON).toBe(START_FREE)
    expect(PAGE).toContain('<SiteHeader button={HOME_HEADER_BUTTON} links={HOME_NAV} />')
    // The hero's is the violet filled button; the last call's is the filled button on ink.
    expect(PAGE).toContain('<a href={START_FREE.href} className={FILLED}>{START_FREE.t}</a>')
    expect(PAGE).toContain('<a href={START_FREE.href} className={FILLED_ON_INK}>{START_FREE.t}</a>')
    expect(PAGE.match(/<a href=\{START_FREE\.href\}/g)).toHaveLength(2)
    expect(START_FREE.href).not.toMatch(/^mailto:/)
    expect(PAGE).not.toMatch(/<form\b/)
  })

  it('the page takes its button shapes from a file the server can read, so Start free is never drawn as plain text', () => {
    // A value imported from a 'use client' file reaches a server page as a
    // reference: inside a template literal it prints "[object Object]", and
    // the hero's Start free lost its shape on a phone (2026-11-13).
    const buttons = readFileSync(join(ROOT, 'src/lib/public-site/home-buttons.ts'), 'utf8')
    expect(buttons).not.toMatch(/^'use client'/m)
    expect(PAGE).toMatch(/import \{ FILLED, FILLED_ON_INK, OUTLINE_ON_INK \} from '@\/lib\/public-site\/home-buttons'/)
    expect(PAGE).not.toMatch(/import \{[^}]*\b(FILLED|OUTLINE)\b[^}]*\} from '@\/lib\/public-site\/home-parts'/)
    const parts = readFileSync(join(ROOT, 'src/lib/public-site/home-parts.tsx'), 'utf8')
    expect(parts).not.toMatch(/export const (FILLED|OUTLINE|FILLED_ON_INK|OUTLINE_ON_INK)\b/)
  })

  it('the header on the home page is the wordmark, from 760 wide four in-page links to its sections, a plain Sign in link and Start free; on a phone the links are not drawn; every other page’s header is unchanged', () => {
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame).toContain("export function SiteHeader({ button, links }: { button?: { t: string; href: string }; links?: readonly { t: string; href: string }[] } = {})")
    expect(HOME_NAV).toEqual([
      { t: 'Demo', href: '#demo' }, { t: 'CFO view', href: '#cfo' },
      { t: 'How it holds', href: '#proof' }, { t: 'Price & security', href: '#pricing' },
    ])
    for (const l of HOME_NAV) expect(PAGE, l.href).toContain(`id="${l.href.slice(1)}"`)
    expect(frame).toContain('className="ml-auto hidden items-center gap-x-1 min-[760px]:flex"')
    expect(frame).toMatch(/\{button && \(\s*<a\s+href=\{button\.href\}/)
    // The shared pages call it with no button.
    for (const f of ['src/lib/public-site/sub-page.tsx', 'src/lib/public-site/module-page.tsx']) expect(read(f), f).toContain('<SiteHeader />')
  })
})

describe('See it work takes the reader to the demo', () => {

  it('is an outline button to the demo that works with no script, scrolls smoothly with script unless the reader asked for less motion, and moves keyboard focus to the demo', () => {
    const html = renderToStaticMarkup(createElement(SeeItWork))
    expect(html).toContain(`href="${SEE_IT_WORK.href}"`)
    // The arrow is drawn beside the words and hidden from a screen reader.
    expect(html).toContain('See it work<span aria-hidden="true">\u00a0↓</span>')
    // The last call's "See it work again" is the same act on the ink panel.
    expect(PAGE).toContain('<SeeItWork className={OUTLINE_ON_INK} label={SEE_IT_AGAIN} />')
    expect(html).toContain('border border-etyme-rule')
    expect(html).not.toContain('bg-etyme-action')
    expect(PARTS).toContain("target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })")
    expect(PARTS).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(PARTS).toContain('target.focus({ preventScroll: true })')
    expect(PAGE).toMatch(/<section id="demo" tabIndex=\{-1\}/)
  })
})

describe('The Ask Etyme demo is the seed’s and sends nothing', () => {

  it('is Corvane Packaging, the sample company the whole page reads: the same question, the month’s spend in bold, then 359 contractors through 25 suppliers in 8 countries and Aoife Kelly 17 months here across two suppliers, 14 days from the limit of 18', () => {
    const d = homeDemo()
    const f = corvaneDemoFacts()
    expect(d.company).toBe('Corvane Packaging')
    expect(d.company).toBe(f.company)
    expect(d.question).toBe('What am I paying across every supplier this month?')
    expect(d.question).toBe(DEMO_QUESTION)
    // The figures are worked out from the seed in home-demo.test.ts; here, the shape.
    expect(d.answerLead).toMatch(/^\$[\d,]+(?:\.\d\d)? a month:$/)
    expect(`${d.answerLead} ${d.answerRest}`).toBe(d.answer)
    expect(d.answerRest).toBe(
      `${f.contractors} contractors through ${f.suppliers} suppliers in ${f.countries} countries, at current rates. ` +
      'Dollars use sample exchange rates. ' +
      `${f.nearest.name} in ${f.nearest.city} has ${f.nearest.months} months here across two suppliers. ` +
      `The limit is ${f.limitMonths}; Aoife reaches it in ${f.nearest.daysToLimit} days.`,
    )
    expect([f.contractors, f.suppliers, f.countries, f.nearest.name, f.nearest.city, f.nearest.months, f.limitMonths, f.nearest.daysToLimit])
      .toEqual([359, 25, 8, 'Aoife Kelly', 'Belfast', 17, 18, 14])
    expect(d.head).toEqual(['Contractor', 'Supplier', 'Rate / hr', 'Time here'])
    expect(d.head).toBe(DEMO_HEAD)
    // Three of the 359, at Dayton, Antwerp and Belfast, each site said under the name.
    expect(d.sites).toEqual(['Dayton, Ohio', 'Antwerp', 'Belfast'])
    expect(d.rows.map((r) => r[0])).toEqual(f.onSite.map((c) => c.name))
    expect(d.rows[2][3]).toBe('17 of 18 months · 2 suppliers')
    // Aoife Kelly carries the Watch limit tag; the glance reads her months.
    expect(d.watchRows).toEqual([2])
    expect(d.watch).toEqual({ months: 17, limit: 18 })
    // The send card is the open Dayton job from the seed.
    expect(d.card.job).toBe(f.openJob.title)
    expect(d.card.detail).toBe(`${f.openJob.months} months · Dayton, Ohio · $110–130/hr · Ready to send to suppliers`)
    expect(d.card.yes).toBe(DEMO_YES)
    // Northbend Athletic stays on every other page: the story is unchanged.
    expect(STORY[0].chat[1].text).toContain('Lucía Fernández')
    // Nothing is typed into the page or the demo's code: it reads the seed.
    for (const figure of ['3,615', '359', 'Aoife', 'Tyler', 'Elise', 'Dayton', 'Antwerp', 'Belfast', '$120', '€95', '£72', '17 of 18', '14 days', 'Automation technician']) {
      expect(code(PAGE).includes(figure), figure).toBe(false)
      expect(code(PARTS).includes(figure), figure).toBe(false)
      expect(code(read('src/lib/public-site/home-demo.ts')).includes(figure), figure).toBe(false)
    }
  })

  it('is labeled “Demo — not a customer · Corvane Packaging”, and draws the question, the answer, the three contractors with their sites and the card', () => {
    const d = homeDemo()
    const html = renderToStaticMarkup(createElement(HomeDemoBlock, { demo: d }))
    expect(html).toContain(`${DEMO_LABEL}<span aria-hidden="true"> · </span>Corvane Packaging`)
    for (const w of homeDemoCopy().filter((x) => x !== d.answer)) expect(html, w).toContain(w.replace(/&/g, '&amp;'))
    expect(html).toContain(`<strong class="font-semibold">${d.answerLead}</strong> ${d.answerRest}`)
    expect(html).toContain(`“${d.question}”`)
    for (const site of d.sites) expect(html, site).toContain(`>${site}</span>`)
    expect(html).toContain('w-full table-fixed')
    // On a phone each row is a short block, never a sideways scroll.
    expect(html).toContain('max-sm:block')
    expect(html).toContain('<thead class="max-sm:hidden">')
  })

  it('the demo’s buttons post nothing: Send and Not now are plain buttons with no form, no request and no count, and show the demo line in their place with a way back', () => {
    const fetch = vi.fn()
    const beacon = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    const html = renderToStaticMarkup(createElement(HomeDemoBlock, { demo: homeDemo() }))
    expect(fetch).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(html).not.toMatch(/<form\b|action=|formAction/)
    expect(html.match(/<button type="button"/g)).toHaveLength(2)
    for (const src of [PARTS, read('src/lib/public-site/home-demo.ts')]) {
      expect(code(src)).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest|count\(|\/api\/|useRouter|router\.push/)
    }
    // Send and Not now each show the demo line in place of the buttons, and Back brings them back.
    expect(PARTS).toContain("onClick={() => setSaid(DEMO_SENT)}>{demo.card.yes}</button>")
    expect(PARTS).toContain("onClick={() => setSaid(DEMO_SAVED)}>{DEMO_NOT_NOW}</button>")
    expect(PARTS).toContain("onClick={() => setSaid(null)}>{DEMO_BACK}</button>")
    expect(DEMO_YES).toBe('Send to suppliers')
    expect(DEMO_SENT).toBe('Ready to send — in this demo, nothing is sent. In Etyme, you approve before anything goes to suppliers.')
    expect(DEMO_SAVED).toBe('Saved as draft. Nothing was sent.')
    expect(DEMO_BACK).toBe('Back')
  })
})

describe('The CFO view is closed until asked for, and readable with no script', () => {

  it('is a card headed “Corvane Packaging — the CFO view” with one button whose words change, See the CFO view and Hide the CFO view, with aria-expanded, closed by default', () => {
    const html = renderToStaticMarkup(createElement(CfoView, { cfo: homeCfo() }))
    expect(html).toContain('Corvane Packaging — the CFO view')
    expect(html).toContain('Corvane is a sample company, not a customer.')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls="cfo-view"')
    expect(html).toContain(`>${CFO_SHOW}</button>`)
    expect(PARTS).toContain('{open ? CFO_HIDE : CFO_SHOW}')
    expect(CFO_HIDE).toBe('Hide the CFO view')
    expect(html).toMatch(/id="cfo-view" class="hidden /)
    expect(PAGE).toContain('<CfoView cfo={CFO} />')
  })

  it('its lines and its label are in the HTML the server sends either way, and with no script the page shows them open and hides the button', () => {
    const cfo = homeCfo()
    const html = renderToStaticMarkup(createElement(CfoView, { cfo }))
    for (const t of cfo.tiles) { expect(html, t.b).toContain(t.b); expect(html, t.s).toContain(t.s) }
    for (const l of cfo.lines) expect(html, l.t).toContain(l.t)
    expect(html).toContain(CFO_LABEL)
    expect(PAGE).toContain("const NO_SCRIPT_CFO = '#cfo-view{display:block!important}[data-cfo-toggle]{display:none!important}'")
    expect(PAGE).toContain('<noscript><style>{NO_SCRIPT_CFO}</style></noscript>')
  })

  it('shows four figures as tiles and four short lines (the year, the held supplier invoices, the start on hold, the time limit), every sentence twelve words or fewer, never a table', () => {
    const cfo = homeCfo()
    const html = renderToStaticMarkup(createElement(CfoView, { cfo }))
    expect(html).not.toContain('<table')
    expect(cfo.tiles).toHaveLength(4)
    expect(cfo.lines).toHaveLength(4)
    expect(html.match(/<li /g)).toHaveLength(cfo.tiles.length + cfo.lines.length)
    for (const l of homeCfoCopy(cfo)) {
      for (const sentence of l.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12)
    }
  })
})

describe('The home page never says what it must not', () => {

  it('never says “design partner”', () => {
    expect(ALL).not.toMatch(/design partner/i)
    expect(PAGE + PARTS + WORDS).not.toMatch(/design partner/i)
  })

  it('states no company-size range and no range of contractors', () => {
    expect(sizesTheBuyer(ALL)).toEqual([])
    expect(ALL).not.toMatch(/\b\d[\d,]*\s*(?:–|-|to)\s*\d[\d,]*\s+(?:contractors|consultants|employees|people|workers)\b/i)
    expect(ALL).not.toMatch(/\b(?:fewer|more|over|under|up to) (?:than )?\d[\d,]* (?:contractors|consultants|employees)\b/i)
  })

  it('names no company but the labeled sample companies, and no incumbent', () => {
    expect(namedCompanies(ALL)).toEqual([])
    expect(incumbentComparison(ALL)).toEqual([])
    // The one company it names is the labeled sample, beside the name, in the demo's tag and the CFO view's label.
    expect(ALL).toContain('Demo — not a customer Corvane Packaging')
    expect(ALL).not.toContain('Northbend')
    expect(SAMPLE_NOTE).toBe('Demo and sample companies are labeled as such. They are not customers.')
    expect(CFO_LABEL.startsWith('Corvane Packaging is a sample company, not a customer.')).toBe(true)
  })

  it('never says desk or program office', () => {
    expect(ALL).not.toMatch(/\bdesks?\b/i)
    expect(ALL).not.toMatch(/\bprogram(?:me)? offices?\b/i)
  })

  it('promises no speed and no result', () => {
    expect(unverifiableClaims(ALL)).toEqual([])
    expect(ALL).not.toMatch(/\b(?:in (?:minutes|seconds|days|a day|an hour)|faster|instantly|overnight|guarantee\w*|save[sd]? \$?\d)/i)
  })

  it('claims no certification Etyme does not hold: SOC 2 is named only to say it is not held yet', () => {
    const named = ALL.split(/(?<=[.;])\s+/).filter((x) => /SOC ?2|ISO ?27001|HIPAA|FedRAMP|GDPR[- ]compliant|certified/i.test(x))
    // The card's small heading "Security" runs into its line when the words are joined.
    expect(named.map((x) => x.replace(/^Security (?=Security:)/, ''))).toEqual(['Security: no SOC 2 yet;'])
  })

  it('never says money is paid automatically, except to say that nothing is: an invoice receipt is held or cleared, never paid on its own', () => {
    // The glance's line says the opposite, in so many words, and is the one place the phrase may stand.
    expect(GLANCE_LINES[0]).toBe('A supplier invoice is held until the signed hours and the invoice agree. A person clears it — nothing is paid automatically.')
    expect(glanceHeld(7)).toBe('billed over the signed hours on 7 held supplier invoices this month')
    const said = ALL.replace(/\bnothing is paid automatically\b/g, '')
    expect(said).not.toMatch(/\b(?:paid|pays?|paying) (?:automatically|itself|themselves|on (?:its|their) own|by itself)\b/i)
    expect(said).not.toMatch(/\bauto[- ]?(?:pay|payment|matically pa)/i)
    expect(said).not.toMatch(/\bautomatic(?:ally)? (?:pay|payment|paid)/i)
    expect(PROOF_CARDS_AFTER[0]).toContain('Nothing is paid on hours nobody signed')
  })
})
