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
import { CATEGORY } from '@/lib/public-site/skeleton-words'
import { homeDemo, homeDemoCopy } from '@/lib/public-site/home-demo'
import { homeLines } from '@/lib/public-site/home-copy'
import { signUpWith } from '@/lib/login-doors'
import { HomeDemoBlock, CfoView, SeeItWork } from '@/lib/public-site/home-parts'
import { homeCfoLines } from '@/lib/public-site/home-cfo'
import {
  HOME_EYEBROW, HOME_HEADLINE, HOME_SUBHEAD, COMPLEMENT_LINE, START_FREE, UNDER_START, SEE_IT_WORK,
  DEMO_LABEL, DEMO_SENT, DEMO_BACK, CFO_SHOW, CFO_HIDE, CFO_LABEL, PROOF_HEADING, PROOF_CARDS, STRIP,
  PRICE_LINE, SECURITY_LINE, SECURITY_LINK, FINAL_HEADING, FINAL_LINE, FALLBACK_LINE, HOME_HEADER_BUTTON,
} from '@/lib/public-site/home-words'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('src/app/page.tsx')
const PARTS = read('src/lib/public-site/home-parts.tsx')
const WORDS = read('src/lib/public-site/home-words.ts')
/** Every word the page shows between the header and the footer, the header's own Sign in and Start free beside it. */
const ALL = ['Sign in', START_FREE.t, ...homeLines()].join(' ')
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

  it('the demo, the CFO label, the proof heading, the three proof cards and the strip are the brief’s, punctuation included', () => {
    expect(DEMO_LABEL).toBe('Demo — not a customer')
    expect(CFO_LABEL).toBe('Corvane Packaging is a sample company, not a customer. Figures use sample rates.')
    expect(PROOF_HEADING).toBe('Every contractor. Every supplier. One record.')
    expect(PROOF_CARDS).toEqual([
      '$42 held — an invoice receipt over the signed hours, held until the hours agree.',
      'Nothing is paid on hours nobody signed — the order, the signed week and the invoice must agree.',
      'Nobody starts without papers — documents are asked for, sent and checked before day one. A lapsed insurance certificate blocks the supplier the same way.',
    ])
    expect(STRIP).toBe('In it: Jobs · Submissions · Timesheets · Invoices · Papers · Suppliers. Suppliers and contractors join at no cost. Signs in with your work account. Exports to your accounting system.')
  })

  it('the price, security and last call lines are the founder’s, and security links the one-page security position', () => {
    expect(PRICE_LINE).toBe('Price: free while we test. Founding firms keep their terms.')
    expect(SECURITY_LINE).toBe('Security: no SOC 2 yet; it is next.')
    expect(SECURITY_LINK.href).toBe('/security')
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
    expect(PAGE).toContain('<SiteHeader button={HOME_HEADER_BUTTON} />')
    expect(PAGE.match(/<a href=\{START_FREE\.href\} className=\{[^>]*FILLED[^>]*>\{START_FREE\.t\}<\/a>/g)).toHaveLength(2)
    expect(START_FREE.href).not.toMatch(/^mailto:/)
    expect(PAGE).not.toMatch(/<form\b/)
  })

  it('the header on the home page is the wordmark, a plain Sign in link and Start free; every other page’s header is unchanged', () => {
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame).toContain("export function SiteHeader({ button }: { button?: { t: string; href: string } } = {})")
    expect(frame).toMatch(/\{button && \(\s*<a\s+href=\{button\.href\}/)
    // The shared pages call it with no button.
    for (const f of ['src/lib/public-site/sub-page.tsx', 'src/lib/public-site/module-page.tsx']) expect(read(f), f).toContain('<SiteHeader />')
  })
})

describe('See it work takes the reader to the demo', () => {

  it('is an outline button to the demo that works with no script, scrolls smoothly with script unless the reader asked for less motion, and moves keyboard focus to the demo', () => {
    const html = renderToStaticMarkup(createElement(SeeItWork))
    expect(html).toContain(`href="${SEE_IT_WORK.href}"`)
    expect(html).toContain('border border-etyme-rule')
    expect(html).not.toContain('bg-etyme-action')
    expect(PARTS).toContain("target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })")
    expect(PARTS).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(PARTS).toContain('target.focus({ preventScroll: true })')
    expect(PAGE).toMatch(/<section id="demo" tabIndex=\{-1\}/)
  })
})

