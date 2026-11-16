import { describe, it, expect } from 'vitest'
import { checkedByPayer, type PayToFacts, type PayerCheckRow } from '@/lib/setup-gate-rules'

/**
 * Record 86, answer 7: "Each payer confirms for itself, so one client's
 * check never counts for another." Slice S0 builds the reader; the
 * payment gate moves onto it in money's next slice, so who may pay does
 * not change here. Made-up firms on reserved domains.
 */

const CLIENT_A = 'client-a'
const CLIENT_B = 'client-b'
const CHECKED_ON = new Date('2026-11-10T15:00:00Z')

const DETAILS: PayToFacts = {
  bankName: 'Harborline Bank', accountName: 'Northwind Staffing LLC', accountLast4: '6789', routingLast4: '0021',
  verifiedAt: null, verifiedByCompanyId: null,
}
const A_CHECKED: PayerCheckRow = {
  bankName: 'Harborline Bank', accountName: 'Northwind Staffing LLC', accountLast4: '6789', routingLast4: '0021',
  checkedAt: CHECKED_ON, callbackOutcome: 'CONFIRMED',
}

describe('bank details are checked by each payer for itself', () => {
  it('a client’s own check counts for that client', () => {
    expect(checkedByPayer(DETAILS, A_CHECKED, CLIENT_A)).toEqual({ checked: true, from: 'BANK_CHECK', at: CHECKED_ON })
  })

  it('one client’s bank check never counts for another client', () => {
    // Client B has no check of its own on these details.
    expect(checkedByPayer(DETAILS, null, CLIENT_B)).toEqual({ checked: false, why: 'NOT_CHECKED' })
  })

  it('a payer’s check stands only while the details still read what it checked', () => {
    for (const moved of [{ accountLast4: '1111' }, { routingLast4: '9999' }, { bankName: 'Another Bank' }, { accountName: 'Someone Else LLC' }]) {
      expect(checkedByPayer({ ...DETAILS, ...moved }, A_CHECKED, CLIENT_A)).toEqual({ checked: false, why: 'DETAILS_CHANGED' })
    }
  })

  it('spaces typed around the same bank name leave the payer’s check standing', () => {
    // The same rule that clears the old check (bankChange in lib/money/remit-change) reads them as the same name.
    expect(checkedByPayer({ ...DETAILS, bankName: ' Harborline Bank ' }, A_CHECKED, CLIENT_A).checked).toBe(true)
  })

  it('a call back that did not confirm the details is not a check', () => {
    expect(checkedByPayer(DETAILS, { ...A_CHECKED, callbackOutcome: 'DID_NOT_MATCH' }, CLIENT_A)).toEqual({ checked: false, why: 'CALLBACK_DID_NOT_CONFIRM' })
    expect(checkedByPayer(DETAILS, { ...A_CHECKED, callbackOutcome: 'NOT_REACHED' }, CLIENT_A)).toEqual({ checked: false, why: 'CALLBACK_DID_NOT_CONFIRM' })
  })

  it('the old single check on the details counts only for the payer it names', () => {
    const old = { ...DETAILS, verifiedAt: CHECKED_ON, verifiedByCompanyId: CLIENT_A }
    expect(checkedByPayer(old, null, CLIENT_A)).toEqual({ checked: true, from: 'OLD_COLUMNS', at: CHECKED_ON })
    expect(checkedByPayer(old, null, CLIENT_B)).toEqual({ checked: false, why: 'ANOTHER_PAYER' })
  })

  it('an old check that does not say which payer made it counts for nobody', () => {
    expect(checkedByPayer({ ...DETAILS, verifiedAt: CHECKED_ON }, null, CLIENT_A)).toEqual({ checked: false, why: 'PAYER_NOT_RECORDED' })
  })

  it('a payer’s own check is read before the old columns, so a voided check is never rescued by them', () => {
    const old = { ...DETAILS, accountLast4: '1111', verifiedAt: CHECKED_ON, verifiedByCompanyId: CLIENT_A }
    expect(checkedByPayer(old, A_CHECKED, CLIENT_A)).toEqual({ checked: false, why: 'DETAILS_CHANGED' })
  })

  it('a firm with no payment details on Etyme is checked by nobody', () => {
    expect(checkedByPayer(null, null, CLIENT_A)).toEqual({ checked: false, why: 'NO_DETAILS' })
  })
})
