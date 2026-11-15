import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ONLY_OWNER_OR_ADMIN, SITE_SUPPLIERS_WHO, regionFixedSays } from '@/components/settings/settings-says'
import { TYPE_YOUR_EMAIL } from '@/lib/login-doors'

/**
 * The second look at the daily-flows batch (fix list areas A and G,
 * 2026-11-15). A reader who built none of it found boxes still greyed
 * with no words for a seat that may read and not change them, and
 * example boxes on sign-in and sign-up naming a domain anybody can buy.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const sites = read('src/app/dashboard/settings/sites/page.tsx')
const week = read('src/components/settings/week-panel.tsx')
const payroll = read('src/components/settings/payroll-panel.tsx')
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

describe('a seat that may read a setting and not change it is told so beside the boxes', () => {
  it('a seat that may not change your week reads who does, beside the greyed days', () => {
    expect(week).toContain("import { ONLY_OWNER_OR_ADMIN } from './settings-says'")
    expect(week).toContain('{!canEdit && <p className="text-[12px] text-etyme-muted">{ONLY_OWNER_OR_ADMIN}</p>}')
  })

  it('a seat that may not change payroll reads who does, beside the greyed boxes', () => {
    expect(payroll).toContain("import { ONLY_OWNER_OR_ADMIN } from './settings-says'")
    expect(payroll).toContain('{!canEdit && <p className="text-[12px] text-etyme-muted">{ONLY_OWNER_OR_ADMIN}</p>}')
  })

  it('a seat that names a site’s suppliers but may not change its address reads who changes the address', () => {
    // Procurement holds vendors.manage and not settings.manage: the ticks are
    // open to it and the address boxes are not.
    const address = sites.slice(sites.indexOf('<h2 className="font-serif text-[18px] text-etyme-ink">Address</h2>'), sites.indexOf('Days off at this site'))
    expect(address).toContain("disabled={!read.mayEdit}")
    expect(address).toContain('{!read.mayEdit && <p className="text-[12px] text-etyme-muted">{ONLY_OWNER_OR_ADMIN}</p>}')
  })

  it('a seat that may not tick a site’s suppliers reads who does, in words true at every kind of firm', () => {
    const ticks = sites.slice(sites.indexOf('Suppliers who may fill jobs here'), sites.indexOf('{(read.mayEdit || read.mayName) && ('))
    expect(ticks).toContain('disabled={!read.mayName}')
    expect(ticks).toContain('{!read.mayName && read.approved.length > 0 && <p className="text-[12px] text-etyme-muted">{SITE_SUPPLIERS_WHO}</p>}')
    expect(SITE_SUPPLIERS_WHO).toBe('Only the Owner, an Admin or the person who manages your suppliers changes these ticks.')
    // No one role's name: a client calls it Procurement Lead, an MSP Supplier Manager.
    expect(SITE_SUPPLIERS_WHO).not.toMatch(/Procurement|Supplier Manager/)
  })

  it('a seat that covers one region reads why a site’s Region box does not change', () => {
    expect(regionFixedSays('West')).toBe('Your seat covers West, so a site you add or change stays in West.')
    expect(sites).toContain('help={region ? regionFixedSays(region) : undefined}')
    expect(sites).toContain('help={read.mayEdit && read.region ? regionFixedSays(read.region) : undefined}')
  })

  it('every one of these sentences is short', () => {
    for (const s of [ONLY_OWNER_OR_ADMIN, SITE_SUPPLIERS_WHO, regionFixedSays('North America')]) expect(words(s)).toBeLessThanOrEqual(20)
  })
})

describe('the example in a sign-in or sign-up box names nobody and no domain anybody can buy', () => {
  const signup = read('src/app/(auth)/signup/form.tsx')
  const login = read('src/app/(auth)/login/page.tsx')
  const doors = read('src/app/api/auth/doors/route.ts')
  const placeholders = (src: string) => [...src.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1])

  it('the email box on sign-in and on sign-up shows an address at a reserved domain', () => {
    expect(placeholders(login)).toContain('you@company.example')
    expect(placeholders(signup)).toContain('you@company.example')
    for (const p of [...placeholders(login), ...placeholders(signup)].filter((x) => x.includes('@'))) expect(p).toMatch(/\.example$/)
  })

  it('the Etyme address box on sign-up describes the box and names no firm', () => {
    expect(placeholders(signup)).toContain('your-company')
    expect(placeholders(signup)).not.toContain('acme')
  })

  it('a half-typed email is answered with an example at a reserved domain, the same words on the page and from the route', () => {
    expect(TYPE_YOUR_EMAIL).toBe('Type your email address, like you@company.example.')
    expect(doors).toContain('message: TYPE_YOUR_EMAIL')
    expect(doors).not.toContain('you@company.com')
  })
})
