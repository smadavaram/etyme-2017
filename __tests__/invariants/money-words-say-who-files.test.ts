/**
 * Area E of the 2026-11-14 fix list, the words half: the act that makes
 * a bill has one name, a firm reads "bill" for what it issues and
 * "invoice receipt" for what it receives, and every sentence about a
 * week says who files it before it says who approves or accepts it.
 *
 * CLAUDE.md, "Money": only the worker files hours; the employer may
 * accept before the client approves (founder, 2026-11-14). No sentence
 * here may claim an order between the two.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pageFraming } from '@/lib/page-framing'
import { RAISE_A_BILL } from '@/lib/money/nothing-to-bill'
import { varianceSays, spendSays, itemsAskSays, RECEIPT_APPROVE, type VarianceRow, type SpendRow, type WaitingItem } from '@/app/api/conversations/twin/ask'

const OWNER = { permissions: ['*'] as string[] }
const SUPPLIER_SIDE = ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the act that makes a bill has one name', () => {
  it('the Bills button reads Raise a bill, the same words as the bill dialog, for every firm that bills', () => {
    for (const kind of SUPPLIER_SIDE) {
      expect(pageFraming(kind, 'invoices', null, OWNER).create, kind).toBe(RAISE_A_BILL)
    }
    expect(RAISE_A_BILL).toBe('Raise a bill')
  })

  it('the word Generate is not on the Bills button for any firm', () => {
    for (const kind of [...SUPPLIER_SIDE, 'CLIENT'] as const) {
      expect(pageFraming(kind, 'invoices', null, OWNER).create ?? '', kind).not.toMatch(/generate/i)
    }
  })

  it('the page framing keeps no second copy of the act’s name', () => {
    expect(src('src/lib/page-framing.ts')).not.toMatch(/create:\s*'(Generate|Raise a bill)'/)
  })
})

describe('the Timesheets line says who files before who approves', () => {
  it('a supplier’s Timesheets line says each person files her own week, then names the client’s approval and the payer’s acceptance', () => {
    const says = pageFraming('VENDOR', 'timesheets', null, OWNER).subtitle
    expect(says).toMatch(/^Each person files her own week of hours\./)
    expect(says.indexOf('files')).toBeLessThan(says.indexOf('approves'))
    expect(says).toContain('the firm that pays her accepts it')
  })

  it('the Timesheets line never tells a firm it approves the hours, and never claims the client signs first', () => {
    for (const kind of SUPPLIER_SIDE) {
      const says = pageFraming(kind, 'timesheets', null, OWNER).subtitle
      expect(says, kind).not.toMatch(/approve them|bill them|once the client|then .* accepts/i)
    }
  })

  it('a worker who asks Etyme to approve her week is told she files it, and no order is claimed between approval and acceptance', async () => {
    const worker = src('src/app/api/conversations/twin/worker.ts')
    const sign = worker.slice(worker.indexOf("case 'SIGN_WEEK'"), worker.indexOf("case 'EXTEND'"))
    expect(sign).toContain('Etyme never signs a week. You file it, ${signer} approves it, and ${accepter} accepts it.')
    expect(sign).toContain('Etyme never signs a week. You file it, ${signer} approves it, and each firm above you accepts it.')
    expect(sign).not.toMatch(/signs it, then/)
  })
})

describe('what a firm receives from a supplier reads invoice receipt', () => {
  const row = (supplier: string, receipts: number, mismatch: number): VarianceRow => ({
    supplier, receipts, clean: receipts - mismatch, mismatch, held: 0, hoursBilled: 80, hoursAccepted: 80, hoursOverAccepted: 0,
  } as VarianceRow)

  it('the mismatch answer counts invoice receipts, never bare invoices', () => {
    const says = varianceSays([row('Northwind Staffing', 2, 1), row('Harborline Tech', 1, 0)], 'Q4 2026')
    expect(says).toContain('Pay none of the invoice receipts that do not match until their suppliers correct them.')
    expect(says).toContain('Three invoice receipts from two suppliers were received in Q4 2026.')
    expect(says).toContain('One invoice receipt does not match.')
    expect(says).not.toMatch(/\binvoices?\b(?! receipt| date)/)
  })

  it('the spend answer counts invoice receipts, and says which have no invoice date', () => {
    const rows: SpendRow[] = [
      { supplier: 'Northwind Staffing', currency: 'USD', receipts: 2, billedMinor: 200000, paidMinor: 0, receiptLinks: [] },
    ]
    const says = spendSays(rows, 'Oct 2026', 1, (m) => `$${(m / 100).toFixed(2)}`)
    expect(says).toContain('on 2 invoice receipts.')
    expect(says).toContain('One invoice receipt has no invoice date, so no month counts it.')
  })

  it('two invoice receipts to approve are called invoice receipts, as two to pay already are', () => {
    const item = (n: number): WaitingItem => ({
      n, approvalId: `a${n}`, entryId: `e${n}`, says: 'Approve an invoice receipt.', title: `NW-00${n} from Northwind Staffing`,
      ruleCited: 'Three-way check', rationale: 'Hours and rate match.', href: `/dashboard/invoices/i${n}`, action: RECEIPT_APPROVE,
    })
    expect(itemsAskSays([item(1), item(2)])?.says).toBe('Approve the two invoice receipts below; each matches the approved hours and the contract rate.')
  })

  it('the mismatch table, its footnote and a thread’s topic say invoice receipt', () => {
    const tsx = src('src/app/dashboard/conversations/ask-etyme.tsx')
    expect(tsx).toContain('caption="Invoice receipts that do not match, by supplier"')
    expect(tsx).toContain('they hold the invoice receipt until the timesheet is approved.')
    expect(src('src/app/dashboard/conversations/page.tsx')).toContain("INVOICE:     'a bill or an invoice receipt',")
  })

  it('a client told what stays after a worker’s erasure reads invoice receipts, not invoices', () => {
    const letter = src('src/lib/notify/data-rights.ts')
    expect(letter).toContain('Your contracts and invoice receipts keep their amounts.')
    expect(letter).not.toContain('Your contracts and invoices keep')
  })
})
