import { describe, it, expect } from 'vitest'
import { placementSpan, signedWeeksCard, daySpan, plainDate } from '@/lib/consultant-portfolio'
import { getNavForKind } from '@/components/shell/sidebar'

/**
 * Found on a browser walk of Karthik Menon's own page, 2026-09-30. He is
 * Teleworld's own W2 at Corveldt Aerospace, placed Jun 1 – Aug 31, ended.
 *
 * - The summary told him "Approved, not billed 14 — your vendor bills
 *   these". Nobody bills an employee; he is paid by payroll.
 * - Where you work read "from 2026-06-01" under a chip saying ended.
 * - His menu is checked here too: his firm's sections, then "You", and
 *   no heading with nothing under it.
 */

const TODAY = '2026-09-30'

describe('what an employee reads about the weeks the client signed', () => {
  const karthik = {
    notBilled: 0,
    employed: { paid: 13, owed: 0, waitingOnEmployer: 1, unknown: 0, employer: 'Teleworld Solutions' },
  }

  it("an employee's own page never says a vendor bills his hours", () => {
    const card = signedWeeksCard(karthik)
    expect(card.label.toLowerCase()).not.toContain('bill')
    expect(card.note.toLowerCase()).not.toContain('bill')
  })

  it('an employee reads his signed weeks as paid, owed to him, or waiting on his employer', () => {
    expect(signedWeeksCard({
      notBilled: 0,
      employed: { paid: 10, owed: 2, waitingOnEmployer: 1, unknown: 0, employer: 'Teleworld Solutions' },
    })).toEqual({
      label: 'Approved weeks',
      value: 13,
      note: '10 paid · 2 owed to you · 1 waiting on Teleworld Solutions',
    })
  })

  it('where more than one firm employs him, the card says "your employer" rather than picking one', () => {
    const card = signedWeeksCard({
      notBilled: 0,
      employed: { paid: 0, owed: 0, waitingOnEmployer: 2, unknown: 0, employer: null },
    })
    expect(card.note).toBe('2 waiting on your employer')
  })

  it('an accepted week this page cannot price is said as not recorded here, never counted as paid or owed', () => {
    const card = signedWeeksCard({
      notBilled: 0,
      employed: { paid: 0, owed: 0, waitingOnEmployer: 0, unknown: 3, employer: 'Teleworld Solutions' },
    })
    expect(card.note).toBe('3 accepted, pay not recorded here')
    expect(card.note).not.toMatch(/paid ·|owed/)
  })

  it('an employee with no signed weeks yet is told so, not shown a blank', () => {
    expect(signedWeeksCard({
      notBilled: 0,
      employed: { paid: 0, owed: 0, waitingOnEmployer: 0, unknown: 0, employer: 'Teleworld Solutions' },
    })).toEqual({ label: 'Approved weeks', value: 0, note: 'none signed yet' })
  })

  it('a worker paid through a supplier still reads that their vendor bills the approved weeks', () => {
    expect(signedWeeksCard({ notBilled: 4, employed: null })).toEqual({
      label: 'Approved, not billed', value: 4, note: 'your vendor bills these',
    })
  })

  it('somebody both employed and paid through a supplier reads each week in the words that fit it', () => {
    const card = signedWeeksCard({
      notBilled: 2,
      employed: { paid: 5, owed: 0, waitingOnEmployer: 0, unknown: 0, employer: 'Teleworld Solutions' },
    })
    expect(card.value).toBe(7)
    expect(card.note).toBe('5 paid · 2 weeks your vendor bills')
  })
})

