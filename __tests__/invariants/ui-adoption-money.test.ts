/**
 * The money pages draw their states, heads, figures and filters through
 * the shared layer in `@/components/ui` (matrix row L3.1.5.3), so a
 * refusal, a page still loading, an empty book, a figure and a row of
 * filters read the same on Accounts receivable as on Contracts.
 *
 * The founder's brief of 2026-10-09: every state drawn by one
 * primitive, tabular figures, consistent heads. What each page decides
 * is unchanged — the company guard, the first-read guard, the refusal
 * sentence, the narrowed reader's sentence — and these sentences check
 * only who draws it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Comments quote old markup on purpose; only what ships is checked. */
function whatShips(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const PAGES: [string, string][] = [
  ['reports', 'Reports'],
  ['rate-history', 'Rate history'],
  ['purchase-orders', 'Orders'],
  ['profitability', 'Profitability'],
  ['payroll', 'Payroll'],
  ['payroll/commissions', 'Commissions'],
  ['loose-ends', 'Missing paperwork'],
  ['invoices', 'Bills and invoice receipts'],
  ['invoices/[id]', 'One bill'],
  ['expenses', 'Expenses'],
  ['contracts', 'Contracts'],
  ['ar', 'Accounts receivable'],
  ['ap', 'Accounts payable'],
]

const page = (p: string) => whatShips(read(`src/app/dashboard/${p}/page.tsx`))

describe('the money pages draw their states through the shared primitives', () => {
  it.each(PAGES)('the %s page draws its states through the shared primitives', (path) => {
    const src = page(path)
    expect(src, path).toMatch(/from '@\/components\/ui'/)
    // Refused: the route's sentence alone, through RefusedState.
    expect(src, path).toContain('<RefusedState says={refused} />')
    expect(src, path).not.toMatch(/<p role="alert"[^>]*>\{refused\}<\/p>/)
    // Not at a company yet: the shared loading line; at no company: one sentence.
    expect(src, path).toMatch(/\? <LoadingState \/> : <RefusedState says="These are a company’s books, and you are not signed in at a company\." \/>/)
    // No hand-rolled "Loading…" paragraph anywhere on the page.
    expect(src, path).not.toMatch(/>\s*Loading…\s*</)
    expect(src, path).not.toMatch(/\{error \?\? 'Loading…'\}/)
  })

  it.each(PAGES.filter(([p]) => p !== 'invoices/[id]'))('the %s page is headed by the shared page head', (path) => {
    const src = page(path)
    expect(src, path).toContain('<PageHead')
    expect(src, path).not.toContain('className="page-head')
    expect(src, path).not.toMatch(/<h1[ >]/)
  })

  it('one bill is headed by the detail head: the way back to its list, its number, and the eyebrow from the reader’s own menu', () => {
    const src = page('invoices/[id]')
    expect(src).toContain('<DetailHead')
    expect(src).toContain('from="/dashboard/invoices"')
    expect(src).toContain("href: booksHref('/dashboard/invoices', books)")
    expect(src).toContain('title={inv.number}')
    expect(src).not.toMatch(/<h1[ >]/)
  })

  it('no money page defines its own Stat, Panel, Chip or label — Orders and one bill use the shared ones', () => {
    for (const [path] of PAGES) {
      expect(page(path), path).not.toMatch(/^function (Stat|Panel|Chip|Lbl)\b/m)
    }
    expect(page('purchase-orders')).toMatch(/import \{[^}]*\bChip\b[^}]*\bLbl\b[^}]*\} from '@\/components\/ui'/)
    expect(page('invoices/[id]')).toMatch(/import \{[^}]*\bChip\b[^}]*\bLbl\b[^}]*\} from '@\/components\/ui'/)
  })

  it('no money page hand-rolls a row of filter tabs; every one is the shared row of filter chips', () => {
    for (const [path] of PAGES) {
      expect(page(path), path).not.toContain('filter-tab')
    }
    for (const path of ['rate-history', 'profitability', 'payroll', 'invoices', 'expenses', 'contracts', 'ar', 'ap']) {
      expect(page(path), path).toContain('<FilterChips')
    }
  })

  it('the contracts page keeps its Sell and Buy choice, drawn as filter chips and still hidden from a client and until the company loads', () => {
    const src = page('contracts')
    const wrapper = src.indexOf("!company || isClient ? 'hidden' : ''")
    expect(wrapper).toBeGreaterThan(-1)
    const chips = src.indexOf('<FilterChips<ViewTab>', wrapper)
    expect(chips).toBeGreaterThan(wrapper)
    expect(src.slice(chips, chips + 400)).toContain("{ key: 'sell', label: 'Sell' }, { key: 'buy', label: 'Buy' }")
  })

  it('a money page’s headline figures are shared stats, and a figure nobody can stand behind is passed as no figure, never a zero', () => {
    for (const path of ['reports', 'rate-history', 'profitability', 'payroll', 'invoices', 'expenses', 'contracts', 'ar', 'ap', 'loose-ends']) {
      expect(page(path), path).toContain('<Stat')
    }
    // The unpriced book on Reports and Profitability, and the bill rates a seat may not read on Contracts.
    expect(page('reports')).toContain('value={avgMargin != null ? fmtPercent(avgMargin) : null}')
    expect(page('profitability')).toContain('value={data.agreed.pct == null ? null : `${data.agreed.pct}%`}')
    expect(page('contracts')).toContain('<Stat label="Active bill rates" value={null} sub={activeTotals.refusedBecause} />')
  })

  it('an empty book is drawn by the shared empty state, and a narrowed reader still reads the sentence about their own lines', () => {
    for (const path of ['reports', 'profitability', 'payroll/commissions', 'loose-ends', 'purchase-orders', 'contracts', 'ar']) {
      expect(page(path), path).toContain('<EmptyState')
    }
    expect(page('reports')).toContain('<EmptyState says={data.narrowed.says} />')
    expect(page('contracts')).toContain('<EmptyState says={ownContractsSay(contracts.length)} />')
    expect(page('purchase-orders')).toContain('<EmptyState says={words.empty} />')
  })

  it('a read that broke rather than refused is drawn by the shared error state, and Reports and one bill offer to try again', () => {
    for (const path of ['reports', 'profitability', 'payroll/commissions', 'loose-ends', 'purchase-orders', 'invoices/[id]', 'ar', 'ap']) {
      expect(page(path), path).toContain('<ErrorState')
    }
    expect(page('reports')).toContain("action={{ label: 'Try again', onClick: fetchAll }}")
    expect(page('invoices/[id]')).toContain("action={{ label: 'Try again', onClick: load }}")
  })

  it('no money page draws a search box of its own over a list; the list’s own search is the one box', () => {
    for (const [path] of PAGES) {
      expect(page(path), path).not.toContain('type="search"')
    }
  })
})
