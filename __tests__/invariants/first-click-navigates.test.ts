import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { landsOnFirstTab, ASK_ETYME_HREF } from '@/lib/nav-table'

/**
 * The dead first click on nav (the founder's tester on production,
 * 2026-11-08). Two causes the code allows a test of: no loading boundary,
 * so a press on a dynamic page showed nothing until the server answered;
 * and the once-a-session landing replacing a route the person had already
 * chosen while the session was loading.
 */
describe('the first click on a menu link navigates', () => {
  it('the first click on a menu link navigates, with no redirect in the way', () => {
    // A press made before the session answered is the person's choice.
    expect(landsOnFirstTab({ first: 'dashboard', path: ASK_ETYME_HREF, search: '', pressedALink: true })).toBe(false)
    // Read off the browser's own path at that moment: a press already on its way elsewhere is not replaced.
    expect(landsOnFirstTab({ first: 'dashboard', path: '/dashboard/timesheets', search: '', pressedALink: false })).toBe(false)
  })

  it('a person whose first tab is Dashboard and who has pressed nothing is still taken there once', () => {
    expect(landsOnFirstTab({ first: 'dashboard', path: ASK_ETYME_HREF, search: '', pressedALink: false })).toBe(true)
    expect(landsOnFirstTab({ first: 'ask', path: ASK_ETYME_HREF, search: '', pressedALink: false })).toBe(false)
    expect(landsOnFirstTab({ first: 'dashboard', path: ASK_ETYME_HREF, search: '?thread=x', pressedALink: false })).toBe(false)
  })

  it('the landing reads the press and the browser’s own path, never a pathname a render captured earlier', () => {
    const src = readFileSync('src/components/shell/view-switch.tsx', 'utf8')
    expect(src).toContain("addEventListener('click'")
    expect(src).toMatch(/landsOnFirstTab\(\{[^}]*path: window\.location\.pathname[^}]*pressedALink/)
    expect(src).not.toMatch(/pathname === ASK_ETYME_HREF/)
  })

  it('a press on any dashboard link moves at once, because the dashboard has a loading boundary that says the page is opening', () => {
    expect(existsSync('src/app/dashboard/loading.tsx')).toBe(true)
    const src = readFileSync('src/app/dashboard/loading.tsx', 'utf8')
    expect(src).toContain('LoadingState')
    expect(src).not.toContain("'use client'")
    expect(src).not.toMatch(/redirect|router\./)
  })

  it('no menu link sits inside a button, where a press would be the button’s and not the link’s', () => {
    for (const f of ['src/components/shell/sidebar.tsx', 'src/components/shell/mobile-nav.tsx', 'src/components/shell/view-switch.tsx', 'src/components/shell/section-pills.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/<button[^>]*>\s*<Link/)
    }
  })
})
