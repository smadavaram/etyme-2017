/**
 * The lead funnel: one ladder, the same on every public page.
 *
 * The founder, 2026-09-27: "create a high-impact page and lead funnel."
 * Until then the site had five doors under five names, and a button in
 * the marketing thread that said "Start free" on a product nobody can
 * sign up to. The ladder is now three rungs in one order — see it, get
 * the audit, ask a person — named once in `lib/public-site/funnel`,
 * drawn by one component, and read by the guard.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  check, priceClaims, namedCompanies, readsAsAimedAtSuppliers, offersTheProgramOffice,
  sizesAgainstIncumbents, longSentences, headlinesFrom, withoutVerb, promisesAnAccount,
} from '@/lib/positioning'
import {
  SEE_IT, GET_THE_AUDIT, ASK_A_PERSON, WAYS_FORWARD, CLOSE_BAND, closeBandCopy,
} from '@/lib/public-site/funnel'
import { PRIMARY, SPEND_AUDIT, NAV_MENUS, frameCopy, frameButtons, itemsOf } from '@/lib/public-site/nav'
import { CENSUS_COPY, NOTHING_YET, offered, acceptedKinds } from '@/lib/census-copy'
import { checkWorkEmail } from '@/lib/census'
import { PUBLIC_PAGES } from '@/lib/public-site/pages'
import { CONTACT } from '@/lib/public-site/company'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const HOME = read('src/app/page.tsx')
const FRAME = read('src/lib/public-site/frame.tsx')
const CLOSE = read('src/lib/public-site/close-band.tsx')
const CENSUS = read('src/app/census/page.tsx')

/**
 * The words on everything a reader presses, read out of the source files
 * that draw the public site: the text inside an anchor, a Link or a
 * button, and the `label` a demo door is given.
 */
