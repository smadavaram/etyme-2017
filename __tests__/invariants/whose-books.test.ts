/**
 * Whose books a money screen is showing survives a refresh, and a link
 * says which.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * The release walk of 2026-09-21, sitting in the seat Cavanaugh
 * Glassworks granted Aptiva Workforce: "Read our own books instead"
 * worked, and the choice lived nowhere but React state. `?books=own`
 * typed into the address bar did nothing on load, a refresh put the
 * reader back on the client's book without saying so, and nobody could
 * send a colleague a link to what they were reading.
 *
 * Every other "choose a view" in the product survives a reload — the
 * feed against the table, the sell side against the buy side. It
 * matters more here than on a feed, because these are two different
 * companies' money and a reader who refreshes without noticing which
 * book came back is a reader about to quote one firm's total as
 * another's.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  booksFrom, booksHref, otherBooks, switchLabel, BOOKS_PARAM, OWN,
} from '@/lib/money/books-view'

const PAGES = {
  Invoices: 'src/app/dashboard/invoices/page.tsx',
  'Purchase orders': 'src/app/dashboard/purchase-orders/page.tsx',
  'Accounts payable': 'src/app/dashboard/ap/page.tsx',
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a reader can be linked to the book they are reading', () => {

  it('opens on the seat it was granted when the address says nothing', () => {
    expect(booksFrom(null)).toBe('seat')
    expect(booksFrom(undefined)).toBe('seat')
    expect(booksFrom('')).toBe('seat')
  })

  it('opens on our own book when the address says so', () => {
    expect(booksFrom(OWN)).toBe('own')
  })

  it('treats anything it does not recognize as the seat, never as our own', () => {
    // A typo must not quietly change which company's money is on screen.
    for (const junk of ['ours', 'OWN', 'own ', 'seat', '1', 'true']) {
      expect(booksFrom(junk)).toBe('seat')
    }
  })

  it('spells the seat\'s book as a clean address and our own as a parameter', () => {
    expect(booksHref('/dashboard/invoices', 'seat')).toBe('/dashboard/invoices')
    expect(booksHref('/dashboard/invoices', 'own')).toBe('/dashboard/invoices?books=own')
  })

  it('reads back exactly what it wrote, on every page and both ways', () => {
    for (const path of Object.values(PAGES)) {
      for (const books of ['seat', 'own'] as const) {
        const href = booksHref(path, books)
        const value = href.includes('?') ? href.split('?')[1].split('=')[1] : null
        expect(booksFrom(value)).toBe(books)
      }
    }
  })

  it('switches to the other one, and back', () => {
    expect(otherBooks('seat')).toBe('own')
    expect(otherBooks('own')).toBe('seat')
    expect(otherBooks(otherBooks('own'))).toBe('own')
  })

  it('labels the switch with what the reader will get, not where they are', () => {
    expect(switchLabel('seat', 'books')).toBe('Read our own books instead')
    expect(switchLabel('seat', 'orders')).toBe('Read our own orders instead')
    expect(switchLabel('own', 'books')).toBe('Read the program you run')
  })

  it('never puts the parameter into a sentence a person reads', () => {
    // The banner says whose book it is in words. The address is the
    // machine's half of the same fact and belongs nowhere near prose.
    for (const noun of ['books', 'orders', 'payables']) {
      for (const books of ['seat', 'own'] as const) {
        // "books" is a word a person says; `books=own` is not.
        expect(switchLabel(books, noun)).not.toContain(`${BOOKS_PARAM}=${OWN}`)
        expect(switchLabel(books, noun)).not.toContain('=')
        expect(switchLabel(books, noun)).not.toContain('?')
      }
    }
  })
})

describe('the three money pages that carry the switch all keep it in the URL', () => {

  for (const [name, path] of Object.entries(PAGES)) {
    it(`${name} reads whose book it is out of the address, not out of React state`, () => {
      const src = read(path)
      expect(src, `${name} does not read the parameter`).toContain('booksFrom(searchParams.get(BOOKS_PARAM))')
      expect(src, `${name} still keeps the choice in useState`).not.toContain('useState(false)\n\n  // Whose')
      expect(src).not.toMatch(/setOwnBooks/)
    })

    it(`${name} writes the choice back into the address when somebody switches`, () => {
      const src = read(path)
      expect(src).toContain('router.replace(booksHref(')
    })

    it(`${name} asks the API for the same book the address names`, () => {
      const src = read(path)
      // Either through the helper, or through the one spelling of the
      // parameter. Never a third literal.
      expect(src).toMatch(/booksHref\('\/api\/|params\.set\(BOOKS_PARAM, OWN\)/)
      expect(src, `${name} spells the parameter by hand`).not.toMatch(/'\?books=own'|"\?books=own"/)
    })
  }
})

/**
 * The words over the rows come from the block that decided the rows.
 *
 * `pageFraming` learned a third argument at 64588942: hand it the
 * `reading` block a money route already returns and it frames the page
 * in the client's words, with a clause naming whose book it is. Three
 * money pages were still framing themselves off their own company kind
 * while the rows under them were somebody else's — a program office at
 * Cavanaugh Glassworks' desk read "Sell · What you bill clients" over
 * seven buy-side lines at a firm that bills nobody.
 *
 * Two of the three pages had the answer and discarded it; the third had
 * no answer to discard, because `GET /api/expenses` resolved no seat at
 * all.
 */
