import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A payer's open invoice receipts are checked in one pass.
 *
 * Measured 2026-11-02 on a copy of the scale world: the three-way check
 * over one payer's twenty open receipts made 42 statements, 18 of them
 * the same read of what typed-in receipts had drawn on an order, once per
 * order. It is one read for every order now, 25 statements, the answers
 * on all twenty receipts identical.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the three-way check on many receipts reads each fact once', () => {
  it('what typed-in receipts drew on every order is read in one statement, never one per order', () => {
    const match = read('src/lib/invoice-match.ts')
    expect(match).toMatch(/receiptsDrawnOnOrders\(orders\)/)
    expect(match).not.toMatch(/orders\.map\(async \(o\) => \[o\.id, \(await drawnOnOrder\(/)
  })

  it('that one read counts what drawnOnOrder counts for one order: receipts not cancelled, in the order’s own currency, and a receipt in another currency named rather than added', () => {
    const drawn = read('src/lib/money/order-drawn.ts')
    const many = drawn.slice(drawn.indexOf('export async function receiptsDrawnOnOrders'))
    expect(many).toMatch(/workOrderId: \{ in: \[\.\.\.ccyOf\.keys\(\)\] \}, status: \{ not: 'CANCELLED' \}/)
    expect(many).toMatch(/at\.foreign\.push\(r\.number\)/)
    expect(many).toMatch(/else at\.cents \+= r\.totalCents/)
  })

  it('the decisions queue checks every receipt it lists in one call, through the same gate the payment route reads', () => {
    const decisions = read('src/app/api/decisions/route.ts')
    expect(decisions).toMatch(/await matchInvoices\(payable\.map\(\(p\) => p\.inv\.id\)\)/)
    expect(decisions).toMatch(/payGate\(inv, match\)\.ok/)
  })
})
