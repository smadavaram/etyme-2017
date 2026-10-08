/**
 * Sign-up walk, round four — money's five problems, as sentences.
 *
 *   5.  A refused money page drew "$0" above its refusal, and Contracts
 *       drew "ACTIVE 0 contracts" with no refusal at all.
 *   6.  An empty client Contracts page told a client about billing a
 *       customer. A client bills nobody.
 *   7.  Two refusals printed permission keys: "Requires invoices.read
 *       permission" and "needs invoices.read".
 *   9.  The orders page spoke only as a buyer, to a one-person firm and
 *       to a supplier.
 *   14. Rate history's eyebrow said "OPERATE" under Grow.
 *
 * docs/results/2026-10-08-signup-round-4.md.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { refusalOf, refusedRead } from '@/lib/money/refused-read'
import { contractsEmpty } from '@/lib/money/contracts-empty'
import { ordersStance, ordersWords } from '@/lib/money/po-words'
import { PERMISSIONS } from '@/lib/permissions'
import { domainOf } from '@/lib/domains'
import { sectionOfHref } from '@/lib/page-framing'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Comments quote old strings on purpose; only what ships is checked. */
function whatShips(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/['"`]\s*\+\s*['"`]/g, '')
}

function files(dir: string, test: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files(full, test, found)
    else if (test(entry)) found.push(full)
  }
  return found
}

const KEY = PERMISSIONS.map((p) => p.replace('.', '\\.')).join('|')
const SAYS_A_KEY = [
  new RegExp(`\\b(needs?|Requires|requires)\\s+(the\\s+)?(${KEY})\\b`),
  new RegExp(`\\b(${KEY})\\s+permission\\s+required\\b`),
  /\b(needs?|Requires|requires)\s+(the\s+)?\$\{[^}]+\}\s+permission/,
]

/** Every file money owns under a directory, as repo paths. */
function moneyFiles(under: string, test: (name: string) => boolean): string[] {
  return files(join(ROOT, under), test)
    .map((f) => relative(ROOT, f).split(sep).join('/'))
    .filter((f) => domainOf(f)?.key === 'MONEY')
}

// ── 5. A refused page draws the sentence and nothing else ──────────────

