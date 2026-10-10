import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A write lands in the book the screen was reading. Three write routes
 * read a client's book through a program office's seat and wrote to the
 * office's own, under the office's own role (architect, 2026-10-06).
 * The walk is `__integration__/the-seat-writes-the-clients-book.test.ts`;
 * these hold the doors.
 */

const ROOT = join(__dirname, '..', '..', 'src')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const ORDERS = read('app/api/purchase-orders/route.ts')
const EXPENSES = read('app/api/expenses/route.ts')
const ACTIONS = read('app/api/expenses/actions/route.ts')
const SEATED = read('lib/money/seated-books.ts')

/** The body of one exported handler, up to the next one. */
function handler(src: string, verb: string): string {
  const start = src.indexOf(`export async function ${verb}(`)
  const next = src.indexOf('export async function', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('a write from a seat is judged by the seat and lands in the seat’s book', () => {
  it('raising a purchase order asks the acting desk, and the order is the desk’s company’s', () => {
    const post = handler(ORDERS, 'POST')
    expect(post).toContain('writingDesk(caller, request)')
    expect(post).toContain('hasPermission(desk.permissions')
    expect(post).toContain('const companyId = desk.companyId')
    expect(post).not.toContain('hasPermission(caller.permissions')
  })

  it('changing a purchase order asks the acting desk, and finds only the desk’s company’s orders', () => {
    const patch = handler(ORDERS, 'PATCH')
    expect(patch).toContain('writingDesk(caller, request)')
    expect(patch).toContain('issuedById: desk.companyId')
    expect(patch).not.toContain('hasPermission(caller.permissions')
  })

  it('raising an expense asks the acting desk, and the expense is the desk’s company’s', () => {
    const post = handler(EXPENSES, 'POST')
    expect(post).toContain('writingDesk(caller, request)')
    expect(post).toContain('companyId: desk.companyId')
    expect(post).not.toContain('hasPermission(caller.permissions')
  })

  it('submitting, approving or rejecting an expense acts only on the acting desk’s book', () => {
    expect(ACTIONS).toContain('writingDesk(caller, request)')
    expect(ACTIONS).toContain('companyId: desk.companyId')
    expect(ACTIONS).not.toContain('hasPermission(caller.permissions')
  })

  it('a screen reading the office’s own books writes to them, by the same word the reads use', () => {
    expect(SEATED).toMatch(/export async function writingDesk/)
    expect(SEATED).toContain("=== 'own'")
    expect(SEATED).toContain('return actingDesk(caller)')
  })

  it('the purchase-order screen raises into the book it is showing', () => {
    expect(read('app/dashboard/purchase-orders/page.tsx')).toContain("fetch(booksHref('/api/purchase-orders', books), {")
  })

  it('an order is checked against the buyer’s own suppliers, the same list the picker offers', () => {
    const post = handler(ORDERS, 'POST')
    expect(post).toContain('sellerStanding: supplierStanding(await suppliersOf(issuedById), issuedToId)')
  })

  it('the purchase-order picker offers the buyer’s suppliers from the book the order is written on', () => {
    expect(read('app/dashboard/purchase-orders/page.tsx')).toContain("fetch(booksHref('/api/companies/suppliers', books))")
  })

  it('the expense form, which picks from the office’s own contracts, raises onto the office’s own book', () => {
    expect(read('app/dashboard/expenses/page.tsx')).toContain("fetch('/api/expenses?books=own', {")
  })
})
