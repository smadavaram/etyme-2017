import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  billStage, billStateWord, isSent, drawsOnOrder, notSentSays, BILL_NOT_SENT, DRAWS_NOTHING,
} from '@/lib/money/bill-state'

/**
 * Whether a bill was sent, said by one reader.
 *
 * The second Tapin walk (2026-10-31): Tapin raised its bill to Brightmoor
 * and could not send it. Today listed it under "Sent, not yet paid", and
 * Brightmoor's order showed $4,000 drawn for it. Three readers kept three
 * lists of which statuses count. Now they read `lib/money/bill-state`.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('a bill nobody was sent is drafted or raised, never sent', () => {
  it('a bill drafted by Ask Etyme reads "Drafted, not sent" to the firm that drafted it', () => {
    expect(billStateWord('DRAFT', 'SENDER')).toBe('Drafted, not sent')
    expect(isSent('DRAFT')).toBe(false)
  })

  it('a bill raised on the Bills page and not sent reads "Raised, not sent", never "Sent, not yet paid"', () => {
    expect(billStateWord('ISSUED', 'SENDER')).toBe('Raised, not sent')
    expect(isSent('ISSUED')).toBe(false)
    expect(billStage('ISSUED')).toBe('RAISED')
  })

  it('a bill sent to the firm that pays it reads "Sent, not yet paid" until money comes in', () => {
    expect(billStateWord('SUBMITTED', 'SENDER')).toBe('Sent, not yet paid')
    expect(isSent('SUBMITTED')).toBe(true)
  })

  it('a bill part paid, paid, on hold or disputed was sent', () => {
    for (const s of ['PARTIALLY_PAID', 'PAID', 'HELD', 'DISPUTED']) expect(isSent(s)).toBe(true)
  })

  it('a cancelled or void bill is neither sent nor drawing anything', () => {
    for (const s of ['CANCELLED', 'VOID']) {
      expect(isSent(s)).toBe(false)
      expect(drawsOnOrder(s)).toBe(false)
      expect(billStateWord(s)).toBe('Cancelled')
    }
  })

  it('the firm asked to pay reads a bill it was never sent as not submitted yet', () => {
    expect(billStateWord('ISSUED', 'PAYER')).toBe('Not submitted yet')
    expect(billStateWord('SUBMITTED', 'PAYER')).toBe('Submitted')
  })

  it('one sentence says which bill holds a week and that it was not sent', () => {
    expect(notSentSays({ number: 'IN-TAPIN-0001', status: 'ISSUED' })).toBe('Bill IN-TAPIN-0001 is raised, not sent.')
    expect(notSentSays({ number: 'IN-TAPIN-0002', status: 'DRAFT' })).toBe('Bill IN-TAPIN-0002 is drafted, not sent.')
  })
})

describe('an order is drawn by bills sent, and only those', () => {
  it('a raised bill nobody was sent draws nothing on its order, like a draft', () => {
    expect(drawsOnOrder('ISSUED')).toBe(false)
    expect(drawsOnOrder('DRAFT')).toBe(false)
    expect(drawsOnOrder('SUBMITTED')).toBe(true)
    expect([...DRAWS_NOTHING].sort()).toEqual(['CANCELLED', 'DRAFT', 'ISSUED', 'VOID'])
    expect([...BILL_NOT_SENT].sort()).toEqual(['DRAFT', 'ISSUED'])
  })

  it('the order’s ceiling counts bills sent only, in the one door both checks read (lib/money/order-drawn)', () => {
    expect(read('src/lib/money/order-drawn.ts')).toMatch(/status: \{ notIn: \[\.\.\.DRAWS_NOTHING\] \}/)
  })

  it('the three-way check counts what other bills drew on the order by the same rule', () => {
    expect(read('src/lib/invoice-match.ts')).toMatch(/workOrderId: \{ in: orderIds \}, status: \{ notIn: \[\.\.\.DRAWS_NOTHING\] \}/)
  })

  it('the orders page shows what was drawn by bills sent, and says what is on bills not sent apart', () => {
    const src = read('src/app/api/purchase-orders/route.ts')
    expect(src).toMatch(/\.filter\(\(i\) => drawsOnOrder\(i\.status\)\)/)
    expect(src).toMatch(/notSent: notSentCents \/ per/)
    // Whole currency by the order's own exponent, never a hard hundred: a dong order has none.
    expect(src).not.toMatch(/invoicedCents \/ 100|remainingCents \/ 100/)
  })

  it('a bill in another currency is never added to an order’s drawn figure', () => {
    expect(read('src/app/api/purchase-orders/route.ts')).toMatch(/\(i\.currency \?\? po\.currency\)\.toUpperCase\(\) === ccy/)
  })
})

describe('Today counts a week on a bill nobody was sent as not yet billed', () => {
  it('a week on a raised bill stays under "Signed, not yet billed" and names the bill holding it (lib/money/firm-today)', () => {
    const src = read('src/lib/money/firm-today.ts')
    expect(src).toMatch(/if \(ours\.some\(\(x\) => !BILL_NOT_SENT\.includes\(x\.invoice\.status\)\)\) continue/)
    expect(src).toMatch(/says: notSentSays\(inv\)/)
  })

  it('the Bills page draws every status word from the one reader', () => {
    const src = read('src/app/dashboard/invoices/page.tsx')
    expect(src).toMatch(/billStateWord\(row\.status, row\.direction === 'PAYABLE' \? 'PAYER' : 'SENDER'\)/)
    expect(src).not.toMatch(/label: 'Issued'/)
  })
})
