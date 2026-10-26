import { describe, it, expect } from 'vitest'
import { sendVerdict, otherSenderSays } from '@/lib/money/bill-send'

/**
 * Who sends a bill the twin drafted (coordinator, 2026-10-26, reversible
 * by the founder in a sentence): the founder's decision #2 of 2026-10-19
 * covers the document, not the door. One rule, `maySendBill`, read by the
 * send routes, by Today's Send and by Ask Etyme.
 */

const owner = 'owner'
const imelda = { personId: 'imelda', name: 'Imelda Santoro' }
const rosalind = { personId: 'rosalind', name: 'Rosalind Tay' }

describe('who sends a bill', () => {
  it('a bill the twin drafted is sent by the seat holding invoices.issue, and the Owner cannot where that seat exists', () => {
    const refused = sendVerdict({ callerId: owner, permitted: true, draftedFor: owner, otherSenders: [rosalind, imelda] })
    expect(refused).toEqual({
      ok: false, code: 'FORBIDDEN',
      says: 'Imelda Santoro or Rosalind Tay sends this bill. Ask Etyme drafted it on your authority, so you send it only where nobody else at the firm sends bills.',
    })
    expect(sendVerdict({ callerId: 'imelda', permitted: true, draftedFor: owner, otherSenders: [rosalind] })).toEqual({ ok: true, ownerException: null })
  })

  it('where only the Owner holds invoices.issue the Owner sends, and the answer says the exception applied', () => {
    const v = sendVerdict({ callerId: owner, permitted: true, draftedFor: owner, otherSenders: [] })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.ownerException).toMatch(/Nobody else at the firm sends bills/)
  })

  it('a bill a person drafted is sent by any seat holding invoices.issue', () => {
    expect(sendVerdict({ callerId: owner, permitted: true, draftedFor: null, otherSenders: [imelda] })).toEqual({ ok: true, ownerException: null })
  })

  it('a seat that does not send bills sends none, whoever drafted it', () => {
    expect(sendVerdict({ callerId: 'pm', permitted: false, draftedFor: null, otherSenders: [] }).ok).toBe(false)
  })

  it('three people who send bills are named as one list, the last after "or"', () => {
    expect(otherSenderSays(['A', 'B', 'C'])).toMatch(/^A, B or C sends this bill\./)
  })
})