describe('a refused money page draws one sentence and no figure', () => {
  it('keeps what the route said when it refused, and nothing when it did not', () => {
    expect(refusalOf(403, { error: { message: 'Expenses are not part of your seat.' } })).toBe(
      'Expenses are not part of your seat.'
    )
    expect(refusalOf(403, null)).toBe('')
    expect(refusalOf(200, { data: {} })).toBeNull()
    // A failure to read is not a refusal: it stays an error the reader may retry.
    expect(refusalOf(500, { error: { message: 'boom' } })).toBeNull()
  })

  it('a refusal that names a permission key reaches the reader as the desk that does the work', () => {
    const says = refusedRead('Requires invoices.read permission', {
      what: 'Invoice receipts', kind: 'CLIENT', company: 'Northbend Athletic',
    })!
    expect(says).not.toContain('invoices.read')
    expect(says).toContain('Northbend Athletic')
    expect(says).toMatch(/^Invoice receipts is for the .+ desk at Northbend Athletic\./)
  })

  it('a refusal the route gave no words for still says whose seat it is and who to ask', () => {
    expect(refusedRead('', { what: 'Expenses', kind: 'CLIENT', company: 'Northbend Athletic' })).toBe(
      'Expenses is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.'
    )
  })

  it('a read that was not refused draws the page as it always did', () => {
    expect(refusedRead(null, { what: 'Contracts', kind: 'VENDOR', company: 'Brightmoor Staffing' })).toBeNull()
  })

  const PAGES = [
    'invoices', 'invoices/[id]', 'expenses', 'contracts', 'ar', 'ap', 'purchase-orders',
    'payroll', 'payroll/commissions', 'profitability', 'rate-history', 'loose-ends', 'reports',
  ]

  it.each(PAGES)('the %s page returns the refusal sentence alone, before any tile, tab or table is drawn', (page) => {
    const src = whatShips(read(`src/app/dashboard/${page}/page.tsx`))
    expect(src).toContain("from '@/lib/money/refused-read'")
    const guard = src.search(/const refused = refusedRead\(/)
    expect(guard, `${page} never asks whether its read was refused`).toBeGreaterThan(-1)
    const after = src.slice(guard)
    expect(after).toMatch(/if \(refused( && !loading)?\) \{?\s*return <p role="alert"[^>]*>\{refused\}<\/p>/)
  })

  it('invoice receipts, expenses and contracts no longer drop a refusal into the table as an empty book', () => {
    for (const page of ['invoices', 'expenses', 'contracts']) {
      const src = whatShips(read(`src/app/dashboard/${page}/page.tsx`))
      expect(src, page).toMatch(/const refused = refusalOf\(res\.status, body\)\s*if \(refused !== null\) \{\s*setRefusedSaid\(refused\)/)
    }
  })

  it('accounts receivable and payable say the desk in the one sentence, with no second panel underneath', () => {
    for (const page of ['ar', 'ap']) {
      const src = whatShips(read(`src/app/dashboard/${page}/page.tsx`))
      expect(src, page).not.toMatch(/\{denied && \(/)
      expect(src, page).toContain('setDenied(refusalOf(r.status, b))')
    }
  })
})

// ── 6. An empty Contracts page speaks to the reader it has ─────────────

describe('an empty Contracts page follows the reader’s kind', () => {
  it('tells a client where a contract comes from on its side, and never mentions billing a customer', () => {
    const empty = contractsEmpty({ kind: 'CLIENT', tab: 'sell', stateFilter: 'all', mayRecord: true })
    expect(empty.message).toBe('No contracts yet.')
    expect(empty.detail).toBe('A contract appears here when you award a job request to a supplier.')
    expect(`${empty.message} ${empty.detail}`).not.toMatch(/sell|bill a customer|Record a placement/)
  })

  it('a client filtering by state reads contracts, not sell lines', () => {
    expect(contractsEmpty({ kind: 'CLIENT', tab: 'sell', stateFilter: 'active', mayRecord: false }).message).toBe(
      'No active contracts.'
    )
  })

  it('a program office reading a client’s book from its seat reads the client’s words', () => {
    const empty = contractsEmpty({ kind: 'MSP', readingAClientsBook: true, tab: 'sell', stateFilter: 'all', mayRecord: true })
    expect(empty.message).toBe('No contracts yet.')
  })

  it('a supplier still reads its sell side as what it bills a customer from', () => {
    const empty = contractsEmpty({ kind: 'VENDOR', tab: 'sell', stateFilter: 'all', mayRecord: true })
    expect(empty.message).toBe('Nothing on the sell side yet.')
    expect(empty.detail).toContain('A sell line is what you bill a customer from.')
    expect(empty.detail).toContain('Record a placement')
  })

  it('a supplier’s buy side says what it pays from', () => {
    expect(contractsEmpty({ kind: 'GSI', tab: 'buy', stateFilter: 'all', mayRecord: false }).detail).toMatch(
      /^A buy line is what you pay from/
    )
  })

  it('the Contracts page takes its empty state from that one answer', () => {
    const src = whatShips(read('src/app/dashboard/contracts/page.tsx'))
    expect(src).toContain('emptyMessage={empty.message}')
    expect(src).toContain('emptyDetail={empty.detail}')
    expect(src).not.toContain('A sell line is what you bill a customer from')
  })
})

// ── 7. A refusal names the desk, never the key ─────────────────────────

describe('no money route or page hands somebody a permission key', () => {
  it('no money route says a key in a refusal — "Requires invoices.read permission" and "needs invoices.read" are gone', () => {
    const offenders = moneyFiles('src/app/api', (n) => n.endsWith('.ts'))
      .filter((f) => SAYS_A_KEY.some((r) => r.test(whatShips(read(f)))))
    expect(offenders).toEqual([])
  })

  it('no money page or money helper writes a key into a sentence', () => {
    const offenders = [
      ...moneyFiles('src/app/dashboard', (n) => n.endsWith('.tsx') || n.endsWith('.ts')),
      ...moneyFiles('src/lib/money', (n) => n.endsWith('.ts')),
    ].filter((f) => SAYS_A_KEY.some((r) => r.test(whatShips(read(f)))))
    expect(offenders).toEqual([])
  })

  it('the invoice book and the orders list refuse by naming the desk', () => {
    for (const f of ['src/app/api/invoices/route.ts', 'src/app/api/purchase-orders/route.ts']) {
      const src = whatShips(read(f))
      expect(src, f).toMatch(/askTheDesk\(\{ doing: '(Reading the invoice book|Seeing purchase orders)', needs: 'invoices\.read'/)
    }
  })
})

// ── 9. The orders page speaks from the reader's end ────────────────────

describe('the orders page speaks from the end of the order the reader stands at', () => {
  it('a client reads its purchase orders: what a supplier may invoice you', () => {
    const w = ordersWords(ordersStance({ kind: 'CLIENT', sides: [] }))
    expect(w.title).toBe('What you have authorized')
    expect(w.subtitle).toContain('what a supplier may invoice you in total')
    expect(w.empty).toMatch(/^No purchase orders\./)
  })

  it('a supplier with only received orders reads its sales orders: what your customer agreed you may bill', () => {
    const w = ordersWords(ordersStance({ kind: 'VENDOR', sides: ['SELLER', 'SELLER'] }))
    expect(w.subtitle).toMatch(/^Your sales orders\./)
    expect(w.subtitle).toContain('what your customer agreed you may bill in total')
    expect(`${w.title} ${w.subtitle} ${w.empty}`).not.toMatch(/supplier|authorized|purchase order/)
  })

  it('a one-person firm reads her own sales orders, with no supplier anywhere in the words', () => {
    for (const sides of [[], ['SELLER']] as const) {
      const w = ordersWords(ordersStance({ kind: 'CONSULTANT_CORP', sides }))
      expect(w.subtitle).toMatch(/^Your own sales orders/)
      expect(w.subtitle).toContain('Each line is you')
      expect(`${w.title} ${w.subtitle} ${w.empty}`).not.toMatch(/supplier|authorized|accounts-payable|purchase order/)
    }
  })

  it('a prime that buys from a sub-vendor and sells to the client reads both kinds on one list', () => {
    const w = ordersWords(ordersStance({ kind: 'VENDOR', sides: ['BUYER', 'SELLER'] }))
    expect(w.subtitle).toContain('A sales order is what your customer agreed you may bill')
    expect(w.subtitle).toContain('a purchase order is what you have authorized a supplier to invoice you')
  })

  it('a supplier with no orders yet is not spoken to as a buyer alone', () => {
    expect(ordersStance({ kind: 'VENDOR', sides: [] })).toBe('BOTH')
    expect(ordersStance({ kind: 'GSI', sides: [] })).toBe('BOTH')
  })

  it('a program office reading a client’s orders from its seat reads them as the buyer', () => {
    expect(ordersStance({ kind: 'MSP', sides: ['BUYER'], inASeat: true })).toBe('BUYER')
    expect(ordersStance({ kind: 'MSP', sides: [], inASeat: true })).toBe('BUYER')
  })

  it('the orders page draws its heading, subtitle and empty line from those words, never typed in', () => {
    const src = whatShips(read('src/app/dashboard/purchase-orders/page.tsx'))
    expect(src).toContain('<h1>{words.title}</h1>')
    expect(src).toContain('<p>{words.subtitle}</p>')
    expect(src).toContain('{words.empty}')
    expect(src).not.toContain('What you have authorized')
    expect(src).not.toContain('invoice you in total')
  })
})

// ── 14. Rate history sits under Grow ───────────────────────────────────

describe('rate history’s eyebrow is the section it sits under on the reader’s own menu', () => {
  it('the menu files rate history under Grow for every firm that has it', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP']) {
      expect(sectionOfHref(kind as any, '/dashboard/rate-history', null), kind).toBe('Grow')
    }
  })

  it('the page reads its eyebrow from the menu and draws nothing while the reader is not known', () => {
    const src = whatShips(read('src/app/dashboard/rate-history/page.tsx'))
    expect(src).toContain("usePageSection('/dashboard/rate-history')")
    expect(src).toContain('{eyebrow && <p className="eyebrow">{eyebrow}</p>}')
    expect(src).not.toMatch(/<p className="eyebrow">Operate<\/p>/)
  })
})
