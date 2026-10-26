import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftSend } from '@/lib/today-page'
import { sendVerdict, otherSenderSays } from '@/lib/money/bill-send'

/**
 * Today's Send on a drafted bill is the send route's own verdict.
 *
 * Found by the second production walk (2026-10-26): Brightmoor's Owner saw
 * Send on Today while Ask Etyme said the bill was not theirs to send. The
 * route now reads `maySendBill` (lib/money/bill-send) before anything
 * else, and Today reads `maySendBills` over every draft on the page, so
 * the two answer from one function.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('src/app/api/invoices/[id]/submit/route.ts')
const TODAY = read('src/app/api/today/route.ts')
const PAGE = read('src/app/dashboard/page.tsx')

describe('Send on Today', () => {
  it('Today offers Send on a bill only to a seat the send route would let send it', () => {
    // One function behind both doors.
    expect(ROUTE).toMatch(/await maySendBill\(/)
    expect(TODAY).toMatch(/await maySendBills\(/)
    expect(TODAY).toContain('draftSend(verdicts.get(d.invoiceId))')

    // The page draws Send from that verdict and from nothing of its own.
    expect(PAGE).toContain('d.send ? (')
    expect(PAGE).not.toMatch(/hasPermission\([^)]*'invoices\.issue'\)/)
    expect(PAGE).not.toContain('mayIssue')

    // What the verdict means on the page, over the rule's own cases.
    const owner = 'owner', finance = 'finance'
    const others = [{ personId: finance, name: 'Rosalind Tay' }]
    // A bill Ask Etyme drafted for the Owner, where somebody else sends bills: no Send, the route's sentence instead.
    expect(draftSend(sendVerdict({ callerId: owner, permitted: true, draftedFor: owner, otherSenders: others })))
      .toEqual({ send: false, refused: otherSenderSays(['Rosalind Tay']) })
    // The same bill, for the seat that sends bills: Send.
    expect(draftSend(sendVerdict({ callerId: finance, permitted: true, draftedFor: owner, otherSenders: [] })))
      .toEqual({ send: true, refused: null })
    // Where nobody else sends bills, the Owner sends it.
    expect(draftSend(sendVerdict({ callerId: owner, permitted: true, draftedFor: owner, otherSenders: [] })).send).toBe(true)
    // A seat that does not send bills never gets Send.
    expect(draftSend(sendVerdict({ callerId: 'am', permitted: false, draftedFor: null, otherSenders: [] })).send).toBe(false)
    // No verdict read is no Send, never a guess.
    expect(draftSend(undefined)).toEqual({ send: false, refused: null })
  })
})
