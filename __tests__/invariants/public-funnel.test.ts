/**
 * The lead funnel: one ladder, the same on every public page.
 *
 * The founder, 2026-09-27: "create a high-impact page and lead funnel."
 * Until then the site had five doors under five names, and a button in
 * the marketing thread that said "Start free" on a product nobody can
 * sign up to. The ladder is named once in `lib/public-site/funnel`,
 * drawn by one component, and read by the guard.
 *
 * Since 2026-10-14 it is two rungs — see it, ask a person — and the
 * header is the logo, Sign in and a menu icon. The founder: "Menu into
 * icon. Does anyone need the audit form? I think it's useless." The
 * tests that held the audit as the primary call, the header's audit
 * button, the band's second button and the audit's line in the menu were
 * deleted with it; what replaces them is the sentence that no public
 * page links to the audit.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  check, copyFrom, priceClaims, namedCompanies, readsAsAimedAtSuppliers, offersTheProgramOffice,
  sizesAgainstIncumbents, longSentences, headlinesFrom, withoutVerb, promisesAnAccount,
} from '@/lib/positioning'
import {
  SEE_IT, GET_THE_AUDIT, ASK_A_PERSON, WAYS_FORWARD, CLOSE_BAND, closeBandCopy,
} from '@/lib/public-site/funnel'
import { MENU, HEADER, frameCopy, frameButtons, everyFrameLink } from '@/lib/public-site/nav'
import { CENSUS_COPY, NOTHING_YET, offered, acceptedKinds } from '@/lib/census-copy'
import { checkWorkEmail } from '@/lib/census'
import { PUBLIC_PAGES } from '@/lib/public-site/pages'
import { CONTACT, COMPANY_PAGES } from '@/lib/public-site/company'
import { OPEN_DEMO, CLIENT_SIGN_UP, DOORS, FOOTER_LINKS } from '@/lib/public-site/skeleton-words'
import { PARTY_PAGES } from '@/lib/public-site/parties'
import { MODULES } from '@/lib/public-site/modules'
import { STEPS } from '@/lib/public-site/steps'
import { TOPICS } from '@/lib/public-site/docs/topics'
import { STEP_PAGES } from '@/lib/public-site/docs/process'
import { WHO_DOES_WHAT, REFERENCE, DOCS_HOME } from '@/lib/public-site/docs/index'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * The home page as a reader meets it: its own question and category, and
 * the skeleton it shares with every product page and party door
 * (2026-10-14) — the frame, the sign-up band, the security line.
 */
const HOME = ['src/app/page.tsx', 'src/lib/public-site/skeleton-words.ts', 'src/lib/public-site/skeleton.tsx'].map(read).join('\n')
const FRAME = read('src/lib/public-site/frame.tsx')
const CLOSE = read('src/lib/public-site/close-band.tsx')
const CENSUS = read('src/app/census/page.tsx')

/**
 * The words on everything a reader presses, read out of the source files
 * that draw the public site: the text inside an anchor, a Link, a
 * counted link or a button, and the `label` a demo door is given.
 */
