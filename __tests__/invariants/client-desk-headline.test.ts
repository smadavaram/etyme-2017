import { describe, it, expect } from 'vitest'
import { deskCounts, deskHeadline, whoseQueue } from '@/app/dashboard/program/needs-you'
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

/**
 * Two books on one page.
 *
 * Aptiva Workforce holds one seat, at Cavanaugh Glassworks. Its program
 * page is headed with Cavanaugh's name and filled with Cavanaugh's
 * figures, and "Yours today" offered a week for Ruben Ortega at Harlow
 * Health with an Approve button beside it. Nothing leaked — Aptiva is
 * genuinely Ruben's supplier into Harlow Health — but a program manager
 * cannot tell the seat's work from their own firm's, and the one they
 * are about to sign is not the one the page is about.
 */
describe('Whose book the queue on a program page is', () => {
  const seated = { company: 'Aptiva Workforce', seated: true, clientName: 'Cavanaugh Glassworks' }

  it('a program office in a seat is told the queue is its own firm’s, not the client’s', () => {
    expect(whoseQueue(seated)).toContain("These are Aptiva Workforce's own to decide")
  })

  it('and is told what the seat does not carry, rather than left to wonder where the client’s weeks are', () => {
    expect(whoseQueue(seated)).toContain(
      "The seat Cavanaugh Glassworks granted you does not carry Cavanaugh Glassworks' queue"
    )
  })

  it('a client reading its own program is told nothing about whose book it is, because there is only one', () => {
    expect(whoseQueue({ company: 'Cavanaugh Glassworks', seated: false, clientName: null })).toBeNull()
  })

  it('a firm whose name a reader is not shown gets no clause at all, rather than one naming nobody', () => {
    expect(whoseQueue({ company: 'Aptiva Workforce', seated: true, clientName: null })).toBeNull()
    expect(whoseQueue({ seated: true, clientName: 'Cavanaugh Glassworks' })).toBeNull()
  })

  it('a firm whose name ends in s is spelled the way the rest of the page spells it', () => {
    expect(whoseQueue({ company: 'Cavanaugh Glassworks', seated: true, clientName: 'Harlow Health' }))
      .toContain("Cavanaugh Glassworks' own to decide")
  })
})