describe('a money page is framed by the same block that chose its rows', () => {
  const MONEY_PAGES = {
    Invoices: 'src/app/dashboard/invoices/page.tsx',
    Contracts: 'src/app/dashboard/contracts/page.tsx',
    Expenses: 'src/app/dashboard/expenses/page.tsx',
  }

  for (const [name, path] of Object.entries(MONEY_PAGES)) {
    it(`${name} hands the framing whose book it is, instead of only which kind of firm is reading`, () => {
      const src = read(path)
      expect(src, `${name} still frames off the company kind alone`)
        .toMatch(/pageFraming\([\s\S]{0,120}reading\s*\n?\s*\)/)
    })

    it(`${name} keeps whose book it is in state, so the heading cannot disagree with the table`, () => {
      const src = read(path)
      expect(src).toContain('setReading(body.data?.reading ?? null)')
    })

    it(`${name} declares the framing after the state it reads, or the page throws on load`, () => {
      // A `const` read above its own declaration is a temporal dead
      // zone throw, not a stale value — the page would not render at
      // all. Cheap to get wrong, and invisible until somebody opens it.
      const src = read(path)
      const state = src.indexOf('const [reading, setReading]')
      const framing = src.indexOf('pageFraming(')
      expect(state, `${name} holds no reading state`).toBeGreaterThan(-1)
      expect(framing, `${name} never frames itself`).toBeGreaterThan(-1)
      expect(framing, `${name} frames itself above the state it reads`).toBeGreaterThan(state)
    })
  }

  it('the expense book follows the seat for reads, the way every other money page does', () => {
    const route = read('src/app/api/expenses/route.ts')
    expect(route, 'GET /api/expenses resolves no seat').toContain('booksFor(caller, request)')
    expect(route, 'and never says whose book it answered with')
      .toContain('reading: reading')
  })

  it('raising an expense still writes to the reader\'s own book, not the client\'s', () => {
    // Reads follow the seat. Writing does not, and the picker on the
    // screen asks for the same book the POST accepts — so a control and
    // its route still agree even while the rows beside them are
    // somebody else's.
    const route = read('src/app/api/expenses/route.ts')
    expect(route).toContain('companyId: caller.company?.id')
    const page = read('src/app/dashboard/expenses/page.tsx')
    expect(page).toContain('books=own')
  })

  it('offers no "+" where the framing says this reader raises nothing here', () => {
    // A client does not generate its suppliers' invoices and does not
    // raise their expenses; neither does somebody reading a client's
    // book from a seat. `create` is null in both cases, and a control
    // the route would refuse is a control that lies.
    expect(read(MONEY_PAGES.Invoices)).toContain('{framing.create && (')
    expect(read(MONEY_PAGES.Expenses)).toContain('{framing.create && (')
  })

  it('labels every "+" with the reader\'s own word for the act', () => {
    for (const path of Object.values(MONEY_PAGES)) {
      expect(read(path), `${path} still hard-codes the label`).toContain('+ {framing.create}')
    }
  })
})