function buttonLabels(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/<(?:a|Link|button|CountedLink)\b([^>]*)>\s*([^<]+?)\s*</g)) {
    // A link to the sign-up door may say so: the door exists since
    // 2026-10-08 (the password door), and the home page's "Sign up" is the
    // founder's own button (2026-10-14). Every other label is read.
    // The menu sheet's Sign up is the same door (`MENU.signUp`, held to
    // /signup below).
    if (/href="\/signup"|href=\{MENU\.signUp\.href\}/.test(m[1])) continue
    const t = m[2].replace(/^\{['`]|['`]\}$/g, '').trim()
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
  'src/lib/public-site/party-page.tsx',
  'src/lib/public-site/sub-page.tsx',
  'src/lib/public-site/skeleton.tsx',
  'src/lib/public-site/docs-page.tsx',
  'src/lib/public-site/company-page.tsx',
]

describe('One ladder, named once', () => {

  it('the ways forward are see it, then ask a person, in that order', () => {
    expect(WAYS_FORWARD).toEqual([SEE_IT, ASK_A_PERSON])
    // The founder's words for the demo button, from the menu he approved
    // on 2026-10-15; they replaced "Explore the Live Demo".
    expect(SEE_IT).toMatchObject({ t: 'See it working, no account', href: '/demo' })
    // The top of the contact page, never a section in its middle (2026-09-30).
    expect(ASK_A_PERSON).toMatchObject({ t: 'Ask a person', href: '/contact' })
    // The form the second rung leads to is really on the contact page.
    expect(CONTACT.blocks.find((b) => b.id === 'ask')).toBeDefined()
    expect(read('src/lib/public-site/company-page.tsx')).toContain("b.id === 'ask'")
  })

  it('no public page links to the audit, and the header is the logo, Sign in and a menu icon', () => {
    // The header: three things at every width. No filled button, no word
    // "Menu" drawn (it is the icon's accessible name), no menus beside it.
    const header = FRAME.slice(FRAME.indexOf('export function SiteHeader'), FRAME.indexOf('</header>'))
    expect(header).toContain('<EtymeLogo')
    expect(header).toContain('href={HEADER.signIn.href}')
    expect(HEADER.signIn).toEqual({ t: 'Sign in', href: '/login' })
    expect(header).toContain('aria-label={HEADER.menu}')
    expect(HEADER.menu).toBe('Menu')
    expect(header).toMatch(/<summary[\s\S]*?<svg aria-hidden="true"[\s\S]*?M3\.5 6h15M3\.5 11h15M3\.5 16h15/)
    expect(header).not.toMatch(/\{'Menu'\}|>Menu</)
    // The bar itself, before the sheet the icon opens: no filled button.
    // The sheet's Sign up is the founder's (2026-10-15), behind the icon.
    const bar = header.slice(0, header.indexOf('</summary>'))
    expect(header).not.toContain('CountedLink')
    expect(bar).not.toContain('bg-etyme-action')
    // One tap target for Sign in and the icon, at every width: no
    // breakpoint hides either or swaps the header for another.
    expect(FRAME).toMatch(/const TAP = '[^']*\bh-11\b/)
    expect(bar.match(/\$\{TAP\}/g)).toHaveLength(2)
    expect(bar).not.toMatch(/\b(?:sm|md|lg|xl):(?:hidden|flex|inline)\b/)
    expect(header).not.toContain('onHome')
    expect(frameButtons().slice(0, 2)).toEqual(['Sign in', 'Menu'])
    // The sheet behind the icon ends in two buttons: the demo, and Sign up
    // to the one sign-up door.
    expect(MENU.see).toEqual({ t: SEE_IT.t, href: '/demo' })
    expect(MENU.signUp).toEqual(CLIENT_SIGN_UP)

    // No link to the audit anywhere a public page draws: the header, the
    // sheet, the footer, the bands, and the data every page is built from.
    const audit = /\/census\b|GET_THE_AUDIT|SPEND_AUDIT|spend audit|free audit/i
    expect(everyFrameLink().filter((h) => h.startsWith('/census'))).toEqual([])
    expect([...frameCopy(), ...closeBandCopy()].filter((t) => audit.test(t))).toEqual([])
    const drawers = SITE_SOURCES.filter((f) => !f.startsWith('src/app/census/'))
      .concat(['src/lib/public-site/nav.ts', 'src/lib/public-site/skeleton-words.ts', 'src/lib/public-site/sub-page.tsx'])
    // Code only: a comment that records why the audit left is history, not a link.
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const f of drawers) expect(code(read(f)), f).not.toMatch(audit)
    const data = JSON.stringify([MODULES, PARTY_PAGES, STEPS, TOPICS, STEP_PAGES, WHO_DOES_WHAT, REFERENCE, DOCS_HOME, COMPANY_PAGES, DOORS, FOOTER_LINKS])
    expect(data).not.toMatch(audit)

    // The sign-up band has one button, Sign up — a door's own sign-up on a
    // door, the candidate's on the contractors' door.
    const band = HOME.slice(HOME.indexOf('export function SignUpBand'), HOME.indexOf('export function SecurityLine'))
    expect(band.match(/<a\b[^>]*className=\{PRIMARY_BUTTON\}/g)).toHaveLength(1)
    expect(band).not.toContain('CountedLink')
    expect(CLIENT_SIGN_UP).toEqual({ t: 'Sign up', href: '/signup' })
    expect(HOME).toMatch(/const PRIMARY_BUTTON =\s*`[^`]*bg-etyme-action/)

    // /demo dropped the last link to it on 2026-10-14.
    expect(read('src/app/demo/page.tsx')).not.toMatch(/GET_THE_AUDIT|\/census/)
  })

  it('every public page ends in the same ways forward: see it, ask a person', () => {
    // The frame draws the close before the footer, with no switch to
    // leave it off, and every documentation and company page is drawn in
    // the frame.
    const frame = FRAME.slice(FRAME.indexOf('export function SiteFrame'))
    expect(frame.indexOf('<main>')).toBeLessThan(frame.indexOf('<CloseBand />'))
    expect(frame.indexOf('<CloseBand />')).toBeLessThan(frame.indexOf('<SiteFooter />'))
    expect(frame).not.toMatch(/close\??:\s*boolean/)
    for (const f of ['docs-page.tsx', 'company-page.tsx']) {
      const src = read(`src/lib/public-site/${f}`)
      expect(src, f).toContain('<SiteFrame>')
    }
    const framed = PUBLIC_PAGES.filter((p) => ['DOCS', 'COMPANY'].includes(p.kind))
    // Since 2026-10-15: the documentation home, five step pages, who does
    // what, two references and six record and recruiting pages, and the
    // three company pages.
    expect(framed.length).toBeGreaterThanOrEqual(18)
    // The home page, the four step pages and the four party doors end in
    // the sign-up band instead (2026-10-14): the demo under the product,
    // Sign up, and a person through Contact in the footer.
    expect(HOME).not.toContain('<CloseBand')
    for (const f of ['src/lib/public-site/sub-page.tsx', 'src/lib/public-site/module-page.tsx']) {
      expect(read(f), f).not.toContain('<CloseBand')
      expect(read(f), f).toContain('<SignUpBand')
    }
    expect(HOME).toContain('href={SEE_IT.href}')
    expect(HOME).toContain("{ t: 'Contact', href: '/contact' }")
    // And the component draws the two rungs, in order, from the funnel.
    const see = CLOSE.indexOf('{`${SEE_IT.t} →`}')
    const ask = CLOSE.indexOf('{ask.t}')
    expect(see).toBeGreaterThan(-1)
    expect(see).toBeLessThan(ask)
    // One filled button in the close: the demo, since the audit left.
    expect((CLOSE.match(/bg-etyme-action/g) ?? []).length).toBe(1)
    expect(CLOSE.slice(CLOSE.indexOf('bg-etyme-action'))).toMatch(/^[^}]*\}?[\s\S]{0,400}\{`\$\{SEE_IT\.t\} →`\}/)
  })

  it('the census, linked from nowhere until it closes, says at its top when it closes and where to write instead', () => {
    // Kept reachable for thirty days so a link already sent does not land
    // on a missing page (CLAUDE.md, 2026-10-14). It still draws the shared
    // header and footer, and its own form is its end.
    expect(CENSUS).toContain("'This page closes on November 13, 2026.'")
    expect(CENSUS).toMatch(/lead: 'Write to us from', link: 'Contact', after: 'instead\.', href: '\/contact'/)
    expect(CENSUS.indexOf('{CLOSES.says}')).toBeGreaterThan(CENSUS.indexOf('<SiteHeader />'))
    expect(CENSUS.indexOf('{CLOSES.says}')).toBeLessThan(CENSUS.indexOf('{CENSUS_COPY.headline}'))
    expect(read('KNOWN-LIMITS.md')).toMatch(/\/census[\s\S]{0,400}November 13, 2026/)
    expect(CENSUS).toContain('<SiteHeader />')
    expect(CENSUS).toContain('<SiteFooter />')
    expect(CENSUS).not.toContain('<CloseBand')
    expect(CENSUS).toContain('<CensusFlow />')
  })
})

describe('No button promises what the site cannot give', () => {

  it('no button promises an account the site cannot open', () => {
    // Until 2026-10-08 the only way in was the demo, so no button anywhere
    // could promise a start, a trial, a sign-up or an account. The password
    // door opened that day, so one button may: the home page's "Sign up",
    // which goes to that door and nowhere else. Every other label is held
    // to the old rule.
    const labels = [
      ...frameButtons(),
      ...MENU.steps.map((s) => s.t), ...MENU.small.map((l) => l.t),
      ...WAYS_FORWARD.map((w) => w.t),
      CENSUS_COPY.start.button, CENSUS_COPY.start.secondary, CENSUS_COPY.form.button,
      // Every button the census flow offers, at each step it can be on.
      ...[
        NOTHING_YET,
        { ...NOTHING_YET, requestId: 'r' },
        { ...NOTHING_YET, requestId: 'r', uploadToken: 't' },
      ].flatMap((state) => offered(state).map((step) => step.button ?? '')),
      ...SITE_SOURCES.flatMap((f) => buttonLabels(read(f))),
      // The buttons the shared skeleton draws from data (2026-10-14): the
      // demo under the frame and each door's demo.
      OPEN_DEMO, ...PARTY_PAGES.map((p) => p.demoLabel),
    ]
    expect(labels.length, 'the guard reads real buttons').toBeGreaterThan(20)
    expect(labels).toContain('See it working, no account')
    expect(labels).toContain('Open the demo, no account')
    const promised = promisesAnAccount(labels)
    expect(promised, promised.join('\n')).toEqual([])
    // The ones that may, and the door they open, which is real: the
    // client's "Sign up" and each door's own sign-up, a tab's own included
    // (the Solopreneur tab's, 2026-10-16), every one to /signup.
    for (const s of [CLIENT_SIGN_UP, MENU.signUp, ...PARTY_PAGES.flatMap((p) => [p.signUp, ...(p.tabs ?? []).flatMap((t) => (t.signUp ? [t.signUp] : []))])]) expect(s.href.startsWith('/signup'), s.t).toBe(true)
    expect(existsSync(join(ROOT, 'src/app/(auth)/signup/page.tsx'))).toBe(true)
    expect(existsSync(join(ROOT, 'src/app/api/auth/password'))).toBe(true)
  })

  it('catches the button the marketing thread shipped, and the ways it would come back', () => {
    for (const label of ['Start free', 'Start free →', 'Sign up', 'Create your account', 'Get started',
      'Start your free trial', 'Try Etyme free', 'Register', 'Join now']) {
      expect(promisesAnAccount([label]), label).toHaveLength(1)
    }
  })

  it('lets a door say what it leads to, and lets a page say nobody needs an account', () => {
    expect(promisesAnAccount([
      'See it working, no account', 'Explore the Live Demo', 'Get a Free Contractor Spend Audit', 'Free audit', 'Ask a person', 'Sign in',
      'Open the example program', 'No card. No sign-up.', 'No card and no sign-up.', 'Ask for your census',
    ])).toEqual([])
  })

  it('says no card and no sign-up as two short sentences, the same way everywhere it is said', () => {
    // A buyer-side review, 2026-09-27: "No card and no sign-up." became
    // "No card. No sign-up." everywhere. Every page's close says it; the
    // home page says it on its one demo button, "Open the demo, no
    // account", since 2026-10-14.
    expect(SEE_IT.d).toContain('No card. No sign-up.')
    expect(CLOSE_BAND.cards.see).toContain('No card. No sign-up.')
    expect(HOME).toContain('Open the demo, no account')
    const said = [...SITE_SOURCES.map(read), read('src/lib/public-site/funnel.ts'), read('src/lib/public-site/leads.ts')]
      .map((src) => copyFrom(src).join(' ')).join(' ')
    expect(said).not.toMatch(/no card and no sign-up/i)
  })

  it('the line about the price says it is free while we are testing, with no number, and the menu leads to what is settled', () => {
    // "What is settled →" read as a riddle, and "None set yet. Free for
    // the first five firms →" was a row of the home page's close until
    // 2026-10-14. The founder's page says it in four words in the sign-up
    // band; the paragraph on About that says what is settled is on every
    // menu sheet's small row (2026-10-15).
    expect(HOME).toContain('Free while we are testing.')
    expect(HOME).not.toContain('What is settled →')
    expect(priceClaims(copyFrom(HOME).join(' '))).toEqual([])
    expect(MENU.small).toContainEqual({ t: 'About', href: '/about' })
    expect(FRAME).toContain('MENU.small.map')
  })

  it('the census promises its own time, and nothing on the site promises a faster one', () => {
    // The header said "Your numbers back in 24 hours" for a day while the
    // census page promised five working days. The header no longer offers
    // the census at all; the one place left that does (/demo) carries the
    // census's own time.
    expect(CENSUS_COPY.standfirst).toContain('inside five working days')
    expect(GET_THE_AUDIT.d).toContain('five working days')
    const everywhere = [...frameCopy(), ...closeBandCopy(), GET_THE_AUDIT.d].join(' ')
    expect(everywhere).not.toMatch(/24 hours|ten minutes|same day|within an hour/i)
  })
})

describe('The census, while it stays, says what to send and where', () => {

  it('the census offer says what to send and where, with a verb', () => {
    // A buyer-side review, 2026-09-27, read "Send what you already hold.
    // A named person sends one page back inside five working days." as a
    // riddle. The line opens on what to do, names where it is done, and
    // names what to send in a CFO's own words.
    const offer = GET_THE_AUDIT.d
    expect(offer).toMatch(/^(Ask|Upload|Send|Fill in)\b/)
    expect(offer).toContain('the audit page')
    expect(GET_THE_AUDIT.href).toBe('/census')
    expect(offer).toContain('upload your contractor list')
    // What a firm receives from below is an invoice receipt; what it
    // issues upward is a bill (CLAUDE.md, 2026-09-28).
    expect(offer).toContain('invoice receipts')
    expect(offer).toContain('a spreadsheet is fine')
    expect(offer).toContain('five working days')

    // Every one of those is something the census really takes: a list of
    // contractors is its template, one row per contractor; invoice receipts are
    // its second option; and a spreadsheet opens, whether CSV or Excel.
    expect(CENSUS_COPY.send.optionA.says).toContain('One row per contractor')
    expect(CENSUS_COPY.send.optionB.says).toContain('invoice receipts')
    expect(acceptedKinds()).toEqual(expect.arrayContaining(['CSV', 'XLSX']))
    // And the page the button leads to says the same thing first.
    expect(CENSUS_COPY.standfirst).toMatch(/^Upload your contractor list/)
    expect(CENSUS_COPY.standfirst).toContain('invoice receipts you hold')

    // The riddle is gone everywhere.
    const everywhere = [...frameCopy(), ...closeBandCopy(), offer, CENSUS_COPY.standfirst, CENSUS].join(' ')
    expect(everywhere).not.toContain('what you already hold')
    expect(longSentences(offer, 30)).toEqual([])
  })

  it('the census asks for a work email and says who answers and when', () => {
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
    const rules = check({ hero: [CLOSE_BAND.heading, CLOSE_BAND.cards.see], body: said }).map((f) => f.rule)
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
