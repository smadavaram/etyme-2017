/**
 * Sign-up walk, round two, item 8. A client opening Contracts read
 * "Sell Contracts — What you bill clients" for as long as the session
 * took to load, because the page framed itself as a supplier's
 * (`company?.kind ?? 'VENDOR'`) until it knew better. A heading that
 * changes meaning when the session lands is a heading that lied first.
 *
 * So every money page waits: no section word, no subtitle and no
 * "Sell"/"Buy" until the company is known, then the reader's own words
 * from `lib/page-framing`.
 *
 * Round three, item 17: that was not enough. A client's Invoice receipts
 * still read "Outstanding $0 owed to us · Open bills" while loading, and
 * Contracts showed "Active bill rates", because only the heading waited —
 * the stat cards and the side under them were still guessed. So now the
 * whole page waits: until the company is known, a money page that reads
 * whose company it is draws "Loading…" and nothing else.
 *
 * Round seven, problem 2: knowing the company was not enough either.
 * Contracts, Invoice receipts and Expenses drew "$0 we owe", "Nothing is
 * running" and "$0.00" for three seconds and then the real $17,400,
 * because the tiles were drawn from empty state before the first read
 * answered. So those three also wait for `readOnce`: until the first
 * read has answered, "Loading…" and nothing else.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { domainOf } from '@/lib/domains'
import { pageFraming } from '@/lib/page-framing'

const ROOT = join(__dirname, '..', '..')
const DASHBOARD = join(ROOT, 'src', 'app', 'dashboard')

/** Every dashboard page money owns, as [repo path, source]. */
function moneyPages(): [string, string][] {
  const out: [string, string][] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name)
      if (name.isDirectory()) walk(full)
      else if (name.name === 'page.tsx') {
        const rel = full.slice(ROOT.length + 1)
        if (domainOf(rel)?.key === 'MONEY') out.push([rel, readFileSync(full, 'utf8')])
      }
    }
  }
  walk(DASHBOARD)
  return out
}

/** A money page that asks the session which company the reader is at. */
function readsCompany(src: string): boolean {
  return /const \{[^}]*\bcompany\b[^}]*\} = (useSession\(\)|session)/.test(src) || /session\.company\b/.test(src)
}

/** The gate: no company yet, so "Loading…" and nothing else is drawn. */
const WAITS = /if \(!(session\.)?company\) \{\s*return <p[^>]*>\{(session\.loading|sessionLoading) \? 'Loading…'/

describe('money pages wait until they know whose page it is', () => {
  it('finds the money pages it is meant to read', () => {
    const paths = moneyPages().map(([p]) => p)
    for (const page of ['contracts', 'invoices', 'expenses', 'ap', 'ar', 'purchase-orders']) {
      expect(paths).toContain(`src/app/dashboard/${page}/page.tsx`)
    }
  })

  it('a money page says nothing about selling or buying until it knows whose page it is', () => {
    const guessing = moneyPages()
      .filter(([, src]) => /\?\?\s*['"]VENDOR['"]/.test(src))
      .map(([p]) => p)
    expect(guessing).toEqual([])
  })

  it('accounts receivable takes its section word from the reader\'s own menu, never "Operate" written in', () => {
    const src = readFileSync(join(DASHBOARD, 'ar', 'page.tsx'), 'utf8')
    expect(src).not.toMatch(/<p className="eyebrow">Operate<\/p>/)
    expect(src).toMatch(/usePageSection\('\/dashboard\/ar'\)/)
  })

  it('the contracts page shows neither Sell nor Buy until the company has loaded', () => {
    const src = readFileSync(join(DASHBOARD, 'contracts', 'page.tsx'), 'utf8')
    expect(src).toMatch(/const framing = company\s*\?/)
    expect(src).toMatch(/!company \|\| isClient \? 'hidden'/)
  })

  it('a client reads its contracts as what it buys, not what it bills', () => {
    for (const side of ['contracts.sell', 'contracts.buy'] as const) {
      const f = pageFraming('CLIENT', side)
      expect(f.title).toBe('Contracts')
      expect(f.subtitle).not.toMatch(/bill clients|pay for talent/i)
      expect(f.create).toBeNull()
    }
  })

  it('a supplier still reads its sell side as what it bills', () => {
    expect(pageFraming('VENDOR', 'contracts.sell').subtitle).toMatch(/What you bill clients/)
  })

  it('every money page that reads whose company it is draws only "Loading…" until it knows', () => {
    const readers = moneyPages().filter(([, src]) => readsCompany(src))
    const paths = readers.map(([p]) => p)
    for (const page of ['contracts', 'invoices', 'invoices/[id]', 'expenses', 'ap', 'ar', 'purchase-orders']) {
      expect(paths).toContain(`src/app/dashboard/${page}/page.tsx`)
    }
    const guessing = readers.filter(([, src]) => !WAITS.test(src)).map(([p]) => p)
    expect(guessing).toEqual([])
  })

  it('a client\'s invoice receipts never read "owed to us" or "Open bills" while the session loads', () => {
    const src = readFileSync(join(DASHBOARD, 'invoices', 'page.tsx'), 'utf8')
    const gate = src.search(WAITS)
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(src.indexOf("'owed to us'"))
    expect(gate).toBeLessThan(src.indexOf("'Open bills'"))
    expect(gate).toBeLessThan(src.indexOf("'Owed to us'"))
  })

  it('the contracts page draws neither the Sell and Buy tabs nor "Active bill rates" while the session loads', () => {
    const src = readFileSync(join(DASHBOARD, 'contracts', 'page.tsx'), 'utf8')
    const gate = src.search(WAITS)
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(src.indexOf('Sell / Buy tabs'))
    expect(gate).toBeLessThan(src.indexOf('Active bill rates'))
  })

  it('accounts receivable and accounts payable draw no figure before the session says whose books they are', () => {
    for (const page of ['ar', 'ap']) {
      const src = readFileSync(join(DASHBOARD, page, 'page.tsx'), 'utf8')
      const gate = src.search(WAITS)
      expect(gate).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(src.indexOf('<header>'))
    }
  })

  it('Contracts, Invoice receipts and Expenses draw no figure before their first read has answered', () => {
    const READ_GATE = /if \(!readOnce\) \{\s*return <p[^>]*>Loading…<\/p>/
    for (const page of ['contracts', 'invoices', 'expenses']) {
      const whole = readFileSync(join(DASHBOARD, page, 'page.tsx'), 'utf8')
      // The page itself, not the drawers and modals above it.
      const src = whole.slice(whole.indexOf('export default function'))
      // The first read marks itself answered whatever it returned —
      // figures, a refusal or an error — so the page never waits forever.
      expect(src, page).toMatch(/\} finally \{\s*setLoading\(false\)\s*setReadOnce\(true\)/)
      const gate = src.search(READ_GATE)
      expect(gate, page).toBeGreaterThan(-1)
      // Every tile on the page is drawn after the gate, never before it.
      const tiles = [...src.matchAll(/stat-(value|label)/g)].map((m) => m.index!)
      expect(tiles.length, page).toBeGreaterThan(0)
      const before = tiles.filter((i) => i < gate)
      expect(before, page).toEqual([])
      // And the page's own markup starts after it too: no heading drawn
      // over a book nobody has read yet.
      expect(gate, page).toBeLessThan(src.lastIndexOf('\n  return (\n'))
    }
  })
})
