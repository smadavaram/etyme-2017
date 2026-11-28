import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { countryFromTyped, countryNotReadSays, COUNTRY_BOX_SAYS } from '@/lib/setup-steps'
import {
  postalFromTyped, POSTAL_CODE_TOO_LONG, sitePlace, timeZoneFromTyped, siteTimeZoneSays, NO_SITE_TIME_ZONE, SETUP_TIME_ZONE_SAYS,
} from '@/lib/site-rules'
import { entityByKey, mapColumnsFor, parseRows } from '@/lib/importable'

/**
 * A site's address, from the tester's fix list of 2026-11-14 (A5, G5).
 * Settings → Sites had no ZIP box, and its Country box cut "United
 * States" to "UN" with no word. A site with no time zone read "The
 * company's", and no company has a time zone of its own.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const sitesPage = read('src/app/dashboard/settings/sites/page.tsx')
const sitesRoute = read('src/app/api/settings/locations/route.ts')
const setupItems = read('src/app/dashboard/settings/setup/items.tsx')
const setupRoute = read('src/app/api/settings/setup/[item]/route.ts')
const sheetsRoute = read('src/app/api/imports/sheets/route.ts')
const companyLocations = read('src/app/api/companies/[id]/locations/route.ts')

describe('a site’s country is read, never cut', () => {
  it('a site’s country typed as a name is saved as its two-letter code', () => {
    expect(countryFromTyped('United States')).toEqual({ ok: true, code: 'US' })
    expect(countryFromTyped('  india ')).toEqual({ ok: true, code: 'IN' })
    expect(countryFromTyped('USA')).toEqual({ ok: true, code: 'US' })
    expect(countryFromTyped('UK')).toEqual({ ok: true, code: 'GB' })
  })

  it('any two letters are taken as a code, so a site in a country the list does not hold, or one saved before, still saves', () => {
    expect(countryFromTyped('mx')).toEqual({ ok: true, code: 'MX' })
    expect(countryFromTyped('UN')).toEqual({ ok: true, code: 'UN' })
  })

  it('a country that is neither two letters nor a name Etyme knows is refused in a sentence that says what the box takes', () => {
    expect(countryFromTyped('Narnia')).toEqual({ ok: false, says: 'Type the country as two letters, such as US, or as its name. “Narnia” is neither.' })
    expect(countryNotReadSays('Narnia')).toBe('Type the country as two letters, such as US, or as its name. “Narnia” is neither.')
  })

  it('an empty country is left to the caller, so a new site is still the United States by default', () => {
    expect(countryFromTyped('')).toEqual({ ok: true, code: null })
    expect(sitesRoute).toContain("country: typed.country ?? 'US'")
  })

  it('no Country box and no route that writes an address cuts what was typed to two letters', () => {
    for (const src of [sitesPage, setupItems]) {
      expect(src).not.toContain('maxLength={2}')
      expect(src).not.toContain('Country (two letters)')
    }
    for (const src of [sitesRoute, setupRoute, sheetsRoute, companyLocations]) {
      expect(src).not.toMatch(/country[^\n]*slice\(0, 2\)/)
      expect(src).not.toMatch(/str\(a\?\.country, 2\)/)
    }
    // The sheet's country is read when the sheet is parsed (lib/importable).
    for (const src of [sitesRoute, setupRoute, companyLocations, read('src/lib/importable.ts')]) expect(src).toContain('countryFromTyped')
  })

  it('every Country box says what it takes and offers the country names as it is typed in', () => {
    expect(COUNTRY_BOX_SAYS).toBe('Two letters, such as US, or the country’s name.')
    expect(sitesPage.match(/<Field label="Country" help=\{COUNTRY_BOX_SAYS\}/g)).toHaveLength(2)
    expect(sitesPage.match(/list="site-countries"/g)).toHaveLength(2)
    expect(setupItems).toContain('<Field label="Country" help={COUNTRY_BOX_SAYS}>')
    expect(setupItems).toContain('<datalist id="setup-countries">')
  })
})

describe('a site’s ZIP or postal code', () => {
  it('a ZIP is kept as typed, and an empty one is nothing', () => {
    expect(postalFromTyped(' 45402 ')).toEqual({ ok: true, code: '45402' })
    expect(postalFromTyped('SW1A 1AA')).toEqual({ ok: true, code: 'SW1A 1AA' })
    expect(postalFromTyped('')).toEqual({ ok: true, code: null })
  })

  it('a ZIP longer than twenty characters is refused in a sentence, never cut', () => {
    expect(postalFromTyped('1'.repeat(21))).toEqual({ ok: false, says: POSTAL_CODE_TOO_LONG })
    expect(POSTAL_CODE_TOO_LONG).toBe('A ZIP or postal code is at most 20 characters. Check what was typed.')
  })

  it('the Sites forms have a box for every address field the route accepts', () => {
    const accepted = ['address', 'city', 'state', 'postalCode', 'country', 'timeZone']
    for (const k of accepted) expect(sitesRoute).toContain(`body.${k}`)
    const addForm = sitesPage.slice(sitesPage.indexOf('function AddSite'), sitesPage.indexOf('function OneSite'))
    const oneForm = sitesPage.slice(sitesPage.indexOf('function OneSite'))
    const keys = (form: string) => new Set([...form.match(/useState\(\{([^}]*)\}\)/)![1].matchAll(/([a-zA-Z]+):/g)].map((m) => m[1]))
    for (const form of [addForm, oneForm]) {
      const k = keys(form)
      for (const f of accepted) expect(k, `the form has no box for ${f}`).toContain(f)
      expect(form).toContain('<Field label="ZIP or postal code" error={fieldError.postalCode}>')
      expect(form).toContain('<Field label="Street"')
    }
  })

  it('a site’s place reads city, state and ZIP, then the country, and a site saved before the ZIP box reads as it did', () => {
    expect(sitePlace({ city: 'Dayton', state: 'OH', postalCode: '45402', country: 'US' })).toBe('Dayton, OH 45402, US')
    expect(sitePlace({ city: 'Dayton', state: 'OH', postalCode: null, country: 'US' })).toBe('Dayton, OH, US')
    expect(sitePlace({ city: null, state: null, postalCode: '45402', country: 'US' })).toBe('45402, US')
  })

  it('Setup’s list of sites and the Companies drawer say the place the same way, ZIP included', () => {
    expect(read('src/app/api/settings/setup/read.ts')).toContain('place: sitePlace(s), street: s.address ?? null')
    expect(read('src/app/dashboard/companies/page.tsx')).toContain('{sitePlace(loc)}')
    expect(companyLocations).toContain('postalCode: loc.postalCode')
  })

  it('a Sites import reads a ZIP column, reads a country name as its code, and refuses a country it cannot read in the row’s report', () => {
    const spec = entityByKey('LOCATIONS')!
    const mapping = mapColumnsFor(spec, ['Site', 'City', 'ZIP code', 'Country'])
    const rows = parseRows(spec, mapping, [
      { Site: 'Head office', City: 'Dayton', 'ZIP code': '45402', Country: 'United States' },
      { Site: 'North yard', City: 'Toledo', 'ZIP code': '', Country: 'Narnia' },
    ])
    expect(rows[0]).toMatchObject({ ok: true, values: { name: 'Head office', postalCode: '45402', country: 'US' } })
    expect(rows[1].ok).toBe(false)
    expect(rows[1].problems).toEqual(['Country: Type the country as two letters, such as US, or as its name. “Narnia” is neither.'])
  })

  it('a Sites import with no ZIP column never clears a ZIP somebody typed on Sites', () => {
    expect(sheetsRoute).toContain('...(v.postalCode ? { postalCode: v.postalCode } : {})')
  })
})

describe('a site’s time zone says what is true', () => {
  it('a site with no time zone reads Not set, and the word company’s is never printed beside a time zone nobody set', () => {
    expect(NO_SITE_TIME_ZONE).toBe('Not set')
    expect(sitesPage).toContain('{s.timeZone ?? NO_SITE_TIME_ZONE}')
    expect(sitesPage).toContain('placeholder={NO_SITE_TIME_ZONE}')
    expect(sitesPage).not.toContain('The company’s')
    expect(sitesPage).not.toContain('and the time zone follow the site')
  })

  it('the Time zone box says what reads it and that hours due and pay do not follow it, and the primary site names Setup', () => {
    expect(siteTimeZoneSays(false)).toBe('Team structure shows this site’s local time from it. It does not change when hours are due or when pay runs.')
    expect(siteTimeZoneSays(true)).toBe('Team structure shows this site’s local time from it. It does not change when hours are due or when pay runs. This is your primary site, so Setup → Your company changes the same box.')
    expect(sitesPage).toContain('help={siteTimeZoneSays(site.isPrimary)}')
  })

  it('only Team structure reads a site’s time zone, so the sentence that says so stays true', () => {
    // A new reader of CompanyLocation.timeZone (hours due, approval days, cycles) changes the sentence in the same commit.
    expect(read('src/lib/team-structure/read.ts')).toContain('timeZone: true')
    for (const money of ['src/lib/cycle-generator.ts', 'src/lib/money/pay-hours.ts']) {
      let src = ''
      try { src = read(money) } catch { continue }
      expect(src).not.toMatch(/location[^\n]*timeZone|timeZone[^\n]*location/i)
    }
  })

  it('a time zone nothing knows is refused in a sentence, and a real one is kept', () => {
    expect(timeZoneFromTyped('America/Chicago')).toEqual({ ok: true, zone: 'America/Chicago' })
    expect(timeZoneFromTyped('')).toEqual({ ok: true, zone: null })
    expect(timeZoneFromTyped('Central')).toEqual({ ok: false, says: '“Central” is not a time zone name. Type one like America/Chicago or Europe/London.' })
  })

  it('Setup’s Time zone box says it is the primary site’s and where each site sets its own', () => {
    expect(SETUP_TIME_ZONE_SAYS).toBe('Your primary site’s. Each site can have its own, under Settings → Sites. Team structure shows local time from it. It does not change when hours are due or when pay runs.')
    expect(setupItems).toContain('<Field label="Time zone" help={SETUP_TIME_ZONE_SAYS}>')
  })

  it('the Sites form sends a country, ZIP or time zone only where it changed, so a site saved before the checks still saves', () => {
    expect(sitesPage).toContain('...(country !== site.country ? { country } : {})')
    expect(sitesPage).toContain("...(timeZone !== (site.timeZone ?? '') ? { timeZone } : {})")
  })
})

describe('no example in a Setup box or sentence names a real-looking firm', () => {
  it('the website and accounts email examples on Setup use a reserved domain', () => {
    expect(setupRoute).toContain('like company.example.')
    expect(setupRoute).toContain('like accounts@company.example.')
    expect(setupRoute).not.toMatch(/tapin\.com/)
    expect(setupItems).not.toMatch(/placeholder="[^"]*\.(com|net|org|io)"/)
  })
})
