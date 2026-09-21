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
