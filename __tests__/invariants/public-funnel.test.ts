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
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  check, copyFrom, priceClaims, namedCompanies, readsAsAimedAtSuppliers, offersTheProgramOffice,
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
import { OPEN_DEMO, BAND, CLIENT_SIGN_UP } from '@/lib/public-site/skeleton-words'
import { PARTY_PAGES } from '@/lib/public-site/parties'

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
    if (/href="\/signup"/.test(m[1])) continue
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

  it('the three ways forward are see it, get the audit, ask a person, in that order', () => {
    expect(WAYS_FORWARD).toEqual([SEE_IT, GET_THE_AUDIT, ASK_A_PERSON])
    // The founder's words for the two buttons, 2026-10-09.
    expect(SEE_IT).toMatchObject({ t: 'Explore the Live Demo', href: '/demo' })
    expect(GET_THE_AUDIT).toMatchObject({ t: 'Get a Free Contractor Spend Audit', href: '/census' })
    // The top of the contact page, never a section in its middle (2026-09-30).
    expect(ASK_A_PERSON).toMatchObject({ t: 'Ask a person', href: '/contact' })
    // The form the third rung leads to is really on the contact page.
    expect(CONTACT.blocks.find((b) => b.id === 'ask')).toBeDefined()
    expect(read('src/lib/public-site/company-page.tsx')).toContain("b.id === 'ask'")
  })

  it('the filled button in every header is the spend audit, and on the home page the demo comes first and the audit second, beside sign-up', () => {
    // The founder's brief, 2026-10-09: the primary call to action is the
    // audit, and the header keeps it. His home page of 2026-10-14 puts the
    // product in the page, so the one button under it opens the full demo,
    // and the audit is the second call in the sign-up band, outlined beside
    // the filled Sign up.
    expect(PRIMARY).toBe(GET_THE_AUDIT)
    expect(FRAME).toContain('href={PRIMARY.href}')
    expect(HOME.indexOf('href={SEE_IT.href}')).toBeGreaterThan(-1)
    expect(HOME.indexOf('href={SEE_IT.href}')).toBeLessThan(HOME.indexOf('href={GET_THE_AUDIT.href}'))
    const audit = HOME.slice(HOME.indexOf('href={GET_THE_AUDIT.href}'), HOME.indexOf('</CountedLink>', HOME.indexOf('href={GET_THE_AUDIT.href}')))
    expect(audit).toContain('className={SECOND_BUTTON}')
    expect(audit).toContain('{BAND.audit}')
    expect(BAND.audit).toBe('Get a free contractor spend audit')
    // The band's filled button is the client's sign-up on the home page and
    // the product pages, and a door's own sign-up on a door.
    expect(HOME).toContain('<a href={primary.href} className={PRIMARY_BUTTON}>{primary.t}</a>')
    expect(CLIENT_SIGN_UP).toEqual({ t: 'Sign up', href: '/signup' })
    expect(HOME).toMatch(/const PRIMARY_BUTTON =\s*`[^`]*bg-etyme-action/)
  })

  it('every public page ends in the same three ways forward: see it, get the audit, ask a person', () => {
    // The frame draws the close before the footer, with no switch to
    // leave it off, and every module, documentation and company page is
    // drawn in the frame.
    const frame = FRAME.slice(FRAME.indexOf('export function SiteFrame'))
    expect(frame.indexOf('<main>')).toBeLessThan(frame.indexOf('<CloseBand />'))
    expect(frame.indexOf('<CloseBand />')).toBeLessThan(frame.indexOf('<SiteFooter />'))
    expect(frame).not.toMatch(/close\??:\s*boolean/)
    for (const f of ['docs-page.tsx', 'company-page.tsx']) {
      const src = read(`src/lib/public-site/${f}`)
      expect(src, f).toContain('<SiteFrame>')
    }
    const framed = PUBLIC_PAGES.filter((p) => ['DOCS', 'COMPANY'].includes(p.kind))
    expect(framed.length).toBeGreaterThan(20)
    // The home page, the eight product pages and the four party doors are
    // the exception since 2026-10-14: they end in the sign-up band, which
    // already carries the three — the demo under the product, the audit
    // beside sign-up, and a person through Contact in the footer.
    expect(HOME).not.toContain('<CloseBand')
    expect(read('src/lib/public-site/sub-page.tsx')).not.toContain('<CloseBand')
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('<SignUpBand')
    expect(HOME).toContain('href={SEE_IT.href}')
    expect(HOME).toContain('href={GET_THE_AUDIT.href}')
    expect(HOME).toContain("{ t: 'Contact', href: '/contact' }")
    // And the component draws the three rungs, in order, from the funnel.
    const see = CLOSE.indexOf('{`${SEE_IT.t} →`}')
    const audit = CLOSE.indexOf('{GET_THE_AUDIT.t}')
    const ask = CLOSE.indexOf('{ask.t}')
    expect(see).toBeGreaterThan(-1)
    expect(see).toBeLessThan(audit)
    expect(audit).toBeLessThan(ask)
    // One filled button in the close: the spend audit, since 2026-10-09.
    expect((CLOSE.match(/bg-etyme-action/g) ?? []).length).toBe(1)
    expect(CLOSE.slice(CLOSE.indexOf('bg-etyme-action'))).toMatch(/^[^}]*\}?[\s\S]{0,400}\{GET_THE_AUDIT\.t\}/)
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
    // Until 2026-10-08 the only way in was the demo, so no button anywhere
    // could promise a start, a trial, a sign-up or an account. The password
    // door opened that day, so one button may: the home page's "Sign up",
    // which goes to that door and nowhere else. Every other label is held
    // to the old rule.
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
      // The buttons the shared skeleton draws from data (2026-10-14): the
      // demo under the frame, the audit in the band, each door's demo.
      OPEN_DEMO, BAND.audit, ...PARTY_PAGES.map((p) => p.demoLabel),
    ]
    expect(labels.length, 'the guard reads real buttons').toBeGreaterThan(20)
    expect(labels).toContain('Explore the Live Demo')
    expect(labels).toContain('Get a Free Contractor Spend Audit')
    expect(labels).toContain('Open the demo, no account')
    const promised = promisesAnAccount(labels)
    expect(promised, promised.join('\n')).toEqual([])
    // The ones that may, and the door they open, which is real: the
    // client's "Sign up" and each door's own sign-up, every one to /signup.
    for (const s of [CLIENT_SIGN_UP, ...PARTY_PAGES.map((p) => p.signUp)]) expect(s.href.startsWith('/signup'), s.t).toBe(true)
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
      'Explore the Live Demo', 'Get a Free Contractor Spend Audit', 'Free audit', 'Ask a person', 'Sign in',
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
    // band; the paragraph on About that says what is settled is in every
    // menu.
    expect(HOME).toContain('Free while we are testing.')
    expect(HOME).not.toContain('What is settled →')
    expect(priceClaims(copyFrom(HOME).join(' '))).toEqual([])
    expect(FRAME).toContain('SHEET_MORE')
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

    // One wording wherever the audit is offered: the menu's line is the
    // funnel's, the close band draws the funnel's, and the riddle is gone.
    expect(SPEND_AUDIT.d).toBe(offer)
    // The close band carries the audit as a card with one short line
    // since 2026-09-28 (night), saying the same promise.
    expect(CLOSE).toContain('{CLOSE_BAND.cards.audit}')
    expect(CLOSE_BAND.cards.audit).toContain('five working days')
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
