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
    expect(src).toMatch(/company && sectionOfHref\(company\.kind, '\/dashboard\/ar'/)
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
})
