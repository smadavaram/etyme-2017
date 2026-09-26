/**
 * The bureau handoff.
 *
 * Etyme never files. What it has, and the bureau does not, is what was
 * actually earned and by whom — from postings rather than from a rate
 * card, because those differ every time a timesheet is reversed or a rate
 * amendment lands late.
 */

import { describe, it, expect } from 'vitest'
import {
  wageSummary, yearEndPack, yearEndCsv, treatmentOf,
  depositSchedule, depositDeadline, BUREAU_NOTICE, NEC_THRESHOLD_CENTS,
  type PayPosting,
} from '@/lib/payroll-export'

function pay(over: Partial<PayPosting> = {}): PayPosting {
  return {
    personId: 'p1',
    personName: 'Vani Pasala',
    hasTaxId: true,
    contractType: 'W2',
    // Pay postings are negative in the ledger.
    amountCents: -800_000,
    currency: 'USD',
    postedAt: new Date('2026-03-31T00:00:00Z'),
    ...over,
  }
}

describe('A year, a person, and the form somebody else files', () => {
  it('a W2 worker’s year gives a wage summary the bureau can put on a W-2', () => {
    const s = wageSummary('p1', [pay(), pay({ postedAt: new Date('2026-04-30T00:00:00Z') })], 2026)
    expect(s.form).toBe('W2')
    expect(s.box).toContain('Box 1')
    expect(s.grossCents).toBe(1_600_000)
    expect(s.says).toContain('gross earnings only')
    expect(s.says).toContain('the bureau')
  })

  it('a 1099 contractor’s year gives box one of a 1099-NEC and nothing else', () => {
    const s = wageSummary(
      'p1',
      [pay({ contractType: 'C1099', amountCents: -450_000 })],
      2026
    )
    expect(s.treatment).toBe('IND_1099')
    expect(s.form).toBe('1099_NEC')
    expect(s.box).toContain('nonemployee compensation')
    expect(s.grossCents).toBe(450_000)
  })

  it('a corp-to-corp supplier gets no 1099-NEC, because a corporation is not reportable for services', () => {
    const s = wageSummary('p1', [pay({ contractType: 'C2C', amountCents: -4_000_000 })], 2026)
    expect(s.treatment).toBe('C2C')
    expect(s.form).toBe('NONE')
    // The amount is still shown, because somebody will ask.
    expect(s.grossCents).toBe(4_000_000)
    expect(s.says).toContain('shape of a misclassification finding')
  })

  it('a person under the reporting threshold is listed separately rather than dropped', () => {
    const s = wageSummary('p1', [pay({ contractType: 'C1099', amountCents: -50_000 })], 2026)
    expect(s.belowThreshold).toBe(true)
    expect(s.form).toBe('NONE')
    expect(s.grossCents).toBe(50_000)
    expect(s.says).toContain('one of them is a missing person')
    expect(NEC_THRESHOLD_CENTS).toBe(60_000)
  })

  it('an arrangement nobody has a rule for names the gap rather than guessing a form', () => {
    const s = wageSummary('p1', [pay({ contractType: 'UMBRELLA_PAYE' })], 2026)
    expect(s.treatment).toBe('UNKNOWN')
    expect(s.form).toBe('NONE')
    expect(s.says).toContain('the form is not guessed')
  })

  it('wages are summed from pay postings only, never from a rate card', () => {
    // Three postings including a reversal-shaped correction: the total is
    // what actually posted, not hours times a rate.
    const s = wageSummary(
      'p1',
      [
        pay({ amountCents: -800_000 }),
        pay({ amountCents: -800_000, postedAt: new Date('2026-04-30T00:00:00Z') }),
        pay({ amountCents: 200_000, postedAt: new Date('2026-05-31T00:00:00Z') }),
      ],
      2026
    )
    expect(s.postings).toBe(3)
    expect(s.grossCents).toBe(1_800_000)
  })

  it('postings from another year are not in this year’s figure', () => {
    const s = wageSummary(
      'p1',
      [pay(), pay({ postedAt: new Date('2025-12-31T00:00:00Z'), amountCents: -900_000 })],
      2026
    )
    expect(s.grossCents).toBe(800_000)
  })

  it('two currencies in one year refuse to produce a single wage figure', () => {
    const s = wageSummary(
      'p1',
      [pay(), pay({ currency: 'INR', amountCents: -40_000_000, postedAt: new Date('2026-06-30T00:00:00Z') })],
      2026
    )
    expect(s.grossCents).toBeNull()
    expect(s.form).toBe('NONE')
    expect(s.says).toContain('a figure of nothing')
  })

  it('a contract type maps to exactly one treatment', () => {
    expect(treatmentOf('W2_HOURLY')).toBe('W2')
    expect(treatmentOf('1099')).toBe('IND_1099')
    expect(treatmentOf('CORP_TO_CORP')).toBe('C2C')
    expect(treatmentOf('whatever')).toBe('UNKNOWN')
  })
})

