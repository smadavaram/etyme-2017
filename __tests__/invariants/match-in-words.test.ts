/**
 * The match screen says sentences, never codes.
 *
 * CLAUDE.md: *"Explain in a sentence, not a code. A refusal says what is
 * missing and what to do — never `DOCUMENTS_BLOCK`."*
 *
 * The exception row on an invoice was headed `CONTRACT_PERIOD` and one
 * check was named `PERIOD`, because the screen carried its own list of
 * pretty names and two codes were missing from it. A list of names that
 * lives beside the codes rather than with them is a list that goes stale
 * the next time a check is added — so the name belongs to the check, in
 * the engine, and every screen reads it from there.
 *
 * The code stays in the payload. It is what the override route, the
 * exception queue and the waivability table are keyed on. It is for the
 * machine; the sentence is the product.
 */

import { describe, it, expect } from 'vitest'
import {
  threeWayMatch, matchVendorBill, exceptionQueue,
  CHECK_NAME, CHECK_PHRASE, OVERRIDABLE,
  type MatchCode, type MatchInput,
} from '@/lib/three-way-match'

const CODES = Object.keys(OVERRIDABLE) as MatchCode[]

function invoice(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    invoice: {
      id: 'inv1', totalCents: 520_000,
      periodStart: new Date('2026-08-01T00:00:00Z'),
      periodEnd: new Date('2026-08-31T00:00:00Z'),
      contractPeriod: { start: new Date('2026-08-01T00:00:00Z'), end: new Date('2026-08-31T00:00:00Z'), label: 'August 2026' },
    },
    lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Helena Marsh', hours: 40, rateCents: 13_000, amountCents: 520_000 }],
    timesheets: {
      ts1: {
        id: 'ts1', status: 'APPROVED', approvedHours: 40, contractRateCents: 13_000,
        periodStart: new Date('2026-08-03T00:00:00Z'), periodEnd: new Date('2026-08-07T00:00:00Z'),
      },
    },
    po: null,
    poRequired: false,
    ...overrides,
  }
}

describe('Every check on the match has a name a person can read', () => {

  it('names every check the engine can return, with none left as a code', () => {
    for (const code of CODES) {
      expect(CHECK_NAME[code], `no reader's name for ${code}`).toBeTruthy()
      expect(CHECK_NAME[code]).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}/)
      expect(CHECK_NAME[code]).not.toBe(code)
    }
  })

  it('names the two checks the invoice screen used to print as codes', () => {
    expect(CHECK_NAME.CONTRACT_PERIOD).toBe("The bill's dates sit inside the contract's billing period")
    expect(CHECK_NAME.PERIOD).toBe('The work was done in the period being billed')
  })

  it('every check an invoice match returns carries its name beside its code', () => {
    const r = threeWayMatch(invoice())
    expect(r.checks.length).toBeGreaterThan(0)
    for (const c of r.checks) {
      expect(c.name, `check ${c.code} came back with no name`).toBe(CHECK_NAME[c.code])
      expect(c.code).toBeTruthy()
    }
  })

  it('every check a supplier bill match returns carries its name beside its code', () => {
    const r = matchVendorBill({
      bill: {
        id: 'b1', number: 'VB-1001', totalCents: 400_000, currency: 'USD',
        periodStart: new Date('2026-08-01T00:00:00Z'), periodEnd: new Date('2026-08-31T00:00:00Z'),
        hours: 40, rateCents: 10_000,
      },
      accepted: {
        hours: 40, contractRateCents: 10_000, count: 1,
        firstDay: new Date('2026-08-03T00:00:00Z'), lastDay: new Date('2026-08-07T00:00:00Z'),
      },
      po: null,
      poRequired: false,
    })
    for (const c of r.checks) expect(c.name).toBe(CHECK_NAME[c.code])
  })

  it('an invoice with no lines at all is refused with a name on the refusal', () => {
    const r = threeWayMatch(invoice({ lines: [] }))
    expect(r.checks[0].name).toBe(CHECK_NAME.RECEIPT)
  })
})

describe('An exception is described in words on every screen that mentions it', () => {

  it('a waived failure is summarized in words rather than in a code', () => {
    const r = threeWayMatch(invoice({
      po: {
        id: 'po1', number: 'NB-PO-22', status: 'OPEN', amountCents: 100_000, consumedCents: 0,
        startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-12-31T00:00:00Z'),
      },
      poRequired: true,
      overrides: [{ code: 'PO_BALANCE', reason: 'Order being topped up today', byName: 'Dana Whitfield', at: new Date() }],
    }))
    expect(r.summary).toContain(CHECK_PHRASE.PO_BALANCE)
    expect(r.summary).not.toContain('PO_BALANCE')
    expect(r.summary).not.toContain('po balance')
  })

  it('the exception queue says what cannot be waived in words rather than in a code', () => {
    const r = threeWayMatch(invoice({
      lines: [{ id: 'l1', timesheetId: null, personName: 'Helena Marsh', hours: 40, rateCents: 13_000, amountCents: 520_000 }],
    }))
    const q = exceptionQueue([{
      id: 'inv1', reference: 'IN-1001', counterparty: 'Veritan Talent', currency: 'USD',
      amountCents: 520_000, receivedAt: new Date('2026-09-01T00:00:00Z'), result: r,
    }], new Date('2026-09-10T00:00:00Z'))
    expect(q[0].says).toContain(CHECK_PHRASE.RECEIPT)
    expect(q[0].says).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
    expect(q[0].says).toContain('Nobody can wave this through')
  })

  it('has a short phrase for every check, so no screen has to invent one', () => {
    for (const code of CODES) {
      expect(CHECK_PHRASE[code], `no phrase for ${code}`).toBeTruthy()
      expect(CHECK_PHRASE[code]).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}/)
    }
  })
})
