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
const MARK = read('src/components/shell/ask-etyme-mark.tsx')
const PILLS = read('src/components/shell/section-pills.tsx')
const LIST = read('src/components/list-surface.tsx')
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
  it('keeps the search box in the header from md up, and on a phone search is gone from the header and found in each list', () => {
    expect(HEADER).toMatch(/className="relative hidden md:block" ref=\{searchRef\}/)
    // No phone search button and no phone search row.
    expect(HEADER).not.toContain('aria-label="Search"')
    expect(HEADER).not.toContain('mobileSearch')
    // Every list draws its own search box (components/list-surface).
    expect(LIST).toContain('searchable = true')
    expect(LIST).toMatch(/type="search"/)
  })

  it('has no fixed width wider than a phone outside the desktop-only search box', () => {
    // Strip the desktop search block, then look for any unprefixed w-N
    // class of 40 (160px) or more. Everything of that size must carry a
    // breakpoint prefix, so it only applies where there is room.
    const withoutDesktopSearch = HEADER.replace(
      /<div className="relative hidden md:block" ref=\{searchRef\}>[\s\S]*?\{results\}\s*<\/div>\s*\)\}\s*<\/div>/,
      ''
    )
    // The strip has to have found the block, or the check below reads it.
    expect(withoutDesktopSearch.length).toBeLessThan(HEADER.length)
    // And it stops at the search block's own end: what follows it stays checked.
    expect(withoutDesktopSearch).toContain('<AskEtymeLink')
    const wide = [...withoutDesktopSearch.matchAll(/(?<![\w:-])w-(\d+)\b/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n >= 40)
    expect(wide, `unprefixed widths of 160px or more in the header: ${wide.join(', ')}`).toEqual([])
  })

  it('hangs every dropdown from the header row on a phone, so none opens off the edge', () => {
    // The plus menu and the account menu share one positioning constant.
    // The bell that carried its own copy is gone (2026-10-13).
    expect(HEADER).toMatch(/const DROPDOWN =\s*\n?\s*'absolute inset-x-3 top-12 md:inset-x-auto md:right-0 md:top-10/)
    expect((HEADER.match(/\$\{DROPDOWN\}/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // Positioned wrappers only from md up — on a phone the row positions.
    expect(HEADER).toContain('className="hidden md:block md:relative" ref={plusRef}')
    expect(HEADER).toContain('className="hidden md:block md:relative" ref={accountRef}')
  })

  it('on a phone the header says no words: no company, no role and no demo chip beside the logo', () => {
    const phoneLogo = HEADER.match(/<Link href=\{home as any\} aria-label="Home" className=\{`md:hidden \$\{PHONE_ICON\}`\}>([\s\S]*?)<\/Link>/)
    expect(phoneLogo, 'the phone logo link').not.toBeNull()
    expect(phoneLogo![1].trim()).toBe('<EtymeMark size={22} />')
    expect(HEADER).not.toContain("{company?.name ?? person?.name ?? 'etyme'}")
    // The demo chip stays only where it was from lg up and in the desktop account menu.
    expect(HEADER).toMatch(/hidden lg:flex[^\n]*\n\s*\{demoChip\}/)
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
  const base = { company: null, contextType: null, loading: false, isWorker: false, permissions: [] } as const

  it('renders the frame without a navigation while the session is still loading', () => {
    expect(sidebarPropsFrom({ ...base, loading: true })).toMatchObject({ pending: true })
  })

  it('gives a client the client navigation', () => {
    const props = sidebarPropsFrom({
      ...base,
      contextType: 'CLIENT_CONTACT',
      company: { id: 'c', name: 'Northbend Athletic', slug: 'nike', kind: 'CLIENT' },
    })
    expect(props).toMatchObject({ companyKind: 'CLIENT', isConsultant: false, companyName: 'Northbend Athletic', companyLabel: 'Client · Enterprise' })
  })

  it('treats somebody on a bench as a consultant, whatever company holds the bench', () => {
    const props = sidebarPropsFrom({
      ...base,
      contextType: 'CONSULTANT',
      company: { id: 'v', name: 'Techpeple', slug: 'techpeple', kind: 'VENDOR' },
    })
    expect(props).toMatchObject({ isConsultant: true, companyLabel: 'Consultant' })
  })

  it('gives a person with no company no company kind, rather than guessing vendor', () => {
    expect(sidebarPropsFrom({ ...base, contextType: 'CONSULTANT' }).companyKind).toBeNull()
  })
})

describe('the flip is gone: on a phone the header is the logo, Ask Etyme with its number, and the menu', () => {
  it('the logo is the logo: it carries no number and goes to the seat’s own home', () => {
    expect(HEADER).toMatch(/<Link href=\{home as any\} aria-label="Home" className=\{`md:hidden \$\{PHONE_ICON\}`\}>\s*<EtymeMark size=\{22\} \/>/)
    expect(HEADER.match(/<EtymeMark\b/g)?.length).toBe(1)
    expect(HEADER).not.toContain('AskEtymeLogoLink')
    expect(MARK).not.toContain('AskEtymeLogoLink')
    expect(MARK).not.toContain('EtymeMark')
  })

  it('Ask Etyme in the header is a chat bubble wearing the number, and opens Ask Etyme on every page', () => {
    expect(MARK).toContain('href={ASK_ETYME_HREF as any}')
    expect(MARK).toContain('<ChatIcon />')
    expect(MARK).toContain('<OwedBadge n={n} className="absolute -top-1 -right-1.5" />')
    expect(MARK).not.toContain('AskEtymeFlip')
    expect(MARK).not.toContain('DashboardIcon')
    expect(MARK.match(/<rect /g)).toBeNull()
  })

  it('the chat icon is a rounded speech bubble drawn inline, outline only, with its tail at the lower left', () => {
    expect(MARK).toMatch(/function ChatIcon[\s\S]*fill="none" stroke="currentColor"[\s\S]*<path d="M8 4h8a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5h-6l-5 4/)
    expect(MARK).toContain('text-etyme-ink')
  })

  it('on Ask Etyme itself the header’s Ask Etyme is marked as the page being read, never swapped for a dashboard door', () => {
    expect(HEADER).toContain('{asks && <AskEtymeLink n={owed} here={onAskEtyme} />}')
    expect(MARK).toContain("aria-current={here ? 'page' : undefined}")
  })

  it('it is drawn on a phone only, once, and a seat with no Ask Etyme has none; from md up the sidebar carries it', () => {
    expect(HEADER.match(/<AskEtymeLink\b/g)?.length).toBe(1)
    expect(HEADER).toMatch(/\{asks && <AskEtymeLink/)
    expect(MARK).toMatch(/className=\{`md:hidden relative w-9 h-9 sm:w-8 sm:h-8 shrink-0/)
  })

  it('it is the size of the logo’s box and the menu button, and the number hangs off its corner, adding no width at 375', () => {
    expect(MARK).toContain('relative w-9 h-9 sm:w-8 sm:h-8 shrink-0')
    expect(MARK).not.toMatch(/(?<![\w:-])w-(\d{2,})\b/)
  })

  it('a screen reader hears Ask Etyme and the number', () => {
    expect(MARK).toMatch(/AskEtymeLink[\s\S]*const label = owedLabel\(n\)[\s\S]*aria-label=\{label\}/)
  })

  it('"Switch to dashboard" is gone from the header', () => {
    expect(HEADER).not.toContain('Switch to dashboard')
  })
})

describe('the phone header has no words: the logo, Ask Etyme and the menu, on every page', () => {
  it('the menu button is drawn on every page, Ask Etyme included, because nothing else on the phone opens the nine', () => {
    expect(HEADER).not.toContain('{!onAskEtyme && <MobileNav />}')
    expect(HEADER).toContain('        <MobileNav />')
    expect(HEADER.match(/<MobileNav\b/g)?.length).toBe(1)
  })

  it('the menu button stands on the right, after Ask Etyme', () => {
    expect(HEADER.indexOf('<AskEtymeLink')).toBeLessThan(HEADER.indexOf('<MobileNav />'))
    expect(HEADER.indexOf('ref={accountRef}')).toBeLessThan(HEADER.indexOf('<MobileNav />'))
  })

  it('the + button and the account initials are gone from the phone header, and stay from md up', () => {
    expect(HEADER).toContain('className="hidden md:block md:relative" ref={plusRef}')
    expect(HEADER).toContain('className="hidden md:block md:relative" ref={accountRef}')
  })

  it('every list a + item opened carries its own add, so nothing the phone header lost is out of reach', () => {
    const page = (p: string) => read(`src/app/dashboard/${p}/page.tsx`)
    for (const p of ['requirements', 'submissions', 'consultants', 'bench', 'contracts', 'expenses', 'invoices', 'conversations']) {
      expect(page(p), p).toMatch(/get\('new'\)/)
    }
  })

  it('the logo, Ask Etyme and the menu button sit in one icon size', () => {
    const box = 'w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center'
    expect(HEADER).toContain(`const PHONE_ICON =\n  '${box}'`)
    expect(MARK).toContain(box.replace(' rounded-nav flex items-center justify-center', ''))
    expect(MOBILE).toContain('className="md:hidden w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center')
  })

  it('the tab row is not drawn on Ask Etyme, and stays on every other page', async () => {
    const { pillsShownOn } = await import('@/components/shell/section-pills')
    expect(pillsShownOn('/dashboard/conversations/etyme')).toBe(false)
    expect(pillsShownOn('/dashboard/requisitions')).toBe(true)
    expect(pillsShownOn('/dashboard/conversations')).toBe(true)
    expect(PILLS).toContain('!pillsShownOn(pathname)')
  })

  it('the menu drawer says who you are: your name, your email and your role, above Settings and Sign out', () => {
    expect(MOBILE).toContain("role={desk.isConsultant ? 'Consultant' : desk.roleName}")
    expect(MOBILE).toMatch(/\{role && <p[^>]*>\{role\}<\/p>\}/)
  })

  it('Settings in the drawer is offered only to a seat whose route would open it, the same gate as the desktop account menu', () => {
    expect(MOBILE).toContain("mayOpenSettings={mayOpen('/dashboard/settings', desk.permissions)}")
    expect(MOBILE).toMatch(/\{mayOpenSettings && \(/)
  })

  it('in the demo the drawer opens on one quiet line naming the sample company, and never for a person with no company', () => {
    expect(MOBILE).toContain('const demoCompany = session.isDemo && session.company ? session.company.name : null')
    expect(MOBILE).toMatch(/\{demoCompany && \([\s\S]*?Demo · \{demoCompany\} is a sample company/)
    // At the top: before the sidebar inside the sheet.
    expect(MOBILE.indexOf('Demo · {demoCompany}')).toBeLessThan(MOBILE.indexOf('<Sidebar'))
  })
})
