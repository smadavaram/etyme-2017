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
    // Through the one ledger every money view reads (lib/money/order-ledger,
    // the founder's scale audit, 2026-11-08): sent bills draw, drafts are said apart.
    const src = read('src/app/api/purchase-orders/route.ts')
    expect(src).toMatch(/orderLedgers\(/)
    expect(src).toMatch(/notSent: ledger\.draftedNotSentMinor \/ per/)
    expect(read('src/lib/money/order-ledger.ts')).toMatch(/billCountsAsBilled\(b\.status\)/)
    // Whole currency by the order's own exponent, never a hard hundred: a dong order has none.
    expect(src).not.toMatch(/invoicedCents \/ 100|remainingCents \/ 100/)
  })

  it('a bill in another currency is never added to an order’s drawn figure', () => {
    expect(read('src/lib/money/order-ledger.ts')).toMatch(/\(b\.currency \?\? ccy\)\.toUpperCase\(\) !== ccy\) \{ foreign\.push/)
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

describe('accounts receivable owes, ages and chases only what was sent (coordinator, 2026-11-02)', () => {
  it('the receivable book holds bills sent only: a bill drafted, raised and not sent, cancelled or void is owed by nobody', () => {
    const book = read('src/app/api/ar/book.ts')
    expect(book).toMatch(/export const NOT_RECEIVABLE: readonly string\[\] = DRAWS_NOTHING/)
    expect(book).toMatch(/status: \{ notIn: \[\.\.\.NOT_RECEIVABLE\] \}/)
  })

  it('ageing and the dunning ladder read that one book, so a bill never sent is never aged and never chased', () => {
    expect(read('src/app/api/ar/dunning/route.ts')).toMatch(/loadBook\(companyId, now\)/)
    expect(read('src/app/api/ar/collections/route.ts')).toMatch(/loadBook\(companyId, now\)/)
  })

  it('a bill raised and not sent is listed apart as to send, with its own word, its customer and its amount in its own currency', () => {
    const book = read('src/app/api/ar/book.ts')
    const toSend = book.slice(book.indexOf('export async function loadToSend'))
    expect(toSend).toMatch(/status: \{ in: \[\.\.\.BILL_NOT_SENT\] \}/)
    expect(toSend).toMatch(/word: billStateWord\(r\.status, 'SENDER'\)/)
    expect(toSend).toMatch(/totalMinor: fromPrismaDecimal\(r\.total, r\.currency\)\.minor/)
    expect(read('src/app/api/ar/route.ts')).toMatch(/const toSend = \(await loadToSend\(companyId\)\)/)
    expect(read('src/app/dashboard/ar/page.tsx')).toMatch(/<Lbl>To send<\/Lbl>/)
  })

  it('a paid bill that is no longer paid in full is owed again, part paid or sent, never put back to raised and not sent', () => {
    const pay = read('src/app/api/ar/payments/route.ts')
    expect(pay).toMatch(/inv\.status === 'PAID' \? \(paid > 0 \? 'PARTIALLY_PAID' : 'SUBMITTED'\)/)
    expect(pay).not.toMatch(/inv\.status === 'PAID' \? 'ISSUED'/)
  })
})
