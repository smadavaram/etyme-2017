import { describe, expect, it } from 'vitest'
import { ndaAtInterview, type NdaRow } from '@/app/api/submissions/[id]/interviews/nda'

/**
 * Found by the screen walk of 2026-10-22: there was no NDA step at
 * interview. The rule for when booking a round asks the candidate for
 * the client's NDA (app/api/submissions/[id]/interviews/nda.ts).
 */

const row = (o: Partial<NdaRow> = {}): NdaRow => ({ owedBy: 'WORKER', required: true, waivedReason: null, issuedToId: 's1', ...o })
const base = { personName: 'Soren Sandoval', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true }

describe('the client’s NDA is asked when an interview is booked, where the job’s set asks for one', () => {
  it('booking an interview asks the candidate for the client’s NDA where the client’s orders require one', () => {
    expect(ndaAtInterview({ ...base, rows: [row()], asked: [] })).toEqual({
      ask: true,
      says: "Soren Sandoval has been asked to sign Talvern Medical's non-disclosure agreement before the interview, because Talvern Medical's orders require one.",
    })
  })

  it('an NDA the client asks of the supplier is asked of the candidate too, because the firm’s NDA does not bind somebody it does not employ', () => {
    expect(ndaAtInterview({ ...base, rows: [row({ owedBy: 'SUPPLIER' })], asked: [] }).ask).toBe(true)
  })

  it('an NDA on another supplier’s order is not asked of a candidate whose supplier has an order of its own', () => {
    expect(ndaAtInterview({ ...base, rows: [row({ issuedToId: 's2' })], asked: [] })).toEqual({ ask: false, why: 'NOT_ASKED_BY_THE_JOB' })
  })

  it('a supplier with no order from the client yet is held to the client’s orders to anybody', () => {
    expect(ndaAtInterview({ ...base, supplierHasOrder: false, rows: [row({ issuedToId: 's2' })], asked: [] }).ask).toBe(true)
  })

  it('a client whose orders ask for no NDA asks for none at interview', () => {
    expect(ndaAtInterview({ ...base, rows: [], asked: [] })).toEqual({ ask: false, why: 'NOT_ASKED_BY_THE_JOB' })
  })

  it('an NDA the client owes its supplier is not asked of the candidate', () => {
    expect(ndaAtInterview({ ...base, rows: [row({ owedBy: 'CUSTOMER' })], asked: [] })).toEqual({ ask: false, why: 'NOT_ASKED_BY_THE_JOB' })
  })

  it('an NDA waived on the order to this supplier is not asked, whatever the client’s other orders say', () => {
    const v = ndaAtInterview({
      ...base,
      rows: [row({ issuedToId: 's2' }), row({ waivedReason: 'Covered by the firm’s own mutual NDA, signed 2026-03-02.' })],
      asked: [],
    })
    expect(v).toEqual({ ask: false, why: 'WAIVED_ON_THE_ORDER' })
  })

  it('an NDA already asked for is not asked twice, and the booking says it is still unsigned', () => {
    expect(ndaAtInterview({ ...base, rows: [row()], asked: [{ status: 'SENT', sentAt: new Date(), signedAt: null }] })).toEqual({
      ask: false,
      why: 'ALREADY_ASKED',
      says: "Soren Sandoval has been asked for Talvern Medical's non-disclosure agreement and has not signed it yet.",
    })
  })

  it('an NDA already signed is not asked again', () => {
    expect(ndaAtInterview({ ...base, rows: [row()], asked: [{ status: 'SIGNED', sentAt: new Date(), signedAt: new Date() }] })).toMatchObject({
      ask: false,
      why: 'ALREADY_SIGNED',
    })
  })
})
