import { describe, it, expect } from 'vitest'
import { timesheetFlag, periodWord } from '@/lib/timesheet-flag'

/**
 * Exceptions are checked against the contract rather than left for the
 * person signing to notice. The prototype's queue said "48h claimed;
 * contract caps at 40" — this is that check, real.
 */
const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('a week is checked against the contract it bills to', () => {
  it('forty-eight hours on a forty-hour role is an exception, said in a sentence', () => {
    expect(timesheetFlag({ hours: 48, hoursPerWeek: 40, periodEnd: d('2026-09-05'), contractEnd: d('2026-12-31') }))
      .toBe('48h claimed on a 40h-a-week role.')
  })
  it('forty on forty is not', () => {
    expect(timesheetFlag({ hours: 40, hoursPerWeek: 40, periodEnd: d('2026-09-05'), contractEnd: d('2026-12-31') })).toBeNull()
  })
  it('a role with no hours written down is taken as a forty-hour week', () => {
    expect(timesheetFlag({ hours: 44, hoursPerWeek: null, periodEnd: d('2026-09-05'), contractEnd: null })).toContain('40h-a-week')
  })
  it('a week that runs past the contract’s last day is an exception; the last day itself is not', () => {
    expect(timesheetFlag({ hours: 40, hoursPerWeek: 40, periodEnd: d('2026-10-02'), contractEnd: d('2026-09-30') }))
      .toBe("The week runs past the contract's last day, Sep 30.")
    expect(timesheetFlag({ hours: 40, hoursPerWeek: 40, periodEnd: d('2026-09-30'), contractEnd: d('2026-09-30') })).toBeNull()
  })
  it('a period reads the way a person says it', () => {
    expect(periodWord(d('2026-08-30'), d('2026-09-03'))).toBe('Aug 30 – Sep 3')
  })
})
