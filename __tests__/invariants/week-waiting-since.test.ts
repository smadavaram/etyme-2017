import { describe, it, expect } from 'vitest'
import { waitingSince, daysWaiting, decide, type Sheet } from '@/lib/auto-approval'

/**
 * How long a week has waited for its signature — counted from the day it
 * was sent.
 *
 * The send step answered with a time and never wrote one, so every week
 * filed through the product carried no sent date. The nightly job starts
 * the clock at the run for a sheet it cannot date, so no window ever ran
 * out on one; and the two queues a client signs from counted from the
 * last day of the week instead, so a week sent three weeks late arrived
 * "21d waiting" and urgent on the day the client first saw it.
 */

const NOW = new Date('2026-09-29T15:00:00Z')
const at = (iso: string) => new Date(iso)

describe('how long a week has waited for its signature', () => {
  it('a week waits from the day it was sent, not from the last day of its period', () => {
    // Her week ended on the 6th; she sent it on the 27th.
    const week = { periodEnd: at('2026-09-06T00:00:00Z'), submittedAt: at('2026-09-27T09:30:00Z') }
    expect(waitingSince(week)).toEqual(at('2026-09-27T09:30:00Z'))
    expect(daysWaiting(week, NOW)).toBe(2)
  })

  it('the client’s queue shows a week sent today as waiting since today, however long ago its days were', () => {
    const week = { periodEnd: at('2026-09-06T00:00:00Z'), submittedAt: at('2026-09-29T08:00:00Z') }
    expect(daysWaiting(week, NOW)).toBe(0)
  })

  it('a week with no send date on its row waits from the last day of its period, the earliest it could have been sent', () => {
    // Imported, or sent before the send step wrote the day. A week cannot
    // be sent before its days have happened, so this is the longest the
    // wait could be — a queue may err toward urgent, never toward calm.
    const week = { periodEnd: at('2026-09-20T00:00:00Z'), submittedAt: null }
    expect(waitingSince(week)).toEqual(at('2026-09-20T00:00:00Z'))
    expect(daysWaiting(week, NOW)).toBe(9)
  })

  it('a wait is never counted below nought days', () => {
    const week = { periodEnd: at('2026-09-28T00:00:00Z'), submittedAt: at('2026-09-29T15:00:01Z') }
    expect(daysWaiting(week, NOW)).toBe(0)
  })
})

describe('the approval window counts from when the week was sent', () => {
  const sheet = (submittedAt: Date): Sheet => ({
    id: 'ts-1',
    personName: 'Helena Marsh',
    submittedAt,
    totalHours: 8,
    clientApprovedAt: null,
    anomalyScore: null,
    anomalyReason: null,
    windowDays: 5,
    autoApproves: true,
    clientName: 'Cavanaugh Glassworks',
  })

  it('a week sent two days ago is still inside a five-day window, whenever its days were', () => {
    const d = decide(sheet(at('2026-09-27T15:00:00Z')), NOW)
    expect(d.verdict).toBe('WAITING')
    expect(d.says).toBe('Cavanaugh Glassworks has 3 more days to approve this.')
  })

  it('a week sent five days ago is approved by silence on the fifth day, naming nobody', () => {
    const d = decide(sheet(at('2026-09-24T15:00:00Z')), NOW)
    expect(d.verdict).toBe('APPROVE')
    expect(d.waitedDays).toBe(5)
    expect(d.says).toBe(
      'Approved automatically. Helena Marsh submitted 8 hours 5 days ago and ' +
      'Cavanaugh Glassworks agreed to a 5 day window. Nobody looked at it.'
    )
  })
})
