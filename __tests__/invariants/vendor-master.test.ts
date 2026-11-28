import { describe, it, expect } from 'vitest'
import {
  payToFor, checkedFor, customersFrom, changeAnswers, supplierChangedMessage, oldCheckPayer, lastFour, COOLING_OFF_DAYS,
  type ChangeRead, type ChangeCheck, type RowWithChecks,
} from '@/lib/vendor-master'

/**
 * Record 87 (2026-11-17): the supplier keeps its own profile, chooses
 * which account each customer pays, and each customer confirms a change
 * for itself. The pure readers, with made-up firms.
 */

const SUPPLIER = 'northwind-staffing'
const A = 'harborline-tech'
const B = 'eastfield-ops'
const t = (d: string) => new Date(`${d}T12:00:00Z`)

const DEFAULT_ROW = { id: 'r-default', companyId: SUPPLIER, isDefault: true, createdAt: t('2026-03-01') }
const SECOND_ROW = { id: 'r-second', companyId: SUPPLIER, isDefault: false, createdAt: t('2026-05-01') }
const OTHER_FIRMS_ROW = { id: 'r-other', companyId: 'someone-else', isDefault: true, createdAt: t('2026-01-01') }

describe('which account a customer pays', () => {
  it("a supplier's account chosen for one customer is the one that customer pays, and another customer pays the default", () => {
    const choices = [{ supplierCompanyId: SUPPLIER, payerCompanyId: A, remitToId: SECOND_ROW.id }]
    expect(payToFor(SUPPLIER, A, [DEFAULT_ROW, SECOND_ROW], choices)?.id).toBe('r-second')
    expect(payToFor(SUPPLIER, B, [DEFAULT_ROW, SECOND_ROW], choices)?.id).toBe('r-default')
  })

  it('with no default, a customer with no choice pays the first account entered', () => {
    const first = { ...DEFAULT_ROW, isDefault: false }
    expect(payToFor(SUPPLIER, B, [SECOND_ROW, first], [])?.id).toBe('r-default')
  })

  it("a choice naming another firm's account is read as no choice", () => {
    const choices = [{ supplierCompanyId: SUPPLIER, payerCompanyId: A, remitToId: OTHER_FIRMS_ROW.id }]
    expect(payToFor(SUPPLIER, A, [DEFAULT_ROW, SECOND_ROW, OTHER_FIRMS_ROW], choices)?.id).toBe('r-default')
  })

  it('a supplier with no payment details gives no account to pay', () => {
    expect(payToFor(SUPPLIER, A, [], [])).toBeNull()
  })
})

