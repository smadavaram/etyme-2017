/**
 * The home page, the owner-approved design of 2026-11-18
 * (`prototypes/homepage/approved-2026-11-18.html`), which replaced the
 * founder's brief of 2026-11-12/13. The sentences below are the ones the
 * founder reads to check what was built: the owner's seven non-negotiables
 * first, then what the page says and does. The page is rendered, and each
 * sentence reads what a visitor would read.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import LandingPage, { metadata, viewport } from '@/app/page'
import { namedCompanies, sizesTheBuyer, incumbentComparison, unverifiableClaims } from '@/lib/positioning'
import { FOOTER_LINKS } from '@/lib/public-site/skeleton-words'
import { HOME_TITLE, HOME_BADGE, HERO, PRICE, START_FREE, ASK, ROLES, homeBodyLines, homeHeroLines } from '@/lib/public-site/home-page-words'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const HTML = renderToStaticMarkup(createElement(LandingPage))
const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const TEXT = text(HTML)
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]
  })

describe('The homepage keeps the owner’s seven non-negotiables', () => {
  it('the homepage title is "Etyme | Enterprise contingent workforce management"', () => {
    expect(HOME_TITLE).toBe('Etyme | Enterprise contingent workforce management')
    expect(metadata.title).toEqual({ absolute: HOME_TITLE })
  })

  it('the hero badge reads "Enterprise contingent workforce management." above the headline', () => {
    expect(HOME_BADGE).toBe('Enterprise contingent workforce management.')
    expect(TEXT.indexOf(HOME_BADGE)).toBeGreaterThanOrEqual(0)
    expect(TEXT.indexOf(HOME_BADGE)).toBeLessThan(TEXT.indexOf('Every contractor. Every supplier.'))
    expect(HTML).toMatch(/<h1[^>]*>Every contractor\. Every supplier\. <em[^>]*>One record\.<\/em><\/h1>/)
  })

  it('the homepage says free only in the hero offer, the price section and the start buttons', () => {
    // Take away the three places it may stand; nothing else may say it.
    const rest = TEXT.split(HERO.offer).join(' ').split(PRICE.body).join(' ').split(PRICE.button).join(' ').split(START_FREE.t).join(' ')
    expect(rest).not.toMatch(/\bfree\b/i)
    // And each of the three places is really there.
    expect(TEXT).toContain(HERO.offer)
    expect(TEXT).toContain(PRICE.body)
    expect(TEXT).toContain(PRICE.button)
    // Every Start free is a button that opens the sign-up.
    const startLinks = [...HTML.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*Start free[^<]*)<\/a>/g)]
    expect(startLinks.length).toBeGreaterThanOrEqual(4)
    for (const [, href] of startLinks) expect(href).toBe('/signup')
  })

  it('the homepage has no dark color scheme', () => {
    expect(viewport.colorScheme).toBe('light')
    for (const f of ['src/app/page.tsx', 'src/lib/public-site/home-ask.tsx', 'src/lib/public-site/home-page-words.ts', 'src/app/globals.css', 'src/app/layout.tsx']) {
      expect(read(f), f).not.toMatch(/prefers-color-scheme\s*:\s*dark|color-scheme\s*:\s*dark|\bdark:/)
    }
    expect(HTML).not.toMatch(/prefers-color-scheme/)
  })

  it('the homepage states no company-size range, and names no company but the labeled sample', () => {
    expect(sizesTheBuyer(TEXT)).toEqual([])
    expect(TEXT).not.toMatch(/\b\d[\d,]*\s*(?:–|-|to)\s*\d[\d,]*\s+(?:contractors|consultants|employees|people|workers)\b/i)
    expect(TEXT).not.toMatch(/Under 20|Over 200|101–200/)
    expect(incumbentComparison(TEXT)).toEqual([])
    // The approved design names the three chat doors, Teams, Google Chat and WhatsApp. CLAUDE.md says
    // "never name any real company" with one exception that is not this one; the owner approved the
    // doors by name, so they are pinned here exactly and positioning.test.ts keeps refusing them.
    expect(namedCompanies(TEXT)).toEqual(['google', 'microsoft'])
  })

  it('the homepage ends in the standard site footer: the thirteen links and the © line', () => {
    expect(FOOTER_LINKS.map((l) => l.t)).toEqual([
      'Clients', 'MSPs', 'Integrators', 'Suppliers', 'Workers', 'Demo', 'Documentation', 'About', 'Security', 'Privacy', 'Terms', 'DPA', 'Contact',
    ])
    const footer = HTML.slice(HTML.lastIndexOf('<footer'))
    for (const l of FOOTER_LINKS) expect(footer, l.t).toContain(`href="${l.href}"`)
    expect(footer).toMatch(/©\s*\d{4}/)
    // It is the shared component, not a copy of it.
    expect(read('src/app/page.tsx')).toContain('<SkeletonFooter />')
    expect(read('src/app/page.tsx')).not.toContain('<footer')
  })

  it('demo and sample companies stay labeled as the demo’s, never as customers', () => {
    expect(TEXT).toContain(ASK.tag)
    expect(ASK.tag).toBe('Demo — not a customer')
    expect(TEXT).toContain('Corvane Packaging')
    expect(TEXT).toContain('Demo and sample companies are labeled as such. They are not customers.')
    expect(TEXT).toContain(ASK.cfoNote)
    expect(TEXT).not.toMatch(/\b(?:our customers|trusted by|used by|logos?)\b/i)
  })

  it('analytics is on the marketing pages and not in the signed-in app', () => {
    const users = walk('src').filter((f) => /\.(tsx?|jsx?)$/.test(f) && read(f).includes('@vercel/analytics'))
    // One place draws it: the footer every public page ends in.
    expect(users).toEqual(['src/lib/public-site/frame.tsx'])
    const frame = read('src/lib/public-site/frame.tsx')
    expect(frame.slice(frame.indexOf('export function HomeFooter'))).toContain('<Analytics />')
    // The home page, the product pages, the doors, the demo and the legal pages all end in that footer.
    expect(read('src/lib/public-site/skeleton.tsx')).toContain('<HomeFooter')
    for (const f of ['src/app/page.tsx', 'src/app/demo/page.tsx', 'src/app/legal/document.tsx', 'src/lib/public-site/module-page.tsx', 'src/lib/public-site/sub-page.tsx']) {
      expect(read(f), f).toMatch(/SkeletonFooter|SiteFooter|HomeFooter|SiteFrame/)
    }
    // The signed-in app, the root layout and the tenants' own pages never draw it.
    for (const f of [...walk('src/app/dashboard'), 'src/app/layout.tsx', ...walk('src/app/site'), ...walk('src/components')].filter((x) => /\.tsx?$/.test(x))) {
      expect(read(f), f).not.toMatch(/HomeFooter|SiteFooter|SkeletonFooter|@vercel\/analytics/)
    }
    expect(JSON.parse(read('package.json')).dependencies['@vercel/analytics']).toBeTruthy()
  })
})

describe('The homepage says what the approved design says', () => {
  it('the hero says the headline, the offer and two calls, then the three things Etyme replaces', () => {
    expect(homeHeroLines().slice(0, 3)).toEqual([HOME_BADGE, 'Every contractor. Every supplier. One record.', HERO.sub])
    for (const s of HERO.stats) expect(TEXT).toContain(s.b)
    expect(TEXT).toContain('See who it is for')
  })

  it('every sign-up button opens the sign-up that exists, and nothing on the page is a form that sends', () => {
    expect(HTML).not.toContain('<form')
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('export default')
    const signUpLinks = [...HTML.matchAll(/href="(\/signup[^"]*)"/g)].map((m) => m[1])
    expect(signUpLinks.length).toBeGreaterThanOrEqual(8)
    expect(new Set(signUpLinks)).toEqual(new Set(['/signup']))
  })

  it('each role card opens the Ask panel on one of its four questions', () => {
    const keys = [...HTML.matchAll(/data-q="(\w+)"/g)].map((m) => m[1])
    expect(keys).toEqual(['pay', 'limit', 'held', 'start'])
    const asks = [...HTML.matchAll(/data-ask="(\w+)"/g)].map((m) => m[1])
    expect(asks).toEqual(ROLES.cards.map((c) => c.ask))
    for (const a of asks) expect(keys).toContain(a)
  })

  it('the Ask panel and the CFO view send nothing: no request, no form, no mail', () => {
    expect(read('src/lib/public-site/home-ask.tsx')).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest|<form|mailto:/)
    expect(TEXT).not.toMatch(/\b(?:we(?:'ll| will)|will be) (?:email|send|reply)|\bemailed\b|\bnotified by email\b/i)
  })

  it('the CFO view is closed until asked for, behind one button', () => {
    expect(HTML).toMatch(/aria-expanded="false"[^>]*aria-controls="cfoPanel"|aria-controls="cfoPanel"[^>]*aria-expanded="false"/)
    expect(HTML).toMatch(/id="cfoPanel" hidden=""/)
    expect(TEXT).toContain(ASK.cfoShow)
  })

  it('the page’s own words are the ones the guards read', () => {
    const all = [...homeHeroLines(), ...homeBodyLines()].join(' ')
    for (const line of [...homeHeroLines(), ...homeBodyLines()]) expect(TEXT, line).toContain(line)
    expect(all.length).toBeGreaterThan(2000)
  })
})

describe('The homepage never says what it must not', () => {
  it('never says desk or program office in text a person reads, though the section id stays a machine name', () => {
    expect(TEXT).not.toMatch(/\bdesks?\b/i)
    expect(TEXT).not.toMatch(/\bprogram(?:me)? offices?\b/i)
    expect(HTML).toContain('id="desks"')
  })

  it('never says design partner, and claims no certification Etyme does not hold: SOC 2 is named only to say it is not held yet', () => {
    expect(TEXT).not.toMatch(/design partner/i)
    const named = TEXT.split(/(?<=[.;])\s+/).filter((x) => /SOC ?2|ISO ?27001|HIPAA|FedRAMP|GDPR[- ]compliant|certified/i.test(x))
    expect(named.map((x) => x.replace(/^.*?(No SOC 2 yet\.)/, '$1'))).toEqual(['No SOC 2 yet.', "We're a small team building in the open — ask us what we do today before you rely on us."].slice(0, 1))
  })

  it('never says money is paid automatically', () => {
    expect(TEXT).not.toMatch(/\b(?:paid|pays?|paying) (?:automatically|itself|themselves|on (?:its|their) own|by itself)\b/i)
    expect(TEXT).not.toMatch(/\bauto[- ]?(?:pay|payment)/i)
  })

  it('promises no speed and no result', () => {
    expect(unverifiableClaims(TEXT)).toEqual([])
    expect(TEXT).not.toMatch(/\b(?:in (?:minutes|seconds|days|a day|an hour)|faster|instantly|overnight|save[sd]? \$?\d)/i)
  })
})
