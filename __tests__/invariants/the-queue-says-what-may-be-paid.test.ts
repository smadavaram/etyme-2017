import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { heldReceiptDecision, heldFor, receiptToPayDecision } from '@/app/api/decisions/receipt-to-pay'
import { signedWeekTitle } from '@/app/api/decisions/words'
import { flagAsksReason } from '@/lib/timesheet-flag'
import { clientSignedSays } from '@/app/api/timesheets/client-signed-says'

/**
 * Ask Etyme and the dashboard read one queue, and the walk of 2026-10-22
 * found it saying four things that were not so: a receipt the payment
 * route refuses read "waits for you to pay it"; one receipt counted twice,
 * once as the twin's question and once as "Pay"; a firm below the client
 * was asked to "approve" a week the client had already signed, and asked
 * again for the client's reason; and the client was told its week was
 * "billable". These are the sentences that hold the fixes.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-10-22T12:00:00Z')
const receipt = {
  id: 'inv-0442', number: 'PR-2026-0442', vendorName: 'Pinnacle Resourcing',
  outstandingCents: 406_700, currency: 'USD',
  dueAt: new Date('2026-12-15T00:00:00Z'), receivedAt: new Date('2026-10-20T00:00:00Z'),
}

describe('an invoice receipt that does not pass the three-way check is held, never "Pay"', () => {
  it('a receipt billing 41.5 hours against 40 signed is held for its hours, and says both numbers', () => {
    const row = heldReceiptDecision(receipt, [{ code: 'QUANTITY', overridable: true }, { code: 'AMOUNT', overridable: true }], { billed: 41.5, signed: 40 }, NOW)
    expect(row.title).toBe('Held: hours don’t match — Pinnacle Resourcing')
    expect(row.subtitle).toBe('Invoice PR-2026-0442 · $4,067.00 · 41.5 hours billed, 40 signed · record an exception with a reason, or ask Pinnacle Resourcing to correct it')
    expect(row.actionUrl).toBe('/dashboard/invoices/inv-0442')
  })

  it('a held receipt adds nothing to the money waiting to be paid', () => {
    expect(heldReceiptDecision(receipt, [{ code: 'QUANTITY', overridable: true }], { billed: 41.5, signed: 40 }, NOW).amount).toBeNull()
  })

  it('where a failing check may not be waived, the way forward is the supplier’s correction, never an exception', () => {
    const row = heldReceiptDecision(receipt, [{ code: 'DUPLICATE', overridable: false }], null, NOW)
    expect(row.title).toBe('Held: billed before — Pinnacle Resourcing')
    expect(row.subtitle).toContain('it can be paid once Pinnacle Resourcing corrects it')
    expect(row.subtitle).not.toContain('exception')
  })

  it('a receipt with a week nobody signed says it can be paid once every week on it is signed and accepted', () => {
    const row = heldReceiptDecision(receipt, [{ code: 'RECEIPT', overridable: false }, { code: 'QUANTITY', overridable: true }], { billed: 40, signed: null }, NOW)
    expect(row.title).toBe('Held: a week nobody signed — Pinnacle Resourcing')
    expect(row.subtitle).toContain('40 hours billed, none signed')
    expect(row.subtitle).toContain('it can be paid once every week on it is signed and accepted')
  })

  it('a receipt held within a week of its due date is urgent', () => {
    expect(heldReceiptDecision({ ...receipt, dueAt: new Date('2026-10-25T00:00:00Z') }, [{ code: 'PRICE', overridable: false }], null, NOW).urgency).toBe('HIGH')
    expect(heldFor([{ code: 'PRICE' }])).toBe('rate doesn’t match')
    expect(heldFor([])).toBe('the check failed')
  })

  it('a receipt that passes is still "Pay", in the words it always used', () => {
    expect(receiptToPayDecision({ ...receipt, number: 'PR-2026-0441' }, NOW).title).toBe('Pay invoice receipt — Pinnacle Resourcing')
  })

  it('the queue decides "Pay" with the payment route’s own gate, read for every receipt at once', () => {
    const route = read('src/app/api/decisions/route.ts')
    expect(route).toContain('const checked = await matchInvoices(payable.map((p) => p.inv.id))')
    expect(route).toContain('if (payGate(inv, match).ok) {')
    expect(route).toContain("type: 'INVOICE_RECEIPT_HELD'")
  })
})

describe('one invoice receipt is one item in the count', () => {
  it('the twin’s question to approve a receipt rides on that receipt’s row and is not counted beside it', () => {
    const route = read('src/app/api/decisions/route.ts')
    expect(route).toContain("q.entityType === 'Invoice' && RECEIPT_QUESTIONS.has(q.action)")
    expect(route).toContain("decisions[i].type === 'TWIN_QUESTION' && foldedQuestions.has(decisions[i].entityId)")
    // Both receipt rows carry the question's id, so Ask Etyme can still
    // draw the twin's card on the one row.
    expect(route.match(/twinApprovalId,\n/g)?.length).toBe(2)
  })
})

describe('one invoice receipt is one item in the count, whichever question the twin asked', () => {
  it('the twin’s question to pay a receipt rides on that receipt’s row the same way as its question to approve it', () => {
    const route = read('src/app/api/decisions/route.ts')
    expect(route).toContain("new Set(['invoice_receipt.approve', 'invoice_receipt.pay'])")
  })
})

describe('a week the client signed is accepted below it, not approved again', () => {
  it('a firm below the client reads "Accept the signed week", which every reader keys its Accept button on', () => {
    expect(signedWeekTitle('Omar Haddad')).toBe('Accept the signed week — Omar Haddad')
    expect(/^Accept\b/.test(signedWeekTitle('Omar Haddad'))).toBe(true)
  })

  it('a firm below the client is not asked for the reason the client gave when it signed a flagged week', () => {
    expect(flagAsksReason({ belowTop: true, clientSignedAt: new Date('2026-10-20T00:00:00Z') })).toBe(false)
  })

  it('the client signing a flagged week is still asked for the reason', () => {
    expect(flagAsksReason({ belowTop: false, clientSignedAt: null })).toBe(true)
  })

  it('a firm below the top is asked for a reason where no client signature stands above it', () => {
    expect(flagAsksReason({ belowTop: true, clientSignedAt: null })).toBe(true)
  })

  it('the approve route, the Timesheets list and the queue read the same rule', () => {
    expect(read('src/app/api/timesheets/[id]/approve/route.ts')).toContain('flagAsksReason({ belowTop, clientSignedAt: timesheet.clientApprovedAt })')
    expect(read('src/app/api/timesheets/route.ts')).toContain('flagAsksReason({ belowTop: !isClientSide && !sheet.direct, clientSignedAt: t.clientApprovedAt })')
    expect(read('src/app/api/decisions/route.ts')).toContain('const flag = signedAbove\n        ? null')
  })
})

describe('the client is told what it approved and who bills it, never that the week is billable', () => {
  it('the client reads the person, the hours, the week, and the firm that bills it with the amount', () => {
    const says = clientSignedSays({ personName: 'Helena Marsh', hours: 40, week: 'Oct 11–17', billedBy: 'Computer Systems Inc', worthCents: 580_000 })
    expect(says).toBe('Approved Helena Marsh’s 40 hours for Oct 11–17. Computer Systems Inc bills you $5,800.00 for them.')
    expect(says).not.toContain('billable')
  })

  it('with no figure behind the week the client is told only what it approved', () => {
    expect(clientSignedSays({ personName: 'Omar Haddad', hours: 45, week: 'Oct 11–17', billedBy: 'Brightmoor Staffing', worthCents: null }))
      .toBe('Approved Omar Haddad’s 45 hours for Oct 11–17.')
  })

  it('the approve route says it to the client on the response and on the client’s own log only', () => {
    const route = read('src/app/api/timesheets/[id]/approve/route.ts')
    expect(route).toContain("const clientSays = asParty === 'CLIENT' && !direct")
    expect(route).toContain('summary: clientSays && moneyCompanyId === onBehalfOf')
  })
})

describe('a seat’s program queue is callable for Ask Etyme, from the code the program page draws', () => {
  it('programQueue reads the program through programView, the same function GET /api/program answers from', () => {
    const queue = read('src/app/api/program/queue.ts')
    expect(queue).toContain('export async function programQueue(')
    expect(queue).toContain('await programView(caller, requestedClientId, opts)')
    expect(read('src/app/api/program/route.ts')).toContain("await programView(caller, request.nextUrl.searchParams.get('clientCompanyId'))")
  })
})
