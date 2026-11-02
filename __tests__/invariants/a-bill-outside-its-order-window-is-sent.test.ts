import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { threeWayMatch, orderWindowSays, type MatchInput } from '@/lib/three-way-match'

/**
 * A bill whose work runs outside its order's window is sent, with the
 * window said beside it.
 *
 * ── The second Tapin walk, 2026-10-31 ────────────────────────────────
 *
 * Tapin, a sub-vendor, employs Ravi and bills Brightmoor Staffing, the
 * prime. Brightmoor raised its order to Tapin by hand from Oct 30; the
 * award put Ravi's line, starting Oct 19, on that order. Tapin's bill
 * failed "Work starts Oct 19, before PO opens on Oct 30". Only Brightmoor
 * could waive it, and Brightmoor could not see a bill that was never
 * sent, nor move its own order's dates. The week was signed at $5,200
 * and accepted at $4,000 at each rung, and nobody could bill it.
 *
 * Ratified 2026-09-19: "Four of the six fields are the header's; the two
 * dates are the line's … A line outside its order's window is a sentence
 * on the screen, not a correction." So the firm sending the bill reads
 * the window as a sentence. The firm paying still reads it as a check on
 * its own order, which it may waive with a reason or answer by moving
 * the dates. Every other refusal stands.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Tapin's bill to Brightmoor: Ravi's week of Oct 19, 40 hours accepted at $100, on an order opening Oct 30. */
function tapinsBill(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    invoice: {
      id: 'inv-tapin', totalCents: 400_000,
      periodStart: new Date('2026-10-18T00:00:00Z'), periodEnd: new Date('2026-10-24T00:00:00Z'),
    },
    lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Ravi Kumar', hours: 40, rateCents: 10_000, amountCents: 400_000 }],
    timesheets: {
      ts1: {
        id: 'ts1', status: 'APPROVED', approvedHours: 40, contractRateCents: 10_000,
        periodStart: new Date('2026-10-19T00:00:00Z'), periodEnd: new Date('2026-10-23T00:00:00Z'),
      },
    },
    po: {
      id: 'po-bm', number: 'PO-BM-0007', status: 'OPEN',
      amountCents: 10_000_000, consumedCents: 0,
      startDate: new Date('2026-10-30T00:00:00Z'), endDate: new Date('2027-10-30T00:00:00Z'),
    },
    poRequired: true,
    ...overrides,
  }
}

const check = (r: ReturnType<typeof threeWayMatch>, code: string) => r.checks.find((c) => c.code === code)

