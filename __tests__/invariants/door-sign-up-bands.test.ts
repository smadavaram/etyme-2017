import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { everyDoorView, copyOfPartyPage, partyAt } from '@/lib/public-site/parties'
import { BAND, BAND_FOR_SELF, MOST_WORDS, bandWords, countWords } from '@/lib/public-site/skeleton-words'
import { COMPANY_TYPES } from '@/lib/onboarding'
import {
  check, withoutVerb, unverifiableClaims, readsAsAimedAtSuppliers, longSentences,
  britishSpellings, wordsNobodyUses, offersTheProgramOffice, priceClaims,
} from '@/lib/positioning'

/**
 * Each party door's sign-up band says that party's own next act.
 *
 * The second Tapin walk (2026-10-31) read the Suppliers door as a bench
 * supplier signing up fresh. Its band said "Seen enough? Set up your
 * company. Your suppliers and contractors go where the sample ones are.",
 * which is written to a hiring company, and its Sign up opened the form on
 * an empty choice whose first option is Client. The home page speaks to
 * the client and keeps that band; a door speaks to its own party.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const view = (href: string) => everyDoorView().find((v) => v.href === href)!
const band = (href: string) => { const v = view(href); return bandWords(v.band, v.bandSays) }
const words = (href: string) => { const v = view(href); const c = copyOfPartyPage(v, v.tab?.key); return [...c.hero, ...c.body] }

describe('the sign-up band on each party door', () => {
  it('the home page’s band still says "Seen enough? Set up your company.", because the home page speaks to the client', () => {
    expect(BAND.heading).toBe('Seen enough? Set up your company.')
    expect(BAND.line).toBe('Your suppliers and contractors go where the sample ones are. Free while we are testing.')
    expect(read('src/app/page.tsx')).toContain('<SignUpBand talk />')
    expect(bandWords()).toEqual(BAND)
  })

  it('no party door or tab tells its reader to set up a company with suppliers going where the sample ones are', () => {
    for (const v of everyDoorView()) {
      const said = words(v.href).join(' ')
      expect(said, v.href).not.toContain(BAND.heading)
      expect(said, v.href).not.toContain(BAND.line)
    }
  })

  it('a prime vendor is asked to add a client it works with, a sub-vendor to ask its prime to link, and a bench vendor to put its bench on Etyme', () => {
    expect(band('/for/suppliers')).toEqual({
      heading: 'Seen enough? Add a client you work with.',
      line: 'Its jobs land here, ready for your sub-vendors. Free while we are testing.',
    })
    expect(band('/for/suppliers?tab=sub')).toEqual({
      heading: 'Seen enough? Ask your prime to link.',
      line: 'Add your people first. Your prime’s jobs and the weeks it approves land here. Free while we are testing.',
    })
    expect(band('/for/suppliers?tab=bench')).toEqual({
      heading: 'Seen enough? Put your bench on Etyme.',
      line: 'Add your people and ask each to say yes. Jobs from the firms you sell to land here. Free while we are testing.',
    })
  })

  it('an MSP is asked to ask its client for a seat, an integrator to put its own people on Etyme, and a solopreneur to record the contract she has', () => {
    expect(band('/for/program-offices').heading).toBe('Seen enough? Ask your client for a seat.')
    expect(band('/for/integrators').heading).toBe('Seen enough? Put your own people on Etyme.')
    expect(band('/for/contractors?tab=solo').heading).toBe('Seen enough? Record the contract you have.')
    // The worker sets up her own page, not a company, and keeps a person's band.
    expect(band('/for/contractors')).toEqual(BAND_FOR_SELF)
  })

  it('each door’s band names the same first act its party’s first greeting in Ask Etyme names, so the page never promises a first step the first screen does not offer', () => {
    const firstAct = read('src/app/api/conversations/twin/first-act.ts')
    const pairs: [string, string, string][] = [
      ['/for/program-offices', 'seat', 'Ask a client for a seat'],
      ['/for/integrators', 'one by one', 'import a file, or add them one by one'],
      ['/for/integrators', 'rolls off', 'flag who rolls off'],
      ['/for/suppliers?tab=bench', 'say yes', 'ask each to say yes'],
      ['/for/suppliers', 'a client you work with', 'Record a client you already work with'],
      ['/for/contractors?tab=solo', 'W-9 and insurance', 'put your W-9 and insurance on file'],
    ]
    for (const [href, onTheBand, inTheGreeting] of pairs) {
      const b = band(href)
      expect(`${b.heading} ${b.line}`, href).toContain(onTheBand)
      expect(firstAct, href).toContain(inTheGreeting)
    }
  })

  it('Sign up on the Suppliers door opens the form on the supplier’s own kind: a prime as a vendor, a sub-vendor and a bench vendor as firms that sell through other suppliers', () => {
    expect(view('/for/suppliers').signUp.href).toBe('/signup?type=prime')
    expect(view('/for/suppliers?tab=sub').signUp.href).toBe('/signup?type=bench')
    expect(view('/for/suppliers?tab=bench').signUp.href).toBe('/signup?type=bench')
    const kind = (href: string) => COMPANY_TYPES.find((t) => t.key === new URL(href, 'https://x.invalid').searchParams.get('type'))
    expect(kind('/signup?type=prime')).toMatchObject({ kind: 'VENDOR', posture: 'PRIME' })
    expect(kind('/signup?type=bench')).toMatchObject({ kind: 'VENDOR', posture: 'BENCH' })
    // The sign-up page opens on a `?type=` it knows, which is the list above.
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('COMPANY_TYPES.some((t) => t.key === searchParams?.type)')
    // No door opens the form on an empty choice whose first option is Client.
    for (const v of everyDoorView()) {
      const q = new URL(v.signUp.href, 'https://x.invalid').searchParams
      expect(q.has('type') || q.get('as') === 'candidate', v.href).toBe(true)
    }
  })

  it('every band a door draws is counted in its word cap and passes every guard a public page passes', () => {
    for (const v of everyDoorView()) {
      const b = band(v.href)
      const all = words(v.href)
      expect(all, v.href).toContain(b.heading)
      expect(all, v.href).toContain(b.line)
      expect(countWords(all), v.href).toBeLessThanOrEqual(MOST_WORDS)
      const text = `${b.heading} ${b.line}`
      expect(withoutVerb([b.heading]), v.href).toEqual([])
      expect(wordsNobodyUses(text), v.href).toEqual([])
      expect(britishSpellings(text), v.href).toEqual([])
      expect(unverifiableClaims(text), v.href).toEqual([])
      expect(readsAsAimedAtSuppliers(text), v.href).toEqual([])
      expect(offersTheProgramOffice(text), v.href).toEqual([])
      expect(priceClaims(text), v.href).toEqual([])
      expect(longSentences(text, 20), v.href).toEqual([])
      const rules = check({ hero: [b.heading], body: [b.line] }).map((f) => f.rule)
      expect(rules, v.href).not.toContain('neutrality')
      expect(rules, v.href).not.toContain('never-lead-with-ai')
      expect(rules, v.href).not.toContain('names-a-real-company')
    }
  })

  it('every door that sets up a company still says it is free while we are testing, and names no price', () => {
    for (const v of everyDoorView().filter((x) => x.band !== 'SELF')) {
      expect(band(v.href).line, v.href).toContain('Free while we are testing.')
    }
  })

  it('the band draws a door’s own words where it has them and the home page’s otherwise, from one reader the word counter also uses', () => {
    const skeleton = read('src/lib/public-site/skeleton.tsx')
    expect(skeleton).toContain('const words = bandWords(band, says)')
    expect(read('src/lib/public-site/skeleton-words.ts')).toContain('const words = bandWords(o.band, o.says)')
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('<SignUpBand primary={signUp} band={band} says={bandSays} />')
    expect(read('src/lib/public-site/party-page.tsx')).toContain('bandSays={p.bandSays}')
    // A door with tabs: each tab its own band, and the door's own address the first tab's.
    expect(band('/for/suppliers')).toEqual(bandWords(partyAt('suppliers')!.band, partyAt('suppliers')!.bandSays))
  })
})