describe('The pack handed over, and what it says on its face', () => {
  const postings = [
    pay({ personId: 'p1', personName: 'Vani', contractType: 'W2', amountCents: -4_000_000 }),
    pay({ personId: 'p2', personName: 'Arun', contractType: 'C1099', amountCents: -1_200_000 }),
    pay({ personId: 'p3', personName: 'Sub Co', contractType: 'C2C', amountCents: -9_000_000 }),
    pay({ personId: 'p4', personName: 'Tiny', contractType: 'C1099', amountCents: -20_000 }),
    pay({ personId: 'p5', personName: 'No TIN', contractType: 'C1099', amountCents: -900_000, hasTaxId: false }),
  ]

  it('every screen and file says plainly that it is prepared for a bureau and filed by nobody here', () => {
    const pack = yearEndPack(postings, 2026)
    expect(pack.notice).toBe(BUREAU_NOTICE)
    expect(pack.notice).toContain('Nothing here is filed by Etyme')
    expect(pack.says).toContain('Nothing here is filed by Etyme')
    expect(yearEndCsv(pack).split('\n')[0]).toContain('Nothing here is filed by Etyme')
  })

  it('the pack counts the forms the bureau has to issue and names everybody who needs none', () => {
    const pack = yearEndPack(postings, 2026)
    expect(pack.w2Count).toBe(1)
    expect(pack.necCount).toBe(2) // Arun and No TIN; Tiny is under the floor
    expect(pack.noForm.map((s) => s.personName).sort()).toEqual(['Sub Co', 'Tiny'])
  })

  it('a payee with no taxpayer number is flagged as blocked rather than filed with a blank', () => {
    const pack = yearEndPack(postings, 2026)
    expect(pack.blocked.map((s) => s.personName)).toEqual(['No TIN'])
    expect(pack.says).toContain('cannot be filed until a taxpayer identification number is held')
  })

  it('the reportable total counts only the people who actually get a form', () => {
    const pack = yearEndPack(postings, 2026)
    // W-2 4,000,000 + Arun 1,200,000 + No TIN 900,000. The corp and the
    // under-threshold payee are not reportable.
    expect(pack.totalReportableCents).toBe(6_100_000)
  })

  it('a name with a comma in it survives the file', () => {
    const csv = yearEndCsv(yearEndPack([pay({ personName: 'Pasala, Vani' })], 2026))
    expect(csv).toContain('"Pasala, Vani"')
  })
})

describe('When the deposit has to be there', () => {
  it('the deposit schedule is monthly or semiweekly from the lookback', () => {
    expect(depositSchedule(4_000_000).schedule).toBe('MONTHLY')
    expect(depositSchedule(5_000_000).schedule).toBe('MONTHLY')
    expect(depositSchedule(5_000_001).schedule).toBe('SEMIWEEKLY')
    expect(depositSchedule(9_000_000).says).toContain('semiweekly')
  })

  it('a monthly depositor pays by the fifteenth of the month after the wages', () => {
    // Friday 31 July 2026 payday.
    const d = depositDeadline(new Date('2026-07-31T00:00:00Z'), 'MONTHLY')
    expect(d.statutoryDue.toISOString().slice(0, 10)).toBe('2026-08-15')
    // 15 August 2026 is a Saturday, so it moves.
    expect(d.dueOn.toISOString().slice(0, 10)).toBe('2026-08-17')
    expect(d.shifted).toBe(true)
  })

  it('a semiweekly depositor follows the half of the week the payday fell in', () => {
    // Thursday 3 September 2026 — a Wednesday-to-Friday payday.
    const thu = depositDeadline(new Date('2026-09-03T00:00:00Z'), 'SEMIWEEKLY')
    expect(thu.dueOn.getUTCDay()).toBe(3) // Wednesday
    expect(thu.dueOn.toISOString().slice(0, 10)).toBe('2026-09-09')

    // Monday 7 September 2026 — a Saturday-to-Tuesday payday.
    const mon = depositDeadline(new Date('2026-09-07T00:00:00Z'), 'SEMIWEEKLY')
    expect(mon.dueOn.getUTCDay()).toBe(5) // Friday
    expect(mon.dueOn.toISOString().slice(0, 10)).toBe('2026-09-11')
  })

  it('a deposit deadline falling on a weekend or a holiday moves to the next business day', () => {
    // 15 November 2026 is a Sunday.
    const weekend = depositDeadline(new Date('2026-10-31T00:00:00Z'), 'MONTHLY')
    expect(weekend.dueOn.toISOString().slice(0, 10)).toBe('2026-11-16')

    // And a holiday on the Monday pushes it one further. Holidays are
    // passed in, never assumed — this codebase keeps them per company.
    const holiday = depositDeadline(new Date('2026-10-31T00:00:00Z'), 'MONTHLY', [
      new Date('2026-11-16T00:00:00Z'),
    ])
    expect(holiday.dueOn.toISOString().slice(0, 10)).toBe('2026-11-17')
    expect(holiday.shifted).toBe(true)
  })

  it('a deadline already on a business day is left where it is', () => {
    // 15 October 2026 is a Thursday.
    const d = depositDeadline(new Date('2026-09-30T00:00:00Z'), 'MONTHLY')
    expect(d.dueOn.toISOString().slice(0, 10)).toBe('2026-10-15')
    expect(d.shifted).toBe(false)
  })
})