describe('when a placement ran, in plain dates', () => {
  it('an ended placement shows the day it ended', () => {
    expect(placementSpan({ startDate: '2026-06-01', endDate: '2026-08-31', state: 'ENDED' }, TODAY))
      .toBe('Jun 1 – Aug 31, 2026 · ended')
  })

  it('a placement never shows an ISO date to the person it is about', () => {
    for (const state of ['IN_PROGRESS', 'ENDED', 'CANCELLED']) {
      for (const endDate of ['2026-08-31', '2027-02-26', null]) {
        expect(placementSpan({ startDate: '2026-06-01', endDate, state }, TODAY)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      }
    }
  })

  it('a placement running across a new year names both years', () => {
    expect(placementSpan({ startDate: '2026-12-01', endDate: '2027-02-26', state: 'IN_PROGRESS' }, TODAY))
      .toBe('Dec 1, 2026 – Feb 26, 2027')
  })

  it('a placement with no last day on the record reads "from" its first day', () => {
    expect(placementSpan({ startDate: '2026-06-01', endDate: null, state: 'IN_PROGRESS' }, TODAY))
      .toBe('from Jun 1, 2026')
  })

  it('a placement whose last day has passed reads ended even before the nightly job marks it', () => {
    expect(placementSpan({ startDate: '2026-06-01', endDate: '2026-08-31', state: 'IN_PROGRESS' }, TODAY))
      .toBe('Jun 1 – Aug 31, 2026 · ended')
  })

  it('a live placement is not called ended on its last day', () => {
    expect(placementSpan({ startDate: '2026-06-01', endDate: TODAY, state: 'IN_PROGRESS' }, TODAY))
      .toBe('Jun 1 – Sep 30, 2026')
  })

  it('a cancelled placement says cancelled, not ended', () => {
    expect(placementSpan({ startDate: '2026-06-01', endDate: '2026-08-31', state: 'CANCELLED' }, TODAY))
      .toBe('Jun 1 – Aug 31, 2026 · cancelled')
  })

  it('a stored day is read as that calendar day, not the day before in a western time zone', () => {
    // Stored at midnight UTC; the route passes the full ISO timestamp.
    expect(placementSpan({ startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-08-31T00:00:00.000Z', state: 'ENDED' }, TODAY))
      .toBe('Jun 1 – Aug 31, 2026 · ended')
  })
})

describe("plain dates on the worker's own pages", () => {
  it("a worker's hours never show an ISO date", () => {
    expect(daySpan('2026-06-01', '2026-06-07')).toBe('Jun 1 – Jun 7, 2026')
    expect(daySpan('2026-06-01T00:00:00.000Z', '2026-06-07T00:00:00.000Z')).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('a week crossing a new year names both years', () => {
    expect(daySpan('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027')
  })

  it('a one-day period reads as that one day', () => {
    expect(daySpan('2026-08-31', '2026-08-31')).toBe('Aug 31, 2026')
  })

  it('a single date reads "Jun 1, 2026", and a missing one stays missing rather than invented', () => {
    expect(plainDate('2026-06-01')).toBe('Jun 1, 2026')
    expect(plainDate(null)).toBeNull()
    expect(plainDate(undefined)).toBeNull()
  })
})

describe("an integrator's own engineer reads his firm's menu, then his own", () => {
  // The permissions the seeded world gives Karthik Menon's seat
  // (lib/seed-world: a delivery engineer's role).
  const KARTHIK = ['assignments.read', 'timesheets.read'] as const

  it('his menu ends with "You", after every one of his firm\'s sections', () => {
    const nav = getNavForKind('GSI', false, { worker: true, permissions: KARTHIK })
    expect(nav[nav.length - 1].label).toBe('You')
    expect(nav.slice(0, -1).map((s) => s.label)).toEqual(['Today', 'Deliver', 'Supply', 'Operate', 'Grow', 'Governance'])
  })

  it('a menu heading with no links in it is not drawn', () => {
    const seats: (readonly string[] | null | undefined)[] = [KARTHIK, [], ['nothing.anybody.grants'], undefined, null]
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const worker of [true, false]) {
        for (const permissions of seats) {
          for (const s of getNavForKind(kind, false, { worker, permissions })) {
            expect(s.items.length, `${kind} ${worker ? 'worker ' : ''}draws "${s.label}" with nothing under it`).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})
