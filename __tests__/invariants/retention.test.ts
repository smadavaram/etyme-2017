import { describe, it, expect } from 'vitest'
import {
  SCHEDULE, scheduleFor, unscheduledCategories,
  dueDateFor, coolingEndsAt, addCalendarMonths, addDays,
  verdictFor, sweep, COOLING_DAYS,
  type SweepDeps, type SweepRequest, type SweepBreach, type SweepSubject,
} from '@/lib/retention'
import { HELD } from '@/lib/legal'

/**
 * How long a record is kept, why, and what happens on the night the
 * period runs out.
 *
 * Every branch here carries a date or a legal consequence, which is the
 * standard CLAUDE.md sets for what must be tested. The ones that matter
 * most are the blanks: a period nobody can cite returns null and says so,
 * because a plausible wrong retention period deletes a record that is
 * gone.
 */

const now = new Date('2026-09-19T09:00:00Z')

describe('the schedule covers what the privacy notice says is held', () => {
  it('every category the privacy notice names has a line in the schedule, so nothing is kept by nobody’s decision', () => {
    expect(unscheduledCategories(), 'categories with no retention line').toEqual([])
  })

  it('every line cites the rule behind it, so a period on a screen can be checked against a law', () => {
    for (const line of SCHEDULE) {
      expect(line.basis.length, line.category).toBeGreaterThan(60)
      expect(HELD.map((h) => h.category), `${line.category} is not a category the notice names`)
        .toContain(line.category)
    }
  })

  it('a category nobody has classified is promised nothing and is named rather than dropped', () => {
    const v = verdictFor('Sleep study results', { now })
    expect(v.verdict).toBe('KEEP')
    expect(v.says).toContain('Nobody has classified')
    expect(v.until).toBeNull()
  })
})

