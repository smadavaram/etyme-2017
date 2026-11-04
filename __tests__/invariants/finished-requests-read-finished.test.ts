import { describe, it, expect } from 'vitest'
import { myPapers, type AskedPacket } from '@/lib/document-request'
import { progressOf } from '@/lib/packets'
import { startSentenceNow } from '@/lib/document-stages/start-day'

/**
 * Three smaller faults the fifth screen walk (2026-11-04) found on the
 * papers a worker and HR read: accepted papers still listed as asked for
 * with a link (one twice), a request reading "Finished" while its I-9 had
 * not been examined, and a stored start sentence printing a raw past day.
 */

const ROSA = 'rosa.delgado@example.invalid'
const request = (id: string, items: AskedPacket['items']): AskedPacket => ({
  id, label: 'Starting somebody (W-2)', askedBy: 'Brightmoor Staffing', recipientEmail: ROSA, token: `tok-${id}`,
  expiresAt: new Date('2026-12-30T00:00:00Z'), cancelledAt: null, createdAt: new Date('2026-11-01T00:00:00Z'), reason: null, items,
})
const item = (id: string, key: string, label: string, state: string) =>
  ({ id, key, label, state, required: true, receivedAt: new Date('2026-11-02T00:00:00Z'), position: 0 })

describe('a worker’s page lists an accepted paper once, under on file', () => {
  const papers = myPapers({
    myEmail: ROSA,
    documents: [],
    packets: [
      request('p1', [item('i1', 'NDA', 'product confidentiality undertaking', 'ACCEPTED'), item('i2', 'RIGHT_TO_WORK', 'proof of right to work', 'ACCEPTED')]),
      request('p2', [item('i3', 'NDA', 'product confidentiality undertaking', 'ACCEPTED')]),
    ],
    on: new Date('2026-11-04T00:00:00Z'),
  })

  it('an accepted paper from a finished request is never listed under "Asked for, with a link"', () => {
    expect(papers.filter((p) => p.kind === 'REQUEST')).toEqual([])
  })

  it('a paper accepted on two finished requests is listed once, under on file, with the firm that accepted it', () => {
    const undertaking = papers.filter((p) => p.name === 'Product confidentiality undertaking')
    expect(undertaking).toHaveLength(1)
    expect(undertaking[0].kind).toBe('HELD')
    expect(undertaking[0].word).toBe('On file · Brightmoor Staffing')
    expect(undertaking[0].todo).toBeNull()
  })

  it('a paper still asked for on an open request stays under its link', () => {
    const open = myPapers({ myEmail: ROSA, documents: [], packets: [request('p3', [item('i4', 'BACKGROUND_CHECK', 'background check', 'PENDING')])] })
    expect(open.map((p) => p.kind)).toEqual(['REQUEST'])
  })

  it('an accepted paper already listed as held on her record is not listed a second time', () => {
    const both = myPapers({
      myEmail: ROSA, documents: [],
      packets: [request('p1', [item('i1', 'NDA', 'product confidentiality undertaking', 'ACCEPTED')])],
      held: [{ id: 'h1', key: 'NDA', label: 'product confidentiality undertaking', status: 'CLEAR', provider: null }] as never,
    })
    expect(both.filter((p) => /undertaking/i.test(p.name))).toHaveLength(1)
  })
})

describe('a request reads finished only when every paper in it was looked at', () => {
  const rajesh = [
    { label: 'I-9 and E-Verify', required: true, received: true, examined: false },
    { label: 'Proof of right to work', required: true, received: true, examined: true },
    { label: 'Background check', required: true, received: true, examined: true },
    { label: 'Product confidentiality undertaking', required: true, received: true, examined: true },
  ]

  it('a request whose I-9 nobody has examined reads received and waiting on HR, never everything is in', () => {
    const p = progressOf(rajesh)
    expect(p.complete).toBe(true)
    expect(p.examined).toBe(false)
    expect(p.summary).toBe('Received, waiting on HR to look at I-9 and E-Verify.')
    expect(p.summary).not.toContain('Everything is in')
  })

  it('a request whose every paper was examined or already on file reads everything is in', () => {
    const p = progressOf(rajesh.map((i) => ({ ...i, examined: true })))
    expect(p.examined).toBe(true)
    expect(p.summary).toBe('Everything is in.')
  })

  it('a reader that says nothing about examination reads as it did before', () => {
    expect(progressOf([{ label: 'W-9', required: true, received: true }]).summary).toBe('Everything is in.')
  })
})

describe('a stored start sentence is said as of the day the link is read', () => {
  const now = new Date('2026-11-04T00:00:00Z')
  const stored = 'You have been placed at Northbend Athletic. You are due to start at Northbend Athletic on 2026-08-09. These are the papers we need before your first day.'

  it('a start day long gone on a running line reads started, with the day said plainly', () => {
    const said = startSentenceNow(stored, now, () => true)!
    expect(said).toContain('You started at Northbend Athletic on Aug 9, 2026.')
    expect(said).not.toContain('2026-08-09')
    expect(said).not.toContain('due to start')
  })

  it('a start day gone on a line that never started reads was due to start', () => {
    expect(startSentenceNow(stored, now, () => false)).toContain('You were due to start at Northbend Athletic on Aug 9, 2026.')
  })

  it('a start day still to come stays due to start, with the day said plainly', () => {
    expect(startSentenceNow(stored.replace('2026-08-09', '2026-11-20'), now, () => false)).toContain('You are due to start at Northbend Athletic on Nov 20, 2026.')
  })

  it('a reason with no start sentence in it is left as written', () => {
    expect(startSentenceNow('Your license runs out in 24 days.', now, () => true)).toBe('Your license runs out in 24 days.')
  })
})
