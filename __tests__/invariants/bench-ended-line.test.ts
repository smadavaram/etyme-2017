import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/app/api/ar/book', () => ({ loadBook: vi.fn() }))

import { benchSpan, type OwnLine } from '@/app/api/today/reads'
import { benchSpell } from '@/lib/bench-profit'
import { whenFree, LIVE_STATES } from '@/lib/bench-filter'

/**
 * Reader of batch five, item 1. Today and Candidates read this firm's own
 * lines with ENDED among them, and read an ended line with no last day as
 * a placement with no end; Bench's `whenFree` reads an ended line only for
 * its last day. So a person whose only line had ended read as placed on
 * Today and Candidates and as free on Bench. Now an ended line places
 * nobody, and is read for its last day exactly as Bench reads it.
 *
 * Each case below asks both readers the same question, "on the bench and
 * free today?", over the same line, the way each route passes it.
 */

const DAY = 86_400_000
const now = new Date(Date.UTC(2031, 4, 14, 15))
const joined = new Date(now.getTime() - 60 * DAY)

function bothRead(line: OwnLine) {
  const spans = [benchSpan(line)].flatMap((s) => (s ? [s] : []))
  const today = benchSpell({ joinedBench: joined, lines: spans, now }).kind === 'NOW'
  const ended = line.state === 'ENDED'
  const free = whenFree({
    lines: ended ? [] : [{ startsOn: line.startDate, endsOn: line.endDate, state: String(line.state) }],
    lastEnded: ended ? line.endDate : null,
    availableFrom: null,
    onBenchSince: joined,
    now,
  })
  return { today, bench: free.state === 'NOW' }
}

const line = (state: string, startOffset: number, endOffset: number | null): OwnLine => ({
  id: `line-${state}-${startOffset}-${endOffset}`,
  state,
  startDate: new Date(now.getTime() + startOffset * DAY),
  endDate: endOffset == null ? null : new Date(now.getTime() + endOffset * DAY),
})

describe('a person whose only line has ended reads the same on Today, Candidates and Bench', () => {
  it('an ended line with no last day on record places nobody, so she is on the bench and free now on every page', () => {
    const l = line('ENDED', -90, null)
    expect(benchSpan(l)).toBeNull()
    expect(bothRead(l)).toEqual({ today: true, bench: true })
  })

  it('an ended line whose last day has gone leaves her on the bench and free now on every page', () => {
    expect(bothRead(line('ENDED', -90, -5))).toEqual({ today: true, bench: true })
  })

  it('an ended line whose last day is still to come keeps her off the bench on every page until the day after it', () => {
    expect(bothRead(line('ENDED', -90, 20))).toEqual({ today: false, bench: false })
  })

  it('an ended line whose last day is today keeps her off the bench today on every page, because a contract’s last day is a day on site', () => {
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const l: OwnLine = { id: 'ended-today', state: 'ENDED', startDate: new Date(now.getTime() - 90 * DAY), endDate: lastDay }
    expect(bothRead(l)).toEqual({ today: false, bench: false })
  })

  it('a running line with no end date still places her on every page', () => {
    expect(bothRead(line('IN_PROGRESS', -30, null))).toEqual({ today: false, bench: false })
  })

  it('every state that places a person on Bench places her on Today, and is read whole', () => {
    for (const state of LIVE_STATES) {
      const l = line(state, -10, null)
      expect(benchSpan(l)).toEqual({ id: l.id, startsOn: l.startDate, endsOn: null })
      expect(bothRead(l)).toEqual({ today: false, bench: false })
    }
  })
})
