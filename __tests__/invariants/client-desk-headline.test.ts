import { describe, it, expect } from 'vitest'
import { deskCounts, deskHeadline } from '@/app/dashboard/program/needs-you'
import { supplierCoverGate } from '@/lib/document-stages'

/**
 * The release walk of 2026-09-21 opened a client's desk and read
 * "Nothing needs you today." over a page saying a start was blocked on
 * an I-9 in nine days and a supplier had somebody on site with no
 * agreement. The headline counted the approval queue and called that the
 * desk.
 */
describe('the sentence at the top of a client’s desk', () => {
  const clear = { decisions: [], startingSoon: [], vendors: [] }

  it('says nothing needs you only when the queue, the starts and the suppliers are all clear', () => {
    expect(deskHeadline(deskCounts(clear)).says).toBe('Nothing needs you today.')
  })

  it('counts a start that paperwork will stop, even with an empty approval queue', () => {
    const said = deskHeadline(
      deskCounts({ ...clear, startingSoon: [{ paperwork: { outcome: 'BLOCK' } }] })
    )
    expect(said.total).toBe(1)
    expect(said.says).toContain('1 thing needs you.')
    expect(said.says).toContain('1 start is held up by paperwork.')
  })

  it('counts a supplier with people on site and no agreement on file', () => {
    const said = deskHeadline(deskCounts({ ...clear, vendors: [{ agreement: false, headcount: 1 }] }))
    expect(said.total).toBe(1)
    expect(said.says).toContain('no agreement on file')
  })

  it('counts a supplier once however many of its people are on site', () => {
    const said = deskHeadline(deskCounts({ ...clear, vendors: [{ agreement: false, headcount: 6 }] }))
    expect(said.total).toBe(1)
  })

  it('a start whose paperwork only warns is not counted as needing somebody', () => {
    const said = deskHeadline(
      deskCounts({ ...clear, startingSoon: [{ paperwork: { outcome: 'WARN' } }, { paperwork: { outcome: 'PASS' } }] })
    )
    expect(said.says).toBe('Nothing needs you today.')
  })

  it('a supplier whose agreement was never read is not counted as missing one', () => {
    expect(deskHeadline(deskCounts({ ...clear, vendors: [{ headcount: 3 }] })).says).toBe('Nothing needs you today.')
  })

  it('adds the queue, the blocked starts and the suppliers into one number and names each', () => {
    const said = deskHeadline(
      deskCounts({
        decisions: [{ urgency: 'HIGH', flag: 'OVER_CONTRACT' }, { type: 'APPROVAL' }],
        startingSoon: [{ paperwork: { outcome: 'BLOCK' } }],
        vendors: [{ agreement: false, headcount: 1 }, { agreement: true, headcount: 2 }],
      })
    )
    expect(said.total).toBe(4)
    expect(said.says).toBe(
      '4 things need you. 1 has an exception. 1 start is held up by paperwork. 1 supplier has people on site with no agreement on file.'
    )
  })
})

/**
 * The submit door passes the client's required set and then reads the
 * gate's findings: a lapse refuses, a document nobody has filed is
 * chased. These two sentences are what makes that reading possible —
 * `lib/document-stages` is etyme-regulatory's, and the day it decides a
 * never-filed required item blocks instead, the door follows it.
 */
describe('what the submit door can tell apart', () => {
  const on = new Date('2026-09-21T00:00:00Z')
  const year = (d: string) => new Date(d)

  it('a required certificate the supplier has never filed comes back as missing, not as lapsed', () => {
    const gate = supplierCoverGate({
      supplierName: 'Veritan Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: year('2026-01-01'), validFrom: year('2026-01-01'), expiresAt: year('2027-01-01'), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: year('2026-01-01'), validFrom: year('2026-01-01'), expiresAt: year('2027-01-01'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking.map((b) => b.key)).toEqual(['GOOD_STANDING'])
    expect(gate.blocking.every((b) => b.standing === 'MISSING')).toBe(true)
  })

  it('cover that ran out comes back as expired, which is the finding that refuses a submission', () => {
    const gate = supplierCoverGate({
      supplierName: 'Veritan Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: year('2024-01-01'), validFrom: year('2024-01-01'), expiresAt: year('2025-01-01'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.blocking.some((b) => b.standing !== 'MISSING')).toBe(true)
  })
})