describe('the clock on a request starts when it arrived, not when somebody typed it in', () => {
  const received = new Date('2026-01-31T10:00:00Z')

  it('a request under the GDPR is due one calendar month after it arrived, and the basis says the extension exists', () => {
    const due = dueDateFor('EXPORT', received, 'GDPR')
    expect(due.dueAt.toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(due.dueBasis).toContain('One calendar month')
    expect(due.dueBasis).toContain('two further months')
  })

  it('a request under the CCPA is due forty-five days after it arrived', () => {
    const due = dueDateFor('EXPORT', received, 'CCPA')
    expect(due.dueAt.toISOString().slice(0, 10)).toBe('2026-03-17')
    expect(due.dueBasis).toContain('Forty-five days')
  })

  it('where nobody has recorded which law applies, the shortest period any of them allows is used and the basis calls itself conservative', () => {
    const due = dueDateFor('EXPORT', received, 'UNKNOWN')
    expect(due.dueAt.toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(due.dueBasis).toContain('conservative date rather than a correct one')
    // And it is genuinely the shortest of the three.
    expect(due.dueAt.getTime()).toBeLessThanOrEqual(dueDateFor('EXPORT', received, 'GDPR').dueAt.getTime())
    expect(due.dueAt.getTime()).toBeLessThanOrEqual(dueDateFor('EXPORT', received, 'CCPA').dueAt.getTime())
  })

  it('an erasure says in the same breath that nothing happens for fourteen days and that it can be stopped', () => {
    const due = dueDateFor('ERASURE', received, 'GDPR')
    expect(due.dueBasis).toContain(`${COOLING_DAYS} days`)
    expect(due.dueBasis).toContain('change their mind')
    expect(coolingEndsAt(received).toISOString().slice(0, 10)).toBe('2026-02-14')
  })

  it('a month counted from the thirty-first lands on the last day of a shorter month rather than falling into the next one', () => {
    expect(addCalendarMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(addCalendarMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2028-02-29')
    expect(addCalendarMonths(new Date('2026-08-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-09-30')
    expect(addDays(new Date('2026-02-27T00:00:00Z'), 2).toISOString().slice(0, 10)).toBe('2026-03-01')
  })
})

describe('what happens to each kind of record, and where no period can be cited', () => {
  it('an I-9 is kept three years after hire or one year after the job ended, whichever is later', () => {
    // Hired 2020, left 2025: one year after leaving is later than three
    // years after hire, so the later of the two governs.
    const late = verdictFor('Checks somebody else ran', {
      now,
      hiredAt: new Date('2020-03-01T00:00:00Z'),
      employmentEndedAt: new Date('2025-06-30T00:00:00Z'),
    })
    expect(late.verdict).toBe('HELD_UNTIL')
    expect(late.until!.toISOString().slice(0, 10)).toBe('2026-06-30')

    // Hired 2025, left the same year: three years after hire is later.
    const early = verdictFor('Checks somebody else ran', {
      now,
      hiredAt: new Date('2025-03-01T00:00:00Z'),
      employmentEndedAt: new Date('2025-06-30T00:00:00Z'),
    })
    expect(early.until!.toISOString().slice(0, 10)).toBe('2028-03-01')
    expect(early.basis).toContain('8 CFR 274a.2')
  })

  it('an I-9 for somebody still employed has no end date yet, because the later of the two has not happened', () => {
    const v = verdictFor('Checks somebody else ran', {
      now, hiredAt: new Date('2019-01-01T00:00:00Z'), employmentEndedAt: null,
    })
    expect(v.until).toBeNull()
    expect(v.says).toContain('the job has not ended')
  })

  it('an I-9 with no hire date on file offers no deletion date and says the date is missing rather than guessing one', () => {
    const v = verdictFor('Checks somebody else ran', { now })
    expect(v.until).toBeNull()
    expect(v.says).toContain('nobody has recorded when the person was hired')
  })

  it('a federal contractor is told its personnel-record floor is two years rather than one', () => {
    const v = verdictFor('Checks somebody else ran', {
      now, hiredAt: new Date('2020-01-01T00:00:00Z'), employmentEndedAt: new Date('2025-01-01T00:00:00Z'),
      federalContractor: true,
    })
    expect(v.says).toContain('two years rather than one')
  })

  it('payroll and tax records are kept four years from the last time money moved, and the basis says a state may ask for longer', () => {
    const v = verdictFor('Money about a person', { now, lastPaidAt: new Date('2024-05-10T00:00:00Z') })
    expect(v.verdict).toBe('ANONYMIZE')
    expect(v.until!.toISOString().slice(0, 10)).toBe('2028-05-10')
    expect(v.basis).toContain('26 CFR 31.6001-1')
    expect(v.basis).toContain('A state may ask for longer')
  })

  it('a visa petition file has no federal minimum this code can cite, so it offers no date and says why rather than inventing one', () => {
    const v = verdictFor('Work authorization and immigration', {
      now, employmentEndedAt: new Date('2024-01-01T00:00:00Z'),
    })
    expect(v.until).toBeNull()
    expect(v.says).toContain('no federal minimum can be cited')
    expect(v.basis).toContain('29 CFR 655.760(c)')
    expect(scheduleFor('Work authorization and immigration')!.months).toBeNull()
  })

  it('the days somebody stood on a client’s site keep their count and are given no deletion date, because no statute sets one', () => {
    const v = verdictFor('Time on site', { now })
    expect(v.verdict).toBe('ANONYMIZE')
    expect(v.until).toBeNull()
    expect(v.basis).toContain('No statute sets a period for this')
  })

  it('the access log is kept whole, because deleting who read somebody’s record erases the evidence that protects them', () => {
    const v = verdictFor('Logs', { now })
    expect(v.verdict).toBe('KEEP')
    expect(v.until).toBeNull()
    expect(v.basis).toContain('hurts the person it was meant to protect')
  })

  it('a resume, a profile, a sign-in and a bar are deleted outright, with no period in front of them', () => {
    for (const c of ['Resumes', 'Identity and sign-in', 'A consultant own profile', 'Bars and preferences']) {
      expect(verdictFor(c, { now }).verdict, c).toBe('DELETE')
    }
  })

  it('a message keeps its words and forgets its author, because the thread is the other company’s record too', () => {
    const v = verdictFor('Messages', { now })
    expect(v.verdict).toBe('ANONYMIZE')
    expect(v.says).toContain('stops naming anybody')
  })

  it('an unlifted legal hold beats every period in the schedule, and the sentence gives the reason without naming the matter', () => {
    const v = verdictFor('Resumes', {
      now, underLegalHold: true,
      holdReason: 'A wage claim is open and the records are evidence in it.',
    })
    expect(v.verdict).toBe('HELD_UNTIL')
    expect(v.says).toContain('A wage claim is open')
    expect(v.says).not.toContain('matter')
    expect(v.until).toBeNull()
  })

  it('a period with no day to count from offers no date rather than counting from today', () => {
    const v = verdictFor('Money about a person', { now, lastPaidAt: null })
    expect(v.until).toBeNull()
    expect(v.says).toContain('Nobody has recorded the day to count from')
  })
})

// ── The nightly sweep ────────────────────────────────────────────────

function request(over: Partial<SweepRequest> = {}): SweepRequest {
  return {
    id: 'r1', kind: 'EXPORT', status: 'RECEIVED',
    receivedAt: new Date('2026-09-01T09:00:00Z'),
    dueAt: new Date('2026-10-01T09:00:00Z'),
    subjectPersonId: 'p1', subjectCompanyId: null, subjectLabel: 'Helena Marsh',
    underLegalHold: false, holdReason: null, warnedToday: false,
    ...over,
  }
}

function breach(over: Partial<SweepBreach> = {}): SweepBreach {
  return {
    id: 'b1', reference: 'DB-2026-01', summary: 'A report ran against the wrong company.',
    closedAt: null, lastWarnedAt: null,
    clocks: [
      { which: 'AUTHORITY', dueAt: new Date('2026-09-19T20:00:00Z'), notifiedAt: null, owner: 'Dana Whitlock' },
      { which: 'PEOPLE', dueAt: new Date('2026-09-30T09:00:00Z'), notifiedAt: null, owner: 'Dana Whitlock' },
    ],
    ...over,
  }
}

const nothing: SweepDeps = { requests: [], breaches: [], subjects: [] }

describe('the nightly sweep says what is due and completes what is ready', () => {
  it('a request due inside a day wakes staff once, and a request due next week wakes nobody', () => {
    const soon = sweep(now, { ...nothing, requests: [request({ dueAt: new Date('2026-09-19T22:00:00Z') })] })
    expect(soon.warnRequests).toHaveLength(1)
    expect(soon.warnRequests[0].action).toBe('DATA_REQUEST_CLOCK_WARNED')
    expect(soon.warnRequests[0].says).toContain('Helena Marsh')

    const later = sweep(now, { ...nothing, requests: [request()] })
    expect(later.warnRequests).toEqual([])
  })

  it('a request already warned about today is not warned about again tonight', () => {
    const p = sweep(now, {
      ...nothing,
      requests: [request({ dueAt: new Date('2026-09-19T22:00:00Z'), warnedToday: true })],
    })
    expect(p.warnRequests).toEqual([])
  })

  it('a request whose deadline has passed says how late it is rather than going quiet', () => {
    const p = sweep(now, { ...nothing, requests: [request({ dueAt: new Date('2026-09-18T09:00:00Z') })] })
    expect(p.warnRequests[0].late).toBe(true)
    expect(p.warnRequests[0].says).toContain('was due 24 hours ago')
  })

  it('a request that is finished or refused is never chased', () => {
    for (const status of ['DONE', 'REFUSED'] as const) {
      const p = sweep(now, {
        ...nothing,
        requests: [request({ status, dueAt: new Date('2026-09-01T09:00:00Z') })],
      })
      expect(p.warnRequests, status).toEqual([])
    }
  })

  it('an erasure past its cooling period with nothing in the way is completed by the sweep', () => {
    const p = sweep(now, {
      ...nothing,
      requests: [request({ kind: 'ERASURE', receivedAt: new Date('2026-09-01T09:00:00Z') })],
    })
    expect(p.erasures).toHaveLength(1)
    expect(p.erasures[0].action).toBe('ERASURE_COMPLETE')
  })

  it('an erasure inside its cooling period is left alone, because the person can still change their mind', () => {
    const p = sweep(now, {
      ...nothing,
      requests: [request({ kind: 'ERASURE', receivedAt: new Date('2026-09-18T09:00:00Z') })],
    })
    expect(p.erasures).toEqual([])
  })

  it('an erasure with an unlifted hold is held rather than run, and the person is told a hold applies without being told the matter', () => {
    const p = sweep(now, {
      ...nothing,
      requests: [request({
        kind: 'ERASURE', receivedAt: new Date('2026-09-01T09:00:00Z'),
        underLegalHold: true, holdReason: 'An audit of the 2025 contingent workforce is open.',
      })],
    })
    expect(p.erasures[0].action).toBe('RETENTION_HELD')
    expect(p.erasures[0].says).toContain('An audit of the 2025 contingent workforce is open.')
    expect(p.erasures[0].says).toContain('not refused')
  })
})

describe('records past their period, for somebody already forgotten', () => {
  const subject = (over: Partial<SweepSubject> = {}): SweepSubject => ({
    personId: 'p1', companyIds: ['c1'],
    facts: { now, hiredAt: new Date('2019-01-01T00:00:00Z'), employmentEndedAt: new Date('2022-01-01T00:00:00Z') },
    stillNaming: [], stillHeld: [], ...over,
  })

  it('an I-9 whose floor has run is deleted, and the row says nothing puts it back', () => {
    const p = sweep(now, { ...nothing, subjects: [subject({ stillHeld: ['Checks somebody else ran'] })] })
    expect(p.retention).toHaveLength(1)
    expect(p.retention[0].action).toBe('RETENTION_DELETE')
    expect(p.retention[0].says).toContain('nothing puts it back')
  })

  it('an I-9 whose floor has not run yet is left alone and nothing is logged about it', () => {
    const p = sweep(now, {
      ...nothing,
      subjects: [subject({
        stillHeld: ['Checks somebody else ran'],
        facts: { now, hiredAt: new Date('2025-01-01T00:00:00Z'), employmentEndedAt: new Date('2025-06-01T00:00:00Z') },
      })],
    })
    expect(p.retention).toEqual([])
  })

  it('a record with no citable period is kept quietly rather than deleted tonight', () => {
    const p = sweep(now, { ...nothing, subjects: [subject({ stillHeld: ['Work authorization and immigration'] })] })
    expect(p.retention).toEqual([])
  })

  it('something that still names a person who has already been forgotten loses the name and keeps the amounts', () => {
    const p = sweep(now, { ...nothing, subjects: [subject({ stillNaming: ['Money about a person'] })] })
    expect(p.retention[0].action).toBe('RETENTION_ANONYMIZE')
    expect(p.retention[0].says).toContain('the name comes off')
  })

  it('a legal hold stops both the deletion and the anonymization, and the row says a hold is why', () => {
    const p = sweep(now, {
      ...nothing,
      subjects: [subject({
        stillHeld: ['Checks somebody else ran'], stillNaming: ['Money about a person'],
        facts: {
          now, hiredAt: new Date('2019-01-01T00:00:00Z'), employmentEndedAt: new Date('2022-01-01T00:00:00Z'),
          underLegalHold: true, holdReason: 'A wage claim is open.',
        },
      })],
    })
    expect(p.retention.map((r) => r.action)).toEqual(['RETENTION_HELD', 'RETENTION_HELD'])
    expect(p.retention[0].says).toContain('A wage claim is open.')
  })
})

describe('a breach clock is said out loud once a day, and a breach with no clock says nobody has decided', () => {
  it('a clock inside a day wakes staff and names the person who owns the notice', () => {
    const p = sweep(now, { ...nothing, breaches: [breach()] })
    expect(p.breachWarnings).toHaveLength(1)
    expect(p.breachWarnings[0].action).toBe('BREACH_CLOCK_WARNED')
    expect(p.breachWarnings[0].says).toContain('Dana Whitlock owns it')
    expect(p.breachWarnings[0].says).toContain('the supervisory authority')
  })

  it('a clock that has passed with no notice recorded says how late it is, every night, until somebody records it', () => {
    const p = sweep(now, {
      ...nothing,
      breaches: [breach({
        clocks: [{ which: 'AUTHORITY', dueAt: new Date('2026-09-17T09:00:00Z'), notifiedAt: null, owner: 'Dana Whitlock' }],
      })],
    })
    expect(p.breachWarnings[0].action).toBe('BREACH_CLOCK_MISSED')
    expect(p.breachWarnings[0].says).toContain('said again every night')
  })

  it('a clock whose notice has already gone is never chased, however late the hour', () => {
    const p = sweep(now, {
      ...nothing,
      breaches: [breach({
        clocks: [{
          which: 'AUTHORITY', dueAt: new Date('2026-09-10T09:00:00Z'),
          notifiedAt: new Date('2026-09-09T09:00:00Z'), owner: 'Dana Whitlock',
        }],
      })],
    })
    expect(p.breachWarnings).toEqual([])
  })

  it('the same breach is mentioned once a day rather than once a run', () => {
    const p = sweep(now, { ...nothing, breaches: [breach({ lastWarnedAt: new Date('2026-09-19T01:00:00Z') })] })
    expect(p.breachWarnings).toEqual([])

    const yesterday = sweep(now, { ...nothing, breaches: [breach({ lastWarnedAt: new Date('2026-09-18T23:00:00Z') })] })
    expect(yesterday.breachWarnings).toHaveLength(1)
  })

  it('a breach opened with no clock set says nobody has decided one, never that nothing is owed', () => {
    const p = sweep(now, {
      ...nothing,
      breaches: [breach({ clocks: [{ which: 'AUTHORITY', dueAt: null, notifiedAt: null, owner: 'Dana Whitlock' }] })],
    })
    expect(p.breachWarnings).toEqual([])
    expect(p.breachesWithNoClock).toHaveLength(1)
    expect(p.breachesWithNoClock[0].says).toContain('not the same as nothing being owed')
  })

  it('a closed breach stops every clock on it', () => {
    const p = sweep(now, { ...nothing, breaches: [breach({ closedAt: new Date('2026-09-18T09:00:00Z') })] })
    expect(p.breachWarnings).toEqual([])
    expect(p.breachesWithNoClock).toEqual([])
  })

  it('a customer’s own notice period is a clock of its own, named for the customer rather than for a regulator', () => {
    const p = sweep(now, {
      ...nothing,
      breaches: [breach({
        clocks: [{
          which: { companyId: 'c1', companyName: 'Northbend Athletic' },
          dueAt: new Date('2026-09-19T18:00:00Z'), notifiedAt: null, owner: 'Dana Whitlock',
        }],
      })],
    })
    expect(p.breachWarnings[0].says).toContain('Northbend Athletic')
  })
})