const FACTS = { bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC', accountLast4: '4821', routingLast4: '0021' }

describe('which customers confirm a change', () => {
  const onEtyme = new Set([A, B, 'one-sided', 'prospect', 'blocked'])
  const rows = [
    // B: each firm's own register says they trade.
    { companyId: SUPPLIER, otherCompanyId: B, relationship: 'CLIENT', status: 'ACTIVE' },
    { companyId: B, otherCompanyId: SUPPLIER, relationship: 'SUPPLIER', status: 'ACTIVE' },
    // Only the supplier says so.
    { companyId: SUPPLIER, otherCompanyId: 'one-sided', relationship: 'CLIENT', status: 'ACTIVE' },
    // Courting, not trading.
    { companyId: SUPPLIER, otherCompanyId: 'prospect', relationship: 'CLIENT', status: 'PROSPECT' },
    { companyId: 'prospect', otherCompanyId: SUPPLIER, relationship: 'SUPPLIER', status: 'PROSPECT' },
    // An agreement, and a block on the payer's own register.
    { companyId: 'blocked', otherCompanyId: SUPPLIER, relationship: 'SUPPLIER', status: 'BLOCKED' },
  ]
  const agreements = [
    { vendorId: SUPPLIER, clientId: A },
    { vendorId: SUPPLIER, clientId: 'blocked' },
    { vendorId: SUPPLIER, clientId: 'not-on-etyme' },
  ]

  it("a change to the supplier's bank lists every customer it trades with to confirm it, and no firm it does not trade with", () => {
    expect(customersFrom({ supplierId: SUPPLIER, rows, agreements, onEtyme })).toEqual([A, B].sort())
  })

  it('a firm the supplier alone calls its customer is not asked to confirm its bank', () => {
    expect(customersFrom({ supplierId: SUPPLIER, rows, agreements, onEtyme })).not.toContain('one-sided')
  })

  it('a customer not on Etyme is not listed, because nobody there can confirm', () => {
    expect(customersFrom({ supplierId: SUPPLIER, rows, agreements, onEtyme })).not.toContain('not-on-etyme')
  })
})

const CHANGE: ChangeRead = { id: 'change-1', state: 'ENTERED', ...FACTS }
const confirmedBy = (payer: string, over: Partial<ChangeCheck> = {}): ChangeCheck => ({
  payerCompanyId: payer, bankChangeRequestId: CHANGE.id, ...FACTS,
  checkedAt: t('2026-11-10'), callbackAt: t('2026-11-10'), callbackOutcome: 'CONFIRMED', ...over,
})

describe("each customer's own confirmation", () => {
  it("one customer's confirmation never counts for another", () => {
    const answers = changeAnswers(CHANGE, [A, B], [confirmedBy(A)])
    expect(answers.find((x) => x.payerId === A)?.state).toBe('CONFIRMED')
    expect(answers.find((x) => x.payerId === B)?.state).toBe('WAITING')

    const row: RowWithChecks = { ...FACTS, verifiedAt: null, verifiedByCompanyId: null, bankChecks: [{ ...confirmedBy(A) }] }
    expect(checkedFor(A, row).checked).toBe(true)
    expect(checkedFor(B, row)).toEqual({ checked: false, why: 'NOT_CHECKED' })
  })

  it("a customer's confirmation holds payment for three days from the call back", () => {
    const [a] = changeAnswers(CHANGE, [A], [confirmedBy(A)])
    expect(COOLING_OFF_DAYS).toBe(3)
    expect(a).toMatchObject({ state: 'CONFIRMED', confirmedAt: t('2026-11-10'), payableFrom: t('2026-11-13') })
  })

  it('a check with no call back recorded does not confirm a change', () => {
    const [a] = changeAnswers(CHANGE, [A], [confirmedBy(A, { callbackOutcome: null, callbackAt: null })])
    expect(a).toEqual({ payerId: A, state: 'NOT_CONFIRMED', outcome: 'NO_CALLBACK' })
  })

  it('a call back that did not match leaves the change not confirmed by that customer', () => {
    const [a] = changeAnswers(CHANGE, [A], [confirmedBy(A, { callbackOutcome: 'DID_NOT_MATCH' })])
    expect(a).toEqual({ payerId: A, state: 'NOT_CONFIRMED', outcome: 'DID_NOT_MATCH' })
  })

  it('a check of details other than the ones entered does not answer the change', () => {
    const [a] = changeAnswers(CHANGE, [A], [confirmedBy(A, { accountLast4: '9999' })])
    expect(a.state).toBe('WAITING')
  })

  it("a change the supplier's Owner said was not them reads disowned for every customer", () => {
    const answers = changeAnswers({ ...CHANGE, state: 'DISOWNED' }, [A, B], [confirmedBy(A)])
    expect(answers.map((x) => x.state)).toEqual(['DISOWNED', 'DISOWNED'])
  })
})

describe('the change message to the customer’s own system', () => {
  const confirmed = changeAnswers(CHANGE, [A], [confirmedBy(A)])[0]

  it('the change message to a customer carries its own vendor number and no full account number', () => {
    const r = supplierChangedMessage({
      payerId: A, change: { ...CHANGE, accountLast4: '000123454821', paymentMethod: 'ACH' }, answer: confirmed,
      vendorNumber: ' V-1001 ', supplierLegalName: 'Northwind Staffing LLC',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.message.vendorNumber).toBe('V-1001')
    expect(r.message.accountLast4).toBe('4821')
    expect(JSON.stringify(r.message)).not.toContain('000123454821')
    expect(r.message.direction).toBe('OUT')
    expect(r.message.idempotencyKey).toBe(`supplier-changed:${A}:change-1:OUT:1`)
  })

  it('a customer that has not confirmed the change is sent no message', () => {
    const waiting = changeAnswers(CHANGE, [B], [])[0]
    const r = supplierChangedMessage({ payerId: B, change: CHANGE, answer: waiting, vendorNumber: 'V-2', supplierLegalName: 'Northwind Staffing LLC' })
    expect(r).toEqual({ ok: false, says: 'This change goes to your system once your company confirms it.' })
  })

  it('a customer with no vendor number for the supplier is told to add one, and no message is made', () => {
    const r = supplierChangedMessage({ payerId: A, change: CHANGE, answer: confirmed, vendorNumber: null, supplierLegalName: 'Northwind Staffing LLC' })
    expect(r).toEqual({ ok: false, says: 'Add your vendor number for Northwind Staffing LLC, then the change can go to your system.' })
  })

  it('another customer’s confirmation makes no message for this one', () => {
    const r = supplierChangedMessage({ payerId: B, change: CHANGE, answer: confirmed, vendorNumber: 'V-2', supplierLegalName: 'Northwind Staffing LLC' })
    expect(r.ok).toBe(false)
  })

  it('only the last four digits of a stored number ever leave', () => {
    expect(lastFour('1234-5678-9012')).toBe('9012')
    expect(lastFour(null)).toBeNull()
  })
})

describe('old checks', () => {
  const at = t('2026-10-20')
  const row = { id: 'r-old', companyId: SUPPLIER, verifiedAt: at, verifiedByCompanyId: null }

  it('an old check that names its payer is given to that payer', () => {
    expect(oldCheckPayer({ ...row, verifiedByCompanyId: A }, [], new Set())).toMatchObject({ payerId: A, from: 'VERIFIED_BY', carried: false })
  })

  it('an old check is given to the payer whose supplier walk marked the bank item at the moment it was stamped', () => {
    const walks = [
      { payerCompanyId: B, firmCompanyId: SUPPLIER, state: 'HELD', at },
      { payerCompanyId: A, firmCompanyId: SUPPLIER, state: 'HELD', at: t('2026-10-01') },
    ]
    expect(oldCheckPayer(row, walks, new Set())).toMatchObject({ payerId: B, from: 'SUPPLIER_WALK' })
  })

  it('an old check the record cannot place names no payer', () => {
    expect(oldCheckPayer(row, [{ payerCompanyId: A, firmCompanyId: SUPPLIER, state: 'WAIVED', at }], new Set())).toMatchObject({ payerId: null, why: 'NO_PAYER_ON_RECORD' })
  })

  it('two payers marking the bank item at the same moment name neither', () => {
    const walks = [A, B].map((p) => ({ payerCompanyId: p, firmCompanyId: SUPPLIER, state: 'HELD', at }))
    expect(oldCheckPayer(row, walks, new Set())).toMatchObject({ payerId: null, why: 'SEVERAL_WALKS' })
  })

  it('details nobody checked are not an old check', () => {
    expect(oldCheckPayer({ ...row, verifiedAt: null }, [], new Set())).toBeNull()
  })
})