describe('the firm sending a bill reads its order’s window as a sentence, never a refusal', () => {
  it('Tapin’s bill for Ravi’s week of Oct 19 passes the check on an order that opens Oct 30, read as the firm sending it', () => {
    const r = threeWayMatch(tapinsBill({ orderWindow: 'SAY' }))
    expect(r.matched).toBe(true)
    expect(check(r, 'PO_STATUS')?.outcome).toBe('PASS')
  })

  it('the window is said beside the bill in a sentence that names the dates and says the bill still goes', () => {
    const r = threeWayMatch(tapinsBill({ orderWindow: 'SAY' }))
    expect(r.notes).toEqual([
      'Work starts Oct 19, 2026, before order PO-BM-0007 opens on Oct 30, 2026. ' +
        'The bill is still sent: a line keeps its own dates, and the firm that raised the order can change the order’s.',
    ])
    expect(check(r, 'PO_STATUS')?.reason).toBe(r.notes![0])
  })

  it('work running past the order’s last day is said the same way, never refused', () => {
    const r = threeWayMatch(tapinsBill({
      orderWindow: 'SAY',
      po: { ...tapinsBill().po!, startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-10-20T00:00:00Z') },
    }))
    expect(r.matched).toBe(true)
    expect(r.notes?.[0]).toMatch(/^Work runs to Oct 23, 2026, past order PO-BM-0007 ending Oct 20, 2026\. The bill is still sent/)
  })

  it('the firm paying still reads the same window as a check on its own order, which it may waive with a reason', () => {
    const r = threeWayMatch(tapinsBill())
    expect(r.matched).toBe(false)
    expect(check(r, 'PO_STATUS')).toMatchObject({ outcome: 'FAIL', overridable: true })
    expect(check(r, 'PO_STATUS')?.reason).toBe('Work starts Oct 19, 2026, before PO PO-BM-0007 opens on Oct 30, 2026')
    expect(r.notes).toEqual([])
  })

  it('a bill whose work sits inside its order’s window says nothing beside it', () => {
    const r = threeWayMatch(tapinsBill({ orderWindow: 'SAY', po: { ...tapinsBill().po!, startDate: new Date('2026-10-01T00:00:00Z') } }))
    expect(r.matched).toBe(true)
    expect(r.notes).toEqual([])
    expect(orderWindowSays({ number: 'PO-BM-0007', startDate: new Date('2026-10-01T00:00:00Z'), endDate: null }, {
      firstDay: new Date('2026-10-19T00:00:00Z'), lastDay: new Date('2026-10-23T00:00:00Z'),
    })).toBeNull()
  })
})

describe('every other refusal stands for the firm sending the bill', () => {
  it('a closed order still refuses the bill, window or no window', () => {
    const r = threeWayMatch(tapinsBill({ orderWindow: 'SAY', po: { ...tapinsBill().po!, status: 'CLOSED' } }))
    expect(r.matched).toBe(false)
    expect(check(r, 'PO_STATUS')).toMatchObject({ outcome: 'FAIL', reason: 'PO PO-BM-0007 is closed' })
  })

  it('an order with no room left still refuses the bill', () => {
    const r = threeWayMatch(tapinsBill({ orderWindow: 'SAY', po: { ...tapinsBill().po!, amountCents: 300_000 } }))
    expect(r.matched).toBe(false)
    expect(check(r, 'PO_BALANCE')?.outcome).toBe('FAIL')
  })

  it('a line with no order, where the line was raised against one, still refuses the bill', () => {
    const r = threeWayMatch(tapinsBill({ orderWindow: 'SAY', po: null, poRequired: true }))
    expect(r.matched).toBe(false)
    expect(check(r, 'PO_REQUIRED')?.outcome).toBe('FAIL')
  })

  it('a bill on hours the firm above has not accepted still refuses, and nobody may waive it', () => {
    const r = threeWayMatch(tapinsBill({
      orderWindow: 'SAY',
      timesheets: { ts1: { ...tapinsBill().timesheets.ts1, status: 'SUBMITTED' } },
    }))
    expect(r.matched).toBe(false)
    expect(check(r, 'RECEIPT')).toMatchObject({ outcome: 'FAIL', overridable: false })
  })
})

describe('the send door asks the check as the firm sending it, and the pay door as the firm paying', () => {
  it('Send, the bulk Send and a yes in Ask Etyme all run the check with the window as a sentence (lib/money/bill-send)', () => {
    const src = read('src/lib/money/bill-send.ts')
    // Handed the bill the check read it with (`loadForMatch`), so the window is read on that one read.
    expect(src).toMatch(/matchAndRecord\(invoiceId, companyId, attempt, \{ orderWindow: 'SAY' \}, loaded\)/)
  })

  it('the send door still refuses a bill with no billing address before it runs the check', () => {
    const src = read('src/lib/money/bill-send.ts')
    const gate = src.indexOf('await mayIssueBill(companyId)')
    const match = src.indexOf("orderWindow: 'SAY'")
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(match)
  })

  it('the pay gate never reads the window as a sentence: the firm paying keeps its own check', () => {
    const src = read('src/lib/invoice-match.ts')
    const gate = src.slice(src.indexOf('export async function mayPayInvoiceReceipt'))
    expect(gate).toMatch(/await matchInvoice\(invoiceId\)/)
    expect(gate).not.toMatch(/orderWindow/)
  })

  it('the bill’s own page reads the window as a sentence only for the firm that sends the bill', () => {
    const src = read('src/app/api/invoices/[id]/route.ts')
    expect(src).toMatch(/matchInvoice\(id, \{ orderWindow: readAs === 'RECEIVABLE' \? 'SAY' : 'CHECK' \}\)/)
  })

  it('a sent bill’s response carries the sentence, so the sender reads it where it pressed Send', () => {
    expect(read('src/app/api/invoices/[id]/submit/route.ts')).toMatch(/notes: check\.notes/)
  })
})