function buttonLabels(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/<(?:a|Link|button)\b[^>]*>\s*([^<]+?)\s*</g)) {
    const t = m[1].replace(/^\{['`]|['`]\}$/g, '').trim()
    if (/[A-Za-z]/.test(t)) out.push(t)
  }
  for (const m of src.matchAll(/\blabel="([^"]+)"/g)) out.push(m[1])
  return out
}

const SITE_SOURCES = [
  'src/app/page.tsx',
  'src/app/census/page.tsx',
  'src/app/census/flow.tsx',
  'src/lib/public-site/frame.tsx',
  'src/lib/public-site/close-band.tsx',
  'src/lib/public-site/module-page.tsx',
  'src/lib/public-site/docs-page.tsx',
  'src/lib/public-site/company-page.tsx',
]

describe('One ladder, named once', () => {

  it('the three ways forward are see it, get the audit, ask a person, in that order', () => {
    expect(WAYS_FORWARD).toEqual([SEE_IT, GET_THE_AUDIT, ASK_A_PERSON])
    expect(SEE_IT).toMatchObject({ t: 'See it with a month of data', href: '/demo' })
    expect(GET_THE_AUDIT).toMatchObject({ t: 'Get your contractor spend audit', href: '/census' })
    expect(ASK_A_PERSON).toMatchObject({ t: 'Ask a person', href: '/contact#ask' })
    // The form the third rung leads to is really on the contact page.
    expect(CONTACT.blocks.find((b) => b.id === 'ask')).toBeDefined()
    expect(read('src/lib/public-site/company-page.tsx')).toContain("b.id === 'ask'")
  })

  it('the filled button in every header is the first rung, and the home page’s hero opens on the first two', () => {
    expect(PRIMARY).toBe(SEE_IT)
    expect(HOME.indexOf('{`${SEE_IT.t} →`}')).toBeGreaterThan(-1)
    expect(HOME.indexOf('{`${SEE_IT.t} →`}')).toBeLessThan(HOME.indexOf('{GET_THE_AUDIT.t}'))
    expect(HOME.indexOf('{GET_THE_AUDIT.t}')).toBeLessThan(HOME.indexOf('<figure'))
  })

  it('every public page ends in the same three ways forward: see it, get the audit, ask a person', () => {
    // The frame draws the close before the footer, with no switch to
    // leave it off, and every module, documentation and company page is
    // drawn in the frame.
    const frame = FRAME.slice(FRAME.indexOf('export function SiteFrame'))
    expect(frame.indexOf('<main>')).toBeLessThan(frame.indexOf('<CloseBand />'))
    expect(frame.indexOf('<CloseBand />')).toBeLessThan(frame.indexOf('<SiteFooter />'))
    expect(frame).not.toMatch(/close\??:\s*boolean/)
    for (const f of ['module-page.tsx', 'docs-page.tsx', 'company-page.tsx']) {
      const src = read(`src/lib/public-site/${f}`)
      expect(src, f).toContain('<SiteFrame>')
    }
    const framed = PUBLIC_PAGES.filter((p) => ['MODULE', 'DOCS', 'COMPANY'].includes(p.kind))
    expect(framed.length).toBeGreaterThan(20)
    // The home page ends in the same component, with the ask form beside it.
    expect(HOME).toContain('<CloseBand id="close" withForm>')
    expect(HOME.indexOf('<CloseBand')).toBeLessThan(HOME.indexOf('<SiteFooter />'))
    // And the component draws the three rungs, in order, from the funnel.
    const see = CLOSE.indexOf('{`${SEE_IT.t} →`}')
    const audit = CLOSE.indexOf('{GET_THE_AUDIT.t}')
    const ask = CLOSE.indexOf('{ask.t}')
    expect(see).toBeGreaterThan(-1)
    expect(see).toBeLessThan(audit)
    expect(audit).toBeLessThan(ask)
    // One filled button in the close: the first rung.
    expect((CLOSE.match(/bg-etyme-action/g) ?? []).length).toBe(1)
  })

  it('the census is the audit itself, so it ends in its own form rather than in a ladder back to itself', () => {
    // The one public page that is a rung does not end in the close band.
    // It draws the shared header and footer, and its own form is its end.
    expect(CENSUS).toContain('<SiteHeader />')
    expect(CENSUS).toContain('<SiteFooter />')
    expect(CENSUS).not.toContain('<CloseBand')
    expect(CENSUS).toContain('<CensusFlow />')
  })
})

describe('No button promises what the site cannot give', () => {

  it('no button promises an account the site cannot open', () => {
    // Sign-in for a real tenant is not configured on production; the
    // only way in is the demo. So no button anywhere on the public site
    // may promise a start, a trial, a sign-up or an account.
    const labels = [
      ...frameButtons(),
      ...NAV_MENUS.flatMap((m) => itemsOf(m).map((i) => i.t)),
      ...WAYS_FORWARD.map((w) => w.t),
      CENSUS_COPY.start.button, CENSUS_COPY.start.secondary, CENSUS_COPY.form.button,
      // Every button the census flow offers, at each step it can be on.
      ...[
        NOTHING_YET,
        { ...NOTHING_YET, requestId: 'r' },
        { ...NOTHING_YET, requestId: 'r', uploadToken: 't' },
      ].flatMap((state) => offered(state).map((step) => step.button ?? '')),
      ...SITE_SOURCES.flatMap((f) => buttonLabels(read(f))),
    ]
    expect(labels.length, 'the guard reads real buttons').toBeGreaterThan(20)
    expect(labels).toContain('See it with a month of data')
    expect(labels).toContain('Sit at a supplier’s desk →')
    const promised = promisesAnAccount(labels)
    expect(promised, promised.join('\n')).toEqual([])
  })

  it('catches the button the marketing thread shipped, and the ways it would come back', () => {
    for (const label of ['Start free', 'Start free →', 'Sign up', 'Create your account', 'Get started',
      'Start your free trial', 'Try Etyme free', 'Register', 'Join now']) {
      expect(promisesAnAccount([label]), label).toHaveLength(1)
    }
  })

  it('lets a door say what it leads to, and lets a page say nobody needs an account', () => {
    expect(promisesAnAccount([
      'See it with a month of data', 'Get your contractor spend audit', 'Ask a person', 'Sign in',
      'Open the example program', 'No card and no sign-up.', 'Ask for your census',
    ])).toEqual([])
  })

  it('the spend audit is promised in the census’s own time everywhere, never a faster one', () => {
    // The header said "Your numbers back in 24 hours" for a day while the
    // census page promised five working days. Every line leading to the
    // census now says what the census says.
    expect(CENSUS_COPY.standfirst).toContain('inside five working days')
    for (const line of [GET_THE_AUDIT.d, SPEND_AUDIT.d ?? '']) {
      expect(line).toContain('five working days')
    }
    const everywhere = [...frameCopy(), ...closeBandCopy(), GET_THE_AUDIT.d].join(' ')
    expect(everywhere).not.toMatch(/24 hours|ten minutes|same day|within an hour/i)
  })
})

describe('The spend audit is where a lead is captured', () => {

  it('the audit offer says what to send and where, with a verb', () => {
    // A buyer-side review, 2026-09-27, read "Send what you already hold.
    // A named person sends one page back inside five working days." as a
    // riddle. The line now opens on what to do, names where it is done,
    // and names what to send in a CFO's own words.
    const offer = GET_THE_AUDIT.d
    expect(offer).toMatch(/^(Ask|Upload|Send|Fill in)\b/)
    expect(offer).toContain('the audit page')
    expect(GET_THE_AUDIT.href).toBe('/census')
    expect(offer).toContain('upload your contractor list')
    expect(offer).toContain('supplier invoices')
    expect(offer).toContain('a spreadsheet is fine')
    expect(offer).toContain('five working days')

    // Every one of those is something the census really takes: a list of
    // contractors is its template, one row per contractor; invoices are
    // its second option; and a spreadsheet opens, whether CSV or Excel.
    expect(CENSUS_COPY.send.optionA.says).toContain('One row per contractor')
    expect(CENSUS_COPY.send.optionB.says).toContain('supplier invoices')
    expect(acceptedKinds()).toEqual(expect.arrayContaining(['CSV', 'XLSX']))
    // And the page the button leads to says the same thing first.
    expect(CENSUS_COPY.standfirst).toMatch(/^Upload your contractor list/)
    expect(CENSUS_COPY.standfirst).toContain('supplier invoices you hold')

    // One wording wherever the audit is offered: the menu's line is the
    // funnel's, the close band draws the funnel's, and the riddle is gone.
    expect(SPEND_AUDIT.d).toBe(offer)
    expect(CLOSE).toContain('{GET_THE_AUDIT.d}')
    const everywhere = [...frameCopy(), ...closeBandCopy(), offer, CENSUS_COPY.standfirst, CENSUS].join(' ')
    expect(everywhere).not.toContain('what you already hold')
    expect(longSentences(offer, 30)).toEqual([])
  })

  it('the spend audit asks for a work email and says who answers and when', () => {
    // Its first screen, before any scrolling: what it asks for, who
    // answers, and when. The page and the upload link go to a work
    // address, because a census is a company's own data.
    const first = [CENSUS_COPY.headline, CENSUS_COPY.standfirst, CENSUS_COPY.start.says].join(' ')
    expect(first).toContain('work email')
    expect(first).toContain('A named person at Etyme')
    expect(first).toContain('inside five working days')
    expect(first).toContain('writes to you by name')
    // And the form asks for exactly that, and refuses a personal address
    // in a sentence rather than accepting a lead nobody can place.
    expect(CENSUS_COPY.form.emailLabel).toBe('Your work email')
    expect(checkWorkEmail('dana@gmail.com').ok).toBe(false)
    expect(checkWorkEmail('dana@northbend.example').ok).toBe(true)
    // The first screen carries a way to the form, and the committee that
    // reads top to bottom still meets what it gets before it is asked.
    const hero = CENSUS.slice(CENSUS.indexOf('{CENSUS_COPY.headline}'), CENSUS.indexOf('id="what-you-get"'))
    expect(hero).toContain('{CENSUS_COPY.start.says}')
    expect(hero).toContain('href={CENSUS_COPY.start.href}')
    expect(CENSUS_COPY.start.href).toBe('#ask')
    expect(CENSUS.indexOf('id="what-you-get"')).toBeLessThan(CENSUS.indexOf('<CensusFlow />'))
  })
})

describe('The close band and the header are held to the same rules as every page', () => {

  const said = [...closeBandCopy(), ...WAYS_FORWARD.map((w) => w.d), ...frameCopy()]
  const text = said.join(' ')

  it('the close band names the category, places nobody and does not lead with AI', () => {
    const rules = check({ hero: [CLOSE_BAND.heading, CLOSE_BAND.line], body: said }).map((f) => f.rule)
    expect(rules).not.toContain('neutrality')
    expect(rules).not.toContain('never-lead-with-ai')
    expect(rules).not.toContain('horizontal-not-vertical')
    expect(rules).not.toContain('names-a-real-company')
  })

  it('the close band and the header carry no price, no company, no comparison and nothing aimed at a supplier', () => {
    expect(priceClaims(text)).toEqual([])
    expect(namedCompanies(text)).toEqual([])
    expect(sizesAgainstIncumbents(text)).toEqual([])
    expect(readsAsAimedAtSuppliers(text)).toEqual([])
    // The program office is offered on a page, once, by the page itself;
    // a band on every page never offers it, or every page would.
    expect(offersTheProgramOffice(text)).toEqual([])
  })

  it('the close band’s headline is a sentence with a verb, and every line in it is short enough to read once', () => {
    expect(withoutVerb([CLOSE_BAND.heading])).toEqual([])
    expect(said.flatMap((t) => longSentences(t, 30))).toEqual([])
    expect(headlinesFrom(CLOSE)).toEqual([])
  })
})
