import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The release walk of 2026-11-03, fault M3: one bill page read two figures
 * for what is left on PO-2026-NF9BK, "$433,910.00 left · 15% used" in the
 * check and "$427,640 left · 16% drawn" under Purchase order. The coding
 * route summed every invoice on the order, drafts included; the check
 * counted what draws on it (bills sent and typed-in invoice receipts) and
 * then this bill. One reader now, one figure, said once and named.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('what is left on an order is one figure on a bill’s page', () => {
  it('the money section reads what draws on the order through the one door, and adds this bill, as the check does', () => {
    const door = read('src/lib/money/left-after-this-bill.ts')
    expect(door).toContain("import { drawnOnOrder } from '@/lib/money/order-drawn'")
    expect(door).toMatch(/drawnOnOrder\(\{ id: order\.id, currency: ccy \}, \{ invoiceId: invoice\.id \}\)/)
    expect(door).toMatch(/invoicedCents: drawn\.cents \+ minorFromWhole\(invoice\.total, ccy\)/)
    // Both sides of one bill read it through that door, and neither sums the order itself.
    for (const route of ['src/app/api/invoices/[id]/coding/route.ts', 'src/app/api/invoices/[id]/own-bill/route.ts']) {
      const text = read(route)
      expect(text, route).toContain('await leftAfterThisBill(invoice)')
      expect(text, route).not.toMatch(/drawnOnOrder\(|poBalance\(|prisma\.invoice\.aggregate\(/)
    }
  })

  it('the figure is said once, as what is left after this bill, and the check’s panel does not repeat it', () => {
    expect(read('src/app/dashboard/invoices/invoice-money.tsx')).toContain('left after this bill')
    const page = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(page).not.toContain('left on the purchase order')
    expect(page).not.toContain('% used')
  })

  it('an order with a bill in another currency gives no figure and says why, because two currencies are never added', () => {
    expect(read('src/lib/money/left-after-this-bill.ts')).toContain('two currencies are never added')
    expect(read('src/app/dashboard/invoices/invoice-money.tsx')).toContain("'unreadable' in orderAndPayTo.purchaseOrderBalance")
  })
})
