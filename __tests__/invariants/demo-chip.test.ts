import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/program',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

import { isDemoCompany, reservedDomain, type DemoFacts } from '@/lib/demo-company'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { Sidebar } from '@/components/shell/sidebar'
import { DemoChip } from '@/components/shell/demo-chip'

/**
 * "Demo", in front of a made-up company's name.
 *
 * Founder, 2026-09-28: a reminder, on every screen, that the company
 * somebody is signed in at does not exist. Decided from who is seated
 * there, never from a list of names and never from the slug — see
 * lib/demo-company for why each of the other signals was refused.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** The seeded world's Northbend Athletic, as the database holds it. */
const SEEDED: DemoFacts = { isDemo: false, domain: null, domainVerified: false, seats: 6, realSeats: 0 }
/** A client that signed in through Microsoft with its own domain. */
const REAL: DemoFacts = { isDemo: false, domain: 'acme-industries.com', domainVerified: true, seats: 40, realSeats: 40 }

describe('which companies are demo companies', () => {
  it('a seeded company whose every seat is at a reserved address is a demo company', () => {
    expect(isDemoCompany(SEEDED)).toBe(true)
  })

  it('a visitor’s own demo sandbox is a demo company, though the visitor signed in at a real address', () => {
    expect(isDemoCompany({ isDemo: true, domain: null, domainVerified: false, seats: 1, realSeats: 1 })).toBe(true)
  })

  it('a company on a domain nobody can register is a demo company', () => {
    expect(isDemoCompany({ isDemo: false, domain: 'northbend.example', domainVerified: false, seats: 0, realSeats: 0 })).toBe(true)
    expect(reservedDomain('demo.etyme.local')).toBe(true)
    expect(reservedDomain('example.com')).toBe(false)
  })

  it('a real company never reads Demo', () => {
    expect(isDemoCompany(REAL)).toBe(false)
  })

  it('a real company never reads Demo even if a flag says demo, because a verified registrable domain outranks it', () => {
    expect(isDemoCompany({ ...REAL, isDemo: true })).toBe(false)
  })

  it('a real company never reads Demo when its slug starts with world-, because the slug is not the signal', () => {
    // World Wide Technology slugifies to world-wide-technology. Nothing
    // about the slug is an input, so this holds by construction; the
    // facts below are the ones that company would have.
    expect(isDemoCompany({ isDemo: false, domain: 'wwt.com', domainVerified: true, seats: 3, realSeats: 3 })).toBe(false)
    expect(Object.keys(SEEDED)).not.toContain('slug')
  })

  it('one real person seated at a company is enough to make it real', () => {
    expect(isDemoCompany({ ...SEEDED, realSeats: 1 })).toBe(false)
  })

  it('a firm nobody is seated at is not called a demo on the strength of an absence', () => {
    expect(isDemoCompany({ isDemo: false, domain: null, domainVerified: false, seats: 0, realSeats: 0 })).toBe(false)
  })
})

describe('the shell says Demo in front of a demo company’s name', () => {
  const session = (isDemo: boolean) => ({
    loading: false,
    isWorker: false,
    permissions: ['*'],
    contextType: 'EMPLOYEE' as const,
    isDemo,
    person: { id: 'p1', name: 'Dana Whitlock', email: 'world-nike-hiring@demo.etyme.local' },
    company: { id: 'c1', name: 'Northbend Athletic', slug: 'world-nike', kind: 'CLIENT' as const },
  })
  const rail = (isDemo: boolean, sheet = false) =>
    renderToStaticMarkup(createElement(Sidebar, { ...sidebarPropsFrom(session(isDemo)), sheet }))

  it('a seeded demo company reads Demo before its name on the rail', () => {
    const html = rail(true)
    expect(html).toContain('>Demo</span>')
    expect(html.indexOf('>Demo</span>')).toBeLessThan(html.indexOf('Northbend Athletic'))
  })

  it('a seeded demo company reads Demo before its name in the phone’s menu sheet', () => {
    const html = rail(true, true)
    expect(html.indexOf('>Demo</span>')).toBeGreaterThan(-1)
    expect(html.indexOf('>Demo</span>')).toBeLessThan(html.indexOf('Northbend Athletic'))
  })

  it('a real company never reads Demo on the rail or in the sheet', () => {
    expect(rail(false)).not.toContain('>Demo</span>')
    expect(rail(false, true)).not.toContain('>Demo</span>')
  })

  it('a person with no company never reads Demo, because a person is not a demo of anything', () => {
    const props = sidebarPropsFrom({ ...session(true), company: null, contextType: 'CONSULTANT' })
    expect(props.demo).toBe(false)
  })

  it('a seeded demo company reads Demo before its name in the header', () => {
    const HEADER = read('src/components/shell/header.tsx')
    // The phone's name block: the chip, then the name, in that order.
    expect(HEADER).toMatch(/\{demoChip\}\s*<span className="block text-\[13px\][^>]*>\s*\{company\?\.name/)
    // Only when the server said so, and only for a company.
    expect(HEADER).toContain('const demoChip = isDemo && company ? <DemoChip /> : null')
  })

  it('the name truncates before the chip does, so the chip reads at phone width', () => {
    expect(renderToStaticMarkup(createElement(DemoChip))).toContain('shrink-0')
    const HEADER = read('src/components/shell/header.tsx')
    expect(HEADER).toMatch(/\{demoChip\}\s*<span className="block[^"]*truncate/)
  })

  it('the chip is drawn in the brand’s action tokens and never the logo green', () => {
    const cls = renderToStaticMarkup(createElement(DemoChip)).match(/class="([^"]+)"/)![1]
    expect(cls).toContain('text-etyme-action-press')
    expect(cls).toContain('bg-etyme-action-wash')
    expect(cls).not.toMatch(/00C800|green|verified/i)
  })

  it('whether the company is a demo is answered on the server before anything draws, not fetched after', () => {
    const LAYOUT = read('src/app/dashboard/layout.tsx')
    expect(LAYOUT).toContain('demoCompanyFor(')
    expect(LAYOUT).toMatch(/<SessionProvider[^>]*demo=\{demo\}/)
  })
})
