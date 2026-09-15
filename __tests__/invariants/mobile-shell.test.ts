import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'

/**
 * The app on a phone.
 *
 * Founder report, with two screenshots: "Can you fix mobile ui — the
 * navigation, sign in sign out are all missing." Every screen cut off
 * on the left; no menu; a two-letter circle where an account should be.
 *
 * Three things were true in the source. The layout hid the sidebar
 * below md and put nothing in its place. The header was ~440px of
 * fixed-width search box, buttons and padding on a 390px phone, and a
 * header wider than the screen makes the whole page scroll sideways.
 * And Sign out lived only behind the avatar, which nothing said was a
 * menu — and for a demo visitor it did not even sign out, because
 * NextAuth's signOut leaves the demo cookie alone.
 *
 * The layout itself is checked by scripts/phone-check.mjs on a real
 * browser at 390px. What is pinned here is the structure that makes
 * that pass, so that it cannot quietly be undone by a refactor.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const HEADER = read('src/components/shell/header.tsx')
const MOBILE = read('src/components/shell/mobile-nav.tsx')
const SIDEBAR = read('src/components/shell/sidebar.tsx')
const LAYOUT = read('src/app/dashboard/layout.tsx')
const SHELL = read('src/app/dashboard/shell.tsx')
const BELL = read('src/components/notification-bell.tsx')
const SIGN_OUT = read('src/components/shell/sign-out.ts')
const SIGN_OUT_ROUTE = read('src/app/api/demo/sign-out/route.ts')

describe('a phone has a way to open the navigation', () => {
  it('shows a menu button in the header below the breakpoint that hides the sidebar', () => {
    expect(LAYOUT).toMatch(/hidden md:block[\s\S]*<DashboardShell/)
    expect(HEADER).toContain('<MobileNav />')
    expect(MOBILE).toMatch(/aria-label="Open menu"[\s\S]*className="md:hidden/)
  })

  it('opens the same sidebar the desktop shows, not a second list of links', () => {
    expect(MOBILE).toContain('<Sidebar')
    // No navigation of its own to drift from the sidebar's.
    expect(MOBILE).not.toMatch(/NavSection\[\]/)
    expect(MOBILE).not.toMatch(/href:\s*'\/dashboard/)
  })

  it('reads the company off the session through one function on both surfaces', () => {
    expect(SHELL).toContain('sidebarPropsFrom(session)')
    expect(MOBILE).toContain('sidebarPropsFrom(session)')
    // The label table used to live in shell.tsx; a copy in mobile-nav
    // would be the second guess this is meant to prevent.
    expect(SHELL).not.toContain('KIND_LABEL')
    expect(MOBILE).not.toContain('KIND_LABEL')
  })

  it('closes the menu when a destination is tapped, and on any route change', () => {
    expect(SIDEBAR).toMatch(/<Link[\s\S]*?onClick=\{onDismiss\}/)
    expect(MOBILE).toMatch(/useEffect\(\(\) => \{\s*setOpen\(false\)\s*\}, \[pathname\]\)/)
  })

  it('renders the sheet at body level, not inside the sticky header', () => {
    // The header has a backdrop-filter, which makes it the containing
    // block for any fixed descendant: a full-height sheet inside it was
    // a 56px strip. A portal is the only way out.
    expect(MOBILE).toContain('createPortal(')
    expect(MOBILE).toContain('document.body')
  })
})

describe('the header fits a phone', () => {
  it('keeps the fixed-width search box for md and up, and gives a phone a button instead', () => {
    expect(HEADER).toMatch(/className="relative hidden md:block" ref=\{searchRef\}/)
    expect(HEADER).toMatch(/aria-label="Search"[\s\S]*?className=\{`md:hidden/)
  })

  it('has no fixed width wider than a phone outside the desktop-only search box', () => {
    // Strip the desktop search block, then look for any unprefixed w-N
    // class of 40 (160px) or more. Everything of that size must carry a
    // breakpoint prefix, so it only applies where there is room.
    const withoutDesktopSearch = HEADER.replace(
      /<div className="relative hidden md:block" ref=\{searchRef\}>[\s\S]*?<\/div>\s*\n\s*<\/div>/,
      ''
    )
    const wide = [...withoutDesktopSearch.matchAll(/(?<![\w:-])w-(\d+)\b/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n >= 40)
    expect(wide, `unprefixed widths of 160px or more in the header: ${wide.join(', ')}`).toEqual([])
  })

  it('hangs every dropdown from the header row on a phone, so none opens off the edge', () => {
    // The plus menu and the account menu share one positioning constant;
    // the bell carries the same classes itself.
    expect(HEADER).toMatch(/const DROPDOWN =\s*\n?\s*'absolute inset-x-3 top-12 md:inset-x-auto md:right-0 md:top-10/)
    expect((HEADER.match(/\$\{DROPDOWN\}/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(BELL).toMatch(/inset-x-3 top-12 md:inset-x-auto md:right-0 md:top-10 md:w-80/)
    // Positioned wrappers only from md up — on a phone the row positions.
    expect(BELL).toContain('className="md:relative" ref={containerRef}')
    expect(HEADER).toContain('className="md:relative" ref={plusRef}')
    expect(HEADER).toContain('className="md:relative" ref={accountRef}')
  })

  it('closing the phone search clears it, so the desktop box does not come back pre-opened after a rotation', () => {
    // Both boxes share one query and one focused flag; the desktop one is
    // hidden by a media query, not unmounted. A query left behind on a
    // phone reappeared, results open, the moment the phone turned sideways
    // past 768px. Found by the review, not by a person — yet.
    expect(HEADER).toMatch(
      /const next = !mobileSearch\s*\n\s*setMobileSearch\(next\)\s*\n\s*setSearchFocused\(next\)\s*\n\s*if \(!next\) setSearchQuery\(''\)/
    )
  })

  it('says whose workspace this is where the rail used to', () => {
    // Mark, company, role — the prototype header — only where the rail
    // is off screen.
    expect(HEADER).toMatch(/className="md:hidden flex items-center gap-2\.5 min-w-0"[\s\S]*<EtymeMark/)
    expect(HEADER).toMatch(/\{company\?\.name \?\? person\?\.name \?\? 'etyme'\}/)
  })

  it('clips a too-wide element to the page instead of scrolling the whole screen sideways', () => {
    expect(LAYOUT).toMatch(/<main className="[^"]*overflow-x-clip/)
    // clip, never hidden: hidden makes a scroll container and breaks
    // every sticky row inside it.
    expect(LAYOUT).not.toMatch(/<main className="[^"]*overflow-x-hidden/)
  })
})

describe('sign out is reachable from a phone, and signs a demo visitor out too', () => {
  it('puts Sign out in the menu, in words', () => {
    expect(MOBILE).toMatch(/>\s*Sign out\s*</)
  })

  it('clears the demo cookie before NextAuth, from both places that offer it', () => {
    expect(SIGN_OUT.indexOf('/api/demo/sign-out')).toBeLessThan(SIGN_OUT.indexOf('signOut('))
    expect(MOBILE).toContain('signOutEverywhere()')
    expect(HEADER).toContain('signOutEverywhere()')
    // Nobody calls NextAuth's signOut directly any more.
    expect(HEADER).not.toMatch(/\bsignOut\(/)
    expect(MOBILE).not.toMatch(/\bsignOut\(/)
  })

  it('forgets the browser without deleting the workspace', () => {
    expect(SIGN_OUT_ROUTE).toContain('cookies.delete(DEMO_COOKIE)')
    // DELETE /api/demo is "start again" and destroys the company. Sign
    // out must never reach the database.
    expect(SIGN_OUT_ROUTE).not.toContain('prisma')
  })
})

describe('the sidebar props are read off the session the same way for both surfaces', () => {
  const base = { company: null, contextType: null, loading: false } as const

  it('renders the frame without a navigation while the session is still loading', () => {
    expect(sidebarPropsFrom({ ...base, loading: true })).toMatchObject({ pending: true })
  })

  it('gives a client the client navigation', () => {
    const props = sidebarPropsFrom({
      ...base,
      contextType: 'CLIENT_CONTACT',
      company: { id: 'c', name: 'Nike', slug: 'nike', kind: 'CLIENT' },
    })
    expect(props).toMatchObject({ companyKind: 'CLIENT', isConsultant: false, companyName: 'Nike', companyLabel: 'Client · Enterprise' })
  })

  it('treats somebody on a bench as a consultant, whatever company holds the bench', () => {
    const props = sidebarPropsFrom({
      ...base,
      contextType: 'CONSULTANT',
      company: { id: 'v', name: 'Cloudepa', slug: 'cloudepa', kind: 'VENDOR' },
    })
    expect(props).toMatchObject({ isConsultant: true, companyLabel: 'Consultant' })
  })

  it('gives a person with no company no company kind, rather than guessing vendor', () => {
    expect(sidebarPropsFrom({ ...base, contextType: 'CONSULTANT' }).companyKind).toBeNull()
  })
})