describe('The Ask Etyme demo is the seed’s and sends nothing', () => {

  it('is the Northbend story’s first step, every name and figure read against the seed by story-panel.test.ts', () => {
    const d = homeDemo()
    const step = STORY[0]
    expect(d.question).toBe('What am I paying across every supplier this month?')
    expect(d.answer).toBe(step.chat[1].text)
    expect(d.answer).toBe('$135,200 a month: 7 contractors through 4 suppliers, at current rates. Lucía Fernández has 14 months here across two suppliers. The limit is 18.')
    expect(d.rows).toEqual([
      ['Helena Marsh', 'Computer Systems Inc', '$145', '6'],
      ['Omar Haddad', 'Brightmoor Staffing', '$132', '1'],
      ['Lucía Fernández', 'Pinnacle Resourcing', '$98', '14 of 18 · 2 suppliers'],
    ])
    expect(d.card.ask).toBe('Send the HCM integration lead job to your 3 approved suppliers? It is within budget, so it needs no approval.')
    expect(d.card.job).toBe('HCM integration lead · 12 months · Tualatin, OR')
    expect(d.card.detail).toContain('$120–140 an hour')
    // Nothing is typed into the page or the demo's code: it reads the story.
    for (const figure of ['135,200', 'Lucía', 'Helena', 'Tualatin', '$145', '$120']) {
      expect(code(PAGE).includes(figure), figure).toBe(false)
      expect(code(PARTS).includes(figure), figure).toBe(false)
      expect(code(read('src/lib/public-site/home-demo.ts')).includes(figure), figure).toBe(false)
    }
  })

  it('is labeled Northbend Athletic, Demo — not a customer, and draws the question, the answer, the three contractors and the card', () => {
    const html = renderToStaticMarkup(createElement(HomeDemoBlock, { demo: homeDemo() }))
    expect(html).toContain('Northbend Athletic')
    expect(html).toContain(DEMO_LABEL)
    for (const w of homeDemoCopy()) expect(html, w).toContain(w.replace(/&/g, '&amp;'))
    expect(html).toContain('w-full table-fixed')
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
    expect(PARTS).toContain("onClick={() => setSaid(true)}>{demo.card.yes}</button>")
    expect(PARTS).toContain("onClick={() => setSaid(true)}>{DEMO_NOT_NOW}</button>")
    expect(PARTS).toContain("onClick={() => setSaid(false)}>{DEMO_BACK}</button>")
    expect(DEMO_SENT).toBe('This is a demo, so nothing was sent. Start free to send a real job to your own suppliers.')
    expect(DEMO_BACK).toBe('Back')
  })
})

describe('The CFO view is closed until asked for, and readable with no script', () => {

  it('is one button whose words change, See the CFO view and Hide the CFO view, with aria-expanded, closed by default', () => {
    const html = renderToStaticMarkup(createElement(CfoView, { lines: homeCfoLines() }))
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls="cfo-view"')
    expect(html).toContain(`>${CFO_SHOW}</button>`)
    expect(PARTS).toContain('{open ? CFO_HIDE : CFO_SHOW}')
    expect(CFO_HIDE).toBe('Hide the CFO view')
    expect(html).toMatch(/id="cfo-view" class="hidden /)
  })

  it('its lines and its label are in the HTML the server sends either way, and with no script the page shows them open and hides the button', () => {
    const html = renderToStaticMarkup(createElement(CfoView, { lines: homeCfoLines() }))
    for (const l of homeCfoLines()) expect(html, l.t).toContain(l.t)
    expect(html).toContain(CFO_LABEL)
    expect(PAGE).toContain("const NO_SCRIPT_CFO = '#cfo-view{display:block!important}[data-cfo-toggle]{display:none!important}'")
    expect(PAGE).toContain('<noscript><style>{NO_SCRIPT_CFO}</style></noscript>')
  })

  it('shows its figures as short lines, never a table', () => {
    const html = renderToStaticMarkup(createElement(CfoView, { lines: homeCfoLines() }))
    expect(html).not.toContain('<table')
    expect(html.match(/<li /g)).toHaveLength(homeCfoLines().length)
    for (const l of homeCfoLines()) expect(l.t.split(/\s+/).length, l.t).toBeLessThanOrEqual(12)
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
    // The two companies it names are both labeled samples, beside the name.
    expect(ALL).toContain('Northbend Athletic Demo — not a customer')
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
    expect(named).toEqual(['Security: no SOC 2 yet;'])
  })

  it('never says money is paid automatically: an invoice receipt is held or cleared, never paid on its own', () => {
    expect(ALL).not.toMatch(/\b(?:paid|pays?|paying) (?:automatically|itself|themselves|on (?:its|their) own|by itself)\b/i)
    expect(ALL).not.toMatch(/\bauto[- ]?(?:pay|payment|matically pa)/i)
    expect(ALL).not.toMatch(/\bautomatic(?:ally)? (?:pay|payment|paid)/i)
    expect(PROOF_CARDS[1]).toContain('Nothing is paid on hours nobody signed')
  })
})
