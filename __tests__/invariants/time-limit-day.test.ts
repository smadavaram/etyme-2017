import { describe, it, expect } from 'vitest'
import { contractsPastLimit, daysFor, daysOnSite, limitReachedOn, monthsOf } from '@/lib/tenure-days'
import { limitDayWords, runsPastWords } from '@/app/dashboard/tenure/words'

/**
 * Lucía Fernández, Northbend Athletic, walked by a tester on 2026-10-03:
 * 426 days on site against an eighteen-month limit, a Pinnacle Resourcing
 * contract booked to Sep 3, 2027, and a ledger that gave no limit date
 * and no warning. The limit is reached around Feb 2, 2027.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const lucia = [
  { startDate: d('2025-06-20'), endDate: d('2026-07-20') }, // Brightmoor, ended
  { startDate: d('2026-09-03'), endDate: d('2027-09-03') }, // Pinnacle, running
]

describe('the day somebody reaches the time limit', () => {
  it('names the day Lucía Fernández reaches eighteen months across both her suppliers: Feb 2, 2027', () => {
    expect(limitReachedOn(lucia, 18)?.toISOString().slice(0, 10)).toBe('2027-02-02')
  })

  it('is the day the block itself first counts the limit, never a day later', () => {
    const on = limitReachedOn(lucia, 18)!
    const midday = new Date(on.getTime() + 12 * 3600_000)
    expect(daysOnSite(lucia, midday)).toBe(daysFor(18))
    const dayBefore = new Date(on.getTime() - 12 * 3600_000)
    expect(daysOnSite(lucia, dayBefore)).toBeLessThan(daysFor(18))
  })

  it('does not count the gap between two suppliers as time on site', () => {
    const noGap = limitReachedOn([{ startDate: d('2025-06-20'), endDate: null }], 18)!
    expect(limitReachedOn(lucia, 18)!.getTime()).toBeGreaterThan(noGap.getTime())
  })

  it('counts a chain\'s two contracts for the same days once', () => {
    const chain = [
      { startDate: d('2026-01-01'), endDate: null },
      { startDate: d('2026-01-01'), endDate: null },
    ]
    expect(limitReachedOn(chain, 18)).toEqual(limitReachedOn([chain[0]], 18))
  })

  it('gives no date, rather than an invented one, where the contracts on the record end before the limit', () => {
    expect(limitReachedOn([{ startDate: d('2026-01-01'), endDate: d('2026-12-31') }], 18)).toBeNull()
  })

  it('runs a contract with no end date on until the limit', () => {
    expect(limitReachedOn([{ startDate: d('2026-01-01'), endDate: null }], 12)?.toISOString().slice(0, 10))
      .toBe('2026-12-31')
  })
})

describe('a contract booked past the time limit', () => {
  const reached = limitReachedOn(lucia, 18)

  it('flags Lucía Fernández\'s Pinnacle Resourcing contract, which runs seven months past her limit', () => {
    const past = contractsPastLimit([
      { id: 'b', firm: 'Brightmoor Staffing', endDate: d('2026-07-20'), live: false },
      { id: 'p', firm: 'Pinnacle Resourcing', endDate: d('2027-09-03'), live: true },
    ], reached)
    expect(past).toHaveLength(1)
    expect(past[0].firm).toBe('Pinnacle Resourcing')
    expect(monthsOf(past[0].daysPast!)).toBe(7)
  })

  it('says so in a sentence with both dates and whole months', () => {
    expect(runsPastWords({ firm: 'Pinnacle Resourcing', endDate: '2027-09-03T00:00:00.000Z', daysPast: 213, reachedOn: reached!.toISOString() }))
      .toBe('Pinnacle Resourcing’s contract runs to Sep 3, 2027, 7 months past the time limit on Feb 2, 2027.')
  })

  it('never rounds a part month up: 58 days past is one month, not two', () => {
    expect(runsPastWords({ firm: 'Acme', endDate: '2027-04-01T00:00:00.000Z', daysPast: 58, reachedOn: '2027-02-02T00:00:00.000Z' }))
      .toContain('1 month past')
  })

  it('says days where the contract runs less than a month past the limit', () => {
    expect(runsPastWords({ firm: 'Acme', endDate: '2027-02-14T00:00:00.000Z', daysPast: 12, reachedOn: '2027-02-02T00:00:00.000Z' }))
      .toContain('12 days past')
  })

  it('flags a running contract with no end date as running past the limit', () => {
    const past = contractsPastLimit([{ id: 'x', firm: 'Acme', endDate: null, live: true }], reached)
    expect(past).toEqual([{ contractId: 'x', firm: 'Acme', endDate: null, daysPast: null }])
    expect(runsPastWords({ firm: 'Acme', endDate: null, daysPast: null, reachedOn: reached!.toISOString() }))
      .toBe('Acme’s contract has no end date, so it runs past the time limit on Feb 2, 2027.')
  })

  it('does not flag a contract that ends on or before the day the limit is reached', () => {
    expect(contractsPastLimit([{ id: 'x', firm: 'Acme', endDate: reached!, live: true }], reached)).toEqual([])
  })

  it('does not flag an ended contract, which can carry nobody past anything', () => {
    expect(contractsPastLimit([{ id: 'x', firm: 'Acme', endDate: d('2028-01-01'), live: false }], reached)).toEqual([])
  })
})

describe('the limit day on the time-on-site page', () => {
  const today = d('2026-10-03')

  it('shows the day ahead as a date', () => {
    expect(limitDayWords({ reachedOn: '2027-02-02T00:00:00.000Z', today, live: true })).toBe('Feb 2, 2027')
  })

  it('says a day already passed was reached', () => {
    expect(limitDayWords({ reachedOn: '2026-05-01T00:00:00.000Z', today, live: true })).toBe('Reached May 1, 2026')
  })

  it('says the current contracts end first, rather than a dash, where no contract carries somebody to the limit', () => {
    expect(limitDayWords({ reachedOn: null, today, live: true })).toBe('Not before the current contracts end')
  })
})

import { daysBooked, daysServed } from '@/lib/tenure-days'

describe('one contract\'s days on the time-on-site page', () => {
  const pinnacle = { startDate: d('2026-09-03'), endDate: d('2027-09-03') }
  const today = new Date('2026-10-03T12:00:00Z')

  it('counts Lucía Fernández\'s Pinnacle Resourcing contract as 31 days served a month in, never the 365 it is booked for', () => {
    expect(daysServed(pinnacle, today)).toBe(31)
    expect(daysServed(pinnacle, today)).toBe(daysOnSite([pinnacle], today))
  })

  it('shows the 365 days booked separately from the days served', () => {
    expect(daysBooked(pinnacle)).toBe(365)
  })

  it('counts an ended contract to its last day, not to today', () => {
    expect(daysServed({ startDate: d('2025-06-20'), endDate: d('2026-07-20') }, today)).toBe(395)
  })

  it('states no booked length for a contract with no end', () => {
    expect(daysBooked({ startDate: d('2026-09-03'), endDate: null })).toBeNull()
  })
})
