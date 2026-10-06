import { describe, it, expect } from 'vitest'
import { bookedLimitDay, bookedPastLimit, runsPastSentence, type SiteLine } from '@/lib/tenure-days'
import { sentencePhrases } from '@/lib/contract-clearance'
import { possessive } from '@/lib/requisition-approval'

/**
 * Lucía Fernández at Northbend Athletic, walked by a tester on
 * 2026-10-03: 426 of 548 days across Brightmoor and Pinnacle, and a
 * Pinnacle contract booked to Sep 3, 2027 — seven months past the day she
 * reaches the eighteen-month limit, Feb 2, 2027. Nothing said so, and the
 * doors that write a line would have written it.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const today = d('2026-10-03')
const rules = { capMonths: 18, breakDays: null }

const brightmoor: SiteLine = { startDate: d('2025-06-20'), endDate: d('2026-07-20'), live: false }
const pinnacle = { startDate: d('2026-09-03'), endDate: d('2027-09-03') }

const ask = (over: Partial<Parameters<typeof bookedPastLimit>[0]> = {}) => bookedPastLimit({
  lines: [brightmoor],
  proposed: pinnacle,
  rules,
  enforcement: 'BLOCK',
  personName: 'Lucía Fernández',
  clientName: 'Northbend Athletic',
  now: today,
  ...over,
})

describe('a person near the time limit', () => {
  it('a person near the limit sees the day she reaches it', () => {
    expect(bookedLimitDay([brightmoor, pinnacle], rules, today)?.toISOString().slice(0, 10)).toBe('2027-02-02')
  })

  it('a contract already running past the limit is said on the page, not hidden', () => {
    expect(runsPastSentence({
      firm: 'Pinnacle Resourcing', personName: 'Lucía Fernández',
      endDate: pinnacle.endDate, reachedOn: d('2027-02-02'), now: today,
    })).toBe(
      'Pinnacle Resourcing’s contract runs to Sep 3, 2027, 7 months past the day Lucía Fernández reaches the time limit (Feb 2, 2027). Shorten it or plan the break.'
    )
  })

  it('says reached, not reaches, once the day has passed', () => {
    expect(runsPastSentence({
      firm: 'Acme', personName: 'Kwame Mensah', endDate: d('2026-12-01'), reachedOn: d('2026-06-01'), now: today,
    })).toBe('Acme’s contract runs to Dec 1, 2026, 6 months past the day Kwame Mensah reached the time limit (Jun 1, 2026). Shorten it or plan the break.')
  })
})

describe('the doors that write or extend a line', () => {
  it('a line booked past the time limit is refused in a sentence naming the date', () => {
    const past = ask()
    expect(past?.outcome).toBe('BLOCK')
    expect(past?.says).toBe(
      'Lucía Fernández reaches Northbend Athletic’s 18-month time limit on Feb 2, 2027. ' +
      'This contract would run to Sep 3, 2027, 7 months past that day. End it on or before Feb 2, 2027, or plan the break.'
    )
  })

  it('lets a line end on the day the limit is reached, the same day the block counts', () => {
    expect(ask({ proposed: { startDate: pinnacle.startDate, endDate: d('2027-02-02') } })).toBeNull()
  })

  it('refuses a day later than that', () => {
    expect(ask({ proposed: { startDate: pinnacle.startDate, endDate: d('2027-02-03') } })?.outcome).toBe('BLOCK')
  })

  it('refuses a line with no end date at a client with a time limit, and says why', () => {
    expect(ask({ proposed: { startDate: pinnacle.startDate, endDate: null } })?.says)
      .toContain('This contract has no end date, so it would run past that day.')
  })

  it('says nothing where the client set no time limit', () => {
    expect(ask({ rules: { capMonths: null, breakDays: null } })).toBeNull()
  })

  it('counts the days from every supplier, not only the line being written', () => {
    // Pinnacle alone reaches eighteen months long after Sep 2027; it is
    // Brightmoor's thirteen months before it that brings the day forward.
    expect(ask({ lines: [] })).toBeNull()
  })

  it('counts a chain\'s two rungs for the same days once', () => {
    const rung: SiteLine = { ...pinnacle, live: true }
    expect(ask({ lines: [brightmoor, rung] })?.reachedOn.toISOString().slice(0, 10)).toBe('2027-02-02')
  })

  it('starts the count again after a break the client requires, even one still ahead', () => {
    // Away from Jul 2026 and back in Jan 2027, past a 90-day break: the count starts over.
    const back = { startDate: d('2027-01-05'), endDate: d('2027-12-31') }
    expect(ask({ rules: { capMonths: 18, breakDays: 90 }, proposed: back })).toBeNull()
  })

  it('does not reset on a gap shorter than the break', () => {
    expect(ask({ rules: { capMonths: 18, breakDays: 90 } })?.outcome).toBe('BLOCK')
  })

  it('tells somebody already past the limit to plan the break before booking more time', () => {
    const long: SiteLine = { startDate: d('2024-01-01'), endDate: null, live: true }
    const past = ask({ lines: [long], proposed: { startDate: d('2026-10-01'), endDate: d('2026-12-31') } })
    expect(past?.says).toMatch(/^Lucía Fernández reached Northbend Athletic’s 18-month time limit on Jul 1, 2025\./)
    expect(past?.says).toContain('Plan the break before booking more time.')
  })

  it('warns instead of refusing where the client set its rule to warn, and never stays silent', () => {
    const past = ask({ enforcement: 'WARN' })
    expect(past?.outcome).toBe('WARN')
    expect(past?.says).toContain('it can go ahead with a reason recorded')
  })
})

describe('words a person reads on the compliance pages', () => {
  it('reads the right to work as one thing: proof of right to work (I-9, checked with E-Verify)', () => {
    expect(sentencePhrases([
      { key: 'RIGHT_TO_WORK', label: 'Proof of right to work' },
      { key: 'I9_EVERIFY', label: 'I-9 and E-Verify' },
      { key: 'BACKGROUND_CHECK', label: 'Background check' },
    ])).toEqual(['proof of right to work (I-9, checked with E-Verify)', 'background check'])
  })

  it('reads an I-9 on its own as an I-9 checked with E-Verify, never "I-9 and E-Verify" inside a sentence', () => {
    expect(sentencePhrases([{ key: 'I9_EVERIFY', label: 'I-9 and E-Verify' }])).toEqual(['an I-9 (checked with E-Verify)'])
  })

  it('writes Teleworld Solutions’ with the apostrophe alone, and Pinnacle Resourcing’s with an s', () => {
    expect(possessive('Teleworld Solutions', '’')).toBe('Teleworld Solutions’')
    expect(possessive('Pinnacle Resourcing', '’')).toBe('Pinnacle Resourcing’s')
    expect(possessive('Teleworld Solutions')).toBe("Teleworld Solutions'")
  })
})
